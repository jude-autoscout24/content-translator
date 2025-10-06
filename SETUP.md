# Content Translator Setup

## Architecture

This extension uses a **backend API + frontend** architecture:
- **Frontend**: React app running in Contentful sidebar
- **Backend**: Express.js server that runs your Node.js scripts

## Environment Variables

### Frontend (.env in main directory)
```env
# Required for Contentful Management API access
REACT_APP_CONTENTFUL_MANAGEMENT_TOKEN=your_contentful_management_token

# Optional: Backend server URL (defaults to http://localhost:3001)
REACT_APP_API_BASE_URL=http://localhost:3001
```

### Backend (server/.env)
```env
# Server Configuration  
PORT=3001

# DeepL Configuration (required for translation)
DEEPL_API_KEY=your_deepl_api_key

# Optional: Translation defaults
SOURCE_LOCALE=DE
TARGET_LOCALE=IT

# Optional: Contentful defaults (can be passed from frontend)
CONTENTFUL_SPACE_ID=your_space_id
CONTENTFUL_ENVIRONMENT_ID=your_environment_id
CONTENTFUL_MANAGEMENT_TOKEN=your_management_token
```

## How to Get Tokens

### Contentful Management Token
1. Go to [Contentful](https://app.contentful.com)
2. Navigate to Settings > API keys
3. Create a new Management Token
4. Copy the token value

### DeepL API Key
1. Go to [DeepL API](https://www.deepl.com/pro-api)
2. Sign up for a DeepL API account
3. Copy your Authentication Key from the account settings

## Installation & Setup

1. **Install frontend dependencies**:
   ```bash
   npm install
   ```

2. **Install backend dependencies**:
   ```bash
   cd server
   npm install
   cd ..
   ```

3. **Create environment files**:
   - Copy `.env.example` to `.env` (main directory)
   - Copy `server/.env.example` to `server/.env`
   - Fill in your tokens

## Development

### Run both frontend and backend together:
```bash
npm run dev
```

### Or run separately:

**Frontend only:**
```bash
npm start
```

**Backend only:**
```bash
npm run server
```

### Production

**Build frontend:**
```bash
npm run build
npm run upload
```

**Deploy backend:**
Deploy the `server/` directory to your preferred hosting platform.

## Usage

1. Start both frontend and backend servers
2. In Contentful, navigate to any entry sidebar
3. The sidebar will show:
   - ✅ Backend server status
   - 📝 Clone entry form
   - 📊 Progress indicator
   - 📋 Results and history

## Features

- **Clone & Translate**: Creates a complete copy of a Contentful entry with translation
- **Deep References**: Handles nested entries and assets  
- **Real-time Progress**: Shows progress during cloning operations
- **Server Status**: Displays backend connectivity status
- **History Tracking**: Keeps record of recent clone operations
- **Error Handling**: Clear error messages and fallbacks

## API Endpoints

The backend server exposes these endpoints:

- `GET /health` - Health check
- `POST /api/clone` - Clone and translate entry
- `POST /api/update` - Incremental update (coming soon)  
- `POST /api/status` - Check translation status (coming soon)