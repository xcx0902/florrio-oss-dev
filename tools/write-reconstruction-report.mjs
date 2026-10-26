#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const wasm = await json('reports/wasm/manifest.json');
const js = await json('reports/javascript-symbols.json');
const evidence = await json('reports/evidence/summary.json');
const browser = await json('reports/runtime/readable.json').catch(() => json('reports/runtime/rebuilt.json'));
const build = await json('reports/build-readable.json').catch(() => json('reports/build.json'));
const replay = await json('reports/server-replay.json');
const testLog = await fs.readFile(path.join(root, 'reports/tests.tap'), 'utf8');
const testTotal = testLog.match(/^(?:#|ℹ) tests (\d+)/m)?.[1] ?? '未知';
const testPassed = testLog.match(/^(?:#|ℹ) pass (\d+)/m)?.[1] ?? '未知';
const testFailed = testLog.match(/^(?:#|ℹ) fail (\d+)/m)?.[1] ?? '未知';
const migratedCount = Object.values(build.modules).reduce((sum, module) => sum + (module.recoveredFunctions?.length ?? 0), 0);
const migratedRows = Object.entries(build.modules).map(([name, module]) => `| ${name} | ${module.recoveredFunctions?.length ?? 0} | ${module.remainingMachineFunctions ?? wasm.modules[name].functions} |`);
const rows = [];
for (const [name, module] of Object.entries(wasm.modules)) {
  const functions = await json(`reports/wasm/${name}-functions.json`);
  const internal = functions.filter(f => !f.module);
  rows.push(`| ${name} | ${module.functions} | ${module.imports} | ${internal.filter(f => f.naming.confidence !== 'unknown-semantics').length} | ${internal.filter(f => f.naming.confidence === 'unknown-semantics').length} | ${module.dataSegments} |`);
}
const jsRows = Object.entries(js.files).map(([name, file]) => `| ${name} | ${file.summary.bindings} | ${file.summary.semanticBindings} | ${file.summary.roleOnlyBindings} | ${file.summary.privateProperties} |`);
const hashRows = Object.entries(wasm.modules).map(([name, module]) => `| ${name}.wasm | \`${module.inputSha256}\` | ${module.byteIdentical ? '逐字节一致' : '不一致'} |`);
const passedChecks = Object.values(browser.checks).filter(Boolean).length;
const lastBrowserFunctionCount = (browser.highLevelExecution?.client?.installed?.length ?? 0)
  + (browser.highLevelExecution?.workers?.[0]?.installed?.length ?? 0);
const clientCalls = browser.highLevelExecution?.client?.calls ?? {};
const leafMap = await json('source/game/client/leaf-functions-map.json');
const leafDispatched = leafMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const straightMap = await json('source/game/client/straight-line-map.json');
const straightDispatched = straightMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const composedMap = await json('source/game/client/composed-map.json');
const composedDispatched = composedMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const conditionalMap = await json('source/game/client/conditionals-map.json');
const conditionalDispatched = conditionalMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const wideMathMap = await json('source/game/client/wide-math-map.json');
const wideMathDispatched = wideMathMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const rangeMap = await json('source/game/client/ranges-map.json');
const rangeDispatched = rangeMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const predicateMap = await json('source/game/client/predicates-map.json');
const predicateDispatched = predicateMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const materialMap = await json('source/game/client/materials-map.json');
const materialDispatched = materialMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const bufferMap = await json('source/game/client/buffers-map.json');
const bufferDispatched = bufferMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const recordMap = await json('source/game/client/records-map.json');
const recordDispatched = recordMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const shiftMap = await json('source/game/client/shifts-map.json');
const shiftDispatched = shiftMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const wrapperMap = await json('source/game/client/wrappers-map.json');
const wrapperDispatched = wrapperMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const textSupportMap = await json('source/game/client/text-support-map.json');
const textSupportDispatched = textSupportMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const numberFormatMap = await json('source/game/client/number-format-map.json');
const numberFormatDispatched = numberFormatMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const scanFormatMap = await json('source/game/client/scan-format-map.json');
const scanFormatDispatched = scanFormatMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const configIoMap = await json('source/game/client/config-io-map.json');
const configIoDispatched = configIoMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const floatArrayMap = await json('source/game/client/float-array-map.json');
const floatArrayDispatched = floatArrayMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const channelPackMap = await json('source/game/client/channel-pack-map.json');
const channelPackDispatched = channelPackMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const bitmapDecodeMap = await json('source/game/client/bitmap-decode-map.json');
const bitmapDecodeDispatched = bitmapDecodeMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const rowBlitMap = await json('source/game/client/row-blit-map.json');
const rowBlitDispatched = rowBlitMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const pixelConvertMap = await json('source/game/client/pixel-convert-map.json');
const pixelConvertDispatched = pixelConvertMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const alphaBlitMap = await json('source/game/client/alpha-blit-map.json');
const alphaBlitDispatched = alphaBlitMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const windowCheckMap = await json('source/game/client/window-check-map.json');
const windowCheckDispatched = windowCheckMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const channelBlitMap = await json('source/game/client/channel-blit-map.json');
const channelBlitDispatched = channelBlitMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const objectConstructorMap = await json('source/game/client/object-constructor-map.json');
const objectConstructorDispatched = objectConstructorMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const affineSamplerMap = await json('source/game/client/affine-sampler-map.json');
const affineSamplerDispatched = affineSamplerMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const atanfMap = await json('source/game/client/atanf-map.json');
const atanfDispatched = atanfMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const atanMap = await json('source/game/client/atan-map.json');
const atanDispatched = atanMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const softCompareMap = await json('source/game/client/soft-compare-map.json');
const softCompareDispatched = softCompareMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const blendBlitMap = await json('source/game/client/blend-blit-map.json');
const blendBlitDispatched = blendBlitMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const utf8DecodeMap = await json('source/game/client/utf8-decode-map.json');
const utf8DecodeDispatched = utf8DecodeMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const pixelChannelExtractMap = await json('source/game/client/pixel-channel-extract-map.json');
const pixelChannelExtractDispatched = pixelChannelExtractMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const pixelWriteModesMap = await json('source/game/client/pixel-write-modes-map.json');
const pixelWriteModesDispatched = pixelWriteModesMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const rgb565WriteModesMap = await json('source/game/client/rgb565-write-modes-map.json');
const rgb565WriteModesDispatched = rgb565WriteModesMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const rgb555WriteModesMap = await json('source/game/client/rgb555-write-modes-map.json');
const rgb555WriteModesDispatched = rgb555WriteModesMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const rgba8888WriteModesMap = await json('source/game/client/rgba8888-write-modes-map.json');
const rgba8888WriteModesDispatched = rgba8888WriteModesMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const particleRecordMap = await json('source/game/client/particle-record-map.json');
const particleRecordDispatched = particleRecordMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const utf8AdvanceMap = await json('source/game/client/utf8-advance-map.json');
const utf8AdvanceDispatched = utf8AdvanceMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const mbToWcMap = await json('source/game/client/mb-to-wc-map.json');
const mbToWcDispatched = mbToWcMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const rowChannelBlendMap = await json('source/game/client/row-channel-blend-map.json');
const rowChannelBlendDispatched = rowChannelBlendMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const scaledChannelBlitMap = await json('source/game/client/scaled-channel-blit-map.json');
const scaledChannelBlitDispatched = scaledChannelBlitMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const vtableConstructorMap = await json('source/game/client/vtable-constructors-map.json');
const vtableConstructorDispatched = vtableConstructorMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const globalDestructorMap = await json('source/game/client/global-destructors-map.json');
const globalDestructorDispatched = globalDestructorMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const stringUtilityMap = await json('source/game/server/string-utilities-map.json');
const memcmpMap = await json('source/game/server/memcmp-map.json');
const lifecycleHelperMap = await json('source/game/server/lifecycle-helpers-map.json');
const timeoutRegistryMap = await json('source/game/server/timeout-registry-map.json');
const trigKernelMap = await json('source/game/server/trig-kernels-map.json');
const timeoutFireMap = await json('source/game/server/timeout-fire-map.json');
const growthFactorMap = await json('source/game/server/growth-factor-map.json');
const serverFrexpMap = await json('source/game/server/frexp-map.json');
const wideShiftMap = await json('source/game/server/wide-shift-map.json');
const clientTimeoutFireMap = await json('source/game/client/timeout-fire-map.json');
const checkWebSocketsMap = await json('source/game/server/check-websockets-map.json');
const pointerArrayMap = await json('source/game/server/allocation-map.json');
const petalTooltipMap = await json('source/game/client/petal-tooltip-map.json');
const cosineCorrectionMap = await json('source/game/server/cosine-correction-map.json');
const entityDefinitionMap = await json('source/game/server/entity-definitions-map.json');
const numberParseMap = await json('source/game/server/number-parse-map.json');
const scanUtilitiesMap = await json('source/game/server/scan-utilities-map.json');
const stringMoveMap = await json('source/game/server/string-move-map.json');
const scalarHelperMap = await json('source/game/server/scalar-helpers-map.json');
const sineOffsetMap = await json('source/game/server/sine-offset-map.json');
const vectorHelperMap = await json('source/game/server/vector-helpers-map.json');
const serverAtanMap = await json('source/game/server/atan-map.json');
const bumpAllocatorMap = await json('source/game/server/bump-allocator-map.json');
const wideMultiplyMap = await json('source/game/server/wide-multiply-map.json');
const scalbnMap = await json('source/game/server/scalbn-map.json');
const fourRecordSortMap = await json('source/game/server/four-record-sort-map.json');
const containerEndMap = await json('source/game/server/container-end-map.json');
const byteMoveMap = await json('source/game/server/byte-move-map.json');
const recordSortMap = await json('source/game/server/record-sort-map.json');
const randomStateMap = await json('source/game/server/random-state-map.json');
const freeBlockMap = await json('source/game/server/free-block-map.json');
const collisionFilterMap = await json('source/game/server/collision-filter-map.json');
const mbrtowcMap = await json('source/game/server/mbrtowc-map.json');
const packedKeySortMap = await json('source/game/server/packed-key-sort-map.json');
const fiveKeySortMap = await json('source/game/server/packed-key-sort-five-map.json');
const utf8ScanMap = await json('source/game/server/utf8-scan-map.json');
const spawnManager192Map = await json('source/game/server/spawn-manager-192-map.json');
const spawnComponentMap = await json('source/game/server/spawn-components-map.json');
const floatFormatSuffixMap = await json('source/game/server/float-format-suffix-map.json');
const utf16ToUtf8Map = await json('source/game/server/utf16-to-utf8-map.json');
const serverUtf8DecodeMap = await json('source/game/server/utf8-decode-map.json');
const unicodeCodecMap = await json('source/game/server/unicode-codecs-map.json');
const entityFlagResetMap = await json('source/game/server/entity-flag-reset-map.json');
const remPio2fMap = await json('source/game/server/rem-pio2f-map.json');
const remPio2Map = await json('source/game/server/rem-pio2-map.json');
const stringTableDestructionMap = await json('source/game/server/string-table-destruction-map.json');
const remPio2LargeMap = await json('source/game/server/rem-pio2-large-map.json');
const depthComparatorMap = await json('source/game/server/depth-comparator-map.json');
const frexpMap = await json('source/game/client/frexp-map.json');
const frexpDispatched = frexpMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const randomAngleMap = await json('source/game/client/random-angle-map.json');
const allocateZeroedArrayMap = await json('source/game/client/allocate-zeroed-array-map.json');
const allocateZeroedArrayDispatched = allocateZeroedArrayMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
const randomAngleDispatched = randomAngleMap.functionIds.filter(id => (clientCalls[id] ?? 0) > 0);
let browserMatchesBuild = true;
for (const [file, artifact] of Object.entries(browser.sourceArtifacts ?? {})) {
  const bytes = await fs.readFile(path.join(build.output, file)).catch(() => null);
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) browserMatchesBuild = false;
}
for (const [file, artifact] of Object.entries(browser.highLevelSourceArtifacts ?? {})) {
  if (build.sourceSha256?.['source/' + file] !== artifact.sourceSha256) browserMatchesBuild = false;
}
const browserStatus = browserMatchesBuild
  ? '当前构建已经通过有限浏览器场景验证'
  : `最新构建尚待浏览器复测；上次验证对应 ${lastBrowserFunctionCount} 个高层函数的构建`;
const report = `# Legacy Florr 源码重建与逆向记录

## 当前结果

已完成**全部机器指令和数据的源码化、可重复构建**；此前重建版本已通过有限浏览器运行验证。
${browserStatus}。浏览器结论按实际部署文件及高层模块 SHA 绑定，不能套用到后续构建。
参考构建的两个 WASM 都由完整 WAT 重新编译，产物与归档逐字节一致。
默认构建进一步将 **${migratedCount} 个原函数体移除，改为执行恢复后的高层 JS**；
这些函数的原指令体已从默认生成产物中移除。适配器保持共享线性内存、原栈、
函数表槽和导入类型，未恢复依赖仍显式调用。两种构建都能在没有原始 JS/WASM 的干净目录生成。

**“所有函数均已还原为通顺的高层业务源码”仍未完成。** 下表明确标记剩余语义未知，
没有将反汇编、格式化或自动编号当作完整领域逻辑恢复；不能宣称取得原作者的 C++ 工程。
现有高层人工恢复函数是可验证的增量，其余行为暂时由可重建 WAT 保留。

| 原要求 | 状态 | 依据 |
| --- | --- | --- |
| 所有发布 JS 可读化、保留游戏行为 | 完成全量作用域还原和格式化；局部语义部分恢复 | AST/绑定拓扑、${testTotal} 项差分与重建测试、浏览器回归 |
| 所有 WASM 无损转为可构建源码 | 完成 | 4,979 个内部函数、完整数据段、两个 SHA-256 逐字节对照 |
| 所有 WASM 都有较易阅读的控制流视图 | 完成反编译视图；它仍是机器级伪代码 | 全函数分卷 dcmp 和索引，不能直接作为 C++ 编译 |
| 全部函数、结构、AI、伤害和渲染的高层语义恢复 | 部分完成 | 函数命名及置信度清单、人工语义模块、剩余未知计数 |
| 用恢复源码复现当前完整单机游戏 | ${browserStatus} | dist/、无归档构建测试、离线运行报告 |

## 源码入口

完整使用方法见 [source/README.md](../source/README.md)。

~~~sh
npm ci --ignore-scripts
npm run build
node serve.mjs --root dist
npm test
~~~

* 游戏构建：source/javascript/*.js、source/wasm/*.wat、source/assets/。
* 活动高层实现：source/game/ 与 source/runtime/；清单控制实际替换的函数体。
* 原版对照：source/javascript/upstream/，保留 upstream/client.js 的原主机名判断；两组归档 WASM 按完全相同字节去重恢复，测试同时比较 web/ 和 upstream/。
* 阅读视图：source/decompiled/client/ 和 source/decompiled/sp_server/，每 64 个函数分卷。
* 早期人工还原与数据目录：source/semantic/，其中 main/输出队列被活动实现使用。
* 符号追踪：reports/wasm/*-functions.json 含原函数编号、WAT 行号、直接调用和间接调用数。
* 字符串和资源：reports/wasm/*-strings.json；其余数据逐字节保留在 WAT 中。
* [JS 恢复说明](javascript.md)、[服务端行为](server-behavior.md)、[客户端行为](client-behavior.md)。

## 覆盖统计

| 默认构建 | 已迁入高层执行的函数 | 仍有机器级实现的函数 |
| --- | ---: | ---: |
${migratedRows.join('\n')}

函数迁移数只统计实际移除原体并接入调用的条目。剩余独立碰撞/AI 与渲染
不会因这批测试通过而被标记完成。完整主模拟 654、客户端快照解析 1015、初始化 656 和
输入 655、客户端更新与主绘制 763、实体绘制 760 已实际替换；各自的剩余独立依赖仍按清单继续恢复。
新增细节：[花瓣行为](server-petals.md)、[特殊花瓣](server-petals-special.md)、[工厂](server-petal-factories.md)、[生命周期](server-petal-lifecycle.md)、[实体与治疗](server-entities.md)、[伤害与死亡](server-damage.md)、[战斗辅助](server-combat.md)、[坐标](server-transforms.md)、[归属](server-ownership.md)、[空间 AI](server-spatial-ai.md)、[效果与回调存储](server-effects.md)、[模拟辅助](server-simulation.md)、[时钟](server-clock.md)、[客户端传输](client-transport.md)、[实际单人快照路径](client-snapshots.md)、[组件声明与事件解析](client-snapshot-decoder.md)。

完整主入口另见：[服务端初始化](server-initialization.md)、[输入命令](server-input.md)、
[装备与花瓣整局组合](server-loadout.md)、[实体快照解析](client-entity-snapshot.md)。
新增完整依赖：[主模拟](server-simulation-tick.md)、[组件服务](server-components.md)、[可靠输入](client-frame.md)、[更新与主绘制](client-render-frame.md)、[客户端时钟与初始化锁](client-clock.md)。
客户端新增：[坐标/角度插值与可视边界](client-transforms.md)、[绘图原语与地图分区](client-drawing-primitives.md)。
文本与画布服务：[内容、测量、栅格缓存、区间替换扩容、合成绘制和画布生命周期](client-text.md)。
实体渲染：[完整实体绘制、组件分派和花瓣虚表路径](client-entity-renderer.md)。
共用服务：[内存复制/比较和 f64 舍入](client-runtime-primitives.md)。
独立绘图：[玩家外观](client-player-appearance.md)、[组件132](client-component-132-renderer.md)、[组件148](client-component-148-renderer.md)、[组件128](client-component-128-renderer.md)、[组件64/80](client-components-64-80-renderer.md)、[眼睛](client-eye-renderer.md)。
数学与位模式：[f64 幂和二进制指数缩放](client-math.md)、[f32 三角函数与范围归约](client-trig.md)、[f64 三角函数与戴氏归约](client-double-trig.md)。
内存服务：[完整填充及其参数换序包装](client-memory-fill.md)。
实体目录：[一次性初始化、23 条记录与查找](client-entity-definition.md)、[116 字节实体记录移动构造](client-entity-record.md)。
直线叶函数：[74 个无调用、无分支的访问器、常量、虚表和栈函数](client-leaf-functions.md)。
直线小函数：[9 个无调用、无分支的构造、位打包、选择、组件寻址、栈对齐和链表函数](client-straight-line.md)。
组合函数：[5 个依赖已恢复的填充、复制、时钟快照和时差函数](client-composed.md)。
条件小函数：[13 个单分支描述符初始化、表查找、最小值、游标和掩码函数](client-conditionals.md)。
宽整数：[3 个 128 位乘法与左右移函数](client-wide-math.md)。
区间与字符串：[10 个复制、反转、宽字符串长度、十进制定位和字节扩展函数](client-ranges.md)。
谓词与扫描：[10 个标签解码、线性扫描、组件判等、全局计数和文本标志函数](client-predicates.md)。
材质与哈希：[6 个材质工厂、4 个表映射、2 个 25 字节哈希填充和 1 个单例谓词](client-materials.md)。
缓冲区与字符串：[9 个字符串比较/末尾指针、宽度存储、字符类扫描和哈希累加函数](client-buffers.md)。
记录与数值：[7 个空闲链表、一次性注册、状态迁移、Park-Miller、掩码异或、流重置和数组比较函数](client-records.md)。
64 位移位：[2 个低位/高位对左移和右移函数](client-shifts.md)。
组合包装：[5 个调用已恢复依赖的组件/全局/数组包装函数](client-wrappers.md)。
文本与流支持：[8 个字符串长度、数字前缀/解析、有界比较、下界查找、全局清零和流位置函数](client-text-support.md)。
数字格式与记录：[7 个饱和 f32 缩放、向量重置、像素格式、u64 十进制、前缀格式化、解析状态和记录比较函数](client-number-format.md)。
扫描与流：[8 个大小写比较、回退、有界扫描、矩形钳制、浮点后缀、全局清零和通道解包函数](client-scan-format.md)。
配置读取：[9 个组件状态、比较后移动/更新、十进制默认值、字面量分类、选项钳制、扫描追加和状态交换函数](client-config-io.md)。
浮点与数组：[4 个 128 位整数/浮点扩展、指针插入排序和解析器回退函数](client-float-array.md)。
调色板与通道：[5 个 RGB565 打包和调色板查表转换函数](client-channel-pack.md)。
位图与编码：[7 个稀疏清零、四种一位行解码、最近颜色和 UTF-8 写入函数](client-bitmap-decode.md)。
行复制：[8 个带通道缩放和不同输出字节序的行复制函数](client-row-blit.md)。
像素转换：[1 个三表掩码像素转换函数](client-pixel-convert.md)。
Alpha 行复制：[2 个带 alpha 写入和通道缩放的行复制函数](client-alpha-blit.md)。
窗口校验：[1 个五窗口打包有效性判断函数](client-window-check.md)。
四通道行复制：[4 个带第四通道高字节缩放的行复制函数](client-channel-blit.md)。
对象构造：[1 个固定布局复制并重连链表的构造函数](client-object-constructor.md)。
仿射采样：[10 个 16.16 定点仿射纹理采样与通道转换函数](client-affine-sampler.md)。
单精度反正切：[1 个带四段归约和奇数多项式的 \`atanf\`](client-atanf.md)。
双精度反正切：[1 个带双 Horner 多项式的 \`atan\`](client-atan.md)。
128 位比较：[2 个 soft-float 128 位比较辅助函数](client-soft-compare.md)。
合成混合：[4 个带通道交换变体的合成 blitter](client-blend-blit.md)。
文本解码：[1 个 UTF-8 码点解码器](client-utf8-decode.md)。
像素通道：[1 个打包像素通道提取器](client-pixel-channel-extract.md)。
像素写入：[1 个多模式打包像素写入器](client-pixel-write-modes.md)。
RGB565 写入：[1 个多模式 RGB565 像素写入器](client-rgb565-write-modes.md)。
RGB555 写入：[1 个多模式 RGB555 像素写入器](client-rgb555-write-modes.md)。
RGBA 写入：[1 个多模式 RGBA8888 像素写入器](client-rgba8888-write-modes.md)。
粒子记录：[2 个粒子路径记录追加函数](client-particle-record.md)。
UTF-8 前进：[2 个 UTF-8 跨度校验函数](client-utf8-advance.md)。
多字节转换：[1 个多字节到宽字符转换函数](client-mb-to-wc.md)。
行通道混合：[2 个行通道混合函数](client-row-channel-blend.md)。
缩放通道位块：[1 个缩放通道位块函数](client-scaled-channel-blit.md)。
Vtable 构造：[47 个仅写 vtable 的对象构造函数](client-vtable-constructors.md)。
全局析构：[26 个全局析构函数](client-global-destructors.md)。
浮点分解：[frexp 922](client-frexp.md)。
服务端字节串：[strlen 与字节区间反转](server-string-utilities.md)。
服务端比较：[memcmp](server-memcmp.md)。
服务端生命周期：[默认谓词与本地名称析构](server-lifecycle-helpers.md)。
超时注册表：[关闭清理](server-timeout-registry.md)。
服务端三角：[正弦/余弦核](server-trig-kernels.md)。
定时器触发：[cp6TimeoutFire](server-timeout-fire.md)。
成长因子：[1.06 整数幂](server-growth-factor.md)。
服务端 frexp：[IEEE-754 分解](server-frexp.md)。
宽移位：[128 位左/右移](server-wide-shift.md)。
客户端定时器：[fireTimeoutCallback](client-timeout-fire.md)。
WebSocket 泵：[cp6CheckWebSockets](server-check-websockets.md)。
指针数组分配：[数组 new 包装](server-allocation.md)。
花瓣提示框：[renderPetalTooltip](client-petal-tooltip.md)。
余弦修正：[带线性积修正的余弦核](server-cosine-correction.md)。
实体目录：[23 槽惰性编目与查找](server-entity-definitions.md)。
数字解析：[流标志选择进制](server-number-parse.md)。
扫描工具：[字/字节查找、终止符与十进制游标](server-scan-utilities.md)。
字符串移动：[两种移动赋值](server-string-move.md)。
标量助手：[对象上限、哨兵、宽度存储与 128 位归一化](server-scalar-helpers.md)。
正弦偏移：[sin(x)+y(1-x²/2)](server-sine-offset.md)。
向量追加：[清零并推进末尾](server-vector-helpers.md)。
反正切：[四区间 fdlibm atan](server-atan.md)。
碰撞分配：[对齐 bump allocator](server-bump-allocator.md)。
宽乘法：[128 位乘法](server-wide-multiply.md)。
指数缩放：[scalbn](server-scalbn.md)。
四记录排序：[比较交换网络](server-four-record-sort.md)。
容器末尾：[堆/内联存储的 end 指针](server-container-end.md)。
字节移动：[重叠安全 memmove](server-byte-move.md)。
记录排序：[带 8 次交换截断的插入排序](server-record-sort.md)。
随机状态：[312 字循环生成器](server-random-state.md)。
块释放：[dlmalloc 合并与分箱](server-free-block.md)。
碰撞层过滤：[30 层阈值计数](server-collision-filter.md)。
多字节转换：[mbrtowc 及其持久状态](server-mbrtowc.md)。
深度排序：[三槽比较交换网络](server-depth-comparator.md)。
打包键排序：[四键自适应插入网络](server-packed-key-sort.md)。
五键排序：[四键网络加右端插入](server-packed-key-sort-five.md)。
UTF-8 扫描：[UTF-16 预算下的完整序列扫描](server-utf8-scan.md)。
实体记录管理：[world+192 分配与发布](server-spawn-manager-192.md)。
字符串与发布：[实体字符串赋值、句柄发布](server-spawn-components.md)。
格式规格：[printf 浮点后缀构造](server-float-format-suffix.md)。
UTF-16 转换：[UTF-16LE 到 UTF-8 转码](server-utf16-to-utf8.md)。
码点扫描：[UTF-8 码点计数](server-utf8-decode.md)。
Unicode 编解码：[UTF-8↔UTF-32](server-unicode-codecs.md)。
实体标志重置：[实体定义标志清零](server-entity-flag-reset.md)。
三角函数归约：[单精度 rem_pio2f](server-rem-pio2f.md)、[双精度 rem_pio2](server-rem-pio2.md)。
静态字符串销毁：[字符串表析构](server-string-table-destruction.md)。
大参数归约：[Payne–Hanek __rem_pio2_large](server-rem-pio2-large.md)。
随机角生成：[8 个 Park–Miller 生成器构造函数](client-random-angle.md)。
零初始化数组：[allocateZeroedArray 1764](client-allocate-zeroed-array.md)。

以下“命名”仅统计 WAT/反编译索引中已有依据的符号，不包含仅在 source/game 恢复模块中使用的入口名，
因此与活动高层函数数不同；命名也**不表示整段函数的所有语义已经理解**。
导入由 JS 实现，内部函数列不重复计算导入。索引中的匿名函数仍保留原数字身份，可稳定继续分析。

| 模块 | 内部函数 | 导入 | 索引已命名内部函数 | 索引未命名内部函数 | 数据段 |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

| JS | 词法绑定 | 有依据语义名 | 仅知语法角色 | 私有属性恢复 |
| --- | ---: | ---: | ---: | ---: |
${jsRows.join('\n')}

服务端从实际构造器恢复了 39 条花瓣定义、23 条实体定义、20 条生成规则、工厂与虚表。
同显示名称的不同类型保留各自 typeId；未经确认的字段保留偏移和原始字节。
源码已包含明确的函数/字段/协议边界，仍需继续人工分析剩余碰撞、AI、状态效果、升级、
独立协议/组件服务和客户端完整渲染/交互状态流，才能交付完全独立的高层重写版本。

## 等价性和运行证据

最近一次完整测试记录：[tests.tap](tests.tap)，共 ${testTotal} 项，通过 ${testPassed} 项，失败 ${testFailed} 项。
完整测试也包含尚未接入的恢复草稿；失败会保留在记录中，不能用活动构建冒烟通过替代它。
当前活动替换范围以构建清单为准，草稿仅在完整函数通过验证后才会加入清单。

| 参考构建产物 | 原文件及重建 SHA-256 | 比对 |
| --- | --- | --- |
${hashRows.join('\n')}

WASM 逐字节一致由 tools/recover-wasm.mjs 和 test/source-build.test.mjs 实际验证，
这是本项目的额外验证结果，不是将 REA 的静态 WAT 解码当成二进制重建证明。
执行 npm run build:reference 获得逐字节参考版；默认 npm run build 的混合实现会改变
WASM 字节，其行为依据原函数差分和实际游戏回归验证，不能声称默认产物仍二进制相同。
JS 则检查仅允许改名、无作用域捕获、无优化改写，并执行原版/恢复版接口差分。
源码反射结果（函数名字、堆栈、toString）随可读化发生变化，行为等价限定于游戏运行接口。

[浏览器高层构建报告](runtime/readable.json) 的 ${passedChecks} 项检查通过，对应 ${lastBrowserFunctionCount} 个活动函数的构建。
${browserStatus}。该报告中的页面和 Worker 均使用当时的恢复源码构建，宿主 JS 与源码加固定加载器的组合一致，
所有实际加载的高层模块均逐文件核对源码 SHA。调用计数证实服务端高层花瓣、
实体和治疗/输出路径，以及客户端初始化、单人帧、快照入队/出队和滚轮路径在游戏中执行。
验证菜单、进入游戏、鼠标移动、攻击展开、防御收缩、键盘事件与持续模拟，
初始握手及资源清单与基线一致，未出现外部请求、失败请求或运行异常。
库存槽可见、I/1 输入已送达；未声称已验证库存编辑操作。
新增浏览器调用计数确认内存复制/比较、完整填充382、舍入、路径/图像、玩家外观1100及组件148绘制1044实际执行；
组件132绘制1040在此有限浏览器场景未触发，其行为依据专属原WASM组件对照验证，不能声称获得浏览器路径覆盖。三角函数入口427/431在本次场景各执行${clientCalls[427] ?? 0}次；486/487/929未被单独派发，因此浏览器计数不能证明其嵌套调用次数。${leafMap.functionIds.length} 个直线叶函数中只有 ${leafDispatched.length} 个在本场景被派发，其余 ${leafMap.functionIds.length - leafDispatched.length} 个的浏览器未执行状态记录在 [current-verification.json](current-verification.json) 的 leafFunctions 字段。9 个直线小函数中有 ${straightDispatched.length} 个被派发，其余记录在 straightLineFunctions 字段。5 个组合函数中本场景派发 ${composedDispatched.length} 个，其余记录在 composedFunctions 字段。13 个条件小函数中派发 ${conditionalDispatched.length} 个，其余记录在 conditionalFunctions 字段。3 个宽整数函数中派发 ${wideMathDispatched.length} 个，其余记录在 wideMathFunctions 字段。10 个区间函数中派发 ${rangeDispatched.length} 个，其余记录在 rangeFunctions 字段。10 个谓词函数中派发 ${predicateDispatched.length} 个，其余记录在 predicateFunctions 字段。13 个材质/哈希函数中派发 ${materialDispatched.length} 个，其余记录在 materialFunctions 字段。9 个缓冲区函数中派发 ${bufferDispatched.length} 个，其余记录在 bufferFunctions 字段。7 个记录函数中派发 ${recordDispatched.length} 个，其余记录在 recordFunctions 字段。2 个移位函数中派发 ${shiftDispatched.length} 个，其余记录在 shiftFunctions 字段。5 个包装函数中派发 ${wrapperDispatched.length} 个，其余记录在 wrapperFunctions 字段。8 个文本支持函数中派发 ${textSupportDispatched.length} 个，其余记录在 textSupportFunctions 字段。7 个数字格式函数中派发 ${numberFormatDispatched.length} 个，其余记录在 numberFormatFunctions 字段。8 个扫描函数中派发 ${scanFormatDispatched.length} 个，其余记录在 scanFormatFunctions 字段。9 个配置函数中派发 ${configIoDispatched.length} 个，其余记录在 configIoFunctions 字段。4 个浮点数组函数中派发 ${floatArrayDispatched.length} 个，其余记录在 floatArrayFunctions 字段。5 个通道函数中派发 ${channelPackDispatched.length} 个，其余记录在 channelPackFunctions 字段。${bitmapDecodeMap.functionIds.length} 个位图函数中派发 ${bitmapDecodeDispatched.length} 个，其余记录在 bitmapDecodeFunctions 字段。${rowBlitMap.functionIds.length} 个行复制函数中派发 ${rowBlitDispatched.length} 个，其余记录在 rowBlitFunctions 字段。${pixelConvertMap.functionIds.length} 个像素转换函数中派发 ${pixelConvertDispatched.length} 个，其余记录在 pixelConvertFunctions 字段。${alphaBlitMap.functionIds.length} 个 alpha 行复制函数中派发 ${alphaBlitDispatched.length} 个，其余记录在 alphaBlitFunctions 字段。${windowCheckMap.functionIds.length} 个窗口校验函数中派发 ${windowCheckDispatched.length} 个，其余记录在 windowCheckFunctions 字段。${channelBlitMap.functionIds.length} 个四通道行复制函数中派发 ${channelBlitDispatched.length} 个，其余记录在 channelBlitFunctions 字段。${objectConstructorMap.functionIds.length} 个对象构造函数中派发 ${objectConstructorDispatched.length} 个，其余记录在 objectConstructorFunctions 字段。${affineSamplerMap.functionIds.length} 个仿射采样函数中派发 ${affineSamplerDispatched.length} 个，其余记录在 affineSamplerFunctions 字段。${atanfMap.functionIds.length} 个单精度反正切函数中派发 ${atanfDispatched.length} 个，其余记录在 atanfFunctions 字段。${atanMap.functionIds.length} 个双精度反正切函数中派发 ${atanDispatched.length} 个，其余记录在 atanFunctions 字段。${softCompareMap.functionIds.length} 个 128 位比较函数中派发 ${softCompareDispatched.length} 个，其余记录在 softCompareFunctions 字段。${blendBlitMap.functionIds.length} 个合成 blitter 中派发 ${blendBlitDispatched.length} 个，其余记录在 blendBlitFunctions 字段。${serverUtf8DecodeMap.functionIds.length} 个 UTF-8 解码器中派发 ${utf8DecodeDispatched.length} 个，其余记录在 utf8CodePointFunctions 字段。${pixelChannelExtractMap.functionIds.length} 个像素通道提取器中派发 ${pixelChannelExtractDispatched.length} 个，其余记录在 pixelChannelExtractFunctions 字段。${pixelWriteModesMap.functionIds.length} 个像素写入器中派发 ${pixelWriteModesDispatched.length} 个，其余记录在 pixelWriteModesFunctions 字段。${rgb565WriteModesMap.functionIds.length} 个 RGB565 写入器中派发 ${rgb565WriteModesDispatched.length} 个，其余记录在 rgb565WriteModesFunctions 字段。${rgb555WriteModesMap.functionIds.length} 个 RGB555 写入器中派发 ${rgb555WriteModesDispatched.length} 个，其余记录在 rgb555WriteModesFunctions 字段。${rgba8888WriteModesMap.functionIds.length} 个 RGBA8888 写入器中派发 ${rgba8888WriteModesDispatched.length} 个，其余记录在 rgba8888WriteModesFunctions 字段。${particleRecordMap.functionIds.length} 个粒子记录函数中派发 ${particleRecordDispatched.length} 个，其余记录在 particleRecordFunctions 字段。${utf8AdvanceMap.functionIds.length} 个 UTF-8 前进函数中派发 ${utf8AdvanceDispatched.length} 个，其余记录在 utf8AdvanceFunctions 字段。${mbToWcMap.functionIds.length} 个多字节转换函数中派发 ${mbToWcDispatched.length} 个，其余记录在 mbToWcFunctions 字段。${rowChannelBlendMap.functionIds.length} 个行通道混合函数中派发 ${rowChannelBlendDispatched.length} 个，其余记录在 rowChannelBlendFunctions 字段。${scaledChannelBlitMap.functionIds.length} 个缩放通道位块函数中派发 ${scaledChannelBlitDispatched.length} 个，其余记录在 scaledChannelBlitFunctions 字段。${vtableConstructorMap.functionIds.length} 个 vtable 构造函数中派发 ${vtableConstructorDispatched.length} 个，其余记录在 vtableConstructorFunctions 字段。${globalDestructorMap.functionIds.length} 个全局析构函数中派发 ${globalDestructorDispatched.length} 个，其余记录在 globalDestructorFunctions 字段。${frexpMap.functionIds.length} 个 frexp 函数中派发 ${frexpDispatched.length} 个，其余记录在 frexpFunctions 字段。${stringUtilityMap.functionIds.length} 个服务端字节串函数已恢复，浏览器派发计数记录在 stringUtilityFunctions 字段。${memcmpMap.functionIds.length} 个服务端 memcmp 函数已恢复，浏览器派发计数记录在 memcmpFunctions 字段。${lifecycleHelperMap.functionIds.length} 个服务端生命周期辅助函数已恢复，派发计数记录在 lifecycleHelperFunctions 字段。${timeoutRegistryMap.functionIds.length} 个超时注册表清理函数已恢复，派发计数记录在 timeoutRegistryFunctions 字段。${trigKernelMap.functionIds.length} 个服务端三角核已恢复，派发计数记录在 trigKernelFunctions 字段。${timeoutFireMap.functionIds.length} 个定时器触发函数已恢复，派发计数记录在 timeoutFireFunctions 字段。${growthFactorMap.functionIds.length} 个成长因子函数已恢复，派发计数记录在 growthFactorFunctions 字段。${serverFrexpMap.functionIds.length} 个服务端 frexp 函数已恢复，派发计数记录在 serverFrexpFunctions 字段。${wideShiftMap.functionIds.length} 个 128 位移位函数已恢复，派发计数记录在 wideShiftFunctions 字段。${clientTimeoutFireMap.functionIds.length} 个客户端定时器触发函数已恢复，派发计数记录在 clientTimeoutFireFunctions 字段。${checkWebSocketsMap.functionIds.length} 个 WebSocket 泵函数已恢复，派发计数记录在 checkWebSocketsFunctions 字段。${pointerArrayMap.functionIds.length} 个指针数组分配函数已恢复，派发计数记录在 pointerArrayFunctions 字段。${petalTooltipMap.functionIds.length} 个花瓣提示框函数已恢复，派发计数记录在 petalTooltipFunctions 字段。${cosineCorrectionMap.functionIds.length} 个余弦修正函数已恢复，派发计数记录在 cosineCorrectionFunctions 字段。${entityDefinitionMap.functionIds.length} 个实体目录函数已恢复，派发计数记录在 entityDefinitionFunctions 字段。${numberParseMap.functionIds.length} 个数字解析函数已恢复，派发计数记录在 numberParseFunctions 字段。${scanUtilitiesMap.functionIds.length} 个扫描工具函数已恢复，派发计数记录在 scanUtilitiesFunctions 字段。${stringMoveMap.functionIds.length} 个字符串移动函数已恢复，派发计数记录在 stringMoveFunctions 字段。${scalarHelperMap.functionIds.length} 个标量助手函数已恢复，派发计数记录在 scalarHelperFunctions 字段。${sineOffsetMap.functionIds.length} 个正弦偏移函数已恢复，派发计数记录在 sineOffsetFunctions 字段。${vectorHelperMap.functionIds.length} 个向量追加函数已恢复，派发计数记录在 vectorHelperFunctions 字段。${serverAtanMap.functionIds.length} 个服务端反正切函数已恢复，派发计数记录在 serverAtanFunctions 字段。${bumpAllocatorMap.functionIds.length} 个碰撞分配函数已恢复，派发计数记录在 bumpAllocatorFunctions 字段。${wideMultiplyMap.functionIds.length} 个宽乘法函数已恢复，派发计数记录在 wideMultiplyFunctions 字段。${scalbnMap.functionIds.length} 个指数缩放函数已恢复，派发计数记录在 scalbnFunctions 字段。${fourRecordSortMap.functionIds.length} 个四记录排序函数已恢复，派发计数记录在 fourRecordSortFunctions 字段。${containerEndMap.functionIds.length} 个容器末尾函数已恢复，派发计数记录在 containerEndFunctions 字段。${byteMoveMap.functionIds.length} 个字节移动函数已恢复，派发计数记录在 byteMoveFunctions 字段。${recordSortMap.functionIds.length} 个记录排序函数已恢复，派发计数记录在 recordSortFunctions 字段。${randomStateMap.functionIds.length} 个随机状态函数已恢复，派发计数记录在 randomStateFunctions 字段。${freeBlockMap.functionIds.length} 个块释放函数已恢复，派发计数记录在 freeBlockFunctions 字段。${collisionFilterMap.functionIds.length} 个碰撞过滤函数已恢复，派发计数记录在 collisionFilterFunctions 字段。${mbrtowcMap.functionIds.length} 个多字节转换函数已恢复，派发计数记录在 mbrtowcFunctions 字段。${depthComparatorMap.functionIds.length} 个深度排序函数已恢复，派发计数记录在 depthComparatorFunctions 字段。${packedKeySortMap.functionIds.length} 个打包键排序函数已恢复，派发计数记录在 packedKeySortFunctions 字段。${fiveKeySortMap.functionIds.length} 个五键排序函数已恢复，派发计数记录在 fiveKeySortFunctions 字段。${utf8ScanMap.functionIds.length} 个 UTF-8 扫描函数已恢复，派发计数记录在 utf8ScanFunctions 字段。${spawnManager192Map.functionIds.length} 个实体记录管理函数已恢复，派发计数记录在 spawnManager192Functions 字段。${spawnComponentMap.functionIds.length} 个字符串与发布函数已恢复，派发计数记录在 spawnComponentFunctions 字段。${floatFormatSuffixMap.functionIds.length} 个格式规格函数已恢复，派发计数记录在 floatFormatSuffixFunctions 字段。${utf16ToUtf8Map.functionIds.length} 个 UTF-16 转码函数已恢复，派发计数记录在 utf16ToUtf8Functions 字段。${serverUtf8DecodeMap.functionIds.length} 个 UTF-8 码点扫描函数已恢复，派发计数记录在 utf8CodePointFunctions 字段。${unicodeCodecMap.functionIds.length} 个 Unicode 编解码函数已恢复，派发计数记录在 unicodeCodecFunctions 字段。${entityFlagResetMap.functionIds.length} 个实体标志重置函数已恢复，派发计数记录在 entityFlagResetFunctions 字段。${remPio2fMap.functionIds.length} 个单精度三角函数归约函数已恢复，派发计数记录在 remPio2fFunctions 字段。${remPio2Map.functionIds.length} 个双精度三角函数归约函数已恢复，派发计数记录在 remPio2Functions 字段。${stringTableDestructionMap.functionIds.length} 个静态字符串析构函数已恢复，派发计数记录在 stringTableDestructionFunctions 字段。${remPio2LargeMap.functionIds.length} 个 Payne–Hanek 归约函数已恢复，派发计数记录在 remPio2LargeFunctions 字段。${randomAngleMap.functionIds.length} 个随机角生成器中派发 ${randomAngleDispatched.length} 个，其余记录在 randomAngleFunctions 字段。${allocateZeroedArrayMap.functionIds.length} 个零初始化数组函数中派发 ${allocateZeroedArrayDispatched.length} 个，其余记录在 allocateZeroedArrayFunctions 字段。
实体位置及后续包受真实时钟/Worker 调度影响，不比较后续截图的像素一致性。
这些测试没有穷尽死亡、长期存档和所有怪物/花瓣组合。

人工还原的服务端子函数通过直接调用原 WASM 比较，覆盖 256 种花瓣输入掩码、
空拥有者、输出队列、内联与堆载荷、XOR 密钥边界和目录原始记录。
新增测试逐项检查完整 64 MiB 内存、返回值、栈和宿主调用顺序；恢复了精确 f32/f64
常量、整数回绕、重叠复制、LZ4 过量复制、异常后栈状态和间接调用签名陷阱。
伪代码会将极小浮点值显示为零，已经以原 WAT 常量为准校正；不能以伪代码文本
表面相同代替指令级证据。
完整活动服务器另有 [确定性重放](server-replay.json)：使用实际游戏捕获的输入包，
连续推进 ${replay.ticks} 个 tick，每步比较完整内存、栈与全部输出。这是有界重放，仍不等于
所有怪物/花瓣组合、长期存档和所有异常输入的穷尽证明。

[花瓣整局组合报告](server-petal-world.json) 另覆盖 38 个可装备类型、攻防状态和移除清理，
在 228 个检查点比较完整内存、栈和所有输出，并要求实际执行 Peas 分裂后的延迟发射。
这是全部活动模块共同执行的对照，补充独立函数测试；仍未穷尽所有碰撞目标和状态组合。

## REA 证据账本

按照 Reverse Engineer Anything Skill，先识别发布产物、再静态分析、定向运行取证、
恢复、重建与验证。当前会话未注册 REA MCP，使用已安装的 **REA 6.5.0 CLI** 完成分析，
没有改写 Codex 配置。JavaScript 为静态应用分析；WASM 为 WABT 1.0.42 静态工件分析。

| 内容 | REA Evidence ID | 完整记录 |
| --- | --- | --- |
${Object.values(evidence).map(e => `| ${e.operation} / ${e.subject.name} | \`${e.evidenceId}\` | [无损压缩 JSON](${e.file.replace(/^reports\//, '')}) |`).join('\n')}

完整记录保留所有限制、输入身份和工具 SHA，摘要见 [evidence/summary.json](evidence/summary.json)。
运行 node tools/summarize-evidence.mjs 可再次解压校验和生成摘要。静态 JS 图不覆盖页面内联 JS；
页面入口另由直接读码和浏览器场景验证。REA 没有执行目标程序或自动抓取目标网址，
这里的运行事实来自单独记录的原 WASM 定向探针和浏览器验证，不能混同证据类型。

## 工具复现

正常重建只用 package-lock.json 固定的 npm 工具，不依赖 REA、原生反编译器或原始二进制。
重新反编译使用 WASM_DECOMPILE 指向原生 WABT 1.0.39；生成方法见源码 README。
读取视图不保留已知会造成参数命名不一致的局部调试名；执行 WAT 不受影响。
当前完整伪代码覆盖两个模块所有内部函数。
`;
await fs.writeFile(path.join(root, 'reports/RECONSTRUCTION.md'), report);
console.log('Updated reconstruction ledger with current symbol counts, hashes and evidence IDs.');
