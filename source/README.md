# 还原源码与构建入口

这个目录包含当前单机游戏的完整、可重建源码表示、实际执行的增量高层实现，以及辅助阅读的反编译视图。
**完整重建已经实现；所有内部函数的高层语义还原仍未完成。**
WASM 中没有 C++ 调试符号，不能据此声称找回了原作者的类名、变量名或原始 C++ 工程。

## 运行源码构建版

在项目根目录执行：

```sh
npm ci --ignore-scripts
npm run build
node serve.mjs --root dist --no-open
```

访问 `http://127.0.0.1:8477/`，按回车进入游戏。`npm start` 也会运行 `dist/`。
安装依赖需要联网；依赖已安装后，构建和游戏均可离线运行。

构建只读取本目录的 `assets/`、`javascript/`、`wasm/*.wat`，以及包含参考哈希的
`reports/wasm/manifest.json`、函数索引、`game/`、`runtime/` 和其使用的 `semantic/` 模块。
**不会读取或复制原始 `.wasm` 或混淆 JS**。
默认构建结果在 `dist/`，其中 877 个原 WASM 函数体被移除，实际改为执行恢复后的高层 JS。
其余函数暂时保留机器级实现；高层调用点、共享内存、栈和函数表均由运行适配层连接。
`test/source-build.test.mjs` 在完全没有 `web/` 和 `upstream/` 的临时目录中实际验证这一点。
修改源码后也可以构建，构建报告会如实显示是否仍与参考二进制一致。

需要原始指令逐字节重建的参考版时，执行 `npm run build:reference`，输出 `dist-reference/`。
该版本的两个 WASM 与归档完全相同。默认高层构建会改变 WASM 字节，等价性依据对应函数的
差分测试和实际游戏回归，不能再以默认产物的二进制相同作为证明。

## 阅读顺序

