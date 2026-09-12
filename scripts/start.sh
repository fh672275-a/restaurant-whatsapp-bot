#!/bin/bash
# Start script for Restaurant WhatsApp Bot

cd /home/z/my-project

# Create log directory
mkdir -p /home/z/my-project/logs

# Stop existing server if running
pkill -f "node.*server.js" 2>/dev/null
sleep 2

# Start server in background
nohup node server.js > /home/z/my-project/logs/server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 4

# Check if running
if ps -p $SERVER_PID > /dev/null; then
  echo "✅ Server started successfully (PID: $SERVER_PID)"
  echo "📊 Dashboard: http://localhost:3000"
  echo "👤 Admin login: admin / admin123"
  echo "📝 Logs: /home/z/my-project/logs/server.log"
  
  # Save PID for later
  echo $SERVER_PID > /home/z/my-project/logs/server.pid
else
  echo "❌ Server failed to start"
  cat /home/z/my-project/logs/server.log
  exit 1
fi
