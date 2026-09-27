/**
 * Cliente de Sincronização Local (LAN Realtime + 4G Fallback) do POS Android
 * Gerencia a comunicação WebSocket com o Local Hub na rede Wi-Fi,
 * executa heartbeat contínuo e comuta para Cloud 4G quando a LAN cai.
 */

import {
  getLocalTables,
  getPendingCloudOutboxEvents,
  getPendingHubOutboxEvents,
  markOutboxEventCloudSent,
  markOutboxEventHubSent,
  recordInboxEvent,
  saveLocalTables,
  setLocalProductSoldOut,
  getHubConfig,
  setHubConfig,
} from "./db-local";
import { isSupabaseConfigured, supabase } from "./supabase";
import type { MutationEvent } from "./sync-events";
import type { OrderItem, TableStatus, TableT } from "./types";

export type ConnectionMode = "LAN_HUB" | "CLOUD_4G" | "OFFLINE";

type ConnectionStatusListener = (status: {
  mode: ConnectionMode;
  hubUrl: string | null;
  latencyMs: number;
  lastPingAt: number;
}) => void;

type EventReceivedListener = (event: MutationEvent) => void;

class LanSyncClient {
  private ws: WebSocket | null = null;
  private currentMode: ConnectionMode = "OFFLINE";
  private hubUrl: string | null = null;
  private token: string | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private outboxDrainInterval: ReturnType<typeof setInterval> | null = null;
  private lastPingAt = 0;
  private latencyMs = 0;
  private isDraining = false;

  private statusListeners = new Set<ConnectionStatusListener>();
  private eventListeners = new Set<EventReceivedListener>();

  constructor() {
    this.init();
  }

