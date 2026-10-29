import { createPetalHooks, functionIds as petalIds } from '../game/server/petals.mjs';
import { createEntityHooks, functionIds as entityIds } from '../game/server/entities.mjs';
import { createServerOutputHooks, functionIds as outputIds } from '../game/server/output.mjs';
import { createClientTransportHooks, functionIds as transportIds } from '../game/client/transport.mjs';
import { createSpecialPetalHooks, functionIds as specialPetalIds } from '../game/server/petals-special.mjs';
import { createCombatHooks, functionIds as combatIds } from '../game/server/combat.mjs';
import { createClientSnapshotHooks, functionIds as snapshotIds } from '../game/client/snapshots.mjs';
import { createPetalFactoryHooks, functionIds as petalFactoryIds } from '../game/server/petal-factories.mjs';
import { createTransformHooks, functionIds as transformIds } from '../game/server/transforms.mjs';
import { createDamageHooks, functionIds as damageIds } from '../game/server/damage.mjs';
import { createPetalLifecycleHooks, functionIds as petalLifecycleIds } from '../game/server/petal-lifecycle.mjs';
import { createSnapshotDecoderHooks, functionIds as snapshotDecoderIds } from '../game/client/snapshot-decoder.mjs';
import { createOwnershipHooks, functionIds as ownershipIds } from '../game/server/ownership.mjs';
import { createSpatialAiHooks, functionIds as spatialAiIds } from '../game/server/spatial-ai.mjs';
import { createEffectHooks, functionIds as effectIds } from '../game/server/effects.mjs';
import { createCellAttachmentHooks, functionIds as cellAttachmentIds } from '../game/server/cell-attachment.mjs';
import { createSimulationHooks, functionIds as simulationIds } from '../game/server/simulation.mjs';
import { createClockHooks, functionIds as clockIds } from '../game/server/clock.mjs';
import { createInitializationHooks, functionIds as initializationIds } from '../game/server/initialization.mjs';
import { createLoadoutHooks, functionIds as loadoutIds } from '../game/server/loadout.mjs';
import { createInputHooks, functionIds as inputIds } from '../game/server/input.mjs';
import { createEntitySnapshotHooks, functionIds as entitySnapshotIds } from '../game/client/entity-snapshot.mjs';
import { createComponentHooks, functionIds as componentIds } from '../game/server/components.mjs';
import { createSimulationTickHooks, functionIds as simulationTickIds } from '../game/server/simulation-tick.mjs';
import { createStringUtilityHooks, functionIds as stringUtilityIds } from '../game/server/string-utilities.mjs';
import { createMemcmpHook as createMemcmpHooks, functionIds as memcmpIds } from '../game/server/memcmp.mjs';
import { createLifecycleHelperHooks, functionIds as lifecycleHelperIds } from '../game/server/lifecycle-helpers.mjs';
import { createTimeoutRegistryHook, functionIds as timeoutRegistryIds } from '../game/server/timeout-registry.mjs';
import { createTrigKernelHooks, functionIds as trigKernelIds } from '../game/server/trig-kernels.mjs';
import { createTimeoutFireHook, functionIds as timeoutFireIds } from '../game/server/timeout-fire.mjs';
import { createGrowthFactorHook, functionIds as growthFactorIds } from '../game/server/growth-factor.mjs';
import { createServerFrexpHook, functionIds as serverFrexpIds } from '../game/server/frexp.mjs';
import { createWideShiftHook, functionIds as wideShiftIds } from '../game/server/wide-shift.mjs';
import { createTimeoutFireHook as createClientTimeoutFireHook, functionIds as clientTimeoutFireIds } from '../game/client/timeout-fire.mjs';
import { createCheckWebSocketsHook, functionIds as checkWebSocketsIds } from '../game/server/check-websockets.mjs';
import { createPointerArrayHook, functionIds as pointerArrayIds } from '../game/server/allocation.mjs';
import { createPetalTooltipHook, functionIds as petalTooltipIds } from '../game/client/petal-tooltip.mjs';
import { createTrigCorrectionHook, functionIds as cosineCorrectionIds } from '../game/server/cosine-correction.mjs';
import { createEntityDefinitionHook, functionIds as entityDefinitionIds } from '../game/server/entity-definitions.mjs';
import { createNumberParseHook, functionIds as numberParseIds } from '../game/server/number-parse.mjs';
import { createScanUtilitiesHook, functionIds as scanUtilityIds } from '../game/server/scan-utilities.mjs';
import { createStringMoveHooks, functionIds as stringMoveIds } from '../game/server/string-move.mjs';
import { createScalarHelperHooks, functionIds as scalarHelperIds } from '../game/server/scalar-helpers.mjs';
import { createSineOffsetHook, functionIds as sineOffsetIds } from '../game/server/sine-offset.mjs';
import { createVectorHelperHook, functionIds as vectorHelperIds } from '../game/server/vector-helpers.mjs';
import { createAtanHook, functionIds as atanIds } from '../game/server/atan.mjs';
import { createBumpAllocatorHook, functionIds as bumpAllocatorIds } from '../game/server/bump-allocator.mjs';
import { createWideMultiplyHook, functionIds as wideMultiplyIds } from '../game/server/wide-multiply.mjs';
import { createScalbnHook, functionIds as scalbnIds } from '../game/server/scalbn.mjs';
import { createFourRecordSortHook, functionIds as fourRecordSortIds } from '../game/server/four-record-sort.mjs';
import { createContainerEndHook, functionIds as containerEndIds } from '../game/server/container-end.mjs';
import { createByteMoveHook, functionIds as byteMoveIds } from '../game/server/byte-move.mjs';
import { createRecordSortHook, functionIds as recordSortIds } from '../game/server/record-sort.mjs';
import { createRandomStateHook, functionIds as randomStateIds } from '../game/server/random-state.mjs';
import { createFreeBlockHook, functionIds as freeBlockIds } from '../game/server/free-block.mjs';
import { createCollisionFilterHook, functionIds as collisionFilterIds } from '../game/server/collision-filter.mjs';
import { createMbrtowcHook, functionIds as mbrtowcIds } from '../game/server/mbrtowc.mjs';
import { createDepthComparatorHook, functionIds as depthComparatorIds } from '../game/server/depth-comparator.mjs';
import { createPackedKeySortHook, functionIds as packedKeySortIds } from '../game/server/packed-key-sort.mjs';
import { createFiveKeySortHook, functionIds as fiveKeySortIds } from '../game/server/packed-key-sort-five.mjs';
import { createUtf8ScanHook, functionIds as utf8ScanIds } from '../game/server/utf8-scan.mjs';
import { createSpawnManager192Hook, functionIds as spawnManager192Ids } from '../game/server/spawn-manager-192.mjs';
import { createSpawnComponentHooks, functionIds as spawnComponentIds } from '../game/server/spawn-components.mjs';
import { createFloatFormatSuffixHook, functionIds as floatFormatSuffixIds } from '../game/server/float-format-suffix.mjs';
import { createUtf16ToUtf8Hook, functionIds as utf16ToUtf8Ids } from '../game/server/utf16-to-utf8.mjs';
import { createUtf8DecodeHook, functionIds as utf8DecodeIds } from '../game/server/utf8-decode.mjs';
import { createUnicodeCodecHooks, functionIds as unicodeCodecIds } from '../game/server/unicode-codecs.mjs';
import { createEntityFlagResetHook, functionIds as entityFlagResetIds } from '../game/server/entity-flag-reset.mjs';
import { createRemPio2fHook, functionIds as remPio2fIds } from '../game/server/rem-pio2f.mjs';
import { createRemPio2Hook, functionIds as remPio2Ids } from '../game/server/rem-pio2.mjs';
import { createStringTableDestructionHook, functionIds as stringTableDestructionIds } from '../game/server/string-table-destruction.mjs';
import { createRemPio2LargeHook, functionIds as remPio2LargeIds } from '../game/server/rem-pio2-large.mjs';
import { createCatalogInitializerHook, functionIds as catalogInitializerIds } from '../game/server/catalog-initializers.mjs';
import { createStaticObjectLifecycleHooks, functionIds as staticObjectLifecycleIds } from '../game/server/static-object-lifecycle.mjs';
import { createCatalogInitializer2Hooks, functionIds as catalogInitializer2Ids } from '../game/server/catalog-initializers-2.mjs';
import { createObjectMethodDispatchHook, functionIds as objectMethodDispatchIds } from '../game/server/object-method-dispatch.mjs';
import { createStringCopyConstructorHook, functionIds as stringCopyConstructorIds } from '../game/server/string-copy-constructor.mjs';
import { createAbiLeafHelperHooks, functionIds as abiLeafHelperIds } from '../game/server/abi-leaf-helpers.mjs';
import { createSequenceAndTableHelperHooks, functionIds as sequenceAndTableHelperIds } from '../game/server/sequence-and-table-helpers.mjs';
import { createTableTranscoderHooks, functionIds as tableTranscoderIds } from '../game/server/table-transcoders.mjs';
import { createStringAndSequencePrimitiveHooks, functionIds as stringAndSequencePrimitiveIds } from '../game/server/string-and-sequence-primitives.mjs';
import { createParserAndRoundingHooks, functionIds as parserAndRoundingIds } from '../game/server/parser-and-rounding.mjs';
import { createSort3AndStateHooks, functionIds as sort3AndStateIds } from '../game/server/sort3-and-state-helpers.mjs';
import { createUtf8EncodeCodepointHook, functionIds as utf8EncodeCodepointIds } from '../game/server/utf8-encode-codepoint.mjs';
import { createMovableRecordHook, functionIds as movableRecordIds } from '../game/server/movable-record.mjs';
import { createUtf8ToUtf16Hook, functionIds as utf8ToUtf16Ids } from '../game/server/utf8-to-utf16.mjs';
import { createStringAssignmentAdapterHooks, functionIds as stringAssignmentAdapterIds } from '../game/server/string-assignment-adapters.mjs';
import { createStringConstructionWrapperHooks, functionIds as stringConstructionWrapperIds } from '../game/server/string-construction-wrapper.mjs';
import { createStringCopyAssignmentHook, functionIds as stringCopyAssignmentIds } from '../game/server/string-copy-assignment.mjs';
import { createStringLengthAssignmentHook, functionIds as stringLengthAssignmentIds } from '../game/server/string-length-assignment.mjs';
import { createWideFloatCompareHook, functionIds as wideFloatCompareIds } from '../game/server/wide-float-compare.mjs';
import { createThreeWordFloatCompareHook, functionIds as threeWordFloatCompareIds } from '../game/server/three-word-float-compare.mjs';
import { createStreamTransitionHook, functionIds as streamTransitionIds } from '../game/server/stream-transition.mjs';
import { createStreamPutbackHook, functionIds as streamPutbackIds } from '../game/server/stream-putback.mjs';
import { createStreamSeekHook, functionIds as streamSeekIds } from '../game/server/stream-seek.mjs';
import { createByteRangeCompareHook, functionIds as byteRangeCompareIds } from '../game/server/byte-range-compare.mjs';
import { createStreamWriteByteHook, functionIds as streamWriteByteIds } from '../game/server/stream-write-byte.mjs';
import { createStreamBufferPrimitiveHooks, functionIds as streamBufferPrimitiveIds } from '../game/server/stream-buffer-primitives.mjs';
import { createStringIdentityEqualityHook, functionIds as stringIdentityEqualityIds } from '../game/server/string-identity-equality.mjs';
import { createInlineStorageHook, functionIds as inlineStorageIds } from '../game/server/inline-storage.mjs';
import { createStringDestructorHook, functionIds as stringDestructorIds } from '../game/server/string-destructor.mjs';
import { createReleaseStorageHook, functionIds as releaseStorageIds } from '../game/server/release-storage.mjs';
import { createStreamReadWordRecordHook, functionIds as streamReadWordRecordIds } from '../game/server/stream-read-word-record.mjs';
import { createStringAppendHook, functionIds as stringAppendIds } from '../game/server/string-append.mjs';
import { createMinusStringHook, functionIds as minusStringIds } from '../game/server/minus-string.mjs';
import { createDeleteGuardHook, functionIds as deleteGuardIds } from '../game/server/delete-guard.mjs';
import { createStreamWriteWordHook, functionIds as streamWriteWordIds } from '../game/server/stream-write-word.mjs';
import { createStringResizeHook, functionIds as stringResizeIds } from '../game/server/string-resize.mjs';
import { createStringLengthSetterHook, functionIds as stringLengthSetterIds } from '../game/server/string-length-setter.mjs';
import { createGlobalLocaleCacheHook, functionIds as globalLocaleCacheIds } from '../game/server/global-locale-cache.mjs';
import { createLocaleFacetReleaseHook, functionIds as localeFacetReleaseIds } from '../game/server/locale-facet-release.mjs';
import { createSmallAccessorHooks, functionIds as smallAccessorIds } from '../game/server/small-accessors.mjs';
import { createTypeCheckHook, functionIds as typeCheckIds } from '../game/server/type-check.mjs';
import { createStreamStatePrimitiveHooks, functionIds as streamStatePrimitiveIds } from '../game/server/stream-state-primitives.mjs';
import { createStreamStatusHooks, functionIds as streamStatusIds } from '../game/server/stream-status.mjs';
import { createStreamStatusEqualityHooks, functionIds as streamStatusEqualityIds } from '../game/server/stream-status-equality.mjs';
import { createStreamBlockWriteHooks, functionIds as streamBlockWriteIds } from '../game/server/stream-block-write.mjs';
import { createFacetWriteHook, functionIds as facetWriteIds } from '../game/server/facet-write.mjs';
import { createStreamHandleOpHooks, functionIds as streamHandleOpIds } from '../game/server/stream-handle-ops.mjs';
import { createStringMemberAssignHooks, functionIds as stringMemberAssignIds } from '../game/server/string-member-assign.mjs';
import { createStringValidateHook, functionIds as stringValidateIds } from '../game/server/string-validate.mjs';
import { createLocaleFacetGetterHooks, functionIds as localeFacetGetterIds } from '../game/server/locale-facet-getters.mjs';
import { createBoolStringHooks, functionIds as boolStringIds } from '../game/server/bool-string.mjs';
import { createWideBoolStringHooks, functionIds as wideBoolStringIds } from '../game/server/wide-bool-string.mjs';
import { createStreamFlagUpdateHook, functionIds as streamFlagUpdateIds } from '../game/server/stream-flag-update.mjs';
import { createInt64ParseLimitHooks, functionIds as int64ParseLimitIds } from '../game/server/int64-parse-limits.mjs';
import { createStreamReadCharHook, functionIds as streamReadCharIds } from '../game/server/stream-read-char.mjs';
import { createMemoryFillHook, functionIds as memoryFillIds } from '../game/server/memory-fill.mjs';
import { createMemoryCopyHooks, functionIds as memoryCopyIds } from '../game/server/memory-copy.mjs';
import { createVtableDestructorHooks, functionIds as vtableDestructorIds } from '../game/server/vtable-destructors.mjs';
import { createGlobalCleanupHooks, functionIds as globalCleanupIds } from '../game/server/global-cleanup.mjs';
import { createStreamGetCharHook, functionIds as streamGetCharIds } from '../game/server/stream-get-char.mjs';
import { createObjectDeleterHooks, functionIds as objectDeleterIds } from '../game/server/object-deleters.mjs';
import { createStreamWriteCopyHook, functionIds as streamWriteCopyIds } from '../game/server/stream-write-copy.mjs';
import { createGlobalListCleanupHooks, functionIds as globalListCleanupIds } from '../game/server/global-list-cleanup.mjs';
import { createRefcountHelperHooks, functionIds as refcountHelperIds } from '../game/server/refcount-helpers.mjs';
import { createFileSeekHook, functionIds as fileSeekIds } from '../game/server/file-seek.mjs';
import { createFormatPaddingHook, functionIds as formatPaddingIds } from '../game/server/format-padding.mjs';
import { createLocaleCallbackHooks, functionIds as localeCallbackIds } from '../game/server/locale-callbacks.mjs';
import { createWideLocaleCallbackHooks, functionIds as wideLocaleCallbackIds } from '../game/server/locale-callbacks-wide.mjs';
import { createLocaleObjectLifetimeHooks, functionIds as localeObjectLifetimeIds } from '../game/server/locale-object-lifetime.mjs';
import { createLocaleWideForwardHook, functionIds as localeWideForwardIds } from '../game/server/locale-wide-forward.mjs';
import { createLocaleDeleteHook, functionIds as localeDeleteIds } from '../game/server/locale-delete.mjs';
import { createGlobalBufferCleanupHook, functionIds as globalBufferCleanupIds } from '../game/server/global-buffer-cleanup.mjs';
import { createGlobalPointerVectorCleanupHook, functionIds as globalPointerVectorCleanupIds } from '../game/server/global-pointer-vector-cleanup.mjs';
import { createRangeCopyHook, functionIds as rangeCopyIds } from '../game/server/range-copy.mjs';
import { createStreamReadLineHook, functionIds as streamReadLineIds } from '../game/server/stream-read-line.mjs';
import { createGlobalFlagResetHook, functionIds as globalFlagResetIds } from '../game/server/global-flag-reset.mjs';
import { createComponentReleaseHook, functionIds as componentReleaseIds } from '../game/server/component-release.mjs';
import { createLocaleStreamStateHook, functionIds as localeStreamStateIds } from '../game/server/locale-stream-state.mjs';
import { createFormatTimeHook, functionIds as formatTimeIds } from '../game/server/format-time.mjs';
import { createFormatTimeOutputHook, functionIds as formatTimeOutputIds } from '../game/server/format-time-output.mjs';
import { createSortFourHook, functionIds as sortFourIds } from '../game/server/sort-four.mjs';
import { createUintToLongDoubleHook, functionIds as uintToLongDoubleIds } from '../game/server/uint-to-long-double.mjs';
import { createIntToLongDoubleHook, functionIds as intToLongDoubleIds } from '../game/server/int-to-long-double.mjs';
import { createStateTrapHook, functionIds as stateTrapIds } from '../game/server/state-trap.mjs';
import { createAbortHelperHooks, functionIds as abortHelperIds } from '../game/server/abort-helpers.mjs';
import { createStringRangeConstructHooks, functionIds as stringRangeConstructIds } from '../game/server/string-range-construct.mjs';
import { createObjectWrapperHooks, functionIds as objectWrapperIds } from '../game/server/object-wrappers.mjs';
import { createObjectCleanupChainHooks, functionIds as objectCleanupChainIds } from '../game/server/object-cleanup-chain.mjs';
import { createStringObjectWrapperHooks, functionIds as stringObjectWrapperIds } from '../game/server/string-object-wrappers.mjs';
import { createVirtualBaseWrapperHooks, functionIds as virtualBaseWrapperIds } from '../game/server/virtual-base-wrappers.mjs';
import { createLongDoubleConverterHooks, functionIds as longDoubleConverterIds } from '../game/server/long-double-converters.mjs';
import { createRandomIntHook, functionIds as randomIntIds } from '../game/server/random-int.mjs';
import { createSingletonGetterHooks, functionIds as singletonGetterIds } from '../game/server/singleton-getters.mjs';
import { createTwoDigitYearHooks, functionIds as twoDigitYearIds } from '../game/server/two-digit-year.mjs';
import { createVectorObjectDestructorHook, functionIds as vectorObjectDestructorIds } from '../game/server/vector-object-destructor.mjs';
import { createErrnoCategoryHook, functionIds as errnoCategoryIds } from '../game/server/errno-category.mjs';
import { createErrnoParseWrapperHooks, functionIds as errnoParseWrapperIds } from '../game/server/errno-parse-wrappers.mjs';
import { createErrnoMoreWrapperHooks, functionIds as errnoMoreWrapperIds } from '../game/server/errno-more-wrappers.mjs';
import { createVectorAtHook, functionIds as vectorAtIds } from '../game/server/vector-at.mjs';
import { createStringFillConstructHook, functionIds as stringFillConstructIds } from '../game/server/string-fill-construct.mjs';
import { createFunctionInvokerHook, functionIds as functionInvokerIds } from '../game/server/function-invoker.mjs';
import { createLocaleFacetLoopHook, functionIds as localeFacetLoopIds } from '../game/server/locale-facet-loop.mjs';
import { createLocaleFacetCleanupHook, functionIds as localeFacetCleanupIds } from '../game/server/locale-facet-cleanup.mjs';
import { createObjectInitializerHook, functionIds as objectInitializerIds } from '../game/server/object-initializer.mjs';
import { createLifecycleWrapperHooks, functionIds as lifecycleWrapperIds } from '../game/client/lifecycle-wrappers.mjs';
import { createFixedAddressForwarderHooks, functionIds as fixedAddressForwarderIds } from '../game/client/fixed-address-forwarders.mjs';
import { createClientSmallAccessorHooks, functionIds as clientSmallAccessorIds } from '../game/client/small-accessors.mjs';
import { createStringAndObjectForwarderHooks, functionIds as stringAndObjectForwarderIds } from '../game/client/string-and-object-forwarders.mjs';
import { createObjectDestructorHooks, functionIds as objectDestructorIds } from '../game/client/object-destructors.mjs';
import { createMiscTinyWrapperHooks, functionIds as miscTinyWrapperIds } from '../game/client/misc-tiny-wrappers.mjs';
import { createObjectLifecycleSlotHooks, functionIds as objectLifecycleSlotIds } from '../game/client/object-lifecycle-slots.mjs';
import { createFlagAndFieldHelperHooks, functionIds as flagAndFieldHelperIds } from '../game/client/flag-and-field-helpers.mjs';
import { createStaticInitializerGuardHooks, functionIds as staticInitializerGuardIds } from '../game/client/static-initializer-guards.mjs';
import { createAllocateOrAbortHook, functionIds as allocateOrAbortIds } from '../game/client/allocate-or-abort.mjs';
import { createStaticTableInitializerHooks, functionIds as staticTableInitializerIds } from '../game/client/static-table-initializers.mjs';
import { createInitializerAndFlagHooks, functionIds as initializerAndFlagIds } from '../game/client/initializers-and-flags.mjs';
import { createClientStringUtilityHooks, functionIds as clientStringUtilityIds } from '../game/client/string-utils.mjs';
import { createSlotAllocatorHooks, functionIds as slotAllocatorIds } from '../game/client/slot-allocators.mjs';
import { createFloatFieldSetterHooks, functionIds as floatFieldSetterIds } from '../game/client/float-field-setters.mjs';
import { createAsmConstWrapperHooks, functionIds as asmConstWrapperIds } from '../game/client/asm-const-wrappers.mjs';
import { createRefcountedStringDestructorHooks, functionIds as refcountedStringDestructorIds } from '../game/client/refcounted-string-destructors.mjs';
import { createLogWrapperHooks, functionIds as logWrapperIds } from '../game/client/log-wrappers.mjs';
import { createTimeConverterHooks, functionIds as timeConverterIds } from '../game/client/time-converters.mjs';
import { createArrayAndVtableDestructorHooks, functionIds as arrayAndVtableDestructorIds } from '../game/client/array-and-vtable-destructors.mjs';
import { createCompactDestructorHooks, functionIds as compactDestructorIds } from '../game/client/compact-destructors.mjs';
import { createSmallWrapperHooks, functionIds as smallWrapperIds } from '../game/client/small-wrappers.mjs';
import { createAsmConstCallbackHooks, functionIds as asmConstCallbackIds } from '../game/client/asm-const-callbacks.mjs';
import { createObjectInitializerHooks, functionIds as clientObjectInitializerIds } from '../game/client/object-initializers.mjs';
import { createNumericWrapperHooks, functionIds as numericWrapperIds } from '../game/client/numeric-wrappers.mjs';
import { createVtableInvokerHooks, functionIds as vtableInvokerIds } from '../game/client/vtable-invokers.mjs';
import { createBufferHelperHooks, functionIds as bufferHelperIds } from '../game/client/buffer-helpers.mjs';
import { createFlagHelperHooks, functionIds as flagHelperIds } from '../game/client/flag-helpers.mjs';
import { createCleanupAndConfigHooks, functionIds as cleanupAndConfigIds } from '../game/client/cleanup-and-config.mjs';
import { createRegistryAndLookupHooks, functionIds as registryAndLookupIds } from '../game/client/registry-and-lookup.mjs';
import { createIoAndAllocHooks, functionIds as ioAndAllocIds } from '../game/client/io-and-alloc.mjs';
import { createErrnoWrapperHooks, functionIds as errnoWrapperIds } from '../game/client/errno-wrappers.mjs';
import { createVectorHelperHooks, functionIds as clientVectorHelperIds } from '../game/client/vector-helpers.mjs';
import { createLogMarkerHooks, functionIds as logMarkerIds } from '../game/client/log-markers.mjs';
import { createDynamicCallThunkHooks, functionIds as dynamicCallThunkIds } from '../game/client/dynamic-call-thunks.mjs';
import { createIndirectHelperHooks, functionIds as indirectHelperIds } from '../game/client/indirect-helpers.mjs';
import { createVtableThunkHooks, functionIds as vtableThunkIds } from '../game/client/vtable-thunks.mjs';
import { createVtablePairHooks, functionIds as vtablePairIds } from '../game/client/vtable-pair-thunks.mjs';
import { createVtableForwardHooks, functionIds as vtableForwardIds } from '../game/client/vtable-forward-thunks.mjs';
import { createVtableChainHooks, functionIds as vtableChainIds } from '../game/client/vtable-chain-thunks.mjs';
import { createVtableIndexForwardHooks, functionIds as vtableIndexForwardIds } from '../game/client/vtable-index-forward-thunks.mjs';
import { createCallableInvokerHooks, functionIds as callableInvokerIds } from '../game/client/callable-invokers.mjs';
import { createCallableCopyConstructorHooks, functionIds as callableCopyConstructorIds } from '../game/client/callable-copy-constructors.mjs';
import { createClosurePairInvokerHooks, functionIds as closurePairInvokerIds } from '../game/client/closure-invoker-pairs.mjs';
import { createClosurePairResultInvokerHooks, functionIds as closurePairResultInvokerIds } from '../game/client/closure-invoker-pairs-result.mjs';
import { createClosureSingleResultInvokerHooks, functionIds as closureSingleResultInvokerIds } from '../game/client/closure-invoker-single-result.mjs';
import { createClosureTwoArgumentInvokerHooks, functionIds as closureTwoArgumentInvokerIds } from '../game/client/closure-invoker-two-arguments.mjs';
import { createPendingQueueDestructorHooks, functionIds as pendingQueueDestructorIds } from '../game/client/pending-queue-destructors.mjs';
import { createEntityGrowthHooks, functionIds as entityGrowthIds } from '../game/client/entity-growth.mjs';
import { createCallableCloneHooks, functionIds as callableCloneIds } from '../game/client/callable-clone-to-heap.mjs';
import { createCallableDestructorHooks, functionIds as callableDestructorIds } from '../game/client/callable-destructors.mjs';
import { createClosureChainInvokerHooks, functionIds as closureChainInvokerIds } from '../game/client/closure-chain-invokers.mjs';
import { createClosureAdapterChainHooks, functionIds as closureAdapterChainIds } from '../game/client/closure-adapter-chains.mjs';
import { createStaticQueueArrayHooks, functionIds as staticQueueArrayIds } from '../game/client/static-queue-arrays.mjs';
import { createPetalColorHooks, functionIds as petalColorIds } from '../game/client/petal-colors.mjs';
import { createReorderedChainHooks, functionIds as reorderedChainIds } from '../game/client/vtable-reordered-chain-thunks.mjs';
import { createQuadDispatchHooks, functionIds as quadDispatchIds } from '../game/client/vtable-quad-dispatch-thunks.mjs';
import { createIndexedChainHooks, functionIds as indexedChainIds } from '../game/client/vtable-indexed-chain-thunks.mjs';
import { createIndexedCallbackHooks, functionIds as indexedCallbackIds } from '../game/client/vtable-indexed-callback-thunks.mjs';
import { createIconvInitHooks, functionIds as iconvInitIds } from '../game/client/iconv-init.mjs';
import { createStaticCleanupHooks, functionIds as staticCleanupIds } from '../game/client/static-cleanup-loops.mjs';
import { createVirtualDestructorHooks, functionIds as virtualDestructorIds } from '../game/client/virtual-destructors.mjs';
import { createClientFrameHooks, functionIds as clientFrameIds } from '../game/client/frame.mjs';
import { createRenderFrameHooks, functionIds as renderFrameIds } from '../game/client/render-frame.mjs';
import { createClientClockHooks, functionIds as clientClockIds } from '../game/client/clock.mjs';
import { createClientTransformHooks, functionIds as clientTransformIds } from '../game/client/transforms.mjs';
import { createDrawingPrimitiveHooks, functionIds as drawingPrimitiveIds } from '../game/client/drawing-primitives.mjs';
import { createTextHooks, functionIds as textIds } from '../game/client/text.mjs';
import { createEntityRendererHooks, functionIds as entityRendererIds } from '../game/client/entity-renderer.mjs';
import { createClientRuntimePrimitiveHooks, functionIds as clientRuntimePrimitiveIds } from '../game/client/runtime-primitives.mjs';
import { createPlayerAppearanceHooks, functionIds as playerAppearanceIds } from '../game/client/player-appearance.mjs';
import { createComponent132RendererHooks, functionIds as component132RendererIds } from '../game/client/component-132-renderer.mjs';
import { createComponent148RendererHooks, functionIds as component148RendererIds } from '../game/client/component-148-renderer.mjs';
import { createClientMathHooks, functionIds as clientMathIds } from '../game/client/math.mjs';
import { createComponent128RendererHooks, functionIds as component128RendererIds } from '../game/client/component-128-renderer.mjs';
import { createComponents6480RendererHooks, functionIds as components6480RendererIds } from '../game/client/components-64-80-renderer.mjs';
import { createEyeRendererHooks, functionIds as eyeRendererIds } from '../game/client/eye-renderer.mjs';
import { createClientTrigHooks, functionIds as clientTrigIds } from '../game/client/trig.mjs';
import { createClientDoubleTrigHooks, functionIds as clientDoubleTrigIds } from '../game/client/double-trig.mjs';
import { createClientMemoryFillHooks, functionIds as clientMemoryFillIds } from '../game/client/memory-fill.mjs';
import { createEntityDefinitionHooks, functionIds as clientEntityDefinitionIds } from '../game/client/entity-definition.mjs';
import { createEntityRecordHooks, functionIds as clientEntityRecordIds } from '../game/client/entity-record.mjs';
import { createLeafHooks as createClientLeafHooks, functionIds as clientLeafIds } from '../game/client/leaf-functions.mjs';
import { createStraightLineHooks, functionIds as clientStraightLineIds } from '../game/client/straight-line.mjs';
import { createComposedHooks as createClientComposedHooks, functionIds as clientComposedIds } from '../game/client/composed.mjs';
import { createConditionalHooks as createClientConditionalHooks, functionIds as clientConditionalIds } from '../game/client/conditionals.mjs';
import { createWideMathHooks as createClientWideMathHooks, functionIds as clientWideMathIds } from '../game/client/wide-math.mjs';
import { createRangeHooks as createClientRangeHooks, functionIds as clientRangeIds } from '../game/client/ranges.mjs';
import { createPredicateHooks as createClientPredicateHooks, functionIds as clientPredicateIds } from '../game/client/predicates.mjs';
import { createMaterialHooks as createClientMaterialHooks, functionIds as clientMaterialIds } from '../game/client/materials.mjs';
import { createBufferHooks as createClientBufferHooks, functionIds as clientBufferIds } from '../game/client/buffers.mjs';
import { createRecordHooks as createClientRecordHooks, functionIds as clientRecordIds } from '../game/client/records.mjs';
import { createShiftHooks as createClientShiftHooks, functionIds as clientShiftIds } from '../game/client/shifts.mjs';
import { createWrapperHooks as createClientWrapperHooks, functionIds as clientWrapperIds } from '../game/client/wrappers.mjs';
import { createTextSupportHooks as createClientTextSupportHooks, functionIds as clientTextSupportIds } from '../game/client/text-support.mjs';
import { createNumberFormatHooks as createClientNumberFormatHooks, functionIds as clientNumberFormatIds } from '../game/client/number-format.mjs';
import { createScanFormatHooks as createClientScanFormatHooks, functionIds as clientScanFormatIds } from '../game/client/scan-format.mjs';
import { createConfigIoHooks as createClientConfigIoHooks, functionIds as clientConfigIoIds } from '../game/client/config-io.mjs';
import { createFloatArrayHooks as createClientFloatArrayHooks, functionIds as clientFloatArrayIds } from '../game/client/float-array.mjs';
import { createChannelPackHooks as createClientChannelPackHooks, functionIds as clientChannelPackIds } from '../game/client/channel-pack.mjs';
import { createBitmapDecodeHooks as createClientBitmapDecodeHooks, functionIds as clientBitmapDecodeIds } from '../game/client/bitmap-decode.mjs';
import { createRowBlitHooks as createClientRowBlitHooks, functionIds as clientRowBlitIds } from '../game/client/row-blit.mjs';
import { createPixelConvertHooks as createClientPixelConvertHooks, functionIds as clientPixelConvertIds } from '../game/client/pixel-convert.mjs';
import { createAlphaBlitHooks as createClientAlphaBlitHooks, functionIds as clientAlphaBlitIds } from '../game/client/alpha-blit.mjs';
import { createWindowCheckHooks as createClientWindowCheckHooks, functionIds as clientWindowCheckIds } from '../game/client/window-check.mjs';
import { createChannelBlitHooks as createClientChannelBlitHooks, functionIds as clientChannelBlitIds } from '../game/client/channel-blit.mjs';
import { createObjectConstructorHooks as createClientObjectConstructorHooks, functionIds as clientObjectConstructorIds } from '../game/client/object-constructor.mjs';
import { createAffineSamplerHooks as createClientAffineSamplerHooks, functionIds as clientAffineSamplerIds } from '../game/client/affine-sampler.mjs';
import { createAtanfHooks as createClientAtanfHooks, functionIds as clientAtanfIds } from '../game/client/atanf.mjs';
import { createAtanHooks as createClientAtanHooks, functionIds as clientAtanIds } from '../game/client/atan.mjs';
import { createSoftCompareHooks as createClientSoftCompareHooks, functionIds as clientSoftCompareIds } from '../game/client/soft-compare.mjs';
import { createBlendBlitHooks as createClientBlendBlitHooks, functionIds as clientBlendBlitIds } from '../game/client/blend-blit.mjs';
import { createUtf8DecodeHooks as createClientUtf8DecodeHooks, functionIds as clientUtf8DecodeIds } from '../game/client/utf8-decode.mjs';
import { createPixelChannelExtractHooks as createClientPixelChannelExtractHooks, functionIds as clientPixelChannelExtractIds } from '../game/client/pixel-channel-extract.mjs';
import { createPixelWriteModesHooks as createClientPixelWriteModesHooks, functionIds as clientPixelWriteModesIds } from '../game/client/pixel-write-modes.mjs';
import { createRgb565WriteModesHooks as createClientRgb565WriteModesHooks, functionIds as clientRgb565WriteModesIds } from '../game/client/rgb565-write-modes.mjs';
import { createRgb555WriteModesHooks as createClientRgb555WriteModesHooks, functionIds as clientRgb555WriteModesIds } from '../game/client/rgb555-write-modes.mjs';
import { createRgba8888WriteModesHooks as createClientRgba8888WriteModesHooks, functionIds as clientRgba8888WriteModesIds } from '../game/client/rgba8888-write-modes.mjs';
import { createParticleRecordHooks as createClientParticleRecordHooks, functionIds as clientParticleRecordIds } from '../game/client/particle-record.mjs';
import { createUtf8AdvanceHooks as createClientUtf8AdvanceHooks, functionIds as clientUtf8AdvanceIds } from '../game/client/utf8-advance.mjs';
import { createMbToWcHooks as createClientMbToWcHooks, functionIds as clientMbToWcIds } from '../game/client/mb-to-wc.mjs';
import { createRowChannelBlendHooks as createClientRowChannelBlendHooks, functionIds as clientRowChannelBlendIds } from '../game/client/row-channel-blend.mjs';
import { createScaledChannelBlitHooks as createClientScaledChannelBlitHooks, functionIds as clientScaledChannelBlitIds } from '../game/client/scaled-channel-blit.mjs';
import { createVtableConstructorHooks as createClientVtableConstructorHooks, functionIds as clientVtableConstructorIds } from '../game/client/vtable-constructors.mjs';
import { createGlobalDestructorHooks as createClientGlobalDestructorHooks, functionIds as clientGlobalDestructorIds } from '../game/client/global-destructors.mjs';
import { createFrexpHook as createClientFrexpHook, functionIds as clientFrexpIds } from '../game/client/frexp.mjs';
import { createRandomAngleHooks as createClientRandomAngleHooks, functionIds as clientRandomAngleIds } from '../game/client/random-angle.mjs';
import { createAllocateZeroedArrayHook as createClientAllocateZeroedArrayHook, functionIds as clientAllocateZeroedArrayIds } from '../game/client/allocate-zeroed-array.mjs';

