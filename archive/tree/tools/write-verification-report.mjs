#!/usr/bin/env node
/**
 * Derive the compact verification ledger from the current build, TAP log,
 * browser smoke report and source tree. No values are copied from an earlier
 * verification run, so a stale build cannot silently keep old SHA-256 hashes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const build = await readJSON('reports/build-readable.json');
const browser = await readJSON('reports/runtime/readable.json');
const leafMap = await readJSON('source/game/client/leaf-functions-map.json');
const straightMap = await readJSON('source/game/client/straight-line-map.json');
const composedMap = await readJSON('source/game/client/composed-map.json');
const conditionalMap = await readJSON('source/game/client/conditionals-map.json');
const wideMathMap = await readJSON('source/game/client/wide-math-map.json');
const rangeMap = await readJSON('source/game/client/ranges-map.json');
const predicateMap = await readJSON('source/game/client/predicates-map.json');
const materialMap = await readJSON('source/game/client/materials-map.json');
const bufferMap = await readJSON('source/game/client/buffers-map.json');
const recordMap = await readJSON('source/game/client/records-map.json');
const shiftMap = await readJSON('source/game/client/shifts-map.json');
const wrapperMap = await readJSON('source/game/client/wrappers-map.json');
const textSupportMap = await readJSON('source/game/client/text-support-map.json');
const numberFormatMap = await readJSON('source/game/client/number-format-map.json');
const scanFormatMap = await readJSON('source/game/client/scan-format-map.json');
const configIoMap = await readJSON('source/game/client/config-io-map.json');
const floatArrayMap = await readJSON('source/game/client/float-array-map.json');
const channelPackMap = await readJSON('source/game/client/channel-pack-map.json');
const bitmapDecodeMap = await readJSON('source/game/client/bitmap-decode-map.json');
const rowBlitMap = await readJSON('source/game/client/row-blit-map.json');
const pixelConvertMap = await readJSON('source/game/client/pixel-convert-map.json');
const alphaBlitMap = await readJSON('source/game/client/alpha-blit-map.json');
const windowCheckMap = await readJSON('source/game/client/window-check-map.json');
const channelBlitMap = await readJSON('source/game/client/channel-blit-map.json');
const objectConstructorMap = await readJSON('source/game/client/object-constructor-map.json');
const affineSamplerMap = await readJSON('source/game/client/affine-sampler-map.json');
const atanfMap = await readJSON('source/game/client/atanf-map.json');
const atanMap = await readJSON('source/game/client/atan-map.json');
const softCompareMap = await readJSON('source/game/client/soft-compare-map.json');
const blendBlitMap = await readJSON('source/game/client/blend-blit-map.json');
const utf8DecodeMap = await readJSON('source/game/client/utf8-decode-map.json');
const pixelChannelExtractMap = await readJSON('source/game/client/pixel-channel-extract-map.json');
const pixelWriteModesMap = await readJSON('source/game/client/pixel-write-modes-map.json');
const rgb565WriteModesMap = await readJSON('source/game/client/rgb565-write-modes-map.json');
const rgb555WriteModesMap = await readJSON('source/game/client/rgb555-write-modes-map.json');
const rgba8888WriteModesMap = await readJSON('source/game/client/rgba8888-write-modes-map.json');
const particleRecordMap = await readJSON('source/game/client/particle-record-map.json');
const utf8AdvanceMap = await readJSON('source/game/client/utf8-advance-map.json');
const mbToWcMap = await readJSON('source/game/client/mb-to-wc-map.json');
const rowChannelBlendMap = await readJSON('source/game/client/row-channel-blend-map.json');
const scaledChannelBlitMap = await readJSON('source/game/client/scaled-channel-blit-map.json');
const vtableConstructorMap = await readJSON('source/game/client/vtable-constructors-map.json');
const globalDestructorMap = await readJSON('source/game/client/global-destructors-map.json');
const stringUtilityMap = await readJSON('source/game/server/string-utilities-map.json');
const memcmpMap = await readJSON('source/game/server/memcmp-map.json');
const lifecycleHelperMap = await readJSON('source/game/server/lifecycle-helpers-map.json');
const timeoutRegistryMap = await readJSON('source/game/server/timeout-registry-map.json');
const trigKernelMap = await readJSON('source/game/server/trig-kernels-map.json');
const timeoutFireMap = await readJSON('source/game/server/timeout-fire-map.json');
const growthFactorMap = await readJSON('source/game/server/growth-factor-map.json');
const serverFrexpMap = await readJSON('source/game/server/frexp-map.json');
const wideShiftMap = await readJSON('source/game/server/wide-shift-map.json');
const clientTimeoutFireMap = await readJSON('source/game/client/timeout-fire-map.json');
const checkWebSocketsMap = await readJSON('source/game/server/check-websockets-map.json');
const pointerArrayMap = await readJSON('source/game/server/allocation-map.json');
const petalTooltipMap = await readJSON('source/game/client/petal-tooltip-map.json');
const cosineCorrectionMap = await readJSON('source/game/server/cosine-correction-map.json');
const entityDefinitionMap = await readJSON('source/game/server/entity-definitions-map.json');
const numberParseMap = await readJSON('source/game/server/number-parse-map.json');
const scanUtilitiesMap = await readJSON('source/game/server/scan-utilities-map.json');
const stringMoveMap = await readJSON('source/game/server/string-move-map.json');
const scalarHelperMap = await readJSON('source/game/server/scalar-helpers-map.json');
const sineOffsetMap = await readJSON('source/game/server/sine-offset-map.json');
const vectorHelperMap = await readJSON('source/game/server/vector-helpers-map.json');
const serverAtanMap = await readJSON('source/game/server/atan-map.json');
const bumpAllocatorMap = await readJSON('source/game/server/bump-allocator-map.json');
const wideMultiplyMap = await readJSON('source/game/server/wide-multiply-map.json');
const scalbnMap = await readJSON('source/game/server/scalbn-map.json');
const fourRecordSortMap = await readJSON('source/game/server/four-record-sort-map.json');
const containerEndMap = await readJSON('source/game/server/container-end-map.json');
const byteMoveMap = await readJSON('source/game/server/byte-move-map.json');
const recordSortMap = await readJSON('source/game/server/record-sort-map.json');
const randomStateMap = await readJSON('source/game/server/random-state-map.json');
const freeBlockMap = await readJSON('source/game/server/free-block-map.json');
const collisionFilterMap = await readJSON('source/game/server/collision-filter-map.json');
const mbrtowcMap = await readJSON('source/game/server/mbrtowc-map.json');
const packedKeySortMap = await readJSON('source/game/server/packed-key-sort-map.json');
const fiveKeySortMap = await readJSON('source/game/server/packed-key-sort-five-map.json');
const utf8ScanMap = await readJSON('source/game/server/utf8-scan-map.json');
const spawnManager192Map = await readJSON('source/game/server/spawn-manager-192-map.json');
const spawnComponentMap = await readJSON('source/game/server/spawn-components-map.json');
const floatFormatSuffixMap = await readJSON('source/game/server/float-format-suffix-map.json');
const utf16ToUtf8Map = await readJSON('source/game/server/utf16-to-utf8-map.json');
const serverUtf8DecodeMap = await readJSON('source/game/server/utf8-decode-map.json');
const unicodeCodecMap = await readJSON('source/game/server/unicode-codecs-map.json');
const entityFlagResetMap = await readJSON('source/game/server/entity-flag-reset-map.json');
const remPio2fMap = await readJSON('source/game/server/rem-pio2f-map.json');
const remPio2Map = await readJSON('source/game/server/rem-pio2-map.json');
const stringTableDestructionMap = await readJSON('source/game/server/string-table-destruction-map.json');
const remPio2LargeMap = await readJSON('source/game/server/rem-pio2-large-map.json');
const depthComparatorMap = await readJSON('source/game/server/depth-comparator-map.json');
const frexpMap = await readJSON('source/game/client/frexp-map.json');
const randomAngleMap = await readJSON('source/game/client/random-angle-map.json');
const allocateZeroedArrayMap = await readJSON('source/game/client/allocate-zeroed-array-map.json');
const tap = await fs.readFile(path.join(root, 'reports/tests.tap'), 'utf8');
const test = name => Number(tap.match(new RegExp(`^(?:#|ℹ) ${name} (\\d+)`, 'm'))?.[1] ?? 0);

const migrated = [];
for (const [name, module] of Object.entries(build.modules)) {
  migrated.push({
    name,
    recoveredFunctions: module.recoveredFunctions?.length ?? 0,
    remainingMachineFunctions: module.remainingMachineFunctions ?? 0,
    sha256: sha(await fs.readFile(path.join(build.output, `${name}.wasm`))),
  });
}

const sourceFiles = [];
for (const directory of ['game/client', 'game/server', 'runtime', 'semantic']) {
  for (const entry of await fs.readdir(path.join(root, 'source', directory))) {
    if (entry.endsWith('.mjs')) sourceFiles.push(`source/${directory}/${entry}`);
  }
}
for (const file of [
  'source/javascript/client.js',
  'source/javascript/sp_server.js',
  'source/javascript/upstream/client.js',
  'source/javascript/upstream/sp_server.js',
  'source/wasm/client.wat',
  'source/wasm/sp_server.wat',
]) sourceFiles.push(file);
sourceFiles.sort();
const sourceSha256 = {};
for (const file of sourceFiles) sourceSha256[file] = sha(await fs.readFile(path.join(root, file)));

const client = browser.highLevelExecution.client;
const server = browser.highLevelExecution.workers[0];
const callsFor = execution => execution.calls ?? {};
const clientCalls = callsFor(client);
const serverCalls = callsFor(server);
const withoutDispatch = execution => execution.installed.filter(id => !(callsFor(execution)[id] > 0));
const focusIds = [382, 865, 593, 594, 931, 403, 407, 486, 487, 929, 427, 431,
  375, 481, 511, 690, 1038, 1039, 1040, 1045, 391, 441, 618,
  418, 889, 918, 1781, 1790, 2077, 2078, 3256, 3852,
  866, 1980, 3574, 4207, 3830,
  488, 489, 847, 1136, 1784, 1786, 1793, 1795, 1800, 1801, 2083,
  434, 442, 541,
  389, 465, 526, 540, 644, 894, 1780, 1782, 1791,
  503, 708, 721, 724, 1789, 1935, 2299, 2300, 2301,
  461, 1122, 1311, 1783, 1785, 1792, 1794, 2334, 3357, 3408, 3441, 3541, 4070,
  523, 525, 914, 1796, 1797, 1799, 1938, 1941,
  440, 605, 711, 821, 891, 1135, 1940, 648, 650,
  482, 463, 582, 837, 913,
  378, 464, 545, 769, 911, 1346, 1943, 1955,
  2018, 848, 2061, 570, 524, 712, 571,
  415, 607, 1954, 733, 601, 641, 2187, 2280,
  1802, 1771, 1766, 2308, 2309, 2304, 2331, 1978, 1804,
  468, 509, 732, 1768,
  2282, 2283, 2281, 2286, 2287,
  1423, 2265, 2268, 2270, 2269, 602, 543,
  969, 971, 973, 975, 2117, 2124, 2154, 2161, 2498, 2288,
  2183, 2201, 2058,
  2109, 2130, 2147, 2168, 384,
  2113, 2133, 2150, 2188, 2204, 932, 933, 563, 811, 2192, 2197, 2209, 2214, 531, 530, 952, 954, 953, 951, 683, 1813, 651, 2185, 2203, 2200, 709, 1434, 1467, 1478, 1532, 1543, 1565, 1587, 1598, 1609, 1620, 1631, 1652, 1706, 1728, 1739, 1750, 1870, 2336, 2351, 2367, 2386, 2389, 2637, 2354, 2358, 2361, 2364, 2370, 2382, 2392, 2409, 2423, 2440, 2443, 2446, 4048, 4050, 4053, 4057, 374, 381, 413, 439, 499, 833, 845, 895, 1269, 1280, 1335, 1291, 1302, 1313, 1379, 1390, 1401, 1412, 2285, 2398, 2574, 2604, 2608, 2635, 2661, 3841, 922, 827, 828, 834, 1489, 1500, 1511, 1576, 1674, 1764, 57, 117, 653, 658, 80, 81, 659, 262, 381, 122, 3278, 660, 121, 623, 153, 103, 55, 90, 231, 234, 378, 380, 54, 86, 305, 307, 358, 377, 154, 306, 383, 155, 50, 107, 159, 109, 111, 261, 385, 203, 286, 394, 184, 139, 252, 253, 483, 420, 419, 265, 266, 178, 283, 284, 485, 486, 487, 488, 490, 285, 501, 502, 503, 504, 506, 508, 511];
const newBodyCalls = Object.fromEntries(focusIds.filter(id => client.installed.includes(id))
  .map(id => [String(id), clientCalls[id] ?? 0]));
const newBodiesWithoutBrowserExecution = focusIds.filter(id =>
  client.installed.includes(id) && !(clientCalls[id] > 0));
const clientDispatched = client.installed.filter(id => clientCalls[id] > 0).length;
const serverDispatched = server.installed.filter(id => serverCalls[id] > 0).length;
const leafInstalled = leafMap.functionIds.filter(id => client.installed.includes(id));
const leafDispatched = leafInstalled.filter(id => clientCalls[id] > 0);
const leafWithoutBrowserExecution = leafInstalled.filter(id => !(clientCalls[id] > 0));
const straightInstalled = straightMap.functionIds.filter(id => client.installed.includes(id));
const straightDispatched = straightInstalled.filter(id => clientCalls[id] > 0);
const straightWithoutBrowserExecution = straightInstalled.filter(id => !(clientCalls[id] > 0));
const composedInstalled = composedMap.functionIds.filter(id => client.installed.includes(id));
const composedDispatched = composedInstalled.filter(id => clientCalls[id] > 0);
const composedWithoutBrowserExecution = composedInstalled.filter(id => !(clientCalls[id] > 0));
const conditionalInstalled = conditionalMap.functionIds.filter(id => client.installed.includes(id));
const conditionalDispatched = conditionalInstalled.filter(id => clientCalls[id] > 0);
const conditionalWithoutBrowserExecution = conditionalInstalled.filter(id => !(clientCalls[id] > 0));
const wideMathInstalled = wideMathMap.functionIds.filter(id => client.installed.includes(id));
const wideMathDispatched = wideMathInstalled.filter(id => clientCalls[id] > 0);
const wideMathWithoutBrowserExecution = wideMathInstalled.filter(id => !(clientCalls[id] > 0));
const rangeInstalled = rangeMap.functionIds.filter(id => client.installed.includes(id));
const rangeDispatched = rangeInstalled.filter(id => clientCalls[id] > 0);
const rangeWithoutBrowserExecution = rangeInstalled.filter(id => !(clientCalls[id] > 0));
const predicateInstalled = predicateMap.functionIds.filter(id => client.installed.includes(id));
const predicateDispatched = predicateInstalled.filter(id => clientCalls[id] > 0);
const predicateWithoutBrowserExecution = predicateInstalled.filter(id => !(clientCalls[id] > 0));
const materialInstalled = materialMap.functionIds.filter(id => client.installed.includes(id));
const materialDispatched = materialInstalled.filter(id => clientCalls[id] > 0);
const materialWithoutBrowserExecution = materialInstalled.filter(id => !(clientCalls[id] > 0));
const bufferInstalled = bufferMap.functionIds.filter(id => client.installed.includes(id));
const bufferDispatched = bufferInstalled.filter(id => clientCalls[id] > 0);
const bufferWithoutBrowserExecution = bufferInstalled.filter(id => !(clientCalls[id] > 0));
const recordInstalled = recordMap.functionIds.filter(id => client.installed.includes(id));
const recordDispatched = recordInstalled.filter(id => clientCalls[id] > 0);
const recordWithoutBrowserExecution = recordInstalled.filter(id => !(clientCalls[id] > 0));
const shiftInstalled = shiftMap.functionIds.filter(id => client.installed.includes(id));
const shiftDispatched = shiftInstalled.filter(id => clientCalls[id] > 0);
const shiftWithoutBrowserExecution = shiftInstalled.filter(id => !(clientCalls[id] > 0));
const wrapperInstalled = wrapperMap.functionIds.filter(id => client.installed.includes(id));
const wrapperDispatched = wrapperInstalled.filter(id => clientCalls[id] > 0);
const wrapperWithoutBrowserExecution = wrapperInstalled.filter(id => !(clientCalls[id] > 0));
const textSupportInstalled = textSupportMap.functionIds.filter(id => client.installed.includes(id));
const textSupportDispatched = textSupportInstalled.filter(id => clientCalls[id] > 0);
const textSupportWithoutBrowserExecution = textSupportInstalled.filter(id => !(clientCalls[id] > 0));
const numberFormatInstalled = numberFormatMap.functionIds.filter(id => client.installed.includes(id));
const numberFormatDispatched = numberFormatInstalled.filter(id => clientCalls[id] > 0);
const numberFormatWithoutBrowserExecution = numberFormatInstalled.filter(id => !(clientCalls[id] > 0));
const scanFormatInstalled = scanFormatMap.functionIds.filter(id => client.installed.includes(id));
const scanFormatDispatched = scanFormatInstalled.filter(id => clientCalls[id] > 0);
const scanFormatWithoutBrowserExecution = scanFormatInstalled.filter(id => !(clientCalls[id] > 0));
const configIoInstalled = configIoMap.functionIds.filter(id => client.installed.includes(id));
const configIoDispatched = configIoInstalled.filter(id => clientCalls[id] > 0);
const configIoWithoutBrowserExecution = configIoInstalled.filter(id => !(clientCalls[id] > 0));
const floatArrayInstalled = floatArrayMap.functionIds.filter(id => client.installed.includes(id));
const floatArrayDispatched = floatArrayInstalled.filter(id => clientCalls[id] > 0);
const floatArrayWithoutBrowserExecution = floatArrayInstalled.filter(id => !(clientCalls[id] > 0));
const channelPackInstalled = channelPackMap.functionIds.filter(id => client.installed.includes(id));
const channelPackDispatched = channelPackInstalled.filter(id => clientCalls[id] > 0);
const channelPackWithoutBrowserExecution = channelPackInstalled.filter(id => !(clientCalls[id] > 0));
const bitmapDecodeInstalled = bitmapDecodeMap.functionIds.filter(id => client.installed.includes(id));
const bitmapDecodeDispatched = bitmapDecodeInstalled.filter(id => clientCalls[id] > 0);
const bitmapDecodeWithoutBrowserExecution = bitmapDecodeInstalled.filter(id => !(clientCalls[id] > 0));
const rowBlitInstalled = rowBlitMap.functionIds.filter(id => client.installed.includes(id));
const rowBlitDispatched = rowBlitInstalled.filter(id => clientCalls[id] > 0);
const rowBlitWithoutBrowserExecution = rowBlitInstalled.filter(id => !(clientCalls[id] > 0));
const pixelConvertInstalled = pixelConvertMap.functionIds.filter(id => client.installed.includes(id));
const pixelConvertDispatched = pixelConvertInstalled.filter(id => clientCalls[id] > 0);
const pixelConvertWithoutBrowserExecution = pixelConvertInstalled.filter(id => !(clientCalls[id] > 0));
const alphaBlitInstalled = alphaBlitMap.functionIds.filter(id => client.installed.includes(id));
const alphaBlitDispatched = alphaBlitInstalled.filter(id => clientCalls[id] > 0);
const alphaBlitWithoutBrowserExecution = alphaBlitInstalled.filter(id => !(clientCalls[id] > 0));
const windowCheckInstalled = windowCheckMap.functionIds.filter(id => client.installed.includes(id));
const windowCheckDispatched = windowCheckInstalled.filter(id => clientCalls[id] > 0);
const windowCheckWithoutBrowserExecution = windowCheckInstalled.filter(id => !(clientCalls[id] > 0));
const channelBlitInstalled = channelBlitMap.functionIds.filter(id => client.installed.includes(id));
const channelBlitDispatched = channelBlitInstalled.filter(id => clientCalls[id] > 0);
const channelBlitWithoutBrowserExecution = channelBlitInstalled.filter(id => !(clientCalls[id] > 0));
const objectConstructorInstalled = objectConstructorMap.functionIds.filter(id => client.installed.includes(id));
const objectConstructorDispatched = objectConstructorInstalled.filter(id => clientCalls[id] > 0);
const objectConstructorWithoutBrowserExecution = objectConstructorInstalled.filter(id => !(clientCalls[id] > 0));
const affineSamplerInstalled = affineSamplerMap.functionIds.filter(id => client.installed.includes(id));
const affineSamplerDispatched = affineSamplerInstalled.filter(id => clientCalls[id] > 0);
const affineSamplerWithoutBrowserExecution = affineSamplerInstalled.filter(id => !(clientCalls[id] > 0));
const atanfInstalled = atanfMap.functionIds.filter(id => client.installed.includes(id));
const atanfDispatched = atanfInstalled.filter(id => clientCalls[id] > 0);
const atanfWithoutBrowserExecution = atanfInstalled.filter(id => !(clientCalls[id] > 0));
const atanInstalled = atanMap.functionIds.filter(id => client.installed.includes(id));
const atanDispatched = atanInstalled.filter(id => clientCalls[id] > 0);
const atanWithoutBrowserExecution = atanInstalled.filter(id => !(clientCalls[id] > 0));
const softCompareInstalled = softCompareMap.functionIds.filter(id => client.installed.includes(id));
const softCompareDispatched = softCompareInstalled.filter(id => clientCalls[id] > 0);
const softCompareWithoutBrowserExecution = softCompareInstalled.filter(id => !(clientCalls[id] > 0));
const blendBlitInstalled = blendBlitMap.functionIds.filter(id => client.installed.includes(id));
const blendBlitDispatched = blendBlitInstalled.filter(id => clientCalls[id] > 0);
const blendBlitWithoutBrowserExecution = blendBlitInstalled.filter(id => !(clientCalls[id] > 0));
const utf8DecodeInstalled = utf8DecodeMap.functionIds.filter(id => client.installed.includes(id));
const utf8DecodeDispatched = utf8DecodeInstalled.filter(id => clientCalls[id] > 0);
const utf8DecodeWithoutBrowserExecution = utf8DecodeInstalled.filter(id => !(clientCalls[id] > 0));
const pixelChannelExtractInstalled = pixelChannelExtractMap.functionIds.filter(id => client.installed.includes(id));
const pixelChannelExtractDispatched = pixelChannelExtractInstalled.filter(id => clientCalls[id] > 0);
const pixelChannelExtractWithoutBrowserExecution = pixelChannelExtractInstalled.filter(id => !(clientCalls[id] > 0));
const pixelWriteModesInstalled = pixelWriteModesMap.functionIds.filter(id => client.installed.includes(id));
const pixelWriteModesDispatched = pixelWriteModesInstalled.filter(id => clientCalls[id] > 0);
const pixelWriteModesWithoutBrowserExecution = pixelWriteModesInstalled.filter(id => !(clientCalls[id] > 0));
const rgb565WriteModesInstalled = rgb565WriteModesMap.functionIds.filter(id => client.installed.includes(id));
const rgb565WriteModesDispatched = rgb565WriteModesInstalled.filter(id => clientCalls[id] > 0);
const rgb565WriteModesWithoutBrowserExecution = rgb565WriteModesInstalled.filter(id => !(clientCalls[id] > 0));
const rgb555WriteModesInstalled = rgb555WriteModesMap.functionIds.filter(id => client.installed.includes(id));
const rgb555WriteModesDispatched = rgb555WriteModesInstalled.filter(id => clientCalls[id] > 0);
const rgb555WriteModesWithoutBrowserExecution = rgb555WriteModesInstalled.filter(id => !(clientCalls[id] > 0));
const rgba8888WriteModesInstalled = rgba8888WriteModesMap.functionIds.filter(id => client.installed.includes(id));
const rgba8888WriteModesDispatched = rgba8888WriteModesInstalled.filter(id => clientCalls[id] > 0);
const rgba8888WriteModesWithoutBrowserExecution = rgba8888WriteModesInstalled.filter(id => !(clientCalls[id] > 0));
const particleRecordInstalled = particleRecordMap.functionIds.filter(id => client.installed.includes(id));
const particleRecordDispatched = particleRecordInstalled.filter(id => clientCalls[id] > 0);
const particleRecordWithoutBrowserExecution = particleRecordInstalled.filter(id => !(clientCalls[id] > 0));
const utf8AdvanceInstalled = utf8AdvanceMap.functionIds.filter(id => client.installed.includes(id));
const utf8AdvanceDispatched = utf8AdvanceInstalled.filter(id => clientCalls[id] > 0);
const utf8AdvanceWithoutBrowserExecution = utf8AdvanceInstalled.filter(id => !(clientCalls[id] > 0));
const mbToWcInstalled = mbToWcMap.functionIds.filter(id => client.installed.includes(id));
const mbToWcDispatched = mbToWcInstalled.filter(id => clientCalls[id] > 0);
const mbToWcWithoutBrowserExecution = mbToWcInstalled.filter(id => !(clientCalls[id] > 0));
const rowChannelBlendInstalled = rowChannelBlendMap.functionIds.filter(id => client.installed.includes(id));
const rowChannelBlendDispatched = rowChannelBlendInstalled.filter(id => clientCalls[id] > 0);
const rowChannelBlendWithoutBrowserExecution = rowChannelBlendInstalled.filter(id => !(clientCalls[id] > 0));
const scaledChannelBlitInstalled = scaledChannelBlitMap.functionIds.filter(id => client.installed.includes(id));
const scaledChannelBlitDispatched = scaledChannelBlitInstalled.filter(id => clientCalls[id] > 0);
const scaledChannelBlitWithoutBrowserExecution = scaledChannelBlitInstalled.filter(id => !(clientCalls[id] > 0));
const vtableConstructorInstalled = vtableConstructorMap.functionIds.filter(id => client.installed.includes(id));
const vtableConstructorDispatched = vtableConstructorInstalled.filter(id => clientCalls[id] > 0);
const vtableConstructorWithoutBrowserExecution = vtableConstructorInstalled.filter(id => !(clientCalls[id] > 0));
const globalDestructorInstalled = globalDestructorMap.functionIds.filter(id => client.installed.includes(id));
const globalDestructorDispatched = globalDestructorInstalled.filter(id => clientCalls[id] > 0);
const globalDestructorWithoutBrowserExecution = globalDestructorInstalled.filter(id => !(clientCalls[id] > 0));
const frexpInstalled = frexpMap.functionIds.filter(id => client.installed.includes(id));
const frexpDispatched = frexpInstalled.filter(id => clientCalls[id] > 0);
const frexpWithoutBrowserExecution = frexpInstalled.filter(id => !(clientCalls[id] > 0));
const serverUtilityCalls = server.calls;
const stringUtilityInstalled = stringUtilityMap.functionIds.filter(id => server.installed.includes(id));
const stringUtilityDispatched = stringUtilityInstalled.filter(id => serverUtilityCalls[id] > 0);
const stringUtilityWithoutBrowserExecution = stringUtilityInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const memcmpInstalled = memcmpMap.functionIds.filter(id => server.installed.includes(id));
const memcmpDispatched = memcmpInstalled.filter(id => serverUtilityCalls[id] > 0);
const memcmpWithoutBrowserExecution = memcmpInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const lifecycleHelperInstalled = lifecycleHelperMap.functionIds.filter(id => server.installed.includes(id));
const lifecycleHelperDispatched = lifecycleHelperInstalled.filter(id => serverUtilityCalls[id] > 0);
const lifecycleHelperWithoutBrowserExecution = lifecycleHelperInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const timeoutRegistryInstalled = timeoutRegistryMap.functionIds.filter(id => server.installed.includes(id));
const timeoutRegistryDispatched = timeoutRegistryInstalled.filter(id => serverUtilityCalls[id] > 0);
const timeoutRegistryWithoutBrowserExecution = timeoutRegistryInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const trigKernelInstalled = trigKernelMap.functionIds.filter(id => server.installed.includes(id));
const trigKernelDispatched = trigKernelInstalled.filter(id => serverUtilityCalls[id] > 0);
const trigKernelWithoutBrowserExecution = trigKernelInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const timeoutFireInstalled = timeoutFireMap.functionIds.filter(id => server.installed.includes(id));
const timeoutFireDispatched = timeoutFireInstalled.filter(id => serverUtilityCalls[id] > 0);
const timeoutFireWithoutBrowserExecution = timeoutFireInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const growthFactorInstalled = growthFactorMap.functionIds.filter(id => server.installed.includes(id));
const growthFactorDispatched = growthFactorInstalled.filter(id => serverUtilityCalls[id] > 0);
const growthFactorWithoutBrowserExecution = growthFactorInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const serverFrexpInstalled = serverFrexpMap.functionIds.filter(id => server.installed.includes(id));
const serverFrexpDispatched = serverFrexpInstalled.filter(id => serverUtilityCalls[id] > 0);
const serverFrexpWithoutBrowserExecution = serverFrexpInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const wideShiftInstalled = wideShiftMap.functionIds.filter(id => server.installed.includes(id));
const wideShiftDispatched = wideShiftInstalled.filter(id => serverUtilityCalls[id] > 0);
const wideShiftWithoutBrowserExecution = wideShiftInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const clientTimeoutFireInstalled = clientTimeoutFireMap.functionIds.filter(id => client.installed.includes(id));
const clientTimeoutFireDispatched = clientTimeoutFireInstalled.filter(id => clientCalls[id] > 0);
const clientTimeoutFireWithoutBrowserExecution = clientTimeoutFireInstalled.filter(id => !(clientCalls[id] > 0));
const checkWebSocketsInstalled = checkWebSocketsMap.functionIds.filter(id => server.installed.includes(id));
const checkWebSocketsDispatched = checkWebSocketsInstalled.filter(id => serverUtilityCalls[id] > 0);
const checkWebSocketsWithoutBrowserExecution = checkWebSocketsInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const pointerArrayInstalled = pointerArrayMap.functionIds.filter(id => server.installed.includes(id));
const pointerArrayDispatched = pointerArrayInstalled.filter(id => serverUtilityCalls[id] > 0);
const pointerArrayWithoutBrowserExecution = pointerArrayInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const petalTooltipInstalled = petalTooltipMap.functionIds.filter(id => client.installed.includes(id));
const petalTooltipDispatched = petalTooltipInstalled.filter(id => clientCalls[id] > 0);
const petalTooltipWithoutBrowserExecution = petalTooltipInstalled.filter(id => !(clientCalls[id] > 0));
const cosineCorrectionInstalled = cosineCorrectionMap.functionIds.filter(id => server.installed.includes(id));
const cosineCorrectionDispatched = cosineCorrectionInstalled.filter(id => serverUtilityCalls[id] > 0);
const cosineCorrectionWithoutBrowserExecution = cosineCorrectionInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const entityDefinitionInstalled = entityDefinitionMap.functionIds.filter(id => server.installed.includes(id));
const entityDefinitionDispatched = entityDefinitionInstalled.filter(id => serverUtilityCalls[id] > 0);
const entityDefinitionWithoutBrowserExecution = entityDefinitionInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const numberParseInstalled = numberParseMap.functionIds.filter(id => server.installed.includes(id));
const numberParseDispatched = numberParseInstalled.filter(id => serverUtilityCalls[id] > 0);
const numberParseWithoutBrowserExecution = numberParseInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const scanUtilitiesInstalled = scanUtilitiesMap.functionIds.filter(id => server.installed.includes(id));
const scanUtilitiesDispatched = scanUtilitiesInstalled.filter(id => serverUtilityCalls[id] > 0);
const scanUtilitiesWithoutBrowserExecution = scanUtilitiesInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const stringMoveInstalled = stringMoveMap.functionIds.filter(id => server.installed.includes(id));
const stringMoveDispatched = stringMoveInstalled.filter(id => serverUtilityCalls[id] > 0);
const stringMoveWithoutBrowserExecution = stringMoveInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const scalarHelperInstalled = scalarHelperMap.functionIds.filter(id => server.installed.includes(id));
const scalarHelperDispatched = scalarHelperInstalled.filter(id => serverUtilityCalls[id] > 0);
const scalarHelperWithoutBrowserExecution = scalarHelperInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const sineOffsetInstalled = sineOffsetMap.functionIds.filter(id => server.installed.includes(id));
const sineOffsetDispatched = sineOffsetInstalled.filter(id => serverUtilityCalls[id] > 0);
const sineOffsetWithoutBrowserExecution = sineOffsetInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const vectorHelperInstalled = vectorHelperMap.functionIds.filter(id => server.installed.includes(id));
const vectorHelperDispatched = vectorHelperInstalled.filter(id => serverUtilityCalls[id] > 0);
const vectorHelperWithoutBrowserExecution = vectorHelperInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const serverAtanInstalled = serverAtanMap.functionIds.filter(id => server.installed.includes(id));
const serverAtanDispatched = serverAtanInstalled.filter(id => serverUtilityCalls[id] > 0);
const serverAtanWithoutBrowserExecution = serverAtanInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const bumpAllocatorInstalled = bumpAllocatorMap.functionIds.filter(id => server.installed.includes(id));
const bumpAllocatorDispatched = bumpAllocatorInstalled.filter(id => serverUtilityCalls[id] > 0);
const bumpAllocatorWithoutBrowserExecution = bumpAllocatorInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const wideMultiplyInstalled = wideMultiplyMap.functionIds.filter(id => server.installed.includes(id));
const wideMultiplyDispatched = wideMultiplyInstalled.filter(id => serverUtilityCalls[id] > 0);
const wideMultiplyWithoutBrowserExecution = wideMultiplyInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const scalbnInstalled = scalbnMap.functionIds.filter(id => server.installed.includes(id));
const scalbnDispatched = scalbnInstalled.filter(id => serverUtilityCalls[id] > 0);
const scalbnWithoutBrowserExecution = scalbnInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const fourRecordSortInstalled = fourRecordSortMap.functionIds.filter(id => server.installed.includes(id));
const fourRecordSortDispatched = fourRecordSortInstalled.filter(id => serverUtilityCalls[id] > 0);
const fourRecordSortWithoutBrowserExecution = fourRecordSortInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const containerEndInstalled = containerEndMap.functionIds.filter(id => server.installed.includes(id));
const containerEndDispatched = containerEndInstalled.filter(id => serverUtilityCalls[id] > 0);
const containerEndWithoutBrowserExecution = containerEndInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const byteMoveInstalled = byteMoveMap.functionIds.filter(id => server.installed.includes(id));
const byteMoveDispatched = byteMoveInstalled.filter(id => serverUtilityCalls[id] > 0);
const byteMoveWithoutBrowserExecution = byteMoveInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const recordSortInstalled = recordSortMap.functionIds.filter(id => server.installed.includes(id));
const recordSortDispatched = recordSortInstalled.filter(id => serverUtilityCalls[id] > 0);
const recordSortWithoutBrowserExecution = recordSortInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const randomStateInstalled = randomStateMap.functionIds.filter(id => server.installed.includes(id));
const randomStateDispatched = randomStateInstalled.filter(id => serverUtilityCalls[id] > 0);
const randomStateWithoutBrowserExecution = randomStateInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const freeBlockInstalled = freeBlockMap.functionIds.filter(id => server.installed.includes(id));
const freeBlockDispatched = freeBlockInstalled.filter(id => serverUtilityCalls[id] > 0);
const freeBlockWithoutBrowserExecution = freeBlockInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const collisionFilterInstalled = collisionFilterMap.functionIds.filter(id => server.installed.includes(id));
const collisionFilterDispatched = collisionFilterInstalled.filter(id => serverUtilityCalls[id] > 0);
const collisionFilterWithoutBrowserExecution = collisionFilterInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const mbrtowcInstalled = mbrtowcMap.functionIds.filter(id => server.installed.includes(id));
const mbrtowcDispatched = mbrtowcInstalled.filter(id => serverUtilityCalls[id] > 0);
const mbrtowcWithoutBrowserExecution = mbrtowcInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const packedKeySortInstalled = packedKeySortMap.functionIds.filter(id => server.installed.includes(id));
const packedKeySortDispatched = packedKeySortInstalled.filter(id => serverUtilityCalls[id] > 0);
const packedKeySortWithoutBrowserExecution = packedKeySortInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const fiveKeySortInstalled = fiveKeySortMap.functionIds.filter(id => server.installed.includes(id));
const fiveKeySortDispatched = fiveKeySortInstalled.filter(id => serverUtilityCalls[id] > 0);
const fiveKeySortWithoutBrowserExecution = fiveKeySortInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const utf8ScanInstalled = utf8ScanMap.functionIds.filter(id => server.installed.includes(id));
const utf8ScanDispatched = utf8ScanInstalled.filter(id => serverUtilityCalls[id] > 0);
const utf8ScanWithoutBrowserExecution = utf8ScanInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const spawnManager192Installed = spawnManager192Map.functionIds.filter(id => server.installed.includes(id));
const spawnManager192Dispatched = spawnManager192Installed.filter(id => serverUtilityCalls[id] > 0);
const spawnManager192WithoutBrowserExecution = spawnManager192Installed.filter(id => !(serverUtilityCalls[id] > 0));
const spawnComponentInstalled = spawnComponentMap.functionIds.filter(id => server.installed.includes(id));
const spawnComponentDispatched = spawnComponentInstalled.filter(id => serverUtilityCalls[id] > 0);
const spawnComponentWithoutBrowserExecution = spawnComponentInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const floatFormatSuffixInstalled = floatFormatSuffixMap.functionIds.filter(id => server.installed.includes(id));
const floatFormatSuffixDispatched = floatFormatSuffixInstalled.filter(id => serverUtilityCalls[id] > 0);
const floatFormatSuffixWithoutBrowserExecution = floatFormatSuffixInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const utf16ToUtf8Installed = utf16ToUtf8Map.functionIds.filter(id => server.installed.includes(id));
const utf16ToUtf8Dispatched = utf16ToUtf8Installed.filter(id => serverUtilityCalls[id] > 0);
const utf16ToUtf8WithoutBrowserExecution = utf16ToUtf8Installed.filter(id => !(serverUtilityCalls[id] > 0));
const serverUtf8DecodeInstalled = serverUtf8DecodeMap.functionIds.filter(id => server.installed.includes(id));
const serverUtf8DecodeDispatched = serverUtf8DecodeInstalled.filter(id => serverUtilityCalls[id] > 0);
const serverUtf8DecodeWithoutBrowserExecution = serverUtf8DecodeInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const unicodeCodecInstalled = unicodeCodecMap.functionIds.filter(id => server.installed.includes(id));
const unicodeCodecDispatched = unicodeCodecInstalled.filter(id => serverUtilityCalls[id] > 0);
const unicodeCodecWithoutBrowserExecution = unicodeCodecInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const entityFlagResetInstalled = entityFlagResetMap.functionIds.filter(id => server.installed.includes(id));
const entityFlagResetDispatched = entityFlagResetInstalled.filter(id => serverUtilityCalls[id] > 0);
const entityFlagResetWithoutBrowserExecution = entityFlagResetInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const remPio2fInstalled = remPio2fMap.functionIds.filter(id => server.installed.includes(id));
const remPio2fDispatched = remPio2fInstalled.filter(id => serverUtilityCalls[id] > 0);
const remPio2fWithoutBrowserExecution = remPio2fInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const remPio2Installed = remPio2Map.functionIds.filter(id => server.installed.includes(id));
const remPio2Dispatched = remPio2Installed.filter(id => serverUtilityCalls[id] > 0);
const remPio2WithoutBrowserExecution = remPio2Installed.filter(id => !(serverUtilityCalls[id] > 0));
const stringTableDestructionInstalled = stringTableDestructionMap.functionIds.filter(id => server.installed.includes(id));
const stringTableDestructionDispatched = stringTableDestructionInstalled.filter(id => serverUtilityCalls[id] > 0);
const stringTableDestructionWithoutBrowserExecution = stringTableDestructionInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const remPio2LargeInstalled = remPio2LargeMap.functionIds.filter(id => server.installed.includes(id));
const remPio2LargeDispatched = remPio2LargeInstalled.filter(id => serverUtilityCalls[id] > 0);
const remPio2LargeWithoutBrowserExecution = remPio2LargeInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const depthComparatorInstalled = depthComparatorMap.functionIds.filter(id => server.installed.includes(id));
const depthComparatorDispatched = depthComparatorInstalled.filter(id => serverUtilityCalls[id] > 0);
const depthComparatorWithoutBrowserExecution = depthComparatorInstalled.filter(id => !(serverUtilityCalls[id] > 0));
const randomAngleInstalled = randomAngleMap.functionIds.filter(id => client.installed.includes(id));
const randomAngleDispatched = randomAngleInstalled.filter(id => clientCalls[id] > 0);
const randomAngleWithoutBrowserExecution = randomAngleInstalled.filter(id => !(clientCalls[id] > 0));
const allocateZeroedArrayInstalled = allocateZeroedArrayMap.functionIds.filter(id => client.installed.includes(id));
const allocateZeroedArrayDispatched = allocateZeroedArrayInstalled.filter(id => clientCalls[id] > 0);
const allocateZeroedArrayWithoutBrowserExecution = allocateZeroedArrayInstalled.filter(id => !(clientCalls[id] > 0));

const report = {
  verifiedAt: new Date().toISOString(),
  recoveredFunctions: migrated.reduce((sum, module) => sum + module.recoveredFunctions, 0),
  modules: Object.fromEntries(migrated.map(module => [module.name, {
    sha256: module.sha256,
    recoveredFunctions: module.recoveredFunctions,
    remainingMachineFunctions: module.remainingMachineFunctions,
  }])),
  checkedSourceFiles: sourceFiles.length,
  checkedDeployedModules: Object.keys(browser.highLevelSourceArtifacts ?? {}).length,
  tests: {
    path: 'reports/tests.tap',
    sha256: sha(await fs.readFile(path.join(root, 'reports/tests.tap'))),
    total: test('tests'),
    passed: test('pass'),
    failed: test('fail'),
  },
  browserVerification: browser.passed ? 'passed' : 'failed',
  browser: {
    path: 'reports/runtime/readable.json',
    sha256: sha(await fs.readFile(path.join(root, 'reports/runtime/readable.json'))),
    createdAt: browser.createdAt,
    checks: Object.values(browser.checks).filter(Boolean).length,
    installedClient: client.installed.length,
    installedServer: server.installed.length,
    newBodyCalls,
    newBodiesWithoutBrowserExecution,
    installedClientWithoutDispatch: withoutDispatch(client),
    leafFunctions: {
      installed: leafInstalled.length,
      dispatched: leafDispatched.length,
      withoutBrowserExecution: leafWithoutBrowserExecution,
      oracleComparisons: leafMap.validation.oracleComparisons,
      trappingComparisons: leafMap.validation.trappingComparisons,
    },
    straightLineFunctions: {
      installed: straightInstalled.length,
      dispatched: straightDispatched.length,
      withoutBrowserExecution: straightWithoutBrowserExecution,
      oracleComparisons: straightMap.validation.oracleComparisons,
      trappingComparisons: straightMap.validation.trappingComparisons,
    },
    composedFunctions: {
      installed: composedInstalled.length,
      dispatched: composedDispatched.length,
      withoutBrowserExecution: composedWithoutBrowserExecution,
      oracleComparisons: composedMap.validation.oracleComparisons,
      trappingComparisons: composedMap.validation.trappingComparisons,
    },
    conditionalFunctions: {
      installed: conditionalInstalled.length,
      dispatched: conditionalDispatched.length,
      withoutBrowserExecution: conditionalWithoutBrowserExecution,
      oracleComparisons: conditionalMap.validation.oracleComparisons,
      trappingComparisons: conditionalMap.validation.trappingComparisons,
    },
    wideMathFunctions: {
      installed: wideMathInstalled.length,
      dispatched: wideMathDispatched.length,
      withoutBrowserExecution: wideMathWithoutBrowserExecution,
      oracleComparisons: wideMathMap.validation.oracleComparisons,
      trappingComparisons: wideMathMap.validation.trappingComparisons,
    },
    rangeFunctions: {
      installed: rangeInstalled.length,
      dispatched: rangeDispatched.length,
      withoutBrowserExecution: rangeWithoutBrowserExecution,
      oracleComparisons: rangeMap.validation.oracleComparisons,
      trappingComparisons: rangeMap.validation.trappingComparisons,
    },
    predicateFunctions: {
      installed: predicateInstalled.length,
      dispatched: predicateDispatched.length,
      withoutBrowserExecution: predicateWithoutBrowserExecution,
      oracleComparisons: predicateMap.validation.oracleComparisons,
      trappingComparisons: predicateMap.validation.trappingComparisons,
    },
    materialFunctions: {
      installed: materialInstalled.length,
      dispatched: materialDispatched.length,
      withoutBrowserExecution: materialWithoutBrowserExecution,
      oracleComparisons: materialMap.validation.oracleComparisons,
      trappingComparisons: materialMap.validation.trappingComparisons,
    },
    bufferFunctions: {
      installed: bufferInstalled.length,
      dispatched: bufferDispatched.length,
      withoutBrowserExecution: bufferWithoutBrowserExecution,
      oracleComparisons: bufferMap.validation.oracleComparisons,
      trappingComparisons: bufferMap.validation.trappingComparisons,
    },
    recordFunctions: {
      installed: recordInstalled.length,
      dispatched: recordDispatched.length,
      withoutBrowserExecution: recordWithoutBrowserExecution,
      oracleComparisons: recordMap.validation.oracleComparisons,
      trappingComparisons: recordMap.validation.trappingComparisons,
    },
    shiftFunctions: {
      installed: shiftInstalled.length,
      dispatched: shiftDispatched.length,
      withoutBrowserExecution: shiftWithoutBrowserExecution,
      oracleComparisons: shiftMap.validation.oracleComparisons,
      trappingComparisons: shiftMap.validation.trappingComparisons,
    },
    wrapperFunctions: {
      installed: wrapperInstalled.length,
      dispatched: wrapperDispatched.length,
      withoutBrowserExecution: wrapperWithoutBrowserExecution,
      oracleComparisons: wrapperMap.validation.oracleComparisons,
      trappingComparisons: wrapperMap.validation.trappingComparisons,
    },
    textSupportFunctions: {
      installed: textSupportInstalled.length,
      dispatched: textSupportDispatched.length,
      withoutBrowserExecution: textSupportWithoutBrowserExecution,
      oracleComparisons: textSupportMap.validation.oracleComparisons,
      trappingComparisons: textSupportMap.validation.trappingComparisons,
    },
    numberFormatFunctions: {
      installed: numberFormatInstalled.length,
      dispatched: numberFormatDispatched.length,
      withoutBrowserExecution: numberFormatWithoutBrowserExecution,
      oracleComparisons: numberFormatMap.validation.oracleComparisons,
      trappingComparisons: numberFormatMap.validation.trappingComparisons,
    },
    scanFormatFunctions: {
      installed: scanFormatInstalled.length,
      dispatched: scanFormatDispatched.length,
      withoutBrowserExecution: scanFormatWithoutBrowserExecution,
      oracleComparisons: scanFormatMap.validation.oracleComparisons,
      trappingComparisons: scanFormatMap.validation.trappingComparisons,
    },
    configIoFunctions: {
      installed: configIoInstalled.length,
      dispatched: configIoDispatched.length,
      withoutBrowserExecution: configIoWithoutBrowserExecution,
      oracleComparisons: configIoMap.validation.oracleComparisons,
      trappingComparisons: configIoMap.validation.trappingComparisons,
    },
    floatArrayFunctions: {
      installed: floatArrayInstalled.length,
      dispatched: floatArrayDispatched.length,
      withoutBrowserExecution: floatArrayWithoutBrowserExecution,
      oracleComparisons: floatArrayMap.validation.oracleComparisons,
      trappingComparisons: floatArrayMap.validation.trappingComparisons,
    },
    channelPackFunctions: {
      installed: channelPackInstalled.length,
      dispatched: channelPackDispatched.length,
      withoutBrowserExecution: channelPackWithoutBrowserExecution,
      oracleComparisons: channelPackMap.validation.oracleComparisons,
      trappingComparisons: channelPackMap.validation.trappingComparisons,
    },
    bitmapDecodeFunctions: {
      installed: bitmapDecodeInstalled.length,
      dispatched: bitmapDecodeDispatched.length,
      withoutBrowserExecution: bitmapDecodeWithoutBrowserExecution,
      oracleComparisons: bitmapDecodeMap.validation.oracleComparisons,
      trappingComparisons: bitmapDecodeMap.validation.trappingComparisons,
    },
    rowBlitFunctions: {
      installed: rowBlitInstalled.length,
      dispatched: rowBlitDispatched.length,
      withoutBrowserExecution: rowBlitWithoutBrowserExecution,
      oracleComparisons: rowBlitMap.validation.oracleComparisons,
      trappingComparisons: rowBlitMap.validation.trappingComparisons,
    },
    pixelConvertFunctions: {
      installed: pixelConvertInstalled.length,
      dispatched: pixelConvertDispatched.length,
      withoutBrowserExecution: pixelConvertWithoutBrowserExecution,
      oracleComparisons: pixelConvertMap.validation.oracleComparisons,
      trappingComparisons: pixelConvertMap.validation.trappingComparisons,
    },
    alphaBlitFunctions: {
      installed: alphaBlitInstalled.length,
      dispatched: alphaBlitDispatched.length,
      withoutBrowserExecution: alphaBlitWithoutBrowserExecution,
      oracleComparisons: alphaBlitMap.validation.oracleComparisons,
      trappingComparisons: alphaBlitMap.validation.trappingComparisons,
    },
    windowCheckFunctions: {
      installed: windowCheckInstalled.length,
      dispatched: windowCheckDispatched.length,
      withoutBrowserExecution: windowCheckWithoutBrowserExecution,
      oracleComparisons: windowCheckMap.validation.oracleComparisons,
      trappingComparisons: windowCheckMap.validation.trappingComparisons,
    },
    channelBlitFunctions: {
      installed: channelBlitInstalled.length,
      dispatched: channelBlitDispatched.length,
      withoutBrowserExecution: channelBlitWithoutBrowserExecution,
      oracleComparisons: channelBlitMap.validation.oracleComparisons,
      trappingComparisons: channelBlitMap.validation.trappingComparisons,
    },
    objectConstructorFunctions: {
      installed: objectConstructorInstalled.length,
      dispatched: objectConstructorDispatched.length,
      withoutBrowserExecution: objectConstructorWithoutBrowserExecution,
      oracleComparisons: objectConstructorMap.validation.oracleComparisons,
      trappingComparisons: objectConstructorMap.validation.trappingComparisons,
    },
    affineSamplerFunctions: {
      installed: affineSamplerInstalled.length,
      dispatched: affineSamplerDispatched.length,
      withoutBrowserExecution: affineSamplerWithoutBrowserExecution,
      oracleComparisons: affineSamplerMap.validation.oracleComparisons,
      trappingComparisons: affineSamplerMap.validation.trappingComparisons,
    },
    atanfFunctions: {
      installed: atanfInstalled.length,
      dispatched: atanfDispatched.length,
      withoutBrowserExecution: atanfWithoutBrowserExecution,
      oracleComparisons: atanfMap.validation.oracleComparisons,
      trappingComparisons: atanfMap.validation.trappingComparisons,
    },








    softCompareFunctions: {
      installed: softCompareInstalled.length,
      dispatched: softCompareDispatched.length,
      withoutBrowserExecution: softCompareWithoutBrowserExecution,
      oracleComparisons: softCompareMap.validation.oracleComparisons,
      trappingComparisons: softCompareMap.validation.trappingComparisons,
    },
    blendBlitFunctions: {
      installed: blendBlitInstalled.length,
      dispatched: blendBlitDispatched.length,
      withoutBrowserExecution: blendBlitWithoutBrowserExecution,
      oracleComparisons: blendBlitMap.validation.oracleComparisons,
      trappingComparisons: blendBlitMap.validation.trappingComparisons,
    },
    utf8DecodeFunctions: {
      installed: utf8DecodeInstalled.length,
      dispatched: utf8DecodeDispatched.length,
      withoutBrowserExecution: utf8DecodeWithoutBrowserExecution,
      oracleComparisons: utf8DecodeMap.validation.oracleComparisons,
      trappingComparisons: utf8DecodeMap.validation.trappingComparisons,
    },
    pixelChannelExtractFunctions: {
      installed: pixelChannelExtractInstalled.length,
      dispatched: pixelChannelExtractDispatched.length,
      withoutBrowserExecution: pixelChannelExtractWithoutBrowserExecution,
      oracleComparisons: pixelChannelExtractMap.validation.oracleComparisons,
      trappingComparisons: pixelChannelExtractMap.validation.trappingComparisons,
    },
    pixelWriteModesFunctions: {
      installed: pixelWriteModesInstalled.length,
      dispatched: pixelWriteModesDispatched.length,
      withoutBrowserExecution: pixelWriteModesWithoutBrowserExecution,
      oracleComparisons: pixelWriteModesMap.validation.oracleComparisons,
      trappingComparisons: pixelWriteModesMap.validation.trappingComparisons,
    },
    rgb565WriteModesFunctions: {
      installed: rgb565WriteModesInstalled.length,
      dispatched: rgb565WriteModesDispatched.length,
      withoutBrowserExecution: rgb565WriteModesWithoutBrowserExecution,
      oracleComparisons: rgb565WriteModesMap.validation.oracleComparisons,
      trappingComparisons: rgb565WriteModesMap.validation.trappingComparisons,
    },
    rgb555WriteModesFunctions: {
      installed: rgb555WriteModesInstalled.length,
      dispatched: rgb555WriteModesDispatched.length,
      withoutBrowserExecution: rgb555WriteModesWithoutBrowserExecution,
      oracleComparisons: rgb555WriteModesMap.validation.oracleComparisons,
      trappingComparisons: rgb555WriteModesMap.validation.trappingComparisons,
    },
    rgba8888WriteModesFunctions: {
      installed: rgba8888WriteModesInstalled.length,
      dispatched: rgba8888WriteModesDispatched.length,
      withoutBrowserExecution: rgba8888WriteModesWithoutBrowserExecution,
      oracleComparisons: rgba8888WriteModesMap.validation.oracleComparisons,
      trappingComparisons: rgba8888WriteModesMap.validation.trappingComparisons,
    },
    particleRecordFunctions: {
      installed: particleRecordInstalled.length,
      dispatched: particleRecordDispatched.length,
      withoutBrowserExecution: particleRecordWithoutBrowserExecution,
      oracleComparisons: particleRecordMap.validation.oracleComparisons,
      trappingComparisons: particleRecordMap.validation.trappingComparisons,
    },
    utf8AdvanceFunctions: {
      installed: utf8AdvanceInstalled.length,
      dispatched: utf8AdvanceDispatched.length,
      withoutBrowserExecution: utf8AdvanceWithoutBrowserExecution,
      oracleComparisons: utf8AdvanceMap.validation.oracleComparisons,
      trappingComparisons: utf8AdvanceMap.validation.trappingComparisons,
    },
    mbToWcFunctions: {
      installed: mbToWcInstalled.length,
      dispatched: mbToWcDispatched.length,
      withoutBrowserExecution: mbToWcWithoutBrowserExecution,
      oracleComparisons: mbToWcMap.validation.oracleComparisons,
      trappingComparisons: mbToWcMap.validation.trappingComparisons,
    },
    rowChannelBlendFunctions: {
      installed: rowChannelBlendInstalled.length,
      dispatched: rowChannelBlendDispatched.length,
      withoutBrowserExecution: rowChannelBlendWithoutBrowserExecution,
      oracleComparisons: rowChannelBlendMap.validation.oracleComparisons,
      trappingComparisons: rowChannelBlendMap.validation.trappingComparisons,
    },
    scaledChannelBlitFunctions: {
      installed: scaledChannelBlitInstalled.length,
      dispatched: scaledChannelBlitDispatched.length,
      withoutBrowserExecution: scaledChannelBlitWithoutBrowserExecution,
      oracleComparisons: scaledChannelBlitMap.validation.oracleComparisons,
      trappingComparisons: scaledChannelBlitMap.validation.trappingComparisons,
    },
    vtableConstructorFunctions: {
      installed: vtableConstructorInstalled.length,
      dispatched: vtableConstructorDispatched.length,
      withoutBrowserExecution: vtableConstructorWithoutBrowserExecution,
      oracleComparisons: vtableConstructorMap.validation.oracleComparisons,
      trappingComparisons: vtableConstructorMap.validation.trappingComparisons,
    },
    globalDestructorFunctions: {
      installed: globalDestructorInstalled.length,
      dispatched: globalDestructorDispatched.length,
      withoutBrowserExecution: globalDestructorWithoutBrowserExecution,
      oracleComparisons: globalDestructorMap.validation.oracleComparisons,
      trappingComparisons: globalDestructorMap.validation.trappingComparisons,
    },
    floatFormatSuffixFunctions: {
      installed: floatFormatSuffixInstalled.length,
      dispatched: floatFormatSuffixDispatched.length,
      withoutBrowserExecution: floatFormatSuffixWithoutBrowserExecution,
      oracleComparisons: floatFormatSuffixMap.validation.oracleComparisons,
      trappingComparisons: floatFormatSuffixMap.validation.trappingComparisons,
    },
    remPio2LargeFunctions: {
      installed: remPio2LargeInstalled.length,
      dispatched: remPio2LargeDispatched.length,
      withoutBrowserExecution: remPio2LargeWithoutBrowserExecution,
      oracleComparisons: remPio2LargeMap.validation.oracleComparisons,
      trappingComparisons: remPio2LargeMap.validation.trappingComparisons,
    },
    stringTableDestructionFunctions: {
      installed: stringTableDestructionInstalled.length,
      dispatched: stringTableDestructionDispatched.length,
      withoutBrowserExecution: stringTableDestructionWithoutBrowserExecution,
      oracleComparisons: stringTableDestructionMap.validation.oracleComparisons,
      trappingComparisons: stringTableDestructionMap.validation.trappingComparisons,
    },
    remPio2Functions: {
      installed: remPio2Installed.length,
      dispatched: remPio2Dispatched.length,
      withoutBrowserExecution: remPio2WithoutBrowserExecution,
      oracleComparisons: remPio2Map.validation.oracleComparisons,
      trappingComparisons: remPio2Map.validation.trappingComparisons,
    },
    remPio2fFunctions: {
      installed: remPio2fInstalled.length,
      dispatched: remPio2fDispatched.length,
      withoutBrowserExecution: remPio2fWithoutBrowserExecution,
      oracleComparisons: remPio2fMap.validation.oracleComparisons,
      trappingComparisons: remPio2fMap.validation.trappingComparisons,
    },
    entityFlagResetFunctions: {
      installed: entityFlagResetInstalled.length,
      dispatched: entityFlagResetDispatched.length,
      withoutBrowserExecution: entityFlagResetWithoutBrowserExecution,
      oracleComparisons: entityFlagResetMap.validation.oracleComparisons,
      trappingComparisons: entityFlagResetMap.validation.trappingComparisons,
    },
    unicodeCodecFunctions: {
      installed: unicodeCodecInstalled.length,
      dispatched: unicodeCodecDispatched.length,
      withoutBrowserExecution: unicodeCodecWithoutBrowserExecution,
      oracleComparisons: unicodeCodecMap.validation.oracleComparisons,
      trappingComparisons: unicodeCodecMap.validation.trappingComparisons,
    },
    utf8CodePointFunctions: {
      installed: serverUtf8DecodeInstalled.length,
      dispatched: serverUtf8DecodeDispatched.length,
      withoutBrowserExecution: serverUtf8DecodeWithoutBrowserExecution,
      oracleComparisons: serverUtf8DecodeMap.validation.oracleComparisons,
      trappingComparisons: serverUtf8DecodeMap.validation.trappingComparisons,
    },
    utf16ToUtf8Functions: {
      installed: utf16ToUtf8Installed.length,
      dispatched: utf16ToUtf8Dispatched.length,
      withoutBrowserExecution: utf16ToUtf8WithoutBrowserExecution,
      oracleComparisons: utf16ToUtf8Map.validation.oracleComparisons,
      trappingComparisons: utf16ToUtf8Map.validation.trappingComparisons,
    },
    spawnComponentFunctions: {
      installed: spawnComponentInstalled.length,
      dispatched: spawnComponentDispatched.length,
      withoutBrowserExecution: spawnComponentWithoutBrowserExecution,
      oracleComparisons: spawnComponentMap.validation.oracleComparisons,
      trappingComparisons: spawnComponentMap.validation.trappingComparisons,
    },
    utf8ScanFunctions: {
      installed: utf8ScanInstalled.length,
      dispatched: utf8ScanDispatched.length,
      withoutBrowserExecution: utf8ScanWithoutBrowserExecution,
      oracleComparisons: utf8ScanMap.validation.oracleComparisons,
      trappingComparisons: utf8ScanMap.validation.trappingComparisons,
    },
    spawnManager192Functions: {
      installed: spawnManager192Installed.length,
      dispatched: spawnManager192Dispatched.length,
      withoutBrowserExecution: spawnManager192WithoutBrowserExecution,
      oracleComparisons: spawnManager192Map.validation.oracleComparisons,
      trappingComparisons: spawnManager192Map.validation.trappingComparisons,
    },
    fiveKeySortFunctions: {
      installed: fiveKeySortInstalled.length,
      dispatched: fiveKeySortDispatched.length,
      withoutBrowserExecution: fiveKeySortWithoutBrowserExecution,
      oracleComparisons: fiveKeySortMap.validation.oracleComparisons,
      trappingComparisons: fiveKeySortMap.validation.trappingComparisons,
    },
    packedKeySortFunctions: {
      installed: packedKeySortInstalled.length,
      dispatched: packedKeySortDispatched.length,
      withoutBrowserExecution: packedKeySortWithoutBrowserExecution,
      oracleComparisons: packedKeySortMap.validation.oracleComparisons,
      trappingComparisons: packedKeySortMap.validation.trappingComparisons,
    },
    depthComparatorFunctions: {
      installed: depthComparatorInstalled.length,
      dispatched: depthComparatorDispatched.length,
      withoutBrowserExecution: depthComparatorWithoutBrowserExecution,
      oracleComparisons: depthComparatorMap.validation.oracleComparisons,
      trappingComparisons: depthComparatorMap.validation.trappingComparisons,
    },
    freeBlockFunctions: {
      installed: freeBlockInstalled.length,
      dispatched: freeBlockDispatched.length,
      withoutBrowserExecution: freeBlockWithoutBrowserExecution,
      oracleComparisons: freeBlockMap.validation.oracleComparisons,
      trappingComparisons: freeBlockMap.validation.trappingComparisons,
    },
    collisionFilterFunctions: {
      installed: collisionFilterInstalled.length,
      dispatched: collisionFilterDispatched.length,
      withoutBrowserExecution: collisionFilterWithoutBrowserExecution,
      oracleComparisons: collisionFilterMap.validation.oracleComparisons,
      trappingComparisons: collisionFilterMap.validation.trappingComparisons,
    },
    mbrtowcFunctions: {
      installed: mbrtowcInstalled.length,
      dispatched: mbrtowcDispatched.length,
      withoutBrowserExecution: mbrtowcWithoutBrowserExecution,
      oracleComparisons: mbrtowcMap.validation.oracleComparisons,
      trappingComparisons: mbrtowcMap.validation.trappingComparisons,
    },
    randomStateFunctions: {
      installed: randomStateInstalled.length,
      dispatched: randomStateDispatched.length,
      withoutBrowserExecution: randomStateWithoutBrowserExecution,
      oracleComparisons: randomStateMap.validation.oracleComparisons,
      trappingComparisons: randomStateMap.validation.trappingComparisons,
    },
    recordSortFunctions: {
      installed: recordSortInstalled.length,
      dispatched: recordSortDispatched.length,
      withoutBrowserExecution: recordSortWithoutBrowserExecution,
      oracleComparisons: recordSortMap.validation.oracleComparisons,
      trappingComparisons: recordSortMap.validation.trappingComparisons,
    },
    containerEndFunctions: {
      installed: containerEndInstalled.length,
      dispatched: containerEndDispatched.length,
      withoutBrowserExecution: containerEndWithoutBrowserExecution,
      oracleComparisons: containerEndMap.validation.oracleComparisons,
      trappingComparisons: containerEndMap.validation.trappingComparisons,
    },
    byteMoveFunctions: {
      installed: byteMoveInstalled.length,
      dispatched: byteMoveDispatched.length,
      withoutBrowserExecution: byteMoveWithoutBrowserExecution,
      oracleComparisons: byteMoveMap.validation.oracleComparisons,
      trappingComparisons: byteMoveMap.validation.trappingComparisons,
    },
    fourRecordSortFunctions: {
      installed: fourRecordSortInstalled.length,
      dispatched: fourRecordSortDispatched.length,
      withoutBrowserExecution: fourRecordSortWithoutBrowserExecution,
      oracleComparisons: fourRecordSortMap.validation.oracleComparisons,
      trappingComparisons: fourRecordSortMap.validation.trappingComparisons,
    },
    scalbnFunctions: {
      installed: scalbnInstalled.length,
      dispatched: scalbnDispatched.length,
      withoutBrowserExecution: scalbnWithoutBrowserExecution,
      oracleComparisons: scalbnMap.validation.oracleComparisons,
      trappingComparisons: scalbnMap.validation.trappingComparisons,
    },
    bumpAllocatorFunctions: {
      installed: bumpAllocatorInstalled.length,
      dispatched: bumpAllocatorDispatched.length,
      withoutBrowserExecution: bumpAllocatorWithoutBrowserExecution,
      oracleComparisons: bumpAllocatorMap.validation.oracleComparisons,
      trappingComparisons: bumpAllocatorMap.validation.trappingComparisons,
    },
    wideMultiplyFunctions: {
      installed: wideMultiplyInstalled.length,
      dispatched: wideMultiplyDispatched.length,
      withoutBrowserExecution: wideMultiplyWithoutBrowserExecution,
      oracleComparisons: wideMultiplyMap.validation.oracleComparisons,
      trappingComparisons: wideMultiplyMap.validation.trappingComparisons,
    },
    serverAtanFunctions: {
      installed: serverAtanInstalled.length,
      dispatched: serverAtanDispatched.length,
      withoutBrowserExecution: serverAtanWithoutBrowserExecution,
      oracleComparisons: serverAtanMap.validation.oracleComparisons,
      trappingComparisons: serverAtanMap.validation.trappingComparisons,
    },
    sineOffsetFunctions: {
      installed: sineOffsetInstalled.length,
      dispatched: sineOffsetDispatched.length,
      withoutBrowserExecution: sineOffsetWithoutBrowserExecution,
      oracleComparisons: sineOffsetMap.validation.oracleComparisons,
      trappingComparisons: sineOffsetMap.validation.trappingComparisons,
    },
    vectorHelperFunctions: {
      installed: vectorHelperInstalled.length,
      dispatched: vectorHelperDispatched.length,
      withoutBrowserExecution: vectorHelperWithoutBrowserExecution,
      oracleComparisons: vectorHelperMap.validation.oracleComparisons,
      trappingComparisons: vectorHelperMap.validation.trappingComparisons,
    },
    scalarHelperFunctions: {
      installed: scalarHelperInstalled.length,
      dispatched: scalarHelperDispatched.length,
      withoutBrowserExecution: scalarHelperWithoutBrowserExecution,
      oracleComparisons: scalarHelperMap.validation.oracleComparisons,
      trappingComparisons: scalarHelperMap.validation.trappingComparisons,
    },
    stringMoveFunctions: {
      installed: stringMoveInstalled.length,
      dispatched: stringMoveDispatched.length,
      withoutBrowserExecution: stringMoveWithoutBrowserExecution,
      oracleComparisons: stringMoveMap.validation.oracleComparisons,
      trappingComparisons: stringMoveMap.validation.trappingComparisons,
    },
    scanUtilitiesFunctions: {
      installed: scanUtilitiesInstalled.length,
      dispatched: scanUtilitiesDispatched.length,
      withoutBrowserExecution: scanUtilitiesWithoutBrowserExecution,
      oracleComparisons: scanUtilitiesMap.validation.oracleComparisons,
      trappingComparisons: scanUtilitiesMap.validation.trappingComparisons,
    },
    numberParseFunctions: {
      installed: numberParseInstalled.length,
      dispatched: numberParseDispatched.length,
      withoutBrowserExecution: numberParseWithoutBrowserExecution,
      oracleComparisons: numberParseMap.validation.oracleComparisons,
      trappingComparisons: numberParseMap.validation.trappingComparisons,
    },
    entityDefinitionFunctions: {
      installed: entityDefinitionInstalled.length,
      dispatched: entityDefinitionDispatched.length,
      withoutBrowserExecution: entityDefinitionWithoutBrowserExecution,
      oracleComparisons: entityDefinitionMap.validation.oracleComparisons,
      trappingComparisons: entityDefinitionMap.validation.trappingComparisons,
    },
    cosineCorrectionFunctions: {
      installed: cosineCorrectionInstalled.length,
      dispatched: cosineCorrectionDispatched.length,
      withoutBrowserExecution: cosineCorrectionWithoutBrowserExecution,
      oracleComparisons: cosineCorrectionMap.validation.oracleComparisons,
      trappingComparisons: cosineCorrectionMap.validation.trappingComparisons,
    },
    petalTooltipFunctions: {
      installed: petalTooltipInstalled.length,
      dispatched: petalTooltipDispatched.length,
      withoutBrowserExecution: petalTooltipWithoutBrowserExecution,
      oracleComparisons: petalTooltipMap.validation.oracleComparisons,
      trappingComparisons: petalTooltipMap.validation.trappingComparisons,
    },
    pointerArrayFunctions: {
      installed: pointerArrayInstalled.length,
      dispatched: pointerArrayDispatched.length,
      withoutBrowserExecution: pointerArrayWithoutBrowserExecution,
      oracleComparisons: pointerArrayMap.validation.oracleComparisons,
      trappingComparisons: pointerArrayMap.validation.trappingComparisons,
    },
    clientTimeoutFireFunctions: {
      installed: clientTimeoutFireInstalled.length,
      dispatched: clientTimeoutFireDispatched.length,
      withoutBrowserExecution: clientTimeoutFireWithoutBrowserExecution,
      oracleComparisons: clientTimeoutFireMap.validation.oracleComparisons,
      trappingComparisons: clientTimeoutFireMap.validation.trappingComparisons,
    },
    checkWebSocketsFunctions: {
      installed: checkWebSocketsInstalled.length,
      dispatched: checkWebSocketsDispatched.length,
      withoutBrowserExecution: checkWebSocketsWithoutBrowserExecution,
      oracleComparisons: checkWebSocketsMap.validation.oracleComparisons,
      trappingComparisons: checkWebSocketsMap.validation.trappingComparisons,
    },
    wideShiftFunctions: {
      installed: wideShiftInstalled.length,
      dispatched: wideShiftDispatched.length,
      withoutBrowserExecution: wideShiftWithoutBrowserExecution,
      oracleComparisons: wideShiftMap.validation.oracleComparisons,
      trappingComparisons: wideShiftMap.validation.trappingComparisons,
    },
    serverFrexpFunctions: {
      installed: serverFrexpInstalled.length,
      dispatched: serverFrexpDispatched.length,
      withoutBrowserExecution: serverFrexpWithoutBrowserExecution,
      oracleComparisons: serverFrexpMap.validation.oracleComparisons,
      trappingComparisons: serverFrexpMap.validation.trappingComparisons,
    },
    growthFactorFunctions: {
      installed: growthFactorInstalled.length,
      dispatched: growthFactorDispatched.length,
      withoutBrowserExecution: growthFactorWithoutBrowserExecution,
      oracleComparisons: growthFactorMap.validation.oracleComparisons,
      trappingComparisons: growthFactorMap.validation.trappingComparisons,
    },
    timeoutFireFunctions: {
      installed: timeoutFireInstalled.length,
      dispatched: timeoutFireDispatched.length,
      withoutBrowserExecution: timeoutFireWithoutBrowserExecution,
      oracleComparisons: timeoutFireMap.validation.oracleComparisons,
      trappingComparisons: timeoutFireMap.validation.trappingComparisons,
    },
    trigKernelFunctions: {
      installed: trigKernelInstalled.length,
      dispatched: trigKernelDispatched.length,
      withoutBrowserExecution: trigKernelWithoutBrowserExecution,
      oracleComparisons: trigKernelMap.validation.oracleComparisons,
      trappingComparisons: trigKernelMap.validation.trappingComparisons,
    },
    timeoutRegistryFunctions: {
      installed: timeoutRegistryInstalled.length,
      dispatched: timeoutRegistryDispatched.length,
      withoutBrowserExecution: timeoutRegistryWithoutBrowserExecution,
      oracleComparisons: timeoutRegistryMap.validation.oracleComparisons,
      trappingComparisons: timeoutRegistryMap.validation.trappingComparisons,
    },
    lifecycleHelperFunctions: {
      installed: lifecycleHelperInstalled.length,
      dispatched: lifecycleHelperDispatched.length,
      withoutBrowserExecution: lifecycleHelperWithoutBrowserExecution,
      oracleComparisons: lifecycleHelperMap.validation.oracleComparisons,
      trappingComparisons: lifecycleHelperMap.validation.trappingComparisons,
    },
    memcmpFunctions: {
      installed: memcmpInstalled.length,
      dispatched: memcmpDispatched.length,
      withoutBrowserExecution: memcmpWithoutBrowserExecution,
      oracleComparisons: memcmpMap.validation.oracleComparisons,
      trappingComparisons: memcmpMap.validation.trappingComparisons,
    },
    stringUtilityFunctions: {
      installed: stringUtilityInstalled.length,
      dispatched: stringUtilityDispatched.length,
      withoutBrowserExecution: stringUtilityWithoutBrowserExecution,
      oracleComparisons: stringUtilityMap.validation.oracleComparisons,
      trappingComparisons: stringUtilityMap.validation.trappingComparisons,
    },
    allocateZeroedArrayFunctions: {
      installed: allocateZeroedArrayInstalled.length,
      dispatched: allocateZeroedArrayDispatched.length,
      withoutBrowserExecution: allocateZeroedArrayWithoutBrowserExecution,
      oracleComparisons: allocateZeroedArrayMap.validation.oracleComparisons,
      trappingComparisons: allocateZeroedArrayMap.validation.trappingComparisons,
    },
    frexpFunctions: {
      installed: frexpInstalled.length,
      dispatched: frexpDispatched.length,
      withoutBrowserExecution: frexpWithoutBrowserExecution,
      oracleComparisons: frexpMap.validation.oracleComparisons,
      trappingComparisons: frexpMap.validation.trappingComparisons,
    },
    randomAngleFunctions: {
      installed: randomAngleInstalled.length,
      dispatched: randomAngleDispatched.length,
      withoutBrowserExecution: randomAngleWithoutBrowserExecution,
      oracleComparisons: randomAngleMap.validation.oracleComparisons,
      trappingComparisons: randomAngleMap.validation.trappingComparisons,
    },
    executedInstalledBodies: { client: clientDispatched, sp_server: serverDispatched },
    limitation: `The finite startup/input scenario reached ${clientDispatched} of ${client.installed.length} installed client bodies and ${serverDispatched} of ${server.installed.length} installed server bodies through their exported entries. Functions reached only through another recovered body retain a zero wrapper counter, so nested execution is not inferred from it. Functions in newBodiesWithoutBrowserExecution have dedicated original-WASM differential coverage but were not reached by this browser scenario. The 74 leaf functions have 296 original-WASM comparisons; seven of them were reached here, and the remaining ${leafWithoutBrowserExecution.length} are named in leafFunctions.withoutBrowserExecution. Of the nine straight-line functions, ${straightDispatched.length} was reached and ${straightWithoutBrowserExecution.length} were not; both lists are recorded in straightLineFunctions. None of the five composed functions was reached by this scenario; composedFunctions records their dedicated oracle coverage. Two of the thirteen conditional functions (420 and 592) were reached; conditionalFunctions records all of them. None of the three 128-bit arithmetic functions was reached; wideMathFunctions records their dedicated shift and multiply coverage. One of the ten range functions (920) was reached 2,455 times; rangeFunctions records all ten. One of the ten predicate functions (2313) was reached once; predicateFunctions records all ten. None of the thirteen material/map/hash functions was reached; materialFunctions records their dedicated coverage. One of the nine buffer functions (365) was reached 581 times; bufferFunctions records all nine. None of the seven record/PRNG functions was reached; recordFunctions records their dedicated coverage. Neither 648 nor 650 was reached; shiftFunctions records their dedicated coverage. None of the five dependency wrappers was reached; wrapperFunctions records their dedicated coverage. None of the eight text-support functions was reached; textSupportFunctions records their dedicated coverage. None of the seven number-format functions was reached; numberFormatFunctions records their dedicated coverage. None of the eight scan-format functions was reached; scanFormatFunctions records their dedicated coverage. None of the nine config-io functions was reached; configIoFunctions records their dedicated coverage. None of the four float-array functions was reached; floatArrayFunctions records their dedicated coverage. None of the five channel-pack functions was reached; channelPackFunctions records their dedicated coverage. None of the four bitmap-decode functions was reached; bitmapDecodeFunctions records their dedicated coverage. No pixel-identical rendering claim is made.`,
  },
  sourceSha256,
};
await fs.writeFile(path.join(root, 'reports/current-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Verification ledger: ${report.recoveredFunctions} recovered; ${report.tests.passed}/${report.tests.total} tests; ${clientDispatched}/${client.installed.length} client and ${serverDispatched}/${server.installed.length} server bodies dispatched.`);
