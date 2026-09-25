import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import initSql from "./migrations/0000_init.sql?raw";
import { runSeed } from "./seed";

const DB_FILENAME = "sqlite:pos_data.db";

let dbClient: Database | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Verifica se a aplicação está rodando dentro da janela nativa do Tauri.
 */
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

/**
 * Retorna ou inicializa a conexão nativa com o banco SQLite via Tauri.
 */
export async function getDbClient(): Promise<Database | null> {
  if (!isTauri()) {
    return null;
  }
  if (!dbClient) {
    dbClient = await Database.load(DB_FILENAME);
    // Configurações de alta velocidade e baixa latência de I/O para SQLite
    try {
      await dbClient.execute("PRAGMA journal_mode = WAL;");
      await dbClient.execute("PRAGMA synchronous = NORMAL;");
      await dbClient.execute("PRAGMA cache_size = -32000;");
      await dbClient.execute("PRAGMA temp_store = MEMORY;");
    } catch (pragmaErr) {
      console.warn("[Database]: Aviso ao configurar PRAGMAs do SQLite:", pragmaErr);
    }
  }
  return dbClient;
}

const columnCache = new Map<string, string[] | null>();

/**
 * Extrai a lista ordenada de colunas do SELECT ou RETURNING gerado pelo Drizzle,
 * com cache em memória para evitar repetição de regex em consultas frequentes.
 */
