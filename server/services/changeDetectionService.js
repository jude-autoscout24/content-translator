/**
 * Change Detection Service
 * Advanced change detection with deep reference monitoring
 * Ported from TypeScript original with enhanced capabilities
 */

import crypto from 'crypto';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';

export class ChangeDetectionService {
  constructor(metadataService, deeplApiKey) {
    this.metadataService = metadataService;
    this.deeplApiKey = deeplApiKey;
    this.deepReferenceTracker = null; // Will be initialized when needed
  }

  /**
   * Initialize deep reference tracking with enhanced capabilities
   */
  initializeDeepTracking(environment, options = {}) {
    // Dynamic import to avoid circular dependencies
    import('./deepReferenceTracker.js')
      .then(({ DeepReferenceTracker }) => {
        this.deepReferenceTracker = new DeepReferenceTracker(
          this.metadataService,
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
      })
      .catch((error) => {
        console.warn(
          '⚠️ Could not initialize deep reference tracking:',
          error.message
        );
      });
  }

  /**
   * Enhanced field change detection with deep reference monitoring
   */
  async detectParentFieldChanges(
    sourceEntry,
    lastTranslatedVersion,
    sourceEntryId,
    targetEntryId,
    environment
  ) {
    console.log(
      `🔍 Enhanced change detection for entry ${sourceEntryId} (v${lastTranslatedVersion} → v${sourceEntry.sys.version})`
    );

    const changes = [];

    // Step 1: Basic field-level change detection
    const basicChanges = await this.detectBasicFieldChanges(
      sourceEntry,
      lastTranslatedVersion,
      sourceEntryId,
      targetEntryId
    );
    changes.push(...basicChanges);

    // Step 2: Deep reference change detection (if available)
    if (this.deepReferenceTracker) {
      console.log('🔍 Performing deep reference change detection...');
      try {
        const deepChanges =
          await this.deepReferenceTracker.detectDeepReferenceChanges(
            sourceEntryId,
            targetEntryId
          );

        // Process changed references
        if (deepChanges.changedReferences.length > 0) {
          console.log(
            `📝 Found ${deepChanges.changedReferences.length} changed deep references`
          );

          // Group changed references by the field that contains them
          const referenceFieldChanges = await this.groupReferenceChangesByField(
            sourceEntry,
            deepChanges.changedReferences,
            environment
          );

          for (const [fieldName, refChanges] of Object.entries(
            referenceFieldChanges
          )) {
            changes.push({
              fieldName,
              type: 'enhanced-reference-field',
              changeType: 'modified',
              isTranslatable: true,
              needsTranslation: true,
              deepChanges: refChanges,
              referencedEntries: await this.getReferencedEntriesForField(
                sourceEntry,
                fieldName,
                environment
              ),
            });
          }
        }

        // Process new references
        if (deepChanges.newReferences.length > 0) {
          console.log(
            `🆕 Found ${deepChanges.newReferences.length} new deep references`
          );

          const newRefFieldChanges = await this.groupNewReferencesByField(
            sourceEntry,
            deepChanges.newReferences,
            environment
          );

          for (const [fieldName, newRefs] of Object.entries(
            newRefFieldChanges
          )) {
            changes.push({
              fieldName,
              type: 'enhanced-reference-field',
              changeType: 'added',
              isTranslatable: true,
              needsTranslation: true,
              deepChanges: newRefs.map((ref) => ({ ...ref, type: 'new' })),
              referencedEntries: await this.getReferencedEntriesForField(
                sourceEntry,
                fieldName,
                environment
              ),
            });
          }
        }

        // Process removed references
        if (deepChanges.removedReferences.length > 0) {
          console.log(
            `➖ Found ${deepChanges.removedReferences.length} removed deep references`
          );
          console.log(
            `➖ Removed references: ${deepChanges.removedReferences.join(', ')}`
          );

          // Get stored deep references to understand removal context
          const storedDeepRefs =
            await this.deepReferenceTracker.getStoredDeepReferences(
              sourceEntryId,
              targetEntryId
            );

          if (storedDeepRefs) {
            console.log(
              `🔍 Retrieved stored deep references: ${
                Object.keys(storedDeepRefs).length
              } entries`
            );

            // Debug: Show details of stored references for removed ones
            deepChanges.removedReferences.forEach((refId) => {
              const stored = storedDeepRefs[refId];
              console.log(`🔍 Stored data for ${refId}:`, {
                parentField: stored?.parentField,
                depth: stored?.depth,
                exists: !!stored,
              });
            });

            const removedRefFieldChanges =
              await this.groupRemovedReferencesByField(
                deepChanges.removedReferences,
                storedDeepRefs,
                environment
              );

            console.log(
              `🗂️ Grouped removed references:`,
              removedRefFieldChanges
            );

            for (const [fieldName, removedRefs] of Object.entries(
              removedRefFieldChanges
            )) {
              console.log(
                `➖ Creating change entry for field ${fieldName} with ${removedRefs.length} removed refs`
              );
              changes.push({
                fieldName,
                type: 'enhanced-reference-field',
                changeType: 'deleted',
                isTranslatable: false,
                needsTranslation: false,
                deepChanges: removedRefs.map((ref) => ({
                  refId: ref,
                  type: 'removed',
                  depth: storedDeepRefs[ref]?.depth || 1,
                })),
                referencedEntries: [], // No entries to reference since they're removed
              });
            }
          }
        }

        // Handle direct reference changes that don't appear in main entry fields
        const directRefChanges = [
          ...deepChanges.changedReferences,
          ...deepChanges.newReferences,
        ].filter((ref) => ref.depth > 1); // Only nested references

        if (directRefChanges.length > 0) {
          changes.push({
            fieldName: 'direct-deep-references',
            type: 'direct-reference-translation',
            changeType: 'modified',
            isTranslatable: true,
            needsTranslation: true,
            deepChanges: directRefChanges,
            referencedEntries: [],
          });
        }
      } catch (deepError) {
        console.warn(
          '⚠️ Deep reference change detection failed:',
          deepError.message
        );
        // Continue with basic changes even if deep detection fails
      }
    } else {
      console.log(
        'ℹ️ Deep reference tracking not available - using basic change detection'
      );
    }

    console.log(
      `✅ Enhanced change detection complete: ${changes.length} changes found`
    );
    return changes;
  }

  /**
   * Basic field-level change detection (original logic)
   */
  async detectBasicFieldChanges(
    sourceEntry,
    lastTranslatedVersion,
    sourceEntryId,
    targetEntryId
  ) {
    const changes = [];

    // Get stored field hashes
    const relationship = await this.metadataService.getRelationship(
      sourceEntryId,
      targetEntryId
    );
    const storedFieldHashes = relationship?.fieldHashes || {};

    // Generate current field hashes
    const currentFieldHashes = this.generateFieldHashes(sourceEntry);

    // Compare hashes to detect changes
    for (const [fieldName, currentHash] of Object.entries(currentFieldHashes)) {
      const storedHash = storedFieldHashes[fieldName];

      if (storedHash !== currentHash) {
        const fieldValue = sourceEntry.fields[fieldName];

        if (this.isTranslatableField(fieldName, fieldValue)) {
          changes.push({
            fieldName,
            type: 'field',
            changeType: storedHash ? 'modified' : 'added',
            oldValue: null, // We don't store old values, just hashes
            newValue: fieldValue,
            isTranslatable: true,
            needsTranslation: true,
          });

          console.log(
            `📝 Field changed: ${fieldName} (${
              storedHash ? 'modified' : 'added'
            })`
          );
        }
      }
    }

    // Check for deleted fields
    for (const fieldName of Object.keys(storedFieldHashes)) {
      if (!currentFieldHashes[fieldName]) {
        changes.push({
          fieldName,
          type: 'field',
          changeType: 'deleted',
          oldValue: null,
          newValue: null,
          isTranslatable: false,
          needsTranslation: false,
        });

        console.log(`➖ Field deleted: ${fieldName}`);
      }
    }

    return changes;
  }

  /**
   * Group reference changes by the field that contains them
   */
  async groupReferenceChangesByField(
    sourceEntry,
    changedReferences,
    environment
  ) {
    const fieldChanges = {};

    for (const refChange of changedReferences) {
      // Find which field contains this reference
      const containingField = await this.findFieldContainingReference(
        sourceEntry,
        refChange.id,
        environment
      );

      if (containingField) {
        if (!fieldChanges[containingField]) {
          fieldChanges[containingField] = [];
        }
        fieldChanges[containingField].push({
          ...refChange,
          type: 'changed',
        });
      }
    }

    return fieldChanges;
  }

  /**
   * Group new references by field
   */
  async groupNewReferencesByField(sourceEntry, newReferences, environment) {
    const fieldChanges = {};

    for (const newRef of newReferences) {
      const containingField = await this.findFieldContainingReference(
        sourceEntry,
        newRef.id,
        environment
      );

      if (containingField) {
        if (!fieldChanges[containingField]) {
          fieldChanges[containingField] = [];
        }
        fieldChanges[containingField].push(newRef);
      }
    }

    return fieldChanges;
  }

  /**
   * Group removed references by field using stored reference data
   */
  async groupRemovedReferencesByField(
    removedReferences,
    storedDeepRefs,
    environment
  ) {
    const fieldChanges = {};

    console.log(
      `🗂️ Grouping ${removedReferences.length} removed references by field`
    );

    for (const refId of removedReferences) {
      const storedRef = storedDeepRefs[refId];
      console.log(`🔍 Processing removed ref ${refId}:`, {
        hasStoredRef: !!storedRef,
        parentField: storedRef?.parentField,
        fullStoredRef: storedRef,
      });

      if (storedRef && storedRef.parentField) {
        const fieldName = storedRef.parentField;
        if (!fieldChanges[fieldName]) {
          fieldChanges[fieldName] = [];
        }
        fieldChanges[fieldName].push(refId);
        console.log(`✅ Added ${refId} to field ${fieldName}`);
      } else {
        console.log(
          `❌ Skipped ${refId}: ${
            !storedRef ? 'no stored ref' : 'no parentField'
          }`
        );
      }
    }

    console.log(`🗂️ Final field changes:`, fieldChanges);
    return fieldChanges;
  }

  /**
   * Find which field contains a specific reference
   */
  async findFieldContainingReference(sourceEntry, refId, environment) {
    for (const [fieldName, fieldValue] of Object.entries(
      sourceEntry.fields || {}
    )) {
      if (this.fieldContainsReference(fieldValue, refId)) {
        return fieldName;
      }
    }

    // Check nested references (depth > 1)
    for (const [fieldName, fieldValue] of Object.entries(
      sourceEntry.fields || {}
    )) {
      if (
        await this.fieldContainsNestedReference(
          fieldValue,
          refId,
          environment,
          1,
          3
        )
      ) {
        return fieldName;
      }
    }

    return null;
  }

  /**
   * Check if a field directly contains a reference
   */
  fieldContainsReference(fieldValue, refId) {
    if (!fieldValue) return false;

    // Handle localized fields
    if (
      typeof fieldValue === 'object' &&
      !Array.isArray(fieldValue) &&
      !fieldValue.sys
    ) {
      for (const localeValue of Object.values(fieldValue)) {
        if (this.fieldContainsReference(localeValue, refId)) {
          return true;
        }
      }
      return false;
    }

    // Handle arrays of references
    if (Array.isArray(fieldValue)) {
      return fieldValue.some((item) => item?.sys?.id === refId);
    }

    // Handle single reference
    if (fieldValue?.sys?.id === refId) {
      return true;
    }

    return false;
  }

  /**
   * Check if a field contains a nested reference (recursive)
   */
  async fieldContainsNestedReference(
    fieldValue,
    refId,
    environment,
    currentDepth,
    maxDepth
  ) {
    if (currentDepth >= maxDepth) return false;

    const references = this.extractReferencesFromField(fieldValue);

    for (const ref of references) {
      if (ref?.sys?.id) {
        try {
          const referencedEntry = await environment.getEntry(ref.sys.id);

          // Check if this referenced entry contains our target reference
          for (const [nestedFieldName, nestedFieldValue] of Object.entries(
            referencedEntry.fields || {}
          )) {
            if (this.fieldContainsReference(nestedFieldValue, refId)) {
              return true;
            }

            // Recurse deeper
            if (
              await this.fieldContainsNestedReference(
                nestedFieldValue,
                refId,
                environment,
                currentDepth + 1,
                maxDepth
              )
            ) {
              return true;
            }
          }
        } catch (error) {
          // Skip entries we can't fetch
          continue;
        }
      }
    }

    return false;
  }

  /**
   * Extract all references from a field value
   */
  extractReferencesFromField(fieldValue) {
    const references = [];

    if (!fieldValue) return references;

    // Handle localized fields
    if (
      typeof fieldValue === 'object' &&
      !Array.isArray(fieldValue) &&
      !fieldValue.sys
    ) {
      for (const localeValue of Object.values(fieldValue)) {
        references.push(...this.extractReferencesFromField(localeValue));
      }
      return references;
    }

    // Handle arrays
    if (Array.isArray(fieldValue)) {
      for (const item of fieldValue) {
        if (item?.sys?.type === 'Link') {
          references.push(item);
        }
      }
      return references;
    }

    // Handle single reference
    if (fieldValue?.sys?.type === 'Link') {
      references.push(fieldValue);
    }

    return references;
  }

  /**
   * Get referenced entries for a specific field
   */
  async getReferencedEntriesForField(sourceEntry, fieldName, environment) {
    const fieldValue = sourceEntry.fields[fieldName];
    if (!fieldValue) return [];

    const references = this.extractReferencesFromField(fieldValue);
    const entries = [];

    for (const ref of references) {
      if (ref?.sys?.id && ref.sys.linkType === 'Entry') {
        try {
          const entry = await environment.getEntry(ref.sys.id);
          entries.push(entry);
        } catch (error) {
          console.warn(
            `⚠️ Could not fetch referenced entry ${ref.sys.id}:`,
            error.message
          );
        }
      }
    }

    return entries;
  }

  /**
   * Update reference versions after change detection
   */
  async updateReferenceVersions(
    sourceEntry,
    sourceEntryId,
    targetEntryId,
    environment
  ) {
    if (!this.deepReferenceTracker) return;

    try {
      // Build or update the deep reference map
      await this.deepReferenceTracker.buildDeepReferenceMap(
        sourceEntryId,
        targetEntryId
      );
      console.log('✅ Reference versions updated successfully');
    } catch (error) {
      console.warn('⚠️ Failed to update reference versions:', error.message);
    }
  }

  /**
   * Generate field hashes for change detection
   */
  generateFieldHashes(entry) {
    const fieldHashes = {};

    for (const [fieldId, fieldValue] of Object.entries(entry.fields || {})) {
      if (this.isTranslatableField(fieldId, fieldValue)) {
        fieldHashes[fieldId] = this.generateFieldHash(fieldValue);
      }
    }

    return fieldHashes;
  }

  /**
   * Generate hash for a specific field
   */
  generateFieldHash(fieldValue) {
    const content = JSON.stringify(fieldValue, null, 0);
    return crypto.createHash('sha256').update(content).digest('hex');
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

    // Skip reference fields entirely
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
      return true;
    }

    return false;
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
   * Get deep reference statistics
   */
  async getDeepReferenceStatistics(sourceEntryId, targetEntryId) {
    if (!this.deepReferenceTracker) {
      return {
        error: 'Deep reference tracking not available',
        totalReferences: 0,
        referencesByDepth: {},
        lastScanned: 'never',
        maxDepth: 0,
      };
    }

    try {
      return await this.deepReferenceTracker.getReferenceStatistics(
        sourceEntryId,
        targetEntryId
      );
    } catch (error) {
      console.error(`❌ Error getting reference statistics: ${error.message}`);
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
   * Force rebuild deep reference map
   */
  async rebuildDeepReferenceMap(sourceEntryId, targetEntryId) {
    if (!this.deepReferenceTracker) {
      console.error('❌ Deep reference tracking not available');
      return false;
    }

    try {
      console.log(
        `🔄 Rebuilding deep reference map for ${sourceEntryId} → ${targetEntryId}`
      );
      await this.deepReferenceTracker.buildDeepReferenceMap(
        sourceEntryId,
        targetEntryId
      );
      return true;
    } catch (error) {
      console.error(`❌ Error rebuilding reference map: ${error.message}`);
      return false;
    }
  }
}
