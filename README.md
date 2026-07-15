# Shot

Compact screenshot app built with Tauri 2 + Vanilla (Vite).

## Features

- Full screen and region capture
- PNG / JPEG / WebP export
- Resolution presets and custom resize
- Always on top toggle
- Post-capture crop
- Image stock with preview
- Drag preview to export files
- Save folder, prefix, and suffix settings

## Development

```bash
npm install
npm run tauri:dev
```

Or double-click `dev.bat`.

## Run (release build)

Double-click `start.bat`.

If the executable is not built yet, run `build.bat` first.

## Build

```bash
npm run tauri:build
```

Or double-click `build.bat`.

The executable is generated under `src-tauri/target/release/`.
