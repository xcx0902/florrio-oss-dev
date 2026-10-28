# Legacy Florr.io —— 本地单机版

## 2026-10-25 本地验收与归档状态

稳定源码上两轮完整验收通过，真实 move/restore 演练后最终 move，再次完整验收通过。JavaScript 937/937、engine TAP 110/110、client 195/195、delivery 47/47、browser 47/47；CTest 5 个目标（core/sim/peer及schema合约检查）全通过。原版八场景×三帧 Canvas 在约定容差内无差异，像素全部在原阈值内；短/长 strict、14项 Hornet、24个生产交互及原客户端真实生命周期均通过。

最终 run：`2026-10-25T11-56-33.590Z-d7d59eb3`。完整身份、三轮结果和归档日志见 [`reports/release-acceptance.json`](reports/release-acceptance.json) 与 [本地发布记录](docs/release-acceptance.md)。默认入口为 dist-next，--reference 回退保留；六个 oracle/report 目录已真实移入 legacy，兼容原路径，恢复演练成功。

远端 Ubuntu CI 未执行（目录没有 .git/remote，无容器运行时）。CI 配置已修，不能声称线上全绿。历史 audit、golden、原始输入和容差不变；field26既有域扩展决定不变。后文历史计数/残差不作为当前验收结论。Synology Drive 项目同步已由用户暂停；恢复同步前须处理同步端旧目录与兼容 symlink 的类型冲突。

## 语义重建工程（C++20 + TypeScript）

仓库正在从“WAT + JS 逐函数替换”迁移到按领域组织的语义重建：

- [`engine/`](engine/CMakeLists.txt)：C++20 服务端与共享规则（native 测试已可运行）；
- [`client/`](client/tsconfig.json)：TypeScript + Canvas2D 客户端；
- [`schema/`](schema/README.md)：协议、World/Entity/Petal 布局、39 花瓣/23 实体/20 生成规则、39 行花瓣战斗数据与 23 行最终掉落概率；
- [`docs/parity.md`](docs/parity.md)：Canvas2D 命令 trace、8 个基准场景、server trace 与确定性重放；
- [`reference/manifest.json`](reference/manifest.json)：冻结参考与当前函数基线的内容哈希。

```sh
npm run test:reference   # 校验冻结参考与 build.json 基线
npm run test:engine      # C++ TAP + CTest core/sim/peer native suites
npm run build:engine:wasm # C++ core -> client/public/server.wasm
npm run test:client      # TypeScript 类型检查 + 浏览器 smoke
npm run schema:probe     # 原 wasm 目录表逐字段对照
npm run catalogs:combat  # 生成 39 花瓣碰撞半径/伤害/生命
npm run catalogs:drops:verify # 重算并对照 102 个掉落项
npm run parity           # 8 个场景的 Canvas2D / 截图 / server trace 对比
npm run parity:server    # Node 中重放原 sp_server.wasm
npm run parity:engine-state:strict # 原 server 与 C++ engine 的逐实体状态门禁
npm run parity:original-engine:all # 原客户端 + C++ engine（原生游戏/攻防/死亡/重开）
npm run status:write     # 校验 run 绑定证据并生成账本；独立旧报告不能关闭门禁
```

`web/`、`dist/`、`dist-readable/`、`dist-reference/`、`source/wasm/*.wat`、`source/javascript/*.js` 是只读 oracle；`dist-next/` 是须从最终源重建的交付树。
新代码不按 wasm 函数编号组织，也不在 `engine/src`、`client/src` 中写魔法地址。

## 可重建的还原源码（历史/参考范围）

新增的 [`source/`](source/README.md) 包含可读 JS、两个 WASM 的完整 WAT 源码、全部函数的 C 风格反编译视图，以及部分经过差分测试的人工还原逻辑。
历史参考版记录：两个 WASM 从源码重建后与原文件**逐字节一致**；参考构建将 3850 个函数（客户端 3334、服务端 516）接入实际高层 JS 实现，并以函数差分和整局内存回归验证。该参考版可通过还原源码独立构建运行。
**完整重建已验证，但全部函数的高层语义尚未还原，不能将 WAT/伪代码视为原始 C++。**
该参考构建和浏览器验证按源码与部署文件哈希记录，历史范围及剩余工作见 `reports/RECONSTRUCTION.md`；它不是当前 C++/TS 移植的最终验收。

