/// Returns the monitor work area in screen coordinates (excludes taskbar).
/// Falls back to the full monitor bounds when the platform API is unavailable.
pub fn monitor_work_area(
    monitor_x: i32,
    monitor_y: i32,
    monitor_w: u32,
    monitor_h: u32,
) -> (i32, i32, u32, u32) {
    #[cfg(windows)]
    {
        if let Some(area) = windows_work_area(monitor_x, monitor_y, monitor_w, monitor_h) {
            return area;
        }
    }

    let _ = (monitor_x, monitor_y);
    (monitor_x, monitor_y, monitor_w, monitor_h)
}

#[cfg(windows)]
fn windows_work_area(
    monitor_x: i32,
    monitor_y: i32,
    monitor_w: u32,
    monitor_h: u32,
) -> Option<(i32, i32, u32, u32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };

    unsafe {
        let center = POINT {
            x: monitor_x + (monitor_w as i32 / 2),
            y: monitor_y + (monitor_h as i32 / 2),
        };
        let hmonitor = MonitorFromPoint(center, MONITOR_DEFAULTTONEAREST);
        if hmonitor.is_invalid() {
            return None;
        }

        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };

        if !GetMonitorInfoW(hmonitor, &mut info).as_bool() {
            return None;
        }

        let work = info.rcWork;
        let width = (work.right - work.left).max(1) as u32;
        let height = (work.bottom - work.top).max(1) as u32;
        Some((work.left, work.top, width, height))
    }
}
