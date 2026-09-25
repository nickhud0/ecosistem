import { eq, inArray, isNull, or } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { db, isTauri } from "@/database/db";
import {
  appSettings,
  cashMovements,
  cashShifts,
  couriers,
  customers,
  customerTransactions,
  deliveryOrders,
  diningTables,
  modifierGroups,
  orderItems,
  orders,
  payments,
  productCategories,
  productModifiers,
  products,
  sales,
  users,
} from "@/database/schema";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";

/**
 * Interface para tabelas SQLite com colunas de sincronização e identificador UUID.
 */
interface SyncableTable extends SQLiteTable {
  id: SQLiteColumn;
  is_synced: SQLiteColumn;
}

interface SyncableRow {
  id: string;
  is_synced?: boolean | null;
  [key: string]: unknown;
}

interface TableSyncEntry {
  name: string;
  table: SyncableTable;
}

/**
 * Ordem topológica estrita de sincronização para garantir integridade referencial (Foreign Keys):
 * 1. Tabelas independentes (Nível 0)
 * 2. Tabelas dependentes de Nível 0 (Nível 1)
 * 3. Tabelas dependentes de Nível 1 (Nível 2)
 * 4. Tabelas dependentes de Nível 2 (Nível 3)
 * 5. Tabelas folha (Nível 4)
 */
const SYNC_TABLES: TableSyncEntry[] = [
  // Nível 0: Sem chaves estrangeiras
  { name: "users", table: users as unknown as SyncableTable },
  { name: "couriers", table: couriers as unknown as SyncableTable },
  { name: "product_categories", table: productCategories as unknown as SyncableTable },
  { name: "modifier_groups", table: modifierGroups as unknown as SyncableTable },
  { name: "customers", table: customers as unknown as SyncableTable },
  { name: "dining_tables", table: diningTables as unknown as SyncableTable },
  { name: "app_settings", table: appSettings as unknown as SyncableTable },

  // Nível 1: Dependências de Nível 0
  { name: "products", table: products as unknown as SyncableTable },
  { name: "product_modifiers", table: productModifiers as unknown as SyncableTable },
  { name: "cash_shifts", table: cashShifts as unknown as SyncableTable },

  // Nível 2: Movimentações e Pedidos
  { name: "cash_movements", table: cashMovements as unknown as SyncableTable },
  { name: "orders", table: orders as unknown as SyncableTable },

  // Nível 3: Detalhes do pedido e Vendas
  { name: "delivery_orders", table: deliveryOrders as unknown as SyncableTable },
  { name: "order_items", table: orderItems as unknown as SyncableTable },
  { name: "sales", table: sales as unknown as SyncableTable },

  // Nível 4: Pagamentos e Transações Financeiras (vinculados a sales, orders e customers)
  { name: "payments", table: payments as unknown as SyncableTable },
  { name: "customer_transactions", table: customerTransactions as unknown as SyncableTable },
];

/**
 * Tabelas mestre de cadastros elegíveis para sincronização reversa (Supabase -> Local)
 */
const INBOUND_TABLES: TableSyncEntry[] = [
  { name: "product_categories", table: productCategories as unknown as SyncableTable },
  { name: "modifier_groups", table: modifierGroups as unknown as SyncableTable },
  { name: "products", table: products as unknown as SyncableTable },
  { name: "product_modifiers", table: productModifiers as unknown as SyncableTable },
  { name: "customers", table: customers as unknown as SyncableTable },
  { name: "couriers", table: couriers as unknown as SyncableTable },
  { name: "dining_tables", table: diningTables as unknown as SyncableTable },
  { name: "orders", table: orders as unknown as SyncableTable },
  { name: "order_items", table: orderItems as unknown as SyncableTable },
  { name: "app_settings", table: appSettings as unknown as SyncableTable },
];

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  totalSyncedInLastRun: number;
}

const statusState: SyncStatus = {
  isSyncing: false,
  lastSyncAt: null,
  lastError: null,
  totalSyncedInLastRun: 0,
};

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let isSyncRunning = false;
let isOnlineListenerAttached = false;

/**
 * Retorna o status atual do motor de sincronização.
 */
export function getSyncStatus(): Readonly<SyncStatus> {
  return { ...statusState };
}

/**
 * Retorna o total de registros locais com sincronização pendente (is_synced = false ou null).
 */
export async function getPendingSyncCount(): Promise<number> {
  if (!isTauri()) {
    return 0;
  }
  try {
    let total = 0;
    for (const { table } of SYNC_TABLES) {
      const pendingRows = (await db
        .select({ id: table.id })
        .from(table)
        .where(or(eq(table.is_synced, false), isNull(table.is_synced)))) as { id: string }[];
      total += pendingRows.length;
    }
    return total;
  } catch (err) {
    console.error("[Sync Service]: Erro ao obter contagem de pendências:", err);
    return 0;
  }
}

