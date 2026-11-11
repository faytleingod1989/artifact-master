# 「圣遗物管理大师／星穹典藏」全程序审查报告

**审查日期**：2026-11-01  
**审查范围**：全量源码（Electron 主进程、PowerShell/C# 原生采集与单页扫描、Python PP-OCRv5 离线识别引擎、React 19 前端采集/OCR/评分/仓库/持久化及构建校验脚本）

**总体结论**：程序整体工程质量**优秀**，安全隔离、进程生命周期管理、数据原子持久化及游戏合规边界（不读写内存、不自动提权、不自动翻页、不自动入库）均在代码层有严密校验。当前唯一高优事项是 **`yas-emphasis-20261031-local` 的源码改动尚未重新打包到 `release-local`**，实机验收前需执行构建。

---

## 一、自动化检查与测试基线

在当前工作区直接执行全套静态分析与自动化测试，结果如下：

| 检查维度 | 执行命令 | 结果 | 详情说明 |
| :--- | :--- | :--- | :--- |
| **TypeScript 类型检查** | `npx tsc -b` | 通过 | 0 错误 |
| **代码规范与静态检查** | `npx oxlint` | 通过 | 202 个文件，103 条规则，0 警告 / 0 错误 |
| **前端单元测试** | `npx vitest run` | 通过 | 59 个测试文件，**382 / 382** 全部通过 |
| **Electron 主进程与原生脚本测试** | `node --test electron/*.test.cjs` | 通过 | **86 / 86** 全部通过（含最新 `emphasized` 姿态修复测试） |
| **构建与发布门禁脚本测试** | `node --test scripts/*.test.mjs` | 通过 | **17 / 17** 全部通过 |
| **Python OCR Worker 测试** | `python -m pytest` | 9 / 11 通过 | `test_worker.py` 中 2 个测试因未注入环境变量 `OCR_TEST_IMAGE` 抛出 `KeyError`，属测试环境前置条件缺失，非业务代码缺陷 |

---

## 二、分模块深度审查结论

