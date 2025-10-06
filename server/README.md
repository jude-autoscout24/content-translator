# Content Translator Server

Backend service for the Content Translator extension. Handles all cloning and translation logic server-side to avoid CORS restrictions and provide better performance.

## 🚀 Quick Start

### From the content-translator root directory:

```bash
# Start both server and frontend together
./start-with-server.sh
```

### Or manually:

1. **Configure the server**:
   ```bash
   cd server
   cp .env.example .env
   # Edit .env with your API keys
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

4. **In another terminal, start the frontend**:
   ```bash
   cd .. # back to content-translator root
   npm run dev
   ```

## 🔧 Configuration

Create a `.env` file in the `server/` directory:

```env
# Required: Contentful Management API Token
CONTENTFUL_MANAGEMENT_TOKEN=your_token_here

# Required: DeepL API Key
DEEPL_API_KEY=your_key_here

# Optional: Server port (defaults to 3001)
PORT=3001
```

## 📡 API Endpoints

- `GET /health` - Server health check
- `POST /api/deepl/status` - Check DeepL API connection
- `POST /api/clone` - Clone and translate entries

## 🔄 Architecture

The server provides a clean separation between:
- **Frontend**: User interface and Contentful extension integration
- **Backend**: Complex cloning logic, DeepL translation, API management

### Benefits:
- ✅ Solves CORS issues with DeepL API
- ✅ Keeps all sophisticated clone script logic intact
- ✅ Better error handling and logging
- ✅ Server-side API key management (more secure)
- ✅ Can be deployed independently

## 🛠️ Features Ported from Clone Script

All sophisticated logic from the original clone-entry.ts script:

- **Prefix Configuration**: Automatic `[Clone]` prefixes on specified fields
- **Field Rules**: Empty fields, copy-as-is fields, culture mapping
- **Author Handling**: Smart author matching by name and culture
- **Markdown Translation**: Specialized markdown content translation
- **Language Detection**: Automatic source language detection from culture fields
- **Recursive Cloning**: Handles nested entries and references
- **Asset Management**: Reuses original assets without cloning
- **Error Recovery**: Robust error handling for partial failures

## 🔍 Development

```bash
# Start in development mode (with auto-restart)
npm run dev

# Start in production mode
npm start
```

## 📊 Logging

The server provides detailed logging for:
- Clone operations progress
- Translation requests
- API errors and debugging
- Performance metrics

Check the console output when running the server for detailed operation logs.