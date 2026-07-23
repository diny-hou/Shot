# Shot

Compact screenshot app built with Tauri 2 + Vanilla (Vite).

## Features

- Full screen and region capture
- Multi-monitor capture (single display or all displays stitched)
- PNG / JPEG / WebP export
- Resolution presets and custom resize
- Always on top toggle
- Post-capture crop
- Image stock with preview
- Drag preview to export files
- Save folder, prefix, and suffix settings
- One-click in-app updates via GitHub Releases

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

## Auto-update setup

Shot uses the Tauri updater with signed releases hosted on GitHub.

### 1. Generate signing keys (once)

```bash
npx tauri signer generate -w ~/.tauri/shot.key
```

Keep the private key (`shot.key`) secret. Paste the contents of `shot.key.pub` into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

### 2. Build a release

Set the signing key for the build:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\shot.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-key-password"
npm run tauri:build
```

The build produces:

- `src-tauri/target/release/bundle/nsis/Shot_*_x64-setup.exe`
- `src-tauri/target/release/bundle/nsis/Shot_*_x64-setup.exe.sig`
- `src-tauri/target/release/bundle/nsis/Shot_*_x64-setup.nsis.zip` (updater bundle)

### 3. Publish to GitHub Releases

1. Bump `version` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Create a GitHub Release tag (for example `v0.2.0`).
3. Upload the NSIS installer (`.exe`), updater bundle (`.nsis.zip`), and a `latest.json` manifest.

Example `latest.json`:

```json
{
  "version": "0.2.0",
  "notes": "Bug fixes and improvements",
  "pub_date": "2026-07-23T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTENT FROM .exe.sig FILE",
      "url": "https://github.com/diny-hou/Shot/releases/download/v0.2.0/Shot_0.2.0_x64-setup.nsis.zip"
    }
  }
}
```

Users can update from **Preferences → アップデートを確認**. The app checks `latest.json`, downloads the signed bundle, installs it, and restarts.
