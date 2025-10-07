/**
 * Contentful Metadata Service
 * Replaces file-based storage with Contentful entries
 */

export class ContentfulMetadataService {
  constructor(environment) {
    this.environment = environment;
    this.contentTypeId = 'translationMetadata'; // This will be the ID of our new content type
    this.locale = 'en-US-POSIX'; // Fixed locale for this space
  }

  /**
   * Generate relationship ID from source and target entry IDs
   */
  generateRelationshipId(sourceEntryId, targetEntryId) {
    return `${sourceEntryId}_${targetEntryId}`;
  }

  /**
   * Store or update relationship metadata
   */
  async storeRelationshipMetadata(sourceEntryId, targetEntryId, data) {
    const relationshipId = this.generateRelationshipId(
      sourceEntryId,
      targetEntryId
    );

    try {
      // Try to find existing metadata entry
      const existingEntry = await this.findRelationshipMetadata(
        sourceEntryId,
        targetEntryId
      );

      if (existingEntry) {
        // Update existing entry - need to get the entry first, then update
        const entryToUpdate = await this.environment.getEntry(
          existingEntry.sys.id
        );

        // Update the fields
        entryToUpdate.fields = {
          relationshipId: { [this.locale]: relationshipId },
          sourceEntryId: { [this.locale]: sourceEntryId },
          targetEntryId: { [this.locale]: targetEntryId },
          translationContext: { [this.locale]: data.translationContext },
          metadata: { [this.locale]: data.metadata },
          fieldHashes: { [this.locale]: data.fieldHashes },
          cloneMapping: { [this.locale]: data.cloneMapping },
          deepReferenceMap: {
            [this.locale]: data.deepReferenceMap || null,
          },
          backupData: { [this.locale]: data.backupData || null },
        };

        const updatedEntry = await entryToUpdate.update();
        console.log(`💾 Updated relationship metadata: ${relationshipId}`);
        return updatedEntry;
      } else {
        // Create new entry
        const newEntry = await this.environment.createEntry(
          this.contentTypeId,
          {
            fields: {
              relationshipId: { [this.locale]: relationshipId },
              sourceEntryId: { [this.locale]: sourceEntryId },
              targetEntryId: { [this.locale]: targetEntryId },
              translationContext: { [this.locale]: data.translationContext },
              metadata: { [this.locale]: data.metadata },
              fieldHashes: { [this.locale]: data.fieldHashes },
              cloneMapping: { [this.locale]: data.cloneMapping },
              deepReferenceMap: {
                [this.locale]: data.deepReferenceMap || null,
              },
              backupData: { [this.locale]: data.backupData || null },
            },
          }
        );

        console.log(`💾 Created relationship metadata: ${relationshipId}`);
        return newEntry;
      }
    } catch (error) {
      console.error(`❌ Error storing relationship metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve relationship metadata
   */
  async getRelationshipMetadata(sourceEntryId, targetEntryId) {
    const relationshipId = this.generateRelationshipId(
      sourceEntryId,
      targetEntryId
    );
    console.log(
      `📖 Attempting to retrieve relationship metadata: ${relationshipId}`
    );

    try {
      const entry = await this.findRelationshipMetadata(
        sourceEntryId,
        targetEntryId
      );

      if (!entry) {
        console.log(
          `❌ No relationship metadata found in Contentful for: ${relationshipId}`
        );
        return null;
      }

      console.log(
        `✅ Found relationship metadata in Contentful: ${relationshipId}`
      );

      // Convert Contentful entry format back to our expected format
      return {
        sourceEntryId: entry.fields.sourceEntryId[this.locale],
        targetEntryId: entry.fields.targetEntryId[this.locale],
        translationContext: entry.fields.translationContext[this.locale],
        metadata: entry.fields.metadata[this.locale],
        fieldHashes: entry.fields.fieldHashes?.[this.locale] || {},
        cloneMapping: entry.fields.cloneMapping?.[this.locale] || {},
        deepReferenceMap: entry.fields.deepReferenceMap?.[this.locale] || null,
        backupData: entry.fields.backupData?.[this.locale] || null,
      };
    } catch (error) {
      console.error(
        `❌ Error retrieving relationship metadata for ${relationshipId}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Find a relationship metadata entry by source and target IDs
   */
  async findRelationshipMetadata(sourceEntryId, targetEntryId) {
    const relationshipId = this.generateRelationshipId(
      sourceEntryId,
      targetEntryId
    );

    try {
      // Query with locale-specific field reference for better reliability
      const entries = await this.environment.getEntries({
        content_type: this.contentTypeId,
        [`fields.relationshipId.${this.locale}`]: relationshipId,
        limit: 1,
      });

      console.log(
        `🔍 Searching for relationship: ${relationshipId}, found: ${entries.items.length} entries`
      );
      return entries.items.length > 0 ? entries.items[0] : null;
    } catch (error) {
      console.error(`❌ Error finding relationship metadata: ${error.message}`);

      // Check if it's a content type not found error
      if (
        error.message.includes('The resource could not be found') ||
        error.message.includes('Unknown content type') ||
        error.message.includes('translationMetadata')
      ) {
        console.error(
          `❌ Content type 'translationMetadata' not found in Contentful. Please run: node scripts/install-content-type.js`
        );
      }

      return null;
    }
  }

  /**
   * Store deep reference map
   */
  async storeDeepReferenceMap(sourceEntryId, targetEntryId, deepMap) {
    try {
      const existingData = await this.getRelationshipMetadata(
        sourceEntryId,
        targetEntryId
      );

      if (existingData) {
        // Update existing relationship with deep reference map
        const updatedData = {
          ...existingData,
          deepReferenceMap: deepMap,
        };

        await this.storeRelationshipMetadata(
          sourceEntryId,
          targetEntryId,
          updatedData
        );
      } else {
        // No existing relationship - create minimal entry with deep reference map
        // This should not happen in normal flow, but handle it gracefully
        console.warn(
          `⚠️ No existing relationship found for ${sourceEntryId}_${targetEntryId}, creating minimal entry`
        );

        const minimalData = {
          sourceEntryId,
          targetEntryId,
          metadata: {
            lastTranslatedVersion: 0,
            lastUpdated: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          translationContext: {
            sourceLanguage: 'unknown',
            targetLanguage: 'unknown',
          },
          fieldHashes: {},
          cloneMapping: {},
          deepReferenceMap: deepMap,
        };

        await this.storeRelationshipMetadata(
          sourceEntryId,
          targetEntryId,
          minimalData
        );
      }

      console.log(
        `💾 Stored deep reference map for ${sourceEntryId}_${targetEntryId}`
      );
    } catch (error) {
      console.error(`❌ Error storing deep reference map: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get deep reference map
   */
  async getDeepReferenceMap(sourceEntryId, targetEntryId) {
    try {
      const data = await this.getRelationshipMetadata(
        sourceEntryId,
        targetEntryId
      );
      return data?.deepReferenceMap || null;
    } catch (error) {
      console.error(`❌ Error getting deep reference map: ${error.message}`);
      return null;
    }
  }

  /**
   * Store backup data
   */
  async storeBackupData(sourceEntryId, targetEntryId, backupData) {
    try {
      const existingData =
        (await this.getRelationshipMetadata(sourceEntryId, targetEntryId)) ||
        {};

      const updatedData = {
        ...existingData,
        backupData: backupData,
      };

      await this.storeRelationshipMetadata(
        sourceEntryId,
        targetEntryId,
        updatedData
      );
      console.log(
        `💾 Stored backup data for ${sourceEntryId}_${targetEntryId}`
      );
    } catch (error) {
      console.error(`❌ Error storing backup data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all relationships for a source entry (for cleanup/management)
   */
  async getRelationshipsForSourceEntry(sourceEntryId) {
    try {
      const entries = await this.environment.getEntries({
        content_type: this.contentTypeId,
        'fields.sourceEntryId': sourceEntryId,
      });

      return entries.items.map((entry) => ({
        relationshipId: entry.fields.relationshipId[this.locale],
        sourceEntryId: entry.fields.sourceEntryId[this.locale],
        targetEntryId: entry.fields.targetEntryId[this.locale],
        metadata: entry.fields.metadata[this.locale],
      }));
    } catch (error) {
      console.error(
        `❌ Error getting relationships for source entry: ${error.message}`
      );
      return [];
    }
  }

  /**
   * Delete relationship metadata
   */
  async deleteRelationshipMetadata(sourceEntryId, targetEntryId) {
    try {
      const entry = await this.findRelationshipMetadata(
        sourceEntryId,
        targetEntryId
      );

      if (entry) {
        const entryToDelete = await this.environment.getEntry(entry.sys.id);
        await entryToDelete.delete();
        console.log(
          `🗑️ Deleted relationship metadata: ${sourceEntryId}_${targetEntryId}`
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error(
        `❌ Error deleting relationship metadata: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Get tracking directory (for backward compatibility)
   * This method can be removed once migration is complete
   */
  getTrackingDir() {
    console.warn(
      '⚠️ getTrackingDir() is deprecated - using Contentful storage'
    );
    return 'contentful-storage';
  }

  /**
   * Diagnostic method to check if the content type exists and list existing relationships
   */
  async diagnoseContentfulStorage() {
    console.log('🔍 Running Contentful storage diagnostics...');

    try {
      // Check if content type exists
      const contentType = await this.environment.getContentType(
        this.contentTypeId
      );
      console.log(`✅ Content type '${this.contentTypeId}' exists`);
      console.log(
        `   Fields: ${contentType.fields.map((f) => f.id).join(', ')}`
      );

      // List existing relationships
      const entries = await this.environment.getEntries({
        content_type: this.contentTypeId,
        limit: 10,
      });

      console.log(
        `📊 Found ${entries.total} relationship entries in Contentful:`
      );
      entries.items.forEach((entry, index) => {
        const relationshipId =
          entry.fields.relationshipId?.[this.locale] || 'unknown';
        console.log(
          `   ${index + 1}. ${relationshipId} (Entry ID: ${entry.sys.id})`
        );
      });

      return {
        contentTypeExists: true,
        totalRelationships: entries.total,
        relationships: entries.items.map((entry) => ({
          relationshipId: entry.fields.relationshipId?.[this.locale],
          sourceEntryId: entry.fields.sourceEntryId?.[this.locale],
          targetEntryId: entry.fields.targetEntryId?.[this.locale],
          entryId: entry.sys.id,
        })),
      };
    } catch (error) {
      if (
        error.message.includes('The resource could not be found') ||
        error.message.includes('Unknown content type')
      ) {
        console.error(`❌ Content type '${this.contentTypeId}' not found!`);
        console.error(`💡 Run: node scripts/install-content-type.js`);
        return {
          contentTypeExists: false,
          error: 'Content type not found',
          totalRelationships: 0,
          relationships: [],
        };
      }

      console.error(`❌ Diagnostic error: ${error.message}`);
      return {
        contentTypeExists: false,
        error: error.message,
        totalRelationships: 0,
        relationships: [],
      };
    }
  }
}
