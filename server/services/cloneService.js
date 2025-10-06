/**
 * Server-side Contentful entry cloning service
 * Ported from the sophisticated clone-entry.ts script logic with full deepl-node support
 */

import * as deepl from 'deepl-node';

export class ServerContentfulCloneService {
  constructor(cmaClient, deeplApiKey) {
    this.cma = cmaClient;
    this.space = null;
    this.environment = null;
    this.spaceId = null;
    this.environmentId = null;
    this.cloneMap = new Map(); // Maps original ID to cloned ID
    this.processingSet = new Set(); // Tracks items being processed to handle circular refs
    this.contentTypeCache = new Map(); // Cache content type schemas
    this.mainCmsPageSourceLanguage = null; // Source language from the main CmsPage entry
    this.currentEntryContentType = null; // Track current entry being processed
    this.translator = null;

    // Configuration ported from the original script
    this.prefixConfig = {
      prefix: '[Clone]',
      targetFields: ['title'], // Only add [Clone] prefix to title field
      fieldTypes: ['Symbol', 'Text'],
    };

    this.translationConfig = {
      enabled: !!deeplApiKey,
      sourceLanguage: '',
      targetLanguage: 'IT',
      translateableTypes: ['Symbol', 'Text'],
      preservePrefix: true, // Preserve the [Clone] prefix during translation
      markdownMethod: 'html-only',
      usePreprocessing: false,
    };

    this.cultureMapping = {
      EN: 'en-GB',
      DE: 'de-DE',
      FR: 'fr-FR',
      IT: 'it-IT',
      ES: 'es-ES',
      NL: 'nl-NL',
      PT: 'pt-PT',
      RU: 'ru-RU',
      BG: 'bg-BG',
      CS: 'cs-CZ',
      HR: 'hr-HR',
      HU: 'hu-HU',
      PL: 'pl-PL',
      RO: 'ro-RO',
      SV: 'sv-SE',
      TR: 'tr-TR',
      UK: 'uk-UA',
      CA: 'en-CA',
      'FR-CA': 'fr-CA',
      'FR-BE': 'fr-BE',
      'NL-BE': 'nl-BE',
      'FR-LU': 'fr-LU',
      'DE-AT': 'de-AT',
    };

    this.cultureFieldNames = ['culture'];

    this.emptyFieldsConfig = {
      enabled: true,
      fieldIds: ['slug', 'parentPage', 'productionUrl', 'authors'],
    };

    this.copyAsIsConfig = {
      enabled: true,
      fieldIds: [
        'domain',
        'pageType',
        'productionUrl',
        'makeModel',
        'publicationDate',
        'lastModificationDate',
        'makeIds',
        'modelIds',
        'trackingName',
      ],
    };

    this.authorConfig = {
      enabled: true,
      fieldIds: ['authors'],
      authorContentType: 'author',
      matchFields: ['name'],
      cultureField: 'locale',
    };

    this.markdownFieldsConfig = {
      enabled: true,
      fieldMappings: {
        author: ['bio'],
        cmsPage: ['teaserText'],
        evmodelfinder: ['additional_information'],
        questionAnswer: ['answerLong'],
        infobox: ['text'],
        scSuperhero: ['text', 'bulletList'],
        scBenefit: ['text'],
        scMediaSection: ['text', 'bulletList'],
        scTeaser: ['text'],
        scText: ['content'],
        tierPricingTableCell: ['content', 'tooltipText'],
        tierPricingPlanTableSection: ['tooltipText'],
        tierPricingPlan: ['description'],
      },
    };

    // Initialize DeepL translator if API key is available
    console.log(
      `🔧 Translation config - enabled: ${
        this.translationConfig.enabled
      }, API key available: ${!!deeplApiKey}`
    );
    if (this.translationConfig.enabled && deeplApiKey) {
      this.translator = new deepl.Translator(deeplApiKey);
      console.log('🌐 DeepL Translator initialized successfully');
    } else {
      console.log(
        '⚠️ DeepL Translator NOT initialized - translation will be skipped'
      );
    }
  }

