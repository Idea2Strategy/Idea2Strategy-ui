@echo off
setlocal

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "VITE_ENTRY=%~dp0node_modules\vite\bin\vite.js"

if not exist "%NODE_EXE%" (
  echo [ERROR] Node.js runtime was not found.
  echo Install Node.js LTS, then run: corepack enable
  exit /b 1
)

if not exist "%VITE_ENTRY%" (
  echo [ERROR] Project dependencies were not found.
  echo Run pnpm install after installing Node.js and enabling Corepack.
  exit /b 1
)

echo Starting I2S UI/UX sample...
echo Open http://localhost:5173 in your browser.
"%NODE_EXE%" "%VITE_ENTRY%" --host 127.0.0.1 %*