```sh
npm ci --ignore-scripts
npm run build
node serve.mjs --root dist
npm test
```

详细入口、证据、测试覆盖和剩余工作见 [`source/README.md`](source/README.md) 与
[`reports/RECONSTRUCTION.md`](reports/RECONSTRUCTION.md)；新增的 74 个客户端直线叶函数、9 个直线小函数、5 个组合函数、13 个条件小函数、3 个宽整数函数、10 个区间函数、10 个谓词函数和 13 个材质/哈希函数和 9 个缓冲区函数和 7 个记录/数值函数和 2 个 64 位移位函数和 5 个依赖包装函数、8 个文本/流支持函数、7 个数字格式函数和 8 个扫描/格式函数和 9 个配置读取函数和 4 个浮点/数组函数和 5 个调色板/通道函数和 7 个位图/编码函数和 8 个行复制函数和 1 个像素转换函数和 2 个 alpha 行复制函数和 1 个窗口校验函数和 4 个四通道行复制函数和 1 个对象构造函数和 10 个仿射采样函数、1 个 `atanf` 和 1 个 `atan` 和 2 个正余弦内核见
[`reports/client-leaf-functions.md`](reports/client-leaf-functions.md)、
[`reports/client-straight-line.md`](reports/client-straight-line.md)、
[`reports/client-composed.md`](reports/client-composed.md)、
[`reports/client-conditionals.md`](reports/client-conditionals.md)、
[`reports/client-wide-math.md`](reports/client-wide-math.md)、
[`reports/client-ranges.md`](reports/client-ranges.md)、
[`reports/client-predicates.md`](reports/client-predicates.md)、
[`reports/client-materials.md`](reports/client-materials.md)、
[`reports/client-buffers.md`](reports/client-buffers.md)、
[`reports/client-records.md`](reports/client-records.md)、
[`reports/client-shifts.md`](reports/client-shifts.md)、
[`reports/client-wrappers.md`](reports/client-wrappers.md)、
[`reports/client-text-support.md`](reports/client-text-support.md) 与
[`reports/client-number-format.md`](reports/client-number-format.md) 与
[`reports/client-scan-format.md`](reports/client-scan-format.md) 与
[`reports/client-config-io.md`](reports/client-config-io.md) 与
[`reports/client-float-array.md`](reports/client-float-array.md) 与
[`reports/client-channel-pack.md`](reports/client-channel-pack.md) 与
[`reports/client-bitmap-decode.md`](reports/client-bitmap-decode.md) 与
[`reports/client-row-blit.md`](reports/client-row-blit.md) 与
[`reports/client-pixel-convert.md`](reports/client-pixel-convert.md) 与
[`reports/client-alpha-blit.md`](reports/client-alpha-blit.md) 与
[`reports/client-window-check.md`](reports/client-window-check.md) 与
[`reports/client-channel-blit.md`](reports/client-channel-blit.md) 与
[`reports/client-object-constructor.md`](reports/client-object-constructor.md) 与
[`reports/client-affine-sampler.md`](reports/client-affine-sampler.md) 与
[`reports/client-atanf.md`](reports/client-atanf.md) 与
[`reports/client-atan.md`](reports/client-atan.md) 与
[`reports/client-soft-compare.md`](reports/client-soft-compare.md) 与
[`reports/client-blend-blit.md`](reports/client-blend-blit.md) 与
[`reports/client-utf8-decode.md`](reports/client-utf8-decode.md) 与
[`reports/client-pixel-channel-extract.md`](reports/client-pixel-channel-extract.md) 与
[`reports/client-pixel-write-modes.md`](reports/client-pixel-write-modes.md) 与
[`reports/client-rgb565-write-modes.md`](reports/client-rgb565-write-modes.md) 与
[`reports/client-rgb555-write-modes.md`](reports/client-rgb555-write-modes.md) 与
[`reports/client-rgba8888-write-modes.md`](reports/client-rgba8888-write-modes.md) 与
[`reports/client-particle-record.md`](reports/client-particle-record.md) 与
[`reports/client-utf8-advance.md`](reports/client-utf8-advance.md) 与
[`reports/client-mb-to-wc.md`](reports/client-mb-to-wc.md) 与
[`reports/client-row-channel-blend.md`](reports/client-row-channel-blend.md) 与
[`reports/client-scaled-channel-blit.md`](reports/client-scaled-channel-blit.md) 与
[`reports/client-vtable-constructors.md`](reports/client-vtable-constructors.md) 与
[`reports/client-global-destructors.md`](reports/client-global-destructors.md) 与 [`reports/client-frexp.md`](reports/client-frexp.md)、[`reports/client-random-angle.md`](reports/client-random-angle.md)、[`reports/server-string-utilities.md`](reports/server-string-utilities.md)、[`reports/client-allocate-zeroed-array.md`](reports/client-allocate-zeroed-array.md)、[`reports/server-memcmp.md`](reports/server-memcmp.md)、[`reports/server-lifecycle-helpers.md`](reports/server-lifecycle-helpers.md)、[`reports/server-timeout-registry.md`](reports/server-timeout-registry.md)、[`reports/server-trig-kernels.md`](reports/server-trig-kernels.md)、[`reports/server-timeout-fire.md`](reports/server-timeout-fire.md)、[`reports/server-growth-factor.md`](reports/server-growth-factor.md)、[`reports/server-frexp.md`](reports/server-frexp.md)、[`reports/server-wide-shift.md`](reports/server-wide-shift.md)、[`reports/client-timeout-fire.md`](reports/client-timeout-fire.md)、[`reports/server-check-websockets.md`](reports/server-check-websockets.md)、[`reports/server-allocation.md`](reports/server-allocation.md)、[`reports/client-petal-tooltip.md`](reports/client-petal-tooltip.md)、[`reports/server-cosine-correction.md`](reports/server-cosine-correction.md)、[`reports/server-entity-definitions.md`](reports/server-entity-definitions.md)、[`reports/server-wide-shift.md`](reports/server-wide-shift.md)、[`reports/server-number-parse.md`](reports/server-number-parse.md)、[`reports/server-scan-utilities.md`](reports/server-scan-utilities.md)、[`reports/server-string-move.md`](reports/server-string-move.md)、[`reports/server-scalar-helpers.md`](reports/server-scalar-helpers.md)、[`reports/server-sine-offset.md`](reports/server-sine-offset.md)、[`reports/server-vector-helpers.md`](reports/server-vector-helpers.md)、[`reports/server-atan.md`](reports/server-atan.md)、[`reports/server-bump-allocator.md`](reports/server-bump-allocator.md)、[`reports/server-wide-multiply.md`](reports/server-wide-multiply.md)、[`reports/server-scalbn.md`](reports/server-scalbn.md)、[`reports/server-four-record-sort.md`](reports/server-four-record-sort.md)、[`reports/server-container-end.md`](reports/server-container-end.md)、[`reports/server-byte-move.md`](reports/server-byte-move.md)、[`reports/server-record-sort.md`](reports/server-record-sort.md)、[`reports/server-random-state.md`](reports/server-random-state.md)、[`reports/server-free-block.md`](reports/server-free-block.md)、[`reports/server-collision-filter.md`](reports/server-collision-filter.md)、[`reports/server-mbrtowc.md`](reports/server-mbrtowc.md)、[`reports/server-depth-comparator.md`](reports/server-depth-comparator.md)、[`reports/server-packed-key-sort.md`](reports/server-packed-key-sort.md)、[`reports/server-packed-key-sort-five.md`](reports/server-packed-key-sort-five.md)、[`reports/server-utf8-scan.md`](reports/server-utf8-scan.md)、[`reports/server-spawn-manager-192.md`](reports/server-spawn-manager-192.md)、[`reports/server-spawn-components.md`](reports/server-spawn-components.md)、[`reports/server-float-format-suffix.md`](reports/server-float-format-suffix.md)、[`reports/server-utf16-to-utf8.md`](reports/server-utf16-to-utf8.md)、[`reports/server-utf8-decode.md`](reports/server-utf8-decode.md)、[`reports/server-unicode-codecs.md`](reports/server-unicode-codecs.md)、[`reports/server-entity-flag-reset.md`](reports/server-entity-flag-reset.md)、[`reports/server-rem-pio2f.md`](reports/server-rem-pio2f.md)、[`reports/server-rem-pio2.md`](reports/server-rem-pio2.md)、[`reports/server-string-table-destruction.md`](reports/server-string-table-destruction.md)、[`reports/server-rem-pio2-large.md`](reports/server-rem-pio2-large.md)、[`reports/server-catalog-initializers.md`](reports/server-catalog-initializers.md)、[`reports/server-petal-factories.md`](reports/server-petal-factories.md)、[`reports/server-static-object-lifecycle.md`](reports/server-static-object-lifecycle.md)、[`reports/server-catalog-initializers-2.md`](reports/server-catalog-initializers-2.md)、[`reports/server-object-method-dispatch.md`](reports/server-object-method-dispatch.md)、[`reports/server-string-copy-constructor.md`](reports/server-string-copy-constructor.md)、[`reports/server-abi-leaf-helpers.md`](reports/server-abi-leaf-helpers.md)、[`reports/server-sequence-and-table-helpers.md`](reports/server-sequence-and-table-helpers.md)、[`reports/server-table-transcoders.md`](reports/server-table-transcoders.md)、[`reports/server-string-and-sequence-primitives.md`](reports/server-string-and-sequence-primitives.md)、[`reports/server-parser-and-rounding.md`](reports/server-parser-and-rounding.md)、[`reports/server-sort3-and-state-helpers.md`](reports/server-sort3-and-state-helpers.md)、[`reports/server-utf8-encode-codepoint.md`](reports/server-utf8-encode-codepoint.md)、[`reports/server-movable-record.md`](reports/server-movable-record.md)、[`reports/server-utf8-to-utf16.md`](reports/server-utf8-to-utf16.md)、[`reports/server-string-assignment-adapters.md`](reports/server-string-assignment-adapters.md)、[`reports/server-string-construction-wrapper.md`](reports/server-string-construction-wrapper.md)、[`reports/server-string-copy-assignment.md`](reports/server-string-copy-assignment.md)、[`reports/server-string-length-assignment.md`](reports/server-string-length-assignment.md)、[`reports/server-wide-float-compare.md`](reports/server-wide-float-compare.md)、[`reports/server-three-word-float-compare.md`](reports/server-three-word-float-compare.md)、[`reports/server-stream-transition.md`](reports/server-stream-transition.md)、[`reports/server-stream-putback.md`](reports/server-stream-putback.md)、[`reports/server-stream-seek.md`](reports/server-stream-seek.md)、[`reports/server-byte-range-compare.md`](reports/server-byte-range-compare.md)、[`reports/server-stream-write-byte.md`](reports/server-stream-write-byte.md)、[`reports/server-stream-buffer-primitives.md`](reports/server-stream-buffer-primitives.md)、[`reports/server-string-identity-equality.md`](reports/server-string-identity-equality.md)、[`reports/server-inline-storage.md`](reports/server-inline-storage.md)、[`reports/server-string-destructor.md`](reports/server-string-destructor.md)、[`reports/server-stream-read-word-record.md`](reports/server-stream-read-word-record.md)、[`reports/server-release-storage.md`](reports/server-release-storage.md)、[`reports/server-string-append.md`](reports/server-string-append.md)、[`reports/server-minus-string.md`](reports/server-minus-string.md)、[`reports/server-delete-guard.md`](reports/server-delete-guard.md)、[`reports/server-stream-write-word.md`](reports/server-stream-write-word.md)、[`reports/server-string-resize.md`](reports/server-string-resize.md)、[`reports/server-string-length-setter.md`](reports/server-string-length-setter.md)、[`reports/server-global-locale-cache.md`](reports/server-global-locale-cache.md)、[`reports/server-locale-facet-release.md`](reports/server-locale-facet-release.md)、[`reports/server-small-accessors.md`](reports/server-small-accessors.md)、[`reports/server-type-check.md`](reports/server-type-check.md)、[`reports/server-stream-state-primitives.md`](reports/server-stream-state-primitives.md)、[`reports/server-stream-status.md`](reports/server-stream-status.md)、[`reports/server-stream-status-equality.md`](reports/server-stream-status-equality.md)、[`reports/server-stream-block-write.md`](reports/server-stream-block-write.md)、[`reports/server-facet-write.md`](reports/server-facet-write.md)、[`reports/server-stream-handle-ops.md`](reports/server-stream-handle-ops.md)、[`reports/server-string-member-assign.md`](reports/server-string-member-assign.md)、[`reports/server-string-validate.md`](reports/server-string-validate.md)、[`reports/server-locale-facet-getters.md`](reports/server-locale-facet-getters.md)、[`reports/server-bool-string.md`](reports/server-bool-string.md)、[`reports/server-wide-bool-string.md`](reports/server-wide-bool-string.md)、[`reports/server-stream-flag-update.md`](reports/server-stream-flag-update.md)、[`reports/server-int64-parse-limits.md`](reports/server-int64-parse-limits.md)、[`reports/server-stream-read-char.md`](reports/server-stream-read-char.md)、[`reports/server-memory-fill.md`](reports/server-memory-fill.md)、[`reports/server-memory-copy.md`](reports/server-memory-copy.md)、[`reports/server-vtable-destructors.md`](reports/server-vtable-destructors.md)、[`reports/server-global-cleanup.md`](reports/server-global-cleanup.md)、[`reports/server-stream-get-char.md`](reports/server-stream-get-char.md)、[`reports/server-object-deleters.md`](reports/server-object-deleters.md)、[`reports/server-stream-write-copy.md`](reports/server-stream-write-copy.md)、[`reports/server-global-list-cleanup.md`](reports/server-global-list-cleanup.md)、[`reports/server-refcount-helpers.md`](reports/server-refcount-helpers.md)、[`reports/server-file-seek.md`](reports/server-file-seek.md)、[`reports/server-format-padding.md`](reports/server-format-padding.md)、[`reports/server-locale-callbacks.md`](reports/server-locale-callbacks.md)、[`reports/server-locale-callbacks-wide.md`](reports/server-locale-callbacks-wide.md)、[`reports/server-locale-object-lifetime.md`](reports/server-locale-object-lifetime.md)、[`reports/server-locale-wide-forward.md`](reports/server-locale-wide-forward.md)、[`reports/server-locale-delete.md`](reports/server-locale-delete.md)、[`reports/server-global-buffer-cleanup.md`](reports/server-global-buffer-cleanup.md)、[`reports/server-global-pointer-vector-cleanup.md`](reports/server-global-pointer-vector-cleanup.md)、[`reports/server-range-copy.md`](reports/server-range-copy.md)、[`reports/server-stream-read-line.md`](reports/server-stream-read-line.md)、[`reports/server-global-flag-reset.md`](reports/server-global-flag-reset.md)、[`reports/server-component-release.md`](reports/server-component-release.md)、[`reports/server-locale-stream-state.md`](reports/server-locale-stream-state.md)、[`reports/server-format-time.md`](reports/server-format-time.md)、[`reports/server-format-time-output.md`](reports/server-format-time-output.md)、[`reports/server-sort-four.md`](reports/server-sort-four.md)、[`reports/server-uint-to-long-double.md`](reports/server-uint-to-long-double.md)、[`reports/server-int-to-long-double.md`](reports/server-int-to-long-double.md)、[`reports/server-state-trap.md`](reports/server-state-trap.md)、[`reports/server-abort-helpers.md`](reports/server-abort-helpers.md)、[`reports/server-string-range-construct.md`](reports/server-string-range-construct.md)、[`reports/server-object-wrappers.md`](reports/server-object-wrappers.md)、[`reports/server-object-cleanup-chain.md`](reports/server-object-cleanup-chain.md)、[`reports/server-string-object-wrappers.md`](reports/server-string-object-wrappers.md)、[`reports/server-virtual-base-wrappers.md`](reports/server-virtual-base-wrappers.md)、[`reports/server-long-double-converters.md`](reports/server-long-double-converters.md)、[`reports/server-random-int.md`](reports/server-random-int.md)、[`reports/server-singleton-getters.md`](reports/server-singleton-getters.md)、[`reports/server-two-digit-year.md`](reports/server-two-digit-year.md)、[`reports/server-vector-object-destructor.md`](reports/server-vector-object-destructor.md)、[`reports/server-errno-category.md`](reports/server-errno-category.md)、[`reports/server-errno-parse-wrappers.md`](reports/server-errno-parse-wrappers.md)、[`reports/server-errno-more-wrappers.md`](reports/server-errno-more-wrappers.md)、[`reports/server-vector-at.md`](reports/server-vector-at.md)、[`reports/server-string-fill-construct.md`](reports/server-string-fill-construct.md)、[`reports/server-function-invoker.md`](reports/server-function-invoker.md)、[`reports/server-locale-facet-loop.md`](reports/server-locale-facet-loop.md)、[`reports/server-locale-facet-cleanup.md`](reports/server-locale-facet-cleanup.md)、[`reports/server-object-initializer.md`](reports/server-object-initializer.md)、[`reports/client-lifecycle-wrappers.md`](reports/client-lifecycle-wrappers.md)、[`reports/client-fixed-address-forwarders.md`](reports/client-fixed-address-forwarders.md)、[`reports/client-small-accessors.md`](reports/client-small-accessors.md)、[`reports/client-string-and-object-forwarders.md`](reports/client-string-and-object-forwarders.md)、[`reports/client-object-destructors.md`](reports/client-object-destructors.md)、[`reports/client-misc-tiny-wrappers.md`](reports/client-misc-tiny-wrappers.md)、[`reports/client-object-lifecycle-slots.md`](reports/client-object-lifecycle-slots.md)、[`reports/client-flag-and-field-helpers.md`](reports/client-flag-and-field-helpers.md)、[`reports/client-static-initializer-guards.md`](reports/client-static-initializer-guards.md)、[`reports/client-allocate-or-abort.md`](reports/client-allocate-or-abort.md)、[`reports/client-static-table-initializers.md`](reports/client-static-table-initializers.md)、[`reports/client-initializers-and-flags.md`](reports/client-initializers-and-flags.md)、[`reports/client-string-utils.md`](reports/client-string-utils.md)、[`reports/client-slot-allocators.md`](reports/client-slot-allocators.md)、[`reports/client-float-field-setters.md`](reports/client-float-field-setters.md)、[`reports/client-asm-const-wrappers.md`](reports/client-asm-const-wrappers.md)、[`reports/client-refcounted-string-destructors.md`](reports/client-refcounted-string-destructors.md)、[`reports/client-log-wrappers.md`](reports/client-log-wrappers.md)、[`reports/client-time-converters.md`](reports/client-time-converters.md)、[`reports/client-array-and-vtable-destructors.md`](reports/client-array-and-vtable-destructors.md)、[`reports/client-compact-destructors.md`](reports/client-compact-destructors.md)、[`reports/server-small-memory.md`](reports/server-small-memory.md)、[`reports/server-frame-wrappers.md`](reports/server-frame-wrappers.md)。下面保留归档版的使用说明。

