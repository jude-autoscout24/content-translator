import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import contentfulManagement from 'contentful-management';
import * as deepl from 'deepl-node';
import { ServerIncrementalTranslationService } from './services/incrementalTranslationService.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global error handlers to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// DeepL status check endpoint
app.get('/api/deepl/status', async (req, res) => {
  try {
    const apiKey = process.env.DEEPL_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error:
          'Server configuration error: DEEPL_API_KEY not set in server environment',
      });
    }

    const translator = new deepl.Translator(apiKey);

    try {
      console.log('🔍 Testing DeepL API connection...');
      console.log('🔑 API Key length:', apiKey.length);
      console.log('🔑 API Key prefix:', apiKey.substring(0, 10) + '...');

      const usage = await translator.getUsage();
      console.log('✅ DeepL usage retrieved successfully');

      const sourceLanguages = await translator.getSourceLanguages();
      console.log('✅ DeepL source languages retrieved successfully');

      const targetLanguages = await translator.getTargetLanguages();
      console.log('✅ DeepL target languages retrieved successfully');

      res.json({
        success: true,
        data: {
          connected: true,
          usage: {
            character: {
              count: usage.character?.count || 0,
              limit: usage.character?.limit || 500000,
            },
          },
          supportedLanguages: {
            source: sourceLanguages.map((lang) => ({
              code: lang.code,
              name: lang.name,
            })),
            target: targetLanguages.map((lang) => ({
              code: lang.code,
              name: lang.name,
            })),
          },
        },
      });
    } catch (error) {
      console.error('DeepL API error:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        response: error.response?.data || 'No response data',
      });
      res.json({
        success: true,
        data: {
          connected: false,
          error: `DeepL connection failed: ${error.message}`,
          details: {
            errorType: error.name,
            apiKeyConfigured: !!process.env.DEEPL_API_KEY,
            apiKeyLength: process.env.DEEPL_API_KEY?.length || 0,
          },
        },
      });
    }
  } catch (error) {
    console.error('DeepL status check failed:', error);
    console.error('Server error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.substring(0, 500),
      apiKeyPresent: !!process.env.DEEPL_API_KEY,
    });
    res.status(500).json({
      success: false,
      error: `DeepL connection check failed: ${error.message}`,
      details: {
        apiKeyConfigured: !!process.env.DEEPL_API_KEY,
        suggestion: !process.env.DEEPL_API_KEY
          ? 'DEEPL_API_KEY environment variable is not set. Please configure it in your .env file or environment.'
          : 'Check your DeepL API key validity and network connection.',
      },
    });
  }
});

