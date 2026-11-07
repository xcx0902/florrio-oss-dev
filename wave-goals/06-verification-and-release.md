# W6 · 联机验收、独立构建和发布演练

**前置**　[执行记录](README.md#执行记录) 中 W0–W5 均有结果，且待确认规则已登记。固定本次验证的源码、规则和客户端快照。

## 06.1 发布条件

| 门禁         | 通过标准                                                                                                                   | 必备报告                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 原件身份     | JS 和 Wasm 与 W0 的哈希一致，启动所需资源已装配                                                                            | 快照哈希和资源清单                             |
| 原协议与联机 | [协议矩阵](protocol-20221030.md) 的启动、入局、波次、经济、匹配、场景和 PvP 由原客户端在正式入口完成，错误和重连路径可处理 | 原版收发字节、黄金样例、客户端操作和服务端结果 |
| 服务端历史   | 所有已证实的目标期规则都有对应实现和测试，重建与估计规则可追溯，缺口明确。覆盖本局及跨局收益、合成、迟入、AFK、蚁穴和 PvP  | 逐规则覆盖、样本、实现值、证据等级和测试 ID    |
| 独立交付     | 仅提供 `wave/`、外置快照及清单上的同版资源即可构建、验收并运行，部署包与验收身份一致                                       | 干净构建、产物清单、哈希和双浏览器 smoke       |
| 容量与恢复   | 在实测发布容量下保持所选模拟周期、可控的队列与资源，断线或进程重启后已提交进度完整                                         | 多房、长局、慢读者、进程恢复和回退日志         |

启动、连接或已支持的玩法流程失败时，记录首个失败环节和对应消息。服务端的历史证据等级与功能测试结果分别列出。

## 06.2 一次运行验收并打包

在独立 `wave/package.json` 注册 `verify:reference`、`test:history`、`test:wire`、`test:load` 和 `release:prepare`。W6 的 `--stage W6` 覆盖此前全部相关状态与用例。打包读取本次测试账本并拒绝源码、目录、资源或快照身份错配。包内使用验证过的原始 JS 和 Wasm 及同版资源。测试路由和模拟数据夹具从运行包排除。

```sh
set -eu
npm --prefix wave ci
npm --prefix wave run verify:reference -- --snapshot "$WAVE_SNAPSHOT"
cmake -S wave -B build/wave/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/wave/native --parallel
ctest --test-dir build/wave/native --output-on-failure --no-tests=error
npm --prefix wave run test:history -- --stage W6
npm --prefix wave run test:wire -- --snapshot "$WAVE_SNAPSHOT" --stage W6
npm --prefix wave run test:load -- --stage W6
npm --prefix wave run release:prepare -- --snapshot "$WAVE_SNAPSHOT"
```

保存构建身份、配置、随机种子、浏览器版本、原客户端及资源哈希、规则版本、测试覆盖、退出码、报告及包清单。任何输入变化后重新执行涉及的验收并重新绑定账本。性能报告记录实测服务器 tick、广播频率、连接和实体规模。无法达到拟定负载时降低发布容量，按实际配置重测。

## 06.3 验证独立性与装配

检查 `wave/REUSE.md` 记录的代码来源和 Wave 验收用例。干净副本验证所有移植均随子项目构建。 [复用验收](reuse-audit.md#落地顺序与验收)

从仓库根目录准备临时目录。只复制 Wave 子项目，快照通过绝对路径只读传入。用和 06.2 相同的命令验证。若阶段工具需要历史参考资源，按清单提供同一份外置资源包。

```sh
set -eu
test -f "$WAVE_SNAPSHOT/client.wasm"
wave_clean="$(mktemp -d)"
mkdir -p "$wave_clean/wave"
rsync -a --exclude node_modules --exclude build --exclude reports \
  wave/ "$wave_clean/wave/"
printf 'Independent checkout: %s\n' "$wave_clean"
(
  cd "$wave_clean"
  npm --prefix wave ci
  cmake -S wave -B build/wave/native -DCMAKE_BUILD_TYPE=Release
  cmake --build build/wave/native --parallel
  ctest --test-dir build/wave/native --output-on-failure --no-tests=error
  npm --prefix wave run verify:reference -- --snapshot "$WAVE_SNAPSHOT"
  npm --prefix wave run test:history -- --stage W6
  npm --prefix wave run test:wire -- --snapshot "$WAVE_SNAPSHOT" --stage W6
)
```

对解包目录逐文件校验，重点确认原客户端、资源及服务端规则的身份。再运行包内说明的本地服务，在全新浏览器上下文走真实菜单、访客、Garden 和队友重生。继续验证三场景、蚁穴和 PvP 可进入、操作并离开，记录联机结果。

## 06.4 排空与恢复演练

1. 在测试环境用两份访客档案创建对局，提交经验、物品、最高波和合成。记录数据库版本、档案状态及最后的结算键，制作一致性备份。
2. 模拟关停新入局。已有局按设定时限结束，确保承诺的结果先提交，再停止宿主。恢复新版本时验证原客户端能恢复正确身份、库存和连接状态。
3. 切回上一份独立 Wave 包，确认兼容的协议和数据版本。需要隔离新版库时保留原库和对应包，单独验证备份恢复与正向升级，记录恢复点。确认当前仓库的旧 World PvP 能继续独立运行。
4. 发布说明同时列出客户端兼容范围、历史规则置信状态、已知行为差异、适用浏览器、实际容量和存档恢复步骤。将报告和包路径填入 [执行记录](README.md#执行记录)。
