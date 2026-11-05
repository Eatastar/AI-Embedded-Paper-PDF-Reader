@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "MARGIN_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined MARGIN_NODE set "MARGIN_NODE=%%N"
if not defined MARGIN_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "MARGIN_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined MARGIN_NODE (
  echo 没有找到 Node.js。请先安装 Node.js 22 或更新版本，或保留 Codex 自带运行环境。
  if /I not "%~1"=="--no-open" pause
  exit /b 1
)
"%MARGIN_NODE%" "%~dp0scripts\launch.mjs" %*
if errorlevel 1 (
  if /I not "%~1"=="--no-open" pause
  exit /b 1
)
exit /b 0