把 `https://static.florr.io/old/`（M28 官方保留的 **Legacy Florr.io 静态快照**）完整搬到本地，
并且做到**断网可玩**：不用连任何服务器，打开网页就是完整的一局游戏。

> 这个版本是 2020–2022 年间的老 florr.io，官方把它以纯静态文件形式留在对象存储上，
> 本身就是做成本地 / 单机运行的。它的多人匹配服务（`api.n.m28.io` → `<region>.s.m28n.net`）
> 早已下线，所以"本地游玩"不是打补丁绕过验证，而是走它原本就有的单机路径。

---

## 快速开始

需要 Node.js 24+；源码构建还需要锁定依赖、支持 `--fresh` 的 CMake、C++20 编译器及 `.emscripten-version` 指定的 Emscripten。浏览器验收范围为 Chromium 桌面与触控模拟，环境步骤见 [`docs/environment.md`](docs/environment.md)。

```bash
npm ci
npm run build:dist-next
npm run verify:dist-next
node serve.mjs
```

旧交付树不能代表当前源码；构建和交付完整性检查也不能替代 `test:all:twice` 的最终验收。

### 仓库只跟踪源码

构建产物、录制结果和验收证据都已在 `.gitignore` 中忽略，且不在任何提交历史里；新克隆需要按需重新生成：

