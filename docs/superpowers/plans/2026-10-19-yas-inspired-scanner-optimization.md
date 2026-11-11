# yas 借鉴优化开发计划 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development only after the user chooses delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先交付更快且不降低可靠性的本地 F8 录入，再交付明确启用的当前页批量扫描，保留现有管理和角色评分能力。

**Architecture:** 保留 Electron／React、不可变截图队列和单 OCR 消费者。原生 OCR 加入自动字段切分与可路由的行识别，持久帧会话减少重复枚举；后续页扫描控制器仅生产截图任务，不另建识别或库存写入通道。

**Tech Stack:** 现有 TypeScript、Electron、Python／RapidOCR／ONNX Runtime、Vitest、Node test、Playwright；专用模型是通过许可及测试门槛后才启用的候选，不预设必须换 Rust。

**Spec:** [优化设计](../specs/2026-10-19-yas-inspired-scanner-optimization-design.md)。2026-10-19 用户已确认实施；实际证据与未通过的验收项见本文件末尾和实施台账。

## Global Constraints

- 仅收入五星；截图／手动／UID 导入、角色档案、评分和潜力功能不退化。
- 保留 F8 截图排队、捕获音和识别成功音，游戏前台不抢焦点。
- 保留每批最多 20 个未入库任务、单张编码源图 16 MiB、源图合计 128 MiB 的限制。
- 属性数值不猜测、不自动四舍五入；6.5% 合法，6.59% 不能静默改成 6.5%；名称规范化与数字处理分开。
- 三条有效副词条和待激活第四条是正常情况；待激活属性不计入当前已生效评分。
- 两件属性完全相同的真实圣遗物必须可以分别保留；只能提示疑似重复，不能按属性集合自动删重。
- 全部 OCR 离线，不上传图片、不运行时下载模型、不自动提权、不静默切换捕获来源。
- 不存在 Git 仓库：不初始化、不执行 Git 提交，只记录修改清单、测试证据与发布清单。
- 首期不自动操作鼠标；P2 需先审阅自动操作设计。P3 自动翻页不纳入本轮默认实施。
- 旧图重试只处理固定原图；确认前不入库。不得绕过现有 IPC 来源、会话和资源校验。

## Review Focus

1. 浏览器 OCR 测试误被当作桌面原生基准：T1 要断言真实工作进程与引擎标识，缺失原生桥应失败。
2. 快模型字表缺“待激活”或遇到新名称：T2/T3 验证覆盖清单和同图回退，不能默认为已生效。
3. 多 DPI／分辨率变化后复用旧 ROI：T4 验证区域失效重定位和来源身份不变。
4. 同属性相邻两件与相同详情画面：T6 验证按格位保留两次截图，不按属性去重，也不能把未切换当切换成功。
5. 自动点击时失焦或队列满：T6/T7 验证输入立即暂停且不跳格，不通过自动入库或改拍其他窗口恢复。

## 一、交付顺序与完成定义

| 阶段 | 任务 | 用户获得的结果 | 阶段出口 |
| --- | --- | --- | --- |
| P0 | T1 | 可以区分截图慢、传输慢、模型慢，以及真实识别错误 | 原生基线与固定回归集可复现 |
| P1 | T2 → T3 → T4 → T5 | 保留 F8 的快速识别版，无需手选裁剪区域 | 正确率、误接受、耗时和离线包验收 |
| P2 | T6 → T7 → T8 | 当前页自动点击采集，扫完由用户翻页 | 模拟测试＋用户在场真实游戏验收 |
| P3 | 不执行 | 未来可选自动翻页 | 另行设计、确认和排期 |

T4 可在 T1 后独立验证，但合并前需与 T3 的图像坐标和诊断协议对齐。首次执行建议顺序实现，避免同时改取帧、IPC 和 OCR 后无法定位回归。计划不承诺未经测量的固定耗时或交付日期。

所有开发任务执行测试先行：新增断言 → 确认因目标行为缺失失败 → 最小实现 → 相关测试通过 → 登记结果。现有通过用例不等于新增功能已完成；未运行的测试不能勾选。

## 二、文件与接口边界

