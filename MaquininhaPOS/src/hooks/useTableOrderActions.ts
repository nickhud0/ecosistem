import { useCallback, useState } from "react";
import { toast } from "sonner";
import { enqueueOutboxEvent } from "../lib/db-local";
import { lanSyncClient } from "../lib/lan-sync-client";
import { createMutationEvent, type TableOpenedPayload } from "../lib/sync-events";
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

  // 1. Abrir Mesa (Offline-First com Outbox e LanSyncClient)
  const openTable = useCallback(
    async (table: TableT): Promise<boolean> => {
      setIsSubmitting(true);
      const now = new Date().toISOString();
      const waiterName = activeWaiter?.name || "Equipe";
      const operatorId = getSafeOperatorId();
      const orderId = uid();

      try {
        // 1. Cria evento TABLE_OPENED
        const payload: TableOpenedPayload = {
          table_id: table.id,
          table_number: table.number,
          order_id: orderId,
          waiter_id: operatorId,
          waiter_name: waiterName,
          opened_at: now,
          seats: table.seats || 4,
        };

        const event = createMutationEvent("TABLE_OPENED", "table", table.id, payload as any, "pos");

        // 2. Grava na Outbox local imediatamente (0ms de latência)
        await enqueueOutboxEvent(event);

        // 3. Aplica localmente no IndexedDB
        await lanSyncClient.applyEventToLocalState(event);

        // 4. Despacha via LAN para o Hub ou via 4G para a Cloud
        lanSyncClient.dispatchEvent(event).catch(() => {});

        // 5. Tenta espelhar no Supabase em segundo plano se configurado e online
        if (isSupabaseConfigured() && supabase) {
          const code = `MESA-${String(table.number).padStart(2, "0")}`;
          supabase
            .from("dining_tables")
            .update({
              status: "ocupada",
              waiter: waiterName,
              opened_at: now,
              updated_at: now,
              is_synced: true,
            })
            .eq("id", table.id)
            .then(() => {
              return supabase.from("orders").insert({
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
            })
            .catch((err) => {
              console.warn("[openTable Remote Sync Warning]:", err);
            });
        }

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
  // 2. Adicionar Itens à Mesa (Anti-conflito multi-dispositivo, Outbox e ultra-rápido)
  const addItemsToTable = useCallback(
    async (table: TableT, itemsToAdd: OrderItem[]): Promise<boolean> => {
      if (!itemsToAdd || itemsToAdd.length === 0) return true;

      setIsSubmitting(true);
      const now = new Date().toISOString();
      const waiterName = activeWaiter?.name || table.waiter || "Equipe";
      const operatorId = getSafeOperatorId();
      const orderId = table.orderId || uid();

      try {
        // 1. Cria eventos ITEM_ADDED individuais para cada item
        for (const it of itemsToAdd) {
          const itemPrice = Number(it.unitPrice || 0);
          const itemQty = Number(it.qty || 1);
          const itemId = it.id && isValidUuid(it.id) ? it.id : uid();
          const productId = it.productId && isValidUuid(it.productId) ? it.productId : null;

          const itemPayload = {
            item_id: itemId,
            order_id: orderId,
            table_id: table.id,
            product_id: productId,
            name: it.name,
            qty: itemQty,
            unit_price: itemPrice,
            total_price: itemQty * itemPrice,
            details: it.details || null,
            notes: it.notes || null,
            origin_table_number: table.number,
          };

          const event = createMutationEvent("ITEM_ADDED", "item", itemId, itemPayload as any, "pos");

          // Grava na Outbox local
          await enqueueOutboxEvent(event);

          // Aplica no IndexedDB local
          await lanSyncClient.applyEventToLocalState(event);

          // Despacha na LAN/Cloud
          lanSyncClient.dispatchEvent(event).catch(() => {});
        }

        // 2. Tenta espelhar no Supabase em segundo plano se disponível
        if (isSupabaseConfigured() && supabase) {
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
                sentToKitchen: false,
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

          supabase
            .from("order_items")
            .insert(itemsPayload)
            .then(() => {
              return supabase
                .from("dining_tables")
                .update({
                  status: "ocupada",
                  waiter: table.waiter === "Equipe" ? waiterName : table.waiter,
                  updated_at: now,
                  is_synced: true,
                })
                .eq("id", table.id);
            })
            .catch((err) => {
              console.warn("[addItemsToTable Remote Sync Warning]:", err);
            });
        }

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

  // 3. Despachar Pedido Pendente para a Cozinha (por rodadas controladas pelo garçom, Offline-First)
  const sendTableToKitchen = useCallback(
    async (table: TableT): Promise<boolean> => {
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
      const orderId = table.orderId || uid();
      const itemIds = pendingItems.map((i) => i.id);

      try {
        const payload = {
          order_id: orderId,
          table_id: table.id,
          round: nextRound,
          item_ids: itemIds,
          sent_at: now,
        };

        const event = createMutationEvent("ITEM_SENT_TO_KITCHEN", "order", orderId, payload as any, "pos");
        await enqueueOutboxEvent(event);
        await lanSyncClient.applyEventToLocalState(event);
        lanSyncClient.dispatchEvent(event).catch(() => {});

        // Sincronização em segundo plano no Supabase se disponível
        if (isSupabaseConfigured() && supabase) {
          const client = supabase;
          const updatePromises = pendingItems.map((item) => {
            let existingNotes: any = {};
            if (item.notes) {
              try {
                existingNotes = JSON.parse(item.notes);
              } catch {}
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
          Promise.all(updatePromises).catch((err) => {
            console.warn("[sendTableToKitchen Remote Sync Warning]:", err);
          });
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

  // 4. Remover / Cancelar Item da Comanda (Offline-First com Outbox)
  const removeItemFromTable = useCallback(
    async (table: TableT, itemToRemove: OrderItem): Promise<boolean> => {
      setIsSubmitting(true);
      const now = new Date().toISOString();
      const orderId = table.orderId || uid();

      try {
        const payload = {
          item_id: itemToRemove.id,
          order_id: orderId,
          table_id: table.id,
          cancelled_by: activeWaiter?.name || table.waiter || "Equipe",
        };

        const event = createMutationEvent("ITEM_REMOVED", "item", itemToRemove.id, payload as any, "pos");
        await enqueueOutboxEvent(event);
        await lanSyncClient.applyEventToLocalState(event);
        lanSyncClient.dispatchEvent(event).catch(() => {});

        // Sincronização em segundo plano no Supabase se disponível
        if (isSupabaseConfigured() && supabase) {
          const client = supabase;
          const remainingItems = table.items.filter((it) => it.id !== itemToRemove.id);

          client
            .from("order_items")
            .update({
              deleted_at: now,
              updated_at: now,
              is_synced: true,
            })
            .eq("id", itemToRemove.id)
            .then(async () => {
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
              } else {
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
                }
              }
            })
            .catch((err) => {
              console.warn("[removeItemFromTable Remote Sync Warning]:", err);
            });
        }

        triggerHaptic(15);
        return true;
      } catch (err: any) {
        console.error("[removeItemFromTable Error]:", err);
        toast.error(`Falha ao remover item: ${err.message || String(err)}`);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeWaiter]
  );

  // 5. Solicitar Conta (muda status para 'conta' no salão, Offline-First)
  const requestBill = useCallback(
    async (table: TableT): Promise<boolean> => {
      setIsSubmitting(true);
      const now = new Date().toISOString();

      try {
        const payload = {
          table_id: table.id,
          status: "conta" as const,
          waiter: activeWaiter?.name || table.waiter || "Equipe",
          updated_at: now,
        };

        const event = createMutationEvent("TABLE_STATUS_CHANGED", "table", table.id, payload as any, "pos");
        await enqueueOutboxEvent(event);
        await lanSyncClient.applyEventToLocalState(event);
        lanSyncClient.dispatchEvent(event).catch(() => {});

        // Sincronização em segundo plano no Supabase se disponível
        if (isSupabaseConfigured() && supabase) {
          supabase
            .from("dining_tables")
            .update({
              status: "conta",
              updated_at: now,
              is_synced: true,
            })
            .eq("id", table.id)
            .catch((err) => {
              console.warn("[requestBill Remote Sync Warning]:", err);
            });
        }

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
    [activeWaiter]
  );

  // 4. Finalizar e Cobrar Conta na Maquininha (Checkout na Mesa com Outbox e Offline-First)
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
      setIsSubmitting(true);
      const now = new Date().toISOString();
      const saleId = uid();
      const saleCode = `CUP-${Date.now().toString().slice(-6)}`;
      const orderId = table.orderId || uid();

      try {
        // 1. Cria o evento canônico ORDER_CLOSED
        const closePayload = {
          order_id: orderId,
          table_id: table.id,
          sale_id: saleId,
          sale_code: saleCode,
          subtotal: summary.subtotal,
          service_fee: summary.serviceFee,
          tip: 0,
          discount: summary.discount,
          total: summary.total,
          payments: summary.payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            authorization_code: p.authorizationCode,
          })),
          cpf: summary.cpf || null,
          closed_at: now,
        };

        const event = createMutationEvent("ORDER_CLOSED", "order", orderId, closePayload as any, "pos");

        // 2. Grava na Outbox local
        await enqueueOutboxEvent(event);

        // 3. Aplica imediatamente no banco local (libera mesa e limpa itens)
        await lanSyncClient.applyEventToLocalState(event);

        // 4. Despacha na LAN/Cloud
        lanSyncClient.dispatchEvent(event).catch(() => {});

        // 5. Espelha no Supabase em segundo plano se configurado e online
        if (isSupabaseConfigured() && supabase) {
          supabase
            .from("sales")
            .insert({
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
            })
            .then(() => {
              const paymentsPayload = summary.payments.map((p) => ({
                id: uid(),
                sale_id: saleId,
                method: p.method,
                amount: Number(p.amount || 0),
                change_amount: Number(p.changeAmount || 0),
                customer_id: p.customerId && isValidUuid(p.customerId) ? p.customerId : null,
                card_brand: p.cardBrand || null,
                authorization_code: p.authorizationCode || null,
                is_synced: true,
                created_at: now,
                updated_at: now,
              }));
              return supabase.from("payments").insert(paymentsPayload);
            })
            .then(() => {
              return supabase
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
                .eq("table_id", table.id)
                .eq("status", "open");
            })
            .then(() => {
              return supabase
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
            })
            .catch((err) => {
              console.warn("[finishCheckout Remote Sync Warning]:", err);
            });
        }

        // 6. Imprime comprovante na bobina térmica 58mm da maquininha
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

  // 6. Transferir Mesa ou Juntar com Outra Mesa (Offline-First com Outbox e LAN)
  const transferTable = useCallback(
    async (sourceTable: TableT, targetTable: TableT): Promise<boolean> => {
      setIsSubmitting(true);
      const now = new Date().toISOString();
      const orderId = sourceTable.orderId || uid();
      const mode = targetTable.status === "livre" ? "move" : "merge";

      try {
        // 1. Cria o evento canônico TABLE_TRANSFERRED
        const payload = {
          source_table_id: sourceTable.id,
          target_table_id: targetTable.id,
          source_table_number: sourceTable.number,
          target_table_number: targetTable.number,
          order_id: orderId,
          mode,
        };

        const event = createMutationEvent("TABLE_TRANSFERRED", "table", targetTable.id, payload as any, "pos");

        // 2. Grava na Outbox local
        await enqueueOutboxEvent(event);

        // 3. Aplica localmente no IndexedDB
        await lanSyncClient.applyEventToLocalState(event);

        // 4. Despacha na LAN/Cloud
        lanSyncClient.dispatchEvent(event).catch(() => {});

        // 5. Espelha no Supabase em segundo plano se configurado e online
        if (isSupabaseConfigured() && supabase) {
          (async () => {
            try {
              if (mode === "move") {
                await supabase
                  .from("orders")
                  .update({
                    table_id: targetTable.id,
                    code: `MESA-${String(targetTable.number).padStart(2, "0")}`,
                    updated_at: now,
                    is_synced: true,
                  })
                  .eq("id", orderId);

                await Promise.all([
                  supabase
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
                    .eq("id", sourceTable.id),
                  supabase
                    .from("dining_tables")
                    .update({
                      status: "ocupada",
                      waiter: sourceTable.waiter,
                      opened_at: sourceTable.openedAt
                        ? new Date(sourceTable.openedAt).toISOString()
                        : now,
                      updated_at: now,
                      is_synced: true,
                    })
                    .eq("id", targetTable.id),
                ]);
              } else {
                const { data: targetOrders } = await supabase
                  .from("orders")
                  .select("id, total")
                  .eq("table_id", targetTable.id)
                  .eq("status", "open")
                  .is("deleted_at", null)
                  .limit(1);

                const targetOrderId =
                  targetOrders && targetOrders.length > 0 ? targetOrders[0].id : targetTable.orderId;

                if (orderId && targetOrderId) {
                  await supabase
                    .from("order_items")
                    .update({
                      order_id: targetOrderId,
                      updated_at: now,
                      is_synced: true,
                    })
                    .eq("order_id", orderId);

                  await supabase
                    .from("orders")
                    .update({
                      status: "cancelled",
                      deleted_at: now,
                      updated_at: now,
                      is_synced: true,
                    })
                    .eq("id", orderId);

                  const sourceTotal = sourceTable.items.reduce(
                    (s, it) => s + (it.totalPrice ?? it.qty * it.unitPrice),
                    0
                  );
                  const currentTargetTotal = Number(targetOrders?.[0]?.total || 0);

                  await supabase
                    .from("orders")
                    .update({
                      subtotal: currentTargetTotal + sourceTotal,
                      total: currentTargetTotal + sourceTotal,
                      updated_at: now,
                      is_synced: true,
                    })
                    .eq("id", targetOrderId);
                }

                const mergedArr = [...(targetTable.mergedWith || []), sourceTable.number];
                await Promise.all([
                  supabase
                    .from("dining_tables")
                    .update({
                      status: "livre",
                      waiter: "Equipe",
                      opened_at: null,
                      updated_at: now,
                      is_synced: true,
                    })
                    .eq("id", sourceTable.id),
                  supabase
                    .from("dining_tables")
                    .update({
                      merged_with: JSON.stringify(mergedArr),
                      updated_at: now,
                      is_synced: true,
                    })
                    .eq("id", targetTable.id),
                ]);
              }
            } catch (syncErr) {
              console.warn("[transferTable Remote Sync Warning]:", syncErr);
            }
          })();
        }

        triggerHaptic([20, 40, 20]);
        toast.success(`Mesa #${sourceTable.number} transferida com sucesso!`);
        return true;
      } catch (err: any) {
        console.error("[transferTable Error]:", err);
        toast.error(`Falha ao transferir mesa: ${err.message || String(err)}`);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return {
    isSubmitting,
    openTable,
    addItemsToTable,
    removeItemFromTable,
    sendTableToKitchen,
    requestBill,
    finishCheckout,
    transferTable,
  };
}
