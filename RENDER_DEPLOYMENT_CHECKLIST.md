# 🚀 Render.com Deployment Checklist

## Pre-Deployment Checklist

### ✅ Configuration Files
- [x] `render.yaml` - Valid YAML configuration
- [x] `server/package.json` - Dependencies defined
- [x] `.gitignore` - Excludes sensitive files
- [x] Health check endpoint at `/health`
- [x] Port configuration aligned (3001)

### 📋 Before You Deploy

#### 1. Prepare Your API Keys
You'll need these ready:
- **Contentful Management Token** - Get from [Contentful Settings > API Keys](https://app.contentful.com/)
- **DeepL API Key** - Get from [DeepL Account](https://www.deepl.com/account/summary)

#### 2. Commit Your Changes
```bash
git add .
git commit -m "Configure for Render deployment"
git push origin main
```

## Deployment Steps

### Option A: Deploy via render.yaml (Recommended)

1. **Sign up/Login to Render.com**
   - Go to [https://render.com](https://render.com)
   - Create account or sign in

2. **Create New Blueprint Instance**
   - Click "New +"
   - Select "Blueprint"
   - Connect your GitHub/GitLab repository
   - Select the repository containing this project
   - Render will detect `render.yaml` automatically

3. **Configure Environment Variables**
   Render will prompt you to set these:
   ```
   CONTENTFUL_MANAGEMENT_TOKEN=your_token_here
   DEEPL_API_KEY=your_key_here
   ```
   
   > ⚠️ **Important**: These are marked as `sync: false` in render.yaml, 
   > so you MUST set them manually in the Render dashboard.

4. **Deploy**
   - Click "Apply" to start deployment
   - Wait 2-5 minutes for build and deployment
   - Render will give you a URL like: `https://content-translator-server-xyz.onrender.com`

### Option B: Manual Web Service Creation

1. **Create New Web Service**
   - Click "New +"
   - Select "Web Service"
   - Connect your repository

2. **Configure Service**
   - **Name**: `content-translator-server`
   - **Region**: Oregon (or your preferred region)
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: Leave blank (we use `cd server` in commands)
   - **Runtime**: Node
   - **Build Command**: `cd server && npm ci`
   - **Start Command**: `cd server && npm start`

3. **Set Environment Variables**
   Add these in the "Environment" section:
   ```
   NODE_ENV=production
   PORT=3001
   CONTENTFUL_MANAGEMENT_TOKEN=your_contentful_token_here
   DEEPL_API_KEY=your_deepl_key_here
   ```

4. **Advanced Settings**
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: Yes (recommended)

5. **Create Web Service**
   - Click "Create Web Service"
   - Wait for deployment

## Post-Deployment Verification

### 1. Check Service Health
Once deployed, test these endpoints:

```bash
# Replace YOUR_RENDER_URL with your actual Render URL
export RENDER_URL="https://content-translator-server-xyz.onrender.com"

# Test health check
curl $RENDER_URL/health

# Expected response:
# {"status":"OK","timestamp":"2025-10-06T..."}

# Test DeepL connection
curl $RENDER_URL/api/deepl/status

# Expected response should show:
# {"success":true,"data":{"connected":true,...}}
```

### 2. Test Clone API
```bash
# Test with actual entry ID
curl -X POST $RENDER_URL/api/clone \
  -H "Content-Type: application/json" \
  -d '{
    "sourceEntryId": "your-entry-id",
    "spaceId": "your-space-id",
    "environmentId": "master",
    "sourceLanguage": "de",
    "targetLanguage": "it"
  }'
```

### 3. Monitor Logs
- Go to Render Dashboard → Your Service → Logs
- Check for startup messages:
  ```
  🚀 Content Translator API Server running on port 3001
  📋 Available endpoints:
  ```

## Troubleshooting

### ❌ Build Fails
**Problem**: `npm install` fails
**Solution**: 
- Check `server/package.json` is valid
- Ensure all dependencies are listed
- Try `npm ci` instead of `npm install` in build command

### ❌ Service Won't Start
**Problem**: "Application failed to respond"
**Solution**:
- Verify PORT environment variable is set
- Check server logs for startup errors
- Ensure health check endpoint returns 200 OK

### ❌ Environment Variables Not Set
**Problem**: "CONTENTFUL_MANAGEMENT_TOKEN not set"
**Solution**:
- Go to Render Dashboard → Your Service → Environment
- Add missing environment variables
- Click "Save Changes" (this will redeploy)

### ❌ DeepL API Errors
**Problem**: "DeepL connection failed"
**Solution**:
- Verify your DeepL API key is valid
- Check you haven't exceeded free tier limits (500,000 chars/month)
- Test key at [DeepL Account](https://www.deepl.com/account/summary)

### ⚠️ Slow First Request
**Note**: Render free tier services spin down after 15 minutes of inactivity.
- First request after sleep takes ~30-50 seconds
- This is normal behavior for free tier
- Consider upgrading to paid tier for instant responses

## Update Your Frontend

After successful deployment, update your frontend configuration:

1. **Update API URL**
   In your frontend `.env` or configuration:
   ```bash
   REACT_APP_API_BASE_URL=https://your-render-url.onrender.com
   ```

2. **Rebuild and Deploy Frontend**
   ```bash
   npm run build
   npm run upload-ci
   ```

## Monitoring & Maintenance

### View Service Status
- Dashboard: [https://dashboard.render.com](https://dashboard.render.com)
- Each service shows: Status, Last Deploy, Metrics

### View Logs
- Real-time logs available in dashboard
- Filter by severity: Info, Warning, Error
- Download logs for analysis

### Auto-Deploy
- Enabled by default when using render.yaml
- Every push to main branch triggers deployment
- Can be disabled in service settings

### Cost Management
**Free Tier Limits:**
- 750 hours/month per service
- Spins down after 15 min inactivity
- 100 GB bandwidth/month
- Perfect for POC and development!

**When to Upgrade:**
- Need instant response times
- High traffic volume
- Production environment
- Starting at $7/month for Starter plan

## Useful Commands

### View Service Info
```bash
# Get your service URL from Render dashboard, then:
curl https://your-render-url.onrender.com/health
```

### Trigger Manual Deploy
```bash
# Push any commit to trigger auto-deploy:
git commit --allow-empty -m "Trigger Render deployment"
git push origin main
```

### Check Environment Variables
- Go to: Dashboard → Service → Environment tab
- View all configured variables
- Add/edit/remove variables (triggers redeploy)

## Security Best Practices

### ✅ Do:
- Use environment variables for all secrets
- Enable HTTPS (automatic on Render)
- Keep dependencies updated
- Monitor logs for errors

### ❌ Don't:
- Commit `.env` files to git
- Share your API keys publicly
- Use development tokens in production
- Disable CORS without understanding implications

## Support Resources

- **Render Docs**: [https://render.com/docs](https://render.com/docs)
- **Render Community**: [https://community.render.com](https://community.render.com)
- **This Project**: See README.md and DEPLOYMENT.md

---

## Quick Reference

| Item | Value |
|------|-------|
| Service Type | Web Service |
| Runtime | Node |
| Build Command | `cd server && npm ci` |
| Start Command | `cd server && npm start` |
| Health Check | `/health` |
| Default Port | 3001 |
| Free Tier | ✅ Yes |
| Auto-Deploy | ✅ Yes |

---

**Ready to Deploy?** Follow "Option A" above for the fastest deployment! 🚀
