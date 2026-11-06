# AI-Embedded Paper PDF Reader 项目总纲 / Project outline

当前版本：客户端 0.1.14，构建 20261106.3，2026年11月6日。此文档记录产品设计和模块职责，不包含个人聊天、论文内容或模型配置。

首个公开正式版沿用 v0.1.11 和现有构建，使用 MIT 许可证。公开范围包括已核对的源码及通用 Windows 发行包；历史检查范围见 [公开发布说明](OPEN_SOURCE_RELEASE.md)，本地数据和请求边界见 [隐私说明](PRIVACY.md)。

Current source: **0.1.14 / 20261106.3**. A local paper reader with optional AI questions and personal notes. Public introductions and release notes are bilingual. Users can select Chinese or English in the app; interface language never rewrites their documents, messages, notes or answer preferences.

Original application code was implemented entirely by GPT through Codex; the human initiator proposed ideas, defined requirements and selected features/trade-offs. Everyone may download and adapt it with AI agents or vibe coding. Please link to the upstream repository when publishing a derivative; MIT and third-party notices remain applicable. See [Attribution](ATTRIBUTION.md).

## 产品目标 / Product goal

让问题留在原文旁。在 AI 回答和论文文字中直接划选、提问和记录，减少主对话与原文之间的反复滚动。

Keep questions beside their source. Select, ask and take notes directly in AI answers and paper text, reducing scrolling between the conversation and the original passage.

## 已确定规则

1. 划选后创建批注，草稿可选“询问 AI”或“只写批注”。
2. 每处高亮保留一组当前问答，成功后可编辑或重新提问；新回答成功后覆盖旧问答，失败或停止保留旧问答。本次重试固定本次问题与上下文，主动修改问题后才建立新的尝试。
3. 普通笔记不请求 API；批注框内不创建嵌套批注。
4. 平时只保留不同颜色的高亮，点击打开弹框。× 或框外点击收起，内容继续保存；独立的“停止回答”可中断生成并重试原问题。
5. 批注框可拖动，正文和高亮保持文字光标。编辑时关闭会保存修改，取消编辑则放弃本次修改。
6. 重新生成主回答得到独立版本，旧批注留在原版本，新版本不继承旧批注。
7. 发送问题会发送完整有效主对话；附件默认小文件全文、大文件按需引用，另带选中文字及所在页片段。原文件留在本机。自动模式在超过 25 MiB、300 页或 12 万提取字符时使用本地关键词检索，每份引用片段最多 2.4 万字符；选区和对话另计。阅读设置可切换全文或按需引用，工具栏显示范围。失败重试沿用首次请求的资料；资料不足会明确提示，全文仍受请求与模型容量限制，不静默截断主对话。失败残文不作为成功回答加入上下文。
8. 文件原字节保存在本机。阅读配色只改变显示，不改写 PDF。
9. 普通删除移入回收站；回收站支持恢复、单条永久删除和清空，永久删除对话时原子移除记录与附件原字节，正在排队的旧保存不能复活记录。历史自动备份和导出文件不随当前记录删除而改写。JSON 备份包含文档原字节和批注，追加导入不覆盖已有记录。
10. 模型配置与聊天分别存储，桌面凭证使用系统加密，不进入聊天备份或源码仓库。
11. 已保存的模型使用原生下拉列表；选择只加载配置，点击“使用”或“保存并使用”才切换。新增“其他”模板与常用服务快捷填写，地址、端口和模型名可修改；未开启鉴权的本机接口可留空密钥。
12. 接口格式表示通信的数据格式，与模型品牌分开。支持通用聊天兼容格式、Responses 和 Anthropic Messages；常用服务自动填写，显示名称调整不改变旧配置。Gemini 当前使用官方兼容入口。

13. 批注可自选预设色或自定义颜色，颜色和原批注一起保存、备份与恢复。改色不改变原文锚点、来源版本、当前问答或生成中的重新提问。
14. 首页、阅读设置和模型设置提供简体中文 / English。默认中文，选择单独保存在本机；界面翻译不写入聊天或备份，不更改回答偏好。桌面编辑菜单和退出提示跟随所选语言。

