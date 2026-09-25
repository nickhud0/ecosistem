-- ============================================================================
-- FLUXO PDV - MIGRATION 20260925120000_add_fiado_customer_transactions
-- Módulo Fiado & Caderneta Digital: Atualização de Customers e Tabela de Transações
-- Compatível tanto com bancos com PKs UUID quanto TEXT
-- ============================================================================

-- 1. Novas colunas na tabela de clientes
ALTER TABLE IF EXISTS customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS customers ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;

-- 2. Criação adaptativa da tabela customer_transactions de acordo com o tipo das PKs (UUID ou TEXT)
DO $$
DECLARE
    v_cust_type text := 'uuid';
    v_sale_type text := 'uuid';
    v_order_type text := 'uuid';
    v_shift_type text := 'uuid';
    v_has_sales boolean := false;
    v_has_orders boolean := false;
    v_has_shifts boolean := false;
BEGIN
    -- Detecta tipo de 'id' em customers (ex: uuid ou text)
    SELECT data_type INTO v_cust_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'id';
    
    IF v_cust_type IS NULL THEN
        v_cust_type := 'uuid';
    END IF;

    -- Detecta se 'sales' existe e o tipo de 'id'
    SELECT data_type INTO v_sale_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'id';
    IF v_sale_type IS NOT NULL THEN
        v_has_sales := true;
    ELSE
        v_sale_type := v_cust_type;
    END IF;

    -- Detecta se 'orders' existe e o tipo de 'id'
    SELECT data_type INTO v_order_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'id';
    IF v_order_type IS NOT NULL THEN
        v_has_orders := true;
    ELSE
        v_order_type := v_cust_type;
    END IF;

    -- Detecta se 'cash_shifts' existe e o tipo de 'id'
    SELECT data_type INTO v_shift_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_shifts' AND column_name = 'id';
    IF v_shift_type IS NOT NULL THEN
        v_has_shifts := true;
    ELSE
        v_shift_type := v_cust_type;
    END IF;

    -- Cria a tabela com tipos estritamente compatíveis
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS customer_transactions (
            id %s PRIMARY KEY %s,
            customer_id %s NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            balance_after DOUBLE PRECISION NOT NULL,
            payment_method TEXT,
            sale_id %s %s,
            order_id %s %s,
            shift_id %s %s,
            notes TEXT,
            is_synced BOOLEAN NOT NULL DEFAULT true,
            created_at TEXT NOT NULL DEFAULT to_char(now(), ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"''),
            updated_at TEXT NOT NULL DEFAULT to_char(now(), ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"''),
            deleted_at TEXT
        );',
        v_cust_type,
        CASE WHEN v_cust_type = 'uuid' THEN 'DEFAULT gen_random_uuid()' ELSE '' END,
        v_cust_type,
        v_sale_type,
        CASE WHEN v_has_sales THEN 'REFERENCES sales(id) ON DELETE SET NULL' ELSE '' END,
        v_order_type,
        CASE WHEN v_has_orders THEN 'REFERENCES orders(id) ON DELETE SET NULL' ELSE '' END,
        v_shift_type,
        CASE WHEN v_has_shifts THEN 'REFERENCES cash_shifts(id) ON DELETE SET NULL' ELSE '' END
    );
END $$;

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer ON customer_transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_type ON customer_transactions (type);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_sale ON customer_transactions (sale_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_order ON customer_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_shift ON customer_transactions (shift_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_created ON customer_transactions (created_at);

-- 4. RLS Policies
ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon and auth" ON public.customer_transactions;
CREATE POLICY "Allow all for anon and auth" ON public.customer_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
