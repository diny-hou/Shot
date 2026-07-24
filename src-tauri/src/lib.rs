pub mod capture_exclude;
pub mod commands;
pub mod frame_click_through;
pub mod frame_layout;
pub mod image_utils;
pub mod models;
pub mod state;
pub mod window_appearance;
pub mod work_area;

use state::AppState;
use tauri::{Manager, WindowEvent};

fn close_secondary_windows(app: &tauri::AppHandle) {
    for label in ["frame", "overlay", "preset-add", "prefs"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
                }

                // Closing the main window should tear down frame/overlay and exit the app.
                let handle = app.handle().clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { .. } => {
                        close_secondary_windows(&handle);
                    }
                    WindowEvent::Destroyed => {
                        close_secondary_windows(&handle);
                        handle.exit(0);
                    }
                    _ => {}
                });
            }

            let state = app.state::<AppState>();
            if let Ok(settings) = state.load_settings(app.handle()) {
                let _ = window_appearance::apply_window_appearance(app.handle(), &settings);
                if settings.always_on_top {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_always_on_top(true);
                    }
                }
            } else {
                let _ = window_appearance::apply_window_appearance(
                    app.handle(),
                    &models::AppSettings::default(),
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::pick_save_dir,
            commands::settings::get_save_dir,
            commands::settings::clear_save_dir,
            commands::settings::set_always_on_top,
            commands::capture::capture_fullscreen,
            commands::capture::capture_region,
            commands::capture::capture_frame,
            commands::capture::list_monitors,
            commands::capture::get_image_data_url,
            commands::crop::crop_image,
            commands::stock::list_stock,
            commands::stock::delete_stock_item,
            commands::stock::clear_stock,
            commands::stock::copy_image_to_clipboard,
            commands::stock::prepare_export_image,
            commands::window::hide_main_window,
            commands::window::show_main_window,
            commands::window::open_region_overlay,
            commands::window::close_region_overlay,
            commands::window::emit_region_selected,
            commands::window::open_frame_window,
            commands::window::close_frame_window,
            commands::window::hide_frame_window,
            commands::window::show_frame_window,
            commands::window::toggle_frame_window,
            commands::window::apply_frame_preset,
            commands::window::list_frame_layout_presets,
            commands::window::save_frame_layout_preset,
            commands::window::apply_frame_layout_preset,
            commands::window::delete_frame_layout_preset,
            commands::window::sync_frame_click_through,
            commands::window::set_frame_menu_interactive,
            commands::popout::open_preset_add_window,
            commands::popout::close_preset_add_window,
            commands::popout::open_prefs_window,
            commands::popout::close_prefs_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                close_secondary_windows(app_handle);
            }
        });
}