export function extractColumnNames(sql: string): string[] | null {
  const cached = columnCache.get(sql);
  if (cached !== undefined) return cached;

  let clause: string | undefined;
  const selectMatch = sql.match(/^\s*select\s+([\s\S]+?)\s+from\b/i);
  if (selectMatch?.[1]) {
    clause = selectMatch[1];
  } else {
    const returningMatch = sql.match(/\breturning\s+([\s\S]+)$/i);
    if (returningMatch?.[1]) {
      clause = returningMatch[1];
    }
  }
  if (!clause) {
    if (columnCache.size > 250) columnCache.clear();
    columnCache.set(sql, null);
    return null;
  }

  const columns: string[] = [];
  let current = "";
  let parenDepth = 0;
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < clause.length; i++) {
    const char = clause[i];
    if ((char === '"' || char === "'") && (i === 0 || clause[i - 1] !== "\\")) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (quoteChar === char) {
        inQuotes = false;
      }
      current += char;
    } else if (char === "(" && !inQuotes) {
      parenDepth++;
      current += char;
    } else if (char === ")" && !inQuotes) {
      parenDepth--;
      current += char;
    } else if (char === "," && parenDepth === 0 && !inQuotes) {
      columns.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    columns.push(current.trim());
  }

  const result = columns.map((col) => {
    const asMatch = col.match(/\s+as\s+["`']?([^"`'\s]+)["`']?$/i);
    if (asMatch?.[1]) return asMatch[1];
    const dotMatch = col.match(/\.["`']?([^"`']+?)["`']?$/);
    if (dotMatch?.[1]) return dotMatch[1];
    return col.replace(/^["`']|["`']$/g, "");
  });

  if (columnCache.size > 250) columnCache.clear();
  columnCache.set(sql, result);
  return result;
}

/**
 * Instância do Drizzle ORM adaptada para o driver SQLite do Tauri
 */
export const db = drizzle(
  async (sql, params, method) => {
    try {
      const client = await getDbClient();
      if (!client) {
        return { rows: [] };
      }
      if (method === "all" || method === "values") {
        const rawRows = await client.select<Record<string, unknown>[]>(sql, params);
        const cols = extractColumnNames(sql);
        const rows: unknown[][] = rawRows.map((r) =>
          cols ? cols.map((c) => (r[c] !== undefined ? r[c] : null)) : Object.values(r),
        );
        return { rows };
      } else if (method === "get") {
        const rawRows = await client.select<Record<string, unknown>[]>(sql, params);
        const cols = extractColumnNames(sql);
        const first = rawRows[0];
        const row = first
          ? cols
            ? cols.map((c) => (first[c] !== undefined ? first[c] : null))
            : Object.values(first)
          : undefined;
        return { rows: row as unknown as unknown[] };
      } else {
        await client.execute(sql, params);
        return { rows: [] };
      }
    } catch (error) {
      console.error("[Database Proxy Error]:", error, { sql, params });
      throw error;
    }
  },
  { schema },
);

/**
 * Analisa e extrai instruções SQL puras, removendo comentários inline e de linha inteira
 */
export function parseSqlStatements(rawSql: string): string[] {
  const sqlWithoutComments = rawSql
    .split("\n")
    .map((line) => {
      const commentIndex = line.indexOf("--");
      return commentIndex >= 0 ? line.slice(0, commentIndex) : line;
    })
    .join("\n");

  return sqlWithoutComments
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Tabelas gerenciadas pelo sistema para verificação de colunas de sincronização.
 */
const ALL_TABLE_NAMES = [
  "users",
  "cash_shifts",
  "cash_movements",
  "product_categories",
  "products",
  "modifier_groups",
  "product_modifiers",
  "customers",
  "dining_tables",
  "orders",
  "delivery_orders",
  "order_items",
  "sales",
  "payments",
  "app_settings",
  "couriers",
  "customer_transactions",
];

/**
 * Garante que a tabela customer_transactions e novas colunas de clientes existam.
 */
async function ensureFiadoTables(client: Database): Promise<void> {
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS customer_transactions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        balance_after REAL NOT NULL,
        payment_method TEXT,
        sale_id TEXT REFERENCES sales(id),
        order_id TEXT REFERENCES orders(id),
        shift_id TEXT REFERENCES cash_shifts(id),
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        is_synced INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT
      );
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer ON customer_transactions(customer_id);
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_customer_transactions_created ON customer_transactions(created_at);
    `);

    // Verifica se updated_at existe em customer_transactions (bancos existentes)
    const txCols = await client.select<{ name: string }[]>(`PRAGMA table_info("customer_transactions")`);
    const hasUpdatedAt = txCols.some((c) => c.name && c.name.toLowerCase() === "updated_at");
    if (!hasUpdatedAt) {
      await client.execute(`ALTER TABLE "customer_transactions" ADD COLUMN updated_at TEXT;`);
    }

    // Verifica se notes e is_blocked existem em customers
    const customerCols = await client.select<{ name: string }[]>(`PRAGMA table_info("customers")`);
    const hasNotes = customerCols.some((c) => c.name && c.name.toLowerCase() === "notes");
    if (!hasNotes) {
      await client.execute(`ALTER TABLE "customers" ADD COLUMN notes TEXT;`);
    }
    const hasBlocked = customerCols.some((c) => c.name && c.name.toLowerCase() === "is_blocked");
    if (!hasBlocked) {
      await client.execute(`ALTER TABLE "customers" ADD COLUMN is_blocked INTEGER DEFAULT 0;`);
    }

    // Verifica se change_amount existe em payments
    const payCols = await client.select<{ name: string }[]>(`PRAGMA table_info("payments")`);
    if (payCols.length > 0 && !payCols.some((c) => c.name && c.name.toLowerCase() === "change_amount")) {
      await client.execute(`ALTER TABLE "payments" ADD COLUMN change_amount REAL DEFAULT 0;`);
    }

    // Verifica se credit_customer_id e courtesy_reason existem em sales
    const saleCols = await client.select<{ name: string }[]>(`PRAGMA table_info("sales")`);
    if (saleCols.length > 0) {
      if (!saleCols.some((c) => c.name && c.name.toLowerCase() === "credit_customer_id")) {
        await client.execute(`ALTER TABLE "sales" ADD COLUMN credit_customer_id TEXT;`);
      }
      if (!saleCols.some((c) => c.name && c.name.toLowerCase() === "courtesy_reason")) {
        await client.execute(`ALTER TABLE "sales" ADD COLUMN courtesy_reason TEXT;`);
      }
    }
  } catch (err) {
    console.error("[Database Migration Error]: Falha ao garantir tabela/colunas de fiado:", err);
  }
}

/**
 * Garante de forma idempotente que a coluna is_synced e seu respectivo índice existam
 * em todas as tabelas, permitindo upgrade transparente de bancos SQLite pré-existentes.
 */
async function ensureSyncColumns(client: Database): Promise<void> {
  for (const table of ALL_TABLE_NAMES) {
    try {
      // 1. Verifica se a tabela existe no SQLite
      const tables = await client.select<{ name: string }[]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        [table],
      );
      if (!tables || tables.length === 0) {
        continue;
      }

      // 2. Inspeciona as colunas da tabela existente
      const columns = await client.select<{ name: string }[]>(`PRAGMA table_info("${table}")`);
      const hasSyncedCol = columns.some((c) => c.name && c.name.toLowerCase() === "is_synced");

      if (!hasSyncedCol) {
        await client.execute(
          `ALTER TABLE "${table}" ADD COLUMN is_synced INTEGER NOT NULL DEFAULT 0`,
        );
        console.info(`[Database Migration]: Coluna 'is_synced' adicionada à tabela '${table}'.`);
      }

      // 3. Garante criação de índice para consultas de sincronização de alta velocidade
      await client.execute(
        `CREATE INDEX IF NOT EXISTS "idx_${table}_is_synced" ON "${table}" (is_synced)`,
      );
    } catch (err) {
      console.error(
        `[Database Migration Error]: Falha ao verificar/adicionar 'is_synced' na tabela '${table}':`,
        err,
      );
    }
  }
}

/**
 * Sanitiza identificadores legados (strings curtas tipo "307ft461")
 * convertendo-os em UUIDs v4 válidos e limpando chaves estrangeiras com sintaxe inválida.
 */
async function sanitizeLegacyUuids(client: Database): Promise<void> {
  try {
    // 1. Corrige IDs legados na tabela order_items
    const invalidItems = await client.select<{ id: string }[]>(
      "SELECT id FROM order_items WHERE length(id) < 32",
    );
    if (invalidItems && invalidItems.length > 0) {
      console.info(
        `[Database Migration]: Corrigindo ${invalidItems.length} IDs legados na tabela 'order_items'...`,
      );
      for (const item of invalidItems) {
        const newUuid = crypto.randomUUID();
        await client.execute("UPDATE order_items SET id = ?, is_synced = 0 WHERE id = ?", [
          newUuid,
          item.id,
        ]);
      }
    }

    // 2. Corrige referências de product_id inválidas em order_items
    const invalidProductRefs = await client.select<{ id: string; product_id: string }[]>(
      "SELECT id, product_id FROM order_items WHERE product_id IS NOT NULL AND length(product_id) < 32",
    );
    if (invalidProductRefs && invalidProductRefs.length > 0) {
      console.info(
        `[Database Migration]: Limpando ${invalidProductRefs.length} referências 'product_id' inválidas em 'order_items'...`,
      );
      for (const item of invalidProductRefs) {
        await client.execute(
          "UPDATE order_items SET product_id = NULL, is_synced = 0 WHERE id = ?",
          [item.id],
        );
      }
    }
  } catch (err) {
    console.error("[Database Migration Error]: Falha ao sanitizar UUIDs legados:", err);
  }
}

/**
 * Executa as migrações DDL e o seed inicial da base de dados SQLite local
 */
export async function initDatabase(): Promise<void> {
  try {
    const client = await getDbClient();
    if (!client) {
      console.warn(
        "[Database]: Ambiente web/navegador detectado. O SQLite nativo do Tauri não está disponível nesta janela.",
      );
      return;
    }

    // 1. Atualiza imediatamente tabelas já existentes que estejam sem a coluna is_synced
    await ensureSyncColumns(client);

    // 2. Executa as instruções DDL de criação de tabelas
    const statements = parseSqlStatements(initSql);

    for (const statement of statements) {
      try {
        await client.execute(statement);
      } catch (stmtError) {
        console.warn(`[Database DDL Warning]: Instrução DDL ignorada ou já aplicada:`, stmtError);
      }
    }

    // 3. Garante que tabelas recém-criadas ou existentes tenham a coluna e índice
    await ensureSyncColumns(client);

    // 4. Garante criação da tabela de fiado e colunas adicionais de cliente
    await ensureFiadoTables(client);

    // 5. Sanitiza UUIDs legados (ex: IDs gerados por Math.random())
    await sanitizeLegacyUuids(client);

    console.info(
      `[Database]: Migração DDL executada com sucesso (${statements.length} instruções).`,
    );

    // 4. Executa o seed de dados caso o banco esteja vazio
    await runSeed(client);

    // 5. Limpa status e garçons residuais de mesas sem pedidos ativos
    try {
      await client.execute(`
        UPDATE dining_tables 
        SET status = 'livre', opened_at = NULL, waiter = 'Equipe' 
        WHERE id NOT IN (
          SELECT DISTINCT table_id FROM orders 
          WHERE type = 'table' AND status = 'open' AND deleted_at IS NULL AND table_id IS NOT NULL
        )
      `);
      await client.execute(`
        UPDATE dining_tables
        SET waiter = 'Equipe'
        WHERE waiter = 'Diego' OR status = 'livre'
      `);
    } catch {
      // Ignora caso tabelas ainda estejam vazias
    }
  } catch (error) {
    console.error("[Database Init Error]: Falha ao inicializar banco de dados SQLite:", error);
    initPromise = null;
    throw error;
  }
}

/**
 * Garante que a inicialização do banco ocorra antes de qualquer consulta,
 * prevenindo condições de corrida na montagem dos componentes.
 */
export function ensureDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = initDatabase();
  }
  return initPromise;
}

/**
 * Helpers para criação de registros com regras Offline-First
 */
export const dbHelpers = {
  uuid: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};