| 路径 | 生成方式 |
| --- | --- |
| `dist/`、`dist-readable/`、`dist-reference/` | `node tools/prepare-reference.mjs` 从 `reference/frozen-trees.tar.gz` 还原 |
| `client/public/` 下的 `*.js`、`*.d.ts`、`*.js.map`、`server.wasm` | `npm run build:client`、`npm run build:engine:wasm` |
| `dist-next/` | `npm run build:dist-next` |
| `build/`、`engine/build-*/` | `npm run build:engine` 等 CMake 构建 |
| `tests/parity/` 下的录制、截图与 `report.json` | `node tools/parity/run-scenario.mjs --all --update`、`npm run parity:client:update` 等，见 [`docs/parity.md`](docs/parity.md) |
| `legacy/reports/`、`reports/runs/` | 验收运行（`npm run test:all`）时写入 |

`client/public/index.html`、`client/public/server-worker.js` 与 `client/public/fonts/` 是手写源码，仍然被跟踪。

默认运行 `dist-next`（纯 C++/TS 交付树）。浏览器会自动打开
`http://127.0.0.1:8477/`。要回滚到冻结的 oracle 树用
`node serve.mjs --reference`。等画面出现主菜单后：

1. 输入昵称（可选）
2. **按回车**进入花园
3. 鼠标移动角色，左键攻击，右键防御

