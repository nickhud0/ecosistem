use serde::{Deserialize, Serialize};

/// Módulo de Comunicação de Rede e Sidecars
///
/// Estrutura preparada para:
/// - Integrações externas (iFood, WhatsApp API, webhook de pagamentos TEF/PIX)
/// - Servidor sidecar ou sincronização em background com a API remota
/// - Emissão de documentos fiscais (NFC-e / SAT)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_online: bool,
    pub last_sync_timestamp: Option<u64>,
}

pub fn get_sync_status() -> SyncStatus {
    SyncStatus {
        is_online: true,
        last_sync_timestamp: None,
    }
}