import { createFrameWrapperHooks, functionIds as frameWrapperIds } from '../game/server/frame-wrappers.mjs';
import { createSmallMemoryHooks, functionIds as smallMemoryIds } from '../game/server/small-memory.mjs';

const groups = {
  sp_server: [
    { source: 'game/server/cell-attachment.mjs', ids: cellAttachmentIds, factory: createCellAttachmentHooks },
    { source: 'game/server/frame-wrappers.mjs', ids: frameWrapperIds, factory: createFrameWrapperHooks },
    { source: 'game/server/small-memory.mjs', ids: smallMemoryIds, factory: createSmallMemoryHooks },
    { source: 'game/server/petals.mjs', ids: petalIds, factory: createPetalHooks },
    { source: 'game/server/entities.mjs', ids: entityIds, factory: createEntityHooks },
    { source: 'game/server/output.mjs', ids: outputIds, factory: createServerOutputHooks },
    { source: 'game/server/petals-special.mjs', ids: specialPetalIds, factory: createSpecialPetalHooks },
    { source: 'game/server/combat.mjs', ids: combatIds, factory: createCombatHooks },
    { source: 'game/server/petal-factories.mjs', ids: petalFactoryIds, factory: createPetalFactoryHooks },
    { source: 'game/server/transforms.mjs', ids: transformIds, factory: createTransformHooks },
    { source: 'game/server/damage.mjs', ids: damageIds, factory: createDamageHooks },
    { source: 'game/server/petal-lifecycle.mjs', ids: petalLifecycleIds, factory: createPetalLifecycleHooks },
    { source: 'game/server/ownership.mjs', ids: ownershipIds, factory: createOwnershipHooks },
    { source: 'game/server/spatial-ai.mjs', ids: spatialAiIds, factory: createSpatialAiHooks },
    { source: 'game/server/effects.mjs', ids: effectIds, factory: createEffectHooks },
    { source: 'game/server/simulation.mjs', ids: simulationIds, factory: createSimulationHooks },
    { source: 'game/server/clock.mjs', ids: clockIds, factory: createClockHooks },
    { source: 'game/server/initialization.mjs', ids: initializationIds, factory: createInitializationHooks },
    { source: 'game/server/loadout.mjs', ids: loadoutIds, factory: createLoadoutHooks },
    { source: 'game/server/input.mjs', ids: inputIds, factory: createInputHooks },
    { source: 'game/server/components.mjs', ids: componentIds, factory: createComponentHooks },
    { source: 'game/server/simulation-tick.mjs', ids: simulationTickIds, factory: createSimulationTickHooks },
    { source: 'game/server/string-utilities.mjs', ids: stringUtilityIds, factory: createStringUtilityHooks },
    { source: 'game/server/memcmp.mjs', ids: memcmpIds, factory: createMemcmpHooks },
    { source: 'game/server/lifecycle-helpers.mjs', ids: lifecycleHelperIds, factory: createLifecycleHelperHooks },
    { source: 'game/server/timeout-registry.mjs', ids: timeoutRegistryIds, factory: createTimeoutRegistryHook },
    { source: 'game/server/trig-kernels.mjs', ids: trigKernelIds, factory: createTrigKernelHooks },
    { source: 'game/server/timeout-fire.mjs', ids: timeoutFireIds, factory: createTimeoutFireHook },
    { source: 'game/server/growth-factor.mjs', ids: growthFactorIds, factory: createGrowthFactorHook },
    { source: 'game/server/frexp.mjs', ids: serverFrexpIds, factory: createServerFrexpHook },
    { source: 'game/server/wide-shift.mjs', ids: wideShiftIds, factory: createWideShiftHook },
    { source: 'game/server/check-websockets.mjs', ids: checkWebSocketsIds, factory: createCheckWebSocketsHook },
    { source: 'game/server/allocation.mjs', ids: pointerArrayIds, factory: createPointerArrayHook },
    { source: 'game/server/cosine-correction.mjs', ids: cosineCorrectionIds, factory: createTrigCorrectionHook },
    { source: 'game/server/entity-definitions.mjs', ids: entityDefinitionIds, factory: createEntityDefinitionHook },
    { source: 'game/server/number-parse.mjs', ids: numberParseIds, factory: createNumberParseHook },
    { source: 'game/server/scan-utilities.mjs', ids: scanUtilityIds, factory: createScanUtilitiesHook },
    { source: 'game/server/string-move.mjs', ids: stringMoveIds, factory: createStringMoveHooks },
    { source: 'game/server/scalar-helpers.mjs', ids: scalarHelperIds, factory: createScalarHelperHooks },
    { source: 'game/server/sine-offset.mjs', ids: sineOffsetIds, factory: createSineOffsetHook },
    { source: 'game/server/vector-helpers.mjs', ids: vectorHelperIds, factory: createVectorHelperHook },
    { source: 'game/server/atan.mjs', ids: atanIds, factory: createAtanHook },
    { source: 'game/server/bump-allocator.mjs', ids: bumpAllocatorIds, factory: createBumpAllocatorHook },
    { source: 'game/server/wide-multiply.mjs', ids: wideMultiplyIds, factory: createWideMultiplyHook },
    { source: 'game/server/scalbn.mjs', ids: scalbnIds, factory: createScalbnHook },
    { source: 'game/server/four-record-sort.mjs', ids: fourRecordSortIds, factory: createFourRecordSortHook },
    { source: 'game/server/container-end.mjs', ids: containerEndIds, factory: createContainerEndHook },
    { source: 'game/server/byte-move.mjs', ids: byteMoveIds, factory: createByteMoveHook },
    { source: 'game/server/record-sort.mjs', ids: recordSortIds, factory: createRecordSortHook },
    { source: 'game/server/random-state.mjs', ids: randomStateIds, factory: createRandomStateHook },
    { source: 'game/server/free-block.mjs', ids: freeBlockIds, factory: createFreeBlockHook },
    { source: 'game/server/collision-filter.mjs', ids: collisionFilterIds, factory: createCollisionFilterHook },
    { source: 'game/server/mbrtowc.mjs', ids: mbrtowcIds, factory: createMbrtowcHook },
    { source: 'game/server/depth-comparator.mjs', ids: depthComparatorIds, factory: createDepthComparatorHook },
    { source: 'game/server/packed-key-sort.mjs', ids: packedKeySortIds, factory: createPackedKeySortHook },
    { source: 'game/server/packed-key-sort-five.mjs', ids: fiveKeySortIds, factory: createFiveKeySortHook },
    { source: 'game/server/utf8-scan.mjs', ids: utf8ScanIds, factory: createUtf8ScanHook },
    { source: 'game/server/spawn-manager-192.mjs', ids: spawnManager192Ids, factory: createSpawnManager192Hook },
    { source: 'game/server/spawn-components.mjs', ids: spawnComponentIds, factory: createSpawnComponentHooks },
    { source: 'game/server/float-format-suffix.mjs', ids: floatFormatSuffixIds, factory: createFloatFormatSuffixHook },
    { source: 'game/server/utf16-to-utf8.mjs', ids: utf16ToUtf8Ids, factory: createUtf16ToUtf8Hook },
    { source: 'game/server/utf8-decode.mjs', ids: utf8DecodeIds, factory: createUtf8DecodeHook },
    { source: 'game/server/unicode-codecs.mjs', ids: unicodeCodecIds, factory: createUnicodeCodecHooks },
    { source: 'game/server/entity-flag-reset.mjs', ids: entityFlagResetIds, factory: createEntityFlagResetHook },
    { source: 'game/server/rem-pio2f.mjs', ids: remPio2fIds, factory: createRemPio2fHook },
    { source: 'game/server/rem-pio2.mjs', ids: remPio2Ids, factory: createRemPio2Hook },
    { source: 'game/server/string-table-destruction.mjs', ids: stringTableDestructionIds, factory: createStringTableDestructionHook },
    { source: 'game/server/rem-pio2-large.mjs', ids: remPio2LargeIds, factory: createRemPio2LargeHook },
    { source: 'game/server/catalog-initializers.mjs', ids: catalogInitializerIds, factory: createCatalogInitializerHook },
    { source: 'game/server/static-object-lifecycle.mjs', ids: staticObjectLifecycleIds, factory: createStaticObjectLifecycleHooks },
    { source: 'game/server/catalog-initializers-2.mjs', ids: catalogInitializer2Ids, factory: createCatalogInitializer2Hooks },
    { source: 'game/server/object-method-dispatch.mjs', ids: objectMethodDispatchIds, factory: createObjectMethodDispatchHook },
    { source: 'game/server/string-copy-constructor.mjs', ids: stringCopyConstructorIds, factory: createStringCopyConstructorHook },
    { source: 'game/server/abi-leaf-helpers.mjs', ids: abiLeafHelperIds, factory: createAbiLeafHelperHooks },
    { source: 'game/server/sequence-and-table-helpers.mjs', ids: sequenceAndTableHelperIds, factory: createSequenceAndTableHelperHooks },
    { source: 'game/server/table-transcoders.mjs', ids: tableTranscoderIds, factory: createTableTranscoderHooks },
    { source: 'game/server/string-and-sequence-primitives.mjs', ids: stringAndSequencePrimitiveIds, factory: createStringAndSequencePrimitiveHooks },
    { source: 'game/server/parser-and-rounding.mjs', ids: parserAndRoundingIds, factory: createParserAndRoundingHooks },
    { source: 'game/server/sort3-and-state-helpers.mjs', ids: sort3AndStateIds, factory: createSort3AndStateHooks },
    { source: 'game/server/utf8-encode-codepoint.mjs', ids: utf8EncodeCodepointIds, factory: createUtf8EncodeCodepointHook },
    { source: 'game/server/movable-record.mjs', ids: movableRecordIds, factory: createMovableRecordHook },
    { source: 'game/server/utf8-to-utf16.mjs', ids: utf8ToUtf16Ids, factory: createUtf8ToUtf16Hook },
    { source: 'game/server/string-assignment-adapters.mjs', ids: stringAssignmentAdapterIds, factory: createStringAssignmentAdapterHooks },
    { source: 'game/server/string-construction-wrapper.mjs', ids: stringConstructionWrapperIds, factory: createStringConstructionWrapperHooks },
    { source: 'game/server/string-copy-assignment.mjs', ids: stringCopyAssignmentIds, factory: createStringCopyAssignmentHook },
    { source: 'game/server/string-length-assignment.mjs', ids: stringLengthAssignmentIds, factory: createStringLengthAssignmentHook },
    { source: 'game/server/wide-float-compare.mjs', ids: wideFloatCompareIds, factory: createWideFloatCompareHook },
    { source: 'game/server/three-word-float-compare.mjs', ids: threeWordFloatCompareIds, factory: createThreeWordFloatCompareHook },
    { source: 'game/server/stream-transition.mjs', ids: streamTransitionIds, factory: createStreamTransitionHook },
    { source: 'game/server/stream-putback.mjs', ids: streamPutbackIds, factory: createStreamPutbackHook },
    { source: 'game/server/stream-seek.mjs', ids: streamSeekIds, factory: createStreamSeekHook },
    { source: 'game/server/byte-range-compare.mjs', ids: byteRangeCompareIds, factory: createByteRangeCompareHook },
    { source: 'game/server/stream-write-byte.mjs', ids: streamWriteByteIds, factory: createStreamWriteByteHook },
    { source: 'game/server/stream-buffer-primitives.mjs', ids: streamBufferPrimitiveIds, factory: createStreamBufferPrimitiveHooks },
    { source: 'game/server/string-identity-equality.mjs', ids: stringIdentityEqualityIds, factory: createStringIdentityEqualityHook },
    { source: 'game/server/inline-storage.mjs', ids: inlineStorageIds, factory: createInlineStorageHook },
    { source: 'game/server/string-destructor.mjs', ids: stringDestructorIds, factory: createStringDestructorHook },
    { source: 'game/server/release-storage.mjs', ids: releaseStorageIds, factory: createReleaseStorageHook },
    { source: 'game/server/stream-read-word-record.mjs', ids: streamReadWordRecordIds, factory: createStreamReadWordRecordHook },
    { source: 'game/server/string-append.mjs', ids: stringAppendIds, factory: createStringAppendHook },
    { source: 'game/server/minus-string.mjs', ids: minusStringIds, factory: createMinusStringHook },
    { source: 'game/server/delete-guard.mjs', ids: deleteGuardIds, factory: createDeleteGuardHook },
    { source: 'game/server/stream-write-word.mjs', ids: streamWriteWordIds, factory: createStreamWriteWordHook },
    { source: 'game/server/string-resize.mjs', ids: stringResizeIds, factory: createStringResizeHook },
    { source: 'game/server/string-length-setter.mjs', ids: stringLengthSetterIds, factory: createStringLengthSetterHook },
    { source: 'game/server/global-locale-cache.mjs', ids: globalLocaleCacheIds, factory: createGlobalLocaleCacheHook },
    { source: 'game/server/locale-facet-release.mjs', ids: localeFacetReleaseIds, factory: createLocaleFacetReleaseHook },
    { source: 'game/server/small-accessors.mjs', ids: smallAccessorIds, factory: createSmallAccessorHooks },
    { source: 'game/server/type-check.mjs', ids: typeCheckIds, factory: createTypeCheckHook },
    { source: 'game/server/stream-state-primitives.mjs', ids: streamStatePrimitiveIds, factory: createStreamStatePrimitiveHooks },
    { source: 'game/server/stream-status.mjs', ids: streamStatusIds, factory: createStreamStatusHooks },
    { source: 'game/server/stream-status-equality.mjs', ids: streamStatusEqualityIds, factory: createStreamStatusEqualityHooks },
    { source: 'game/server/stream-block-write.mjs', ids: streamBlockWriteIds, factory: createStreamBlockWriteHooks },
    { source: 'game/server/facet-write.mjs', ids: facetWriteIds, factory: createFacetWriteHook },
    { source: 'game/server/stream-handle-ops.mjs', ids: streamHandleOpIds, factory: createStreamHandleOpHooks },
    { source: 'game/server/string-member-assign.mjs', ids: stringMemberAssignIds, factory: createStringMemberAssignHooks },
    { source: 'game/server/string-validate.mjs', ids: stringValidateIds, factory: createStringValidateHook },
    { source: 'game/server/locale-facet-getters.mjs', ids: localeFacetGetterIds, factory: createLocaleFacetGetterHooks },
    { source: 'game/server/bool-string.mjs', ids: boolStringIds, factory: createBoolStringHooks },
    { source: 'game/server/wide-bool-string.mjs', ids: wideBoolStringIds, factory: createWideBoolStringHooks },
    { source: 'game/server/stream-flag-update.mjs', ids: streamFlagUpdateIds, factory: createStreamFlagUpdateHook },
    { source: 'game/server/int64-parse-limits.mjs', ids: int64ParseLimitIds, factory: createInt64ParseLimitHooks },
    { source: 'game/server/stream-read-char.mjs', ids: streamReadCharIds, factory: createStreamReadCharHook },
    { source: 'game/server/memory-fill.mjs', ids: memoryFillIds, factory: createMemoryFillHook },
    { source: 'game/server/memory-copy.mjs', ids: memoryCopyIds, factory: createMemoryCopyHooks },
    { source: 'game/server/vtable-destructors.mjs', ids: vtableDestructorIds, factory: createVtableDestructorHooks },
    { source: 'game/server/global-cleanup.mjs', ids: globalCleanupIds, factory: createGlobalCleanupHooks },
    { source: 'game/server/stream-get-char.mjs', ids: streamGetCharIds, factory: createStreamGetCharHook },
    { source: 'game/server/object-deleters.mjs', ids: objectDeleterIds, factory: createObjectDeleterHooks },
    { source: 'game/server/stream-write-copy.mjs', ids: streamWriteCopyIds, factory: createStreamWriteCopyHook },
    { source: 'game/server/global-list-cleanup.mjs', ids: globalListCleanupIds, factory: createGlobalListCleanupHooks },
    { source: 'game/server/refcount-helpers.mjs', ids: refcountHelperIds, factory: createRefcountHelperHooks },
    { source: 'game/server/file-seek.mjs', ids: fileSeekIds, factory: createFileSeekHook },
    { source: 'game/server/format-padding.mjs', ids: formatPaddingIds, factory: createFormatPaddingHook },
    { source: 'game/server/locale-callbacks.mjs', ids: localeCallbackIds, factory: createLocaleCallbackHooks },
    { source: 'game/server/locale-callbacks-wide.mjs', ids: wideLocaleCallbackIds, factory: createWideLocaleCallbackHooks },
    { source: 'game/server/locale-object-lifetime.mjs', ids: localeObjectLifetimeIds, factory: createLocaleObjectLifetimeHooks },
    { source: 'game/server/locale-wide-forward.mjs', ids: localeWideForwardIds, factory: createLocaleWideForwardHook },
    { source: 'game/server/locale-delete.mjs', ids: localeDeleteIds, factory: createLocaleDeleteHook },
    { source: 'game/server/global-buffer-cleanup.mjs', ids: globalBufferCleanupIds, factory: createGlobalBufferCleanupHook },
    { source: 'game/server/global-pointer-vector-cleanup.mjs', ids: globalPointerVectorCleanupIds, factory: createGlobalPointerVectorCleanupHook },
    { source: 'game/server/range-copy.mjs', ids: rangeCopyIds, factory: createRangeCopyHook },
    { source: 'game/server/stream-read-line.mjs', ids: streamReadLineIds, factory: createStreamReadLineHook },
    { source: 'game/server/global-flag-reset.mjs', ids: globalFlagResetIds, factory: createGlobalFlagResetHook },
    { source: 'game/server/component-release.mjs', ids: componentReleaseIds, factory: createComponentReleaseHook },
    { source: 'game/server/locale-stream-state.mjs', ids: localeStreamStateIds, factory: createLocaleStreamStateHook },
    { source: 'game/server/format-time.mjs', ids: formatTimeIds, factory: createFormatTimeHook },
    { source: 'game/server/format-time-output.mjs', ids: formatTimeOutputIds, factory: createFormatTimeOutputHook },
    { source: 'game/server/sort-four.mjs', ids: sortFourIds, factory: createSortFourHook },
    { source: 'game/server/uint-to-long-double.mjs', ids: uintToLongDoubleIds, factory: createUintToLongDoubleHook },
    { source: 'game/server/int-to-long-double.mjs', ids: intToLongDoubleIds, factory: createIntToLongDoubleHook },
    { source: 'game/server/state-trap.mjs', ids: stateTrapIds, factory: createStateTrapHook },
    { source: 'game/server/abort-helpers.mjs', ids: abortHelperIds, factory: createAbortHelperHooks },
    { source: 'game/server/string-range-construct.mjs', ids: stringRangeConstructIds, factory: createStringRangeConstructHooks },
    { source: 'game/server/object-wrappers.mjs', ids: objectWrapperIds, factory: createObjectWrapperHooks },
    { source: 'game/server/object-cleanup-chain.mjs', ids: objectCleanupChainIds, factory: createObjectCleanupChainHooks },
    { source: 'game/server/string-object-wrappers.mjs', ids: stringObjectWrapperIds, factory: createStringObjectWrapperHooks },
    { source: 'game/server/virtual-base-wrappers.mjs', ids: virtualBaseWrapperIds, factory: createVirtualBaseWrapperHooks },
    { source: 'game/server/long-double-converters.mjs', ids: longDoubleConverterIds, factory: createLongDoubleConverterHooks },
    { source: 'game/server/random-int.mjs', ids: randomIntIds, factory: createRandomIntHook },
    { source: 'game/server/singleton-getters.mjs', ids: singletonGetterIds, factory: createSingletonGetterHooks },
    { source: 'game/server/two-digit-year.mjs', ids: twoDigitYearIds, factory: createTwoDigitYearHooks },
    { source: 'game/server/vector-object-destructor.mjs', ids: vectorObjectDestructorIds, factory: createVectorObjectDestructorHook },
    { source: 'game/server/errno-category.mjs', ids: errnoCategoryIds, factory: createErrnoCategoryHook },
    { source: 'game/server/errno-parse-wrappers.mjs', ids: errnoParseWrapperIds, factory: createErrnoParseWrapperHooks },
    { source: 'game/server/errno-more-wrappers.mjs', ids: errnoMoreWrapperIds, factory: createErrnoMoreWrapperHooks },
    { source: 'game/server/vector-at.mjs', ids: vectorAtIds, factory: createVectorAtHook },
    { source: 'game/server/string-fill-construct.mjs', ids: stringFillConstructIds, factory: createStringFillConstructHook },
    { source: 'game/server/function-invoker.mjs', ids: functionInvokerIds, factory: createFunctionInvokerHook },
    { source: 'game/server/locale-facet-loop.mjs', ids: localeFacetLoopIds, factory: createLocaleFacetLoopHook },
    { source: 'game/server/locale-facet-cleanup.mjs', ids: localeFacetCleanupIds, factory: createLocaleFacetCleanupHook },
    { source: 'game/server/object-initializer.mjs', ids: objectInitializerIds, factory: createObjectInitializerHook },
  ],
  client: [
    { source: 'game/client/static-cleanup-loops.mjs', ids: staticCleanupIds, factory: createStaticCleanupHooks },
    { source: 'game/client/iconv-init.mjs', ids: iconvInitIds, factory: createIconvInitHooks },
    { source: 'game/client/vtable-indexed-callback-thunks.mjs', ids: indexedCallbackIds, factory: createIndexedCallbackHooks },
    { source: 'game/client/vtable-indexed-chain-thunks.mjs', ids: indexedChainIds, factory: createIndexedChainHooks },
    { source: 'game/client/vtable-quad-dispatch-thunks.mjs', ids: quadDispatchIds, factory: createQuadDispatchHooks },
    { source: 'game/client/vtable-index-forward-thunks.mjs', ids: vtableIndexForwardIds, factory: createVtableIndexForwardHooks },
    { source: 'game/client/callable-invokers.mjs', ids: callableInvokerIds, factory: createCallableInvokerHooks },
    { source: 'game/client/callable-copy-constructors.mjs', ids: callableCopyConstructorIds, factory: createCallableCopyConstructorHooks },
    { source: 'game/client/closure-invoker-pairs.mjs', ids: closurePairInvokerIds, factory: createClosurePairInvokerHooks },
    { source: 'game/client/closure-invoker-pairs-result.mjs', ids: closurePairResultInvokerIds, factory: createClosurePairResultInvokerHooks },
    { source: 'game/client/closure-invoker-single-result.mjs', ids: closureSingleResultInvokerIds, factory: createClosureSingleResultInvokerHooks },
    { source: 'game/client/closure-invoker-two-arguments.mjs', ids: closureTwoArgumentInvokerIds, factory: createClosureTwoArgumentInvokerHooks },
    { source: 'game/client/pending-queue-destructors.mjs', ids: pendingQueueDestructorIds, factory: createPendingQueueDestructorHooks },
    { source: 'game/client/entity-growth.mjs', ids: entityGrowthIds, factory: createEntityGrowthHooks },
    { source: 'game/client/callable-clone-to-heap.mjs', ids: callableCloneIds, factory: createCallableCloneHooks },
    { source: 'game/client/callable-destructors.mjs', ids: callableDestructorIds, factory: createCallableDestructorHooks },
    { source: 'game/client/closure-chain-invokers.mjs', ids: closureChainInvokerIds, factory: createClosureChainInvokerHooks },
    { source: 'game/client/closure-adapter-chains.mjs', ids: closureAdapterChainIds, factory: createClosureAdapterChainHooks },
    { source: 'game/client/static-queue-arrays.mjs', ids: staticQueueArrayIds, factory: createStaticQueueArrayHooks },
    { source: 'game/client/petal-colors.mjs', ids: petalColorIds, factory: createPetalColorHooks },
    { source: 'game/client/vtable-reordered-chain-thunks.mjs', ids: reorderedChainIds, factory: createReorderedChainHooks },
    { source: 'game/client/vtable-chain-thunks.mjs', ids: vtableChainIds, factory: createVtableChainHooks },
    { source: 'game/client/vtable-forward-thunks.mjs', ids: vtableForwardIds, factory: createVtableForwardHooks },
    { source: 'game/client/vtable-pair-thunks.mjs', ids: vtablePairIds, factory: createVtablePairHooks },
    { source: 'game/client/vtable-thunks.mjs', ids: vtableThunkIds, factory: createVtableThunkHooks },
    { source: 'game/client/indirect-helpers.mjs', ids: indirectHelperIds, factory: createIndirectHelperHooks },
    { source: 'game/client/dynamic-call-thunks.mjs', ids: dynamicCallThunkIds, factory: createDynamicCallThunkHooks },
    { source: 'game/client/log-markers.mjs', ids: logMarkerIds, factory: createLogMarkerHooks },
    { source: 'game/client/errno-wrappers.mjs', ids: errnoWrapperIds, factory: createErrnoWrapperHooks },
    { source: 'game/client/vector-helpers.mjs', ids: clientVectorHelperIds, factory: createVectorHelperHooks },
    { source: 'game/client/io-and-alloc.mjs', ids: ioAndAllocIds, factory: createIoAndAllocHooks },
    { source: 'game/client/registry-and-lookup.mjs', ids: registryAndLookupIds, factory: createRegistryAndLookupHooks },
    { source: 'game/client/cleanup-and-config.mjs', ids: cleanupAndConfigIds, factory: createCleanupAndConfigHooks },
    { source: 'game/client/flag-helpers.mjs', ids: flagHelperIds, factory: createFlagHelperHooks },
    { source: 'game/client/buffer-helpers.mjs', ids: bufferHelperIds, factory: createBufferHelperHooks },
    { source: 'game/client/numeric-wrappers.mjs', ids: numericWrapperIds, factory: createNumericWrapperHooks },
    { source: 'game/client/vtable-invokers.mjs', ids: vtableInvokerIds, factory: createVtableInvokerHooks },
    { source: 'game/client/object-initializers.mjs', ids: clientObjectInitializerIds, factory: createObjectInitializerHooks },
    { source: 'game/client/asm-const-callbacks.mjs', ids: asmConstCallbackIds, factory: createAsmConstCallbackHooks },
    { source: 'game/client/small-wrappers.mjs', ids: smallWrapperIds, factory: createSmallWrapperHooks },
    { source: 'game/client/virtual-destructors.mjs', ids: virtualDestructorIds, factory: createVirtualDestructorHooks },
    { source: 'game/client/compact-destructors.mjs', ids: compactDestructorIds, factory: createCompactDestructorHooks },
    { source: 'game/client/array-and-vtable-destructors.mjs', ids: arrayAndVtableDestructorIds, factory: createArrayAndVtableDestructorHooks },
    { source: 'game/client/time-converters.mjs', ids: timeConverterIds, factory: createTimeConverterHooks },
    { source: 'game/client/log-wrappers.mjs', ids: logWrapperIds, factory: createLogWrapperHooks },
    { source: 'game/client/refcounted-string-destructors.mjs', ids: refcountedStringDestructorIds, factory: createRefcountedStringDestructorHooks },
    { source: 'game/client/asm-const-wrappers.mjs', ids: asmConstWrapperIds, factory: createAsmConstWrapperHooks },
    { source: 'game/client/float-field-setters.mjs', ids: floatFieldSetterIds, factory: createFloatFieldSetterHooks },
    { source: 'game/client/slot-allocators.mjs', ids: slotAllocatorIds, factory: createSlotAllocatorHooks },
    { source: 'game/client/string-utils.mjs', ids: clientStringUtilityIds, factory: createClientStringUtilityHooks },
    { source: 'game/client/initializers-and-flags.mjs', ids: initializerAndFlagIds, factory: createInitializerAndFlagHooks },
    { source: 'game/client/static-table-initializers.mjs', ids: staticTableInitializerIds, factory: createStaticTableInitializerHooks },
    { source: 'game/client/allocate-or-abort.mjs', ids: allocateOrAbortIds, factory: createAllocateOrAbortHook },
    { source: 'game/client/static-initializer-guards.mjs', ids: staticInitializerGuardIds, factory: createStaticInitializerGuardHooks },
    { source: 'game/client/flag-and-field-helpers.mjs', ids: flagAndFieldHelperIds, factory: createFlagAndFieldHelperHooks },
    { source: 'game/client/object-lifecycle-slots.mjs', ids: objectLifecycleSlotIds, factory: createObjectLifecycleSlotHooks },
    { source: 'game/client/misc-tiny-wrappers.mjs', ids: miscTinyWrapperIds, factory: createMiscTinyWrapperHooks },
    { source: 'game/client/object-destructors.mjs', ids: objectDestructorIds, factory: createObjectDestructorHooks },
    { source: 'game/client/string-and-object-forwarders.mjs', ids: stringAndObjectForwarderIds, factory: createStringAndObjectForwarderHooks },
    { source: 'game/client/small-accessors.mjs', ids: clientSmallAccessorIds, factory: createClientSmallAccessorHooks },
    { source: 'game/client/fixed-address-forwarders.mjs', ids: fixedAddressForwarderIds, factory: createFixedAddressForwarderHooks },
    { source: 'game/client/lifecycle-wrappers.mjs', ids: lifecycleWrapperIds, factory: createLifecycleWrapperHooks },
    { source: 'game/client/petal-tooltip.mjs', ids: petalTooltipIds, factory: createPetalTooltipHook },
    { source: 'game/client/timeout-fire.mjs', ids: clientTimeoutFireIds, factory: createClientTimeoutFireHook },
    { source: 'game/client/transport.mjs', ids: transportIds, factory: createClientTransportHooks },
    { source: 'game/client/snapshots.mjs', ids: snapshotIds, factory: createClientSnapshotHooks },
    { source: 'game/client/snapshot-decoder.mjs', ids: snapshotDecoderIds, factory: createSnapshotDecoderHooks },
    { source: 'game/client/entity-snapshot.mjs', ids: entitySnapshotIds, factory: createEntitySnapshotHooks },
    { source: 'game/client/frame.mjs', ids: clientFrameIds, factory: createClientFrameHooks },
    { source: 'game/client/render-frame.mjs', ids: renderFrameIds, factory: createRenderFrameHooks },
    { source: 'game/client/clock.mjs', ids: clientClockIds, factory: createClientClockHooks },
    { source: 'game/client/transforms.mjs', ids: clientTransformIds, factory: createClientTransformHooks },
    { source: 'game/client/drawing-primitives.mjs', ids: drawingPrimitiveIds, factory: createDrawingPrimitiveHooks },
    { source: 'game/client/text.mjs', ids: textIds, factory: createTextHooks },
    { source: 'game/client/entity-renderer.mjs', ids: entityRendererIds, factory: createEntityRendererHooks },
    { source: 'game/client/runtime-primitives.mjs', ids: clientRuntimePrimitiveIds, factory: createClientRuntimePrimitiveHooks },
    { source: 'game/client/player-appearance.mjs', ids: playerAppearanceIds, factory: createPlayerAppearanceHooks },
    { source: 'game/client/component-132-renderer.mjs', ids: component132RendererIds, factory: createComponent132RendererHooks },
    { source: 'game/client/component-148-renderer.mjs', ids: component148RendererIds, factory: createComponent148RendererHooks },
    { source: 'game/client/math.mjs', ids: clientMathIds, factory: createClientMathHooks },
    { source: 'game/client/component-128-renderer.mjs', ids: component128RendererIds, factory: createComponent128RendererHooks },
    { source: 'game/client/components-64-80-renderer.mjs', ids: components6480RendererIds, factory: createComponents6480RendererHooks },
    { source: 'game/client/eye-renderer.mjs', ids: eyeRendererIds, factory: createEyeRendererHooks },
    { source: 'game/client/trig.mjs', ids: clientTrigIds, factory: createClientTrigHooks },
    { source: 'game/client/double-trig.mjs', ids: clientDoubleTrigIds, factory: createClientDoubleTrigHooks },
    { source: 'game/client/memory-fill.mjs', ids: clientMemoryFillIds, factory: createClientMemoryFillHooks },
    { source: 'game/client/entity-definition.mjs', ids: clientEntityDefinitionIds, factory: createEntityDefinitionHooks },
    { source: 'game/client/entity-record.mjs', ids: clientEntityRecordIds, factory: createEntityRecordHooks },
    { source: 'game/client/leaf-functions.mjs', ids: clientLeafIds, factory: createClientLeafHooks },
    { source: 'game/client/straight-line.mjs', ids: clientStraightLineIds, factory: createStraightLineHooks },
    { source: 'game/client/composed.mjs', ids: clientComposedIds, factory: createClientComposedHooks },
    { source: 'game/client/conditionals.mjs', ids: clientConditionalIds, factory: createClientConditionalHooks },
    { source: 'game/client/wide-math.mjs', ids: clientWideMathIds, factory: createClientWideMathHooks },
    { source: 'game/client/ranges.mjs', ids: clientRangeIds, factory: createClientRangeHooks },
    { source: 'game/client/predicates.mjs', ids: clientPredicateIds, factory: createClientPredicateHooks },
    { source: 'game/client/materials.mjs', ids: clientMaterialIds, factory: createClientMaterialHooks },
    { source: 'game/client/buffers.mjs', ids: clientBufferIds, factory: createClientBufferHooks },
    { source: 'game/client/records.mjs', ids: clientRecordIds, factory: createClientRecordHooks },
    { source: 'game/client/shifts.mjs', ids: clientShiftIds, factory: createClientShiftHooks },
    { source: 'game/client/wrappers.mjs', ids: clientWrapperIds, factory: createClientWrapperHooks },
    { source: 'game/client/text-support.mjs', ids: clientTextSupportIds, factory: createClientTextSupportHooks },
    { source: 'game/client/number-format.mjs', ids: clientNumberFormatIds, factory: createClientNumberFormatHooks },
    { source: 'game/client/scan-format.mjs', ids: clientScanFormatIds, factory: createClientScanFormatHooks },
    { source: 'game/client/config-io.mjs', ids: clientConfigIoIds, factory: createClientConfigIoHooks },
    { source: 'game/client/float-array.mjs', ids: clientFloatArrayIds, factory: createClientFloatArrayHooks },
    { source: 'game/client/channel-pack.mjs', ids: clientChannelPackIds, factory: createClientChannelPackHooks },
    { source: 'game/client/bitmap-decode.mjs', ids: clientBitmapDecodeIds, factory: createClientBitmapDecodeHooks },
    { source: 'game/client/row-blit.mjs', ids: clientRowBlitIds, factory: createClientRowBlitHooks },
    { source: 'game/client/pixel-convert.mjs', ids: clientPixelConvertIds, factory: createClientPixelConvertHooks },
    { source: 'game/client/alpha-blit.mjs', ids: clientAlphaBlitIds, factory: createClientAlphaBlitHooks },
    { source: 'game/client/window-check.mjs', ids: clientWindowCheckIds, factory: createClientWindowCheckHooks },
    { source: 'game/client/channel-blit.mjs', ids: clientChannelBlitIds, factory: createClientChannelBlitHooks },
    { source: 'game/client/object-constructor.mjs', ids: clientObjectConstructorIds, factory: createClientObjectConstructorHooks },
    { source: 'game/client/affine-sampler.mjs', ids: clientAffineSamplerIds, factory: createClientAffineSamplerHooks },
    { source: 'game/client/atanf.mjs', ids: clientAtanfIds, factory: createClientAtanfHooks },
    { source: 'game/client/atan.mjs', ids: clientAtanIds, factory: createClientAtanHooks },
    { source: 'game/client/soft-compare.mjs', ids: clientSoftCompareIds, factory: createClientSoftCompareHooks },
    { source: 'game/client/blend-blit.mjs', ids: clientBlendBlitIds, factory: createClientBlendBlitHooks },
    { source: 'game/client/utf8-decode.mjs', ids: clientUtf8DecodeIds, factory: createClientUtf8DecodeHooks },
    { source: 'game/client/pixel-channel-extract.mjs', ids: clientPixelChannelExtractIds, factory: createClientPixelChannelExtractHooks },
    { source: 'game/client/pixel-write-modes.mjs', ids: clientPixelWriteModesIds, factory: createClientPixelWriteModesHooks },
    { source: 'game/client/rgb565-write-modes.mjs', ids: clientRgb565WriteModesIds, factory: createClientRgb565WriteModesHooks },
    { source: 'game/client/rgb555-write-modes.mjs', ids: clientRgb555WriteModesIds, factory: createClientRgb555WriteModesHooks },
    { source: 'game/client/rgba8888-write-modes.mjs', ids: clientRgba8888WriteModesIds, factory: createClientRgba8888WriteModesHooks },
    { source: 'game/client/particle-record.mjs', ids: clientParticleRecordIds, factory: createClientParticleRecordHooks },
    { source: 'game/client/utf8-advance.mjs', ids: clientUtf8AdvanceIds, factory: createClientUtf8AdvanceHooks },
    { source: 'game/client/mb-to-wc.mjs', ids: clientMbToWcIds, factory: createClientMbToWcHooks },
    { source: 'game/client/row-channel-blend.mjs', ids: clientRowChannelBlendIds, factory: createClientRowChannelBlendHooks },
    { source: 'game/client/scaled-channel-blit.mjs', ids: clientScaledChannelBlitIds, factory: createClientScaledChannelBlitHooks },
    { source: 'game/client/vtable-constructors.mjs', ids: clientVtableConstructorIds, factory: createClientVtableConstructorHooks },
    { source: 'game/client/global-destructors.mjs', ids: clientGlobalDestructorIds, factory: createClientGlobalDestructorHooks },
    { source: 'game/client/frexp.mjs', ids: clientFrexpIds, factory: createClientFrexpHook },
    { source: 'game/client/random-angle.mjs', ids: clientRandomAngleIds, factory: createClientRandomAngleHooks },
    { source: 'game/client/allocate-zeroed-array.mjs', ids: clientAllocateZeroedArrayIds, factory: createClientAllocateZeroedArrayHook },
  ],
};

export function recoveredFunctionPlan(moduleName) {
  const entries = groups[moduleName].flatMap(group => group.ids.map(id => ({ id, source: group.source })));
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error(`Duplicate recovered function in ${moduleName}`);
  return entries;
}
export function createRecoveredFunctions(moduleName, runtime) {
  const functions = {};
  for (const group of groups[moduleName]) {
    const hooks = group.factory(runtime);
    if (Object.keys(hooks).length !== group.ids.length) throw new Error(`Hook manifest disagrees with ${group.source}`);
    for (const id of group.ids) {
      if (typeof hooks[id] !== 'function') throw new Error(`Missing implementation for ${moduleName} function ${id}`);
      functions[id] = hooks[id];
    }
  }
  return functions;
}
