-- ============================================================================
-- FLUXO PDV - MIGRATION 0000_INIT
-- SQLite Schema para Arquitetura Offline-First
-- Todas as PKs são UUID geradas no cliente (TEXT)
-- Todas as tabelas possuem created_at, updated_at, deleted_at e is_synced (Sync & Soft-Delete)
-- ============================================================================

-- 1. Usuários / Operadores / Garçons
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    pin TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    active INTEGER NOT NULL DEFAULT 1,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_pin ON users (pin);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 2. Turnos de Caixa
CREATE TABLE IF NOT EXISTS cash_shifts (
    id TEXT PRIMARY KEY NOT NULL,
    operator_id TEXT REFERENCES users(id),
    operator_name TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    opening_float REAL NOT NULL DEFAULT 0,
    closing_counted REAL,
    closing_expected REAL,
    closing_difference REAL,
    closing_notes TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts (status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_operator ON cash_shifts (operator_id);

-- 3. Movimentações de Caixa (Suprimento / Sangria)
CREATE TABLE IF NOT EXISTS cash_movements (
    id TEXT PRIMARY KEY NOT NULL,
    shift_id TEXT REFERENCES cash_shifts(id),
    operator_id TEXT REFERENCES users(id),
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    at TEXT NOT NULL,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements (shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements (type);

-- 4. Categorias de Produtos
CREATE TABLE IF NOT EXISTS product_categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- 5. Produtos do Cardápio
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT REFERENCES product_categories(id),
    category_name TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    emoji TEXT NOT NULL,
    sold_out INTEGER NOT NULL DEFAULT 0,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_sold_out ON products (sold_out);

-- 6. Grupos de Modificadores (Exclusões, Adicionais, Sabores)
CREATE TABLE IF NOT EXISTS modifier_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    min_selectable INTEGER NOT NULL DEFAULT 0,
    max_selectable INTEGER NOT NULL DEFAULT 0,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- 7. Modificadores / Adicionais / Ingredientes
CREATE TABLE IF NOT EXISTS product_modifiers (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT REFERENCES modifier_groups(id),
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 1,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_modifiers_group ON product_modifiers (group_id);

-- 8. Clientes
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    email TEXT,
    cpf TEXT,
    credit_limit REAL DEFAULT 0,
    balance_due REAL DEFAULT 0,
    notes TEXT,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers (cpf);

-- 9. Mesas do Salão
CREATE TABLE IF NOT EXISTS dining_tables (
    id TEXT PRIMARY KEY NOT NULL,
    number INTEGER NOT NULL UNIQUE,
    seats INTEGER NOT NULL DEFAULT 4,
    status TEXT NOT NULL DEFAULT 'livre',
    waiter TEXT NOT NULL DEFAULT 'Equipe',
    opened_at TEXT,
    discount_type TEXT,
    discount_amount REAL,
    merged_with TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dining_tables_status ON dining_tables (status);

-- 10. Comandas e Pedidos Unificados
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL,
    table_id TEXT REFERENCES dining_tables(id),
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT,
    operator_id TEXT REFERENCES users(id),
    shift_id TEXT REFERENCES cash_shifts(id),
    status TEXT NOT NULL DEFAULT 'open',
    subtotal REAL NOT NULL DEFAULT 0,
    service_fee REAL NOT NULL DEFAULT 0,
    tip REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    notes TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_table ON orders (table_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_shift ON orders (shift_id);

-- 11. Pedidos Delivery Omnichannel
CREATE TABLE IF NOT EXISTS delivery_orders (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
    source TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'novos',
    bairro TEXT NOT NULL,
    delivery_address TEXT,
    courier TEXT,
    accepted INTEGER NOT NULL DEFAULT 0,
    estimated_delivery_time TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_stage ON delivery_orders (stage);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_source ON delivery_orders (source);

-- 12. Itens dos Pedidos / Comandas
CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL REFERENCES orders(id),
    product_id TEXT REFERENCES products(id),
    name TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    details TEXT,
    notes TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

-- 13. Cupons de Venda / Histórico de Vendas
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL UNIQUE,
    order_id TEXT REFERENCES orders(id),
    shift_id TEXT REFERENCES cash_shifts(id),
    origin TEXT NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    cpf TEXT,
    subtotal REAL NOT NULL DEFAULT 0,
    service_fee REAL NOT NULL DEFAULT 0,
    tip REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    cancelled INTEGER NOT NULL DEFAULT 0,
    cancelled_at TEXT,
    cancel_reason TEXT,
    credit_customer_id TEXT REFERENCES customers(id),
    courtesy_reason TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sales_code ON sales (code);
CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales (shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_cancelled ON sales (cancelled);

-- 14. Pagamentos (Múltiplos e Parciais)
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL REFERENCES sales(id),
    method TEXT NOT NULL,
    amount REAL NOT NULL,
    change_amount REAL DEFAULT 0,
    customer_id TEXT REFERENCES customers(id),
    card_brand TEXT,
    authorization_code TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments (method);

-- 15. Configurações Locais e Estado
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY NOT NULL,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings (key);

-- 16. Entregadores / Motoboys
CREATE TABLE IF NOT EXISTS couriers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_couriers_is_active ON couriers (is_active);

-- 17. Transações e Movimentações da Conta Fiado do Cliente
CREATE TABLE IF NOT EXISTS customer_transactions (
    id TEXT PRIMARY KEY NOT NULL,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    payment_method TEXT,
    sale_id TEXT REFERENCES sales(id),
    order_id TEXT REFERENCES orders(id),
    shift_id TEXT REFERENCES cash_shifts(id),
    notes TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer ON customer_transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_type ON customer_transactions (type);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_sale ON customer_transactions (sale_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_order ON customer_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_shift ON customer_transactions (shift_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_created ON customer_transactions (created_at);
