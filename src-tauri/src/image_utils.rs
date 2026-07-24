use crate::models::AppSettings;
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, GenericImageView, RgbaImage};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn default_save_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("captures");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn resolve_save_dir(app: &AppHandle, settings: &AppSettings) -> Result<PathBuf, String> {
    match &settings.save_dir {
        Some(dir) if !dir.is_empty() => {
            let path = PathBuf::from(dir);
            std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            Ok(path)
        }
        _ => default_save_dir(app),
    }
}

pub fn build_filename(settings: &AppSettings) -> String {
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    format!(
        "{}{}{}.{}",
        settings.prefix, timestamp, settings.suffix, settings.extension
    )
}

pub fn save_image(img: &DynamicImage, path: &Path, extension: &str) -> Result<(), String> {
    match extension {
        "png" => img.save(path).map_err(|e| e.to_string()),
        "jpeg" | "jpg" => {
            let rgb = img.to_rgb8();
            let mut buffer = std::fs::File::create(path).map_err(|e| e.to_string())?;
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, 90);
            encoder
                .encode(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| e.to_string())
        }
        "webp" => img.save(path).map_err(|e| e.to_string()),
        other => Err(format!("Unsupported extension: {other}")),
    }
}

pub fn rgba_to_dynamic(rgba: RgbaImage) -> DynamicImage {
    DynamicImage::ImageRgba8(rgba)
}

pub fn crop_dynamic(img: DynamicImage, x: u32, y: u32, width: u32, height: u32) -> DynamicImage {
    img.crop_imm(x, y, width.max(1), height.max(1))
}

/// Center-crop to the given aspect ratio (width:height), keeping as much area as possible.
pub fn crop_to_aspect(img: DynamicImage, aspect_w: f64, aspect_h: f64) -> DynamicImage {
    let aw = aspect_w.max(0.001);
    let ah = aspect_h.max(0.001);
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return img;
    }

    let target = aw / ah;
    let current = w as f64 / h as f64;
    if (current - target).abs() < 0.002 {
        return img;
    }

    if current > target {
        let new_w = (((h as f64) * target).round() as u32).clamp(1, w);
        let x = (w - new_w) / 2;
        crop_dynamic(img, x, 0, new_w, h)
    } else {
        let new_h = (((w as f64) / target).round() as u32).clamp(1, h);
        let y = (h - new_h) / 2;
        crop_dynamic(img, 0, y, w, new_h)
    }
}

/// Crop to preset aspect; if `exact`, also resize to the target pixel size.
pub fn apply_preset_size(img: DynamicImage, width: f64, height: f64, exact: bool) -> DynamicImage {
    let cropped = crop_to_aspect(img, width, height);
    if !exact {
        return cropped;
    }
    let tw = width.round().max(1.0) as u32;
    let th = height.round().max(1.0) as u32;
    let (cw, ch) = cropped.dimensions();
    if cw == tw && ch == th {
        return cropped;
    }
    cropped.resize_exact(tw, th, image::imageops::FilterType::Lanczos3)
}

pub fn scale_image(img: DynamicImage, scale: f64) -> DynamicImage {
    let scale = scale.clamp(0.05, 8.0);
    if (scale - 1.0).abs() < 0.001 {
        return img;
    }
    let (width, height) = img.dimensions();
    let new_w = ((width as f64 * scale).round() as u32).max(1);
    let new_h = ((height as f64 * scale).round() as u32).max(1);
    img.resize_exact(new_w, new_h, image::imageops::FilterType::Lanczos3)
}

pub fn extension_from_path(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png")
        .to_lowercase()
}

pub fn image_to_data_url(img: &DynamicImage, extension: &str) -> Result<String, String> {
    let mut buffer = Vec::new();
    match extension {
        "png" => {
            img.write_to(
                &mut std::io::Cursor::new(&mut buffer),
                image::ImageFormat::Png,
            )
            .map_err(|e| e.to_string())?;
            Ok(format!(
                "data:image/png;base64,{}",
                STANDARD.encode(buffer)
            ))
        }
        "jpeg" | "jpg" => {
            let rgb = img.to_rgb8();
            let mut cursor = std::io::Cursor::new(&mut buffer);
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 90);
            encoder
                .encode(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| e.to_string())?;
            Ok(format!(
                "data:image/jpeg;base64,{}",
                STANDARD.encode(buffer)
            ))
        }
        "webp" => {
            img.write_to(
                &mut std::io::Cursor::new(&mut buffer),
                image::ImageFormat::WebP,
            )
            .map_err(|e| e.to_string())?;
            Ok(format!(
                "data:image/webp;base64,{}",
                STANDARD.encode(buffer)
            ))
        }
        other => Err(format!("Unsupported extension: {other}")),
    }
}

pub fn file_to_data_url(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    };
    Ok(format!(
        "data:{mime};base64,{}",
        STANDARD.encode(bytes)
    ))
}