  /**
   * Clone an entry and translate its content using the original script logic
   */
  async cloneEntry(options) {
    const {
      sourceEntryId,
      spaceId,
      environmentId,
      sourceLanguage = 'de',
      targetLanguage = 'it',
      onProgress,
    } = options;

    this.spaceId = spaceId;
    this.environmentId = environmentId;

    // Convert target language to DeepL format (lowercase)
    this.translationConfig.targetLanguage = targetLanguage.toLowerCase();
    this.cloneMap.clear();
    this.processingSet.clear();

    console.log(
      `🌍 Language configuration: source=${sourceLanguage}, target=${targetLanguage} → DeepL target: ${this.translationConfig.targetLanguage}`
    );

    onProgress?.('🔍 Initializing Contentful connection...');

    // Initialize space and environment references
    this.space = await this.cma.getSpace(spaceId);
    this.environment = await this.space.getEnvironment(environmentId);

    onProgress?.('🔍 Fetching source entry...');

    // Get the source entry
    const sourceEntry = await this.environment.getEntry(sourceEntryId);

    // Validate that the entry is a CmsPage
    const contentTypeId = sourceEntry.sys.contentType.sys.id;
    if (contentTypeId !== 'cmsPage') {
      throw new Error(
        `❌ This tool only works with CmsPage content type. Found: ${contentTypeId}`
      );
    }

    onProgress?.('🌍 Detecting source language...');

    // Detect source language from culture field
    this.mainCmsPageSourceLanguage = this.detectSourceLocaleFromEntry(
      sourceEntry.fields
    );
    if (!this.mainCmsPageSourceLanguage) {
      throw new Error(
        'Main CmsPage entry is missing required culture field for source language detection'
      );
    }

    onProgress?.(
      `📋 Cloning entry with detected source language: ${this.mainCmsPageSourceLanguage}`
    );

    // Clone the entry using the original script logic
    const clonedEntryId = await this.cloneEntryRecursive(
      sourceEntry,
      spaceId,
      environmentId,
      'en-US-POSIX', // Always use default Contentful locale for field storage
      onProgress
    );

    // Generate URLs
    const originalUrl = `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${sourceEntryId}`;
    const clonedUrl = `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${clonedEntryId}`;

    onProgress?.('✅ Clone completed successfully!');

    const cloneMapping = Object.fromEntries(this.cloneMap);
    console.log(`🔍 DEBUG - Final cloneMap size: ${this.cloneMap.size}`);
    console.log(`🔍 DEBUG - Final cloneMapping:`, cloneMapping);
    console.log(`🔍 DEBUG - CloneMapping keys:`, Object.keys(cloneMapping));

    return {
      originalUrl,
      clonedUrl,
      originalEntryId: sourceEntryId,
      clonedEntryId,
      cloneMapping,
    };
  }

  /**
   * Detect source locale from entry culture field (ported from original script)
   */
  detectSourceLocaleFromEntry(entryFields) {
    for (const cultureFieldName of this.cultureFieldNames) {
      const cultureField = entryFields[cultureFieldName];
      if (cultureField) {
        const localeValues = Object.values(cultureField);
        if (localeValues.length > 0 && typeof localeValues[0] === 'string') {
          const contentfulLocale = localeValues[0];
          return this.mapContentfulLocaleToDeepLLanguage(contentfulLocale);
        }
      }
    }
    return null;
  }

