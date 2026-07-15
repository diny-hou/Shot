//! Window appearance — tinted acrylic that actually honors color on Windows 11.
//!
//! `window_vibrancy::apply_acrylic` on Win11 (build ≥ 22523) only sets
//! `DWMSBT_TRANSIENTWINDOW` ("liquid glass") and **ignores** the color argument.
//! We clear that system backdrop and apply classic SWCA acrylic with GradientColor.

use crate::models::AppSettings;
use tauri::{AppHandle, Manager};

const TINTED_WINDOWS: &[&str] = &["main", "preset-add", "prefs"];

pub fn apply_window_appearance(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let (r, g, b, a) = settings.window_tint_rgba();

    for label in TINTED_WINDOWS {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };

        #[cfg(target_os = "windows")]
        {
            apply_tinted_acrylic(&window, (r, g, b, a))?;
        }

        #[cfg(target_os = "macos")]
        {
            use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
            let _ = (r, g, b, a);
            let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            let _ = (window, r, g, b, a);
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_tinted_acrylic(
    window: &tauri::WebviewWindow,
    color: (u8, u8, u8, u8),
) -> Result<(), String> {
    use std::ffi::c_void;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_SYSTEMBACKDROP_TYPE, DWMSBT_NONE,
    };
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
    use windows::core::s;

    let hwnd = window.hwnd().map_err(|e| e.to_string())?;

    // Drop Win11 liquid-glass / mica so tinted SWCA acrylic can show.
    let _ = window_vibrancy::clear_acrylic(window);
    let _ = window_vibrancy::clear_mica(window);
    unsafe {
        let none = DWMSBT_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &none as *const _ as *const c_void,
            std::mem::size_of_val(&none) as u32,
        );
    }

    let mut color = color;
    if color.3 == 0 {
        color.3 = 1; // acrylic rejects fully transparent alpha
    }

    type SetWindowCompositionAttributeFn =
        unsafe extern "system" fn(HWND, *mut WindowCompositionAttribData) -> i32;

    #[repr(C)]
    struct AccentPolicy {
        accent_state: u32,
        accent_flags: u32,
        gradient_color: u32,
        animation_id: u32,
    }

    #[repr(C)]
    struct WindowCompositionAttribData {
        attrib: u32,
        pv_data: *mut c_void,
        cb_data: usize,
    }

    const ACCENT_ENABLE_ACRYLICBLURBEHIND: u32 = 4;
    const WCA_ACCENT_POLICY: u32 = 0x13;

    unsafe {
        let module = LoadLibraryA(s!("user32.dll")).map_err(|e| e.to_string())?;
        let proc = GetProcAddress(module, s!("SetWindowCompositionAttribute"))
            .ok_or_else(|| "SetWindowCompositionAttribute not found".to_string())?;
        let set_attr: SetWindowCompositionAttributeFn = std::mem::transmute(proc);

        let mut policy = AccentPolicy {
            accent_state: ACCENT_ENABLE_ACRYLICBLURBEHIND,
            accent_flags: 0,
            gradient_color: (color.0 as u32)
                | ((color.1 as u32) << 8)
                | ((color.2 as u32) << 16)
                | ((color.3 as u32) << 24),
            animation_id: 0,
        };

        let mut data = WindowCompositionAttribData {
            attrib: WCA_ACCENT_POLICY,
            pv_data: &mut policy as *mut _ as *mut c_void,
            cb_data: std::mem::size_of_val(&policy),
        };

        if set_attr(hwnd, &mut data) == 0 {
            return Err("SetWindowCompositionAttribute failed".into());
        }
    }

    Ok(())
}
