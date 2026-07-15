use crate::capture_exclude::exclude_from_capture;
use crate::frame_click_through::{apply_frame_click_through, sync_frame_click_through as sync_hit};
use crate::frame_layout::{content_size_from_outer, outer_size_for_content};
use crate::models::{AppSettings, RegionRect};
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[tauri::command]
pub async fn hide_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_region_overlay(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("overlay").is_some() {
        return Ok(());
    }

    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let (min_x, min_y, max_x, max_y) = monitors.iter().fold(
        (i32::MAX, i32::MAX, i32::MIN, i32::MIN),
        |(min_x, min_y, max_x, max_y), monitor| {
            let x = monitor.x();
            let y = monitor.y();
            let w = monitor.width() as i32;
            let h = monitor.height() as i32;
            (
                min_x.min(x),
                min_y.min(y),
                max_x.max(x + w),
                max_y.max(y + h),
            )
        },
    );

    let width = (max_x - min_x).max(1) as f64;
    let height = (max_y - min_y).max(1) as f64;

    WebviewWindowBuilder::new(&app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("Region Select")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(true)
        .position(min_x as f64, min_y as f64)
        .inner_size(width, height)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_region_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn emit_region_selected(app: AppHandle, region: RegionRect) -> Result<(), String> {
    app.emit("region-selected", region)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn default_content_size(settings: &AppSettings) -> (f64, f64) {
    let (tw, th, exact) = settings.preset_size();
    if exact {
        return (tw.max(120.0), th.max(90.0));
    }
    if (tw - th).abs() < f64::EPSILON {
        (640.0, 640.0)
    } else {
        let width = 640.0;
        (width, (width * th / tw).max(90.0))
    }
}

fn reshape_to_aspect(content_w: f64, content_h: f64, aw: f64, ah: f64) -> (f64, f64) {
    if (aw - ah).abs() < f64::EPSILON {
        let side = content_w.min(content_h).max(120.0);
        return (side, side);
    }
    let width = content_w.max(160.0);
    let height = (width * ah / aw).max(90.0);
    let _ = content_h;
    (width, height)
}

fn reshape_content(settings: &AppSettings, content_w: f64, content_h: f64) -> (f64, f64) {
    let (tw, th, exact) = settings.preset_size();
    if exact {
        // Exact pixel presets size the frame content to that resolution (WYSIWYG).
        (tw.max(120.0), th.max(90.0))
    } else {
        reshape_to_aspect(content_w, content_h, tw, th)
    }
}

pub fn apply_preset_to_frame(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let Some(window) = app.get_webview_window("frame") else {
        return Ok(());
    };

    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    let outer_w = size.width as f64 / scale;
    let outer_h = size.height as f64 / scale;
    let (cur_w, cur_h) = content_size_from_outer(outer_w, outer_h);

    let (cw, ch) = reshape_content(settings, cur_w, cur_h);
    let (ow, oh) = outer_size_for_content(cw, ch);
    let pos_x = position.x as f64 / scale + (outer_w - ow) / 2.0;
    let pos_y = position.y as f64 / scale + (outer_h - oh) / 2.0;

    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize::new(ow, oh)))
        .map_err(|e| e.to_string())?;
    window
        .set_position(tauri::Position::Logical(tauri::LogicalPosition::new(pos_x, pos_y)))
        .map_err(|e| e.to_string())?;
    let _ = apply_frame_click_through(&window);

    let _ = app.emit("frame-preset-applied", settings.resolution_preset.clone());
    Ok(())
}

#[tauri::command]
pub async fn apply_frame_preset(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let settings = state.load_settings(&app)?;
    apply_preset_to_frame(&app, &settings)
}

#[tauri::command]
pub async fn open_frame_window(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let settings = state.load_settings(&app)?;

    if let Some(window) = app.get_webview_window("frame") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        let _ = exclude_from_capture(&window);
        apply_preset_to_frame(&app, &settings)?;
        let _ = apply_frame_click_through(&window);
        let _ = app.emit("frame-mode-changed", true);
        return Ok(());
    }

    let (mx, my, mw, mh) = {
        let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
        let monitor = monitors
            .first()
            .ok_or_else(|| "No monitor found".to_string())?;
        (
            monitor.x() as f64,
            monitor.y() as f64,
            monitor.width() as f64,
            monitor.height() as f64,
        )
    };

    let (cw, ch) = default_content_size(&settings);
    let (cw, ch) = reshape_content(&settings, cw, ch);
    let (frame_w, frame_h) = outer_size_for_content(cw, ch);
    let x = mx + ((mw - frame_w) / 2.0).max(0.0);
    let y = my + ((mh - frame_h) / 2.0).max(0.0);

    WebviewWindowBuilder::new(&app, "frame", WebviewUrl::App("frame.html".into()))
        .title("")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .focused(true)
        .drag_and_drop(false)
        .position(x, y)
        .inner_size(frame_w, frame_h)
        .min_inner_size(120.0, 100.0)
        .build()
        .map_err(|e| e.to_string())?;

    if let Some(frame) = app.get_webview_window("frame") {
        let _ = exclude_from_capture(&frame);
        let _ = apply_frame_click_through(&frame);

        let frame_for_events = frame.clone();
        frame.on_window_event(move |event| {
            if matches!(
                event,
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }
            ) {
                let _ = apply_frame_click_through(&frame_for_events);
            }
        });
    }

    apply_preset_to_frame(&app, &settings)?;

    let _ = app.emit("frame-mode-changed", true);
    Ok(())
}

#[tauri::command]
pub async fn close_frame_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("frame") {
        window.close().map_err(|e| e.to_string())?;
    }
    let _ = app.emit("frame-mode-changed", false);
    Ok(())
}

#[tauri::command]
pub async fn hide_frame_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("frame") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn show_frame_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("frame") {
        window.show().map_err(|e| e.to_string())?;
        let _ = exclude_from_capture(&window);
        let _ = apply_frame_click_through(&window);
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_frame_click_through(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("frame") else {
        return Ok(());
    };
    sync_hit(&window)
}

#[tauri::command]
pub async fn toggle_frame_window(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<bool, String> {
    if app.get_webview_window("frame").is_some() {
        close_frame_window(app).await?;
        Ok(false)
    } else {
        open_frame_window(app, state).await?;
        Ok(true)
    }
}
