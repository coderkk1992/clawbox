mod agents;
mod commands;
mod setup;
mod vm;
mod ws_proxy;

use commands::AppState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::default())
        .setup(|app| {
            // Create tray menu
            let open_item = MenuItem::with_id(app, "open", "Open ClawBox", true, None::<&str>)?;
            let chat_item = MenuItem::with_id(app, "chat", "Open Chat", true, None::<&str>)?;
            let separator = MenuItem::with_id(app, "sep", "─────────", false, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&open_item, &chat_item, &separator, &quit_item])?;

            // Build tray icon with template image for macOS menu bar
            let tray_icon_bytes = include_bytes!("../icons/tray-icon.png");
            let tray_icon = tauri::image::Image::from_bytes(tray_icon_bytes)
                .expect("Failed to load tray icon");

            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "chat" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            // Emit event to switch to chat view
                            let _ = window.emit("open-chat", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_info,
            commands::get_vm_status,
            commands::run_full_setup,
            commands::start_vm,
            commands::stop_vm,
            commands::restart_vm,
            commands::delete_vm,
            commands::get_gateway_url,
            commands::configure_agent,
            commands::send_first_message,
            commands::get_gateway_token,
            commands::get_chat_history,
            commands::send_chat_message,
            commands::ws_connect,
            commands::ws_send,
            commands::ws_disconnect,
            commands::add_channel,
            commands::get_channels,
            commands::upload_file,
            commands::list_workspace_files,
            commands::download_file,
            commands::download_and_save_file,
            commands::full_cleanup,
            commands::check_orphaned_vm,
            commands::create_agent,
            commands::list_agents,
            commands::get_agent,
            commands::get_active_agent,
            commands::update_agent,
            commands::delete_agent_by_id,
            commands::switch_agent,
            commands::get_ollama_status,
            commands::pull_ollama_model,
            commands::start_ollama,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ClawBox");
}
