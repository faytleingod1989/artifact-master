# 角色原版头像替换记录

2026-10-01，用户确认：替换界面10个角色的循环占位头像，使用角色自己的游戏头像、本地离线可用，保留自定义头像和仓库，生成新EXE。此次仅是头像显示修正，不代表上次改版所有待验收项已经完成。

## 来源与对应关系

角色ID/iconName以本地游戏数据提交`26df1dfbdf05a82bbb1d97506859f3e1c40718d8`中的AvatarExcelConfigData和中文名称核对，图像来自[Enka游戏图标镜像](https://github.com/EnkaNetwork/API-docs/blob/master/docs/gi/api.md#icons-and-images)。不是生成头像；10张原始PNG均256×256，不改色、不重绘、不压缩或预裁。

|界面角色|角色ID|原图资源|
|---|---|---|
|月之少女·哥伦比娅|10000125|UI_AvatarIcon_Columbina|
|木偶·桑多涅|10000133|UI_AvatarIcon_MarionetteNew|
|兹白|10000126|UI_AvatarIcon_Zibai|
|杜林|10000123|UI_AvatarIcon_Durin|
|法尔伽|10000128|UI_AvatarIcon_Varka|
|奈芙尔|10000122|UI_AvatarIcon_Nefer|
|雷电将军|10000052|UI_AvatarIcon_Shougun|
|那维莱特|10000087|UI_AvatarIcon_Neuvillette|
|芙宁娜|10000089|UI_AvatarIcon_Furina|
|阿蕾奇诺|10000096|UI_AvatarIcon_Arlecchino|

逐文件URL/字节数/尺寸/SHA-256见同目录`character-portraits.source.json`。原图放在`apps/web/src/assets/characters/originals`并排除源码跟踪；仅DEV或personal模式装入本地包。公开模式是明确占位，不把游戏原图当开源许可资产分发。没有查询任何UID，也不在运行时请求图像镜像。

## 实现与数据保护

- `CharacterPortrait`统一用于角色页签及本地素材预览；自定义图片优先，其次为本角色游戏原图；加载失败显示明确缺图占位，不借用其他角色，不返回此前三张虚构头像。
- 图片使用contain/居中，头像容器不被弹性布局压扁；保留原界面圆形头像样式。
- 原始头像不写入用户localStorage/IndexedDB或JSON备份；原有自定义图键不变，不改圣遗物、队列、回收站和角色规则。
- 当前目录无Git；修改前副本在`.superpowers/snapshots/character-avatars-20261001`，旧warehouse版EXE及更早EXE仍保留。
- 源文件：`src/assets/characters/{portraits,localPortraits.dev}.ts`、`src/components/CharacterPortrait.tsx/.css`、`src/App.tsx`；额外头像哈希/公开隔离/私有可达性检查接入原构建门禁，不放宽旧220张圣遗物审计。

## 验收结果

先观察3个头像行为回归失败（仍循环虚构头像、素材页错误默认图、坏图无占位），修改后App23/23通过。全套168/168（34文件），Electron15/15，根脚本8/8，浏览器5/5，lint无警告。新增mode覆盖production/staging/local拒绝、personal正确对应、未知角色不猜。

两种desktop构建通过。首构建被新测试误用Playwright的exact选项触发类型检查拒绝，纠正Testing Library查询后通过；首公开构建被原门禁拒绝私有路径文字，增加公开resolver早返回让Vite剔除路径，未弱化门禁。

实际Windows Electron最终本地app.asar：逐角色检查10张不同原图、naturalWidth/Height=256、contain，全部离线加载，外网请求0；截图保存在`apps/web/output/playwright/character-portraits-packaged.png`。同一隔离profile继续通过真实OCR、手动录入、进程关闭重开、原图圣遗物、空库及JSON备份恢复，未读写用户现有配置。ASAR逐文件哈希：本地10头像、公开0，私有截图/报告/测试文件未进入包。

## 使用新版

`E:/AI Project/YS/apps/web/release-local/ArtifactMaster-0.1.0-avatars-20261001-local.exe`

大小110704094字节；SHA-256：`CD92FAFA3927AC70D90447589B201121C76EFF52EA4D0D3B5129A0F6A9E7AC82`。文件名区分旧版本，应用ID及产品名不变；使用前建议另导出JSON备份。此记录是作者测试及逐图核对，不冒充独立子代理复核。