English: Each highlight may use a preset or custom color. Color changes preserve the source anchor/version, current Q&A and in-flight replacement request, and survive save/backup/restore. Chinese is the default UI; the Chinese/English selector remembers a separate local preference, without changing paper or conversation content, model preferences or backup formats. Native editing menus and exit prompts follow the chosen language. Existing profile and app identities stay stable across the rename.

15. 首页显示当前 API 与配置入口；模型列表通过用户填写的地址获取，支持兼容接口与 Claude 分页、筛选及手动兜底。获取不生成回答、不保存或启用配置，也不把旧密钥带到新地址。
16. PDF 上限调整为 150 MiB / 5000 页 / 1000 万提取字符；读取显示进度并可取消。画布和页面几何按需准备，滚动用二分定位，关闭仍等待保存。
17. 阅读器控件、边缘与批注浮框随纸张色变化。拖动颜色采用后台低分辨率预览，停下后恢复原分辨率；过期颜色任务不覆盖新结果，原 PDF 不改写。

English: The home screen exposes API setup and model discovery. PDFs support up to 150 MiB / 5,000 pages with cancellable extraction. Auto mode sends full small documents and locally retrieved excerpts for large ones while preserving the complete valid conversation. Retries keep their original request material. Reader-wide colors use background previews followed by full-resolution refinement.

## 模块职责 / Modules

| 模块 | 实现位置 | 职责 |
| --- | --- | --- |
| 模型列表 / Model discovery | `server/model-discovery.mjs`、`server/profiles.mjs`、`src/components/SettingsDialog.tsx` | 限时列表请求、认证隔离、分页和筛选 / Bounded listing, isolated authentication, pagination and filtering |
| 资料范围 / Document scope | `src/domain/document-context.ts`、`src/adapters/document-context.ts` | 本地检索、范围说明、全文兜底与固定请求 / Local retrieval, scope disclosure, full text option and frozen requests |
| 大文件限制 / Large-file limits | `src/domain/document-limits.ts` | 解析、保存、恢复共用限制 / Shared parsing, storage and recovery limits |
| 后台配色 / Background colors | `src/adapters/pdf-color.ts`、`src/adapters/pdf-color.worker.ts`、`src/domain/pdf-color.ts` | 合并过期请求、预览、清晰重绘和降级 / Latest-job scheduling, previews, refinement and fallback |
| 界面语言 / Interface language | `src/i18n/`、`src/components/LanguageSelector.tsx` | 独立本机偏好、字典、动态提示与菜单翻译 / Local preference, catalog and UI/native-menu translation |
| 批注颜色 / Highlight colors | `src/domain/highlight-colors.ts`、`src/components/HighlightColorPicker.tsx` | 预设与自定义颜色、输入校验及原批注完整性 / Presets, custom colors, validation and annotation integrity |
| 对话与回答版本 | `src/domain/workspace.ts`、`src/App.tsx` | 对话、版本切换、失败续聊与上下文 |
| 文字选区与高亮 | `src/components/AnnotatedAnswer.tsx` | Recogito 高亮、引用锚点与右键操作 |
| PDF 鼠标定位 | `src/domain/pdf-selection.ts`、`src/adapters/pdf-selection.ts` | 文字块及字符边界、反向拖选与边缘滚动 |
| 批注规则与界面 | `src/domain/workspace.ts`、`src/components/AnnotationCard.tsx` | 可覆盖的问答、普通笔记、编辑和恢复 |
| 可移动弹框 | `src/components/MovableAnnotationPopup.tsx` | 拖动与视窗内定位 |
| PDF 与文字阅读 | `src/adapters/documents.ts`、`src/components/DocumentReader.tsx` | 本机解析、原排版、文字层、翻页与缩放 |
| PDF 完整帧与手势 | `src/adapters/pdf-frame.ts`、`src/adapters/pdf-zoom.ts`、`src/domain/pdf-zoom.ts` | 后台绘制换色后同步显示、手势合并、临时预览及原文位置补偿 |
| 本地阅读首页与目录 | `src/components/ReaderHome.tsx`、`src/hooks/useLocalLibrary.ts`、`src/domain/local-library.ts` | 默认本地阅读、内容分组、重复打开复用、旧批注显示投影及按需对话 |
| 阅读会话 | `src/adapters/reader-session.ts` | 本机续读文档引用；不进入聊天备份，引用失效时回到阅读首页 |
| 紧凑阅读工具栏 | `src/components/ReaderToolbar.tsx` | 单行导航、按需设置、配色及模型入口；专注模式移除重复顶栏 |
| 阅读导航与搜索 | `src/domain/reader-navigation.ts`、`src/components/ReaderNavigation.tsx`、`src/adapters/reader-search.ts`、`src/adapters/reader-location.ts` | 本机搜索索引、结果标记、批注筛选与精确原文跳转 |
| 连续页面与目录 | `src/components/PdfAnnotatedPage.tsx`、`src/adapters/pdf-navigation.ts`、`src/components/DocumentReader.tsx` | 附近页面绘制、串行任务取消、混合页尺寸、目录内部位置解析与阅读点保持 |
| 阅读配色与进度 | `src/domain/reader.ts`、`src/adapters/reader.ts` | 显示副本换色、本机配色和按文档保存位置 |
| 本机保存与备份 | `src/adapters/storage.ts`、`src/hooks/useWorkspace.ts` | Dexie 元数据、独立文档字节表、保存屏障、容量门槛及完整 JSON |
| 共享快照与增量保存 | `src/domain/context-pool.ts`、`src/domain/workspace-codec.ts`、`src/adapters/record-store.ts` | 不可变完整上下文、内容标识去重、按记录事务提交及旧记录迁移 |
| 模型预载与协议 | `src/domain/model-presets.ts`、`src/components/SettingsDialog.tsx`、`src/adapters/model.ts`、`server/` | 原生下拉选择连接、其他服务及本地模型快捷填写，配置管理和三种文字流式协议 |
| 回收站与永久删除 | `src/domain/trash.ts`、`src/components/TrashDialog.tsx`、存储事务与保存队列 | 恢复、确认删除、清空与关联文件清理 |
| 本机自动备份与退出 | `desktop/backup-store.cjs`、`desktop/desktop-bridge.cjs`、`desktop/preload.cjs` | 完整检查点、内容校验、恢复入口和退出保存握手 |
| 桌面运行与诊断 | `desktop/` | Electron、系统代理、加密凭证和安全诊断日志 |

