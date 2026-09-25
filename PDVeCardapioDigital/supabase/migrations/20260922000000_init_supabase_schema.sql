-- ============================================================================
-- FLUXO PDV - SUPABASE POSTGRESQL SCHEMA (16 TABELAS)
-- Esquema relacional completo espelho para sincronização bidirecional do PDV
-- Todas as PKs são UUID geradas no cliente (TEXT)
-- Suporte a RLS com políticas abertas para anon e authenticated
-- ============================================================================

-- 1. Usuários / Operadores / Garçons
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    pin TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    active BOOLEAN NOT NULL DEFAULT true,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_pin ON users (pin);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 2. Entregadores / Motoboys
CREATE TABLE IF NOT EXISTS couriers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_couriers_is_active ON couriers (is_active);

-- 3. Categorias de Produtos
CREATE TABLE IF NOT EXISTS product_categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- 4. Grupos de Modificadores (Exclusões, Adicionais, Sabores)
CREATE TABLE IF NOT EXISTS modifier_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    min_selectable INTEGER NOT NULL DEFAULT 0,
    max_selectable INTEGER NOT NULL DEFAULT 0,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- 5. Clientes (Balcão, Delivery e Fiado / A Prazo)
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    email TEXT,
    cpf TEXT,
    credit_limit DOUBLE PRECISION DEFAULT 0,
    balance_due DOUBLE PRECISION DEFAULT 0,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers (cpf);

-- 6. Mesas do Salão
CREATE TABLE IF NOT EXISTS dining_tables (
    id TEXT PRIMARY KEY NOT NULL,
    number INTEGER NOT NULL UNIQUE,
    seats INTEGER NOT NULL DEFAULT 4,
    status TEXT NOT NULL DEFAULT 'livre',
    waiter TEXT NOT NULL DEFAULT 'Equipe',
    opened_at TEXT,
    discount_type TEXT,
    discount_amount DOUBLE PRECISION,
    merged_with TEXT,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dining_tables_status ON dining_tables (status);

-- 7. Configurações Globais / PDV
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY NOT NULL,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings (key);

-- 8. Produtos do Cardápio
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT REFERENCES product_categories(id) ON DELETE SET NULL,
    category_name TEXT NOT NULL,
    name TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    emoji TEXT NOT NULL,
    sold_out BOOLEAN NOT NULL DEFAULT false,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_sold_out ON products (sold_out);

-- 9. Modificadores / Adicionais / Ingredientes
CREATE TABLE IF NOT EXISTS product_modifiers (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL DEFAULT 0,
    available BOOLEAN NOT NULL DEFAULT true,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_modifiers_group ON product_modifiers (group_id);

-- 10. Turnos de Caixa
CREATE TABLE IF NOT EXISTS cash_shifts (
    id TEXT PRIMARY KEY NOT NULL,
    operator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    operator_name TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    opening_float DOUBLE PRECISION NOT NULL DEFAULT 0,
    closing_counted DOUBLE PRECISION,
    closing_expected DOUBLE PRECISION,
    closing_difference DOUBLE PRECISION,
    closing_notes TEXT,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts (status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_operator ON cash_shifts (operator_id);

-- 11. Movimentações de Caixa (Suprimento / Sangria)
CREATE TABLE IF NOT EXISTS cash_movements (
    id TEXT PRIMARY KEY NOT NULL,
    shift_id TEXT REFERENCES cash_shifts(id) ON DELETE CASCADE,
    operator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    reason TEXT NOT NULL,
    at TEXT NOT NULL,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements (shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements (type);

-- 12. Comandas e Pedidos Unificados (Mesa, Balcão, Delivery)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL,
    table_id TEXT REFERENCES dining_tables(id) ON DELETE SET NULL,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT,
    operator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    shift_id TEXT REFERENCES cash_shifts(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open',
    subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
    service_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
    tip DOUBLE PRECISION NOT NULL DEFAULT 0,
    discount DOUBLE PRECISION NOT NULL DEFAULT 0,
    total DOUBLE PRECISION NOT NULL DEFAULT 0,
    notes TEXT,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_table ON orders (table_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_shift ON orders (shift_id);

-- 13. Pedidos Delivery Omnichannel
CREATE TABLE IF NOT EXISTS delivery_orders (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'novos',
    bairro TEXT NOT NULL,
    delivery_address TEXT,
    courier TEXT,
    accepted BOOLEAN NOT NULL DEFAULT false,
    estimated_delivery_time TEXT,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_stage ON delivery_orders (stage);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_source ON delivery_orders (source);

-- 14. Itens dos Pedidos / Comandas
CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    qty DOUBLE PRECISION NOT NULL DEFAULT 1,
    unit_price DOUBLE PRECISION NOT NULL,
    total_price DOUBLE PRECISION NOT NULL,
    details TEXT,
    notes TEXT,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);

-- 15. Cupons de Venda / Histórico de Vendas
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL UNIQUE,
    order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
    shift_id TEXT REFERENCES cash_shifts(id) ON DELETE SET NULL,
    origin TEXT NOT NULL,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    cpf TEXT,
    subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
    service_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
    tip DOUBLE PRECISION NOT NULL DEFAULT 0,
    discount DOUBLE PRECISION NOT NULL DEFAULT 0,
    total DOUBLE PRECISION NOT NULL DEFAULT 0,
    cancelled BOOLEAN NOT NULL DEFAULT false,
    cancelled_at TEXT,
    cancel_reason TEXT,
    credit_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    courtesy_reason TEXT,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sales_code ON sales (code);
CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales (shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_cancelled ON sales (cancelled);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_credit_customer ON sales (credit_customer_id);

-- 16. Pagamentos (Múltiplos e Parciais)
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    change_amount DOUBLE PRECISION DEFAULT 0,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    card_brand TEXT,
    authorization_code TEXT,
    is_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments (method);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (customer_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Permite leitura, inserção e atualização pelo cliente com chave anon e authenticated
-- ============================================================================

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'users', 'couriers', 'product_categories', 'modifier_groups',
            'customers', 'dining_tables', 'app_settings', 'products',
            'product_modifiers', 'cash_shifts', 'cash_movements', 'orders',
            'delivery_orders', 'order_items', 'sales', 'payments'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon and auth" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow all for anon and auth" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;
