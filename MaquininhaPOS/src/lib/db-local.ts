/**
 * Banco de Dados Local Estruturado (IndexedDB Nativo) para POS Android
 * Proporciona persistência Offline-First completa para mesas, catálogo,
 * Outbox, Inbox de deduplicação e cursores de sincronização.
 */

import type { OrderItem, Product, ProductCategory, TableT } from "./types";
import type { InboxRecord, MutationEvent, OutboxRecord, SyncCursorRecord } from "./sync-events";

const DB_NAME = "fluxo_pos_local_db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getLocalDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB não suportado neste ambiente."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Tabela de Mesas do Salão
      if (!db.objectStoreNames.contains("dining_tables")) {
        const store = db.createObjectStore("dining_tables", { keyPath: "id" });
        store.createIndex("number", "number", { unique: true });
        store.createIndex("status", "status", { unique: false });
      }

      // 2. Catálogo de Produtos
      if (!db.objectStoreNames.contains("products")) {
        const store = db.createObjectStore("products", { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("soldOut", "soldOut", { unique: false });
      }

      // 3. Categorias de Produtos
      if (!db.objectStoreNames.contains("categories")) {
        const store = db.createObjectStore("categories", { keyPath: "id" });
        store.createIndex("sortOrder", "sortOrder", { unique: false });
      }

      // 4. Fila de Saída Local (Outbox de Eventos e Mutações)
      if (!db.objectStoreNames.contains("outbox_events")) {
        const store = db.createObjectStore("outbox_events", { keyPath: "event_id" });
        store.createIndex("target_hub_sent", "target_hub_sent", { unique: false });
        store.createIndex("target_cloud_sent", "target_cloud_sent", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }

      // 5. Caixa de Entrada Local (Inbox para Deduplicação)
      if (!db.objectStoreNames.contains("inbox_events")) {
        const store = db.createObjectStore("inbox_events", { keyPath: "event_id" });
        store.createIndex("device_seq", ["device_id", "device_sequence"], { unique: false });
      }

      // 6. Cursores de Sincronização
      if (!db.objectStoreNames.contains("sync_cursors")) {
        db.createObjectStore("sync_cursors", { keyPath: "peer_id" });
      }

      // 7. Configurações Locais e Chaves
      if (!db.objectStoreNames.contains("app_config")) {
        db.createObjectStore("app_config", { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onerror = (event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      console.error("[IndexedDB Init Error]:", err);
      reject(err);
    };
  });

  return dbPromise;
}

// ============================================================================
// HELPERS PARA OPERAÇÕES CRUD NO BANCO LOCAL
// ============================================================================

/**
 * Salva ou atualiza uma lista de mesas no armazenamento local
 */
export async function saveLocalTables(tables: TableT[]): Promise<void> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dining_tables", "readwrite");
    const store = tx.objectStore("dining_tables");
    tables.forEach((t) => store.put(t));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retorna todas as mesas salvas no banco local
 */
export async function getLocalTables(): Promise<TableT[]> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dining_tables", "readonly");
    const store = tx.objectStore("dining_tables");
    const request = store.getAll();
    request.onsuccess = () => {
      const tables = (request.result as TableT[]) || [];
      tables.sort((a, b) => a.number - b.number);
      resolve(tables);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retorna uma mesa específica pelo ID
 */
export async function getLocalTableById(tableId: string): Promise<TableT | null> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dining_tables", "readonly");
    const store = tx.objectStore("dining_tables");
    const request = store.get(tableId);
    request.onsuccess = () => resolve((request.result as TableT) || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva catálogo de produtos local
 */
export async function saveLocalProducts(products: Product[]): Promise<void> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("products", "readwrite");
    const store = tx.objectStore("products");
    products.forEach((p) => store.put(p));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retorna todos os produtos do catálogo local
 */
export async function getLocalProducts(): Promise<Product[]> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("products", "readonly");
    const store = tx.objectStore("products");
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as Product[]) || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Atualiza status Sold Out de um produto localmente
 */
export async function setLocalProductSoldOut(productId: string, soldOut: boolean): Promise<void> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("products", "readwrite");
    const store = tx.objectStore("products");
    const req = store.get(productId);
    req.onsuccess = () => {
      const prod = req.result as Product;
      if (prod) {
        prod.soldOut = soldOut;
        store.put(prod);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// OUTBOX E INBOX NO BANCO LOCAL
// ============================================================================

/**
 * Enfileira um evento na Outbox local
 */
export async function enqueueOutboxEvent(event: MutationEvent): Promise<OutboxRecord> {
  const db = await getLocalDb();
  const record: OutboxRecord = {
    event_id: event.event_id,
    store_id: event.store_id,
    device_id: event.device_id,
    device_sequence: event.device_sequence,
    event_type: event.event_type,
    aggregate_type: event.aggregate_type,
    aggregate_id: event.aggregate_id,
    payload: JSON.stringify(event.payload),
    client_timestamp: event.client_timestamp,
    target_hub_sent: false,
    target_cloud_sent: false,
    retry_count: 0,
    last_error: null,
    created_at: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox_events", "readwrite");
    const store = tx.objectStore("outbox_events");
    store.put(record);
    tx.oncomplete = () => {
      notifyOutboxChange();
      resolve(record);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retorna eventos pendentes de transmissão para o Hub na LAN
 */
export async function getPendingHubOutboxEvents(limit = 50): Promise<OutboxRecord[]> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox_events", "readonly");
    const store = tx.objectStore("outbox_events");
    const request = store.getAll();
    request.onsuccess = () => {
      const all = (request.result as OutboxRecord[]) || [];
      const pending = all.filter((r) => !r.target_hub_sent).slice(0, limit);
      resolve(pending);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retorna eventos pendentes de transmissão para a Cloud (Modo 4G Fallback)
 */
export async function getPendingCloudOutboxEvents(limit = 50): Promise<OutboxRecord[]> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox_events", "readonly");
    const store = tx.objectStore("outbox_events");
    const request = store.getAll();
    request.onsuccess = () => {
      const all = (request.result as OutboxRecord[]) || [];
      const pending = all.filter((r) => !r.target_cloud_sent).slice(0, limit);
      resolve(pending);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Marca evento como transmitido com sucesso para o Hub
 */
export async function markOutboxEventHubSent(eventId: string): Promise<void> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox_events", "readwrite");
    const store = tx.objectStore("outbox_events");
    const req = store.get(eventId);
    req.onsuccess = () => {
      const record = req.result as OutboxRecord;
      if (record) {
        record.target_hub_sent = true;
        // Se já foi enviado para Hub e Cloud (ou se Hub é o coordenador), pode ser mantido arquivado
        store.put(record);
      }
    };
    tx.oncomplete = () => {
      notifyOutboxChange();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Marca evento como transmitido com sucesso para a Cloud (4G)
 */
export async function markOutboxEventCloudSent(eventId: string): Promise<void> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox_events", "readwrite");
    const store = tx.objectStore("outbox_events");
    const req = store.get(eventId);
    req.onsuccess = () => {
      const record = req.result as OutboxRecord;
      if (record) {
        record.target_cloud_sent = true;
        store.put(record);
      }
    };
    tx.oncomplete = () => {
      notifyOutboxChange();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Registra evento na Inbox para garantir Exactly-Once Processing (Idempotência)
 * Retorna true se é um evento novo, ou false se já foi processado anteriormente.
 */
export async function recordInboxEvent(event: MutationEvent): Promise<boolean> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("inbox_events", "readwrite");
    const store = tx.objectStore("inbox_events");
    const checkReq = store.get(event.event_id);

    checkReq.onsuccess = () => {
      if (checkReq.result) {
        // Já existe na Inbox, duplicação detectada!
        resolve(false);
      } else {
        const inboxRecord: InboxRecord = {
          event_id: event.event_id,
          device_id: event.device_id,
          device_sequence: event.device_sequence,
          event_type: event.event_type,
          processed_at: new Date().toISOString(),
        };
        store.put(inboxRecord);
        resolve(true);
      }
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retorna a quantidade de eventos pendentes na Outbox para exibição na UI
 */
export async function getOutboxPendingCount(): Promise<number> {
  try {
    const db = await getLocalDb();
    return new Promise((resolve) => {
      const tx = db.transaction("outbox_events", "readonly");
      const store = tx.objectStore("outbox_events");
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as OutboxRecord[]) || [];
        const pending = all.filter((r) => !r.target_hub_sent && !r.target_cloud_sent);
        resolve(pending.length);
      };
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

// Listeners reativos para atualização da UI quando a Outbox muda
type OutboxChangeListener = (count: number) => void;
const outboxListeners = new Set<OutboxChangeListener>();

export function subscribeOutboxChanges(listener: OutboxChangeListener): () => void {
  outboxListeners.add(listener);
  getOutboxPendingCount().then((count) => listener(count));
  return () => outboxListeners.delete(listener);
}

function notifyOutboxChange() {
  getOutboxPendingCount().then((count) => {
    outboxListeners.forEach((fn) => {
      try {
        fn(count);
      } catch {}
    });
  });
}

/**
 * Salva ou obtém configuração do Local Hub (IP, Porta, Token)
 */
export async function getHubConfig(): Promise<{ hubUrl: string | null; token: string | null }> {
  try {
    const db = await getLocalDb();
    return new Promise((resolve) => {
      const tx = db.transaction("app_config", "readonly");
      const store = tx.objectStore("app_config");
      const reqHub = store.get("hub_url");
      const reqToken = store.get("hub_token");

      tx.oncomplete = () => {
        resolve({
          hubUrl: reqHub.result ? reqHub.result.value : null,
          token: reqToken.result ? reqToken.result.value : null,
        });
      };
      tx.onerror = () => resolve({ hubUrl: null, token: null });
    });
  } catch {
    return { hubUrl: null, token: null };
  }
}

export async function setHubConfig(hubUrl: string, token?: string): Promise<void> {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("app_config", "readwrite");
    const store = tx.objectStore("app_config");
    store.put({ key: "hub_url", value: hubUrl });
    if (token) {
      store.put({ key: "hub_token", value: token });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
