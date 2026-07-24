use crate::frame_layout::{BORDER, CHROME_TOP};
use crate::image_utils::{
    apply_preset_size, build_filename, crop_dynamic, file_to_data_url, image_to_data_url,
    rgba_to_dynamic, resolve_save_dir, save_image,
};
use crate::models::{AppSettings, CaptureResult, MonitorInfo, RegionRect, StockItem};
use crate::state::AppState;
use crate::work_area::monitor_work_area;
use image::{DynamicImage, GenericImageView, RgbaImage};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;
use xcap::Monitor;

fn load_settings(app: &AppHandle, state: &State<AppState>) -> Result<AppSettings, String> {
    state.load_settings(app)
}

fn monitor_to_info(index: usize, monitor: &Monitor) -> MonitorInfo {
    MonitorInfo {
        id: index.to_string(),
        name: monitor.name().to_string(),
        x: monitor.x(),
        y: monitor.y(),
        width: monitor.width(),
        height: monitor.height(),
        is_primary: monitor.is_primary(),
    }
}

#[tauri::command]
pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| monitor_to_info(index, monitor))
        .collect())
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

fn capture_monitor_image(monitor: &Monitor) -> Result<RgbaImage, String> {
    monitor
        .capture_image()
        .map_err(|e| format!("Failed to capture monitor: {e}"))
}

fn resolve_monitor_index(monitor_id: &str, monitors: &[Monitor]) -> Result<usize, String> {
    if monitor_id == "primary" || monitor_id.is_empty() {
        if let Some((index, _)) = monitors.iter().enumerate().find(|(_, monitor)| monitor.is_primary()) {
            return Ok(index);
        }
        return Ok(0);
    }

    let index: usize = monitor_id
        .parse()
        .map_err(|_| format!("Invalid monitor id: {monitor_id}"))?;
    if index >= monitors.len() {
        return Err(format!("Monitor {monitor_id} not found"));
    }
    Ok(index)
}

fn capture_monitor_portion(
    monitor: &Monitor,
    exclude_taskbar: bool,
) -> Result<(DynamicImage, i32, i32), String> {
    let monitor_x = monitor.x();
    let monitor_y = monitor.y();
    let monitor_w = monitor.width();
    let monitor_h = monitor.height();

    let rgba = capture_monitor_image(monitor)?;
    let mut image = rgba_to_dynamic(rgba);

    if exclude_taskbar {
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
        Ok((image, wx, wy))
    } else {
        Ok((image, monitor_x, monitor_y))
    }
}

fn blit_image(canvas: &mut RgbaImage, image: &DynamicImage, offset_x: i32, offset_y: i32) {
    if offset_x >= canvas.width() as i32 || offset_y >= canvas.height() as i32 {
        return;
    }

    let rgba = image.to_rgba8();
    let src_x = (-offset_x).max(0) as u32;
    let src_y = (-offset_y).max(0) as u32;
    if src_x >= rgba.width() || src_y >= rgba.height() {
        return;
    }

    let dest_x = offset_x.max(0) as u32;
    let dest_y = offset_y.max(0) as u32;
    let copy_w = (rgba.width() - src_x).min(canvas.width().saturating_sub(dest_x));
    let copy_h = (rgba.height() - src_y).min(canvas.height().saturating_sub(dest_y));
    if copy_w == 0 || copy_h == 0 {
        return;
    }

    let cropped = if src_x == 0 && src_y == 0 && copy_w == rgba.width() && copy_h == rgba.height() {
        rgba
    } else {
        image::imageops::crop_imm(&rgba, src_x, src_y, copy_w, copy_h).to_image()
    };
    image::imageops::overlay(canvas, &cropped, dest_x as i64, dest_y as i64);
}

fn capture_all_monitors_image(exclude_taskbar: bool) -> Result<DynamicImage, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("No monitor found".to_string());
    }
    if monitors.len() == 1 {
        let (image, _, _) = capture_monitor_portion(&monitors[0], exclude_taskbar)?;
        return Ok(image);
    }

    // Capture each display, then place by virtual-desktop coordinates.
    // Use the captured bitmap size (not just metadata) so DPI mismatches still stitch.
    let portions: Vec<(DynamicImage, i32, i32)> = monitors
        .iter()
        .map(|monitor| {
            let (image, dest_x, dest_y) = capture_monitor_portion(monitor, exclude_taskbar)?;
            Ok((image, dest_x, dest_y))
        })
        .collect::<Result<_, String>>()?;

    let (min_x, min_y, max_x, max_y) = portions.iter().fold(
        (i32::MAX, i32::MAX, i32::MIN, i32::MIN),
        |(min_x, min_y, max_x, max_y), (image, dest_x, dest_y)| {
            let w = image.width() as i32;
            let h = image.height() as i32;
            (
                min_x.min(*dest_x),
                min_y.min(*dest_y),
                max_x.max(dest_x + w),
                max_y.max(dest_y + h),
            )
        },
    );

    let canvas_w = (max_x - min_x).max(1) as u32;
    let canvas_h = (max_y - min_y).max(1) as u32;
    let mut canvas = RgbaImage::from_pixel(canvas_w, canvas_h, image::Rgba([0, 0, 0, 255]));

    for (image, dest_x, dest_y) in portions {
        blit_image(&mut canvas, &image, dest_x - min_x, dest_y - min_y);
    }

    Ok(DynamicImage::ImageRgba8(canvas))
}

fn capture_selected_monitor_image(
    monitor_id: &str,
    exclude_taskbar: bool,
) -> Result<DynamicImage, String> {
    if monitor_id == "all" {
        return capture_all_monitors_image(exclude_taskbar);
    }

    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let index = resolve_monitor_index(monitor_id, &monitors)?;
    let monitor = monitors
        .get(index)
        .ok_or_else(|| format!("Monitor {index} not found"))?;
    let (image, _, _) = capture_monitor_portion(monitor, exclude_taskbar)?;
    Ok(image)
}

fn finalize_capture(
    app: &AppHandle,
    state: &State<AppState>,
    settings: &AppSettings,
    image: DynamicImage,
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
    let monitor_id = settings.capture_monitor_id.as_str();
    let mut image =
        capture_selected_monitor_image(monitor_id, settings.exclude_taskbar)?;

    // Multi-monitor stitch must keep the full virtual desktop; preset crop would
    // center-crop away the other displays (e.g. 32:9 → 16:9).
    if monitor_id != "all" {
        let (pw, ph, exact) = settings.preset_size();
        image = apply_preset_size(image, pw, ph, exact);
    }

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