| 模块 | 现有文件 | 新增文件／职责 |
| --- | --- | --- |
| 桌面基准 | `scripts/benchmark-artifact-ocr.mjs`、`apps/web/src/artifacts/ocrBenchmark.ts`、`apps/web/tests/native-ocr.spec.ts` | `scripts/benchmark-native-artifact-ocr.mjs`：真实本地工作进程测量；`apps/web/tests/native-ocr-benchmark.spec.ts`：同图端到端比较 |
| 字段布局 | `apps/web/src/artifacts/artifactOcrImage.ts`、`cardDetailOcr.ts`、`ocrTextBands.ts`、`detailDetection.ts` | `apps/web/src/artifacts/artifactFieldLayout.ts`：两种布局的字段坐标与可靠性 |
| 引擎路由 | `apps/web/native-ocr/worker.py`、`apps/web/src/artifacts/nativeOcrService.ts`、`nativeOcrTypes.ts`、`ocrService.ts` | `apps/web/native-ocr/recognition_router.py`：行识别与有界通用回退；`model_registry.json`：固定资源登记 |
| 协议和分发 | `apps/web/electron/nativeOcrClient.cjs`、`ocrIpc.cjs`、`apps/web/native-ocr/build.ps1`、`collect_licenses.py`、`scripts/verify-native-ocr.mjs` | 新增路由器与模型登记的资源校验，不接受任意文件或模型路径 |
| 帧会话 | `apps/web/electron/captureIpc.cjs`、`preload.cjs`、`apps/web/src/capture/nativeWindowCapture.ts`、`apps/web/src/realtimeCapture.ts` | `apps/web/src/capture/captureFrameSession.ts`：持久帧所有权、尺寸和来源绑定 |
| 单页扫描 | `apps/web/src/capture/captureController.ts`、`captureQueueTypes.ts`、`RealtimeCapturePanel.tsx` | `pageScanTypes.ts`、`pageScanController.ts`、`pageScanLayout.ts`、`pageScanStability.ts`、`PageScanPanel.tsx`：分别管理状态、格位、稳定性和操作界面 |
| 输入控制 | `apps/web/electron/main.cjs`、`preload.cjs`、打包配置 | `apps/web/electron/pageScanIpc.cjs`、`apps/web/native-capture/PageScanInput.ps1`：固定窗口和有限语义输入；隐藏运行，无通用命令执行接口 |

新增文件均位于上表目录；测试与实现同目录，使用对应 `.test.ts`、`.test.tsx`、`.test.cjs` 或 `test_*.py`。不要把新扫描状态塞进现有大面板，也不重写无关模块。

核心契约：

- 保持 `OcrSession.recognize(image: Blob, roi?: CaptureRoi): Promise<OcrDraftResult>`。引擎与路径元信息向后兼容扩展，调用者无需知道具体模型。
- 新增 `detectArtifactFieldLayout(detail: Blob): Promise<ArtifactFieldLayout | null>`；`ArtifactFieldLayout` 包含 `layoutId: 'inventory-card' | 'equipment-panel'`、详情原图尺寸及 `{ field, x, y, width, height }[]`。坐标统一为详情原图像素；不返回缩放后的预处理坐标。
- 原生请求 v2 为 `{ protocolVersion: 2, id, image, mode: 'auto' | 'general', layout? }`；仍只接受一张有界 PNG。字段上限 16，每框正整数且完全在图内；未知版本／模式拒绝。主进程只转发验证后的登记字段，不接受任意模型或路径。
- 返回保留 `lines`，增加 `route: 'general' | 'line' | 'specialized' | 'mixed'`、`modelId`、`fallbackReason?` 和分阶段耗时。`engine` 扩展为明确的固定枚举，保留旧 `'PP-OCRv5-server'`；不把专用结果冒名显示成 V5。旧响应可读，新工作进程握手与清单版本必须匹配。
- P2 新增控制器 `requestPageCapture({ pageId, cellId }): CaptureRequestOutcome`，复用已有取帧资源和 FIFO；创建的任务带可选 `pageId/cellId`。暂停／失败不会重新拍已成功固定的任务。
- `PageScanSnapshot` 包含 `pageId`、`state: 'idle' | 'armed' | 'scanning' | 'paused' | 'page-complete' | 'stopped'`、格位状态／jobId、暂停原因。单页状态不持有第二份源 Blob。

