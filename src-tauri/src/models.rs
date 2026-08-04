use serde::{Deserialize, Serialize};

fn default_preset_kind() -> String {
    "ratio".into()
}

fn default_display_mode() -> String {
    "resolution".into()
}

fn default_window_hue() -> f64 {
    220.0
}

fn default_window_saturation() -> f64 {
    28.0
}

fn default_window_brightness() -> f64 {
    8.0
}

fn default_window_opacity() -> f64 {
    43.0
}

fn default_capture_monitor_id() -> String {
    "primary".into()
}

fn default_export_scale_preset() -> String {
    "1".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomPreset {
    pub id: String,
    pub label: String,
    /// Ratio numerator, or pixel width when kind == "resolution".
    pub width: u32,
    /// Ratio denominator, or pixel height when kind == "resolution".
    pub height: u32,
    /// `"ratio"` | `"resolution"`
    #[serde(default = "default_preset_kind")]
    pub kind: String,
}

impl CustomPreset {
    pub fn is_resolution(&self) -> bool {
        self.kind == "resolution"
    }

    pub fn aspect(&self) -> (f64, f64) {
        (self.width.max(1) as f64, self.height.max(1) as f64)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomExportScale {
    pub id: String,
    pub label: String,
    pub scale: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameLayoutPreset {
    pub id: String,
    pub label: String,
    /// Logical outer window position / size.
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub extension: String,
    /// Built-in: `square` | `ratio16x9`, or a custom preset id.
    pub resolution_preset: String,
    pub save_dir: Option<String>,
    pub prefix: String,
    pub suffix: String,
    pub always_on_top: bool,
    pub exclude_taskbar: bool,
    #[serde(default)]
    pub custom_presets: Vec<CustomPreset>,
    /// `"resolution"` (px) | `"ratio"` — UI label mode, default resolution.
    #[serde(default = "default_display_mode")]
    pub preset_display_mode: String,
    #[serde(default = "default_window_hue")]
    pub window_hue: f64,
    #[serde(default = "default_window_saturation")]
    pub window_saturation: f64,
    #[serde(default = "default_window_brightness")]
    pub window_brightness: f64,
    #[serde(default = "default_window_opacity")]
    pub window_opacity: f64,
    /// `"primary"` | monitor index (`"0"`, `"1"`, …) | `"all"`
    #[serde(default = "default_capture_monitor_id")]
    pub capture_monitor_id: String,
    /// Built-in: `"1"` | `"0.5"` | `"2"`, or a custom export scale id.
    #[serde(default = "default_export_scale_preset")]
    pub export_scale_preset: String,
    #[serde(default)]
    pub custom_export_scales: Vec<CustomExportScale>,
    #[serde(default)]
    pub frame_layout_presets: Vec<FrameLayoutPreset>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            extension: "png".to_string(),
            resolution_preset: "ratio16x9".to_string(),
            save_dir: None,
            prefix: "shot_".to_string(),
            suffix: String::new(),
            always_on_top: false,
            exclude_taskbar: true,
            custom_presets: Vec::new(),
            preset_display_mode: default_display_mode(),
            window_hue: default_window_hue(),
            window_saturation: default_window_saturation(),
            window_brightness: default_window_brightness(),
            window_opacity: default_window_opacity(),
            capture_monitor_id: default_capture_monitor_id(),
            export_scale_preset: default_export_scale_preset(),
            custom_export_scales: Vec::new(),
            frame_layout_presets: Vec::new(),
        }
    }
}

impl AppSettings {
    pub fn shows_resolution(&self) -> bool {
        self.preset_display_mode != "ratio"
    }

    /// Content size hint for the active preset: (w, h, exact_pixels).
    pub fn preset_size(&self) -> (f64, f64, bool) {
        match self.resolution_preset.as_str() {
            "square" => (1080.0, 1080.0, false),
            "ratio16x9" | "16:9" | "window" => (1920.0, 1080.0, false),
            id => {
                if let Some(p) = self.custom_presets.iter().find(|p| p.id == id) {
                    let (w, h) = p.aspect();
                    return (w, h, p.is_resolution());
                }
                (1920.0, 1080.0, false)
            }
        }
    }

    /// Returns aspect (w, h) for reshape / fullscreen crop.
    pub fn preset_aspect(&self) -> Option<(f64, f64)> {
        let (w, h, _) = self.preset_size();
        Some((w, h))
    }

    pub fn preset_label(&self) -> String {
        match self.resolution_preset.as_str() {
            "square" => {
                if self.shows_resolution() {
                    "1080×1080".into()
                } else {
                    "Square".into()
                }
            }
            "ratio16x9" | "16:9" | "window" => {
                if self.shows_resolution() {
                    "1920×1080".into()
                } else {
                    "16:9".into()
                }
            }
            id => self
                .custom_presets
                .iter()
                .find(|p| p.id == id)
                .map(|p| {
                    if self.shows_resolution() {
                        if p.is_resolution() {
                            format!("{}×{}", p.width, p.height)
                        } else {
                            // Show a reference px for ratio presets using 1080p height.
                            let h = 1080u32;
                            let w = ((p.width.max(1) as f64 / p.height.max(1) as f64) * h as f64)
                                .round() as u32;
                            format!("{w}×{h}")
                        }
                    } else if p.is_resolution() {
                        // Reduce px to a simple ratio label when in ratio display mode.
                        format!("{}:{}", p.width, p.height)
                    } else {
                        p.label.clone()
                    }
                })
                .unwrap_or_else(|| id.to_string()),
        }
    }

    pub fn export_scale(&self) -> f64 {
        match self.export_scale_preset.as_str() {
            "1" => 1.0,
            "0.5" => 0.5,
            "2" => 2.0,
            id => self
                .custom_export_scales
                .iter()
                .find(|entry| entry.id == id)
                .map(|entry| entry.scale)
                .unwrap_or(1.0),
        }
        .clamp(0.05, 8.0)
    }

    /// Acrylic / tint RGBA from HSB + opacity%.
    pub fn window_tint_rgba(&self) -> (u8, u8, u8, u8) {
        let (r, g, b) = hsb_to_rgb(
            self.window_hue,
            self.window_saturation.clamp(0.0, 100.0),
            self.window_brightness.clamp(0.0, 100.0),
        );
        let a = (self.window_opacity.clamp(0.0, 100.0) / 100.0 * 255.0).round() as u8;
        (r, g, b, a)
    }
}

fn hsb_to_rgb(h: f64, s: f64, b: f64) -> (u8, u8, u8) {
    let h = ((h % 360.0) + 360.0) % 360.0;
    let s = (s / 100.0).clamp(0.0, 1.0);
    let v = (b / 100.0).clamp(0.0, 1.0);
    let c = v * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = v - c;
    let (rp, gp, bp) = match h {
        h if h < 60.0 => (c, x, 0.0),
        h if h < 120.0 => (x, c, 0.0),
        h if h < 180.0 => (0.0, c, x),
        h if h < 240.0 => (0.0, x, c),
        h if h < 300.0 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    (
        ((rp + m) * 255.0).round() as u8,
        ((gp + m) * 255.0).round() as u8,
        ((bp + m) * 255.0).round() as u8,
    )
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockItem {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub captured_at: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub item: StockItem,
}
