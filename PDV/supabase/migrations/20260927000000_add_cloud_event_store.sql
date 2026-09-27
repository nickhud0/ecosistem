-- ============================================================================
-- MIGRATION: 20260927000000_add_cloud_event_store.sql
-- Armazenamento Central de Eventos e Mutações na Nuvem (Cloud Event Store)
-- Suporte a ingestão idempotente de eventos atômicos do Local Hub e POS 4G
-- ============================================================================

CREATE TABLE IF NOT EXISTS cloud_event_store (
    event_id TEXT PRIMARY KEY NOT NULL,
    store_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    client_timestamp TIMESTAMPTZ NOT NULL,
    hub_timestamp TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices essenciais para ingestão idempotente e consultas incrementais
CREATE UNIQUE INDEX IF NOT EXISTS uq_cloud_event_device_seq 
    ON cloud_event_store (store_id, device_id, device_sequence);

CREATE INDEX IF NOT EXISTS idx_cloud_event_store_ingested 
    ON cloud_event_store (store_id, ingested_at);

CREATE INDEX IF NOT EXISTS idx_cloud_event_aggregate 
    ON cloud_event_store (aggregate_type, aggregate_id);

-- RLS (Row Level Security)
ALTER TABLE public.cloud_event_store ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon and auth" ON public.cloud_event_store;
CREATE POLICY "Allow all for anon and auth" ON public.cloud_event_store 
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
