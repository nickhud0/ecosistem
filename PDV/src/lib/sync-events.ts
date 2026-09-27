/**
 * Modelo Canônico de Eventos e Mutações do Ecossistema Offline-First
 * Compartilhado conceitualmente entre PDV Desktop (Tauri) e POS Android (Capacitor)
 */

export type EventType =
  | "TABLE_OPENED"
  | "ITEM_ADDED"
  | "ITEM_REMOVED"
  | "ITEM_SENT_TO_KITCHEN"
  | "TABLE_STATUS_CHANGED"
  | "TABLE_DISCOUNT_APPLIED"
  | "TABLE_TRANSFERRED"
  | "PAYMENT_STARTED"
  | "PAYMENT_AUTHORIZED"
  | "PAYMENT_FAILED"
  | "ORDER_CLOSED"
  | "PRODUCT_STOCK_TOGGLED";

export type AggregateType =
  | "table"
  | "order"
  | "item"
  | "payment"
  | "shift"
  | "product"
  | "customer";

export interface MutationEvent<T = Record<string, unknown>> {
  event_id: string;          // UUID v4 ou v7 global
  store_id: string;          // UUID da loja/restaurante
  device_id: string;         // ID do terminal emissor (ex: "caixa-01", "pos-garcon-marina")
  device_sequence: number;   // Sequencial monotônico local (1, 2, 3...)
  event_type: EventType;
  aggregate_type: AggregateType;
  aggregate_id: string;      // ID da entidade-raiz (ex: table_id ou order_id)
  payload: T;
  client_timestamp: string;  // ISO 8601 UTC
  hub_timestamp?: string;    // Preenchido pelo Local Hub na ingestão local
  cloud_timestamp?: string;  // Preenchido pela Cloud na ingestão remota
  version: number;           // Versão do contrato (1)
}

export interface OutboxRecord {
  event_id: string;
  store_id: string;
  device_id: string;
  device_sequence: number;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: string;           // JSON string
  client_timestamp: string;
  target_hub_sent: boolean;
  target_cloud_sent: boolean;
  retry_count: number;
  last_error?: string | null;
  created_at: string;
}

export interface InboxRecord {
  event_id: string;
  device_id: string;
  device_sequence: number;
  event_type: string;
  processed_at: string;
}

export interface SyncCursorRecord {
  peer_id: string;           // "hub", "cloud" ou device_id
  last_processed_sequence: number;
  last_processed_timestamp?: string | null;
  updated_at: string;
}

/**
 * Payloads específicos de cada evento
 */
export interface TableOpenedPayload {
  table_id: string;
  table_number: number;
  order_id: string;
  waiter_id?: string | null;
  waiter_name: string;
  opened_at: string;
  seats: number;
}

export interface ItemAddedPayload {
  item_id: string;
  order_id: string;
  table_id: string;
  product_id?: string | null;
  name: string;
  qty: number;
  unit_price: number;
  total_price: number;
  details?: string[] | null;
  notes?: string | null;
  origin_table_number?: number;
}

export interface ItemRemovedPayload {
  item_id: string;
  order_id: string;
  table_id: string;
  reason?: string;
  cancelled_by?: string;
}

export interface ItemSentToKitchenPayload {
  order_id: string;
  table_id: string;
  round: number;
  item_ids: string[];
  sent_at: string;
}

export interface TableStatusChangedPayload {
  table_id: string;
  status: "livre" | "ocupada" | "conta";
  waiter?: string;
  updated_at: string;
}

export interface TableDiscountPayload {
  table_id: string;
  order_id?: string;
  discount_type: "percent" | "value";
  discount_amount: number;
}

export interface TableTransferredPayload {
  source_table_id: string;
  target_table_id: string;
  source_table_number: number;
  target_table_number: number;
  order_id: string;
  mode: "move" | "merge";
}

export interface PaymentStartedPayload {
  payment_id: string;
  sale_id: string;
  order_id?: string;
  method: string;
  amount: number;
  parcel_index?: number;
  total_parcels?: number;
  idempotency_key: string;
}

export interface PaymentAuthorizedPayload {
  payment_id: string;
  sale_id: string;
  order_id?: string;
  authorization_code?: string;
  nsu?: string;
  card_brand?: string;
  captured_at: string;
}

export interface OrderClosedPayload {
  order_id: string;
  table_id: string;
  sale_id: string;
  sale_code: string;
  subtotal: number;
  service_fee: number;
  tip: number;
  discount: number;
  total: number;
  payments: Array<{
    method: string;
    amount: number;
    authorization_code?: string;
  }>;
  cpf?: string | null;
  closed_at: string;
}

export interface ProductStockToggledPayload {
  product_id: string;
  sold_out: boolean;
  updated_at: string;
}

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";
const DEVICE_ID_KEY = "fluxo_pos_device_id";
const DEVICE_SEQ_KEY = "fluxo_pos_device_seq";

/**
 * Retorna ou gera identificador estável do dispositivo local
 */
export function getOrCreateDeviceId(prefix = "dev"): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return `${prefix}-unknown`;
  }
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Incrementa e retorna o próximo número de sequência monotônica deste dispositivo
 */
export function getNextDeviceSequence(): number {
  if (typeof window === "undefined" || !window.localStorage) {
    return 1;
  }
  const current = parseInt(localStorage.getItem(DEVICE_SEQ_KEY) || "0", 10);
  const next = current + 1;
  localStorage.setItem(DEVICE_SEQ_KEY, String(next));
  return next;
}

/**
 * Retorna o ID da loja/tenant padrão ou configurada
 */
export function getStoreId(): string {
  if (typeof window !== "undefined" && window.localStorage) {
    const custom = localStorage.getItem("fluxo_pos_store_id");
    if (custom && custom.trim().length > 0) return custom.trim();
  }
  return DEFAULT_STORE_ID;
}

/**
 * Cria envelope padronizado de MutationEvent
 */
export function createMutationEvent<T extends Record<string, unknown>>(
  eventType: EventType,
  aggregateType: AggregateType,
  aggregateId: string,
  payload: T,
  deviceIdPrefix = "dev"
): MutationEvent<T> {
  return {
    event_id: crypto.randomUUID(),
    store_id: getStoreId(),
    device_id: getOrCreateDeviceId(deviceIdPrefix),
    device_sequence: getNextDeviceSequence(),
    event_type: eventType,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    payload,
    client_timestamp: new Date().toISOString(),
    version: 1,
  };
}
