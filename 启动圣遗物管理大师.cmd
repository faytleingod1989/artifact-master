@echo off
if /I "%~1"=="--dry-run" (
  cscript.exe //nologo "%~dpn0.vbs" --dry-run
) else (
  wscript.exe "%~dpn0.vbs"
)
exit /b %errorlevel%