  /**
   * Map Contentful locales to DeepL language codes (ported from original script)
   */
  mapContentfulLocaleToDeepLLanguage(contentfulLocale) {
    const localeMapping = {
      'de-DE': 'DE',
      'de-AT': 'DE',
      'en-GB': 'EN-GB',
      'en-US': 'EN-US',
      'en-CA': 'EN-US',
      'fr-FR': 'FR',
      'fr-BE': 'FR',
      'fr-CA': 'FR',
      'fr-LU': 'FR',
      'it-IT': 'IT',
      'es-ES': 'ES',
      'nl-NL': 'NL',
      'nl-BE': 'NL',
      'pt-PT': 'PT-PT',
      'pt-BR': 'PT-BR',
      'ru-RU': 'RU',
      'ja-JP': 'JA',
      'zh-CN': 'ZH',
      'pl-PL': 'PL',
      'sv-SE': 'SV',
      'da-DK': 'DA',
      'fi-FI': 'FI',
      'no-NO': 'NB',
      'cs-CZ': 'CS',
      'et-EE': 'ET',
      'lv-LV': 'LV',
      'lt-LT': 'LT',
      'sk-SK': 'SK',
      'sl-SI': 'SL',
      'bg-BG': 'BG',
      'hu-HU': 'HU',
      'ro-RO': 'RO',
      'uk-UA': 'UK',
      'tr-TR': 'TR',
    };

    return localeMapping[contentfulLocale] || null;
  }

  /**
   * Clone entry recursively using original script logic
   */
  async cloneEntryRecursive(
    sourceEntry,
    spaceId,
    environmentId,
    locale,
    onProgress
  ) {
    const sourceId = sourceEntry.sys.id;
    const key = `Entry:${sourceId}`;

    if (this.cloneMap.has(key)) {
      return this.cloneMap.get(key);
    }

    const previousContentType = this.currentEntryContentType;

    try {
      onProgress?.(`🔄 Processing entry: ${sourceId}`);

      const contentType = await this.getContentType(
        sourceEntry.sys.contentType.sys.id
      );

      this.currentEntryContentType = sourceEntry.sys.contentType.sys.id;

      // Detect source language for this entry
      const isCmsPage = sourceEntry.sys.contentType.sys.id === 'cmsPage';
      let detectedSourceLanguage = null;

      if (isCmsPage) {
        detectedSourceLanguage = this.detectSourceLocaleFromEntry(
          sourceEntry.fields
        );
      } else {
        detectedSourceLanguage = this.mainCmsPageSourceLanguage;
      }

      // Create entry data structure
      const entryData = {
        fields: {},
      };

      // Get field definitions
      const fieldDefinitions = contentType.fields.reduce((acc, field) => {
        acc[field.id] = field;
        return acc;
      }, {});

      // Find fields to prefix
      const prefixFieldIds = this.findPrefixFields(
        contentType.fields,
        sourceEntry.fields
      );

      // Process each field
      for (const fieldDef of contentType.fields) {
        const fieldId = fieldDef.id;
        const originalFieldValue = sourceEntry.fields[fieldId];

        if (originalFieldValue) {
          // Check if field should be emptied
          if (this.shouldEmptyField(fieldId)) {
            const emptyValue = this.getEmptyValueForField(fieldDef, locale);
            if (emptyValue !== null) {
              entryData.fields[fieldId] = emptyValue;
            }
            continue;
          }

          // Check if field should be copied as-is
          if (this.shouldCopyAsIs(fieldId)) {
            const processedField = {};
            for (const [fieldLocale, value] of Object.entries(
              originalFieldValue
            )) {
              processedField[fieldLocale] = await this.processFieldValue(
                value,
                fieldLocale,
                fieldId
              );
            }
            entryData.fields[fieldId] = processedField;
            continue;
          }

          // Check if this is an author field
          if (this.isAuthorField(fieldId)) {
            const processedField = {};
            for (const [fieldLocale, value] of Object.entries(
              originalFieldValue
            )) {
              processedField[fieldLocale] = await this.processFieldValue(
                value,
                fieldLocale,
                fieldId
              );
            }
            entryData.fields[fieldId] = processedField;
            continue;
          }

          // Process field normally
          const processedField = {};
          for (const [fieldLocale, value] of Object.entries(
            originalFieldValue
          )) {
            let processedValue = await this.processFieldValue(
              value,
              fieldLocale,
              fieldId
            );

            // Add prefix if needed
            if (
              this.shouldPrefixField(fieldId, prefixFieldIds) &&
              typeof processedValue === 'string'
            ) {
              processedValue = `${this.prefixConfig.prefix} ${processedValue}`;
            }

            // Set culture field
            if (this.isCultureField(fieldId)) {
              const cultureValue = this.getCultureValue();
              if (cultureValue) {
                processedValue = cultureValue;
              }
            }
            // Handle markdown fields
            else if (
              this.isMarkdownField(
                sourceEntry.sys.contentType.sys.id,
                fieldId
              ) &&
              detectedSourceLanguage
            ) {
              if (fieldId === 'bulletList' && Array.isArray(processedValue)) {
                processedValue = await this.translateBulletList(
                  processedValue,
                  detectedSourceLanguage
                );
              } else if (typeof processedValue === 'string') {
                processedValue = await this.translateMarkdownContent(
                  processedValue,
                  detectedSourceLanguage
                );
              }
            }
            // Translate text fields
            else if (
              typeof processedValue === 'string' &&
              !this.isCultureField(fieldId) &&
              !this.isMarkdownField(sourceEntry.sys.contentType.sys.id, fieldId)
            ) {
              console.log(
                `🔄 About to translate field '${fieldId}' of type '${fieldDef.type}' with source language '${detectedSourceLanguage}'`
              );
              processedValue = await this.translateText(
                processedValue,
                fieldDef.type,
                detectedSourceLanguage
              );
              console.log(
                `✨ Translation result for '${fieldId}': '${processedValue.substring(
                  0,
                  100
                )}...'`
              );
            }

            processedField[fieldLocale] = processedValue;
          }
          entryData.fields[fieldId] = processedField;
        } else if (fieldDef.required) {
          // Handle required missing fields
          if (this.shouldEmptyField(fieldId)) {
            const emptyValue = this.getEmptyValueForField(fieldDef, locale);
            if (emptyValue !== null) {
              entryData.fields[fieldId] = emptyValue;
            }
          } else {
            const defaultValue = await this.getDefaultValueForField(
              fieldDef,
              locale
            );
            if (defaultValue !== null) {
              entryData.fields[fieldId] = defaultValue;
            }
          }
        }
      }

      // Create the new entry
      const newEntry = await this.environment.createEntry(
        sourceEntry.sys.contentType.sys.id,
        entryData
      );

      onProgress?.(`✓ Cloned entry ${sourceId} → ${newEntry.sys.id}`);

      this.cloneMap.set(key, newEntry.sys.id);
      console.log(`🔍 DEBUG - Added to cloneMap: ${key} → ${newEntry.sys.id}`);
      console.log(`🔍 DEBUG - CloneMap size now: ${this.cloneMap.size}`);
      this.currentEntryContentType = previousContentType;

      return newEntry.sys.id;
    } catch (error) {
      this.currentEntryContentType = previousContentType;
      throw error;
    }
  }

