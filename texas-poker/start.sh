# ============================================
#  多人德州扑克 - 启动脚本
# ============================================

echo "🃏 多人德州扑克 - 启动中..."
echo ""

# 检查依赖
if [ ! -d "server/node_modules" ]; then
  echo "📦 安装服务端依赖..."
  cd server && npm install && cd ..
fi

if [ ! -d "client/node_modules" ]; then
  echo "📦 安装客户端依赖..."
  cd client && npm install && cd ..
fi

# 启动服务端
echo "🚀 启动游戏服务器 (端口 3001)..."
cd server && npx tsx src/index.ts &
SERVER_PID=$!
cd ..

sleep 2

# 检查 ngrok
if command -v ngrok &> /dev/null; then
  echo ""
  echo "🌐 启动 ngrok 内网穿透..."
  echo "   请确保已配置 ngrok authtoken: ngrok config add-authtoken <你的token>"
  echo ""
  ngrok http 3001 --log=stdout &
  NGROK_PID=$!
  echo ""
  echo "========================================="
  echo "  ngrok 启动后，复制 Forwarding 地址"
  echo "  例如: https://xxxx.ngrok-free.app"
  echo "  然后在浏览器打开前端页面输入该地址"
  echo "========================================="
else
  echo ""
  echo "⚠️  未检测到 ngrok，请手动安装:"
  echo "   brew install ngrok        (macOS)"
  echo "   或下载: https://ngrok.com/download"
  echo ""
  echo "   安装后运行: ngrok http 3001"
  echo ""
fi

# 启动前端开发服务器
echo ""
echo "🎨 启动前端 (端口 5173)..."
cd client && npx vite --host 0.0.0.0 &
CLIENT_PID=$!
cd ..

echo ""
echo "========================================="
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:3001"
echo "========================================="
echo ""
echo "按 Ctrl+C 停止所有服务"

# 清理
trap "kill $SERVER_PID $NGROK_PID $CLIENT_PID 2>/dev/null; exit" INT TERM
wait
