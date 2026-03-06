#!/bin/bash

# 杀死占用端口的进程（可选，避免端口冲突）
echo "Checking for existing processes on ports 3000 and 5173..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

echo "🚀 Starting FitKeeper..."

# 启动 Python 后端 (使用 uv)
echo "🐍 Starting Python Backend (FastAPI)..."
uv run uvicorn api_python.main:app --reload --port 3000 &
BACKEND_PID=$!

# 等待后端稍微启动一下
sleep 2

# 启动前端 (Vite)
echo "⚛️  Starting Frontend (Vite)..."
npm run client:dev &
FRONTEND_PID=$!

echo "✅ FitKeeper is running!"
echo "   - Backend: http://localhost:3000"
echo "   - Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop both servers."

# 捕获退出信号，同时关闭前后端
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM

# 保持脚本运行
wait
