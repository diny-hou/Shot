@echo off
setlocal
cd /d "%~dp0"

set "EXE=src-tauri\target\release\shot.exe"

if exist "%EXE%" (
  start "" "%EXE%"
  exit /b 0
)

echo.
echo [Shot] 実行ファイルが見つかりません。
echo        %EXE%
echo.
echo 次のいずれかを実行してください:
echo   - build.bat を実行してビルドする
echo   - dev.bat を実行して開発モードで起動する
echo.
pause
exit /b 1
