pub mod api;
pub mod commands;
pub mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::get_system_status,
            commands::get_pos_info,
            commands::test_printer_connection,
            commands::print_raw_escpos,
            commands::http_request,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação tauri do pdv");
}
