@echo off
chcp 65001 >nul
setlocal
if not exist "%~dp0diagnose-launch.ps1" (
  echo 没有找到 diagnose-launch.ps1，请把诊断工具完整解压后再试。
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose-launch.ps1"
echo.
pause
endlocal
