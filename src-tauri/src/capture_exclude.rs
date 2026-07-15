//! Exclude windows from OS screen capture (Windows).

#[cfg(windows)]
pub fn exclude_from_capture(window: &tauri::WebviewWindow) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
    };

    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn exclude_from_capture(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}