常用参数：

```bash
node serve.mjs --port 9000     # 换端口
node serve.mjs --no-open       # 不自动开浏览器
node serve.mjs --host 0.0.0.0  # 允许局域网访问（注意：等于把这台机器的这个端口开放出去）
```

> **必须通过 HTTP 访问。** 直接双击 `index.html` 用 `file://` 打开不行 ——
> 浏览器会以安全策略拒绝加载 Web Worker 和 wasm。

---

## 冻结参考版的运行机制（历史/参考范围）

这套客户端是 Emscripten 编译的 C++ 程序，**服务端和客户端都在同一个 CDN 上**：

| 文件 | 作用 |
| --- | --- |
| `client.js` + `client.wasm` | 客户端：渲染、输入、UI，题目里的"游戏本体" |
| `sp_server.js` + `sp_server.wasm` | **服务端模拟核心**，被编译成一个 Web Worker |

启动流程（这也是为什么它能单机玩）：

1. `index.html` 注入 `client.js`，`client.wasm` 加载并进入 `main()`
2. 客户端判断 **当前主机名是不是 `localhost`**
3. 是 → `new Worker("sp_server.js")`，在浏览器里把整局游戏的服务端拉起来，网络流量走 worker 消息（**不经过任何 socket**）
4. 否 → 走 m28n 匹配服务找线上服务器（该服务已下线，会一直卡在 Loading）