| 目录或文件 | 内容 | 是否参与游戏构建 |
| --- | --- | --- |
| `javascript/client.js` | 客户端 JS：浏览器接口、画布、输入、存储、Worker、Emscripten 运行时 | 是 |
| `javascript/sp_server.js` | 单机 Worker 的启动、消息分发、内存和运行时桥接 | 是 |
| `game/server/petals.mjs` | 44 个花瓣初始化、轨道、发射、治疗和状态效果函数 | 是，实际替代原函数体 |
| `game/server/entities.mjs` | 26 个实体初始化、定义构造、治疗与家族参数函数 | 是，实际替代原函数体 |
| `game/server/output.mjs` | 服务端 main 与输出队列 | 是，实际替代原函数体 |
| `game/server/petals-special.mjs` | 23 个 Peas 分裂/闭包、Egg 孵化、Web 生成与中毒回调 | 是，实际替代原函数体 |
| `game/server/combat.mjs` | 11 个血量/半径追踪、碰撞边界、目标与怪物家族参数函数 | 是，实际替代原函数体 |
| `game/server/petal-factories.mjs` | 全部 34 个花瓣工厂及完整类型初始化函数 | 是，实际替代原函数体 |
| `game/server/petal-lifecycle.mjs` | 7 个共享虚函数、轨道索引与槽位登记函数；花瓣 57 个不同虚函数已全部覆盖 | 是，实际替代原函数体 |
| `game/server/damage.mjs` | 完整伤害、反伤、死亡、保留/掉落与击杀归属函数 | 是，实际替代原函数体 |
| `game/server/transforms.mjs` | 5 个父子坐标、失效传播、坐标/角度复制追踪函数 | 是，实际替代原函数体 |
| `game/server/ownership.mjs` | 4 个归属链表、实体引用序列化与组件登记函数 | 是，实际替代原函数体 |
| `game/server/spatial-ai.mjs` | 3 个附近仇恨、目标选择与拾取对象四叉树查询 | 是，实际替代原函数体 |
| `game/server/effects.mjs` | 6 个效果寿命/替换与延迟回调池、移动和交换函数 | 是，实际替代原函数体 |
| `game/server/simulation.mjs` | 10 个生成补充、约束、实体清理、消息和字段追踪辅助 | 是，实际替代原函数体 |
| `game/server/simulation-tick.mjs` | 完整主循环 654，按模拟、效果、AI、移动、碰撞、可见性和快照阶段组织 | 是，实际替代原函数体 |
| `game/server/components.mjs` | 13 个组件池、登记、行为配置与人口生成服务 | 是，实际替代原函数体 |
| `game/server/clock.mjs` | 3 个时钟及静态初始化保护函数 | 是，实际替代原函数体 |
| `game/server/initialization.mjs` | 完整世界初始化、实体池、目录、会话与握手入口 656 | 是，实际替代原函数体 |
| `game/server/input.mjs` | 完整输入入口 655 及 varint 读取器 388；生成玩家、按钮、背包和连接命令 | 是，实际替代原函数体 |
| `game/server/loadout.mjs` | 2 个装备/背包类型变更与实际花瓣实例创建函数 | 是，实际替代原函数体 |
| `game/client/transport.mjs` | 14 个客户端解压、传输、输入和浏览器桥接函数 | 是，实际替代原函数体 |
| `game/client/snapshots.mjs` | 11 个实际单人帧、Worker 快照队列、事件与缓存清理函数 | 是，实际替代原函数体 |
| `game/client/snapshot-decoder.mjs` | 3 个组件声明、对象池与完整事件解析函数 | 是，实际替代原函数体 |
| `game/client/entity-snapshot.mjs` | 完整实体快照解析 1015；63 字段、dense 组件、实体/引用/可靠队列及事件 | 是，实际替代原函数体 |
| `game/client/frame.mjs` | 完整可靠输入序列化 762 | 是，实际替代原函数体 |
| `game/client/render-frame.mjs` | 完整更新与主绘制 763，含输入、相机、索引、网格、血条、名称、事件动画和排序阶段 | 是，实际替代原函数体 |
| `game/client/clock.mjs` | 时钟、帧时钟覆盖、进程起点差值及静态初始化锁 369/370/372/554 | 是，实际替代原函数体 |
| `game/client/transforms.mjs` | 完整坐标与角度插值、父子变换、拥有者哈希范围和聚合可视边界 409/672/705 | 是，实际替代原函数体 |
| `game/client/drawing-primitives.mjs` | 矩形、路径填充/描边、局部图像、地图分区边界和 f32 舍入 395/410/455/562/588/631/1131 | 是，实际替代原函数体 |
| `game/client/text.mjs` | 字符串更新、文本测量与栅格缓存、文字绘制、画布创建/缩放与生命周期，含区间替换扩容与左对齐标签，共 16 个完整函数 | 是，实际替代原函数体 |
| `game/client/entity-renderer.mjs` | 完整实体绘制 760，含视口裁剪、变换、递归子实体、淡出/受击效果及 16 个组件分派分支 | 是，实际替代原函数体 |
| `game/client/runtime-primitives.mjs` | 完整内存复制、逐字节比较和 f64 舍入 363/366/373 | 是，实际替代原函数体 |
| `game/client/player-appearance.mjs` | 完整玩家外观 1100，含攻防/表情平滑、模型、装饰、眼睛和嘴部调度 | 是，实际替代原函数体 |
| `game/client/component-132-renderer.mjs` | 完整组件132绘制 1040，含独立采样色板、椭圆/裁剪条纹和曲线 | 是，实际替代原函数体 |
| `game/client/component-148-renderer.mjs` | 完整组件148绘制 1044，含三套闪色、裁剪条纹和两侧曲线/端点 | 是，实际替代原函数体 |
| `game/client/math.mjs` | 完整 f64 幂 375 与二进制指数缩放 511，保留原 IEEE 位模式和特殊值语义 | 是，实际替代原函数体 |
| `game/client/component-128-renderer.mjs` | 完整实体槽128绘制 1045 与存储路径填充 481，含曲线、裁剪条纹和描边 | 是，实际替代原函数体 |
| `game/client/components-64-80-renderer.mjs` | 完整组件64动画曲线 1038 与组件80矩形 1039 | 是，实际替代原函数体 |
| `game/client/eye-renderer.mjs` | 完整眼睛绘制 690，含注视变换、椭圆和共享暂存帧 | 是，实际替代原函数体 |
| `game/client/trig.mjs` | 完整 f32 正弦/余弦核 486/487、范围归约 929 及入口 427/431，保留 NaN、栈帧和陷阱语义；仅超大参数归约 930 保留原生 | 是，实际替代原函数体 |
| `game/client/double-trig.mjs` | 完整 f64 正弦/余弦核 593/594、范围归约 931 及入口 403/407，保留精确舍入、NaN 和第三阶段截断常量；仅超大参数归约 930 保留原生 | 是，实际替代原函数体 |
| `game/client/memory-fill.mjs` | 完整 libc 填充 382 及其参数换序包装 865，保留加宽阈值、对齐、32/64 位写入顺序和越界陷阱 | 是，实际替代原函数体 |
| `game/client/entity-definition.mjs` | 完整实体目录初始化 391 与记录写入 441，含 23 条原始记录、一次性保护状态机和复制路径尾字段 | 是，实际替代原函数体 |
| `game/client/entity-record.mjs` | 116 字节实体记录的移动构造 618，含两组内联数组、重叠复制顺序、条件重读、自移动和越界陷阱 | 是，实际替代原函数体 |
| `game/client/leaf-functions.mjs` | 74 个无调用、无分支的直线叶函数：常量、参数转发、访问器、虚表写入、栈指针和固定偏移读写 | 是，实际替代原函数体 |
| `game/client/straight-line.mjs` | 9 个无调用、无分支的直线小函数：配对构造、qword 位打包、选择、组件寻址、栈对齐和链表拼接 | 是，实际替代原函数体 |
| `game/client/composed.mjs` | 5 个依赖已恢复的组合函数：短字符串初始化、缓冲区尾部复制、时钟快照、条件时钟读取和时差 | 是，实际替代原函数体 |
| `game/client/conditionals.mjs` | 13 个单分支小函数：描述符初始化、表查找、无符号最小值、游标更新、哈希更新和条件清零 | 是，实际替代原函数体 |
| `game/client/wide-math.mjs` | 3 个 128 位整数函数：低 128 位乘法、左移和逻辑右移 | 是，实际替代原函数体 |
| `game/client/ranges.mjs` | 10 个区间/字符串函数：复制、反转、宽字符串长度、十进制定位和字节扩展 | 是，实际替代原函数体 |
| `game/client/predicates.mjs` | 10 个谓词/扫描函数：标签解码、线性扫描、组件判等、全局计数和文本标志 | 是，实际替代原函数体 |
| `game/client/materials.mjs` | 13 个材质/哈希函数：6 个材质工厂、4 个表映射、2 个哈希填充和 1 个单例谓词 | 是，实际替代原函数体 |
| `game/client/buffers.mjs` | 9 个缓冲区函数：字符串比较/末尾指针、宽度存储、字符类扫描和哈希累加 | 是，实际替代原函数体 |
| `game/client/records.mjs` | 7 个记录/数值函数：空闲链表、一次性注册、状态迁移、PRNG、掩码异或、流重置和数组比较 | 是，实际替代原函数体 |
| `game/client/shifts.mjs` | 2 个 64 位移位函数：低位/高位对的左移和右移 | 是，实际替代原函数体 |
| `game/client/wrappers.mjs` | 5 个依赖包装函数：组件清零/比较、128 位扩展、全局交换和记录数组移位 | 是，实际替代原函数体 |
| `game/client/text-support.mjs` | 8 个文本/流支持函数：字符串长度、数字解析、有界比较、下界查找、全局清零和流位置 | 是，实际替代原函数体 |
| `game/client/number-format.mjs` | 7 个数字格式与记录函数：饱和缩放、向量重置、像素格式、u64 十进制、前缀格式化、解析状态和记录比较 | 是，实际替代原函数体 |
| `game/client/scan-format.mjs` | 8 个扫描与流函数：大小写比较、回退、有界扫描、矩形钳制、浮点后缀、全局清零和通道解包 | 是，实际替代原函数体 |
| `game/client/config-io.mjs` | 9 个配置读取函数：组件状态、比较后移动/更新、十进制默认值、字面量分类、选项钳制、扫描追加和状态交换 | 是，实际替代原函数体 |
| `game/client/float-array.mjs` | 4 个浮点与数组函数：128 位整数/浮点扩展、指针插入排序和解析器回退 | 是，实际替代原函数体 |
| `game/client/channel-pack.mjs` | 5 个调色板与通道函数：RGB565 打包、16/32 位调色板查表 | 是，实际替代原函数体 |
| `game/client/bitmap-decode.mjs` | 10 个位图与编码函数：稀疏清零、六种一位行解码、最近颜色和 UTF-8 写入 | 是，实际替代原函数体 |
| `game/client/row-blit.mjs` | 8 个带通道缩放和不同输出字节序的行复制函数 | 是，实际替代原函数体 |
| `game/client/pixel-convert.mjs` | 1 个三表掩码像素转换函数 | 是，实际替代原函数体 |
| `game/client/alpha-blit.mjs` | 2 个带 alpha 写入和通道缩放的行复制函数 | 是，实际替代原函数体 |
| `game/client/window-check.mjs` | 1 个五窗口打包有效性判断函数 | 是，实际替代原函数体 |
| `game/client/channel-blit.mjs` | 4 个带第四通道高字节缩放的行复制函数 | 是，实际替代原函数体 |
| `game/client/object-constructor.mjs` | 1 个固定布局复制并重连链表的构造函数 | 是，实际替代原函数体 |
| `game/client/affine-sampler.mjs` | 10 个 16.16 定点仿射纹理采样与通道转换函数 | 是，实际替代原函数体 |
| `game/client/atanf.mjs` | 1 个单精度反正切函数 | 是，实际替代原函数体 |
| `game/client/atan.mjs` | 1 个双精度反正切函数 | 是，实际替代原函数体 |
| `game/client/soft-compare.mjs` | 2 个 128 位 soft-float 比较辅助函数 | 是，实际替代原函数体 |
| `game/client/blend-blit.mjs` | 4 个合成混合 blitter | 是，实际替代原函数体 |
| `game/client/utf8-decode.mjs` | 1 个 UTF-8 码点解码器 | 是，实际替代原函数体 |
| `game/client/pixel-channel-extract.mjs` | 1 个打包像素通道提取器 | 是，实际替代原函数体 |
| `game/client/pixel-write-modes.mjs` | 1 个多模式打包像素写入器 | 是，实际替代原函数体 |
| `game/client/rgb565-write-modes.mjs` | 1 个多模式 RGB565 像素写入器 | 是，实际替代原函数体 |
| `game/client/rgb555-write-modes.mjs` | 1 个多模式 RGB555 像素写入器 | 是，实际替代原函数体 |
| `game/client/rgba8888-write-modes.mjs` | 1 个多模式 RGBA8888 像素写入器 | 是，实际替代原函数体 |
| `game/client/particle-record.mjs` | 2 个粒子路径记录追加函数 | 是，实际替代原函数体 |
| `game/client/utf8-advance.mjs` | 2 个 UTF-8 跨度校验函数 | 是，实际替代原函数体 |
| `game/client/mb-to-wc.mjs` | 1 个多字节到宽字符转换函数 | 是，实际替代原函数体 |
| `game/client/row-channel-blend.mjs` | 2 个行通道混合函数 | 是，实际替代原函数体 |
| `game/client/scaled-channel-blit.mjs` | 1 个缩放通道位块函数 | 是，实际替代原函数体 |
| `game/client/vtable-constructors.mjs` | 47 个 vtable 构造函数 | 是，实际替代原函数体 |
| `game/client/global-destructors.mjs` | 26 个全局析构函数 | 是，实际替代原函数体 |
| `game/client/frexp.mjs` | frexp 浮点分解 | 是，实际替代原函数体 |
| `game/client/random-angle.mjs` | 8 个 Park–Miller 随机角生成器 | 是，实际替代原函数体 |
| `game/server/string-utilities.mjs` | 服务端 strlen 与字节区间反转 | 是，实际替代原函数体 |
| `game/client/allocate-zeroed-array.mjs` | 零初始化数组分配 | 是，实际替代原函数体 |
| `game/server/memcmp.mjs` | 服务端 memcmp | 是，实际替代原函数体 |
| `game/server/lifecycle-helpers.mjs` | 服务端默认谓词与名称析构 | 是，实际替代原函数体 |
| `game/server/timeout-registry.mjs` | 服务端超时注册表关闭清理 | 是，实际替代原函数体 |
| `game/server/trig-kernels.mjs` | 服务端正弦/余弦核 | 是，实际替代原函数体 |
| `game/server/timeout-fire.mjs` | 服务端定时器触发 | 是，实际替代原函数体 |
| `game/server/growth-factor.mjs` | 服务端 1.06 整数幂成长因子 | 是，实际替代原函数体 |
| `game/server/frexp.mjs` | 服务端 IEEE-754 frexp | 是，实际替代原函数体 |
| `game/server/wide-shift.mjs` | 服务端 128 位左/右移 | 是，实际替代原函数体 |
| `game/client/timeout-fire.mjs` | 客户端定时器触发 | 是，实际替代原函数体 |
| `game/server/check-websockets.mjs` | 服务端 WebSocket 事件泵 | 是，实际替代原函数体 |
| `game/server/allocation.mjs` | 服务端指针数组分配 | 是，实际替代原函数体 |
| `game/client/petal-tooltip.mjs` | 客户端花瓣提示框 | 是，实际替代原函数体 |
| `game/server/cosine-correction.mjs` | 服务端余弦修正核 | 是，实际替代原函数体 |
| `game/server/entity-definitions.mjs` | 服务端 23 槽实体目录 | 是，实际替代原函数体 |
| `game/server/number-parse.mjs` | 服务端数字进制选择 | 是，实际替代原函数体 |
| `game/server/scan-utilities.mjs` | 服务端扫描工具 | 是，实际替代原函数体 |
| `game/server/string-move.mjs` | 服务端字符串移动赋值 | 是，实际替代原函数体 |
| `game/server/scalar-helpers.mjs` | 服务端标量助手 | 是，实际替代原函数体 |
| `game/server/sine-offset.mjs` | 服务端正弦偏移核 | 是，实际替代原函数体 |
| `game/server/vector-helpers.mjs` | 服务端向量追加 | 是，实际替代原函数体 |
| `game/server/atan.mjs` | 服务端反正切 | 是，实际替代原函数体 |
| `game/server/bump-allocator.mjs` | 服务端 bump 分配 | 是，实际替代原函数体 |
| `game/server/wide-multiply.mjs` | 服务端 128 位乘法 | 是，实际替代原函数体 |
| `game/server/scalbn.mjs` | 服务端指数缩放 | 是，实际替代原函数体 |
| `game/server/four-record-sort.mjs` | 服务端四记录排序 | 是，实际替代原函数体 |
| `game/server/container-end.mjs` | 容器末尾指针 | 是，实际替代原函数体 |
| `game/server/byte-move.mjs` | 重叠安全字节移动 | 是，实际替代原函数体 |
| `game/server/record-sort.mjs` | 记录插入排序 | 是，实际替代原函数体 |
| `game/server/random-state.mjs` | 312 字随机生成器 | 是，实际替代原函数体 |
| `game/server/free-block.mjs` | dlmalloc 块释放 | 是，实际替代原函数体 |
| `game/server/collision-filter.mjs` | 碰撞层过滤 | 是，实际替代原函数体 |
| `game/server/mbrtowc.mjs` | 多字节转换 | 是，实际替代原函数体 |
| `game/server/depth-comparator.mjs` | 三槽深度排序 | 是，实际替代原函数体 |
| `game/server/packed-key-sort.mjs` | 四键打包排序 | 是，实际替代原函数体 |
| `game/server/packed-key-sort-five.mjs` | 五键打包排序 | 是，实际替代原函数体 |
| `game/server/utf8-scan.mjs` | UTF-8 序列扫描 | 是，实际替代原函数体 |
| `game/server/spawn-manager-192.mjs` | 实体记录分配与发布 | 是，实际替代原函数体 |
| `game/server/spawn-components.mjs` | 实体字符串与句柄发布 | 是，实际替代原函数体 |
| `game/server/float-format-suffix.mjs` | 浮点格式规格后缀 | 是，实际替代原函数体 |
| `game/server/utf16-to-utf8.mjs` | UTF-16 到 UTF-8 转码 | 是，实际替代原函数体 |
| `game/server/utf8-decode.mjs` | UTF-8 码点计数 | 是，实际替代原函数体 |
| `game/server/unicode-codecs.mjs` | UTF-8↔UTF-32 | 是，实际替代原函数体 |
| `game/server/entity-flag-reset.mjs` | 实体定义标志清零 | 是，实际替代原函数体 |
| `game/server/rem-pio2f.mjs` | 单精度 rem_pio2f | 是，依赖原生 285 |
| `game/server/rem-pio2.mjs` | 双精度 rem_pio2 | 是，依赖原生 285 |
| `game/server/string-table-destruction.mjs` | 静态字符串表析构 | 是，依赖原生 19 |
| `game/server/rem-pio2-large.mjs` | Payne–Hanek __rem_pio2_large | 是，依赖已恢复 107 |
| `game/server/catalog-initializers.mjs` | 惰性字符串目录初始化 | 是，依赖原生 24/27/31/32 |
| `game/server/petal-factories.mjs` | 花瓣行为工厂 | 是，依赖原生 20 |
| `game/server/static-object-lifecycle.mjs` | 静态对象析构/惰性初始化 | 是，依赖原生 31/32/37/131 |
| `game/server/catalog-initializers-2.mjs` | 惰性字符串目录初始化（28） | 是，依赖原生 24/28/31/32 |
| `game/server/object-method-dispatch.mjs` | 虚方法分派 | 否，使用类型化间接调用 |
| `game/server/string-copy-constructor.mjs` | libc++ 字符串拷贝构造 | 是，依赖原生 58/112 |
| `game/server/abi-leaf-helpers.mjs` | ABI 叶子辅助（常量/访问器） | 否，无调用 |
| `game/server/sequence-and-table-helpers.mjs` | 序列/查表辅助 | 否，无调用 |
| `game/server/table-transcoders.mjs` | 表转码/扫描辅助 | 否，无调用 |
| `game/server/string-and-sequence-primitives.mjs` | 字符串/序列原语 | 否，无调用 |
| `game/server/parser-and-rounding.mjs` | 数值前缀/格式/roundf | 否，无调用 |
| `game/server/sort3-and-state-helpers.mjs` | 三数排序/十进制/流状态 | 否，无调用 |
| `game/server/utf8-encode-codepoint.mjs` | UTF-8 码点编码 | 否，无调用 |
| `game/server/movable-record.mjs` | 可移动记录构造 | 否，无调用 |
| `game/server/utf8-to-utf16.mjs` | UTF-8 → UTF-16 解码 | 否，无调用 |
| `game/server/string-assignment-adapters.mjs` | 字符串构造/赋值适配 | 是（200/228） |
| `game/server/string-construction-wrapper.mjs` | C 字符串构造/空安全 UTF-8 | 是（204/124） |
| `game/server/string-copy-assignment.mjs` | 字符串拷贝赋值 | 是（269） |
| `game/server/string-length-assignment.mjs` | 带长度字符串赋值 | 是（20/58/75） |
| `game/server/wide-float-compare.mjs` | 双字浮点比较 | 否，无调用 |
| `game/server/three-word-float-compare.mjs` | 三字浮点比较 | 否，无调用 |
| `game/server/stream-transition.mjs` | 流令牌状态转换 | 否，无调用 |
| `game/server/stream-putback.mjs` | 流字节回退 | 否，无调用 |
| `game/server/stream-seek.mjs` | 流定位 | 否，无调用 |
| `game/server/byte-range-compare.mjs` | 有符号字节区间比较 | 否，无调用 |
| `game/server/stream-write-byte.mjs` | 流字节写入 | 是（365） |
| `game/server/stream-buffer-primitives.mjs` | 流缓冲窥视/读写原语（41、361、365、366） | 间接调用 |
| `game/server/string-identity-equality.mjs` | 字符串身份/内容相等 | 是（126） |
| `game/server/inline-storage.mjs` | 内联存储选择 | 是（121） |
| `game/server/string-destructor.mjs` | 字符串析构 | 是（355） |
| `game/server/stream-read-word-record.mjs` | 读字到结果记录 | 是（361） |
| `game/server/release-storage.mjs` | 存储释放 | 是（355） |
| `game/server/string-append.mjs` | 字符串追加 | 是（75、173） |
| `game/server/minus-string.mjs` | 单字符短串初始化 | 否，无调用 |
| `game/server/delete-guard.mjs` | 带哨兵删除 | 是（14） |
| `game/server/stream-write-word.mjs` | 流字写入 | 间接调用 |
| `game/server/string-resize.mjs` | 字符串调整长度 | 是（227、325） |
| `game/server/string-length-setter.mjs` | 字符串长度设置转发 | 是（387） |
| `game/server/global-locale-cache.mjs` | 全局 locale 缓存 | 是（33） |
| `game/server/locale-facet-release.mjs` | locale facet 释放/销毁 | 是（33、355、14） |
| `game/server/small-accessors.mjs` | 字段/常量小访问器 | 否，无调用 |
| `game/server/type-check.mjs` | 嵌套类型判定 | 否，无调用 |
| `game/server/stream-state-primitives.mjs` | 流状态复位与窥视 | 否，无调用 |
| `game/server/stream-status.mjs` | 流状态探测 | 间接调用 |
| `game/server/stream-status-equality.mjs` | 流状态相等 | 是（362、367） |
| `game/server/stream-block-write.mjs` | 流块写入/元素写入 | 是（430、274） |
| `game/server/facet-write.mjs` | facet 写入适配 | 是（274） |
| `game/server/stream-handle-ops.mjs` | 句柄推进/状态不等 | 是（361、366、363、368） |
| `game/server/string-member-assign.mjs` | 字符串成员赋值 | 是（228） |
| `game/server/string-validate.mjs` | 可选字符串校验 | 是（295） |
| `game/server/locale-facet-getters.mjs` | locale facet 获取 | 是（92） |
| `game/server/bool-string.mjs` | 布尔字符串写入 | 是（123） |
| `game/server/wide-bool-string.mjs` | 宽布尔字符串写入 | 是（131） |
| `game/server/stream-flag-update.mjs` | 流标志更新 | 是（386） |
| `game/server/int64-parse-limits.mjs` | int64 解析限值 | 是（373） |
| `game/server/stream-read-char.mjs` | 字符读取 | 是（366） |
| `game/server/memory-fill.mjs` | 内存填充 | 否，无调用 |
| `game/server/memory-copy.mjs` | 内存复制/清零 | 否，无调用 |
| `game/server/vtable-destructors.mjs` | vtable 析构 | 是（14、19） |
| `game/server/global-cleanup.mjs` | 全局缓冲/描述符清理 | 是（14、10） |
| `game/server/stream-get-char.mjs` | 虚拟字符获取 | 间接调用 |
| `game/server/object-deleters.mjs` | 删除析构器 | 是（292、299、300、14） |
| `game/server/stream-write-copy.mjs` | 流缓冲复制写入 | 否，无调用 |
| `game/server/global-list-cleanup.mjs` | 全局链表清理 | 是（14） |
| `game/server/refcount-helpers.mjs` | 引用计数/指针移动 | 间接调用 |
| `game/server/file-seek.mjs` | 文件定位 | 是（11） |
| `game/server/format-padding.mjs` | 格式化填充 | 是（51） |
| `game/server/locale-callbacks.mjs` | locale 回调派发 | 是（69、221） |
| `game/server/locale-callbacks-wide.mjs` | 宽 locale 回调派发 | 是（69、222） |
| `game/server/locale-object-lifetime.mjs` | locale 对象生命周期 | 是（19、201、14） |
| `game/server/locale-wide-forward.mjs` | 宽 locale 转发 | 间接调用 |
| `game/server/locale-delete.mjs` | locale 对象删除 | 是（239、14） |
| `game/server/global-buffer-cleanup.mjs` | 全局缓冲清理 | 是（14） |
| `game/server/global-pointer-vector-cleanup.mjs` | 全局指针向量清理 | 是（14） |
| `game/server/range-copy.mjs` | 区间复制 | 是（261） |
| `game/server/stream-read-line.mjs` | 缓冲行读取 | 是（378） |
| `game/server/global-flag-reset.mjs` | 全局效果标志重置 | 否，无调用 |
| `game/server/component-release.mjs` | 组件槽释放 | 是（14） |
| `game/server/locale-stream-state.mjs` | locale 流状态更新 | 是（69） |
| `game/server/format-time.mjs` | locale 时间格式化 | 是（6） |
| `game/server/format-time-output.mjs` | locale 时间输出 | 是（328、360） |
| `game/server/sort-four.mjs` | 四元素排序步骤 | 是（137） |
| `game/server/uint-to-long-double.mjs` | 无符号长双精度转换 | 是（55） |
| `game/server/int-to-long-double.mjs` | 有符号长双精度转换 | 是（55） |
| `game/server/state-trap.mjs` | 状态陷阱闩锁 | 是（42） |
| `game/server/abort-helpers.mjs` | 中止辅助 | 是（5、42） |
| `game/server/string-range-construct.mjs` | 字符串区间构造 | 是（351、187，未恢复） |
| `game/server/object-wrappers.mjs` | 薄对象包装 | 是（241、242、290、297、337，未恢复） |
| `game/server/object-cleanup-chain.mjs` | 清理链 | 是（242，未恢复） |
| `game/server/string-object-wrappers.mjs` | 字符串对象包装 | 是（185，未恢复） |
| `game/server/virtual-base-wrappers.mjs` | 虚基址包装 | 是（185、238、241、369，未恢复） |
| `game/server/long-double-converters.mjs` | 浮点转换包装 | 是（66、188、357，未恢复） |
| `game/server/random-int.mjs` | 随机整数 | 是（13、42） |
| `game/server/singleton-getters.mjs` | 守卫单例访问 | 是（123，未恢复） |
| `game/server/two-digit-year.mjs` | 两位年份写入 | 是（87、88，未恢复） |
| `game/server/vector-object-destructor.mjs` | 向量对象析构 | 是（33，未恢复） |
| `game/server/errno-category.mjs` | errno 类别查询 | 是（82，未恢复） |
| `game/server/errno-parse-wrappers.mjs` | errno 保留解析包装 | 是（82、124、184，未恢复） |
| `game/server/errno-more-wrappers.mjs` | errno 补充包装 | 是（82、188、295、357，未恢复） |
| `game/server/vector-at.mjs` | 向量元素访问 | 是（38，未恢复） |
| `game/server/string-fill-construct.mjs` | 字节串构造 | 是（173，未恢复） |
| `game/server/function-invoker.mjs` | 四参数虚调用 | 是（无静态依赖） |
| `game/server/locale-facet-loop.mjs` | locale facet 循环 | 是（69、221、287） |
| `game/server/locale-facet-cleanup.mjs` | locale facet 清理 | 是（14） |
| `game/server/object-initializer.mjs` | 对象初始化 | 是（239、259） |
| `game/client/lifecycle-wrappers.mjs` | 客户端生命周期转发 | 是（1090、901、905、518、630 等） |
| `game/client/fixed-address-forwarders.mjs` | 客户端固定地址转发（36 个） | 是（377、381、413、552、564） |
| `game/client/small-accessors.mjs` | 客户端小型访问器（16 个） | 是（899、903、518、1019 等） |
| `game/client/string-and-object-forwarders.mjs` | 客户端字符串/对象转发（26 个） | 是（378、459、718、921 等） |
| `game/client/object-destructors.mjs` | 客户端对象析构（17 个） | 是（362 及各析构助手） |
| `game/client/misc-tiny-wrappers.mjs` | 客户端微型包装（16 个） | 是（423、730、405、664、981 等） |
| `game/client/object-lifecycle-slots.mjs` | 客户端对象生命周期（18 个） | 是（381、405、895、900 等） |
| `game/client/flag-and-field-helpers.mjs` | 客户端标志/字段助手（5 个） | 是（820、899、517、383、364） |
| `game/client/static-initializer-guards.mjs` | 静态初始化守卫（9 个） | 是（369、370、552、521） |
| `game/client/allocate-or-abort.mjs` | 分配失败中止 | 是（368、1） |
| `game/client/static-table-initializers.mjs` | 静态字符串表初始化（6 个） | 是（369、370、389、396、397） |
| `game/client/initializers-and-flags.mjs` | 初始化与标志槽（5 个） | 是（377、899、902、406、909） |
| `game/client/string-utils.mjs` | 字符串构造、存储与复制（3 个） | 是（371、472、398） |
| `game/client/slot-allocators.mjs` | 槽位/索引数组分配（2 个） | 是（371、406） |
| `game/client/float-field-setters.mjs` | 浮点字段设置（4 个） | 是（810、984、731） |
| `game/client/asm-const-wrappers.mjs` | asm 常量桥包装（14 个） | 否（宿主导入 a.a） |
| `game/client/refcounted-string-destructors.mjs` | 字符串与数组析构（13 个） | 是（362、377、519、619、697、789、1） |
| `game/client/log-wrappers.mjs` | 日志包装（3 个） | 是（927、749） |
| `game/client/time-converters.mjs` | 两位年份转换（2 个） | 是（500、501） |
| `game/client/array-and-vtable-destructors.mjs` | 数组与虚表析构（6 个） | 是（620、362） |
| `game/client/compact-destructors.mjs` | 紧凑析构（3 个） | 是（377、416、362） |
| `game/client/virtual-destructors.mjs` | 虚析构（7 个） | 是（362） |
| `game/client/small-wrappers.mjs` | 小包装（4 个） | 是（555、744、927） |
| `game/client/asm-const-callbacks.mjs` | asm 回调（3 个） | 否（宿主导入 a.a） |
| `game/client/object-initializers.mjs` | 对象初始化（4 个） | 是（909、402、415、983、996） |
| `game/client/numeric-wrappers.mjs` | cookie 帧包装（1 个） | 是（513） |
| `game/client/vtable-invokers.mjs` | 虚表调用（1 个） | 否 |
| `game/client/buffer-helpers.mjs` | 缓冲与熵（2 个） | 是（820、406） |
| `game/client/flag-helpers.mjs` | 能力与分发（3 个） | 是（945、706、364） |
| `game/client/cleanup-and-config.mjs` | 清理与配置（5 个） | 是（400、416、364、92） |
| `game/client/registry-and-lookup.mjs` | 注册表查询（4 个） | 是（422、364、408、365、377） |
| `game/client/io-and-alloc.mjs` | I/O 与分配（3 个） | 是（13、735、647、389） |
| `game/client/errno-wrappers.mjs` | errno 包装（4 个） | 是（488、555、543、651、744） |
| `game/client/vector-helpers.mjs` | 向量访问（1 个） | 是（414、406） |
| `game/client/log-markers.mjs` | 日志标记（1 个） | 是（630） |
| `game/client/dynamic-call-thunks.mjs` | 动态调用桥（7 个） | 是（37） |
| `game/client/indirect-helpers.mjs` | 间接分发（7 个） | 否 |
| `game/client/vtable-thunks.mjs` | 虚表转发（881 个） | 是 |
| `game/client/vtable-pair-thunks.mjs` | 双虚表转发（739 个） | 是 |
| `game/client/vtable-forward-thunks.mjs` | 多虚表转发（215 个） | 是 |
| `game/client/vtable-chain-thunks.mjs` | 三阶段转发（289 个） | 是 |
| `game/client/vtable-index-forward-thunks.mjs` | 双阶段索引转发（89 个） | 是 |
| `game/client/vtable-reordered-chain-thunks.mjs` | 重排三阶段转发（103 个） | 是 |
| `game/client/vtable-quad-dispatch-thunks.mjs` | 四次分派（44 个） | 是 |
| `game/client/vtable-indexed-chain-thunks.mjs` | 索引三阶段链（16 个） | 是 |
| `game/client/vtable-indexed-callback-thunks.mjs` | 索引回调链（7 个） | 是 |
| `game/client/iconv-init.mjs` | iconv 初始化（1 个） | 是（88） |
| `game/client/static-cleanup-loops.mjs` | 静态区间清理（3 个） | 是（413） |
| `game/client/callable-invokers.mjs` | 类型擦除调用适配器（16 个） | 是 |
| `game/client/callable-copy-constructors.mjs` | std::function 拷贝构造（6 个） | 是 |
| `game/client/closure-invoker-pairs.mjs` | 两段闭包调用（16 个） | 是 |
| `game/client/closure-invoker-pairs-result.mjs` | 两段闭包调用并返回 i32（14 个） | 是 |
| `game/client/closure-invoker-single-result.mjs` | 单段闭包调用并返回 i32（11 个） | 是 |
| `game/client/closure-invoker-two-arguments.mjs` | 双参数闭包调用（9 个） | 是 |
| `game/client/pending-queue-destructors.mjs` | 待处理队列析构（60 个） | 是 |
| `game/client/static-queue-arrays.mjs` | 静态队列数组析构（4 个） | 是 |
| `game/client/entity-growth.mjs` | 实体成长组件更新（20 个） | 是 |
| `game/client/petal-colors.mjs` | 花瓣颜色混合与着色（8 个） | 是 |
| `game/client/callable-clone-to-heap.mjs` | std::function 堆克隆（6 个） | 是 |
| `game/client/callable-destructors.mjs` | std::function 析构（6 个） | 是 |
| `game/client/closure-chain-invokers.mjs` | 多段闭包链调用（19 个） | 是 |
| `game/client/closure-adapter-chains.mjs` | 闭包适配器链（35 个） | 是 |
| `game/server/cell-attachment.mjs` | 实体挂接网格单元（4 个） | 是 |
| `game/server/small-memory.mjs` | 小内存助手（3 个） | 是（14、16） |
| `game/server/frame-wrappers.mjs` | 帧包装（2 个） | 是（99、100） |
| `runtime/` | 装配清单、共享内存/栈、类型检查、浏览器加载 | 是 |
| `javascript/upstream/` | 未本地化的归档 JS 同样经过完整恢复；客户端保留原 hostname 判断 | 否，作为原版对照 |
| `wasm/client.wat` | 4,245 个客户端函数的完整指令、常量、表和数据段 | 是 |
| `wasm/sp_server.wat` | 734 个服务端函数的完整指令、常量、表和数据段 | 是 |
| `decompiled/client/`、`decompiled/sp_server/` | 全部内部函数的 C 风格伪代码，每 64 个函数分一文件 | 否，属于辅助阅读视图 |
| `decompiled/*/index.json` | 函数名 → 伪代码文件 | 否 |
| `semantic/server-behavior.mjs` | 经过差分测试的 main、输出队列、包异或和轨道恢复 | main/输出队列通过 game 模块使用，其余为对照 |
| `semantic/server-catalogs.json` | 运行实际构造函数提取的花瓣、实体、生成规则和虚函数分派表 | 否 |
| `semantic/client-behavior.mjs`、`semantic/client-catalogs.json` | 经过差分测试的客户端桥接函数和原客户端显示目录 | 否 |
| `wasm/semantic-names.json` | 有依据的服务端函数命名、置信度和定位依据 | 用于重新生成可读 WAT |
| `wasm/client-semantic-names.json` | 有依据的客户端函数命名、置信度和定位依据 | 用于重新生成可读 WAT |
| `assets/` | 页面、字体、图标、诊断页 | 是 |