/**
 * Testa conectividade e autenticação com o Supabase.
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
}> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message:
        "Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.",
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: "Falha ao inicializar o cliente Supabase.",
    };
  }

  const start = Date.now();
  try {
    const { error } = await client
      .from("app_settings")
      .select("id", { count: "exact", head: true });
    const latencyMs = Date.now() - start;

    if (error) {
      return {
        success: false,
        message: `Erro retornado pelo Supabase: ${error.message}${error.hint ? ` (${error.hint})` : ""}`,
        latencyMs,
      };
    }

    return {
      success: true,
      message: `Conexão bem-sucedida! Latência de resposta: ${latencyMs}ms`,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs,
    };
  }
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(val: unknown): boolean {
  return typeof val === "string" && UUID_V4_REGEX.test(val);
}

/**
 * Sincroniza um lote de registros de uma tabela específica para a nuvem (Outbound: Local -> Supabase).
 * Retorna a quantidade de registros sincronizados com sucesso.
 */
async function syncTableBatch(
  tableName: string,
  table: SyncableTable,
  batchSize = 50,
): Promise<number> {
  try {
    // 1. Busca registros pendentes de sincronização (is_synced = false ou is_synced IS NULL)
    const pendingRows = (await db
      .select()
      .from(table)
      .where(or(eq(table.is_synced, false), isNull(table.is_synced)))
      .limit(batchSize)) as SyncableRow[];

    if (!pendingRows || pendingRows.length === 0) {
      return 0;
    }

    const client = getSupabaseClient();
    if (!client) {
      return 0;
    }

    // 2. Auto-recuperação: sanitiza identificadores e chaves legadas que não cumpram padrão UUID v4
    for (const row of pendingRows) {
      if (!isValidUuid(row.id)) {
        const newUuid = crypto.randomUUID();
        try {
          await db.update(table).set({ id: newUuid }).where(eq(table.id, row.id));
        } catch (updateErr) {
          console.warn(`[Sync Worker]: Falha ao atualizar ID legado no SQLite:`, updateErr);
        }
        row.id = newUuid;
      }

      // Sanitiza chaves estrangeiras com sintaxe inválida para tipos UUID no PostgreSQL
      const nullableFkColumns = [
        "product_id",
        "customer_id",
        "credit_customer_id",
        "table_id",
        "category_id",
        "group_id",
        "shift_id",
        "sale_id",
        "order_id",
      ];
      for (const fk of nullableFkColumns) {
        if (row[fk] !== undefined && row[fk] !== null && !isValidUuid(row[fk])) {
          try {
            await db
              .update(table)
              .set({ [fk]: null } as unknown as Partial<SyncableRow>)
              .where(eq(table.id, row.id));
          } catch {
            // Ignora se coluna não existir na tabela
          }
          row[fk] = null;
        }
      }
    }

    // 3. Prepara os dados para envio à Supabase garantindo is_synced: true no espelho
    const payload = pendingRows.map((row) => ({
      ...row,
      is_synced: true,
    }));

    // 4. Upsert idempotente no Supabase baseado na chave primária 'id' (UUID)
    const { error } = await client.from(tableName).upsert(payload, { onConflict: "id" });

    if (error) {
      const isMissingTable =
        error.message?.includes("does not exist") ||
        error.code === "42P01" ||
        error.code === "PGRST204" ||
        error.code === "PGRST200";

      if (isMissingTable) {
        console.warn(
          `[Sync Worker]: A tabela '${tableName}' ainda não foi criada no Supabase. ` +
            `Execute a migration 'supabase/migrations/20260925120000_add_fiado_customer_transactions.sql' no painel do Supabase. Ignorando sincronização remota desta tabela por enquanto.`,
        );
        return 0;
      }

      console.error(
        `[Sync Worker Error]: Falha ao sincronizar lote da tabela '${tableName}':`,
        error.message,
        error.details,
      );
      statusState.lastError = `Tabela ${tableName}: ${error.message}`;
      return 0;
    }

    // 5. Em caso de sucesso na Supabase, marca os registros locais como sincronizados
    const syncedIds: string[] = pendingRows
      .map((r) => r.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (syncedIds.length > 0) {
      await db.update(table).set({ is_synced: true }).where(inArray(table.id, syncedIds));
    }

    return syncedIds.length;
  } catch (err) {
    console.error(`[Sync Worker Error]: Exceção ao sincronizar tabela '${tableName}':`, err);
    statusState.lastError = err instanceof Error ? err.message : String(err);
    return 0;
  }
}

/**
 * Puxa alterações de cadastros do Supabase para o banco local (Inbound: Supabase -> Local).
 */
async function pullTableBatch(
  tableName: string,
  table: SyncableTable,
  sinceIsoString?: string | null,
): Promise<number> {
  const client = getSupabaseClient();
  if (!client) return 0;

  try {
    let query = client.from(tableName).select("*");
    if (sinceIsoString) {
      query = query.gt("updated_at", sinceIsoString);
    }
    const { data, error } = await query.limit(50);
    if (error || !data || data.length === 0) {
      return 0;
    }

    let pulledCount = 0;
    for (const remoteRow of data) {
      if (!remoteRow || !remoteRow.id) continue;

      // Verifica se o registro já existe localmente
      const local = (await db
        .select()
        .from(table)
        .where(eq(table.id, remoteRow.id))
        .limit(1)) as SyncableRow[];

      // Se houver alteração pendente local (não sincronizada), preserva a versão local offline-first
      const firstLocal = local[0];
      if (firstLocal && (firstLocal.is_synced === false || firstLocal.is_synced === null)) {
        continue;
      }

      // Prepara payload local com flag is_synced: true para não gerar loop reverso
      const { is_synced: _, ...remoteFields } = remoteRow;
      const localPayload = {
        ...remoteFields,
        is_synced: true,
      };

      if (local.length > 0) {
        await db.update(table).set(localPayload).where(eq(table.id, remoteRow.id));
      } else {
        await db.insert(table).values(localPayload);
      }
      pulledCount++;
    }
    return pulledCount;
  } catch (err) {
    console.error(`[Sync Worker Error]: Falha no pull da tabela '${tableName}':`, err);
    return 0;
  }
}

/**
 * Puxa todas as alterações de tabelas de cadastros e configurações do Supabase.
 */
export async function pullFromSupabase(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return 0;
  }
  if (!isSupabaseConfigured() || !isTauri()) {
    return 0;
  }

  let totalPulled = 0;
  for (const { name, table } of INBOUND_TABLES) {
    const pulled = await pullTableBatch(name, table, statusState.lastSyncAt);
    totalPulled += pulled;
  }
  return totalPulled;
}

