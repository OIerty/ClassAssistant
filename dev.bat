@echo off
chcp 65001 >nul
echo ======================================
echo   上课摸鱼搭子 - 一键开发模式
echo ======================================
echo.

echo [1/2] 启动后端服务 (FastAPI)...
start "ClassAssistant-Backend" cmd /k "cd /d %~dp0api-service && call F:\MyProgram\Anaconda3\Scripts\activate.bat && call conda activate class-assistant && python -m uvicorn main:app --host 127.0.0.1 --port 8765 --reload"

echo       等待后端就绪...
timeout /t 4 >nul

echo [2/2] 启动前端 Tauri 开发模式...
cd /d %~dp0app-ui
npm run tauri dev
