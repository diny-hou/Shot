use crate::frame_layout::{BORDER, CHROME_TOP};
use crate::image_utils::{
    apply_preset_size, build_filename, crop_dynamic, file_to_data_url, image_to_data_url,
    rgba_to_dynamic, resolve_save_dir, save_image,
};
use crate::models::{AppSettings, CaptureResult, RegionRect, StockItem};
use crate::state::AppState;
use crate::work_area::monitor_work_area;
use image::GenericImageView;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;
use xcap::Monitor;

fn load_settings(app: &AppHandle, state: &State<AppState>) -> Result<AppSettings, String> {
    state.load_settings(app)
}

fn find_monitor_for_region(x: i32, y: i32) -> Result<Monitor, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    monitors
        .into_iter()
        .find(|monitor| {
            let mx = monitor.x();
            let my = monitor.y();
            let mw = monitor.width() as i32;
            let mh = monitor.height() as i32;
            x >= mx && y >= my && x < mx + mw && y < my + mh
        })
        .ok_or_else(|| "No monitor found for the selected region".to_string())
}

fn capture_monitor_image(monitor: &Monitor) -> Result<image::RgbaImage, String> {
    monitor
        .capture_image()
        .map_err(|e| format!("Failed to capture monitor: {e}"))
}

fn capture_primary_monitor() -> Result<Monitor, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    monitors
        .into_iter()
        .next()
        .ok_or_else(|| "No monitor found".to_string())
}

fn finalize_capture(
    app: &AppHandle,
    state: &State<AppState>,
    settings: &AppSettings,
    image: image::DynamicImage,
) -> Result<CaptureResult, String> {
    let save_dir = resolve_save_dir(app, settings)?;
    let filename = build_filename(settings);
    let path: PathBuf = save_dir.join(&filename);
    save_image(&image, &path, &settings.extension)?;

    let (width, height) = image.dimensions();
    let item = StockItem {
        id: Uuid::new_v4().to_string(),
        path: path.to_string_lossy().to_string(),
        filename,
        captured_at: chrono::Local::now().to_rfc3339(),
        width,
        height,
    };

    let data_url = image_to_data_url(&image, &settings.extension)?;
    state.push_stock(item.clone());

    Ok(CaptureResult { item, data_url })
}

#[tauri::command]
pub async fn capture_fullscreen(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CaptureResult, String> {
    let settings = load_settings(&app, &state)?;
    let monitor = capture_primary_monitor()?;
    let monitor_x = monitor.x();
    let monitor_y = monitor.y();
    let monitor_w = monitor.width();
    let monitor_h = monitor.height();

    let rgba = capture_monitor_image(&monitor)?;
    let mut image = rgba_to_dynamic(rgba);

    if settings.exclude_taskbar {
        let (wx, wy, ww, wh) = monitor_work_area(monitor_x, monitor_y, monitor_w, monitor_h);
        let local_x = (wx - monitor_x).max(0) as u32;
        let local_y = (wy - monitor_y).max(0) as u32;
        let max_w = monitor_w.saturating_sub(local_x);
        let max_h = monitor_h.saturating_sub(local_y);
        let crop_w = ww.min(max_w).max(1);
        let crop_h = wh.min(max_h).max(1);

        if crop_w < monitor_w || crop_h < monitor_h || local_x > 0 || local_y > 0 {
            image = crop_dynamic(image, local_x, local_y, crop_w, crop_h);
        }
    }

    // Apply preset aspect (and exact px resize when configured) to fullscreen captures.
    let (pw, ph, exact) = settings.preset_size();
    image = apply_preset_size(image, pw, ph, exact);

    finalize_capture(&app, &state, &settings, image)
}

#[tauri::command]
pub async fn capture_region(
    app: AppHandle,
    state: State<'_, AppState>,
    region: RegionRect,
) -> Result<CaptureResult, String> {
    if region.width < 2 || region.height < 2 {
        return Err("Selected region is too small".to_string());
    }

    let settings = load_settings(&app, &state)?;
    let monitor = find_monitor_for_region(region.x, region.y)?;
    let monitor_x = monitor.x();
    let monitor_y = monitor.y();
    let monitor_w = monitor.width();
    let monitor_h = monitor.height();

    let local_x = (region.x - monitor_x).max(0) as u32;
    let local_y = (region.y - monitor_y).max(0) as u32;
    let max_w = monitor_w.saturating_sub(local_x);
    let max_h = monitor_h.saturating_sub(local_y);
    let crop_w = region.width.min(max_w).max(1);
    let crop_h = region.height.min(max_h).max(1);

    let rgba = capture_monitor_image(&monitor)?;
    let image = rgba_to_dynamic(rgba);
    let cropped = crop_dynamic(image, local_x, local_y, crop_w, crop_h);

    finalize_capture(&app, &state, &settings, cropped)
}

#[tauri::command]
pub async fn capture_frame(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CaptureResult, String> {
    let window = app
        .get_webview_window("frame")
        .ok_or_else(|| "Frame mode is not open".to_string())?;

    // Keep the frame invisible to OS capture APIs while it stays on screen.
    let _ = crate::capture_exclude::exclude_from_capture(&window);

    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    let chrome = (CHROME_TOP * scale).round() as i32;
    let border = (BORDER * scale).round() as i32;
    // Extra inset covers handle bleed / anti-alias / glow.
    let inset = ((2.0 * scale).ceil() as i32).max(2);

    let region = RegionRect {
        x: position.x + border + inset,
        y: position.y + chrome + border + inset,
        width: (size.width as i32 - (border + inset) * 2).max(1) as u32,
        height: (size.height as i32 - chrome - (border + inset) * 2).max(1) as u32,
    };

    // Also hide briefly so older Windows / some capture paths never see the chrome.
    let _ = window.hide();
    std::thread::sleep(std::time::Duration::from_millis(120));

    let result = capture_region(app.clone(), state, region).await;

    if let Some(frame) = app.get_webview_window("frame") {
        let _ = frame.show();
        let _ = crate::capture_exclude::exclude_from_capture(&frame);
        let _ = crate::frame_click_through::apply_frame_click_through(&frame);
    }

    if let Ok(ref capture) = result {
        let _ = app.emit("capture-completed", capture);
    }

    result
}

#[tauri::command]
pub async fn get_image_data_url(path: String) -> Result<String, String> {
    file_to_data_url(PathBuf::from(path).as_path())
}