  // Helper methods ported from original script
  async getContentType(contentTypeId) {
    if (this.contentTypeCache.has(contentTypeId)) {
      return this.contentTypeCache.get(contentTypeId);
    }

    const contentType = await this.environment.getContentType(contentTypeId);

    this.contentTypeCache.set(contentTypeId, contentType);
    return contentType;
  }

  findPrefixFields(contentTypeFields, entryFields) {
    const fieldsToPrefix = [];

    for (const targetField of this.prefixConfig.targetFields) {
      const fieldDef = contentTypeFields.find(
        (field) => field.id.toLowerCase() === targetField.toLowerCase()
      );
      if (
        fieldDef &&
        this.prefixConfig.fieldTypes.includes(fieldDef.type) &&
        entryFields[fieldDef.id]
      ) {
        fieldsToPrefix.push(fieldDef.id);
      }
    }

    return fieldsToPrefix;
  }

  shouldPrefixField(fieldId, prefixFieldIds) {
    return prefixFieldIds.includes(fieldId);
  }

  isCultureField(fieldId) {
    return this.cultureFieldNames.some((cultureName) =>
      fieldId.toLowerCase().includes(cultureName.toLowerCase())
    );
  }

  shouldEmptyField(fieldId) {
    return (
      this.emptyFieldsConfig.enabled &&
      this.emptyFieldsConfig.fieldIds.includes(fieldId)
    );
  }