以上源码路径均相对于 `outputs/client/`。模块当前在同一应用内运行，逐步改善接口边界，后续拆分保持数据和备份兼容。

## 技术选型

React、TypeScript、Vite、assistant-ui、Recogito Text Annotator、Streamdown、KaTeX、PDF.js、Dexie、AI SDK、Electron 与 electron-builder。具体版本锁定在 `outputs/client/pnpm-lock.yaml`。

## 当前边界

- 单文件最多 25 MiB，PDF 最多 300 页，提取文字最多 100 万字符，每个对话最多 10 份文件。
- 阅读器支持分页和连续模式；只绘制视野附近页面，打开的批注页保留。目录来自 PDF 内嵌结构，搜索范围是本机已提取文字。
- 搜索列出前 200 处并显示完整匹配总数；批注分批列出，可继续加载。文字批注仍在单页内选择，跨页选区、缩略图、书签及 OCR 为后续工作。
- 扫描页可看和换色，当前不含 OCR 或图像内容理解。
- 阅读配色和进度是本机界面偏好，当前不随聊天 JSON 备份导出。
- 桌面继续沿用原应用标识、端口和数据目录，保持旧版聊天与加密模型配置兼容。
- 模型调用按服务商实际能力与权限执行。自动测试使用模拟接口，真实服务商验证单独记录。

## 验证记录

0.1.6 的最近一次客户端检查为 129 项通过，交付包核对为 528 项通过。阅读交互验证覆盖完整摘要正向和反向选择、适合宽度、125% 缩放、并排阅读、复制、批注重开和边缘滚动。原目录桌面启动使用隔离测试数据及演示模式完成。

这些记录描述基准版本的已完成验证；未来每次修改需重新执行与变更相关的检查。

