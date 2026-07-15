//! Shared geometry for the frame capture window.
//! Must stay in sync with `src/frame.css` (top strip 28px, border 3px, handle hit ~14px).

pub const CHROME_TOP: f64 = 28.0;
pub const BORDER: f64 = 3.0;
/// Clickable / non-passthrough ring thickness (logical px) for resize handles.
pub const HANDLE_HIT: f64 = 14.0;

pub fn outer_size_for_content(content_w: f64, content_h: f64) -> (f64, f64) {
    (
        (content_w + BORDER * 2.0).max(120.0),
        (content_h + CHROME_TOP + BORDER * 2.0).max(100.0),
    )
}

pub fn content_size_from_outer(outer_w: f64, outer_h: f64) -> (f64, f64) {
    (
        (outer_w - BORDER * 2.0).max(1.0),
        (outer_h - CHROME_TOP - BORDER * 2.0).max(1.0),
    )
}
