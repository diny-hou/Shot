@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [Shot] npm が見つかりません。Node.js をインストールしてください。
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [Shot] 依存関係をインストールしています...
  call npm install
  if errorlevel 1 (
    echo [Shot] npm install に失敗しました。
    pause
    exit /b 1
  )
)

echo [Shot] ビルドを開始します...
call npm run tauri:build
if errorlevel 1 (
  echo [Shot] ビルドに失敗しました。
  pause
  exit /b 1
)

echo.
echo [Shot] ビルド完了。アプリを起動します...
start "" "src-tauri\target\release\shot.exe"
