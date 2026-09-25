import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { OrderItem, TableStatus, TableT } from "../lib/types";

export function useTablesRealtime() {
  const [tables, setTables] = useState<TableT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  // Carrega todas as mesas e cruza com comandas e itens abertos
  const fetchTablesAndOrders = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setIsLoading(false);
      return;
    }

    try {
      // 1. Busca mesas ativas
      const { data: rawTables, error: tablesErr } = await supabase
        .from("dining_tables")
        .select("*")
        .is("deleted_at", null)
        .order("number", { ascending: true });

      if (tablesErr) throw tablesErr;

      // 2. Busca comandas de mesa abertas
      const { data: rawOrders } = await supabase
        .from("orders")
        .select("id, code, table_id, status, subtotal, service_fee, tip, discount, total, created_at")
        .eq("type", "table")
        .eq("status", "open")
        .is("deleted_at", null);

      // 3. Busca itens de comandas abertas
      const openOrderIds = (rawOrders || []).map((o) => o.id);
      let orderItemsMap: Record<string, OrderItem[]> = {};

      if (openOrderIds.length > 0) {
        const { data: rawItems } = await supabase
          .from("order_items")
          .select("id, order_id, product_id, name, qty, unit_price, total_price, details, notes, created_at")
          .in("order_id", openOrderIds)
          .is("deleted_at", null);

        if (rawItems) {
          rawItems.forEach((it) => {
            let detailsList: string[] = [];
            if (it.details) {
              try {
                detailsList = typeof it.details === "string" ? JSON.parse(it.details) : it.details;
              } catch {
                detailsList = [];
              }
            }

            let sentToKitchen = false;
            let kitchenRound: number | undefined;
            let originNum: number | undefined;
            if (it.notes) {
              try {
                const parsed = JSON.parse(it.notes);
                if (parsed && typeof parsed === "object") {
                  sentToKitchen = Boolean(parsed.sentToKitchen);
                  kitchenRound = parsed.kitchenRound;
                  originNum = parsed.originTableNumber;
                }
              } catch {
                sentToKitchen = it.notes.includes("sent_to_kitchen");
              }
            }

            const item: OrderItem = {
              id: it.id,
              orderId: it.order_id,
              productId: it.product_id,
              name: it.name,
              qty: it.qty,
              unitPrice: it.unit_price,
              totalPrice: it.total_price,
              details: detailsList,
              notes: it.notes,
              sentToKitchen,
              kitchenRound,
              originTableNumber: originNum,
              createdAt: it.created_at,
            };

            if (!orderItemsMap[it.order_id]) {
              orderItemsMap[it.order_id] = [];
            }
            orderItemsMap[it.order_id].push(item);
          });
        }
      }

      // Mapa de mesa -> itens
      const tableOrdersMap = new Map<string, { orderId: string; items: OrderItem[] }>();
      (rawOrders || []).forEach((ord) => {
        if (ord.table_id) {
          tableOrdersMap.set(ord.table_id, {
            orderId: ord.id,
            items: orderItemsMap[ord.id] || [],
          });
        }
      });

      // 4. Mapeia e compõe os dados finais das mesas
      const mapped: TableT[] = (rawTables || []).map((t) => {
        let mergedWith: number[] = [];
        if (t.merged_with) {
          try {
            const parsed = JSON.parse(t.merged_with);
            mergedWith = Array.isArray(parsed) ? parsed : [];
          } catch {
            mergedWith = [];
          }
        }

        const validStatuses: TableStatus[] = ["livre", "ocupada", "conta"];
        const rawStatus = (t.status || "livre").toLowerCase() as TableStatus;
        const status = validStatuses.includes(rawStatus) ? rawStatus : "livre";

        let openedAt: number | null = null;
        if (t.opened_at) {
          const parsedTime = new Date(t.opened_at).getTime();
          openedAt = isNaN(parsedTime) ? null : parsedTime;
        }

        const orderData = tableOrdersMap.get(t.id);
        const items = orderData?.items || [];

        return {
          id: t.id,
          orderId: orderData?.orderId || null,
          number: t.number,
          seats: t.seats || 4,
          waiter: t.waiter || "Equipe",
          status,
          openedAt,
          items,
          discount:
            t.discount_type && t.discount_amount
              ? { type: t.discount_type, amount: t.discount_amount }
              : null,
          mergedWith,
          updatedAt: t.updated_at,
        };
      });

      setTables(mapped);
      setLastSyncTime(new Date());
      setError(null);
    } catch (err) {
      console.error("[useTablesRealtime Error]:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchTablesAndOrders();
  }, [fetchTablesAndOrders]);

  // Debounce para recarregar com segurança quando houver múltiplos eventos seguidos
  const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimeoutRef.current) {
      clearTimeout(reloadTimeoutRef.current);
    }
    reloadTimeoutRef.current = setTimeout(() => {
      fetchTablesAndOrders();
    }, 300); // 300ms debounce
  }, [fetchTablesAndOrders]);

  // Supabase Realtime: Conexão viva que escuta alterações de mesas, comandas e itens
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    const channel = supabase
      .channel("maquininha-tables-realtime-channel")
      // 1. Escuta mudanças na tabela de mesas
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dining_tables",
        },
        () => {
          scheduleReload();
        }
      )
      // 2. Escuta criação/fechamento de pedidos
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          scheduleReload();
        }
      )
      // 3. Escuta novos itens adicionados por outros garçons ou caixa
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
        },
        () => {
          scheduleReload();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsRealtimeActive(true);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsRealtimeActive(false);
        }
      });

    return () => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [scheduleReload]);

  // 1. Mutação otimista instantânea: adiciona itens à mesa localmente (0ms de latência)
  const optimisticAddItems = useCallback((tableId: string, newItems: OrderItem[]) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        const now = Date.now();
        const stagedItems: OrderItem[] = newItems.map((i) => ({
          ...i,
          sentToKitchen: false,
          createdAt: i.createdAt || new Date().toISOString(),
        }));
        return {
          ...t,
          status: t.status === "livre" ? ("ocupada" as TableStatus) : t.status,
          openedAt: t.openedAt || now,
          items: [...t.items, ...stagedItems],
        };
      })
    );
  }, []);

  // 2. Mutação otimista instantânea: marca itens pendentes como despachados à cozinha (0ms)
  const optimisticSendToKitchen = useCallback((tableId: string) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        const currentMaxRound = t.items.reduce(
          (max, it) => Math.max(max, it.kitchenRound || 0),
          0
        );
        const nextRound = currentMaxRound + 1;
        return {
          ...t,
          items: t.items.map((it) =>
            !it.sentToKitchen
              ? { ...it, sentToKitchen: true, kitchenRound: nextRound }
              : it
          ),
        };
      })
    );
  }, []);

  // 3. Mutação otimista instantânea: atualiza status da mesa (abrir, pedir conta) (0ms)
  const optimisticSetStatus = useCallback(
    (tableId: string, status: TableStatus, waiterName?: string) => {
      setTables((prev) =>
        prev.map((t) => {
          if (t.id !== tableId) return t;
          return {
            ...t,
            status,
            waiter: waiterName || t.waiter,
            openedAt: status === "ocupada" && !t.openedAt ? Date.now() : t.openedAt,
          };
        })
      );
    },
    []
  );

  // 4. Mutação otimista instantânea: limpa e libera a mesa após cobrança (0ms)
  const optimisticClearTable = useCallback((tableId: string) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          status: "livre" as TableStatus,
          waiter: "Equipe",
          openedAt: null,
          items: [],
          orderId: null,
          discount: null,
          mergedWith: [],
        };
      })
    );
  }, []);

  // 5. Mutação otimista instantânea: remove item da comanda localmente (0ms)
  const optimisticRemoveItem = useCallback((tableId: string, itemId: string) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        const remaining = t.items.filter((it) => it.id !== itemId);
        if (remaining.length === 0) {
          return {
            ...t,
            status: "livre" as TableStatus,
            waiter: "Equipe",
            openedAt: null,
            items: [],
            orderId: null,
            discount: null,
            mergedWith: [],
          };
        }
        return {
          ...t,
          items: remaining,
        };
      })
    );
  }, []);

  return {
    tables,
    isLoading,
    isRealtimeActive,
    lastSyncTime,
    error,
    refreshTables: fetchTablesAndOrders,
    optimisticAddItems,
    optimisticRemoveItem,
    optimisticSendToKitchen,
    optimisticSetStatus,
    optimisticClearTable,
  };
}
