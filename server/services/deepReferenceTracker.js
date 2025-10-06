/**
 * Deep Reference Tracker
 * Multi-level reference change detection and new reference identification
 * Ported from TypeScript original with enhanced capabilities
 */

import crypto from 'crypto';
import { writeFileSync, readFileSync, existsSync } from 'fs';

export class DeepReferenceTracker {
  constructor(metadataService, environment, options = {}) {
    this.metadataService = metadataService;
    this.environment = environment;
    this.maxDepth = options.maxDepth || 3;
    this.autoTranslateNewRefs = options.autoTranslateNewRefs !== false;
  }

  /**
   * Get the Contentful metadata service dynamically
   */
  get contentfulMetadataService() {
    return this.metadataService.contentfulMetadataService || null;
  }

  /**
   * Build or update the deep reference map for a source-target relationship
   */
  async buildDeepReferenceMap(sourceEntryId, targetEntryId) {
    console.log(
      `🏗️ Building deep reference map for ${sourceEntryId} (depth: ${this.maxDepth})`
    );

    try {
      const sourceEntry = await this.environment.getEntry(sourceEntryId);
      const referenceTree = await this.buildReferenceTree(sourceEntry, 0);

      const deepMap = {
        sourceEntryId,
        targetEntryId,
        maxDepth: this.maxDepth,
        lastScanned: new Date().toISOString(),
        referenceTree,
        flattenedRefs: this.flattenReferenceTree(referenceTree),
      };

      // Store the deep reference map
      await this.storeDeepReferenceMap(sourceEntryId, targetEntryId, deepMap);

      console.log(
        `✅ Built deep reference map with ${
          Object.keys(deepMap.flattenedRefs).length
        } total references`
      );
      return deepMap;
    } catch (error) {
      console.error(`❌ Error building deep reference map: ${error.message}`);
      throw error;
    }
  }

  /**
   * Recursively build a tree of references up to maxDepth
   */
  async buildReferenceTree(entry, currentDepth, parentId, parentField) {
    const entryId = entry.sys.id;
    const version = entry.sys.publishedVersion || entry.sys.version;
    const contentHash = this.generateContentHash(entry);

    const node = {
      id: entryId,
      version,
      depth: currentDepth,
      parentId,
      parentField,
      contentHash,
      lastUpdated: new Date().toISOString(),
      children: [],
    };

    // If we haven't reached max depth, scan for child references
    if (currentDepth < this.maxDepth) {
      const isTargetEntry = entryId === '4dHu151qcHILlKT3nmaJBk';

      if (isTargetEntry || currentDepth <= 1) {
        console.log(
          `📍 Scanning references at depth ${currentDepth} for entry ${entryId}`
        );
      }

      for (const [fieldId, fieldValue] of Object.entries(entry.fields || {})) {
        if (this.isReferenceField(fieldValue)) {
          if (!this.shouldTrackReferenceField(fieldId)) {
            if (isTargetEntry || currentDepth <= 1) {
              console.log(
                `  ⏭️ Skipping non-trackable reference field: ${fieldId}`
              );
            }
            continue;
          }

          const referencedEntries = this.extractReferencedEntries(fieldValue);

          for (const ref of referencedEntries) {
            if (ref?.sys?.id && ref.sys.id !== entryId) {
              // Skip assets - we only track entry references for translation
              if (this.isAssetReference(ref)) {
                if (isTargetEntry || currentDepth <= 1) {
                  console.log(
                    `  📎 Skipping asset reference: ${ref.sys.id} (assets don't need translation tracking)`
                  );
                }
                continue;
              }

              // Avoid circular references
              try {
                const referencedEntry = await this.environment.getEntry(
                  ref.sys.id
                );
                const childNode = await this.buildReferenceTree(
                  referencedEntry,
                  currentDepth + 1,
                  entryId,
                  fieldId
                );
                node.children.push(childNode);

                if (isTargetEntry || currentDepth <= 1) {
                  console.log(
                    `  🔗 Added child reference: ${ref.sys.id} (depth ${
                      currentDepth + 1
                    })`
                  );
                }
              } catch (error) {
                console.warn(
                  `  ⚠️ Could not fetch referenced entry ${ref.sys.id}: ${error.message}`
                );
              }
            }
          }
        }
      }
    } else {
      console.log(
        `  🛑 Reached max depth ${this.maxDepth} for entry ${entryId}`
      );
    }

    return node;
  }