## 三、P0 与 P1 详细任务

### T1：建立真实桌面 OCR 基线和问题样本集

**Files:** 新增原生基准脚本、`apps/web/tests/native-ocr-benchmark.spec.ts`；修改 `ocrBenchmark.ts` 及测试、私有 `tests/private/ocr/manifest.json`。不覆盖历史报告。

**Interfaces:** 消费现有 `createNativeOcrClient` 和 `createNativeOcrSession`；产出带 `engine/route/modelHash/sampleHash`、逐字段对比、拒识／误接受和阶段时间的 JSON 报告。扩展期望数据包含可选待激活词条及“应拒识”负例。

- [ ] 1. 写红测试：无原生桥／工作进程不得静默跑浏览器模型；缺模型明确失败；应拒识图片被当作可确认时计误接受。只匹配部分副词条不能算整件正确。
- [ ] 2. 补入已有 +17、6.5%、+0 三条有效副词条和待激活问题样本。原始图和 UI 回放分组，缺失的真实类别登记缺口，不伪造截图数；无需等待新增图片才开始已有回归测试。
- [ ] 3. 执行 `npm test -- src/artifacts/ocrBenchmark.test.ts`（目录 `apps/web`），记录新增断言失败；基准脚本写测试保证路径越界、重复 ID、缺失期望数据会拒绝。
- [ ] 4. 实现原生桥注入，确保通过实际 `nativeOcrService` 自动定位、解析和校验；分别运行自动定位与已标注 ROI 的对照，后者仅用于诊断，不能替代自动定位验收。
- [ ] 5. 为新脚本实现 `--route current|candidate --rounds 5 --output <私有报告路径>`；当前路径不需候选模型即可运行。预热一次，单列冷启动；报告原始轮次、中位数、P95、样本 n/N 和硬件，不在脚本里写死“快多少”。
- [ ] 6. 新增单元测试通过后运行脚本 current 路径；保存 `tests/private/ocr/yas-optimization/baseline.json`。报告存在和真实引擎证据齐全才完成 P0。

### T2：统一两种详情布局的自动字段切分

**Files:** 新增 `artifactFieldLayout.ts/.test.ts`；修改已有 `artifactOcrImage.ts`、`cardDetailOcr.ts` 及对应测试。已有浏览器识别行为保持兼容。

**Interfaces:** 产出上节的 `detectArtifactFieldLayout`；通用路径消费 null，行识别消费有界原图字段框；标准字段为名称、部位、主属性名／值、等级、副词条行和套装名，可选装备角色／锁状态框。

- [ ] 1. 写红测试：浅色卡片与蓝色详情均正确定位字段；+0 待激活行不裁掉括注；三条副词条不拿套装说明填第四条；主值千分位与百分号完整保留。
- [ ] 2. 补测不同尺寸、缩放、文字贴边、强光遮挡、找不到套装锚点和字段框越界。无法确认布局应返回 null，不要求手动输入坐标，也不能返回猜测的等级行。
- [ ] 3. 在 `apps/web` 运行 `npm test -- src/artifacts/artifactFieldLayout.test.ts src/artifacts/artifactOcrImage.test.ts`，确认目标断言红；最小提取共用布局分析，不复制整个 OCR 实现。
- [ ] 4. 实现自动布局分类、原图坐标转换与字段框验证；保留原始像素作为识别证据，预处理不改变展示图标比例。
- [ ] 5. 重跑上述测试并执行 `npm run test:ui -- tests/ocr-layout.spec.ts`；保存字段框可视化证据到私有输出目录。两个布局均有覆盖才勾选。

### T3：行识别快路径、候选小模型与严格回退

