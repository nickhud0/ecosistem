/**
 * Fila Offline Local para alta resiliência a oscilações de Wi-Fi e rede móvel.
 * Armazena operações no localStorage e gerencia retentativas automáticas.
 */

export interface OfflineAction {
  id: string;
  type:
    | "OPEN_TABLE"
    | "ADD_ITEMS"
    | "SEND_KITCHEN"
    | "REMOVE_ITEM"
    | "TRANSFER_TABLE"
    | "CHECKOUT";
  payload: any;
  timestamp: number;
  attempts: number;
}

const STORAGE_QUEUE_KEY = "fluxo_pos_offline_queue_v1";

export function getOfflineQueue(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: OfflineAction[]): void {
  try {
    localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("[OfflineQueue Save Error]:", err);
  }
}

export function enqueueOfflineAction(
  type: OfflineAction["type"],
  payload: any
): OfflineAction {
  const action: OfflineAction = {
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    timestamp: Date.now(),
    attempts: 0,
  };

  const current = getOfflineQueue();
  current.push(action);
  saveOfflineQueue(current);
  notifyQueueSubscribers(current.length);
  return action;
}

export function removeOfflineAction(id: string): void {
  const current = getOfflineQueue();
  const next = current.filter((item) => item.id !== id);
  saveOfflineQueue(next);
  notifyQueueSubscribers(next.length);
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(STORAGE_QUEUE_KEY);
  notifyQueueSubscribers(0);
}

// Assinantes do tamanho da fila para feedback visual no Header
type QueueListener = (pendingCount: number) => void;
const queueListeners: Set<QueueListener> = new Set();

export function subscribeQueue(callback: QueueListener): () => void {
  queueListeners.add(callback);
  callback(getOfflineQueue().length);
  return () => {
    queueListeners.delete(callback);
  };
}

function notifyQueueSubscribers(count: number) {
  queueListeners.forEach((fn) => {
    try {
      fn(count);
    } catch {
      // Ignora erro no subscriber
    }
  });
}
