//! Click-through for the frame window interior.
//!
//! Avoids `SetWindowRgn` (causes classic DWM title-bar glitches when other
//! windows move). Instead toggles `set_ignore_cursor_events` from cursor position.

use crate::frame_layout::{CHROME_TOP, HANDLE_HIT};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::WebviewWindow;

static LAST_IGNORE: AtomicBool = AtomicBool::new(false);
static MENU_INTERACTIVE: AtomicBool = AtomicBool::new(false);

/// Remove any OS window region so DWM keeps a normal rectangular window.
#[cfg(windows)]
pub fn clear_frame_window_region(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::Graphics::Gdi::SetWindowRgn;

    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        let _ = SetWindowRgn(hwnd, None, true);
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn clear_frame_window_region(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

/// Keep the whole frame interactive while a chrome dropdown is open.
pub fn set_frame_menu_interactive(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    MENU_INTERACTIVE.store(enabled, Ordering::SeqCst);
    if enabled {
        LAST_IGNORE.store(false, Ordering::SeqCst);
        window
            .set_ignore_cursor_events(false)
            .map_err(|e| e.to_string())?;
    } else {
        sync_frame_click_through(window)?;
    }
    Ok(())
}

/// Called on open / resize: clear region and reset ignore state.
pub fn apply_frame_click_through(window: &WebviewWindow) -> Result<(), String> {
    clear_frame_window_region(window)?;
    LAST_IGNORE.store(false, Ordering::SeqCst);
    window
        .set_ignore_cursor_events(false)
        .map_err(|e| e.to_string())?;
    sync_frame_click_through(window)
}

/// Poll: ignore cursor events when the pointer is over the transparent hole.
pub fn sync_frame_click_through(window: &WebviewWindow) -> Result<(), String> {
    if MENU_INTERACTIVE.load(Ordering::SeqCst) {
        if LAST_IGNORE.swap(false, Ordering::SeqCst) {
            window
                .set_ignore_cursor_events(false)
                .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{POINT, RECT};
        use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect};

        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;

        let mut cursor = POINT::default();
        let mut rect = RECT::default();
        unsafe {
            GetCursorPos(&mut cursor).map_err(|e| e.to_string())?;
            GetWindowRect(hwnd, &mut rect).map_err(|e| e.to_string())?;
        }

        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        if w <= 0 || h <= 0 {
            return Ok(());
        }

        let x = cursor.x - rect.left;
        let y = cursor.y - rect.top;
        let outside = x < 0 || y < 0 || x >= w || y >= h;

        let chrome = (CHROME_TOP * scale).round() as i32;
        let ring = (HANDLE_HIT * scale).round().max(8.0) as i32;

        let in_hole = !outside
            && x >= ring
            && x < w - ring
            && y >= chrome + ring
            && y < h - ring;

        let ignore = in_hole;
        if LAST_IGNORE.swap(ignore, Ordering::SeqCst) != ignore {
            window
                .set_ignore_cursor_events(ignore)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(())
    }
}
