/**
 * Coordenador do Local Hub no PDV Caixa
 * Gerencia a coordenação de rede local (LAN), broadcast para terminais POS conectados,
 * ingestão idempotente de eventos e métricas de diagnóstico.
 */

import { db, isTauri } from "@/database/db";
import { appSettings, diningTables, orderItems, orders, products, sales, payments } from "@/database/schema";
import { eq, inArray } from "drizzle-orm";
import type { MutationEvent } from "@/lib/sync-events";
import {
  DEFAULT_KITCHEN_PRINTER_CONFIG,
  printKitchenTicket,
  type KitchenPrinterConfig,
  type KitchenTicketData,
} from "@/lib/printer-service";
import { checkAndRecordInbox, dispatchOutboxEvent } from "./outboxService";

export interface HubStats {
  isRunning: boolean;
  port: number;
  localIp: string;
  connectedClientsCount: number;
  eventsProcessedCount: number;
  lastEventAt: string | null;
}

class LocalHubCoordinator {
  private isRunning = false;
  private port = 8080;
  private localIp = "127.0.0.1";
  private connectedClientsCount = 0;
  private eventsProcessedCount = 0;
  private lastEventAt: string | null = null;
  private activeWsClients = new Set<any>();

  constructor() {
    this.detectLocalNetwork();
  }

