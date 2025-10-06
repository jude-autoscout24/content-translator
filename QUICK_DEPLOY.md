# ⚡ Quick Deploy to Render - 5 Minutes

## What Changed
✅ Fixed `render.yaml` - now valid YAML configuration  
✅ Aligned port configuration to 3001  
✅ Added proper environment variable definitions  
✅ Ready for one-click deployment!

## Deploy Now (3 Steps)

### 1️⃣ Commit & Push (if needed)
```bash
git add render.yaml server/server.js
git commit -m "Configure for Render deployment"
git push origin main
```

### 2️⃣ Deploy to Render
1. Go to [https://render.com](https://render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repo
4. Select this repository
5. Render detects `render.yaml` automatically ✨

### 3️⃣ Set Environment Variables
When prompted, add:
```
CONTENTFUL_MANAGEMENT_TOKEN=your_contentful_token_here
DEEPL_API_KEY=your_deepl_key_here
```

**Get your keys:**
- Contentful: [https://app.contentful.com/](https://app.contentful.com/) → Settings → API Keys
- DeepL: [https://www.deepl.com/account/summary](https://www.deepl.com/account/summary)

Click **"Apply"** and you're done! 🎉

## After Deployment

Your service will be available at:
```
https://content-translator-server-xyz.onrender.com
```

**Test it:**
```bash
curl https://your-url.onrender.com/health
```

**Update your frontend:**
```bash
# Add to your frontend .env
REACT_APP_API_BASE_URL=https://your-url.onrender.com
```

## Need Help?
See `RENDER_DEPLOYMENT_CHECKLIST.md` for detailed troubleshooting and advanced options.

---
**Free Tier:** Perfect for POC! Spins down after 15 min, first wake takes ~30 sec.
