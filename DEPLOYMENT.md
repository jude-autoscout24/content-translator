# 🚀 Simple POC Deployment Guide

## Super Easy 2-Step Deployment

### Step 1: Deploy Server to Render.com

1. **Go to [Render.com](https://render.com)** and sign up
2. **Create New Web Service**
3. **Connect your GitHub repo**: `as24-contentful-extensions`
4. **Configure the service**:
   - **Name**: `content-translator-server`
   - **Root Directory**: `extensions/content-translator/server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Port**: `3001` (Render will auto-detect)

5. **Add Environment Variables**:
   ```
   CONTENTFUL_MANAGEMENT_TOKEN=your_token_here
   DEEPL_API_KEY=your_deepl_key_here
   NODE_ENV=production
   ```

6. **Deploy** - Render will give you a URL like: `https://content-translator-server-xyz.onrender.com`

### Step 2: Deploy Frontend to Contentful

1. **Update your .env file**:
   ```bash
   # Replace with your actual Render URL
   REACT_APP_API_BASE_URL=https://content-translator-server-xyz.onrender.com
   ```

2. **Build and upload**:
   ```bash
   npm run build
   npm run upload-ci
   ```

## That's It! 🎉

Your POC is now live:
- **Backend**: Running on Render
- **Frontend**: Deployed to Contentful
- **Cost**: Free tier on both platforms

## Testing

- Check server health: `https://your-render-url.onrender.com/health`
- Test your Contentful extension in the Contentful web app

## Notes

- Render free tier spins down after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- Perfect for POC and testing!