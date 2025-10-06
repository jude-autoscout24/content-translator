# Content Translator - Contentful Extension

A Contentful sidebar extension that enables cloning and translating entries directly from the Contentful UI using browser-only services.

## Overview

This extension provides a **browser-only solution** for cloning and translating Contentful entries. It uses the Contentful Management API directly in the browser combined with DeepL's REST API for translation, requiring no external backend infrastructure.

## Architecture

- **Frontend Only**: React/TypeScript sidebar extension running entirely in browser
- **Contentful Integration**: Direct usage of Contentful Management API via `@contentful/react-apps-toolkit`  
- **Translation**: DeepL REST API calls from browser (no Node.js SDK)
- **Deployment**: Single `npm run upload` to Contentful - no external servers needed

## Features

- ✅ **Current Entry Context**: Automatically works with the currently open Contentful entry
- ✅ **One-Click Operation**: Clone and translate with a single button click
- ✅ **Real-time Progress**: Live progress tracking and detailed output
- ✅ **Browser-Only**: No backend server or external infrastructure required
- ✅ **DeepL Translation**: High-quality translation using DeepL REST API
- ✅ **Recursive Cloning**: Handles entry references and relationships
- ✅ **Simple Deployment**: Deploy to Contentful with one command

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Required: DeepL API Configuration
REACT_APP_DEEPL_API_KEY=your_deepl_api_key_here

# Optional: Translation Configuration (defaults shown)
REACT_APP_SOURCE_LANGUAGE=en
REACT_APP_TARGET_LANGUAGE=de
REACT_APP_DEEPL_API_URL=https://api-free.deepl.com/v2
```

**Get your DeepL API Key:**
1. Visit [DeepL Account](https://www.deepl.com/account/summary)
2. Sign up for a free account
3. Copy your API key to the `.env` file

### 3. Development

```bash
npm start
```

### 4. Deploy to Contentful

```bash
# Build the app (includes environment variables)
npm run build

# Upload to Contentful
npm run upload
```

## Usage

1. **Open any entry** in Contentful (entry will be cloned regardless of content type)
2. **Navigate to the sidebar** where the Content Translator extension is installed  
3. **Review the current entry details** displayed in the extension
4. **Check DeepL API status** in the configuration panel
5. **Click "Clone & Translate This Entry"** to start the process
6. **Monitor real-time progress** through the extension interface
7. **Access the cloned entry** via the provided link in the results

## Components

### Browser Services

- **`deeplService.ts`**: Browser-compatible DeepL REST API integration
- **`contentfulCloneService.ts`**: Entry cloning logic using Contentful Management API
- **`scriptService.ts`**: Orchestrates clone and translation operations

### UI Components

- **`ScriptControls.tsx`**: Main control interface with current entry info
- **`ScriptOutput.tsx`**: Real-time operation output and results
- **`ScriptProgress.tsx`**: Live progress tracking
- **`ScriptHistory.tsx`**: Recent operation history
- **`ConfigurationInfo.tsx`**: DeepL API status and configuration validation

### Hooks

- **`useScriptRunner.ts`**: State management for clone operations
- **`useContentfulData.ts`**: Contentful SDK integration and data access

## API Integration

### DeepL REST API
- Browser-compatible HTTP calls (no Node.js SDK)
- Automatic language detection
- Preserves formatting in translations
- Usage quota monitoring

### Contentful Management API
- Direct browser access via `@contentful/react-apps-toolkit`
- Recursive entry cloning with relationship handling
- Automatic publishing of cloned entries
- Progress tracking for long operations

## Environment Variables

**Required:**
- `REACT_APP_DEEPL_API_KEY` - Your DeepL API authentication key

**Optional:**
- `REACT_APP_SOURCE_LANGUAGE` - Source language code (default: 'en')
- `REACT_APP_TARGET_LANGUAGE` - Target language code (default: 'de')  
- `REACT_APP_DEEPL_API_URL` - DeepL API endpoint (default: free tier URL)

## Deployment

**Development:**
```bash
npm start  # Local development with hot reload
```

**Production:**
```bash
npm run build    # Build with environment variables embedded
npm run upload   # Deploy to Contentful (no external infrastructure needed)
```

## Features in Detail

### ✅ **Browser-Only Architecture**
- No backend servers to maintain
- No external hosting required  
- All processing happens client-side
- Direct API integrations from browser

### ✅ **Real Translation via DeepL**
- Uses DeepL's professional translation service
- Supports 30+ languages
- Preserves formatting and context
- Free tier: 500,000 characters/month

### ✅ **Smart Entry Cloning**
- Recursively handles entry references
- Maintains content relationships
- Creates new entries for referenced content
- Publishes cloned entries automatically

### ✅ **Professional UI/UX**
- Real-time progress indicators
- Detailed operation logs
- Error handling with recovery options
- Clean Contentful F36 design system

## Troubleshooting

1. **"DeepL API Not Configured"**: Add `REACT_APP_DEEPL_API_KEY` to your `.env` file
2. **"DeepL API Error"**: Check your API key validity and quota at [DeepL Account](https://www.deepl.com/account)  
3. **Clone failures**: Verify you have proper Contentful Management API permissions
4. **Build errors**: Ensure all environment variables use the `REACT_APP_` prefix

## Limitations (POC)

- Asset cloning not implemented (references preserved)
- Complex nested structures may have simplified handling
- Large entries might be slow due to browser processing
- API keys visible in browser (acceptable for POC/internal use)

This is a **Proof of Concept** implementation focused on demonstrating the browser-only approach with real translation capabilities.
# content-translator
