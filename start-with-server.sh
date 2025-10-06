#!/bin/bash

# Content Translator - Start with Server
# Runs both the server and the frontend development server

echo "🚀 Starting Content Translator with Server"
echo "========================================="

# Check if server directory exists
if [ ! -d "server" ]; then
  echo "❌ Server directory not found. Please run this from the content-translator root."
  exit 1
fi

# Check if server dependencies are installed
if [ ! -d "server/node_modules" ]; then
  echo "📦 Installing server dependencies..."
  cd server && npm install && cd ..
fi

# Function to cleanup background processes
cleanup() {
  echo ""
  echo "🛑 Shutting down servers..."
  kill $SERVER_PID $CLIENT_PID 2>/dev/null
  exit 0
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Start the server in the background
echo "🖥️  Starting backend server on port 3001..."
cd server && npm start &
SERVER_PID=$!
cd ..

# Wait a moment for server to start
sleep 2

# Check if server is running
if ! curl -s http://localhost:3001/health > /dev/null; then
  echo "❌ Server failed to start on port 3001"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

echo "✅ Backend server started successfully"

# Start the frontend development server
echo "🌐 Starting frontend development server..."
npm run dev &
CLIENT_PID=$!

echo ""
echo "🎉 Both servers are running!"
echo ""
echo "📋 Access points:"
echo "   • Frontend: http://localhost:5173"
echo "   • Backend:  http://localhost:3001"
echo "   • Health:   http://localhost:3001/health"
echo ""
echo "💡 The extension will now use the server for all cloning and translation operations."
echo "   This solves the CORS issue and keeps all your sophisticated script logic intact."
echo ""
echo "Press Ctrl+C to stop both servers..."

# Wait for processes
wait $CLIENT_PID