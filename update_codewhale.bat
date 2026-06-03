@echo off
setlocal enabledelayedexpansion

set "CW_DIR=%APPDATA%\npm\node_modules\codewhale"
set "BIN_DIR=%CW_DIR%\bin"
set "DL_DIR=%BIN_DIR%\downloads"

echo CodeWhale Update Tool
echo Current: v0.8.45  Target: v0.8.50
echo.

:waitloop
echo Waiting for codewhale to exit...
tasklist /fi "imagename eq codewhale.exe" 2>nul | find /i "codewhale.exe" >nul
if errorlevel 1 goto replace
timeout /t 2 /nobreak >nul
goto waitloop

:replace
echo Codewhale exited. Replacing binaries...

if exist "%DL_DIR%\codewhale.exe" (
    move /y "%DL_DIR%\codewhale.exe" "%DL_DIR%\codewhale.exe.old" >nul
)
if exist "%DL_DIR%\codewhale-tui.exe" (
    move /y "%DL_DIR%\codewhale-tui.exe" "%DL_DIR%\codewhale-tui.exe.old" >nul
)

copy /y "%BIN_DIR%\codewhale.exe.new" "%DL_DIR%\codewhale.exe" >nul 2>&1
if errorlevel 1 (
    echo Failed to copy CLI binary
    pause
    exit /b 1
)

copy /y "%BIN_DIR%\codewhale-tui.exe.new" "%DL_DIR%\codewhale-tui.exe" >nul 2>&1
if errorlevel 1 (
    echo Failed to copy TUI binary
    pause
    exit /b 1
)

echo.
echo Update to v0.8.50 complete!
echo You can now start codewhale again.
echo.
pause
