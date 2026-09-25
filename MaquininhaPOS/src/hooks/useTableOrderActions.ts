import { useCallback, useState } from "react";
import { toast } from "sonner";
import { isValidUuid, uid } from "../lib/format";
import { printReceipt } from "../lib/printer-58mm";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { OrderItem, Payment, TableT, UserWaiter } from "../lib/types";

// Feedback tátil nativo leve (zero impacto visual, 0ms)
function triggerHaptic(pattern: number | number[] = 15) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignora se hardware não suportar
  }
}

export function useTableOrderActions(activeWaiter: UserWaiter | null) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper para obter operator_id seguro (UUID válido ou null)
  const getSafeOperatorId = useCallback((): string | null => {
    if (activeWaiter?.id && isValidUuid(activeWaiter.id)) {
      return activeWaiter.id;
    }
    return null;
  }, [activeWaiter]);

  // 1. Abrir Mesa (se estiver livre)
  const openTable = useCallback(
    async (table: TableT): Promise<boolean> => {
      if (!isSupabaseConfigured() || !supabase) {
        toast.error("Nuvem Supabase não conectada.");
        return false;
      }

      setIsSubmitting(true);
      const now = new Date().toISOString();
      const waiterName = activeWaiter?.name || "Equipe";
      const operatorId = getSafeOperatorId();

      try {
        // 1. Atualiza a mesa para 'ocupada'
        const { error: tableErr } = await supabase
          .from("dining_tables")
          .update({
            status: "ocupada",
            waiter: waiterName,
            opened_at: now,
            updated_at: now,
            is_synced: true,
          })
          .eq("id", table.id);

        if (tableErr) throw tableErr;

        // 2. Cria a comanda no padrão unificado do ecossistema
        const orderId = uid();
        const code = `MESA-${String(table.number).padStart(2, "0")}`;
        const { error: orderErr } = await supabase.from("orders").insert({
          id: orderId,
          code,
          type: "table",
          table_id: table.id,
          status: "open",
          subtotal: 0,
          service_fee: 0,
          tip: 0,
          discount: 0,
          total: 0,
          operator_id: operatorId,
          is_synced: true,
          created_at: now,
          updated_at: now,
        });

        if (orderErr) throw orderErr;

        triggerHaptic(15);
        return true;
      } catch (err: any) {
        console.error("[openTable Error]:", err);
        toast.error(`Falha ao abrir mesa: ${err.message || String(err)}`);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeWaiter, getSafeOperatorId]
  );

  // 2. Adicionar Itens à Mesa (Anti-conflito multi-dispositivo e ultra-rápido)
  const addItemsToTable = useCallback(
    async (table: TableT, itemsToAdd: OrderItem[]): Promise<boolean> => {
      if (!isSupabaseConfigured() || !supabase) {
        toast.error("Nuvem Supabase não conectada.");
        return false;
      }
      if (!itemsToAdd || itemsToAdd.length === 0) return true;

      setIsSubmitting(true);
      const now = new Date().toISOString();
      const waiterName = activeWaiter?.name || table.waiter || "Equipe";
      const operatorId = getSafeOperatorId();

      try {
        let orderId = table.orderId;
        let currentSubtotal = table.items.reduce(
          (sum, i) => sum + Number(i.totalPrice ?? (i.qty || 1) * (i.unitPrice || 0)),
          0
        );
        let currentTotal = currentSubtotal;

        // Se a mesa ainda não possuía orderId em memória, busca ou cria comanda aberta
        if (!orderId) {
          const { data: existingOrders, error: orderFetchErr } = await supabase
            .from("orders")
            .select("id, subtotal, total, status")
            .eq("table_id", table.id)
            .eq("type", "table")
            .eq("status", "open")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1);

          if (orderFetchErr) throw orderFetchErr;

          if (existingOrders && existingOrders.length > 0) {
            orderId = existingOrders[0].id;
            currentSubtotal = Number(existingOrders[0].subtotal || currentSubtotal);
            currentTotal = Number(existingOrders[0].total || currentTotal);
          } else {
            orderId = uid();
            const code = `MESA-${String(table.number).padStart(2, "0")}`;
            const { error: insertOrderErr } = await supabase.from("orders").insert({
              id: orderId,
              code,
              type: "table",
              table_id: table.id,
              status: "open",
              subtotal: 0,
              service_fee: 0,
              tip: 0,
              discount: 0,
              total: 0,
              operator_id: operatorId,
              is_synced: true,
              created_at: now,
              updated_at: now,
            });
            if (insertOrderErr) throw insertOrderErr;
          }
        }

        // 2. Prepara itens com UUIDs válidos e marcados como PENDENTES de envio à cozinha
        const itemsPayload = itemsToAdd.map((it) => {
          const itemPrice = Number(it.unitPrice || 0);
          const itemQty = Number(it.qty || 1);
          const productId = it.productId && isValidUuid(it.productId) ? it.productId : null;

          return {
            id: it.id && isValidUuid(it.id) ? it.id : uid(),
            order_id: orderId,
            product_id: productId,
            name: it.name,
            qty: itemQty,
            unit_price: itemPrice,
            total_price: itemQty * itemPrice,
            details: it.details ? JSON.stringify(it.details) : null,
            notes: JSON.stringify({
              sentToKitchen: false, // Inserido como pendente; garçom despacha na tela de detalhes
              kitchenRound: 1,
              origin: "maquininha",
              waiter: waiterName,
              originTableNumber: table.number,
            }),
            is_synced: true,
            created_at: now,
            updated_at: now,
          };
        });

        const addedAmount = itemsToAdd.reduce(
          (sum, i) => sum + Number(i.qty || 1) * Number(i.unitPrice || 0),
          0
        );

        const tableOpenedAt = table.openedAt ? new Date(table.openedAt).toISOString() : now;

        // 3. Executa gravação dos itens e atualização dos totais em paralelo (Promise.all)
        const [insertRes, orderUpdateRes, tableUpdateRes] = await Promise.all([
          supabase.from("order_items").insert(itemsPayload),
          supabase
            .from("orders")
            .update({
              subtotal: currentSubtotal + addedAmount,
              total: currentTotal + addedAmount,
              updated_at: now,
              is_synced: true,
            })
            .eq("id", orderId),
          supabase
            .from("dining_tables")
            .update({
              status: "ocupada",
              waiter: table.waiter === "Equipe" ? waiterName : table.waiter,
              opened_at: tableOpenedAt,
              updated_at: now,
              is_synced: true,
            })
            .eq("id", table.id),
        ]);

        if (insertRes.error) throw insertRes.error;
        if (orderUpdateRes.error) throw orderUpdateRes.error;
        if (tableUpdateRes.error) throw tableUpdateRes.error;

        triggerHaptic(15);
        return true;
      } catch (err: any) {
        console.error("[addItemsToTable Error]:", err);
        toast.error(`Falha ao adicionar itens: ${err.message || String(err)}`);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeWaiter, getSafeOperatorId]
  );

  // 3. Despachar Pedido Pendente para a Cozinha (por rodadas controladas pelo garçom)
  const sendTableToKitchen = useCallback(
    async (table: TableT): Promise<boolean> => {
      if (!isSupabaseConfigured() || !supabase) {
        toast.error("Nuvem Supabase não conectada.");
        return false;
      }

      const pendingItems = table.items.filter((i) => !i.sentToKitchen);
      if (pendingItems.length === 0) {
        return true;
      }

      setIsSubmitting(true);
      const now = new Date().toISOString();
      const currentMaxRound = table.items.reduce(
        (max, it) => Math.max(max, it.kitchenRound || 0),
        0
      );
      const nextRound = currentMaxRound + 1;
      const waiterName = activeWaiter?.name || table.waiter || "Equipe";

      const client = supabase;
      if (!client) return false;

      try {
        // Atualiza todos os itens pendentes para sentToKitchen: true
        const updatePromises = pendingItems.map((item) => {
          let existingNotes: any = {};
          if (item.notes) {
            try {
              existingNotes = JSON.parse(item.notes);
            } catch {
              // ignora
            }
          }

          const updatedNotes = JSON.stringify({
            ...existingNotes,
            sentToKitchen: true,
            kitchenRound: nextRound,
            sentAt: now,
            origin: "maquininha",
            waiter: waiterName,
            originTableNumber: table.number,
          });

          return client
            .from("order_items")
            .update({
              notes: updatedNotes,
              updated_at: now,
              is_synced: true,
            })
            .eq("id", item.id);
        });

        const results = await Promise.all(updatePromises);
        const hasError = results.some((r) => r.error);
        if (hasError) {
          const firstErr = results.find((r) => r.error)?.error;
          throw firstErr;
        }

        triggerHaptic([20, 40, 20]);
        return true;
      } catch (err: any) {
        console.error("[sendTableToKitchen Error]:", err);
        toast.error(`Falha ao enviar para cozinha: ${err.message || String(err)}`);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeWaiter]
  );

  // 4. Remover / Cancelar Item da Comanda
  const removeItemFromTable = useCallback(
    async (table: TableT, itemToRemove: OrderItem): Promise<boolean> => {
      if (!isSupabaseConfigured() || !supabase) {
        toast.error("Nuvem Supabase não conectada.");
        return false;
      }

      const client = supabase;
      if (!client) return false;

      setIsSubmitting(true);
      const now = new Date().toISOString();
      const remainingItems = table.items.filter((it) => it.id !== itemToRemove.id);

      try {
        // 1. Marca item como excluído (soft-delete compatível com PDV)
        const { error: itemErr } = await client
          .from("order_items")
          .update({
            deleted_at: now,
            updated_at: now,
            is_synced: true,
          })
          .eq("id", itemToRemove.id);

        if (itemErr) throw itemErr;

        // 2. Se a mesa ficou sem itens, cancela a comanda e libera a mesa
        if (remainingItems.length === 0) {
          if (table.orderId) {
            await client
              .from("orders")
              .update({
                status: "cancelled",
                deleted_at: now,
                updated_at: now,
                is_synced: true,
              })
              .eq("id", table.orderId);
          } else {
            await client
              .from("orders")
              .update({
                status: "cancelled",
                deleted_at: now,
                updated_at: now,
                is_synced: true,
              })
              .eq("table_id", table.id)
              .eq("type", "table")
              .eq("status", "open");
          }

          await client
            .from("dining_tables")
            .update({
              status: "livre",
              opened_at: null,
              waiter: "Equipe",
              discount_type: null,
              discount_amount: null,
              merged_with: null,
              updated_at: now,
              is_synced: true,
            })
            .eq("id", table.id);

          triggerHaptic(15);
        } else {
          // 3. Atualiza os totais consolidados da comanda
          const newSubtotal = remainingItems.reduce(
            (sum, i) => sum + Number(i.totalPrice ?? (i.qty || 1) * (i.unitPrice || 0)),
            0
          );

          if (table.orderId) {
            await client
              .from("orders")
              .update({
                subtotal: newSubtotal,
                total: newSubtotal,
                updated_at: now,
                is_synced: true,
              })
              .eq("id", table.orderId);
          } else {
            await client
              .from("orders")
              .update({
                subtotal: newSubtotal,
                total: newSubtotal,
                updated_at: now,
                is_synced: true,
              })
              .eq("table_id", table.id)
              .eq("type", "table")
              .eq("status", "open");
          }

          triggerHaptic(15);
        }

        return true;
      } catch (err: any) {
        console.error("[removeItemFromTable Error]:", err);
        toast.error(`Falha ao remover item: ${err.message || String(err)}`);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  // 5. Solicitar Conta (muda status para 'conta' no salão)
  const requestBill = useCallback(
    async (table: TableT): Promise<boolean> => {
      if (!isSupabaseConfigured() || !supabase) return false;
      setIsSubmitting(true);
      const now = new Date().toISOString();

      try {
        const { error } = await supabase
          .from("dining_tables")
          .update({
            status: "conta",
            updated_at: now,
            is_synced: true,
          })
          .eq("id", table.id);

        if (error) throw error;

        triggerHaptic(15);
        return true;
      } catch (err: any) {
        console.error("[requestBill Error]:", err);
        toast.error("Falha ao solicitar conta.");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  // 4. Finalizar e Cobrar Conta na Maquininha (Checkout na Mesa)
  const finishCheckout = useCallback(
    async (
      table: TableT,
      summary: {
        subtotal: number;
        serviceFee: number;
        discount: number;
        total: number;
        payments: Payment[];
        cpf?: string | null;
      }
    ): Promise<boolean> => {
      if (!isSupabaseConfigured() || !supabase) {
        toast.error("Nuvem Supabase não conectada.");
        return false;
      }

      setIsSubmitting(true);
      const now = new Date().toISOString();
      const saleId = uid();
      const saleCode = `CUP-${Date.now().toString().slice(-6)}`;

      try {
        // Busca a comanda aberta da mesa
        const { data: openOrders } = await supabase
          .from("orders")
          .select("id")
          .eq("table_id", table.id)
          .eq("type", "table")
          .eq("status", "open")
          .is("deleted_at", null)
          .limit(1);

        const orderId = openOrders && openOrders.length > 0 ? openOrders[0].id : null;

        // 1. Grava a venda na tabela 'sales'
        const { error: saleErr } = await supabase.from("sales").insert({
          id: saleId,
          code: saleCode,
          order_id: orderId,
          origin: `Mesa ${String(table.number).padStart(2, "0")}`,
          cpf: summary.cpf || null,
          subtotal: Number(summary.subtotal || 0),
          service_fee: Number(summary.serviceFee || 0),
          tip: 0,
          discount: Number(summary.discount || 0),
          total: Number(summary.total || 0),
          cancelled: false,
          is_synced: true,
          created_at: now,
          updated_at: now,
        });

        if (saleErr) throw saleErr;

        // 2. Insere os pagamentos realizados
        if (summary.payments && summary.payments.length > 0) {
          const paymentsPayload = summary.payments.map((p) => ({
            id: uid(),
            sale_id: saleId,
            method: p.method,
            amount: Number(p.amount || 0),
            change_amount: Number(p.changeAmount || 0),
            customer_id: p.customerId && isValidUuid(p.customerId) ? p.customerId : null,
            is_synced: true,
            created_at: now,
            updated_at: now,
          }));

          const { error: payErr } = await supabase.from("payments").insert(paymentsPayload);
          if (payErr) throw payErr;
        }

        // 3. Fecha a comanda de pedidos marcando como 'completed' (padrão do PDV)
        if (orderId) {
          await supabase
            .from("orders")
            .update({
              status: "completed",
              subtotal: Number(summary.subtotal || 0),
              service_fee: Number(summary.serviceFee || 0),
              discount: Number(summary.discount || 0),
              total: Number(summary.total || 0),
              updated_at: now,
              is_synced: true,
            })
            .eq("id", orderId);
        }

        // 4. Libera a mesa no salão em tempo real
        const { error: tableErr } = await supabase
          .from("dining_tables")
          .update({
            status: "livre",
            waiter: "Equipe",
            opened_at: null,
            discount_type: null,
            discount_amount: null,
            merged_with: null,
            updated_at: now,
            is_synced: true,
          })
          .eq("id", table.id);

        if (tableErr) throw tableErr;

        // 5. Imprime comprovante na bobina térmica 58mm da maquininha
        printReceipt({
          title: "Comprovante de Pagamento",
          tableNumber: table.number,
          waiter: activeWaiter?.name || table.waiter,
          items: table.items,
          subtotal: summary.subtotal,
          serviceFee: summary.serviceFee,
          discount: summary.discount,
          total: summary.total,
          payments: summary.payments,
          saleCode,
        });

        triggerHaptic([25, 40, 25]);
        return true;
      } catch (err: any) {
        console.error("[finishCheckout Error]:", err);
        toast.error(`Falha ao registrar pagamento: ${err.message || String(err)}`);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeWaiter]
  );

  return {
    isSubmitting,
    openTable,
    addItemsToTable,
    removeItemFromTable,
    sendTableToKitchen,
    requestBill,
    finishCheckout,
  };
}
