use crate::image_utils::{
    build_filename, crop_dynamic, image_to_data_url, resolve_save_dir, save_image,
};
use crate::models::{CaptureResult, CropRect, StockItem};
use crate::state::AppState;
use image::{GenericImageView, ImageReader};
use std::path::PathBuf;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[tauri::command]
pub async fn crop_image(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    crop: CropRect,
) -> Result<CaptureResult, String> {
    let settings = state.load_settings(&app)?;
    let source_path = PathBuf::from(&path);

    if !source_path.exists() {
        return Err("Source image not found".to_string());
    }

    let image = ImageReader::open(&source_path)
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;

    let (img_w, img_h) = image.dimensions();
    let x = crop.x.min(img_w.saturating_sub(1));
    let y = crop.y.min(img_h.saturating_sub(1));
    let width = crop.width.min(img_w - x).max(1);
    let height = crop.height.min(img_h - y).max(1);

    let cropped = crop_dynamic(image, x, y, width, height);

    let save_dir = resolve_save_dir(&app, &settings)?;
    let filename = build_filename(&settings);
    let output_path = save_dir.join(&filename);
    save_image(&cropped, &output_path, &settings.extension)?;

    let (width, height) = cropped.dimensions();
    let item = StockItem {
        id: Uuid::new_v4().to_string(),
        path: output_path.to_string_lossy().to_string(),
        filename,
        captured_at: chrono::Local::now().to_rfc3339(),
        width,
        height,
    };

    let data_url = image_to_data_url(&cropped, &settings.extension)?;
    state.push_stock(item.clone());

    Ok(CaptureResult { item, data_url })
}
