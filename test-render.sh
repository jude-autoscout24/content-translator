#!/bin/bash

# Quick test script for Render deployment
echo "🧪 Testing Render Deployment Setup"
echo "=================================="

echo "1. Checking server directory..."
if [ -d "server" ]; then
    echo "✅ Server directory exists"
else
    echo "❌ Server directory not found"
    exit 1
fi

echo "2. Checking server package.json..."
if [ -f "server/package.json" ]; then
    echo "✅ Server package.json exists"
else
    echo "❌ Server package.json not found"
    exit 1
fi

echo "3. Checking if server can start..."
cd server || exit
if npm list --depth=0 > /dev/null 2>&1; then
    echo "✅ Server dependencies look good"
else
    echo "⚠️  Installing server dependencies..."
    npm install
fi

echo "4. Testing server start..."
timeout 10s npm start &
SERVER_PID=$!
sleep 3

if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "✅ Server starts successfully"
    kill $SERVER_PID 2>/dev/null
else
    echo "❌ Server failed to start"
    exit 1
fi

cd ..

echo ""
echo "🎉 Everything looks good for Render deployment!"
echo ""
echo "Next steps:"
echo "1. Push your code to GitHub"
echo "2. Go to render.com and create a new Web Service"
echo "3. Point it to your repo with root directory 'extensions/content-translator/server'"
echo "4. Set build command: npm install"
echo "5. Set start command: npm start"
echo "6. Add your environment variables"