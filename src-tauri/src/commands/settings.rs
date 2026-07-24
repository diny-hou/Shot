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

fn file_path_to_string(path: tauri_plugin_dialog::FilePath) -> Result<String, String> {
    let path = path.into_path().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn pick_save_dir(app: AppHandle, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let settings = state.load_settings(&app)?;
    let current = resolve_save_dir(&app, &settings).ok();

    let mut dialog = app.dialog().file();
    if let Some(dir) = current.as_ref() {
        dialog = dialog.set_directory(dir);
    }

    let picked = dialog.blocking_pick_folder();
    match picked {
        Some(path) => {
            let dir = file_path_to_string(path)?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            Ok(Some(dir))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn get_save_dir(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let settings = state.load_settings(&app)?;
    let dir = resolve_save_dir(&app, &settings)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn clear_save_dir(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let mut settings = state.load_settings(&app)?;
    settings.save_dir = None;
    state.save_settings(&app, &settings)?;
    window_appearance::apply_window_appearance(&app, &settings)?;
    let _ = app.emit("settings-updated", &settings);
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