  private async init() {
    const config = await getHubConfig();
    this.hubUrl = config.hubUrl || this.getDefaultHubUrl();
    this.token = config.token;

    // Inicia monitoramento de conexão e drenagem periódica
    this.startHeartbeat();
    this.startOutboxWorker();

    // Tenta conectar ao Hub local
    this.connectHub();

    // Escuta eventos online/offline do navegador/WebView
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleNetworkChange());
      window.addEventListener("offline", () => this.handleNetworkChange());
    }
  }

  private getDefaultHubUrl(): string {
    if (typeof window !== "undefined" && window.location) {
      // Se estiver rodando no navegador na mesma rede, tenta o mesmo host na porta 8080
      const host = window.location.hostname;
      if (host && host !== "localhost" && host !== "127.0.0.1") {
        return `ws://${host}:8080/sync/ws`;
      }
    }
    return "ws://192.168.1.100:8080/sync/ws"; // IP padrão para ambiente de rede
  }

  public setHubAddress(url: string, token?: string) {
    let formatted = url.trim();
    if (!formatted.startsWith("ws://") && !formatted.startsWith("wss://")) {
      formatted = `ws://${formatted}:8080/sync/ws`;
    }
    this.hubUrl = formatted;
    if (token) this.token = token;
    setHubConfig(this.hubUrl, this.token || undefined);
    this.reconnect();
  }

  public getStatus() {
    return {
      mode: this.currentMode,
      hubUrl: this.hubUrl,
      latencyMs: this.latencyMs,
      lastPingAt: this.lastPingAt,
    };
  }

  public subscribeStatus(listener: ConnectionStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  public subscribeEvents(listener: EventReceivedListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private notifyStatus() {
    const status = this.getStatus();
    this.statusListeners.forEach((fn) => {
      try {
        fn(status);
      } catch {}
    });
  }

  private setMode(newMode: ConnectionMode) {
    if (this.currentMode !== newMode) {
      console.info(`[LanSyncClient]: Transição de modo: ${this.currentMode} -> ${newMode}`);
      this.currentMode = newMode;
      this.notifyStatus();
    }
  }

  public connectHub() {
    if (!this.hubUrl) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.hubUrl);

      this.ws.onopen = () => {
        console.info(`[LanSyncClient]: Conectado ao Local Hub na LAN (${this.hubUrl})`);
        this.setMode("LAN_HUB");
        this.drainOutbox();
      };

      this.ws.onmessage = (msgEvent) => {
        this.handleIncomingMessage(msgEvent.data);
      };

      this.ws.onerror = (err) => {
        // Falha no WebSocket do Hub
        this.evaluateFallback();
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.evaluateFallback();
      };
    } catch {
      this.evaluateFallback();
    }
  }

  private reconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.connectHub();
  }

  private evaluateFallback() {
    if (typeof navigator !== "undefined" && navigator.onLine && isSupabaseConfigured()) {
      this.setMode("CLOUD_4G");
    } else {
      this.setMode("OFFLINE");
    }
  }

  private handleNetworkChange() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.setMode("OFFLINE");
    } else {
      // Rede voltou, tenta reconectar ao Hub primeiro
      this.connectHub();
    }
  }

  private startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const start = Date.now();
        this.lastPingAt = start;
        try {
          this.ws.send(JSON.stringify({ type: "PING", timestamp: start }));
        } catch {
          this.evaluateFallback();
        }
      } else {
        // Tenta reconectar periodicamente ao Hub caso esteja desconectado
        this.connectHub();
      }
    }, 5000);
  }

  private startOutboxWorker() {
    if (this.outboxDrainInterval) clearInterval(this.outboxDrainInterval);
    this.outboxDrainInterval = setInterval(() => {
      this.drainOutbox();
    }, 4000);
  }

  /**
   * Processa mensagens recebidas do Local Hub via WebSocket
   */
  private async handleIncomingMessage(raw: string) {
    try {
      const data = JSON.parse(raw);

      if (data.type === "PONG") {
        if (data.timestamp) {
          this.latencyMs = Math.max(1, Date.now() - data.timestamp);
        }
        this.setMode("LAN_HUB");
        this.notifyStatus();
        return;
      }

      if (data.type === "MUTATION_EVENT" && data.event) {
        const event: MutationEvent = data.event;
        const isNew = await recordInboxEvent(event);
        if (isNew) {
          await this.applyEventToLocalState(event);
          this.eventListeners.forEach((fn) => {
            try {
              fn(event);
            } catch {}
          });
        }
      }

      if (data.type === "ACK_EVENT" && data.event_id) {
        await markOutboxEventHubSent(data.event_id);
      }
    } catch (err) {
      console.warn("[LanSyncClient]: Erro ao processar mensagem do Hub:", err);
    }
  }

  /**
   * Aplica a mutação sobre o estado do banco local (IndexedDB)
   */
  public async applyEventToLocalState(event: MutationEvent) {
    const payload: any = event.payload;

    switch (event.event_type) {
      case "TABLE_OPENED": {
        const tables = await getLocalTables();
        const updated = tables.map((t) => {
          if (t.id === payload.table_id || t.number === payload.table_number) {
            return {
              ...t,
              status: "ocupada" as TableStatus,
              waiter: payload.waiter_name || t.waiter,
              openedAt: new Date(payload.opened_at).getTime(),
              orderId: payload.order_id,
            };
          }
          return t;
        });
        await saveLocalTables(updated);
        break;
      }

      case "ITEM_ADDED": {
        const tables = await getLocalTables();
        const updated = tables.map((t) => {
          if (t.id === payload.table_id) {
            const newItem: OrderItem = {
              id: payload.item_id,
              orderId: payload.order_id,
              productId: payload.product_id,
              name: payload.name,
              qty: payload.qty,
              unitPrice: payload.unit_price,
              totalPrice: payload.total_price,
              details: payload.details,
              notes: payload.notes,
              sentToKitchen: false,
              createdAt: event.client_timestamp,
            };
            // Evita item duplicado se já estiver na lista
            const items = t.items.some((i) => i.id === newItem.id)
              ? t.items
              : [...t.items, newItem];

            return {
              ...t,
              status: "ocupada" as TableStatus,
              items,
              openedAt: t.openedAt || Date.now(),
            };
          }
          return t;
        });
        await saveLocalTables(updated);
        break;
      }

      case "ITEM_REMOVED": {
        const tables = await getLocalTables();
        const updated = tables.map((t) => {
          if (t.id === payload.table_id) {
            const remaining = t.items.filter((i) => i.id !== payload.item_id);
            return {
              ...t,
              items: remaining,
              status: remaining.length === 0 ? ("livre" as TableStatus) : t.status,
            };
          }
          return t;
        });
        await saveLocalTables(updated);
        break;
      }

      case "ITEM_SENT_TO_KITCHEN": {
        const tables = await getLocalTables();
        const updated = tables.map((t) => {
          if (t.id === payload.table_id) {
            const sentIds = new Set(payload.item_ids || []);
            return {
              ...t,
              items: t.items.map((i) =>
                sentIds.has(i.id)
                  ? { ...i, sentToKitchen: true, kitchenRound: payload.round }
                  : i
              ),
            };
          }
          return t;
        });
        await saveLocalTables(updated);
        break;
      }

      case "TABLE_STATUS_CHANGED": {
        const tables = await getLocalTables();
        const updated = tables.map((t) => {
          if (t.id === payload.table_id) {
            return {
              ...t,
              status: payload.status as TableStatus,
              waiter: payload.waiter || t.waiter,
            };
          }
          return t;
        });
        await saveLocalTables(updated);
        break;
      }

      case "ORDER_CLOSED": {
        const tables = await getLocalTables();
        const updated = tables.map((t) => {
          if (t.id === payload.table_id) {
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
          return t;
        });
        await saveLocalTables(updated);
        break;
      }

      case "TABLE_TRANSFERRED": {
        const tables = await getLocalTables();
        const sourceTable = tables.find((t) => t.id === payload.source_table_id);
        if (!sourceTable) break;

        const updated = tables.map((t) => {
          if (t.id === payload.source_table_id) {
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
          if (t.id === payload.target_table_id) {
            if (payload.mode === "move") {
              return {
                ...t,
                status: "ocupada" as TableStatus,
                waiter: sourceTable.waiter,
                openedAt: sourceTable.openedAt || Date.now(),
                items: sourceTable.items,
                orderId: payload.order_id,
              };
            } else {
              return {
                ...t,
                status: "ocupada" as TableStatus,
                items: [...t.items, ...sourceTable.items],
                mergedWith: [...(t.mergedWith || []), payload.source_table_number],
              };
            }
          }
          return t;
        });
        await saveLocalTables(updated);
        break;
      }

      case "TABLE_DISCOUNT_APPLIED": {
        const tables = await getLocalTables();
        const updated = tables.map((t) => {
          if (t.id === payload.table_id) {
            return {
              ...t,
              discount: {
                type: payload.discount_type,
                amount: payload.discount_amount,
              },
            };
          }
          return t;
        });
        await saveLocalTables(updated);
        break;
      }

      case "PRODUCT_STOCK_TOGGLED": {
        await setLocalProductSoldOut(payload.product_id, payload.sold_out);
        break;
      }
    }
  }

  /**
   * Envia um evento de mutação para a rede
   */
  public async dispatchEvent(event: MutationEvent): Promise<boolean> {
    // 1. Se estiver conectado ao Local Hub na LAN, envia via WebSocket
    if (this.currentMode === "LAN_HUB" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "MUTATION_EVENT", event }));
        await markOutboxEventHubSent(event.event_id);
        return true;
      } catch (err) {
        console.warn("[LanSyncClient]: Falha ao transmitir evento via WebSocket:", err);
      }
    }

    // 2. Se a LAN falhar mas estiver conectado na Nuvem via 4G, envia direto ao Supabase
    if (this.currentMode === "CLOUD_4G" && isSupabaseConfigured() && supabase) {
      try {
        await this.sendEventToCloud(event);
        await markOutboxEventCloudSent(event.event_id);
        return true;
      } catch (err) {
        console.warn("[LanSyncClient]: Falha ao transmitir evento via 4G Cloud:", err);
      }
    }

    // Ficará na Outbox para envio automático quando uma conexão for estabelecida
    return false;
  }

  /**
   * Drena eventos pendentes na Outbox
   */
  public async drainOutbox() {
    if (this.isDraining) return;
    this.isDraining = true;

    try {
      // 1. Drenagem para o Hub na LAN
      if (this.currentMode === "LAN_HUB" && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pendingHub = await getPendingHubOutboxEvents(30);
        for (const rec of pendingHub) {
          try {
            const event: MutationEvent = {
              event_id: rec.event_id,
              store_id: rec.store_id,
              device_id: rec.device_id,
              device_sequence: rec.device_sequence,
              event_type: rec.event_type as any,
              aggregate_type: rec.aggregate_type as any,
              aggregate_id: rec.aggregate_id,
              payload: JSON.parse(rec.payload),
              client_timestamp: rec.client_timestamp,
              version: 1,
            };
            this.ws.send(JSON.stringify({ type: "MUTATION_EVENT", event }));
            await markOutboxEventHubSent(rec.event_id);
          } catch {}
        }
      }

      // 2. Drenagem para a Cloud (Modo 4G)
      if (this.currentMode === "CLOUD_4G" && isSupabaseConfigured() && supabase) {
        const pendingCloud = await getPendingCloudOutboxEvents(30);
        for (const rec of pendingCloud) {
          try {
            const event: MutationEvent = {
              event_id: rec.event_id,
              store_id: rec.store_id,
              device_id: rec.device_id,
              device_sequence: rec.device_sequence,
              event_type: rec.event_type as any,
              aggregate_type: rec.aggregate_type as any,
              aggregate_id: rec.aggregate_id,
              payload: JSON.parse(rec.payload),
              client_timestamp: rec.client_timestamp,
              version: 1,
            };
            await this.sendEventToCloud(event);
            await markOutboxEventCloudSent(rec.event_id);
          } catch {}
        }
      }
    } finally {
      this.isDraining = false;
    }
  }

  /**
   * Envia evento diretamente para a Cloud (Supabase) via 4G Fallback
   */
  private async sendEventToCloud(event: MutationEvent): Promise<void> {
    if (!supabase) return;
    const client = supabase;

    // Tenta registrar na tabela de eventos ou aplicar o snapshot correspondente
    try {
      await client.from("cloud_event_store").insert({
        event_id: event.event_id,
        store_id: event.store_id,
        device_id: event.device_id,
        device_sequence: event.device_sequence,
        event_type: event.event_type,
        aggregate_type: event.aggregate_type,
        aggregate_id: event.aggregate_id,
        payload: event.payload,
        client_timestamp: event.client_timestamp,
      });
    } catch {
      // Caso a tabela de eventos ainda não exista no Supabase legado, continua a execução
    }
  }
}

// Instância Singleton do cliente de sincronização
export const lanSyncClient = new LanSyncClient();