0.1.7 已通过 154 项自动检查、543 项交付包核对及两次独立的实际 EXE 启动/退出检查。浏览器界面实测停止、重试原问题、关闭后继续生成、完整导出、追加恢复及重开批注。未读取个人凭证或调用真实付费模型。验收范围包括批注停止与原问题重试、关闭后继续生成、保存失败重试、容量拒绝时不改动原状态、备份损坏与磁盘写入失败、恢复事务回滚以及桌面退出握手。桌面备份位于本机数据目录的 Backups 子目录，保留最近 5 份，不上传到代码仓库。恢复错误记录时另在本地数据库保留最近 3 份原记录副本。

0.1.9 已完成完整上下文快照共用和按记录增量保存。0.1.11 增加连续阅读、内嵌目录、全文搜索和可筛选批注总览。浏览器版保留手动导入导出，自动文件备份与退出握手由桌面版提供。

0.1.8 新增覆盖问答与回收站永久删除，169 项自动检查、547 项交付包核对和打包/交付目录两次实际 EXE 保存退出检查通过。交互实测覆盖模拟断网保留旧问答、修改新问题后成功替换、刷新和恢复后重开新问答，以及对话/批注回收站、永久删除和清空的确认与取消。永久删除和附件清理通过隔离数据库的事务提交、失败回滚及并发旧保存测试验证；不使用个人聊天测试删除。

## 0.1.9 保存与升级约定

完整上下文以不可变消息和公共前缀保存，每条批注只引用快照；发送给模型时仍完整还原本次上下文。消息、回答版本、批注、附件元数据和页面分别保存，变化记录和当前索引在同一事务提交。退出共用保存屏障，连续更新只保留尚未提交的最新状态；其他窗口的旧版本不能静默覆盖新记录。永久删除同步清理当前库中无引用的快照，历史备份和迁移存档仍独立保留。

桌面首次读取旧格式时，先成功生成包含附件原字节的旧版兼容备份，再原子迁移；失败不覆盖原记录。本地数据库名称和版本号保持不变，旧格式原记录另保留最近 2 份迁移存档。正常自动备份保留 5 份，升级前文件副本另外保护最近 2 份。浏览器版仅保留数据库中的迁移存档，不自动生成文件备份。

默认导出及自动备份采用紧凑 JSON 格式 2，新版仍可读取格式 1。备份窗口可选择全部记录（含回收站）或当前对话，并提供“兼容旧版导出”。需要回退到 0.1.8 时，先在新版导出兼容文件，再关闭新版、用旧版“从备份恢复”；也可选择升级前文件副本，但其中不包含升级后的修改。旧版不能直接读取紧凑格式，不能把保留旧程序误认为自动回退所有新数据。

185 项自动检查通过，新增覆盖格式往返、完整附件恢复、冻结重试、迁移备份及事务失败、共享引用校验、流式增量、过期保存合并、多窗口旧状态和升级备份轮换。546 项交付包核对、打包和交付目录的两次隔离实际 EXE 保存退出通过；浏览器实测从 0.1.8 升级保留高亮问答、演示流式替换、刷新重开及两种格式和范围的导出入口。100 万字符加 10 条批注的合成记录由 11,011,174 字节降至 2,014,113 字节（81.71%）；30 次流式更新每次最多提交 3 条记录、2,432 字节。测量仅指序列化元数据，使用隔离内存数据库，不代表实际磁盘或真实模型耗时。

## 0.1.10 PDF 配色与缩放

PDF 的白底渐进绘制、文字层构建和配色处理全部在后台完成，再同步发布完整画面。缩放和阅读区域改宽时先缩放已完成的页面，手势短暂停止后补充清晰画面；翻页等待时沿用纸张底色。换色失败保留底色和切换入口，不自动显示刺眼的白底原图；主动选择原色或原色对照仍显示原样。

阅读区域支持 Chromium 触控板双指捏合及 Ctrl + 滚轮缩放，普通双指滑动继续滚动。手势增量每帧合并，保留微小变化，范围沿用 50%–250%；缩放围绕手势位置补偿滚动，按钮围绕视口中心。高亮、文字选择与阅读进度在新画面完成后重新对齐。事件依据 [MDN wheel 文档](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)，不改变聊天区缩放。