也就是说"网络"被抽象成了 `MultiStream`，单机模式下底层是 worker 消息而不是 WebSocket。
这是官方为开发和演示留的后门，我们只是把它变成了默认行为。

---

## 本地版相对原站做了什么改动

原始文件**一字未改**地保存在 `upstream/`；`web/` 是本地可玩版。改动一共六处，都很小：

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `index.html` | `<base href="//static.florr.io/old/">` → `"./"` | 否则所有资源仍从线上拉，不叫本地化 |
| `index.html` | 移除页尾的 Cloudflare 挑战脚本 | 离线环境无意义，且会去请求 `cdn-cgi` |
| `index.html` | Google Fonts `<link>` → 本地 `fonts/ubuntu.css` | 去掉最后一个外部依赖 |
| `index.html` | 移除被 iframe 嵌套时 `location = https://florr.io/` 的拦截 | 原逻辑是线上站点防点击劫持用的；去掉后可以在预览面板 / 仪表盘里直接嵌着玩，也避免本地页面被误导航到线上站点 |
| `client.js` | 一处：`133686: function(){return da(location.hostname)}` → `da("localhost")` | 解除"只有主机名为 localhost 才启动本地服务端"的限制，`127.0.0.1` 或局域网 IP 也能玩 |
| `manifest.json` | 图标路径去掉开头的 `/` | 原路径指向域名根目录，子目录部署会 404 |