进一步阅读根目录的 `reports/javascript.md`、`reports/server-behavior.md`、`reports/client-behavior.md`、
`reports/client-leaf-functions.md`、`reports/client-straight-line.md`、`reports/client-composed.md`、`reports/client-conditionals.md`、`reports/client-wide-math.md`、`reports/client-ranges.md`、`reports/client-predicates.md`、`reports/client-materials.md`、`reports/client-buffers.md`、`reports/client-records.md`、`reports/client-shifts.md`、`reports/client-wrappers.md`、`reports/client-text-support.md`、`reports/client-number-format.md`、`reports/client-scan-format.md`、`reports/client-config-io.md`、`reports/client-float-array.md`、`reports/client-channel-pack.md`、`reports/client-bitmap-decode.md`、`reports/client-row-blit.md`、`reports/client-pixel-convert.md`、`reports/client-alpha-blit.md`、`reports/client-window-check.md`、`reports/client-channel-blit.md`、`reports/client-object-constructor.md`、`reports/client-affine-sampler.md`、`reports/client-atanf.md`、`reports/client-atan.md`、`reports/client-soft-compare.md`、`reports/client-blend-blit.md`、`reports/client-utf8-decode.md`、`reports/client-pixel-channel-extract.md`、`reports/client-pixel-write-modes.md`、`reports/client-rgb565-write-modes.md`、`reports/client-rgb555-write-modes.md`、`reports/client-rgba8888-write-modes.md`、`reports/client-particle-record.md`、`reports/client-utf8-advance.md`、`reports/client-mb-to-wc.md`、`reports/client-row-channel-blend.md`、`reports/client-scaled-channel-blit.md`、`reports/client-vtable-constructors.md`、`reports/client-global-destructors.md`、`reports/client-frexp.md`、`reports/client-random-angle.md`、`reports/server-string-utilities.md`、`reports/client-allocate-zeroed-array.md`、`reports/server-memcmp.md`、`reports/server-lifecycle-helpers.md`、`reports/server-timeout-registry.md`、`reports/server-trig-kernels.md`、`reports/server-timeout-fire.md`、`reports/server-growth-factor.md`、`reports/server-frexp.md`、`reports/server-wide-shift.md`、`reports/client-timeout-fire.md`、`reports/server-check-websockets.md`、`reports/server-allocation.md`、`reports/client-petal-tooltip.md`、`reports/server-cosine-correction.md`、`reports/server-entity-definitions.md`、`reports/server-wide-shift.md`、`reports/server-number-parse.md`、`reports/server-scan-utilities.md`、`reports/server-string-move.md`、`reports/server-scalar-helpers.md`、`reports/server-sine-offset.md`、`reports/server-vector-helpers.md`、`reports/server-atan.md`、`reports/server-bump-allocator.md`、`reports/server-wide-multiply.md`、`reports/server-scalbn.md`、`reports/server-four-record-sort.md`、`reports/server-container-end.md`、`reports/server-byte-move.md`、`reports/server-record-sort.md`、`reports/server-random-state.md`、`reports/server-free-block.md`、`reports/server-collision-filter.md`、`reports/server-mbrtowc.md`、`reports/server-depth-comparator.md` 和 `reports/RECONSTRUCTION.md`。按函数编号查 `reports/wasm/*-functions.json`，可以找到
WAT 行号、直接调用列表和间接调用数量。间接调用的运行目标仍需结合表与运行状态分析。