**Files:** 新增 `recognition_router.py`、`test_recognition_router.py`、`model_registry.json`；修改 `worker.py/test_worker.py`、`nativeOcrTypes.ts`、`nativeOcrService.ts`、`ocrService.ts`、`nativeOcrClient.cjs`、`ocrIpc.cjs` 及相邻测试；同步 `build.ps1`、`collect_licenses.py`、`MODEL_NOTICE.md`、`verify-native-ocr.mjs` 及测试。

**Interfaces:** 消费 T2 字段框及固定模型登记；实现 v2 请求／响应、固定枚举和时序统计。保留单进程、单消费者、现有启动 30 秒／作业 15 秒上限及有界 PNG 校验；通用回退包含在同一作业期限内。

- [ ] 1. 先完成候选资源清单：提交、权重／字表哈希、许可依据、预处理和解码方式。缺许可、字表覆盖或可信度校准证据时登记为“不启用”；继续实现现有 PP-OCRv5 的行识别，不安装／运行未知 EXE。
- [ ] 2. 写红测试：每图仅解码一次；标准字段走识别器而非检测器；未知布局走 general；缺“待激活”字符覆盖或新名称不完整时走通用复核；一张图最多一次通用复核，不无界重试。
- [ ] 3. 写数值和可信度红测试：6.5% 正常，6.59% 保留并拒绝；冲突数字不能挑合法值代替；专用模型阈值与 V5 阈值分别校准；待激活不计入当前有效属性；遮挡不因跳过检测器而漏检。
- [ ] 4. 写协议红测试：伪造 engine、未知 version、越界字段、超 16 框、错作业 ID、迟到响应和模型损坏均拒绝；主进程校验也覆盖 renderer 可控参数。新包缺字表／许可／路由器时发布校验失败。
- [ ] 5. 实现行识别与路由，适配原始图坐标的识别框和预览；通用路径继续复用现有解析和严格校验，原文、回退原因可查看；同图复核不调用截图接口。
- [ ] 6. 执行 `python -m unittest test_worker.py test_recognition_router.py`（使用项目构建环境，在 `apps/web/native-ocr`）；在 `apps/web` 执行 `npm run test:electron`、`npm test -- src/artifacts`；根目录执行 `node --test scripts/verify-native-ocr.test.mjs`。记录新增用例红→绿证据。
- [ ] 7. 重新构建原生组件后跑 T1 candidate/current 各 5 轮；达到设计第 6.3 节正确率与误接受门槛才允许 candidate 默认启用。未获许可的专用模型不随包分发，不把替换模型本身作为首期完成的必要条件。

### T4：持久帧会话与来源／ROI 有效性

**Files:** 新增 `captureFrameSession.ts/.test.ts`；修改 `captureIpc.cjs/.test.cjs`、`preload.cjs`、桥类型声明、`nativeWindowCapture.ts/.test.ts`、`realtimeCapture.ts`，以及 `captureController.ts` 的诊断字段。先沿用 PNG 协议，不同时引入任意二进制跨进程协议。

**Interfaces:** 帧会话的 `captureFrame()` 仍产出真实 `CapturedArtifactFrame`；内部记录帧序号、源身份、物理尺寸、布局版本。新增桥能力受现有主 frame 授权约束，必要时使用固定 `open/read/close` 会话语义；持久来源失败回到同一来源原快照方法并显式显示。

- [ ] 1. 写红测试：枚举只在来源选择／刷新时发生，正常连续截图复用帧会话；初始化验证帧不当成后续 F8 新帧；来源退出后不能偷偷改拍屏幕或另一同名窗口。
- [ ] 2. 写红测试：窗口尺寸／DPI／布局变化使旧 ROI 失效；每帧锚点不匹配重新定位；持久会话没有新帧或为黑屏则拒绝，不能返回缓存帧伪装成功。
- [ ] 3. 写资源红测试：暂停／重启／关闭会话不泄漏；16 MiB 单图、128 MiB 合计、20 槽限制不变；迟到帧不能进入已取消批次；真正固定后才发捕获音。
- [ ] 4. 在 `apps/web` 运行相关 capture 单测及 `npm run test:electron` 确认新增断言红；实现帧会话与自动 ROI 生命周期，不更改库存或评分。
- [ ] 5. 重跑测试、连续 20 帧压力测试；实测截图成功时间与内存峰值，和 T1 基线同机对比。没有达到性能目标时报告原因，不用用户听到音效更早替代真实截图已完成。