如果你想要**零改动**的版本，`upstream/` 里的文件直接丢进静态服务器、
并且用 `http://localhost:端口/` 访问，也能玩 —— 只是必须叫 `localhost`。

---

## 目录结构

```
.
├── web/                     # 本地可玩版（用这个）
│   ├── index.html           # 入口（已本地化）
│   ├── client.js/.wasm      # 客户端
│   ├── sp_server.js/.wasm   # 本地服务端（Web Worker）
│   ├── debug.html           # 诊断页：带网络/Worker 钩子，见下
│   ├── debug-hooks.js
│   ├── fonts/               # Ubuntu 700（原页面从 Google Fonts 取，已本地化）
│   ├── manifest.json
│   └── favicon* / *-chrome-*.png / apple-touch-icon.png
├── upstream/                # 原站 1:1 快照，未做任何修改（用于对照 / 重新生成）
├── tools/
│   └── fetch-upstream.sh    # 重新抓取 upstream/
├── serve.mjs                # 本地静态服务器（零依赖）
└── README.md
```

---

## 上游来源与校验

抓取自 `https://static.florr.io/old/`（`last-modified: 2026-08-30`）。
仓库不做自动同步，重新抓取用：

```bash
bash tools/fetch-upstream.sh          # 写入 upstream/
```