### 1. Electron 主进程与原生交互层（`apps/web/electron/*`、`native-capture/*`）
- **安全配置到位**：`main.cjs` 启用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`；所有 IPC Handler（`captureIpc.cjs`、`pageScanIpc.cjs`、`ocrIpc.cjs`、`enkaIpc.cjs`）均核验 `event.sender === window.webContents`、`event.senderFrame === window.webContents.mainFrame` 及入口 URL（`isEntryUrl`）。
- **子进程管控稳健**：
  - `nativeOcrClient.cjs`、`nativePageScanClient.cjs`、`nativeWindowFrameClient.cjs` 均采用 `shell: false` 启动子进程，参数严格通过正则与安全整数校验，**无命令注入风险**。
  - 设有启动超时（10s/30s）、单次请求超时（4s/5s/15s）与 stdout 缓冲区硬上限，防止异常输出撑爆内存。
  - `nativePageScanClient.cjs` 的 `stopInput()` 通过直接终止子进程并等待 `exit` 事件确认（1500ms 超时门禁）来保证停止原生输入，若无法确认退出则永久锁死会话并禁止恢复 F8，安全性极高。
- **游戏操作合规性**：`PageScanInput.ps1` 只包含 `SetCursorPos` 与鼠标左键单击 `SendInput`，绑定原神进程名、PID、进程启动时间与前台窗口，具备 25ms 右键紧急停止轮询；**无滚轮翻页、无键盘输入、无自动提权、无内存读取**。
- **网络访问收敛**：`enkaClient.cjs` 仅在用户主动查询 UID 时发起 HTTPS GET，具备 9～10 位 UID 校验、15s 超时、5MB 响应上限、429 `Retry-After` 退避及严格字段白名单清洗（`sanitize`）。

### 2. 前端采集与单页扫描控制器（`apps/web/src/capture/*`、`realtimeCapture.ts`）
- **异步竞态与生命周期安全**：`captureController.ts` 与 `pageScanController.ts` 全程使用 `generation` / `epoch` 令牌校验每一步 `await` 返回后的有效性；组件卸载时立即清理定时器、媒体流轨道（`MediaStreamTrack.stop()`）、音频上下文与 ObjectURL。
- **内存预算严格**：`createCaptureResources` 限制单批次最多 20 件任务、单张源图不超过 16 MiB、批次源图总计不超过 128 MiB；单张 OCR 完成后立即通过 `releaseSource` 释放原图 Blob，仅保留小尺寸预览。
- **单页扫描防错机制**：`pageScanController.ts` 在首次点击前先移开悬停光标（`prepare`）、封存本页格位锚点（`anchor`）并验证连续 3 帧稳定；每次点击格位后均要求详情签名与页面签名稳定匹配才截取冻结帧（`freeze`），杜绝“张冠李戴”。

### 3. OCR 识别与圣遗物解析管线（`apps/web/src/artifacts/*`、`native-ocr/*`）
- **离线模型防篡改与断网保护**：`worker.py` 启动时强制覆写 `socket.connect` 禁用一切网络访问，并校验 `ch_PP-OCRv5_det_mobile.onnx` 与 `ch_PP-OCRv5_rec_server.onnx` 的 SHA-256 哈希。
- **双路径交叉复核（不猜数原则）**：`recognition_router.py` 在分字段快速识别（`line`）置信度 `< 0.90` 或格式不符时自动回退整图识别（`mixed`），一旦两路径数字 Token 不一致即上报 `conflicts`；前端 `nativeOcrService.ts` 将数值冲突、高光遮挡（`occluded`）、低置信度（`< 0.75`）全部记为 `error` 级问题，强制人工复核或重采。
- **五星圣遗物数值模型严谨**：`artifactDraft.ts` 严格验证五星主词条与部位/等级精确对应值、副词条合法上下界、百分比小数精度、主副词条互斥，以及“待激活”第四词条的前置条件（等级 `< 4` 且已有 3 条激活副词条）。

### 4. 评分推荐、数据持久化与 UI（`scoring.ts`、`src/storage/*`、`src/imports/*`、`App.tsx`）
- **原子持久化与写序保护**：`libraryRepository.ts` 使用 `idb-keyval` 的 `setMany` 在单一 IndexedDB 事务中同时更新库存、回收站、强化队列与角色头像，并通过 `lastWrite` Promise 链串行化写入；`App.tsx` 处理了“编辑后又改回原值”的排队落盘边界。
- **备份恢复先验后写**：`libraryValidation.ts` 对导入备份执行完整 Schema、唯一编号、队列成员存在性及 5000 件容量上限验证，且在 `saveLibrary` 成功后才切换界面状态，确保存储异常时旧库不丢失。

---

## 三、发现的问题与改进建议（按优先级排序）

| 优先级 | 类别 | 位置 | 问题描述与影响 | 修复建议 |
| :---: | :--- | :--- | :--- | :--- |
| **高** | 构建同步 | `native-capture/PageScanInput.ps1` / `electron-builder.local.cjs` | 源码已合入 `emphasized`（姿态缩放与选中边框解耦）修复并通过全部 86 项测试，构建配置已更新为 `ArtifactMaster-0.1.0-yas-emphasis-20261031-local.exe`，但 `release-local/` 尚未构建该包（`win-unpacked` 内仍为旧版 PS1）。 | 在实机验收前执行 `npm run desktop:build:local` 生成最新安装包并完成离线冒烟验证。 |
| **中** | Electron 安全 | `electron/main.cjs:35-38` | `setWindowOpenHandler` 将任意 URL 直接传给 `shell.openExternal(url)`，未做协议白名单校验。 | 增加协议检查，仅当 `new URL(url).protocol === 'https:'` 时才调用 `shell.openExternal`。 |
| **中** | Electron 安全 | `apps/web/index.html` | 页面未声明 Content-Security-Policy (CSP) 响应头或 `<meta>` 标签。 | 在 `<head>` 中补充 `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';">`。 |
| **中** | 前端性能与可维护性 | `src/App.tsx:84-89` | 每次状态变更均对包含 `assetMap`（Base64 角色头像）的完整 `snapshot` 执行同步 `JSON.stringify`；且 `App.tsx` 集中了过多持久化状态机引用。 | 将 `assetMap` 的变更检测与高频库存操作分离（或改用增量版本号），并将存储状态机抽离为独立 `useLibraryStorage` Hook。 |
| **低** | 交互细节 | `src/capture/RealtimeCapturePanel.tsx:138` | 切换“快速分字段识别”复选框时仅写入 `localStorage`；若同一窗口已启动过并处于暂停状态，点击恢复不会重建 `ocrSession`。 | 在切换 `ocrMode` 且当前队列为空时重置 `hasSource.current = false`，使下次启动直接按新模式重建会话。 |
| **低** | 配装算法 | `src/scoring.ts:138-157` | `recommendBuild` 采用每部位 Top-8 贪心替换，且按顺序遇到第一个能凑齐的推荐套装方案即 `break`，不继续比较后续套装方案。 | 代码注释已说明是有意取舍；若希望推荐更优，可遍历 `build.sets` 中所有可凑齐方案并取最高分。 |
| **低** | 测试健壮性 | `native-ocr/test_worker.py:7` | 直接读取 `os.environ['OCR_TEST_IMAGE']`，未设置环境变量时抛出 `KeyError` 导致 `pytest` 失败。 | 加上 `@unittest.skipUnless(os.environ.get('OCR_TEST_IMAGE'), 'requires OCR_TEST_IMAGE')`。 |
| **低** | 目录卫生 | 仓库根目录 | 根目录存在 `_audit_TextMapCHS.json`（20 MB）、`_audit_dict.html`、`NVIDIA Corporation`、`.tree.json` 等临时审计产物。 | 归档至 `.cache/` 或清理无用临时文件（保持现有不初始化 Git 的项目约定）。 |

---

## 四、修复实施与最新打包核验（2026-11-01 已完成）

上述审查发现的可直接修复项已全部合入并完成打包验证：

1. **已合入的代码修复**：
   - `electron/main.cjs`：`setWindowOpenHandler` 增加 `new URL(url).protocol === 'https:'` 协议白名单校验。
   - `apps/web/index.html`：配置适配本地 `file://`、WASM 与 Module Worker 的 Content-Security-Policy (CSP)。
   - `src/App.tsx`：将 `artifacts`、`trash`、`queueIds`、`assetMap` 的 JSON 序列化分别独立 `useMemo` 缓存，避免每次库存变更时重复序列化多 MB 角色头像。
   - `src/capture/RealtimeCapturePanel.tsx`：空闲状态下切换“快速分字段识别”时重置 `hasSource` 标记，下次启动即刻重建 OCR 会话。
   - `native-ocr/test_worker.py`：补充 `@unittest.skipUnless(os.environ.get('OCR_TEST_IMAGE'), ...)`，解决无环境变量时的 `KeyError`。

2. **最新构建产物与离线冒烟验证**：
   - **构建路径**：`E:\AI Project\YS\apps\web\release-local\ArtifactMaster-0.1.0-yas-emphasis-20261031-local.exe`
   - **文件大小**：`259,690,685` 字节
   - **SHA-256**：`F8A39DCCADB0B1A042E0C4A8198626364724CE913C50DBE7D62B51B50A4CB86C`
   - **打包后离线冒烟测试（`npm run test:desktop-offline`）**：通过（退出码 0，`realF8RegisteredAndReleased: true`，`externalRequests: 0`，源码与归档哈希一致）。
   - **数据与旧包保留**：旧启动器与历史候选包（`yas-appearance`、`yas-startup`、`yas-selection`）及用户库存均原样保留，实机验收通过前不切换默认启动器。