// Clone entry endpoint with sophisticated translation logic
app.post('/api/clone', async (req, res) => {
  try {
    console.log(
      '🔍 DEBUG - Raw request body:',
      JSON.stringify(req.body, null, 2)
    );

    const {
      sourceEntryId,
      spaceId,
      environmentId,
      sourceLanguage,
      targetLanguage,
      targetLanguages,
    } = req.body;

    console.log('🔍 DEBUG - Destructured values:', {
      sourceEntryId,
      spaceId,
      environmentId,
      sourceLanguage,
      targetLanguage,
      targetLanguages,
    });

    // Support both single targetLanguage (backward compatibility) and multiple targetLanguages
    const targetLangs =
      targetLanguages || (targetLanguage ? [targetLanguage] : ['it']);

    console.log('🔍 DEBUG - Final targetLangs:', targetLangs);

    console.log(
      `📥 Request body languages: sourceLanguage='${sourceLanguage}', targetLanguage='${targetLanguage}', targetLanguages='${JSON.stringify(
        targetLanguages
      )}', resolved targetLangs='${JSON.stringify(targetLangs)}'`
    );

    // Get DeepL API key from server environment
    const deeplApiKey = process.env.DEEPL_API_KEY;

    // Get management token from server environment
    const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

    // Validate required parameters
    if (!sourceEntryId || !spaceId || !environmentId) {
      return res.status(400).json({
        success: false,
        error:
          'Missing required parameters: sourceEntryId, spaceId, environmentId',
      });
    }

    if (!managementToken) {
      return res.status(500).json({
        success: false,
        error:
          'Server configuration error: CONTENTFUL_MANAGEMENT_TOKEN not set in server environment',
      });
    }

    if (!deeplApiKey) {
      return res.status(500).json({
        success: false,
        error:
          'Server configuration error: DEEPL_API_KEY not set in server environment',
      });
    }

    console.log(`🚀 Starting clone operation for entry: ${sourceEntryId}`);
    console.log(
      `🌐 Translation enabled: ${sourceLanguage || 'auto'} → ${JSON.stringify(
        targetLangs
      )}`
    );
    console.log(`🔑 DeepL API key available: ${deeplApiKey ? '✅' : '❌'}`);
    console.log(
      `🔍 DEBUG - About to process ${targetLangs.length} target languages:`,
      targetLangs
    );

    // Import the server-side clone service
    const { ServerContentfulCloneService } = await import(
      './services/cloneService.js'
    );

    // Initialize Contentful Management API
    const client = contentfulManagement.createClient({
      accessToken: managementToken,
    });

    // Initialize the clone service
    const cloneService = new ServerContentfulCloneService(client, deeplApiKey);

    // Execute clone operations for each target language
    const allResults = [];
    const allCloneMappings = {};

    console.log(`🔍 DEBUG - Starting loop over targetLangs:`, targetLangs);
    for (const targetLang of targetLangs) {
      console.log(`🌍 Processing target language: ${targetLang}`);

      // Execute the clone operation
      const result = await cloneService.cloneEntry({
        sourceEntryId,
        spaceId,
        environmentId,
        sourceLanguage,
        targetLanguage: targetLang,
        onProgress: (message) => console.log(`📋 [${targetLang}] ${message}`),
      });

      console.log(`🔍 DEBUG - Clone result for ${targetLang}:`, {
        cloneMapping: result.cloneMapping,
        cloneMappingKeys: Object.keys(result.cloneMapping || {}),
        cloneMappingLength: Object.keys(result.cloneMapping || {}).length,
        cloneMappingFirstEntry: Object.entries(result.cloneMapping || {})[0],
      });

      allResults.push(result);
      Object.assign(allCloneMappings, result.cloneMapping);

      console.log(
        `✅ Clone completed for ${targetLang}: ${result.originalEntryId} → ${result.clonedEntryId}`
      );
    }

    // Create metadata for incremental updates
    try {
      const incrementalService = new ServerIncrementalTranslationService(
        client,
        deeplApiKey
      );

      for (let i = 0; i < allResults.length; i++) {
        const result = allResults[i];
        const targetLang = targetLangs[i];

        await incrementalService.createTranslationMetadata({
          sourceEntryId: result.originalEntryId,
          targetEntryId: result.clonedEntryId,
          sourceLanguage: sourceLanguage || 'de',
          targetLanguage: targetLang,
          spaceId,
          environmentId,
          cloneMapping: result.cloneMapping,
        });
        console.log(
          `📝 Created metadata for: ${result.originalEntryId} → ${result.clonedEntryId} (${targetLang})`
        );
      }
    } catch (metadataError) {
      console.warn(
        '⚠️ Failed to create incremental update metadata:',
        metadataError.message
      );
      // Don't fail the clone operation if metadata creation fails
    }

    // Use first result as primary but include all results
    const primaryResult = allResults[0];

    // Combine results for response
    const combinedResult = {
      ...primaryResult,
      cloneMapping: allCloneMappings,
      allResults,
      targetLocales: targetLangs,
    };

    res.json({
      success: true,
      data: combinedResult,
      message: `Clone completed successfully for ${targetLangs.length} locale${
        targetLangs.length !== 1 ? 's' : ''
      }`,
    });
  } catch (error) {
    console.error('❌ Clone operation failed:', error.message);

    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error occurred',
    });
  }
});

