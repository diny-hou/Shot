use crate::image_utils::resolve_save_dir;
use crate::models::AppSettings;
use crate::state::AppState;
use crate::window_appearance;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn get_settings(app: AppHandle, state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.load_settings(&app)
}

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    state.save_settings(&app, &settings)?;
    window_appearance::apply_window_appearance(&app, &settings)?;
    let _ = app.emit("settings-updated", &settings);
    Ok(())
}

#[tauri::command]
pub async fn pick_save_dir(app: AppHandle) -> Result<Option<String>, String> {
    let dir = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|path| path.to_string());

    Ok(dir)
}

#[tauri::command]
pub async fn get_save_dir(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let settings = state.load_settings(&app)?;
    let dir = resolve_save_dir(&app, &settings)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_always_on_top(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(enabled)
            .map_err(|e| e.to_string())?;
    }

    let mut settings = state.load_settings(&app)?;
    settings.always_on_top = enabled;
    state.save_settings(&app, &settings)
}
