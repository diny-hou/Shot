//! Floating glass popout windows (preset add / preferences).

use crate::models::AppSettings;
use crate::window_appearance;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

fn center_on_main(app: &AppHandle, width: f64, height: f64) -> (f64, f64) {
    let Some(main) = app.get_webview_window("main") else {
        return (120.0, 120.0);
    };
    let Ok(scale) = main.scale_factor() else {
        return (120.0, 120.0);
    };
    let Ok(pos) = main.outer_position() else {
        return (120.0, 120.0);
    };
    let Ok(size) = main.outer_size() else {
        return (120.0, 120.0);
    };

    let mx = pos.x as f64 / scale;
    let my = pos.y as f64 / scale;
    let mw = size.width as f64 / scale;
    let mh = size.height as f64 / scale;
    (
        mx + ((mw - width) / 2.0).max(0.0),
        my + ((mh - height) / 2.0).max(8.0),
    )
}

fn open_or_focus(
    app: &AppHandle,
    label: &str,
    title: &str,
    html: &str,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let (x, y) = center_on_main(app, width, height);
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(html.into()))
        .title(title)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(false)
        .focused(true)
        .drag_and_drop(false)
        .position(x, y)
        .inner_size(width, height)
        .build()
        .map_err(|e| e.to_string())?;

    if let Ok(settings) = app.state::<crate::state::AppState>().load_settings(app) {
        let _ = window_appearance::apply_window_appearance(app, &settings);
    } else {
        let _ = window_appearance::apply_window_appearance(app, &AppSettings::default());
    }

    Ok(())
}

#[tauri::command]
pub async fn open_preset_add_window(app: AppHandle) -> Result<(), String> {
    open_or_focus(&app, "preset-add", "プリセットを追加", "preset-add.html", 300.0, 292.0)
}

#[tauri::command]
pub async fn close_preset_add_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("preset-add") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_prefs_window(app: AppHandle) -> Result<(), String> {
    open_or_focus(&app, "prefs", "Preferences", "prefs.html", 320.0, 360.0)
}

#[tauri::command]
pub async fn close_prefs_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("prefs") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