## 证据和验证边界

* `npm test`：参考 WASM 逐字节重建、两种版本的干净目录构建、JS AST 变换检查、JS 接口差分测试、已人工还原的客户端/服务端函数差分测试。
* `node test/runtime-smoke.mjs --root dist --label readable --readable --source source/javascript --compare reports/runtime/baseline.json`：使用本机 Chrome 检查菜单、进入游戏、移动、攻防与滚轮输入、Worker 通信、离线资源及高层函数实际执行。
* 浏览器冒烟测试不会穷尽每个怪物、花瓣、死亡和存档状态。不同线程使用真实时钟，不以截图逐像素一致作为等价证明。
* 完整测试结果见 `reports/tests.tap`；浏览器范围和源码/部署身份见 `reports/current-verification.json` 与 `reports/runtime/readable.json`。不同构建的验证结论按实际哈希区分。构建、测试和浏览器冒烟之后运行 `node tools/write-verification-report.mjs`，从这些当前产物重新生成核验账本，不沿用旧哈希。
* `test/server-petal-world.test.mjs`：38 种装备类型、实际攻防输入、Peas 分裂与延迟发射、移除清理；228 个检查点比较原版和全部已接入高层函数的完整内存、栈及输出。
* `.dcmp` 是反编译器生成的伪代码，保留了大量机器内存访问与控制流；不能直接作为 C/C++ 编译。
* `function_数字`、`localValue数字`、按字节偏移命名的字段均明确表示语义尚未恢复。
* JS 重命名保持可执行 AST 的结构；私有属性重命名通过额外差分测试和浏览器测试验证。它不等同于对任意外部脚本接口作形式化证明。