/**
 * Executa um ciclo completo de sincronização bidirecional (Push local -> Nuvem e Pull cadastros Nuvem -> Local).
 */
export async function triggerSync(): Promise<{
  pushed: number;
  pulled: number;
  error: string | null;
}> {
  // 1. Valida conectividade com a internet
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { pushed: 0, pulled: 0, error: "Dispositivo sem conexão com a internet." };
  }

  // 2. Valida se a Supabase está configurada
  if (!isSupabaseConfigured()) {
    return {
      pushed: 0,
      pulled: 0,
      error:
        "Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.",
    };
  }

  // 3. Valida se estamos rodando em ambiente nativo com SQLite do Tauri
  if (!isTauri()) {
    return { pushed: 0, pulled: 0, error: null };
  }

  // 4. Previne execuções concorrentes (concurrency lock)
  if (isSyncRunning) {
    return { pushed: 0, pulled: 0, error: "Sincronização já em andamento." };
  }

  isSyncRunning = true;
  statusState.isSyncing = true;
  statusState.lastError = null;

  let totalSynced = 0;
  let totalPulled = 0;

  try {
    // 5. Outbound: envia registros pendentes locais para o Supabase
    for (const { name, table } of SYNC_TABLES) {
      let hasMore = true;
      let tableCycle = 0;
      const MAX_BATCHES_PER_TABLE = 5; // Limite de 250 registros por tabela por ciclo

      while (hasMore && tableCycle < MAX_BATCHES_PER_TABLE) {
        const syncedCount = await syncTableBatch(name, table, 50);
        totalSynced += syncedCount;

        if (syncedCount < 50) {
          hasMore = false;
        }
        tableCycle++;
      }
    }

    // 6. Inbound: puxa cadastros e parâmetros atualizados da nuvem
    totalPulled = await pullFromSupabase();

    statusState.lastSyncAt = new Date().toISOString();
    statusState.totalSyncedInLastRun = totalSynced;

    if (totalSynced > 0 || totalPulled > 0) {
      console.info(
        `[Sync Worker]: Ciclo concluído. ${totalSynced} enviado(s), ${totalPulled} recebido(s) do Supabase.`,
      );
    }
  } catch (err) {
    console.error("[Sync Worker Error]: Erro crítico durante ciclo de sincronização:", err);
    statusState.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    isSyncRunning = false;
    statusState.isSyncing = false;
  }

  // Notifica componentes e stores quando houver registros puxados da nuvem
  notifySyncEventListeners({ pushed: totalSynced, pulled: totalPulled, error: statusState.lastError });

  return { pushed: totalSynced, pulled: totalPulled, error: statusState.lastError };
}