  shouldCopyAsIs(fieldId) {
    return (
      this.copyAsIsConfig.enabled &&
      this.copyAsIsConfig.fieldIds.includes(fieldId)
    );
  }

  isMarkdownField(contentTypeId, fieldId) {
    if (!this.markdownFieldsConfig.enabled) return false;
    const contentTypeFields =
      this.markdownFieldsConfig.fieldMappings[contentTypeId];
    return contentTypeFields?.includes(fieldId) || false;
  }

  isAuthorField(fieldId) {
    return (
      this.authorConfig.enabled && this.authorConfig.fieldIds.includes(fieldId)
    );
  }

  getCultureValue() {
    const targetLang = this.translationConfig.targetLanguage;
    // Convert to uppercase since cultureMapping uses uppercase keys
    const upperTargetLang = targetLang.toUpperCase();
    console.log(
      `🔍 DEBUG - getCultureValue: targetLang="${targetLang}" → upperTargetLang="${upperTargetLang}"`
    );
    const result = this.cultureMapping[upperTargetLang] || null;
    console.log(`🔍 DEBUG - Culture mapping result: "${result}"`);
    return result;
  }

  getEmptyValueForField(fieldDefinition, locale) {
    const fieldType = fieldDefinition.type;

    switch (fieldType) {
      case 'Symbol':
      case 'Text':
        return { [locale]: '' };
      case 'Array':
        return { [locale]: [] };
      case 'Object':
        return { [locale]: {} };
      default:
        return null;
    }
  }

  async getDefaultValueForField(fieldDefinition, locale) {
    const fieldType = fieldDefinition.type;

    // Handle dropdown fields
    if (fieldType === 'Symbol' && fieldDefinition.validations) {
      for (const validation of fieldDefinition.validations) {
        if (
          validation.in &&
          Array.isArray(validation.in) &&
          validation.in.length > 0
        ) {
          return { [locale]: validation.in[0] };
        }
      }
    }

    switch (fieldType) {
      case 'Symbol':
      case 'Text':
        return { [locale]: `Default ${fieldDefinition.id}` };
      case 'Integer':
      case 'Number':
        return { [locale]: 0 };
      case 'Boolean':
        return { [locale]: false };
      case 'Date':
        return { [locale]: new Date().toISOString() };
      case 'Array':
        return { [locale]: [] };
      case 'Object':
        return { [locale]: {} };
      default:
        return { [locale]: null };
    }
  }

  async processFieldValue(value, locale, fieldId) {
    if (Array.isArray(value)) {
      const processedArray = [];
      for (const item of value) {
        if (item && item.sys && item.sys.type === 'Link') {
          const processedLink = await this.processLinkField(
            item,
            locale,
            fieldId
          );
          if (processedLink !== null) {
            processedArray.push(processedLink);
          }
        } else {
          processedArray.push(
            await this.processFieldValue(item, locale, fieldId)
          );
        }
      }
      return processedArray;
    } else if (
      value &&
      typeof value === 'object' &&
      value.sys &&
      value.sys.type === 'Link'
    ) {
      return await this.processLinkField(value, locale, fieldId);
    }

    return value;
  }