核心文件的 SHA-256（`upstream/` 中）：

```
11fff64e396475904bd0061af999b9444a5397a4b6cb56774f0d1077541c38e7  index.html
1972a6370fe9676a94ec42a10e2686346c42af6ce035c2bfc2040366b5f5eec7  client.js
c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1  client.wasm
8707e432f0fabae308f8006c934e3370f50f19085552edffe8fd7f9587200989  sp_server.js
75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d  sp_server.wasm
```

历史上游抓取快照记录为 12 个文件、约 2.5 MB；当前冻结树/交付树的清单与大小应查各自 manifest，不能使用这组历史数字。**没有隐藏的外部资源**：贴图、音效、文案全部内嵌在
`client.wasm` 里，所以镜像只有这一份，不存在"还有几个文件没下下来"的情况。

> 关于 `index.html` 的校验值：站点的其余文件每次抓取都字节一致，
> 但 `index.html` **不稳定** —— Cloudflare 每次响应都会把页尾那段挑战脚本里的
> `r` / `t` 两个值重写一遍，导致内容与长度都变（实测 5,587 B / 5,948 B）。
> 上面的 sha256 对应仓库里 `upstream/index.html` 这一份归档快照，重新抓取必然不同，
> 这是正常的，不是抓漏了。

### 字体

`web/fonts/` 里的 Ubuntu 700 是原页面 Google Fonts 那份的子集化 woff2，
按 Unicode 区段拆成 6 个文件（latin / latin-ext / greek / greek-ext / cyrillic / cyrillic-ext）。
授权为 Ubuntu Font License，可自由再分发。

---

## 排错

**卡在 "Loading..." 不动**
先确认地址栏是 `http://…` 而不是 `file://`。再打开 `http://127.0.0.1:8477/debug.html`，
它会给 Worker / XHR / fetch 装上钩子，控制台里看 `window.__florrProbe`：

```js
window.__florrProbe.summary
// {
//   hostname: "127.0.0.1",
//   workerSpawned: true,       // 本地服务端有没有拉起来
//   externalRequests: [],      // 应为空 —— 说明确实没联外网
//   offlineClean: true
// }
```

`workerSpawned: false` 基本就是 `client.js` 没打上那个补丁（或者你用的 `upstream/` 版本
但主机名不叫 `localhost`）。

**画面黑屏 / 花屏**
确认浏览器开启了硬件加速。冻结参考客户端走 WebGL；`dist-next` 的 TypeScript 客户端走 Canvas2D。

**键盘不响应**
先用鼠标点一下画面，让 canvas 拿到焦点。

**卡顿**
本地服务端跑在一个 Web Worker 里，和渲染共享 CPU 资源。
老机器上把浏览器窗口调小一点会明显好转。

---

## 已知限制

- **没有多人联机。** 线上匹配服务已下线，本地版只有你自己（和地图里的怪）。
- 存档写在浏览器 `localStorage`，换浏览器 / 清缓存就没了。
- 原站的部分按钮（Discord / Reddit）会尝试打开外链，点了就跳走。
- `web/debug.html` 与 `web/debug-hooks.js` 是本仓库新增的调试工具，原站没有。

## 环境与浏览器矩阵

本地环境为 Node 24、Chrome 156、macOS arm64；CI 使用 Ubuntu 24.04、Node 24 与 `.chromium-version` 固定的同版 Chrome for Testing，验收会拒绝版本不符的浏览器。
支持范围为 **Chromium-only**（桌面 + 390×844/DPR3 触控模拟）；production 另覆盖 desktop/retina/touch 三 profile × 八场景共 24 个录制，touch 使用移动 UA 激活 `mobileUi`。
原版 oracle 重放固定 UA，production touch 使用独立 Android/Mobile UA。生产集成通过不能代替原版像素/命令等价；Firefox/WebKit/真机为非目标。详见 [docs/environment.md](docs/environment.md)。
