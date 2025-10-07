/**
 * Server-side Incremental Translation Service
 * Bridges the existing TypeScript services with the Express server
 * Enhanced with deep reference change detection capabilities
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'fs';
import { join, dirname } from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ChangeDetectionService } from './changeDetectionService.js';
import { ContentfulMetadataService } from './contentfulMetadataService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ServerIncrementalTranslationService {
  constructor(cmaClient, deeplApiKey) {
    this.cma = cmaClient;
    this.deeplApiKey = deeplApiKey;
    this.space = null;
    this.environment = null;
    this.spaceId = null;
    this.environmentId = null;

    // Initialize tracking directory (backward compatibility)
    this.trackingDir = join(process.cwd(), 'data', 'tracking');
    this.ensureTrackingDirectory();

    // Initialize Contentful metadata service (will be set after initialize() is called)
    this.contentfulMetadataService = null;

    // Initialize change detection service with metadata service
    const self = this;
    this.metadataService = {
      getTrackingDir: () => this.trackingDir,
      getRelationship: (sourceId, targetId) =>
        this.getRelationship(sourceId, targetId),
      createOrUpdateRelationship: (...args) =>
        this.createOrUpdateRelationship(...args),
      get contentfulMetadataService() {
        return self.contentfulMetadataService;
      },
    };

    this.changeDetectionService = new ChangeDetectionService(
      this.metadataService,
      deeplApiKey
    );
  }

  /**
   * Initialize Contentful connection
   */
  async initialize(spaceId, environmentId) {
    this.spaceId = spaceId;
    this.environmentId = environmentId;
    this.space = await this.cma.getSpace(spaceId);
    this.environment = await this.space.getEnvironment(environmentId);

    // Initialize Contentful metadata service
    this.contentfulMetadataService = new ContentfulMetadataService(
      this.environment
    );
    console.log('✅ Initialized Contentful metadata service');
  }

  /**
   * Check if incremental updates are available for a translation relationship
   */
  async checkUpdateStatus(sourceEntryId, targetEntryId) {
    try {
      console.log(
        `🔍 Checking update status: ${sourceEntryId} → ${targetEntryId}`
      );

      // Get the translation relationship metadata
      const relationship = await this.getRelationship(
        sourceEntryId,
        targetEntryId
      );

      if (!relationship) {
        return {
          hasRelationship: false,
          error: 'No translation relationship found between these entries.',
          suggestion:
            'Create initial translation first using the Clone & Translate feature.',
        };
      }

      // Get current source entry
      const sourceEntry = await this.environment.getEntry(sourceEntryId);
      const currentVersion =
        sourceEntry.sys.publishedVersion || sourceEntry.sys.version;
      const lastTranslatedVersion = relationship.metadata.lastTranslatedVersion;

      console.log(
        `📊 Version check: Current ${currentVersion} vs Last Translated ${lastTranslatedVersion}`
      );

      // Initialize deep reference tracking and wait for completion
      await this.initializeDeepTrackingAsync(this.environment, {
        maxDepth: 3,
        autoTranslateNewRefs: true,
      });

      // Enhanced change detection with deep reference monitoring
      const changes =
        await this.changeDetectionService.detectParentFieldChanges(
          sourceEntry,
          lastTranslatedVersion,
          sourceEntryId,
          targetEntryId,
          this.environment
        );

      // Check for conflicts (manual modifications in target)
      const conflicts = await this.detectConflicts(
        sourceEntryId,
        targetEntryId
      );

      const hasChanges = changes.length > 0;

      console.log(
        `📋 Status: ${
          hasChanges ? changes.length + ' changes' : 'up to date'
        }, ${conflicts.length} conflicts`
      );

      // Update the stored reference map even when no changes are found
      // (this handles the case where references were removed)
      if (this.deepReferenceTracker) {
        await this.deepReferenceTracker.updateStoredReferencesAfterProcessing(
          sourceEntryId,
          targetEntryId
        );
      }

      return {
        hasRelationship: true,
        hasChanges,
        upToDate: !hasChanges,
        changes,
        conflicts,
        metadata: {
          lastTranslatedVersion,
          currentVersion,
          lastUpdated: relationship.metadata.lastUpdated,
          sourceLanguage: relationship.translationContext.sourceLanguage,
          targetLanguage: relationship.translationContext.targetLanguage,
        },
      };
    } catch (error) {
      console.error('❌ Error checking update status:', error);
      return {
        hasRelationship: false,
        error: error.message,
        hasChanges: false,
        changes: [],
        conflicts: [],
      };
    }
  }

  /**
   * Perform incremental update of a translated entry
   */
  async performIncrementalUpdate(sourceEntryId, targetEntryId, options = {}) {
    try {
      console.log(
        `🚀 Starting incremental update: ${sourceEntryId} → ${targetEntryId}`
      );

      // Store current IDs for child entry translation
      this.currentSourceEntryId = sourceEntryId;
      this.currentTargetEntryId = targetEntryId;

      const relationship = await this.getRelationship(
        sourceEntryId,
        targetEntryId
      );
      if (!relationship) {
        throw new Error('No translation relationship found');
      }

      // Get entries
      const sourceEntry = await this.environment.getEntry(sourceEntryId);
      const targetEntry = await this.environment.getEntry(targetEntryId);

      // Create backup before updating
      const backupId = await this.createBackupSnapshot(
        targetEntryId,
        targetEntry,
        'Pre-incremental-update'
      );
      console.log(`💾 Created backup: ${backupId}`);

      // Initialize deep reference tracking and wait for completion
      await this.initializeDeepTrackingAsync(this.environment, {
        maxDepth: 3,
        autoTranslateNewRefs: true,
      });

      // Enhanced change detection with deep reference monitoring
      const changes =
        await this.changeDetectionService.detectParentFieldChanges(
          sourceEntry,
          relationship.metadata.lastTranslatedVersion,
          sourceEntryId,
          targetEntryId,
          this.environment
        );

      if (changes.length === 0) {
        console.log('✅ No changes to apply - translation is up to date');
        return {
          success: true,
          upToDate: true,
          fieldsUpdated: [],
          backupId,
          message: 'Translation is already up to date',
        };
      }

      console.log(
        `📝 Applying ${changes.length} changes:`,
        changes.map((c) => c.fieldName)
      );

      // Apply translations to changed fields
      const fieldsUpdated = [];
      for (const change of changes) {
        await this.translateAndUpdateField(
          targetEntry,
          change,
          relationship.translationContext
        );
        fieldsUpdated.push(change.fieldName);
      }

      // Update target entry
      const updatedEntry = await targetEntry.update();
      console.log(`✅ Target entry updated (v${updatedEntry.sys.version})`);

      // Update relationship metadata
      const currentVersion =
        sourceEntry.sys.publishedVersion || sourceEntry.sys.version;
      const currentFieldHashes = this.generateFieldHashes(sourceEntry);

      await this.createOrUpdateRelationship(
        sourceEntryId,
        targetEntryId,
        currentVersion,
        relationship.translationContext,
        currentFieldHashes,
        relationship.cloneMapping || {}
      );

      // Update reference versions for deep reference monitoring
      await this.changeDetectionService.updateReferenceVersions(
        sourceEntry,
        sourceEntryId,
        targetEntryId,
        this.environment
      );

      console.log(`✅ Incremental update completed successfully`);

      // Update the stored reference map now that all changes have been processed
      if (this.deepReferenceTracker) {
        await this.deepReferenceTracker.updateStoredReferencesAfterProcessing(
          sourceEntryId,
          targetEntryId
        );
      }

      return {
        success: true,
        fieldsUpdated,
        backupId,
        newVersion: updatedEntry.sys.version,
        message: `Successfully updated ${fieldsUpdated.length} fields`,
      };
    } catch (error) {
      console.error('❌ Incremental update failed:', error);
      return {
        success: false,
        error: error.message,
        fieldsUpdated: [],
      };
    }
  }

  /**
   * Get all translation relationships for an entry
   */
  async getTranslationRelationships(entryId) {
    try {
      console.log(
        `🔍 DEBUG getTranslationRelationships: Looking for entryId: ${entryId}`
      );

      const relationships = [];

      // Try Contentful first
      if (this.contentfulMetadataService) {
        try {
          console.log(
            `🔍 DEBUG: Searching Contentful for relationships with entry: ${entryId}`
          );

          // Get all relationships where this entry is either source or target
          const entries = await this.environment.getEntries({
            content_type: 'translationMetadata',
            // Use OR query to find relationships where entryId is either source or target
            'sys.id[exists]': true, // This gets all translationMetadata entries
            limit: 1000, // Increase limit to get all relationships
          });

          console.log(
            `🔍 DEBUG: Found ${entries.total} total relationship entries in Contentful`
          );

          // Filter relationships that contain our entryId
          for (const entry of entries.items) {
            try {
              const sourceEntryId = entry.fields.sourceEntryId?.['en-US-POSIX'];
              const targetEntryId = entry.fields.targetEntryId?.['en-US-POSIX'];

              if (!sourceEntryId || !targetEntryId) {
                console.warn(
                  `⚠️ Skipping entry ${entry.sys.id}: missing source or target ID`
                );
                continue;
              }

              // Check if this relationship involves our entryId
              if (sourceEntryId === entryId || targetEntryId === entryId) {
                const isSource = sourceEntryId === entryId;
                const relatedEntryId = isSource ? targetEntryId : sourceEntryId;

                console.log(
                  `✅ Found relationship: ${sourceEntryId} -> ${targetEntryId} (entry is ${
                    isSource ? 'source' : 'target'
                  })`
                );

                // Get entry details for the related entry
                let relatedEntry = null;
                try {
                  relatedEntry = await this.environment.getEntry(
                    relatedEntryId
                  );
                } catch (error) {
                  console.warn(
                    `⚠️ Could not fetch related entry ${relatedEntryId}: ${error.message}`
                  );
                }

                const metadata = entry.fields.metadata?.['en-US-POSIX'] || {};
                const translationContext =
                  entry.fields.translationContext?.['en-US-POSIX'] || {};

                relationships.push({
                  id: `${sourceEntryId}_${targetEntryId}`,
                  sourceEntryId: sourceEntryId,
                  targetEntryId: targetEntryId,
                  isSource,
                  relatedEntry: relatedEntry
                    ? {
                        id: relatedEntryId,
                        contentType: relatedEntry.sys.contentType.sys.id,
                        title: this.getEntryTitle(relatedEntry),
                        lastModified: relatedEntry.sys.updatedAt,
                      }
                    : {
                        id: relatedEntryId,
                        contentType: 'unknown',
                        title: 'Entry not accessible',
                        lastModified: 'unknown',
                      },
                  translationContext: translationContext,
                  lastTranslatedVersion: metadata.lastTranslatedVersion || 0,
                  lastUpdated: metadata.lastUpdated || entry.sys.updatedAt,
                });
              }
            } catch (error) {
              console.warn(
                `⚠️ Error processing relationship entry ${entry.sys.id}: ${error.message}`
              );
            }
          }

          console.log(
            `🔍 DEBUG: Found ${relationships.length} relationships for entry ${entryId} in Contentful`
          );

          if (relationships.length > 0) {
            return relationships;
          }
        } catch (error) {
          console.warn(
            `⚠️ Failed to get relationships from Contentful: ${error.message}`
          );
        }
      }

      // Fallback to file system (legacy support)
      console.log(
        `🔍 DEBUG: Falling back to file system. Tracking directory: ${this.trackingDir}`
      );

      if (!existsSync(this.trackingDir)) {
        console.log(`🔍 DEBUG: Tracking directory does not exist`);
        return relationships;
      }

      const files = readdirSync(this.trackingDir);
      console.log(`🔍 DEBUG: Files in tracking dir:`, files);

      const relationshipFiles = files.filter(
        (file) =>
          file.includes(entryId) &&
          file.endsWith('.json') &&
          !file.includes('_deep_refs')
      );
      console.log(`🔍 DEBUG: Filtered relationship files:`, relationshipFiles);

      for (const file of relationshipFiles) {
        try {
          const filePath = join(this.trackingDir, file);
          const content = readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);

          // Determine if this entry is source or target
          const [sourceId, targetId] = file.replace('.json', '').split('_');
          const isSource = sourceId === entryId;
          const relatedEntryId = isSource ? targetId : sourceId;

          // Get entry details
          const relatedEntry = await this.environment.getEntry(relatedEntryId);

          relationships.push({
            id: `${sourceId}_${targetId}`,
            sourceEntryId: sourceId,
            targetEntryId: targetId,
            isSource,
            relatedEntry: {
              id: relatedEntryId,
              contentType: relatedEntry.sys.contentType.sys.id,
              title: this.getEntryTitle(relatedEntry),
              lastModified: relatedEntry.sys.updatedAt,
            },
            translationContext: data.translationContext,
            lastTranslatedVersion: data.metadata.lastTranslatedVersion,
            lastUpdated: data.metadata.lastUpdated,
          });
        } catch (error) {
          console.warn(
            `⚠️ Error reading relationship file ${file}:`,
            error.message
          );
        }
      }

      console.log(
        `🔍 DEBUG: Found ${relationships.length} relationships for entry ${entryId} from file system`
      );
      return relationships;
    } catch (error) {
      console.error('❌ Error getting relationships:', error);
      return [];
    }
  }

  /**
   * Get backup history for an entry
   */
  async getBackupHistory(entryId) {
    try {
      const backups = [];
      const backupDir = join(this.trackingDir, 'backups');

      if (!existsSync(backupDir)) {
        return backups;
      }

      const files = readdirSync(backupDir);
      const backupFiles = files.filter(
        (file) => file.startsWith(`${entryId}_`) && file.endsWith('.json')
      );

      for (const file of backupFiles) {
        try {
          const filePath = join(backupDir, file);
          const content = readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);

          backups.push({
            backupId: file.replace('.json', ''),
            entryId: data.entryId,
            timestamp: data.timestamp,
            reason: data.reason,
            version: data.entrySnapshot.sys.version,
            createdAt: new Date(data.timestamp).toISOString(),
          });
        } catch (error) {
          console.warn(`⚠️ Error reading backup file ${file}:`, error.message);
        }
      }

      // Sort by timestamp (newest first)
      backups.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return backups;
    } catch (error) {
      console.error('❌ Error getting backup history:', error);
      return [];
    }
  }

  // Private helper methods

  /**
   * Ensure tracking directory exists
   */
  ensureTrackingDirectory() {
    if (!existsSync(this.trackingDir)) {
      mkdirSync(this.trackingDir, { recursive: true });
    }

    const backupDir = join(this.trackingDir, 'backups');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }
  }

  /**
   * Get relationship metadata between source and target entries
   */
  async getRelationship(sourceEntryId, targetEntryId) {
    const relationshipId = `${sourceEntryId}_${targetEntryId}`;
    console.log(`🔍 Looking for relationship: ${relationshipId}`);

    // Try Contentful first
    if (this.contentfulMetadataService) {
      try {
        const data =
          await this.contentfulMetadataService.getRelationshipMetadata(
            sourceEntryId,
            targetEntryId
          );
        if (data) {
          console.log(
            `📖 ✅ Retrieved relationship from Contentful: ${relationshipId}`
          );
          return data;
        } else {
          console.log(
            `📖 ❌ No relationship found in Contentful: ${relationshipId}`
          );
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to get relationship from Contentful, falling back to file: ${error.message}`
        );
      }
    }

    // Fallback to file system
    const filename = `${sourceEntryId}_${targetEntryId}.json`;
    const filePath = join(this.trackingDir, filename);

    console.log(`📁 Checking file system for: ${filePath}`);

    if (!existsSync(filePath)) {
      console.log(`📁 ❌ No relationship file found: ${filename}`);
      console.log(
        `💡 This indicates the relationship was never created or the server storage is inconsistent.`
      );
      console.log(
        `💡 Make sure to run a full translation to establish the relationship.`
      );
      return null;
    }

    console.log(`📁 ✅ Found relationship file: ${filename}`);

    try {
      const content = readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      // Check if this is a deep references file (different structure)
      if (data.sourceEntryId && data.targetEntryId && data.referenceTree) {
        console.error(
          `❌ Attempted to read deep references file ${filename} as relationship file.`
        );
        console.log(
          '💡 Use getDeepReferencesData() method for deep references files instead.'
        );
        return null;
      }

      // Validate that the data has the expected relationship structure
      if (!data.metadata || !data.metadata.lastTranslatedVersion) {
        console.error(
          `❌ Invalid relationship file structure in ${filename}:`,
          data
        );
        console.log(
          'Expected structure: { metadata: { lastTranslatedVersion: number, ... }, ... }'
        );
        return null;
      }

      console.log(`📖 Retrieved relationship from file: ${filename}`);
      return data;
    } catch (error) {
      console.error(
        `❌ Error reading relationship file ${filename}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Get deep references data from tracking file
   */
  async getDeepReferencesData(sourceEntryId, targetEntryId) {
    const filename = `${sourceEntryId}_${targetEntryId}_deep_refs.json`;
    const filePath = join(this.trackingDir, filename);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      // Validate deep references file structure
      if (!data.sourceEntryId || !data.targetEntryId || !data.referenceTree) {
        console.error(
          `❌ Invalid deep references file structure in ${filename}:`,
          data
        );
        console.log(
          'Expected structure: { sourceEntryId: string, targetEntryId: string, referenceTree: object, ... }'
        );
        return null;
      }

      return data;
    } catch (error) {
      console.error(
        `❌ Error reading deep references file ${filename}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Create or update relationship metadata
   */
  async createOrUpdateRelationship(
    sourceEntryId,
    targetEntryId,
    lastTranslatedVersion,
    translationContext,
    fieldHashes,
    cloneMapping
  ) {
    const relationshipData = {
      sourceEntryId,
      targetEntryId,
      metadata: {
        lastTranslatedVersion,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(), // Will be preserved by Contentful service if updating
      },
      translationContext,
      fieldHashes,
      cloneMapping,
    };

    // Try to store in Contentful first
    if (this.contentfulMetadataService) {
      try {
        await this.contentfulMetadataService.storeRelationshipMetadata(
          sourceEntryId,
          targetEntryId,
          relationshipData
        );
        console.log(
          `💾 Relationship metadata updated in Contentful: ${sourceEntryId}_${targetEntryId}`
        );
        return;
      } catch (error) {
        console.warn(
          `⚠️ Failed to store in Contentful, falling back to file: ${error.message}`
        );
      }
    }

    // Fallback to file system
    const filename = `${sourceEntryId}_${targetEntryId}.json`;
    const filePath = join(this.trackingDir, filename);

    // Preserve createdAt if file exists
    if (existsSync(filePath)) {
      try {
        const existingData = JSON.parse(readFileSync(filePath, 'utf8'));
        relationshipData.metadata.createdAt = existingData.metadata.createdAt;
      } catch (error) {
        console.warn(`⚠️ Could not read existing createdAt: ${error.message}`);
      }
    }

    writeFileSync(filePath, JSON.stringify(relationshipData, null, 2), 'utf8');
    console.log(`💾 Relationship metadata updated in file: ${filename}`);
  }

  /**
   * Generate field hashes for change detection
   */
  generateFieldHashes(entry) {
    const hashes = {};

    Object.keys(entry.fields || {}).forEach((fieldId) => {
      const fieldValue = entry.fields[fieldId];
      if (this.isTranslatableField(fieldId, fieldValue)) {
        hashes[fieldId] = crypto
          .createHash('sha256')
          .update(JSON.stringify(fieldValue))
          .digest('hex');
      }
    });

    return hashes;
  }

  /**
   * Detect field changes since last translation
   */
  async detectFieldChanges(
    sourceEntry,
    lastTranslatedVersion,
    storedFieldHashes
  ) {
    const changes = [];
    const currentFieldHashes = this.generateFieldHashes(sourceEntry);

    // Compare current hashes with stored hashes
    Object.keys(currentFieldHashes).forEach((fieldId) => {
      const currentHash = currentFieldHashes[fieldId];
      const storedHash = storedFieldHashes[fieldId];

      if (currentHash !== storedHash) {
        changes.push({
          fieldName: fieldId,
          changeType: storedHash ? 'modified' : 'added',
          oldValue: null, // Could be enhanced to store old values
          newValue: sourceEntry.fields[fieldId],
          isTranslatable: true,
          needsTranslation: true,
        });
      }
    });

    // Check for deleted fields
    Object.keys(storedFieldHashes).forEach((fieldId) => {
      if (!currentFieldHashes[fieldId]) {
        changes.push({
          fieldName: fieldId,
          changeType: 'deleted',
          oldValue: null,
          newValue: null,
          isTranslatable: true,
          needsTranslation: false,
        });
      }
    });

    return changes;
  }

  /**
   * Detect conflicts (manual modifications in target entry)
   */
  async detectConflicts(sourceEntryId, targetEntryId) {
    // For now, return empty conflicts array
    // This could be enhanced to detect manual modifications
    return [];
  }

  /**
   * Create backup snapshot of an entry
   */
  async createBackupSnapshot(entryId, entry, reason) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `${entryId}_${timestamp}`;

    const backupData = {
      backupId,
      entryId,
      timestamp: new Date().toISOString(),
      reason,
      entrySnapshot: {
        sys: entry.sys,
        fields: entry.fields,
      },
    };

    // Try to store backup in Contentful first
    // Note: This requires finding a related translation relationship to attach the backup to
    // For now, we'll store in files but this could be enhanced to use Contentful
    if (this.contentfulMetadataService) {
      try {
        // We could enhance this to store backup data in related translation entries
        // For now, continue with file storage as backups are less critical than relationship data
        console.log(
          `ℹ️ Backup data stored in files (Contentful backup storage not yet implemented)`
        );
      } catch (error) {
        console.warn(`⚠️ Backup storage note: ${error.message}`);
      }
    }

    // Create backup directory if it doesn't exist
    const backupDir = join(this.trackingDir, 'backups');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const filePath = join(backupDir, `${backupId}.json`);
    writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`💾 Created backup: ${backupId}`);

    return backupId;
  }

  /**
   * Translate and update a specific field
   */
  async translateAndUpdateField(targetEntry, change, translationContext) {
    const fieldName = change.fieldName;

    console.log(`🔤 Processing field change: ${fieldName} (${change.type})`);

    // Handle different types of field changes
    if (change.type === 'enhanced-reference-field') {
      // Handle reference field changes (child entry modifications)
      return await this.handleReferenceFieldChange(
        targetEntry,
        change,
        translationContext
      );
    } else {
      // Handle basic text field changes
      return await this.handleBasicFieldChange(
        targetEntry,
        change,
        translationContext
      );
    }
  }

  /**
   * Handle basic text field translation
   */
  async handleBasicFieldChange(targetEntry, change, translationContext) {
    const fieldName = change.fieldName;
    const newValue = change.newValue;

    console.log(`🔤 Translating text field: ${fieldName}`);

    // Extract text from Contentful field structure
    const sourceLocaleKey = 'en-US-POSIX';
    let textToTranslate;

    if (typeof newValue === 'object' && newValue !== null) {
      // Handle Contentful's locale-based field structure
      textToTranslate =
        newValue[sourceLocaleKey] || newValue[Object.keys(newValue)[0]];

      // Handle nested object structures (e.g., rich text, arrays)
      if (typeof textToTranslate === 'object') {
        console.log(
          `⚠️ Complex field structure not supported for translation: ${fieldName}`
        );
        console.log(`Field structure:`, JSON.stringify(newValue, null, 2));
        return;
      }
    } else if (typeof newValue === 'string') {
      textToTranslate = newValue;
    } else {
      console.log(
        `⚠️ Unsupported field value type: ${typeof newValue} for field: ${fieldName}`
      );
      console.log(`Field value:`, newValue);
      return;
    }

    if (
      !textToTranslate ||
      typeof textToTranslate !== 'string' ||
      textToTranslate.trim().length === 0
    ) {
      console.log(`⚠️ No valid text to translate in field: ${fieldName}`);
      return;
    }

    // Translate the text
    const translatedText = await this.translateText(
      textToTranslate,
      translationContext
    );

    // Update the target entry field
    if (!targetEntry.fields[fieldName]) {
      targetEntry.fields[fieldName] = {};
    }

    targetEntry.fields[fieldName][sourceLocaleKey] = translatedText;

    console.log(
      `✅ Updated field ${fieldName}: "${translatedText.substring(0, 50)}..."`
    );
  }

  /**
   * Handle reference field changes (child entry modifications)
   */
  async handleReferenceFieldChange(targetEntry, change, translationContext) {
    const fieldName = change.fieldName;

    console.log(`🔗 Processing reference field: ${fieldName}`);
    console.log(`📝 Deep changes: ${change.deepChanges?.length || 0}`);
    console.log(
      `🎯 Referenced entries: ${change.referencedEntries?.length || 0}`
    );

    if (!change.deepChanges || change.deepChanges.length === 0) {
      console.log(
        `⚠️ No deep changes to process for reference field ${fieldName}`
      );
      return;
    }

    // Process each child entry that has changed
    let updatedChildEntries = 0;
    for (const deepChange of change.deepChanges) {
      // Skip translation for removed references - they're already removed from the field
      if (deepChange.type === 'removed') {
        console.log(
          `⏭️ Skipping translation for removed reference: ${deepChange.refId} (already removed from field)`
        );
        continue;
      }

      try {
        const success = await this.translateChildEntry(
          deepChange,
          translationContext
        );
        if (success) {
          updatedChildEntries++;
        }
      } catch (error) {
        console.error(
          `❌ Error translating child entry ${
            deepChange.id || deepChange.refId
          }:`,
          error.message
        );
      }
    }

    // After processing all child entries, update the target entry's reference field
    // to include any newly cloned references
    await this.updateTargetReferenceField(targetEntry, fieldName, change);

    console.log(
      `✅ Updated ${updatedChildEntries} child entries for field ${fieldName}`
    );
  }

  /**
   * Translate a child entry that was referenced and changed
   */
  async translateChildEntry(deepChange, translationContext) {
    console.log(
      `🔄 Translating child entry: ${deepChange.id} (${deepChange.changeType})`
    );

    // Get the source (changed) child entry
    const sourceChildEntry = await this.environment.getEntry(deepChange.id);

    // Find the corresponding target child entry using clone mapping
    const relationship = await this.getRelationship(
      this.currentSourceEntryId, // We need to store this during the update process
      this.currentTargetEntryId // We need to store this during the update process
    );

    if (!relationship || !relationship.cloneMapping) {
      console.error(
        `❌ No clone mapping found for child entry ${deepChange.id}`
      );
      return false;
    }

    const sourceKey = `Entry:${deepChange.id}`;
    let targetChildEntryId = relationship.cloneMapping[sourceKey];

    if (!targetChildEntryId) {
      // New reference detected - need to clone it
      console.log(
        `🆕 New reference detected: ${deepChange.id} - cloning to target...`
      );

      targetChildEntryId = await this.cloneNewReference(
        deepChange.id,
        relationship.translationContext
      );

      if (!targetChildEntryId) {
        console.error(`❌ Failed to clone new reference ${deepChange.id}`);
        return false;
      }

      // Update the clone mapping
      relationship.cloneMapping[sourceKey] = targetChildEntryId;
      await this.updateCloneMapping(
        this.currentSourceEntryId,
        this.currentTargetEntryId,
        relationship.cloneMapping
      );

      console.log(
        `✅ Cloned new reference: ${deepChange.id} → ${targetChildEntryId}`
      );
    }

    console.log(`🎯 Mapping: ${deepChange.id} → ${targetChildEntryId}`);

    // Get the target child entry
    const targetChildEntry = await this.environment.getEntry(
      targetChildEntryId
    );

    // Translate changed fields in the child entry
    let fieldsUpdated = 0;
    for (const fieldChange of deepChange.fieldChanges || []) {
      // Only translate fields that need translation
      if (fieldChange.needsTranslation && fieldChange.isTranslatable) {
        try {
          await this.handleBasicFieldChange(
            targetChildEntry,
            fieldChange,
            translationContext
          );
          fieldsUpdated++;
          console.log(
            `✅ Translated field ${fieldChange.fieldName} in child entry ${deepChange.id}`
          );
        } catch (error) {
          console.error(
            `❌ Error translating field ${fieldChange.fieldName} in child entry:`,
            error.message
          );
        }
      } else {
        console.log(
          `⏭️ Skipping non-translatable field ${fieldChange.fieldName} in child entry ${deepChange.id}`
        );
      }
    }

    // Update the target child entry in Contentful
    if (fieldsUpdated > 0) {
      await targetChildEntry.update();
      console.log(
        `✅ Updated child entry ${targetChildEntryId} with ${fieldsUpdated} field changes`
      );
      return true;
    } else {
      console.log(
        `⚠️ No fields were updated in child entry ${targetChildEntryId}`
      );
      return false;
    }
  }

  /**
   * Update the target entry's reference field to include newly cloned references
   */
  async updateTargetReferenceField(targetEntry, fieldName, change) {
    try {
      // Get the current clone mapping
      const relationship = await this.getRelationship(
        this.currentSourceEntryId,
        this.currentTargetEntryId
      );

      if (!relationship?.cloneMapping) {
        console.error(
          `❌ No clone mapping found for updating reference field ${fieldName}`
        );
        return;
      }

      // Get the source entry to see what references it currently has
      const sourceEntry = await this.environment.getEntry(
        this.currentSourceEntryId
      );
      const sourceFieldValue = sourceEntry.fields[fieldName];

      if (!sourceFieldValue) {
        console.log(`⚠️ Source field ${fieldName} not found`);
        return;
      }

      // Extract current source references
      const sourceReferences = this.extractReferencedEntries(sourceFieldValue);

      // Map source references to target references using clone mapping
      const targetReferences = [];
      for (const sourceRef of sourceReferences) {
        if (sourceRef?.sys?.id) {
          const sourceKey = `Entry:${sourceRef.sys.id}`;
          const targetRefId = relationship.cloneMapping[sourceKey];

          if (targetRefId) {
            targetReferences.push({
              sys: {
                type: 'Link',
                linkType: 'Entry',
                id: targetRefId,
              },
            });
          } else {
            console.warn(
              `⚠️ No mapping found for reference ${sourceRef.sys.id}`
            );
          }
        }
      }

      // Update the target entry's field with the mapped references (including empty arrays for complete removal)
      const locale = Object.keys(sourceFieldValue)[0] || 'en-US-POSIX';

      if (!targetEntry.fields[fieldName]) {
        targetEntry.fields[fieldName] = {};
      }

      targetEntry.fields[fieldName][locale] = targetReferences;
      console.log(
        `✅ Updated target field ${fieldName} with ${
          targetReferences.length
        } references${
          targetReferences.length === 0 ? ' (removed all references)' : ''
        }`
      );
    } catch (error) {
      console.error(
        `❌ Error updating target reference field ${fieldName}:`,
        error.message
      );
    }
  }

  /**
   * Extract referenced entries from a field value
   */
  extractReferencedEntries(fieldValue) {
    const entries = [];

    if (!fieldValue || typeof fieldValue !== 'object') {
      return entries;
    }

    // Handle locale-based field structure
    for (const localeValue of Object.values(fieldValue)) {
      if (Array.isArray(localeValue)) {
        // Array of references
        for (const ref of localeValue) {
          if (ref?.sys?.type === 'Link' && ref.sys.linkType === 'Entry') {
            entries.push(ref);
          }
        }
      } else if (
        localeValue?.sys?.type === 'Link' &&
        localeValue.sys.linkType === 'Entry'
      ) {
        // Single reference
        entries.push(localeValue);
      }
    }

    return entries;
  }

  /**
   * Clone a new reference entry that was added to the source
   */
  async cloneNewReference(sourceEntryId, translationContext) {
    try {
      console.log(`🔄 Cloning new reference entry: ${sourceEntryId}`);
      console.log(
        `🔍 DEBUG - cloneNewReference called with translationContext:`,
        translationContext
      );

      // Get the source entry
      const sourceEntry = await this.environment.getEntry(sourceEntryId);
      console.log(
        `🔍 DEBUG - Source entry fields:`,
        Object.keys(sourceEntry.fields)
      );

      // Create a new entry by copying the source entry
      const newEntry = await this.environment.createEntry(
        sourceEntry.sys.contentType.sys.id,
        {
          fields: await this.translateEntryFields(
            sourceEntry.fields,
            translationContext
          ),
        }
      );

      // Leave the new entry as draft - editors can publish when ready
      console.log(`✅ Created new cloned entry as draft: ${newEntry.sys.id}`);
      return newEntry.sys.id;
    } catch (error) {
      console.error(
        `❌ Error cloning new reference ${sourceEntryId}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Translate entry fields for cloning
   */
  async translateEntryFields(sourceFields, translationContext) {
    const translatedFields = {};

    console.log(
      `🔍 DEBUG - translateEntryFields called with translationContext:`,
      {
        sourceLanguage: translationContext.sourceLanguage,
        targetLanguage: translationContext.targetLanguage,
      }
    );

    for (const [fieldName, fieldValue] of Object.entries(sourceFields)) {
      console.log(`🔍 DEBUG - Processing field: ${fieldName}`, fieldValue);

      if (fieldName === 'culture') {
        // Special handling for culture field - set it to target locale (not translated)
        const locale = Object.keys(fieldValue)[0] || 'en-US-POSIX';
        console.log(
          `🔍 DEBUG - Culture field detected. Original value:`,
          fieldValue
        );
        console.log(`🔍 DEBUG - Locale key: ${locale}`);
        console.log(
          `🔍 DEBUG - Target language from context: ${translationContext.targetLanguage}`
        );

        // Convert DeepL language code to full locale code
        const targetCultureValue = this.getCultureValueFromTargetLanguage(
          translationContext.targetLanguage
        );
        console.log(
          `🔍 DEBUG - Converted to culture value: ${targetCultureValue}`
        );

        translatedFields[fieldName] = {
          [locale]: targetCultureValue,
        };
        console.log(
          `🌍 Set culture field from ${translationContext.targetLanguage} to ${targetCultureValue}`
        );
        console.log(
          `🔍 DEBUG - Final culture field:`,
          translatedFields[fieldName]
        );
      } else if (this.isTranslatableField(fieldName, fieldValue)) {
        // Translate text fields
        translatedFields[fieldName] = await this.translateFieldValue(
          fieldValue,
          translationContext
        );
      } else {
        // Copy non-translatable fields as-is (references, etc.)
        translatedFields[fieldName] = fieldValue;
      }
    }

    return translatedFields;
  }

  /**
   * Translate a field value structure
   */
  async translateFieldValue(fieldValue, translationContext) {
    const translatedValue = {};

    for (const [locale, content] of Object.entries(fieldValue)) {
      if (typeof content === 'string' && content.trim().length > 0) {
        // Translate string content
        translatedValue[locale] = await this.translateText(
          content,
          translationContext
        );
      } else {
        // Copy non-string content as-is
        translatedValue[locale] = content;
      }
    }

    return translatedValue;
  }

  /**
   * Update the clone mapping in the relationship file
   */
  async updateCloneMapping(sourceEntryId, targetEntryId, updatedCloneMapping) {
    try {
      const relationship = await this.getRelationship(
        sourceEntryId,
        targetEntryId
      );
      if (!relationship) {
        throw new Error('Relationship not found');
      }

      // Update the clone mapping
      relationship.cloneMapping = updatedCloneMapping;

      // Store in Contentful first
      if (this.contentfulMetadataService) {
        try {
          await this.contentfulMetadataService.storeRelationshipMetadata(
            sourceEntryId,
            targetEntryId,
            relationship
          );
          console.log(`💾 Updated clone mapping in Contentful`);
        } catch (error) {
          console.warn(
            `⚠️ Failed to update clone mapping in Contentful: ${error.message}`
          );
        }
      }

      // Also save the updated relationship to file as backup
      const filename = `${sourceEntryId}_${targetEntryId}.json`;
      const filePath = join(this.trackingDir, filename);
      writeFileSync(filePath, JSON.stringify(relationship, null, 2), 'utf8');

      console.log(`💾 Updated clone mapping in relationship file`);
    } catch (error) {
      console.error(`❌ Error updating clone mapping:`, error.message);
    }
  }

  /**
   * Translate text using DeepL
   */
  async translateText(text, translationContext) {
    if (!this.deeplApiKey || !text.trim()) {
      return text;
    }

    try {
      const deepl = await import('deepl-node');
      const translator = new deepl.Translator(this.deeplApiKey);

      const sourceLanguage = translationContext.sourceLanguage || 'DE';
      const targetLanguage = translationContext.targetLanguage || 'IT';

      const result = await translator.translateText(
        text,
        sourceLanguage,
        targetLanguage
      );

      return result.text;
    } catch (error) {
      console.warn(`⚠️ Translation failed: ${error.message}`);
      return text;
    }
  }

  /**
   * Check if a field is translatable
   */
  isTranslatableField(fieldName, fieldValue) {
    // Skip system fields and non-translatable content
    const nonTranslatableFields = [
      'slug',
      'sys_',
      'internalName',
      'id',
      'contentfulMetadata',
      'parentPage',
      'authors',
      'productionUrl',
      'makeModel',
      'publicationDate',
      'lastModificationDate',
      'makeIds',
      'modelIds',
      'trackingName',
      'domain',
      'pageType',
      'metaIndexToggle',
      'enableFeaturedArticle',
      'showInGoogleNews',
      'hasHighlightedText',
      'isPrimary',
      'spotlight',
      'publishedCounter',
      'fieldStatus',
      'automationTags',
      'culture', // Add culture to non-translatable fields
    ];

    if (nonTranslatableFields.some((field) => fieldName.startsWith(field))) {
      return false;
    }

    if (!fieldValue || typeof fieldValue !== 'object') {
      return false;
    }

    // Check if field contains text content
    const values = Object.values(fieldValue);
    return values.some(
      (value) => typeof value === 'string' && value.trim().length > 0
    );
  }

  /**
   * Get display title for an entry
   */
  getEntryTitle(entry) {
    const titleFields = ['title', 'internalName', 'name'];
    const locale = 'en-US-POSIX';

    for (const field of titleFields) {
      if (entry.fields[field] && entry.fields[field][locale]) {
        return entry.fields[field][locale];
      }
    }

    return `Entry ${entry.sys.id}`;
  }

  /**
   * Create translation metadata for newly cloned entries
   */
  async createTranslationMetadata(options) {
    const {
      sourceEntryId,
      targetEntryId,
      sourceLanguage,
      targetLanguage,
      spaceId,
      environmentId,
      cloneMapping = {},
    } = options;

    try {
      // Initialize space and environment
      await this.initialize(spaceId, environmentId);

      // Get both entries to get current versions
      const [sourceEntry, targetEntry] = await Promise.all([
        this.environment.getEntry(sourceEntryId),
        this.environment.getEntry(targetEntryId),
      ]);

      // Create metadata structure that matches expected format
      const relationshipData = {
        sourceEntryId,
        targetEntryId,
        metadata: {
          lastTranslatedVersion: sourceEntry.sys.version,
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        translationContext: {
          sourceLanguage,
          targetLanguage,
        },
        fieldHashes: this.generateFieldHashes(sourceEntry),
        cloneMapping,
      };

      // Store in Contentful first, then fall back to file
      if (this.contentfulMetadataService) {
        try {
          await this.contentfulMetadataService.storeRelationshipMetadata(
            sourceEntryId,
            targetEntryId,
            relationshipData
          );
          console.log(
            `📝 Created translation metadata in Contentful: ${sourceEntryId}_${targetEntryId}`
          );
        } catch (error) {
          console.warn(
            `⚠️ Failed to store in Contentful, falling back to file: ${error.message}`
          );
        }
      }

      // Also save metadata file as backup
      const metadataPath = join(
        this.trackingDir,
        `${sourceEntryId}_${targetEntryId}.json`
      );

      writeFileSync(metadataPath, JSON.stringify(relationshipData, null, 2));
      console.log(
        `📝 Created translation metadata file backup: ${metadataPath}`
      );

      // Initialize deep reference tracking for the new translation pair
      await this.initializeDeepReferenceTracking(sourceEntryId, targetEntryId);

      return relationshipData;
    } catch (error) {
      console.error('❌ Failed to create translation metadata:', error);
      throw error;
    }
  }

  /**
   * Initialize deep reference tracking for a new translation pair
   */
  async initializeDeepReferenceTracking(sourceEntryId, targetEntryId) {
    try {
      console.log(
        `🔗 Initializing deep reference tracking for ${sourceEntryId} → ${targetEntryId}`
      );

      // Initialize change detection service with deep tracking and wait for it to complete
      await this.initializeDeepTrackingAsync(this.environment, {
        maxDepth: 3,
        autoTranslateNewRefs: true,
      });

      // Build initial deep reference map
      if (this.changeDetectionService.deepReferenceTracker) {
        await this.changeDetectionService.deepReferenceTracker.buildDeepReferenceMap(
          sourceEntryId,
          targetEntryId
        );
        console.log(
          `✅ Deep reference tracking initialized for translation pair`
        );
      } else {
        console.warn(
          `⚠️ Deep reference tracker not available after initialization`
        );
      }
    } catch (error) {
      console.error(
        `❌ Failed to initialize deep reference tracking:`,
        error.message
      );
      // Don't throw - deep reference tracking is optional
    }
  }

  /**
   * Initialize deep tracking with proper Promise handling
   */
  async initializeDeepTrackingAsync(environment, options = {}) {
    try {
      // Dynamic import to avoid circular dependencies
      const { DeepReferenceTracker } = await import(
        './deepReferenceTracker.js'
      );

      this.changeDetectionService.deepReferenceTracker =
        new DeepReferenceTracker(
          this.changeDetectionService.metadataService,
          environment,
          {
            maxDepth: options.maxDepth || 3,
            autoTranslateNewRefs: options.autoTranslateNewRefs !== false,
          }
        );

      console.log(
        '🔍 Deep reference tracking initialized with max depth:',
        options.maxDepth || 3
      );
    } catch (error) {
      console.warn(
        '⚠️ Could not initialize deep reference tracking:',
        error.message
      );
      throw error;
    }
  }

  /**
   * Get deep reference tracking statistics for a translation relationship
   */
  async getDeepReferenceStatistics(sourceEntryId, targetEntryId) {
    try {
      return await this.changeDetectionService.getDeepReferenceStatistics(
        sourceEntryId,
        targetEntryId
      );
    } catch (error) {
      console.error(
        `❌ Error getting deep reference statistics: ${error.message}`
      );
      return {
        error: error.message,
        totalReferences: 0,
        referencesByDepth: {},
        lastScanned: 'never',
        maxDepth: 0,
      };
    }
  }

  /**
   * Force rebuild the deep reference map for a translation relationship
   */
  async rebuildDeepReferenceMap(sourceEntryId, targetEntryId) {
    try {
      console.log(
        `🔄 Rebuilding deep reference map for ${sourceEntryId} → ${targetEntryId}`
      );
      return await this.changeDetectionService.rebuildDeepReferenceMap(
        sourceEntryId,
        targetEntryId
      );
    } catch (error) {
      console.error(`❌ Error rebuilding reference map: ${error.message}`);
      return false;
    }
  }

  /**
   * Convert DeepL language code to full locale code for culture field
   */
  getCultureValueFromTargetLanguage(targetLanguage) {
    const cultureMapping = {
      EN: 'en-GB',
      DE: 'de-DE',
      BE: 'nl-BE',
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
    };

    console.log(
      `🔍 DEBUG - getCultureValueFromTargetLanguage input: "${targetLanguage}"`
    );
    const result = cultureMapping[targetLanguage] || targetLanguage;
    console.log(
      `🔍 DEBUG - getCultureValueFromTargetLanguage output: "${result}"`
    );
    console.log(
      `🔍 DEBUG - Culture mapping keys:`,
      Object.keys(cultureMapping)
    );

    return result;
  }
}
