import { useCallback, useEffect, useState } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { db, ensureDatabase, isTauri } from "@/database/db";
import { diningTables, orders, type DbDiningTable } from "@/database/schema";
import type { TableStatus, TableT } from "@/lib/pos-types";

// Cache compartilhado em memória para carregamento instantâneo de mesas
let cachedTables: TableT[] | null = null;
let isFetchingTablesGlobal = false;
const tableListeners = new Set<() => void>();

function notifyTableListeners() {
  tableListeners.forEach((l) => {
    try {
      l();
    } catch {
      // Ignora erro em listener desmontado
    }
  });
}

export function useTables() {
  const [data, setData] = useState<TableT[]>(() => cachedTables ?? []);
  const [isLoading, setIsLoading] = useState(() => cachedTables === null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const updateFromCache = () => {
      if (cachedTables) {
        setData(cachedTables);
        setIsLoading(false);
      }
    };
    tableListeners.add(updateFromCache);
    return () => {
      tableListeners.delete(updateFromCache);
    };
  }, []);

  const fetchTables = useCallback(async (force = false) => {
    if (isFetchingTablesGlobal && !force) return;
    if (cachedTables === null) {
      setIsLoading(true);
    }
    setError(null);
    isFetchingTablesGlobal = true;
    try {
      if (!isTauri()) {
        setData([]);
        setIsLoading(false);
        isFetchingTablesGlobal = false;
        return;
      }

      // Garante que o schema DDL e o seed inicial foram aplicados
      await ensureDatabase();

      // Consulta mesas ativas no SQLite local usando o Drizzle ORM
      const dbTables = await db
        .select()
        .from(diningTables)
        .where(isNull(diningTables.deleted_at))
        .orderBy(diningTables.number);

      const validStatuses: TableStatus[] = ["livre", "ocupada", "conta"];

      const mappedTables: TableT[] = dbTables.map((t: DbDiningTable) => {
        let mergedWith: number[] = [];
        if (t.merged_with) {
          try {
            const parsed = JSON.parse(t.merged_with);
            mergedWith = Array.isArray(parsed) ? parsed : [];
          } catch {
            mergedWith = [];
          }
        }

        const rawStatus = (t.status ?? "livre").toLowerCase() as TableStatus;
        const status: TableStatus = validStatuses.includes(rawStatus) ? rawStatus : "livre";

        let openedAt: number | null = null;
        if (t.opened_at) {
          const parsedTime = new Date(t.opened_at).getTime();
          openedAt = Number.isNaN(parsedTime) ? null : parsedTime;
        }

        return {
          id: t.id || `mesa-${t.number}`,
          number: t.number ?? 1,
          seats: t.seats ?? 4,
          waiter: t.waiter ?? "Atendente",
          status,
          openedAt,
          items: [],
          discount:
            t.discount_type && t.discount_amount
              ? { type: t.discount_type as "percent" | "value", amount: t.discount_amount }
              : null,
          mergedWith,
        };
      });

      cachedTables = mappedTables;
      setData(mappedTables);
      notifyTableListeners();
    } catch (err) {
      console.error("[useTables Error]:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      if (cachedTables === null) {
        setData([]);
      }
    } finally {
      setIsLoading(false);
      isFetchingTablesGlobal = false;
    }
  }, []);

  useEffect(() => {
    if (cachedTables === null) {
      fetchTables();
    }
  }, [fetchTables]);

  const updateTableStatus = useCallback(
    async (tableId: string, status: TableStatus) => {
      try {
        const now = new Date().toISOString();
        const openedAt = status === "livre" ? null : now;

        setData((current) =>
          current.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  status,
                  openedAt: status === "livre" ? null : (t.openedAt ?? Date.now()),
                  items: status === "livre" ? [] : t.items,
                }
              : t,
          ),
        );

        if (isTauri()) {
          await db
            .update(diningTables)
            .set({
              status,
              opened_at: openedAt,
              updated_at: now,
              is_synced: false,
            })
            .where(eq(diningTables.id, tableId));
        }
      } catch (err) {
        console.error("[useTables updateTableStatus Error]:", err);
        fetchTables();
      }
    },
    [fetchTables],
  );

  const applyDiscount = useCallback(
    async (tableId: string, type: "percent" | "value", amount: number) => {
      try {
        const now = new Date().toISOString();
        setData((current) =>
          current.map((t) => (t.id === tableId ? { ...t, discount: { type, amount } } : t)),
        );

        if (isTauri()) {
          await db
            .update(diningTables)
            .set({
              discount_type: type,
              discount_amount: amount,
              updated_at: now,
              is_synced: false,
            })
            .where(eq(diningTables.id, tableId));
        }
      } catch (err) {
        console.error("[useTables applyDiscount Error]:", err);
        fetchTables();
      }
    },
    [fetchTables],
  );

  const generateTables = useCallback(
    async (count: number) => {
      const parsedCount = Number(count);
      if (!parsedCount || isNaN(parsedCount) || parsedCount <= 0) return;

      const now = new Date().toISOString();

      if (isTauri()) {
        await ensureDatabase();

        // Carrega todas as mesas cadastradas (inclusive as marcadas com deleted_at)
        const allDbTables = await db.select().from(diningTables);
        const tableMap = new Map<number, DbDiningTable>(allDbTables.map((t) => [t.number, t]));

        for (let i = 1; i <= parsedCount; i++) {
          const existing = tableMap.get(i);
          if (existing) {
            if (existing.deleted_at !== null) {
              // Se estava excluída, restaura limpando o deleted_at e redefinindo os dados
              await db
                .update(diningTables)
                .set({
                  seats: 4,
                  waiter: "Equipe",
                  status: "livre",
                  opened_at: null,
                  discount_type: null,
                  discount_amount: null,
                  merged_with: null,
                  deleted_at: null,
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(diningTables.id, existing.id));
            }
            // Se já está ativa, não modifica
          } else {
            // Nova inserção inédita
            const id = crypto.randomUUID();
            await db.insert(diningTables).values({
              id,
              number: i,
              seats: 4,
              waiter: "Equipe",
              status: "livre",
              is_synced: false,
              created_at: now,
              updated_at: now,
              deleted_at: null,
            });
          }
        }

        await fetchTables();
      } else {
        const existingNumbers = new Set(data.map((t) => t.number));
        const newTables: TableT[] = [];

        for (let i = 1; i <= parsedCount; i++) {
          if (!existingNumbers.has(i)) {
            newTables.push({
              id: crypto.randomUUID(),
              number: i,
              seats: 4,
              waiter: "Equipe",
              status: "livre",
              openedAt: null,
              items: [],
              discount: null,
              mergedWith: [],
            });
          }
        }

        if (newTables.length > 0) {
          setData((curr) => [...curr, ...newTables].sort((a, b) => a.number - b.number));
        }
      }
    },
    [data, fetchTables],
  );

  const addTable = useCallback(
    async (number: number, seats = 4, waiter = "Equipe") => {
      const parsedNumber = Number(number);
      if (!parsedNumber || isNaN(parsedNumber) || parsedNumber <= 0) {
        throw new Error("Informe um número de mesa válido e positivo.");
      }

      const now = new Date().toISOString();
      const defaultWaiter = waiter?.trim() || "Equipe";
      const validSeats = Number(seats) > 0 ? Number(seats) : 4;

      if (isTauri()) {
        await ensureDatabase();

        // Verifica se já existe qualquer registro (ativo ou deletado) com esse número
        const existingRows = await db
          .select()
          .from(diningTables)
          .where(eq(diningTables.number, parsedNumber));

        const existing = existingRows[0];

        if (existing) {
          if (existing.deleted_at === null) {
            throw new Error(`A Mesa ${parsedNumber} já existe e está ativa no salão.`);
          }

          // Se a mesa foi excluída anteriormente, reativamos limpando o deleted_at
          await db
            .update(diningTables)
            .set({
              seats: validSeats,
              waiter: defaultWaiter,
              status: "livre",
              opened_at: null,
              discount_type: null,
              discount_amount: null,
              merged_with: null,
              deleted_at: null,
              updated_at: now,
              is_synced: false,
            })
            .where(eq(diningTables.id, existing.id));

          await fetchTables();

          return {
            id: existing.id,
            number: parsedNumber,
            seats: validSeats,
            waiter: defaultWaiter,
            status: "livre" as TableStatus,
            openedAt: null,
            items: [],
            discount: null,
            mergedWith: [],
          };
        } else {
          // Criação inédita de mesa
          const newId = crypto.randomUUID();
          await db.insert(diningTables).values({
            id: newId,
            number: parsedNumber,
            seats: validSeats,
            waiter: defaultWaiter,
            status: "livre",
            is_synced: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });

          await fetchTables();

          return {
            id: newId,
            number: parsedNumber,
            seats: validSeats,
            waiter: defaultWaiter,
            status: "livre" as TableStatus,
            openedAt: null,
            items: [],
            discount: null,
            mergedWith: [],
          };
        }
      } else {
        const alreadyExists = data.some((t) => t.number === parsedNumber);
        if (alreadyExists) {
          throw new Error(`A Mesa ${parsedNumber} já existe e está ativa no salão.`);
        }

        const newTable: TableT = {
          id: crypto.randomUUID(),
          number: parsedNumber,
          seats: validSeats,
          waiter: defaultWaiter,
          status: "livre",
          openedAt: null,
          items: [],
          discount: null,
          mergedWith: [],
        };

        setData((curr) => [...curr, newTable].sort((a, b) => a.number - b.number));
        return newTable;
      }
    },
    [data, fetchTables],
  );

  const deleteTable = useCallback(
    async (tableId: string) => {
      const now = new Date().toISOString();

      if (isTauri()) {
        await ensureDatabase();

        // Validação de segurança no SQLite: não permite deletar mesa com pedidos abertos
        const activeOrders = await db
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(eq(orders.table_id, tableId), eq(orders.status, "open"), isNull(orders.deleted_at)),
          )
          .limit(1);

        if (activeOrders.length > 0) {
          throw new Error(
            "Esta mesa possui comandas ou pedidos em aberto e não pode ser excluída.",
          );
        }

        await db
          .update(diningTables)
          .set({
            deleted_at: now,
            updated_at: now,
            is_synced: false,
          })
          .where(eq(diningTables.id, tableId));

        await fetchTables();
      } else {
        setData((curr) => curr.filter((t) => t.id !== tableId));
      }
    },
    [fetchTables],
  );

  return {
    tables: data,
    isLoading,
    error,
    refetch: fetchTables,
    updateTableStatus,
    applyDiscount,
    generateTables,
    addTable,
    deleteTable,
  };
}
