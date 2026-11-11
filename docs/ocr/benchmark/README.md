# 私有真实 OCR 基准

运行 `apps/web` 下的 `npm run test:ocr-real`。先 `npm run prepare:ocr`；运行过程只允许127.0.0.1及本地blob，真实Tesseract worker，不加载CDN。首次准备资源需可信上游缓存，正常构建不联网。

样本清单在根目录 `tests/private/ocr/manifest.json`，至少10张真实中文游戏截图、五部位均覆盖。每例人工标注setKey、slot、level、main(key/value)、subs(key/value)；roi是原帧像素坐标，从名称顶部至套装名末行，包括部位、主词条、+等级及副词条，不含2/4件套说明。主词条和数值必须逐项看原图，不用OCR结果反向充当答案。

副词条顺序不影响比较，类型、数量、每个数值必须完全一致；3.9识别成9.9整件失败。总数>=10，覆盖五部位且整件完全正确率>=90%才通过。错误项、原始文本、置信度和耗时记录在同目录latest-report.json。禁止删难样本抬分，调整只能针对通用识别流程，保留失败记录。

图片、清单及原文报告均私有，不复制到public/dist/release，不公开含UID画面，不上传识别接口，也不擅自修改原图。用户10张原图引用根目录bc截图；历史问题图已遗失，其文本只用于解析回归，不算图像基准。

包级离线测试：先 `npm run desktop:build:local`，再 `npm run test:desktop-offline`。测试实际app.asar的file入口与真实worker，主动阻断HTTP/HTTPS；使用独立临时测试配置，不读取或修改用户现有仓库。覆盖截图校准/识别/确认、手动保存、关闭重开、原图加载、JSON导出、空库及恢复，输出外网请求数。它不是实际原神窗口/F8/DPI测试，也不是用户现有配置的升级实测。
