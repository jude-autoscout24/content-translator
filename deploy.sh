#!/bin/bash

# Production Deployment Script for Content Translator Server
# This script builds and deploys the content translator server

set -e

echo "🚀 Content Translator - Production Deployment"
echo "============================================="

# Check if environment variables are set
if [[ -z "$CONTENTFUL_MANAGEMENT_TOKEN" || -z "$DEEPL_API_KEY" ]]; then
    echo "❌ Error: Required environment variables not set"
    echo "Please set:"
    echo "  - CONTENTFUL_MANAGEMENT_TOKEN"
    echo "  - DEEPL_API_KEY"
    exit 1
fi

# Build Docker image
echo "📦 Building Docker image..."
docker build -t content-translator:latest .

echo "🔍 Testing Docker image..."
# Test the image
docker run --rm \
    -e CONTENTFUL_MANAGEMENT_TOKEN="$CONTENTFUL_MANAGEMENT_TOKEN" \
    -e DEEPL_API_KEY="$DEEPL_API_KEY" \
    -p 3001:3001 \
    --name content-translator-test \
    content-translator:latest &

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 10

# Health check
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Health check passed!"
else
    echo "❌ Health check failed!"
    docker stop content-translator-test || true
    exit 1
fi

# Stop test container
docker stop content-translator-test

echo "🎉 Build successful! Ready for deployment."
echo ""
echo "To deploy:"
echo "1. Using Docker Compose:"
echo "   docker-compose up -d"
echo ""
echo "2. Using plain Docker:"
echo "   docker run -d \\"
echo "     --name content-translator \\"
echo "     -p 3001:3001 \\"
echo "     -e CONTENTFUL_MANAGEMENT_TOKEN=\"$CONTENTFUL_MANAGEMENT_TOKEN\" \\"
echo "     -e DEEPL_API_KEY=\"$DEEPL_API_KEY\" \\"
echo "     --restart unless-stopped \\"
echo "     content-translator:latest"
echo ""
echo "3. To push to registry (replace with your registry):"
echo "   docker tag content-translator:latest your-registry/content-translator:latest"
echo "   docker push your-registry/content-translator:latest"