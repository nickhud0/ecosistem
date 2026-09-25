use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;
use crate::api;
use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStatus {
    pub app_name: String,
    pub version: String,
    pub offline_ready: bool,
    pub db: db::DbStatus,
    pub sync: api::SyncStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Olá, {}! Bem-vindo ao Fluxo PDV Desktop.", name)
}

#[tauri::command]
pub fn get_system_status() -> SystemStatus {
    SystemStatus {
        app_name: "Fluxo PDV".to_string(),
        version: "0.1.0".to_string(),
        offline_ready: true,
        db: db::get_db_status(),
        sync: api::get_sync_status(),
    }
}

#[tauri::command]
pub fn get_pos_info() -> String {
    "Fluxo PDV Desktop - Tauri 2.x Offline-First Runtime".to_string()
}

#[tauri::command]
pub async fn test_printer_connection(host: String, port: u16) -> Result<PrinterTestResult, String> {
    let start = std::time::Instant::now();
    let addr_str = format!("{}:{}", host.trim(), port);

    let socket_addrs: Vec<SocketAddr> = match addr_str.to_socket_addrs() {
        Ok(addrs) => addrs.collect(),
        Err(e) => {
            return Ok(PrinterTestResult {
                success: false,
                message: format!("Endereço IP inválido ou não resolvível: {}", e),
                latency_ms: None,
            });
        }
    };

    if socket_addrs.is_empty() {
        return Ok(PrinterTestResult {
            success: false,
            message: "Nenhum endereço de rede resolvido para o host informado.".to_string(),
            latency_ms: None,
        });
    }

    let timeout = Duration::from_secs(3);
    match TcpStream::connect_timeout(&socket_addrs[0], timeout) {
        Ok(mut stream) => {
            let latency = start.elapsed().as_millis() as u64;
            // Envia comando de inicialização ESC/POS (ESC @: \x1b\x40)
            let _ = stream.write_all(b"\x1b\x40");
            let _ = stream.flush();
            Ok(PrinterTestResult {
                success: true,
                message: format!("Conexão estabelecida com sucesso! (Latência: {}ms)", latency),
                latency_ms: Some(latency),
            })
        }
        Err(e) => {
            Ok(PrinterTestResult {
                success: false,
                message: format!(
                    "Falha ao conectar na impressora ({}:{}): {}. Verifique se está ligada na mesma rede.",
                    host, port, e
                ),
                latency_ms: None,
            })
        }
    }
}

#[tauri::command]
pub async fn print_raw_escpos(host: String, port: u16, data: Vec<u8>) -> Result<PrinterTestResult, String> {
    let addr_str = format!("{}:{}", host.trim(), port);

    let socket_addrs: Vec<SocketAddr> = match addr_str.to_socket_addrs() {
        Ok(addrs) => addrs.collect(),
        Err(e) => {
            return Ok(PrinterTestResult {
                success: false,
                message: format!("Endereço IP inválido: {}", e),
                latency_ms: None,
            });
        }
    };

    if socket_addrs.is_empty() {
        return Ok(PrinterTestResult {
            success: false,
            message: "Host não encontrado na rede local.".to_string(),
            latency_ms: None,
        });
    }

    let timeout = Duration::from_secs(4);
    match TcpStream::connect_timeout(&socket_addrs[0], timeout) {
        Ok(mut stream) => {
            let _ = stream.set_write_timeout(Some(Duration::from_secs(4)));
            if let Err(e) = stream.write_all(&data) {
                return Ok(PrinterTestResult {
                    success: false,
                    message: format!("Erro ao transmitir dados para a impressora: {}", e),
                    latency_ms: None,
                });
            }
            let _ = stream.flush();
            Ok(PrinterTestResult {
                success: true,
                message: "Comanda enviada para a impressora térmica com sucesso!".to_string(),
                latency_ms: None,
            })
        }
        Err(e) => {
            Ok(PrinterTestResult {
                success: false,
                message: format!("Impressora offline ou inacessível ({}:{}): {}", host, port, e),
                latency_ms: None,
            })
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[tauri::command]
pub async fn http_request(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<HttpResponsePayload, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .gzip(true)
        .deflate(true)
        .brotli(true)
        .build()
        .map_err(|e| format!("Erro ao inicializar cliente HTTP: {}", e))?;

    let method_upper = method.to_uppercase();
    let req_method = match method_upper.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => return Err(format!("Método HTTP não suportado: {}", method)),
    };

    let mut request = client.request(req_method, &url);

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            request = request.header(k, v);
        }
    }

    if let Some(b) = body {
        request = request.body(b);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Falha de conexão com {}: {}", url, e))?;

    let status = response.status().as_u16();
    let ok = response.status().is_success();

    let mut resp_headers = HashMap::new();
    for (name, val) in response.headers() {
        if let Ok(str_val) = val.to_str() {
            resp_headers.insert(name.to_string(), str_val.to_string());
        }
    }

    let raw_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Erro ao ler corpo da resposta de {}: {}", url, e))?;

    // Se por qualquer razão os bytes ainda estiverem compactados com gzip (magic bytes 0x1f, 0x8b)
    let body_text = if raw_bytes.len() >= 2 && raw_bytes[0] == 0x1f && raw_bytes[1] == 0x8b {
        use flate2::read::GzDecoder;
        use std::io::Read;
        let mut decoder = GzDecoder::new(&raw_bytes[..]);
        let mut decompressed = String::new();
        match decoder.read_to_string(&mut decompressed) {
            Ok(_) => decompressed,
            Err(_) => String::from_utf8_lossy(&raw_bytes).to_string(),
        }
    } else {
        String::from_utf8_lossy(&raw_bytes).to_string()
    };

    Ok(HttpResponsePayload {
        status,
        ok,
        body: body_text,
        headers: resp_headers,
    })
}