  /**
   * Build current reference map for comparison without storing it
   */
  async buildCurrentReferenceMapForComparison(sourceEntryId, targetEntryId) {
    console.log(
      `🔍 Building current reference map for comparison (depth: ${this.maxDepth})`
    );

    const sourceEntry = await this.environment.getEntry(sourceEntryId);
    const referenceTree = await this.buildReferenceTree(sourceEntry, 0);

    return {
      sourceEntryId,
      targetEntryId,
      maxDepth: this.maxDepth,
      lastScanned: new Date().toISOString(),
      referenceTree,
      flattenedRefs: this.flattenReferenceTree(referenceTree),
    };
  }

  /**
   * Flatten the reference tree into a simple id -> node mapping
   */
  flattenReferenceTree(tree) {
    const flattened = {};

    const addNode = (node) => {
      flattened[node.id] = { ...node, children: [] }; // Don't include children in flattened version

      for (const child of node.children) {
        addNode(child);
      }
    };

    addNode(tree);
    return flattened;
  }

  /**
   * Detect deep reference changes by comparing with stored map
   */
  async detectDeepReferenceChanges(sourceEntryId, targetEntryId) {
    console.log(`🔍 Detecting deep reference changes for ${sourceEntryId}`);

    try {
      // Get stored deep reference map FIRST (before overwriting it)
      const storedMap = await this.getStoredDeepReferenceMap(
        sourceEntryId,
        targetEntryId
      );

      // Build current reference map but DON'T store it yet
      const currentMap = await this.buildCurrentReferenceMapForComparison(
        sourceEntryId,
        targetEntryId
      );

      const changes = {
        changedReferences: [],
        newReferences: [],
        removedReferences: [],
      };

      if (!storedMap) {
        console.log(`  ℹ️ No stored reference map found - treating all as new`);
        // All current references are "new"
        for (const [refId, refNode] of Object.entries(
          currentMap.flattenedRefs
        )) {
          if (refId !== sourceEntryId) {
            // Don't include the source entry itself
            changes.newReferences.push({
              id: refId,
              depth: refNode.depth,
              parentId: refNode.parentId || sourceEntryId,
              parentField: refNode.parentField || 'unknown',
              needsTranslation: this.autoTranslateNewRefs,
            });
          }
        }
        // Store the new map now
        await this.storeDeepReferenceMap(
          sourceEntryId,
          targetEntryId,
          currentMap
        );
        return changes;
      }

      // Compare stored vs current maps
      const storedRefs = storedMap.flattenedRefs;
      const currentRefs = currentMap.flattenedRefs;

      // Find changed references (version differences OR content hash differences)
      console.log(
        `🔍 Comparing ${Object.keys(currentRefs).length} current refs with ${
          Object.keys(storedRefs).length
        } stored refs`
      );

      for (const [refId, currentRef] of Object.entries(currentRefs)) {
        const storedRef = storedRefs[refId];

        if (storedRef) {
          const versionChanged = currentRef.version > storedRef.version;
          const contentChanged =
            currentRef.contentHash !== storedRef.contentHash;

          if (versionChanged || contentChanged) {
            // Detect specific field changes within the child entry
            const fieldChanges = await this.detectChildEntryFieldChanges(
              refId,
              storedRef,
              currentRef
            );

            changes.changedReferences.push({
              id: refId,
              depth: currentRef.depth,
              oldVersion: storedRef.version,
              newVersion: currentRef.version,
              parentField: currentRef.parentField,
              fieldChanges: fieldChanges, // Add field-level changes
            });

            const changeType =
              versionChanged && contentChanged
                ? '[version + content]'
                : versionChanged
                ? '[version only]'
                : '[content only]';

            console.log(
              `📝 Reference ${refId} changed: v${storedRef.version} → v${currentRef.version} (depth ${currentRef.depth}) ${changeType}`
            );
          } else {
            console.log(`✅ No changes detected for ${refId}`);
          }
        } else {
          // New reference not in stored map
          changes.newReferences.push({
            id: refId,
            depth: currentRef.depth,
            parentId: currentRef.parentId || sourceEntryId,
            parentField: currentRef.parentField || 'unknown',
            needsTranslation: this.autoTranslateNewRefs,
          });
          console.log(
            `  ➕ New reference detected: ${refId} (depth ${currentRef.depth})`
          );
        }
      }

      // Find removed references
      for (const refId of Object.keys(storedRefs)) {
        if (!currentRefs[refId]) {
          changes.removedReferences.push(refId);
          console.log(`  ➖ Reference removed: ${refId}`);
        }
      }

      console.log(
        `  ✅ Deep scan complete: ${changes.changedReferences.length} changed, ${changes.newReferences.length} new, ${changes.removedReferences.length} removed`
      );

      // DON'T store the updated reference map yet - we need the old map for processing removals
      // The map will be updated after successful processing of all changes including removals
      console.log(
        `⏳ Reference map update deferred until after change processing`
      );

      return changes;
    } catch (error) {
      console.error(
        `❌ Error detecting deep reference changes: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Detect specific field changes within a child entry
   */
  async detectChildEntryFieldChanges(entryId, storedRef, currentRef) {
    try {
      // Get the current entry to analyze its fields
      const currentEntry = await this.environment.getEntry(entryId);

      // Generate current field hashes
      const currentFieldHashes = await this.generateFieldHashes(currentEntry);

      // Get stored field hashes from the relationship metadata if available
      const relationship = await this.getRelationshipForChildEntry(entryId);
      const storedFieldHashes = relationship?.fieldHashes || {};

      const fieldChanges = [];

      // Compare field hashes to detect changes
      for (const [fieldName, currentHash] of Object.entries(
        currentFieldHashes
      )) {
        const storedHash = storedFieldHashes[fieldName];

        if (!storedHash || currentHash !== storedHash) {
          // Field has changed, get the field value for translation
          const fieldValue = currentEntry.fields[fieldName];

          fieldChanges.push({
            fieldName,
            changeType: storedHash ? 'modified' : 'added',
            newValue: fieldValue,
            isTranslatable: this.isFieldTranslatable(fieldName, fieldValue),
            needsTranslation: this.isFieldTranslatable(fieldName, fieldValue),
          });
        }
      }

      console.log(
        `🔍 Child entry ${entryId}: ${fieldChanges.length} field changes detected`
      );
      return fieldChanges;
    } catch (error) {
      console.error(
        `❌ Error detecting field changes for child entry ${entryId}:`,
        error.message
      );
      return [];
    }
  }

  /**
   * Get relationship metadata that might contain field hashes for a child entry
   */
  async getRelationshipForChildEntry(entryId) {
    // This is a simplified version - in a real implementation, you'd need to
    // find which parent relationship this child belongs to
    try {
      const trackingDir =
        this.metadataService?.getTrackingDir?.() || './data/tracking';
      const fs = await import('fs');
      const files = fs.readdirSync(trackingDir);

      // Look for relationship files that might contain this entry in their clone mapping
      for (const file of files) {
        if (file.endsWith('.json') && !file.includes('_deep_refs')) {
          try {
            const content = fs.readFileSync(`${trackingDir}/${file}`, 'utf8');
            const data = JSON.parse(content);

            if (data.cloneMapping) {
              // Check if this entry is in the clone mapping
              for (const [sourceKey, targetId] of Object.entries(
                data.cloneMapping
              )) {
                if (sourceKey.includes(entryId) || targetId === entryId) {
                  return data;
                }
              }
            }
          } catch (error) {
            continue;
          }
        }
      }
    } catch (error) {
      console.error(
        'Error finding relationship for child entry:',
        error.message
      );
    }

    return null;
  }

  /**
   * Generate field hashes for an entry (similar to the main service)
   */
  async generateFieldHashes(entry) {
    const hashes = {};
    const crypto = await import('crypto');

    for (const [fieldName, fieldValue] of Object.entries(entry.fields || {})) {
      if (fieldValue && typeof fieldValue === 'object') {
        const fieldJson = JSON.stringify(fieldValue);
        hashes[fieldName] = crypto
          .createHash('sha256')
          .update(fieldJson)
          .digest('hex');
      }
    }

    return hashes;
  }

  /**
   * Check if a field is translatable
   */
  isFieldTranslatable(fieldName, fieldValue) {
    // Skip system fields and non-text fields
    const skipFields = ['culture', 'domain', 'slug', 'sys', 'metadata'];
    if (skipFields.includes(fieldName)) {
      return false;
    }

    // Check if field contains text content
    if (fieldValue && typeof fieldValue === 'object') {
      const values = Object.values(fieldValue);
      return values.some((v) => typeof v === 'string' && v.trim().length > 0);
    }

    return false;
  }

  /**
   * Check if a reference field should be tracked for translation
   */
  shouldTrackReferenceField(fieldName) {
    // List of reference fields that should NOT be tracked
    const nonTrackableReferenceFields = [
      'parentPage',
      'authors',
      'sys',
      'contentfulMetadata',
      'makeModel',
      'makeIds',
      'modelIds',
      'trackingName',
      'internalName',
      'fieldStatus',
      'automationTags',
      'culture',
      'domain',
      'pageType',
    ];

    // Check if field name starts with any non-trackable field
    if (
      nonTrackableReferenceFields.some((field) => fieldName.startsWith(field))
    ) {
      return false;
    }

    // Track all other reference fields (like 'elements', 'content', etc.)
    return true;
  }

  /**
   * Auto-translate new references if enabled
   */
  async handleNewReferences(
    newReferences,
    sourceEntryId,
    targetEntryId,
    translationContext
  ) {
    if (!this.autoTranslateNewRefs) {
      console.log(
        `🚫 Auto-translation of new references disabled - skipping ${newReferences.length} new references`
      );
      return [];
    }

    console.log(`🆕 Auto-translating ${newReferences.length} new references`);
    const results = [];

    for (const newRef of newReferences) {
      try {
        console.log(
          `  🔄 Processing new reference: ${newRef.id} (depth ${newRef.depth})`
        );

        // Safety check: Skip if this is somehow an asset reference
        try {
          // Try to fetch as entry first - this will fail for assets
          const sourceRefEntry = await this.environment.getEntry(newRef.id);

          // For now, we'll mark that this reference needs to be handled
          // The actual translation logic would be implemented here
          // This would involve creating a new target entry or finding an existing translation

          results.push({
            sourceRefId: newRef.id,
            targetRefId: `${newRef.id}_translated`, // Placeholder
            success: true,
          });

          console.log(
            `    ✅ Marked new reference ${newRef.id} for translation`
          );
        } catch (fetchError) {
          // If fetching as entry fails, it might be an asset or deleted entry
          if (
            fetchError.message?.includes('Asset') ||
            fetchError.message?.includes('asset')
          ) {
            console.log(
              `    📎 Skipping asset reference ${newRef.id} (assets don't need translation)`
            );
          } else {
            console.warn(
              `    ⚠️ Could not fetch reference ${newRef.id}: ${fetchError.message}`
            );
            results.push({
              sourceRefId: newRef.id,
              targetRefId: '',
              success: false,
              error: fetchError.message,
            });
          }
        }
      } catch (error) {
        console.error(
          `    ❌ Error handling new reference ${newRef.id}: ${error.message}`
        );
        results.push({
          sourceRefId: newRef.id,
          targetRefId: '',
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Store the deep reference map for a relationship
   */
  async storeDeepReferenceMap(sourceEntryId, targetEntryId, deepMap) {
    try {
      // Try Contentful first
      if (this.contentfulMetadataService) {
        try {
          await this.contentfulMetadataService.storeDeepReferenceMap(
            sourceEntryId,
            targetEntryId,
            deepMap
          );
          console.log(
            `💾 Stored deep reference map in Contentful: ${sourceEntryId}_${targetEntryId}`
          );
          return;
        } catch (error) {
          console.warn(
            `⚠️ Failed to store deep reference map in Contentful, falling back to file: ${error.message}`
          );
        }
      }

      // Fallback to file system
      const trackingDir = this.metadataService.getTrackingDir();
      const deepMapFile = `${trackingDir}/${sourceEntryId}_${targetEntryId}_deep_refs.json`;

      writeFileSync(deepMapFile, JSON.stringify(deepMap, null, 2));

      console.log(`💾 Stored deep reference map in file: ${deepMapFile}`);
    } catch (error) {
      console.error(`❌ Error storing deep reference map: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve stored deep reference map
   */
  async getStoredDeepReferenceMap(sourceEntryId, targetEntryId) {
    try {
      // Try Contentful first
      if (this.contentfulMetadataService) {
        try {
          const deepMap =
            await this.contentfulMetadataService.getDeepReferenceMap(
              sourceEntryId,
              targetEntryId
            );
          if (deepMap) {
            console.log(
              `📖 Retrieved deep reference map from Contentful: ${sourceEntryId}_${targetEntryId}`
            );
            return deepMap;
          }
        } catch (error) {
          console.warn(
            `⚠️ Failed to get deep reference map from Contentful, falling back to file: ${error.message}`
          );
        }
      }

      // Fallback to file system
      const trackingDir = this.metadataService.getTrackingDir();
      const deepMapFile = `${trackingDir}/${sourceEntryId}_${targetEntryId}_deep_refs.json`;

      if (!existsSync(deepMapFile)) {
        return null;
      }

      const content = readFileSync(deepMapFile, 'utf-8');
      const result = JSON.parse(content);
      console.log(`📖 Retrieved deep reference map from file: ${deepMapFile}`);
      return result;
    } catch (error) {
      console.warn(
        `⚠️ Error reading stored deep reference map: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Generate a content hash for an entry to detect content changes
   */
  generateContentHash(entry) {
    // Hash only the translatable fields to detect content changes
    const translatableFields = {};

    for (const [fieldId, fieldValue] of Object.entries(entry.fields || {})) {
      const isTranslatable = this.isTranslatableField(fieldId, fieldValue);

      if (isTranslatable) {
        translatableFields[fieldId] = fieldValue;
      }
    }

    const contentString = JSON.stringify(translatableFields, null, 0);
    const hash = crypto
      .createHash('sha256')
      .update(contentString)
      .digest('hex');

    return hash;
  }

  /**
   * Check if a reference points to an asset instead of an entry
   */
  isAssetReference(ref) {
    // Assets have sys.linkType === 'Asset' while entries have sys.linkType === 'Entry'
    return ref?.sys?.linkType === 'Asset';
  }

  /**
   * Check if a field contains references
   */
  isReferenceField(value) {
    if (Array.isArray(value)) {
      return value.some((item) => item?.sys?.type === 'Link');
    }

    if (this.isLocalizedField(value)) {
      const values = Object.values(value);
      return values.some((val) => this.isReferenceField(val));
    }

    return value?.sys?.type === 'Link';
  }

  /**
   * Extract referenced entries from a field value
   */
  extractReferencedEntries(value) {
    const entries = [];

    if (Array.isArray(value)) {
      entries.push(...value.filter((item) => item?.sys?.type === 'Link'));
    } else if (this.isLocalizedField(value)) {
      for (const localeValue of Object.values(value)) {
        entries.push(...this.extractReferencedEntries(localeValue));
      }
    } else if (value?.sys?.type === 'Link') {
      entries.push(value);
    }

    return entries;
  }

  /**
   * Check if a field is localized
   */
  isLocalizedField(value) {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !value.sys
    );
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
      'avatar',
      'image',
      'heroImages',
      'teaserImage',
      'icon',
      'plans',
      'sections',
      'elements',
      'links',
      'faq',
      'rows',
      'recommendedCategory',
      'product',
      'metaIndexToggle',
      'enableFeaturedArticle',
      'showInGoogleNews',
      'hasHighlightedText',
      'isPrimary',
      'spotlight',
      'publishedCounter',
      'fieldStatus',
      'automationTags',
    ];

    if (nonTranslatableFields.some((field) => fieldName.startsWith(field))) {
      return false;
    }

    // Skip reference fields entirely (they have sys.linkType)
    if (typeof fieldValue === 'object' && fieldValue?.sys?.linkType) {
      return false;
    }

    // Skip arrays of references
    if (
      Array.isArray(fieldValue) &&
      fieldValue.length > 0 &&
      fieldValue[0]?.sys?.linkType
    ) {
      return false;
    }

    // Check if it's a text field
    if (typeof fieldValue === 'string') {
      return true;
    }

    // Check if it's a localized text field
    if (this.isLocalizedField(fieldValue)) {
      const values = Object.values(fieldValue);
      return values.some((value) => typeof value === 'string');
    }

    // Rich text and markdown fields
    if (typeof fieldValue === 'object' && fieldValue?.nodeType) {
      return true; // Rich text document
    }

    return false;
  }

  /**
   * Get reference statistics for monitoring
   */
  async getReferenceStatistics(sourceEntryId, targetEntryId) {
    const deepMap = await this.getStoredDeepReferenceMap(
      sourceEntryId,
      targetEntryId
    );

    if (!deepMap) {
      return {
        totalReferences: 0,
        referencesByDepth: {},
        lastScanned: 'never',
        maxDepth: this.maxDepth,
      };
    }

    const referencesByDepth = {};

    for (const refNode of Object.values(deepMap.flattenedRefs)) {
      const depth = refNode.depth;
      referencesByDepth[depth] = (referencesByDepth[depth] || 0) + 1;
    }

    return {
      totalReferences: Object.keys(deepMap.flattenedRefs).length,
      referencesByDepth,
      lastScanned: deepMap.lastScanned,
      maxDepth: deepMap.maxDepth,
    };
  }

  /**
   * Get the stored deep references for determining removal context
   */
  async getStoredDeepReferences(sourceEntryId, targetEntryId) {
    try {
      const deepMap = await this.getStoredDeepReferenceMap(
        sourceEntryId,
        targetEntryId
      );
      if (!deepMap) {
        console.log(
          `🔍 No stored deep reference map found for ${sourceEntryId} -> ${targetEntryId}`
        );
        return null;
      }
      console.log(
        `🔍 Retrieved stored deep references: ${
          Object.keys(deepMap.flattenedRefs).length
        } entries`
      );
      return deepMap.flattenedRefs;
    } catch (error) {
      console.error(`Error getting stored deep references: ${error.message}`);
      return null;
    }
  }

  /**
   * Update the stored reference map after successful change processing
   */
  async updateStoredReferencesAfterProcessing(sourceEntryId, targetEntryId) {
    try {
      console.log(
        `📝 Updating stored reference map after successful change processing`
      );

      // Build current reference map
      const currentMap = await this.buildCurrentReferenceMapForComparison(
        sourceEntryId,
        targetEntryId
      );

      // Store the updated map
      await this.storeDeepReferenceMap(
        sourceEntryId,
        targetEntryId,
        currentMap
      );

      console.log(`✅ Reference map updated successfully after processing`);
    } catch (error) {
      console.error(
        `❌ Failed to update reference map after processing: ${error.message}`
      );
    }
  }
}
