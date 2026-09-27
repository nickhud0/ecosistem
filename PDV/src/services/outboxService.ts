/**
 * Serviço de Gerenciamento da Outbox e Inbox Locais do PDV Desktop
 * Garante persistência ACID imediata de mutações e Exactly-Once Processing.
 */

import { eq } from "drizzle-orm";
import { db, isTauri } from "@/database/db";
import { inboxEvents, outboxEvents } from "@/database/schema";
import type { MutationEvent } from "@/lib/sync-events";

/**
 * Grava um evento de mutação gerado localmente na Outbox do SQLite
 */
export async function dispatchOutboxEvent(event: MutationEvent): Promise<boolean> {
  if (!isTauri()) {
    return true;
  }

  try {
    const payloadStr = typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload);

    await db.insert(outboxEvents).values({
      event_id: event.event_id,
      store_id: event.store_id,
      device_id: event.device_id,
      device_sequence: event.device_sequence,
      event_type: event.event_type,
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      payload: payloadStr,
      client_timestamp: event.client_timestamp,
      target_hub_sent: true, // No PDV Caixa que hospeda o Hub, já está no nó central local
      target_cloud_sent: false,
      retry_count: 0,
      last_error: null,
      created_at: new Date().toISOString(),
    });

    return true;
  } catch (err) {
    console.error("[OutboxService Error]: Falha ao gravar evento na outbox:", err);
    return false;
  }
}

/**
 * Valida na Inbox se o evento já foi processado anteriormente (Deduplicação Idempotente)
 * Retorna true se for um evento inédito, ou false se já tiver sido processado.
 */
export async function checkAndRecordInbox(event: MutationEvent): Promise<boolean> {
  if (!isTauri()) {
    return true;
  }

  try {
    const existing = await db
      .select({ event_id: inboxEvents.event_id })
      .from(inboxEvents)
      .where(eq(inboxEvents.event_id, event.event_id))
      .limit(1);

    if (existing.length > 0) {
      // Duplicação detectada!
      return false;
    }

    await db.insert(inboxEvents).values({
      event_id: event.event_id,
      device_id: event.device_id,
      device_sequence: event.device_sequence,
      event_type: event.event_type,
      processed_at: new Date().toISOString(),
    });

    return true;
  } catch (err) {
    console.error("[OutboxService Error]: Falha ao registrar na inbox:", err);
    return false;
  }
}
