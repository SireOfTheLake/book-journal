@echo off
rem Builds the Book Journal installer on this computer. Double-click this file.
cd /d "%~dp0"
echo Building Book Journal. The first time takes several minutes.
if not exist node_modules (
  call npm install
  if errorlevel 1 goto failed
)
call npm run tauri build
if errorlevel 1 goto failed
set "FOUND="
for %%f in (src-tauri\target\release\bundle\nsis\*-setup.exe) do set "FOUND=%%f"
if not defined FOUND goto failed
copy /y "%FOUND%" "Book Journal Setup.exe" >nul
echo.
echo Done. Double-click "Book Journal Setup.exe" in this folder to install the app.
echo After that, open Book Journal from the Start menu or the desktop shortcut. No terminal needed.
pause
exit /b 0
:failed
echo.
echo Something went wrong. Copy the red text above and send it to Claude.
pause
exit /b 1