  async processLinkField(linkValue, locale, fieldId) {
    if (!linkValue || !linkValue.sys) return linkValue;

    const { linkType, id } = linkValue.sys;
    const key = `${linkType}:${id}`;

    // Check if already cloned
    if (this.cloneMap.has(key)) {
      return {
        sys: {
          type: 'Link',
          linkType: linkType,
          id: this.cloneMap.get(key),
        },
      };
    }

    // Check for circular reference
    if (this.processingSet.has(key)) {
      return linkValue; // Return original to break cycle
    }

    this.processingSet.add(key);

    try {
      if (linkType === 'Entry') {
        // Special handling for author fields
        if (fieldId && this.isAuthorField(fieldId)) {
          const originalAuthor = await this.environment.getEntry(id);

          if (
            originalAuthor.sys.contentType.sys.id ===
            this.authorConfig.authorContentType
          ) {
            const targetCulture = this.getCultureValue();
            if (targetCulture) {
              const existingAuthorId = await this.findExistingAuthor(
                originalAuthor,
                targetCulture
              );
              if (existingAuthorId) {
                this.cloneMap.set(key, existingAuthorId);
                this.processingSet.delete(key);
                return {
                  sys: {
                    type: 'Link',
                    linkType: 'Entry',
                    id: existingAuthorId,
                  },
                };
              }
            }
          }
        }

        // Default entry cloning
        const sourceEntry = await this.environment.getEntry(id);

        const clonedEntryId = await this.cloneEntryRecursive(
          sourceEntry,
          this.spaceId,
          this.environmentId,
          locale
        );

        this.processingSet.delete(key);
        return {
          sys: {
            type: 'Link',
            linkType: 'Entry',
            id: clonedEntryId,
          },
        };
      } else if (linkType === 'Asset') {
        // For assets, reuse the original (don't clone)
        this.cloneMap.set(key, id);
        this.processingSet.delete(key);
        return linkValue;
      }
    } catch (error) {
      console.error(`❌ Failed to process link ${key}: ${error.message}`);
      this.processingSet.delete(key);
      return linkValue;
    }

    this.processingSet.delete(key);
    return linkValue;
  }