### T5：首期集成、回归与可回退发布

**Files:** 修改 `RealtimeCapturePanel.tsx`、`CaptureJobList.tsx` 及测试显示实际引擎／路径／耗时；增加 `apps/web/tests/scanner-optimization.spec.ts`；更新本地打包配置、说明及新发布报告 `docs/reviews/2026-10-19-yas-optimization-p1.md`（实施时用实际日期）。

**Interfaces:** 使用现有 OcrDraftResult 和队列快照；候选默认开关不改变用户库存，任一路径结果都进入现有待确认流程。

- [ ] 1. 写红测试：快路径和回退路径都自动填完摘要；无需用户重填全部字段；失败仍可查看图／原文和用原图重试；不因完成通知抢预览或窗口焦点。
- [ ] 2. 执行完整单元、Electron 和 UI 测试；真实原生基准覆盖历史问题；针对两件属性相同、+17、待激活与 6.5% 做端到端回归；原有角色潜力和 UID 功能作为回归范围而非重新开发。
- [ ] 3. 在 `apps/web` 执行 `npm test`、`npm run test:electron`、`npm run test:ui`、`npm run lint`；根目录执行 `node --test scripts/*.test.mjs`。只对实际可执行的环境记录结果，缺依赖或真实样本写明阻塞，不能填通过。
- [ ] 4. 执行 `npm run desktop:build:local` 和 `npm run test:desktop-offline`；实际新包验证路径、模型／字表／许可完整性、无外网请求，以及 F8、双音、队列和回退。真实游戏前台 F8 未测时单列待验收。
- [ ] 5. 发布报告列出 n/N、误接受、拒识、median/P95、回退率、内存峰值、包大小与 SHA256。新包未过门槛不替换当前可用包；旧 EXE 回收仅在新包验收与旧进程退出后进行，不删除截图／数据／运行时。

## 四、P2 条件实施任务

以下为第二期边界和验收拆分，不代表已经授权操作游戏。启动 T6 前先审阅当前页扫描的 UI／自动鼠标范围和窗口身份验证；若新增原生能力与设计不同，应先更新设计，不边写边扩大权限。

### T6：纯逻辑单页控制器、切换检测和队列背压

**Files:** 新增 `pageScanTypes.ts`、`pageScanController.ts`、`pageScanLayout.ts`、`pageScanStability.ts` 及单元测试；有限扩展 `captureController.ts`、`captureQueueTypes.ts` 和测试。

**Interfaces:** 产出设计状态机与 `requestPageCapture`。依赖接口 `PageScanDriver` 仅提供目标有效性、当前页观测、选中指定 cell、紧急停止状态；纯逻辑测试使用假的 driver，不操作真实鼠标。坐标仅由已识别且校验过的客户区格位产生。

- [ ] 1. 写红测试：未知页／非背包页面拒绝开始；遍历顺序正确；最后一行空格不点击；四星不入库；选中状态未变化时超时暂停，不能截图上一件冒充下一件。
- [ ] 2. 写红测试：相邻两件同属性保留两个任务；以格位选中变化而不是 OCR 文本差异区分；强光／角色背景动画不能单独认定详情已稳定。
- [ ] 3. 写红测试：20 槽或图像预算耗尽前暂停，不点击下一格；用户释放容量后，原页签名匹配才继续；换页／重排／窗口变化不沿用旧格位；不自动确认入库腾空间。
- [ ] 4. 写红测试：失焦、取消、窗口销毁、右键紧急停止后无后续 click；旧异步回调不能恢复扫描；F8 手动与扫描生产者互斥且退出后恢复。
- [ ] 5. 运行新增测试确认红，实现单页状态机、稳定性与任务关联；配置稳定检测必须含至少 3 次连续观测、最长 1500 ms，失败显式暂停。观测不能每次重启截图枚举；采样开销计入诊断。
- [ ] 6. 重跑 `npm test -- src/capture`，用 30 格、20 槽模拟容量暂停／核对／续扫；每格都有成功 jobId 或明确未完成原因，无跨格串图、无静默跳格。