195 项自动检查、547 项交付包核对及打包/交付目录两次隔离实际 EXE 保存退出通过。浏览器以相同合成 PDF 对照：0.1.9 检出 7 帧白底角落采样，0.1.10 深色与暖黄的翻页、缩放和阅读区宽度变化采样均为 0；模拟双指放大缩小、原文位置补偿、实际滚动、划选保存及缩放翻页后重开高亮通过。检测只描述本次测试，未在物理触控板上执行手势。源文件、批注锚点和保存格式不变。

构建 20261105.5 按用户手感反馈将捏合和 Ctrl + 滚轮灵敏度提高 50%，按钮及普通滚动沿用。用户要求清理积累版本后，交付目录仅保留当前 0.1.10、其完整 ZIP 和校验文件；旧程序、旧 ZIP、程序回退副本及临时打包内容清理，源码与 Git 历史、开发依赖、聊天、模型配置和数据备份保留。现有程序目录直接更新，195 项自动检查、542 项交付核对和两次隔离实际 EXE 保存退出通过。共清理 21 处交付物与临时副本，5,243,591,847 字节（约 4.88 GiB）；更新后先验证当前程序，再清除临时打包目录。

## 0.1.11 第三轮阅读效率

连续模式只绘制视野附近页面并保留当前打开的批注页；PDF 目录、全文搜索和批注总览共用按需展开的文档导航。搜索不改写原文节点，批注跳转先恢复精确引用范围，避免等待离屏高亮而停在页首。阅读位置增加模式与页内偏移，本机旧偏好仍可读取，不改变聊天格式、数据库或模型配置。

206 项自动检查、551 项交付包核对及打包/交付目录两次隔离实际 EXE 启动、保存、完整备份和正常退出通过。合成 30 页 PDF 实测目录跳转、混合页尺寸、1050 处全文匹配/前 200 处列表、键盘切换、原排版与文本标记、批注筛选、离屏返回原句、位置恢复与窄窗口浮层；界面零错误。暖黄 1165 帧、深色 1906 帧测试记录均未观察到白底角落采样；这是本次合成文档测试，不代表所有 PDF。模拟手势已测试，物理触控板手感待用户体验，未调用真实模型或读取个人数据。

此机的应用控制策略拒绝了修改资源后的运行文件；保留官方 Electron 原字节后实际启动通过。构建脚本固定该方式并验证完整文件哈希及默认运行时设置不变，未修改 Windows 安全策略。客户端版本以界面顶部为准。当前只保留 0.1.11 程序目录、完整 ZIP 与校验文件，Git 历史和个人数据独立保留。

## 0.1.11 构建 20261105.7 滚动与空间修正

PDF 默认连续滚动，旧版单页偏好首次升级也采用连续阅读；随后在“阅读设置”中手动选择单页会保存该选择。专注阅读仅保留一条 48px 工具栏，合并重复标题、移除常驻提示；显示方式、翻页方式、配色、原色对照、模型与备份移到按需设置浮层，打开设置不挤占正文。旧偏好保留，使用 v2 阅读位置键记录新选择，聊天格式、原文件与模型配置不改动。

208 项自动检查通过。隔离界面从实际旧版升级，同一合成 PDF 复现旧版滚到第 1 页底部停止；新版实际滚轮跨到第 2、4 页，并可反向滚动。1280×720 测试中正文视口顶部由 223.5px 降至 48px，400px 窄窗口仍为单行且无横向溢出。单页选择重开保留、连续模式重开、设置浮层/ESC/模型入口、聊天切换、原文搜索及模拟缩放均验证，界面零错误。未使用个人记录或真实 API，物理触控板手感仍待用户体验。

本构建另通过 551 项交付包核对，打包目录和原交付目录均实际启动、保存、生成完整备份并正常退出；原 0.1.11 文件夹与完整 ZIP 已同步更新，仅保留当前可用程序。

## 0.1.11 构建 20261105.8 本地阅读优先

