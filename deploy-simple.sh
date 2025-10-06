#!/bin/bash

# Simple deployment script for Render + Contentful
echo "🚀 Simple POC Deployment"
echo "======================="

echo "📦 Building frontend..."
npm run build

echo "✅ Frontend built successfully!"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. 🌐 Deploy Server to Render:"
echo "   - Go to https://render.com"
echo "   - Create new Web Service"
echo "   - Connect your GitHub repo"
echo "   - Set root directory to: server"
echo "   - Build command: npm install"
echo "   - Start command: npm start"
echo "   - Add environment variables:"
echo "     * CONTENTFUL_MANAGEMENT_TOKEN=your_token"
echo "     * DEEPL_API_KEY=your_key"
echo ""
echo "2. 📤 Upload Frontend to Contentful:"
echo "   - Update .env with your Render URL:"
echo "     REACT_APP_API_BASE_URL=https://your-app.onrender.com"
echo "   - Rebuild: npm run build"
echo "   - Upload: npm run upload-ci"
echo ""
echo "🎉 That's it! Your POC will be live."