// Check incremental update status
app.get('/api/incremental/status', async (req, res) => {
  try {
    const { entryId, targetLanguage, spaceId, environmentId } = req.query;

    if (!spaceId || !environmentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters: spaceId, environmentId',
      });
    }

    const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
    const deeplApiKey = process.env.DEEPL_API_KEY;

    if (!managementToken) {
      return res.status(500).json({
        success: false,
        error:
          'Server configuration error: CONTENTFUL_MANAGEMENT_TOKEN not set',
      });
    }

    // Initialize services
    const cma = contentfulManagement.createClient({
      accessToken: managementToken,
    });

    const incrementalService = new ServerIncrementalTranslationService(
      cma,
      deeplApiKey
    );
    await incrementalService.initialize(spaceId, environmentId);

    // Find translation relationships for this entry and language
    console.log(
      `🔍 DEBUG: Looking for relationships for entryId: ${entryId}, targetLanguage: ${targetLanguage}`
    );
    const relationships = await incrementalService.getTranslationRelationships(
      entryId
    );
    console.log(
      `🔍 DEBUG: Found ${relationships.length} relationships:`,
      relationships.map((r) => ({
        id: r.id,
        targetLang: r.translationContext.targetLanguage,
      }))
    );

    // Helper function to normalize language codes for comparison
    const normalizeLanguageCode = (lang) => {
      if (!lang) return '';
      // Convert it-IT to it, nl-BE to nl, etc.
      return lang.split('-')[0].toLowerCase();
    };

    const targetRelationship = relationships.find((rel) => {
      const relLang = normalizeLanguageCode(
        rel.translationContext.targetLanguage
      );
      const searchLang = normalizeLanguageCode(targetLanguage);
      console.log(
        `🔍 DEBUG: Comparing normalized: ${relLang} === ${searchLang}`
      );
      return relLang === searchLang;
    });
    console.log(`🔍 DEBUG: Target relationship found:`, !!targetRelationship);

    if (!targetRelationship) {
      return res.json({
        success: true,
        data: {
          hasRelationship: false,
          hasChanges: false,
          upToDate: false,
          changes: [],
          conflicts: [],
          error: 'No translation relationship found for this language.',
          suggestion:
            'Create initial translation first using the Clone & Translate feature.',
        },
      });
    }

    // Check update status for the found relationship
    const status = await incrementalService.checkUpdateStatus(
      entryId,
      targetRelationship.targetEntryId
    );

    console.log(
      `🔍 DEBUG: API Response data:`,
      JSON.stringify(status, null, 2)
    );

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('❌ Status check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Perform incremental update
app.post('/api/incremental/update', async (req, res) => {
  try {
    const {
      sourceEntryId,
      targetEntryId,
      spaceId,
      environmentId,
      options = {},
    } = req.body;

    if (!sourceEntryId || !targetEntryId || !spaceId || !environmentId) {
      return res.status(400).json({
        success: false,
        error:
          'Missing required parameters: sourceEntryId, targetEntryId, spaceId, environmentId',
      });
    }

    const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
    const deeplApiKey = process.env.DEEPL_API_KEY;

    if (!managementToken) {
      return res.status(500).json({
        success: false,
        error:
          'Server configuration error: CONTENTFUL_MANAGEMENT_TOKEN not set',
      });
    }

    // Initialize services
    const cma = contentfulManagement.createClient({
      accessToken: managementToken,
    });

    const incrementalService = new ServerIncrementalTranslationService(
      cma,
      deeplApiKey
    );
    await incrementalService.initialize(spaceId, environmentId);

    // Perform incremental update
    const result = await incrementalService.performIncrementalUpdate(
      sourceEntryId,
      targetEntryId,
      options
    );

    res.json({
      success: result.success,
      data: result,
      message:
        result.message ||
        (result.success ? 'Update completed successfully' : 'Update failed'),
    });
  } catch (error) {
    console.error('❌ Incremental update failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get translation relationships for an entry
app.get('/api/incremental/relationships/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params;
    const { spaceId, environmentId } = req.query;

    if (!spaceId || !environmentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters: spaceId, environmentId',
      });
    }

    const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
    const deeplApiKey = process.env.DEEPL_API_KEY;

    if (!managementToken) {
      return res.status(500).json({
        success: false,
        error:
          'Server configuration error: CONTENTFUL_MANAGEMENT_TOKEN not set',
      });
    }

    // Initialize services
    const cma = contentfulManagement.createClient({
      accessToken: managementToken,
    });

    const incrementalService = new ServerIncrementalTranslationService(
      cma,
      deeplApiKey
    );
    await incrementalService.initialize(spaceId, environmentId);

    // Get relationships
    const relationships = await incrementalService.getTranslationRelationships(
      entryId
    );

    res.json({
      success: true,
      data: relationships,
    });
  } catch (error) {
    console.error('❌ Error getting relationships:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get backup history for an entry
app.get('/api/incremental/backups/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params;
    const { spaceId, environmentId } = req.query;

    if (!spaceId || !environmentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters: spaceId, environmentId',
      });
    }

    const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
    const deeplApiKey = process.env.DEEPL_API_KEY;

    if (!managementToken) {
      return res.status(500).json({
        success: false,
        error:
          'Server configuration error: CONTENTFUL_MANAGEMENT_TOKEN not set',
      });
    }

    // Initialize services
    const cma = contentfulManagement.createClient({
      accessToken: managementToken,
    });

    const incrementalService = new ServerIncrementalTranslationService(
      cma,
      deeplApiKey
    );
    await incrementalService.initialize(spaceId, environmentId);

    // Get backup history
    const backups = await incrementalService.getBackupHistory(entryId);

    res.json({
      success: true,
      data: backups,
    });
  } catch (error) {
    console.error('❌ Error getting backups:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get deep reference statistics for a translation relationship
app.get(
  '/api/incremental/deep-references/:sourceEntryId/:targetEntryId',
  async (req, res) => {
    try {
      const { sourceEntryId, targetEntryId } = req.params;
      const { spaceId, environmentId } = req.query;

      if (!spaceId || !environmentId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required query parameters: spaceId, environmentId',
        });
      }

      const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
      const deeplApiKey = process.env.DEEPL_API_KEY;

      if (!managementToken) {
        return res.status(500).json({
          success: false,
          error:
            'Server configuration error: CONTENTFUL_MANAGEMENT_TOKEN not set',
        });
      }

      // Initialize services
      const cma = contentfulManagement.createClient({
        accessToken: managementToken,
      });

      const incrementalService = new ServerIncrementalTranslationService(
        cma,
        deeplApiKey
      );
      await incrementalService.initialize(spaceId, environmentId);

      // Get deep reference statistics
      const stats = await incrementalService.getDeepReferenceStatistics(
        sourceEntryId,
        targetEntryId
      );

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('❌ Error getting deep reference statistics:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Rebuild deep reference map for a translation relationship
app.post(
  '/api/incremental/deep-references/:sourceEntryId/:targetEntryId/rebuild',
  async (req, res) => {
    try {
      const { sourceEntryId, targetEntryId } = req.params;
      const { spaceId, environmentId } = req.body;

      if (!spaceId || !environmentId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: spaceId, environmentId',
        });
      }

      const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
      const deeplApiKey = process.env.DEEPL_API_KEY;

      if (!managementToken) {
        return res.status(500).json({
          success: false,
          error:
            'Server configuration error: CONTENTFUL_MANAGEMENT_TOKEN not set',
        });
      }

      // Initialize services
      const cma = contentfulManagement.createClient({
        accessToken: managementToken,
      });

      const incrementalService = new ServerIncrementalTranslationService(
        cma,
        deeplApiKey
      );
      await incrementalService.initialize(spaceId, environmentId);

      // Rebuild deep reference map
      const success = await incrementalService.rebuildDeepReferenceMap(
        sourceEntryId,
        targetEntryId
      );

      res.json({
        success,
        data: { rebuilt: success },
        message: success
          ? 'Deep reference map rebuilt successfully'
          : 'Failed to rebuild deep reference map',
      });
    } catch (error) {
      console.error('❌ Error rebuilding deep reference map:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Status check endpoint
app.post('/api/status', async (req, res) => {
  try {
    const { sourceUrl, targetEntryId, spaceId, environmentId } = req.body;

    // Get management token from server environment
    const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

    // Validate required parameters
    if (!sourceUrl || !targetEntryId || !spaceId || !environmentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
      });
    }

    if (!managementToken) {
      return res.status(500).json({
        success: false,
        error:
          'Server configuration error: CONTENTFUL_MANAGEMENT_TOKEN not set in server environment',
      });
    }

    // TODO: Implement status check using your metadata service

    res.json({
      success: true,
      data: {
        sourceUrl,
        targetEntryId,
        status: 'up-to-date',
        lastUpdated: new Date().toISOString(),
        pendingChanges: [],
      },
      message: 'Status check functionality coming soon',
    });
  } catch (error) {
    console.error('❌ Status check failed:', error.message);

    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error occurred',
    });
  }
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Content Translator API Server running on port ${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /api/deepl/status - Check DeepL API connection`);
  console.log(`   POST /api/clone - Clone and translate entry`);
  console.log(
    `   GET  /api/incremental/status/:sourceId/:targetId - Check update status`
  );
  console.log(`   POST /api/incremental/update - Perform incremental update`);
  console.log(
    `   GET  /api/incremental/relationships/:entryId - Get translation relationships`
  );
  console.log(`   GET  /api/incremental/backups/:entryId - Get backup history`);
  console.log(`   POST /api/status - Check translation status (legacy)`);
});

export default app;