  /**
   * Tenta detectar o endereço IP local da máquina na LAN
   */
  private async detectLocalNetwork() {
    if (typeof window !== "undefined" && window.location) {
      const hostname = window.location.hostname;
      if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
        this.localIp = hostname;
      }
    }
  }

  public getStats(): HubStats {
    return {
      isRunning: this.isRunning,
      port: this.port,
      localIp: this.localIp,
      connectedClientsCount: this.connectedClientsCount,
      eventsProcessedCount: this.eventsProcessedCount,
      lastEventAt: this.lastEventAt,
    };
  }

  public getPairingQrPayload(): string {
    return JSON.stringify({
      type: "FLUXO_HUB_CONNECT",
      hub_url: `ws://${this.localIp}:${this.port}/sync/ws`,
      store_id: "00000000-0000-0000-0000-000000000001",
      name: "Caixa Central",
      timestamp: Date.now(),
    });
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.info(`[LocalHubCoordinator]: Hub iniciado no Caixa (Porta ${this.port}).`);
  }

  public stop() {
    this.isRunning = false;
    this.activeWsClients.clear();
    this.connectedClientsCount = 0;
    console.info("[LocalHubCoordinator]: Hub parado.");
  }

  /**
   * Ingestão de evento vindo da LAN (enviado por um POS Android)
   */
  public async ingestLanEvent(event: MutationEvent): Promise<{ success: boolean; isDuplicate: boolean; error?: string }> {
    try {
      this.eventsProcessedCount++;
      this.lastEventAt = new Date().toISOString();

      // 1. Validação de Idempotência pela Inbox
      const isNew = await checkAndRecordInbox(event);
      if (!isNew) {
        // Evento duplicado já processado anteriormente
        return { success: true, isDuplicate: true };
      }

      // 2. Aplica a mutação sobre o SQLite local do PDV
      await this.materializeEventToLocalDb(event);

      // 3. Registra na Outbox para envio à Cloud quando houver Internet
      await dispatchOutboxEvent(event);

      // 4. Faz broadcast do evento para todos os demais POS conectados na LAN
      this.broadcastToClients({
        type: "MUTATION_EVENT",
        event,
      }, event.device_id);

      return { success: true, isDuplicate: false };
    } catch (err: any) {
      console.error("[LocalHubCoordinator Ingestion Error]:", err);
      return { success: false, isDuplicate: false, error: err.message || String(err) };
    }
  }

  /**
   * Materializa o evento recebido no banco de dados SQLite local
   */
  private async materializeEventToLocalDb(event: MutationEvent) {
    if (!isTauri()) return;
    const now = new Date().toISOString();
    const payload: any = event.payload;

    switch (event.event_type) {
      case "TABLE_OPENED": {
        await db
          .update(diningTables)
          .set({
            status: "ocupada",
            waiter: payload.waiter_name || "Equipe",
            opened_at: payload.opened_at || now,
            updated_at: now,
            is_synced: false,
          })
          .where(eq(diningTables.id, payload.table_id));

        // Cria ou atualiza comanda aberta correspondente
        const existingOrder = await db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.id, payload.order_id))
          .limit(1);

        if (existingOrder.length === 0) {
          await db.insert(orders).values({
            id: payload.order_id,
            code: `MESA-${String(payload.table_number).padStart(2, "0")}`,
            type: "table",
            table_id: payload.table_id,
            status: "open",
            subtotal: 0,
            service_fee: 0,
            tip: 0,
            discount: 0,
            total: 0,
            operator_id: payload.waiter_id || null,
            is_synced: false,
            created_at: payload.opened_at || now,
            updated_at: now,
          });
        }
        break;
      }

      case "ITEM_ADDED": {
        // Insere item atômico na comanda
        const existing = await db
          .select({ id: orderItems.id })
          .from(orderItems)
          .where(eq(orderItems.id, payload.item_id))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(orderItems).values({
            id: payload.item_id,
            order_id: payload.order_id,
            product_id: payload.product_id || null,
            name: payload.name,
            qty: payload.qty,
            unit_price: payload.unit_price,
            total_price: payload.total_price,
            details: payload.details ? JSON.stringify(payload.details) : null,
            notes: payload.notes || null,
            is_synced: false,
            created_at: event.client_timestamp || now,
            updated_at: now,
          });
        }

        // Assegura que a mesa física está como 'ocupada'
        await db
          .update(diningTables)
          .set({
            status: "ocupada",
            updated_at: now,
            is_synced: false,
          })
          .where(eq(diningTables.id, payload.table_id));
        break;
      }

      case "ITEM_REMOVED": {
        await db
          .update(orderItems)
          .set({
            deleted_at: now,
            updated_at: now,
            is_synced: false,
          })
          .where(eq(orderItems.id, payload.item_id));
        break;
      }

      case "ITEM_SENT_TO_KITCHEN": {
        const itemIds: string[] = payload.item_ids || [];
        if (itemIds.length > 0) {
          for (const id of itemIds) {
            await db
              .update(orderItems)
              .set({
                notes: JSON.stringify({ sentToKitchen: true, kitchenRound: payload.round }),
                updated_at: now,
                is_synced: false,
              })
              .where(eq(orderItems.id, id));
          }

          // Dispara impressão automática na impressora de produção (Cozinha por IP)
          this.triggerKitchenAutoPrint(payload.table_id, itemIds, payload.round, event.device_id).catch(() => {});
        }
        break;
      }

      case "TABLE_STATUS_CHANGED": {
        await db
          .update(diningTables)
          .set({
            status: payload.status,
            updated_at: now,
            is_synced: false,
          })
          .where(eq(diningTables.id, payload.table_id));
        break;
      }

      case "ORDER_CLOSED": {
        // Atualiza a comanda para completed
        await db
          .update(orders)
          .set({
            status: "completed",
            subtotal: payload.subtotal,
            service_fee: payload.service_fee,
            discount: payload.discount,
            total: payload.total,
            updated_at: now,
            is_synced: false,
          })
          .where(eq(orders.id, payload.order_id));

        // Libera a mesa física
        await db
          .update(diningTables)
          .set({
            status: "livre",
            waiter: "Equipe",
            opened_at: null,
            discount_type: null,
            discount_amount: null,
            merged_with: null,
            updated_at: now,
            is_synced: false,
          })
          .where(eq(diningTables.id, payload.table_id));
        break;
      }

      case "TABLE_TRANSFERRED": {
        if (payload.mode === "move") {
          await db
            .update(orders)
            .set({ table_id: payload.target_table_id, updated_at: now, is_synced: false })
            .where(eq(orders.id, payload.order_id));

          await db
            .update(diningTables)
            .set({
              status: "livre",
              waiter: "Equipe",
              opened_at: null,
              discount_type: null,
              discount_amount: null,
              merged_with: null,
              updated_at: now,
              is_synced: false,
            })
            .where(eq(diningTables.id, payload.source_table_id));

          await db
            .update(diningTables)
            .set({
              status: "ocupada",
              updated_at: now,
              is_synced: false,
            })
            .where(eq(diningTables.id, payload.target_table_id));
        } else {
          await db
            .update(diningTables)
            .set({
              status: "livre",
              waiter: "Equipe",
              opened_at: null,
              discount_type: null,
              discount_amount: null,
              merged_with: null,
              updated_at: now,
              is_synced: false,
            })
            .where(eq(diningTables.id, payload.source_table_id));
        }
        break;
      }

      case "TABLE_DISCOUNT_APPLIED": {
        await db
          .update(diningTables)
          .set({
            discount_type: payload.discount_type,
            discount_amount: payload.discount_amount,
            updated_at: now,
            is_synced: false,
          })
          .where(eq(diningTables.id, payload.table_id));
        break;
      }

      case "PRODUCT_STOCK_TOGGLED": {
        await db
          .update(products)
          .set({
            sold_out: payload.sold_out,
            updated_at: now,
            is_synced: false,
          })
          .where(eq(products.id, payload.product_id));
        break;
      }
    }
  }

  /**
   * Broadcast para clientes conectados
   */
  private broadcastToClients(msg: any, excludeDeviceId?: string) {
    // Quando integrador WebSocket nativo estiver conectado, envia aos sockets ativos
    this.activeWsClients.forEach((client) => {
      try {
        if (client && typeof client.send === "function") {
          client.send(JSON.stringify(msg));
        }
      } catch {}
    });
  }

  /**
   * Dispara a impressão automática na impressora térmica da cozinha conectada na rede local (IP / TCP 9100)
   */
  private async triggerKitchenAutoPrint(
    tableId: string,
    itemIds: string[],
    round: number,
    deviceId?: string,
  ) {
    if (!isTauri()) return;
    try {
      // 1. Carrega configuração da impressora de cozinha
      let printerConfig: KitchenPrinterConfig = DEFAULT_KITCHEN_PRINTER_CONFIG;
      const settingsRow = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, "kitchen_printer_config"))
        .limit(1);

      if (settingsRow[0]?.value) {
        try {
          printerConfig = JSON.parse(settingsRow[0].value);
        } catch {}
      }

      if (!printerConfig.enabled || !printerConfig.autoPrintOnKitchenSend) {
        return;
      }

      // 2. Busca dados da mesa
      const tableRow = await db
        .select()
        .from(diningTables)
        .where(eq(diningTables.id, tableId))
        .limit(1);

      const tableNumber = tableRow[0]?.number ?? 0;
      const waiter = tableRow[0]?.waiter || deviceId || "Garçom";

      // 3. Busca itens despachados
      const itemsRows = await db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.id, itemIds));

      if (itemsRows.length === 0) return;

      const ticketData: KitchenTicketData = {
        tableNumber,
        orderCode: `MESA-${String(tableNumber).padStart(2, "0")}`,
        waiter,
        round,
        items: itemsRows.map((it) => {
          let details: string[] | undefined;
          if (it.details) {
            try {
              details = JSON.parse(it.details);
            } catch {}
          }
          return {
            id: it.id,
            name: it.name,
            qty: it.qty,
            details,
          };
        }),
        timestamp: new Date().toISOString(),
      };

      console.info(
        `[LocalHubCoordinator]: Despachando ticket de cozinha para impressora IP ${printerConfig.ip}:${printerConfig.port}...`,
      );
      await printKitchenTicket(ticketData, printerConfig);
    } catch (printErr) {
      console.warn("[LocalHubCoordinator]: Falha na impressão automática de cozinha:", printErr);
    }
  }
}

export const localHubCoordinator = new LocalHubCoordinator();