### T7：限制在目标窗口的原生输入与单页界面

**Files:** 新增 `pageScanIpc.cjs/.test.cjs`、`native-capture/PageScanInput.ps1`、`PageScanPanel.tsx/.test.tsx`；修改 main/preload／桥类型、`RealtimeCapturePanel.tsx`、capture 样式和本地打包配置。不重排其他主页面。

**Interfaces:** 只开放与已授权扫描会话绑定的开始／暂停／继续／停止和固定 cell 操作；目标绑定 HWND、进程 ID 与启动身份，输入侧复核前台与客户区。固定辅助脚本只接受有界 JSON 指令并隐藏运行，不接受任意脚本、命令或其他窗口目标。

- [ ] 1. 先用测试窗口写安全红测试：未授权 renderer、伪造会话、屏幕来源、目标进程复用、越界 cell、失焦和脚本异常全部拒绝；辅助脚本退出后主进程不得继续发输入。
- [ ] 2. 实现有限语义原生输入与独立紧急停止检测；鼠标右键出现后停止后续输入，以测试窗口记录延迟并报告，目标 150 ms 内，不以 OCR 阻塞停止监听。
- [ ] 3. 实现界面：手动 F8／当前页扫描切换、armed 切回游戏提示、逐格进度、容量／失焦暂停原因、当前页完成音和明确的“下一页继续”；不会主动拉起游戏或自动滚动。
- [ ] 4. 装备角色、锁定状态采用可选识别：识别失败显示未知，不覆盖现有记录；不向游戏发送锁定或装备操作。新增兼容测试证明老数据无这些字段仍可加载。
- [ ] 5. 执行 `npm run test:electron`、页扫描组件单测以及新增 `apps/web/tests/page-scan.spec.ts`；自动控制只在测试窗口／模拟驱动运行，真实游戏测试另列用户在场清单。

### T8：第二期真实窗口验收与发布

**Files:** 发布说明、打包清单与 `docs/reviews/<实际日期>-yas-optimization-p2.md`；保留 P1 回退开关和发布证据。

- [ ] 1. 先备份库存，构建并校验含固定辅助脚本的新包。备份／日志不包含公开上传的用户截图或 UID。
- [ ] 2. 用户在场并同意后，验证至少一整页：格位数量、顺序、同属性两件、待激活、目标失焦、右键停止、20 槽暂停续扫，以及手动翻页后明确继续。实测不通过不标记“单页扫描完成”。
- [ ] 3. 验证单页模式不能操作非目标窗口、不修改游戏锁定／装备、不自动翻页；退出后 F8 手动录入和双音正常。
- [ ] 4. 重跑首期回归和离线包验收，发布单一明确的最新本地 EXE 与校验值；清理旧包遵循 T5 条件。单页不可用时可关闭该模式继续使用 P1，不回滚库存数据。

## 五、执行前审阅与交付清单

- [ ] 用户审阅本计划与设计：确认 P0/P1 先交付，P2 单独启用，P3 不自动执行。
- [ ] 确认执行方式；建议当前会话顺序实施，便于统一处理取帧／字段坐标／IPC 的依赖。需要委派时先由用户选择，再使用子代理，不沿用历史模型名称自行指派。
- [ ] 实施记录逐项勾选；阶段验收没有证据则保留未完成状态。
- [ ] 最终交付必须分别回答：改了什么、实测快了多少、哪些图片仍会失败、是否已做真实游戏前台验收、如何回退以及新程序在哪里。

当前进度（2026-10-20）：T1–T7 开发与自动回归已实施，审查的 5 个 Important 问题已逐项复现并修复。T8 正在进行真实游戏验收与最终重打包：实际八列背包已识别 32 个完整格位；普通权限验收进程被 Windows 阻止向管理员游戏发送输入，尚不能标记单页实机验收完成。详细记录：[实施台账](../../../.superpowers/sdd/2026-10-19-yas-inspired-scanner-optimization/progress.md)。未经验证的条目保持未勾选，不把回放当作实机证据。
