use crate::models::StockItem;
use crate::state::AppState;
use arboard::{Clipboard, ImageData};
use image::GenericImageView;
use std::borrow::Cow;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn list_stock(state: State<'_, AppState>) -> Result<Vec<StockItem>, String> {
    Ok(state.list_stock())
}

#[tauri::command]
pub async fn delete_stock_item(
    state: State<'_, AppState>,
    id: String,
    delete_file: bool,
) -> Result<(), String> {
    if let Some(item) = state.delete_stock_item(&id) {
        if delete_file {
            let path = PathBuf::from(item.path);
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
        Ok(())
    } else {
        Err("Stock item not found".to_string())
    }
}

#[tauri::command]
pub async fn clear_stock(
    state: State<'_, AppState>,
    delete_files: bool,
) -> Result<(), String> {
    let items = state.clear_stock();
    if delete_files {
        for item in items {
            let path = PathBuf::from(item.path);
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn copy_image_to_clipboard(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("Image file not found".into());
    }

    let img = image::open(&path).map_err(|e| format!("Failed to open image: {e}"))?;
    let rgba = img.to_rgba8();
    let (width, height) = img.dimensions();

    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard unavailable: {e}"))?;
    clipboard
        .set_image(ImageData {
            width: width as usize,
            height: height as usize,
            bytes: Cow::Owned(rgba.into_raw()),
        })
        .map_err(|e| format!("Failed to copy image: {e}"))?;

    Ok(())
}