程序默认进入本地阅读器。首次使用可从“打开本地 PDF”直接选择文件；已有续读记录时恢复上次文档，关闭文档回到阅读首页。PDF 顶栏左侧可打开其他本地文件，右侧原位置按需打开聊天；窄窗口聊天覆盖阅读器，收起后保留原文档和页码。

本地阅读记录按原文件字节的 SHA-256 分组，同内容改名仍复用，同名不同内容保持独立；只对相同大小的候选读取原字节，结果仅缓存在本机内存。再次从阅读器打开同一文件不新增记录。对话里的“本地文件”默认折叠，重复文件只列一次。已有重复条目只合并显示，同一对话的批注按页映射到当前原文；原始记录、来源标识、冻结上下文和备份不改写，其他对话的阅读记录仍可从首页展开。

214 项自动检查通过。隔离界面验证真实本地文件选择器、首次阅读首页、续读、重复打开与改名复用、同名不同内容区分、对话文件折叠及窄窗口聊天后仍保留第 20 页。实际旧构建创建 6 份相同 PDF 和两条批注，升级后只显示一份且两条均可打开，旧问答重新提问成功；升级前后导出的原文件字节、批注 ID、来源版本与锚点逐项一致。界面零错误，未读取个人资料或调用真实 API。

本构建另通过 551 项交付包核对，打包目录和原交付目录均实际启动、保存、生成完整备份并正常退出；原 0.1.11 文件夹和完整 ZIP 已同步更新，仅保留当前可用版。


## 0.1.13 验收 / Validation

验证：239 项自动检查、555 项交付包核对通过。隔离界面验证首页 API 入口、未填模型名获取并筛选模型、约 34 MB / 321 页 PDF 打开及远页/末页导航、快速连续换色、中英文切换与刷新恢复，以及小文件自动全文。模拟失败后切换资料范围，重试的实际请求资料哈希保持一致。打包目录与交付目录均实际启动、保存、备份并正常退出，界面无错误。未使用个人资料或真实 API。真实服务商权限和物理选色手感仍待使用体验。

Validation: 239 automated tests and 555 package checks passed. Isolated UI checks covered the home API entry, fetching/filtering models without a model name, opening a roughly 34 MB / 321-page PDF, distant/final-page navigation, rapid color changes, both languages with reload persistence and small-file full text. After a simulated failure and scope change, the actual retry material retained the same hash. Both packaged and delivered executables passed startup, save, backup and normal exit with no renderer errors. No personal data or real API calls were used; actual provider permissions and physical picker feel remain subject to usage.


## 0.1.14 模型探照修正 / Model discovery fix

模型列表共用 server/model-endpoint.mjs 推导地址，兼容完整推理接口而不改保存配置或密钥。NativeSelect 统一首页与设置箭头。首页探测入口与配置分开，已有连接可直接读取；未找到接口时显示实际路径和 HTTP 状态，列表缺失可手填。

The shared model endpoint helper derives the sibling list API from full inference addresses without modifying saved settings/keys. NativeSelect unifies home/settings arrows. Home discovery is separate from setup and fetches usable saved connections directly. The UI shows the path/HTTP failure state and retains manual entry.


验证：241 项自动检查、555 项交付包核对通过。严格模拟服务只接受 /v1/models，实际界面验证保存的完整 /v1/responses 地址可直接探测、筛选选择并保存；空模型名获取、本机空密钥、错误路径与 HTTP 404 的中英提示均通过。点击首页箭头区域展开原生列表，36px 箭头区中心差为 0、文字留白 48px。两次实际 EXE 启动、保存、完整备份和退出通过，界面无错误。未读取个人配置或调用真实 API；真实服务商是否开放模型列表仍需其服务确认。

Validation: 241 tests and 555 package checks passed. A strict mock accepted only /v1/models; the UI fetched from a saved full /v1/responses address, filtered/selected and saved models. Blank model names, keyless local services and bilingual path/HTTP 404 feedback were checked. Clicking the home arrow opened the native list; its 36px arrow area had zero center offset and 48px text clearance. Two real EXE startup/save/full-backup/exit checks passed with no renderer errors. No personal settings or real API calls were used; actual provider list availability remains service-dependent.
