use serde::{Deserialize, Serialize};

/// Módulo de Banco de Dados Local (SQLite)
///
/// Estrutura preparada para:
/// - Armazenamento de vendas, produtos, turnos e comandas localmente
/// - Suporte a persistência offline-first com SQLite
/// - Futuras migrações e sincronização com a retaguarda

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbStatus {
    pub is_connected: bool,
    pub engine: String,
    pub pending_sync_count: u32,
}

pub fn get_db_status() -> DbStatus {
    DbStatus {
        is_connected: true,
        engine: "SQLite (Local Offline-First)".to_string(),
        pending_sync_count: 0,
    }
}