  async findExistingAuthor(authorEntry, targetCulture) {
    try {
      const authorFields = authorEntry.fields;

      for (const matchField of this.authorConfig.matchFields) {
        if (authorFields[matchField]) {
          const fieldValue = Object.values(authorFields[matchField])[0];
          if (fieldValue && typeof fieldValue === 'string') {
            const query = {
              content_type: this.authorConfig.authorContentType,
              [`fields.${this.authorConfig.cultureField}`]: targetCulture,
              [`fields.${matchField}`]: fieldValue,
              limit: 1,
            };

            const entries = await this.environment.getEntries(query);

            if (entries.items.length > 0) {
              return entries.items[0].sys.id;
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.warn(`⚠️ Error searching for existing author: ${error.message}`);
      return null;
    }
  }

  async translateText(text, fieldType, sourceLanguage) {
    console.log(
      `🔤 translateText called: enabled=${
        this.translationConfig.enabled
      }, translator=${!!this.translator}, text=${
        text ? text.substring(0, 50) + '...' : 'empty'
      }, fieldType=${fieldType}`
    );

    if (!this.translationConfig.enabled || !this.translator || !text) {
      console.log(
        `⏭️ Translation skipped: enabled=${
          this.translationConfig.enabled
        }, translator=${!!this.translator}, text=${!!text}`
      );
      return text;
    }

    if (!this.translationConfig.translateableTypes.includes(fieldType)) {
      console.log(
        `⏭️ Field type '${fieldType}' not in translateableTypes: [${this.translationConfig.translateableTypes.join(
          ', '
        )}]`
      );
      return text;
    }

    const effectiveSourceLanguage =
      sourceLanguage || this.translationConfig.sourceLanguage;

    console.log(
      `🗣️ Source language resolution: provided='${sourceLanguage}', config='${this.translationConfig.sourceLanguage}', effective='${effectiveSourceLanguage}'`
    );

    if (!effectiveSourceLanguage) {
      console.log(
        `⏭️ No effective source language available - skipping translation`
      );
      return text;
    }

    try {
      let textToTranslate = text;
      let extractedPrefix = '';

      console.log(`🔍 DEBUGGING PREFIX - Input text: '${text}'`);
      console.log(
        `🔍 DEBUGGING PREFIX - Starts with '${
          this.prefixConfig.prefix
        }': ${text.startsWith(this.prefixConfig.prefix)}`
      );
      console.log(
        `🔍 DEBUGGING PREFIX - preservePrefix: ${this.translationConfig.preservePrefix}`
      );

      if (
        this.translationConfig.preservePrefix &&
        text.startsWith(this.prefixConfig.prefix)
      ) {
        extractedPrefix = this.prefixConfig.prefix + ' ';
        textToTranslate = text.substring(extractedPrefix.length);
        console.log(
          `🏷️ Prefix extracted: '${extractedPrefix}' (length: ${extractedPrefix.length})`
        );
        console.log(
          `🏷️ Text to translate: '${textToTranslate.substring(0, 50)}...'`
        );
      } else {
        console.log(`🏷️ No prefix extraction - will translate full text`);
      }

      if (!textToTranslate.trim() || textToTranslate.trim().length < 2) {
        return text;
      }

      console.log(
        `🌐 Calling DeepL API: '${textToTranslate.substring(
          0,
          50
        )}...' from '${effectiveSourceLanguage}' to '${
          this.translationConfig.targetLanguage
        }'`
      );

      const result = await this.translator.translateText(
        textToTranslate,
        effectiveSourceLanguage,
        this.translationConfig.targetLanguage
      );

      console.log(`✅ DeepL response: '${result.text.substring(0, 50)}...'`);
      const finalResult = extractedPrefix + result.text;
      console.log(
        `✨ Translation result for '${fieldType}': '${finalResult.substring(
          0,
          100
        )}...'`
      );
      return finalResult;
    } catch (error) {
      console.warn(`⚠️ Translation failed for text: ${error.message}`);
      return text;
    }
  }

  async translateMarkdownContent(content, sourceLanguage) {
    if (!this.translationConfig.enabled || !this.translator) {
      return content;
    }

    try {
      console.log(
        `📝 translateMarkdownContent called: '${content.substring(0, 50)}...'`
      );

      // Use HTML-only method as in the original script
      let processedContent = content;

      // Protect entire image markdown from translation
      const imageMap = new Map();
      let imageCounter = 0;

      // First, protect entire image markdown blocks
      processedContent = processedContent.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        (match, caption, url) => {
          const token = `IMG_PLACEHOLDER_${++imageCounter}`;
          // Store the original caption and URL separately for later translation
          imageMap.set(token, { caption, url, fullMatch: match });
          console.log(
            `🖼️ Protected image ${imageCounter}: caption="${caption}", url="${url}"`
          );
          return token;
        }
      );

      // Translate content
      const result = await this.translator.translateText(
        processedContent,
        sourceLanguage,
        this.translationConfig.targetLanguage,
        {
          preserveFormatting: true,
          tagHandling: 'xml',
        }
      );

      let finalResult = result.text;

      // Restore images with translated captions
      for (const [token, imageData] of imageMap) {
        try {
          // Translate the image caption separately
          const translatedCaption = await this.translator.translateText(
            imageData.caption,
            sourceLanguage,
            this.translationConfig.targetLanguage,
            {
              preserveFormatting: true,
            }
          );

          // Reconstruct the image markdown with translated caption and original URL
          const translatedImageMarkdown = `![${translatedCaption.text}](${imageData.url})`;
          finalResult = finalResult.replace(token, translatedImageMarkdown);
          console.log(
            `🖼️ Restored image: "${translatedCaption.text}" -> ${imageData.url}`
          );
        } catch (error) {
          console.warn(
            `⚠️ Failed to translate image caption, using original:`,
            error
          );
          // Fallback to original image markdown
          finalResult = finalResult.replace(token, imageData.fullMatch);
        }
      }

      console.log(
        `✨ MARKDOWN Translation result: '${finalResult.substring(0, 100)}...'`
      );

      return finalResult;
    } catch (error) {
      console.error('❌ Failed to translate markdown content:', error);
      return content;
    }
  }

  async translateBulletList(bulletList, sourceLanguage) {
    const translatedBullets = [];

    for (const bullet of bulletList) {
      try {
        const translatedBullet = await this.translateMarkdownContent(
          bullet,
          sourceLanguage
        );
        translatedBullets.push(translatedBullet);
      } catch (error) {
        console.error(`❌ Failed to translate bullet:`, error);
        translatedBullets.push(bullet);
      }
    }

    return translatedBullets;
  }
}