export type SyncEventListener = (event: { pushed: number; pulled: number; error: string | null }) => void;
const syncEventListeners = new Set<SyncEventListener>();

export function onSyncEvent(listener: SyncEventListener): () => void {
  syncEventListeners.add(listener);
  return () => syncEventListeners.delete(listener);
}

function notifySyncEventListeners(data: { pushed: number; pulled: number; error: string | null }) {
  syncEventListeners.forEach((listener) => {
    try {
      listener(data);
    } catch {
      // Ignora erro em listener desmontado
    }
  });
}

let immediateSyncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Solicita uma sincronização imediata em segundo plano com debounce.
 * Garante que alterações em mesas e comandas reflitam na nuvem e maquininha em sub-segundos.
 */
export function requestImmediateSync(delayMs = 400) {
  if (immediateSyncTimer) {
    clearTimeout(immediateSyncTimer);
  }
  immediateSyncTimer = setTimeout(() => {
    triggerSync().catch((err) => {
      console.warn("[Sync Worker]: Falha na sincronização imediata:", err);
    });
  }, delayMs);
}

/**
 * Listener acionado quando o dispositivo volta a ter conectividade de rede.
 */
function handleOnline() {
  console.info(
    "[Sync Worker]: Conexão com a internet restabelecida. Disparando sincronização imediata...",
  );
  triggerSync().catch((err) => {
    console.error("[Sync Worker Error]: Erro ao sincronizar após evento online:", err);
  });
}

let pdvRealtimeChannel: any = null;

/**
 * Inicializa o motor de sincronização em segundo plano.
 *
 * @param intervalMs Intervalo de checagem em milissegundos (padrão: 30 segundos).
 * @returns Função de cleanup para parar o worker.
 */
export function startSyncWorker(intervalMs = 30_000): () => void {
  // Evita múltiplos timers ativos em caso de chamadas duplicadas
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }

  // Escuta retorno de conexão de rede no ambiente do navegador/Tauri
  if (typeof window !== "undefined" && !isOnlineListenerAttached) {
    window.addEventListener("online", handleOnline);
    isOnlineListenerAttached = true;
  }

  // Se o Supabase estiver configurado, escuta alterações remotas de mesas e pedidos em tempo real
  if (isSupabaseConfigured()) {
    const client = getSupabaseClient();
    if (client && !pdvRealtimeChannel) {
      try {
        pdvRealtimeChannel = client
          .channel("pdv-harmony-realtime-listener")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "dining_tables" },
            () => {
              requestImmediateSync(250);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "orders" },
            () => {
              requestImmediateSync(250);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "order_items" },
            () => {
              requestImmediateSync(250);
            },
          )
          .subscribe();
      } catch (err) {
        console.warn("[Sync Worker]: Falha ao registrar canal Realtime:", err);
      }
    }
  }

  // Executa uma sincronização inicial após breve espera para garantir DB pronto
  const initialTimeout = setTimeout(() => {
    triggerSync().catch((err) => {
      console.error("[Sync Worker Error]: Falha na sincronização inicial:", err);
    });
  }, 3_000);

  // Agenda as execuções periódicas
  syncIntervalId = setInterval(() => {
    triggerSync().catch((err) => {
      console.error("[Sync Worker Error]: Falha na sincronização agendada:", err);
    });
  }, intervalMs);

  console.info(
    `[Sync Worker]: Motor de sincronização em segundo plano iniciado (intervalo: ${intervalMs / 1000}s).`,
  );

  return () => {
    clearTimeout(initialTimeout);
    stopSyncWorker();
  };
}

/**
 * Para o motor de sincronização e remove event listeners.
 */
export function stopSyncWorker(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.info("[Sync Worker]: Motor de sincronização parado.");
  }

  if (typeof window !== "undefined" && isOnlineListenerAttached) {
    window.removeEventListener("online", handleOnline);
    isOnlineListenerAttached = false;
  }

  if (pdvRealtimeChannel && isSupabaseConfigured()) {
    const client = getSupabaseClient();
    if (client) {
      try {
        client.removeChannel(pdvRealtimeChannel);
      } catch {
        // Ignora
      }
    }
    pdvRealtimeChannel = null;
  }
}