## 重新生成还原结果

日常修改源码只需 `npm run build`。以下命令用于从归档再做一次逆向，会覆盖对应还原文件：

```sh
npm run recover:js
npm run recover:upstream-js
npm run recover:wasm
```

`web/` 与 `upstream/` 的两个 WASM 分别完全相同，故共用两份 WAT 源码，测试同时校验
两组归档。JS 原版与本地版分别保留恢复文件和符号报告；默认游戏构建使用本地版。

若需重新生成全部 C 风格伪代码，指定 **原生 WABT 1.0.39 的 wasm-decompile**：

```sh
WASM_DECOMPILE=/absolute/path/to/wasm-decompile npm run recover:wasm
```

`npm` 包内的反编译器在大型客户端上出现内部内存越界，因此本次完整伪代码使用官方
WABT 1.0.39 源码构建的原生工具生成。WABT 1.0.42 已不包含 `wasm-decompile`；REA
静态取证使用的 `wasm2wat`、`wasm-validate`、`wasm-objdump` 则是 1.0.42。
重建游戏仅需 npm 中固定版本的 `wabt`，不需要原生工具、REA 服务或 Emscripten。

原生反编译器的构建方法：

```sh
curl -fL https://github.com/WebAssembly/wabt/archive/refs/tags/1.0.39.tar.gz -o /tmp/wabt-1.0.39.tar.gz
# 本次使用的归档 SHA-256：8aaafc02afdb8832bd51140b833816512a834601a65348e1f433cece6bbf2db7
tar -xzf /tmp/wabt-1.0.39.tar.gz -C /tmp
cmake -S /tmp/wabt-1.0.39 -B /tmp/wabt-build -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTS=OFF
cmake --build /tmp/wabt-build --target wasm-decompile --parallel 6
```

本次生成过程中去掉了仅用于阅读视图的局部变量/标签调试名，避开 WABT 1.0.39 在
参数声明与参数引用之间使用不同名字的问题。可执行 WAT 的构建不受此处理影响。
