# AI-Embedded Paper PDF Reader 项目总纲 / Project outline

架构与内存整改、测试范围及后续边界见 [性能说明 / Performance](PERFORMANCE.md)；保留数据的更新与回退步骤见 [更新说明 / Updates](UPDATING.md)。

See [performance and architecture](PERFORMANCE.md) for resource ownership and verification, and [updates](UPDATING.md) for data-preserving upgrade and rollback steps.

当前源码：客户端 0.1.45，构建 20261111.5，2026年11月11日。此文档记录产品设计和模块职责，不包含个人聊天、论文内容或模型配置。

首个公开正式版沿用 v0.1.11 和现有构建，使用 MIT 许可证。公开范围包括已核对的源码及通用 Windows 发行包；历史检查范围见 [公开发布说明](OPEN_SOURCE_RELEASE.md)，本地数据和请求边界见 [隐私说明](PRIVACY.md)。

Current source: **0.1.45 / 20261111.5**. A local PDF and ebook reader for close reading of papers and books, with optional AI questions, quick translation and personal notes. Public introductions and release notes are bilingual. Users can select one of eight interface languages in the app; interface language sets the default AI answer and translation languages without rewriting their documents, messages, notes or custom preferences.

PDF 显示保留有像素上限的整页底图；可视区域按屏幕密度重绘独立高清层，每页高清缓冲最多 800 万像素，仅在可见时保留。滚动复用边缘缓存并丢弃过期任务，页面移出视野或关闭时释放。高清层不接收鼠标事件，文字选取、引用跳转、批注及临时翻译继续使用原文字层。

PDF rendering keeps a bounded whole-page base bitmap and independently redraws visible areas at screen-aware detail density. Each detail buffer is capped at eight million pixels and retained only while visible. Scrolling reuses its margins and discards stale jobs; offscreen pages and unmounting release detail resources. The detail layer receives no pointer events, so text selection, reference navigation, annotations and temporary translations continue to use the original text layer.

Original application code was implemented entirely by GPT through Codex; the human initiator proposed ideas, defined requirements and selected features/trade-offs. Everyone may download and adapt it with AI agents or vibe coding. Please link to the upstream repository when publishing a derivative; MIT and third-party notices remain applicable. See [Attribution](ATTRIBUTION.md).

## 产品目标 / Product goal

让疑问留在原文旁。以文献、教材和 PDF 书籍精读为主要场景，在原文和 AI 回答中直接划选、提问、翻译与记录，并按需引用批注、展开并排讨论。

Keep questions beside their source. Support close reading of papers, textbooks and PDF books through in-place questions, translation and notes, with explicit annotation references and side-by-side chat when a question needs deeper discussion.

## 已确定规则

1. 划选后创建批注，草稿可选“询问 AI”或“只写批注”。
2. 每处高亮保留一组当前问答，成功后可编辑或重新提问；新回答成功后覆盖旧问答，失败或停止保留旧问答。本次重试固定本次问题与上下文，主动修改问题后才建立新的尝试。
3. 普通笔记不请求 API；批注框内不创建嵌套批注。
4. 平时只保留不同颜色的高亮，点击打开弹框。× 或 Esc 收起，点击正文和聊天不关闭，内容继续保存；独立的“停止回答”可中断生成并重试原问题。
5. 批注框可拖动，正文和高亮保持文字光标。编辑时关闭会保存修改，取消编辑则放弃本次修改。
6. 重新生成主回答得到独立版本，旧批注留在原版本，新版本不继承旧批注。
7. 聊天发送尚未删除的有效主对话及所选文档资料，默认不读取批注；点击输入框下方工具栏“引用批注”后，只把手动选择的问答或笔记加入该次问题。PDF 批注只引用所属文档、选段和本次问题，不带聊天及其他批注；在 AI 回答上提问时，仅引用批注绑定的那一版原回答。文档范围继续支持自动、全文或按需引用：自动模式下，小文件发送全文提取文字，超过 25 MiB、300 页或 12 万提取字符时在本机检索，每份文档最多引用 2.4 万片段字符，选段和问题另计。原 PDF 和页面图片不作为文件上传。资料不足时明确提示，全文仍受请求和模型容量限制。批注失败重试保留本次问题、回答偏好和文档范围，从同一份不可变来源重新组装请求，不保存整段聊天快照。失败残文不作为成功回答加入上下文。
8. 文件原字节保存在本机。阅读配色只改变显示，不改写 PDF。
9. 对话整体和批注的普通删除移入回收站；回收站支持恢复、单条永久删除和清空，永久删除对话时原子移除记录与附件原字节，正在排队的旧保存不能复活记录。历史自动备份和导出文件不随当前记录删除而改写。JSON 备份包含文档原字节和批注，追加导入不覆盖已有记录。
10. 模型配置与聊天分别存储，桌面凭证使用系统加密，不进入聊天备份或源码仓库。
11. 已保存的模型使用原生下拉列表；选择只加载配置，点击“使用”或“保存并使用”才切换。新增“其他”模板与常用服务快捷填写，地址、端口和模型名可修改；未开启鉴权的本机接口可留空密钥。
12. 接口格式表示通信的数据格式，与模型品牌分开。支持通用聊天兼容格式、Responses 和 Anthropic Messages；常用服务自动填写，显示名称调整不改变旧配置。Gemini 当前使用官方兼容入口。

13. 批注可自选预设色或自定义颜色，颜色和原批注一起保存、备份与恢复。改色不改变原文锚点、来源版本、当前问答或生成中的重新提问。
14. 首页、阅读设置和聊天设置提供八种界面语言。默认中文，选择单独保存在本机；界面翻译不写入聊天或备份，不更改回答偏好。桌面编辑菜单随所选语言切换，部分系统诊断提示回退英文。

English: Each highlight may use a preset or custom color. Color changes preserve the source anchor/version, current Q&A and in-flight replacement request, and survive save/backup/restore. Chinese is the default UI; the eight-language selector remembers a separate local preference, without changing paper or conversation content, model preferences or backup formats. Native editing menus follow the chosen language; some system diagnostics fall back to English. Existing profile and app identities stay stable across the rename.

15. 首页显示当前 API 与配置入口；模型列表通过用户填写的地址获取，支持兼容接口与 Claude 分页、筛选及手动兜底。获取不生成回答、不保存或启用配置，也不把旧密钥带到新地址。
16. PDF 上限调整为 150 MiB / 5000 页 / 1000 万提取字符；读取显示进度并可取消。画布和页面几何按需准备，滚动用二分定位，关闭仍等待保存。
17. 阅读器控件、边缘与批注浮框随纸张色变化。拖动颜色采用后台低分辨率预览，停下后恢复原分辨率；过期颜色任务不覆盖新结果，原 PDF 不改写。

English: The home screen exposes API setup and model discovery. PDFs support up to 150 MiB / 5,000 pages with cancellable extraction. Chat sends the remaining valid main conversation and document material, without automatically reading annotations. Reference annotations in the composer toolbar adds only the Q&A or notes you select to that question. A PDF annotation uses only its own document, selection and current question, without chat or other annotations. An annotation on an AI answer uses only its bound original answer version. Document scope still supports Auto, Full text and Relevant excerpts. Auto sends full extracted text for small files; above 25 MiB, 300 pages or 120,000 extracted characters, local retrieval sends at most 24,000 excerpt characters per document, with the selection and question additional. Original PDFs and page images are not uploaded as files. Missing evidence is disclosed, and full text remains subject to request/model limits. Failed annotation retries retain the question, answer preference and document scope and rebuild from the same immutable source, without storing a full-chat snapshot. Reader-wide colors use background previews followed by full-resolution refinement.

18. 每轮回答下方的“删除本轮”会直接删除本轮问题、全部回答版本及这些回答上的批注，不进入回收站；PDF 原文批注和文件保留。同时清除剩余失败回答的旧请求快照，后续聊天中对被删回答批注的手动引用也会移除，重试不会通过这些缓存带回已删内容。以前的自动备份、迁移存档和导出文件可能仍含旧内容。
19. 聊天主动引用最多 10 条已保存批注，发送时固定可见内容；批注提问成功后不保留请求快照，旧数据升级会清理重复上下文并保留原问答及重试设置。0.1.20 可读取旧备份，新字段需用 0.1.20 或更新版本恢复。

English: Delete round under each answer permanently removes that question, all answer versions and annotations attached to those answers, without Trash. PDF annotations and files remain. Remaining failed-answer snapshots and later manual references to the removed answer annotations are also cleared, so retries cannot restore deleted content through these caches. Earlier automatic backups, migration archives and exports may still contain old content. Explicit references copy at most ten saved annotations per chat question. Successful responses retain no redundant request snapshots; old annotation caches are converted to small retry settings while preserving visible Q&A. Use v0.1.20 or newer to restore backups with the new fields.

输入区只放文字输入，下方工具栏集中放本地文件、引用批注、模型选择及发送。批注数量并入按钮，窄栏按实际宽度缩短标签；模型管理仍可从模型列表末项或上方设置打开。

The composer keeps typing above one lower toolbar for local files, annotation references, model selection and Send. The reference button includes a count badge; labels adapt to the composer width. Model management remains available from the final selector option or the top settings control.

聊天模式关闭 PDF 后保持聊天可见，顶部“展开 PDF”及聊天文件名可一键恢复并排阅读，沿用原页码与缩放。左上角长项目名按侧栏宽度换行。选中 PDF、AI 回答或聊天问题中的文字，可通过浮动按钮或右键“引用到聊天”，在输入框预览选段、补充问题再发送，不创建批注或自动调用 API。每次引用一段，重新选择会替换待发送段落，可用 × 取消。

Closing a PDF in chat keeps the conversation visible. Open PDF at the top, or the file name in chat, restores side-by-side reading with the saved page and zoom. Long branding wraps inside the sidebar. Select text in a PDF, AI answer or chat question and use Quote in chat from the selection action or context menu, preview the excerpt, add a question and send. This creates no annotation and makes no automatic API call. One pending excerpt can be replaced or removed with ×.

批注在点击聊天、正文、翻页和切换阅读布局时保持打开，用 × 或 Esc 收起；编辑中的修改在关闭或切换来源时保存。切换文件或对话会收起批注。临时翻译继续保持原来的框外点击、Esc / × 关闭及滚动保留规则；同时展开时，Esc 优先关闭翻译。

Annotations stay open while clicking chat/source text, turning pages or changing reading layout; use × or Esc to close. Pending edits are saved when closing or leaving the source. Switching documents or conversations dismisses the annotation. Temporary translation retains outside-click, Esc/× dismissal and scroll retention; when both panels are open, Esc dismisses translation first.

文字引用与本轮问题一起保存和备份，聊天仍按原设置带入有效聊天与文档资料。它与“只发送选段”的翻译功能不同；批注提问仍不引用聊天或其他批注。删除被引用的聊天轮次时，后续问题中的相关文字引用副本与旧重试缓存也会清除，PDF 引用和原文批注保留。新版本可读取旧备份，含文字引用的备份请使用 v0.1.22 或更新版本恢复。

Text quotations are saved and backed up with the question. Chat still uses valid history and document material according to existing scope settings, unlike selection-only translation. Annotation questions still exclude chat and other annotations. Deleting a quoted chat round clears its later quotation copies and stale retry snapshots while retaining PDF quotations and annotations. Older backups remain readable; restore backups with text quotations using v0.1.22 or newer.

## 模块职责 / Modules

| 模块 | 实现位置 | 职责 |
| --- | --- | --- |
| 划词翻译 / Quick translation | src/components/Translation.tsx、src/domain/translation.ts、src/adapters/translation.ts、server/translation.mjs | 独立选段请求、临时结果、共享连接与 Alt+1 / Isolated selection requests, temporary results, shared connections and Alt+1 |
| PDF 链接 / PDF links | src/adapters/pdf-links.ts、PdfAnnotatedPage.tsx、DocumentReader.tsx | 文内坐标定位和返回 / Internal destinations and return navigation |
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
| 文字引用与阅读重开 / Text quotations and reader reopening | `src/domain/chat-text-reference.ts`、`src/components/ChatTextReference.tsx`、`src/adapters/reader-session.ts` | 选段副本、来源版本、恢复并排模式与旧状态兼容 / Quoted snapshots, source versions, split-mode recovery and legacy sessions |
| 批注引用与逐轮删除 / Annotation references and round deletion | `src/domain/chat-references.ts`、`src/components/ChatAnnotations.tsx`、`src/domain/workspace.ts` | 主动选择、内容副本、整轮删除与失败缓存清理 / Explicit selection, visible copies, round removal and stale retry cleanup |
| 共享快照与增量保存 | `src/domain/context-pool.ts`、`src/domain/workspace-codec.ts`、`src/adapters/record-store.ts` | 失败聊天的不可变快照、批注小型重试设置、成功快照清理、内容去重及事务迁移 |
| 模型预载与协议 | `src/domain/model-presets.ts`、`src/components/SettingsDialog.tsx`、`src/adapters/model.ts`、`server/` | 原生下拉选择连接、其他服务及本地模型快捷填写，配置管理和三种文字流式协议 |
| 回收站与永久删除 | `src/domain/trash.ts`、`src/components/TrashDialog.tsx`、存储事务与保存队列 | 恢复、确认删除、清空与关联文件清理 |
| 本机自动备份与退出 | `desktop/backup-store.cjs`、`desktop/desktop-bridge.cjs`、`desktop/preload.cjs` | 完整检查点、内容校验、恢复入口和退出保存握手 |
| 桌面运行与诊断 | `desktop/` | Electron、系统代理、加密凭证和安全诊断日志 |

以上源码路径均相对于 `outputs/client/`。模块当前在同一应用内运行，逐步改善接口边界，后续拆分保持数据和备份兼容。

## 技术选型

React、TypeScript、Vite、assistant-ui、Recogito Text Annotator、Streamdown、KaTeX、PDF.js、Dexie、AI SDK、Electron 与 electron-builder。具体版本锁定在 `outputs/client/pnpm-lock.yaml`。

## 当前边界

- PDF 最多 150 MiB、5000 页、1000 万提取字符；TXT/Markdown 最多 25 MiB、100 万字符，每个对话最多 10 份文件。
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


## 模型选择 / Model selection

连接名称只作本地备注；在上游模型下拉框中选择实际调用模型，保存并使用后生效。模型按名称及自然数字顺序排列，手动输入按需展开，保留未列出的自定义模型。

Connection names are local labels. Choose the actual API model in the upstream list and Save and use. Models sort by name with natural numbers; manual entry expands on demand and preserves unlisted custom models.


验证：243 项自动检查、555 项交付核对及两次实际 EXE 启动、保存、备份和退出通过。隔离界面验证名称自然排序、默认隐藏重复输入、手动未列出 ID 保留、重新从列表选择后收起输入，以及中英提示。从列表选择 model-2 后，实际模拟聊天请求中的 model 为 model-2，而非显示别名或本地连接名称。未使用个人配置或真实 API。

Validation: 243 tests, 555 package checks and two real EXE startup/save/backup/exit checks passed. Isolated UI testing covered natural sorting, hidden duplicate input, retained manual unlisted IDs, returning to list selection and both languages. Selecting model-2 produced model-2 in the actual mocked chat request, rather than its friendly label or local connection name. No personal settings or real API calls were used.

本机清理：核对原 ZIP 哈希及旧程序逐文件内容后，移除 0.1.12–0.1.14 程序、ZIP、校验和旧说明，以及临时构建和明确隔离的测试副本，共 19 处、2,052,401,296 字节。发行目录只保留 0.1.15，真实个人数据、源码/Git 历史及已公开 Release 资产保留。

Local cleanup removed 19 verified old release/build/test targets (2,052,401,296 bytes). The release directory retains only 0.1.15. Personal data, source/Git history and published GitHub assets remain intact.

## 划词翻译与 PDF 链接 / Translation and PDF links

选中文字后右键翻译或按默认 Alt+1；右上角独立“翻译”按钮可设置目标语言、提示词、独立 API 及自定义快捷键。连接列表共用，翻译选择不切换聊天。只发送选段和翻译提示词，不发送全文、所在页或聊天历史。临时面板显示译文和模型，框外点击、Esc 或 × 关闭并丢弃；点击保留后才创建普通批注。翻译设置单独记在本机，不进入聊天备份。

Select text and right-click to translate or press Alt+1. The separate Translate button configures the target language, prompt, independent API and shortcut. Connections are shared without switching chat. Only the selection and translation prompt are sent, without full text, page or history. Outside click, Esc or × discards temporary text/model results; Keep creates a plain note. Settings stay local outside conversation backups.

PDF 自带的参考文献和图号链接支持文内精确跳转，并可返回跳转前位置。HTTP/HTTPS 网页链接交由系统浏览器打开，不执行脚本或文件动作；没有原生链接的文字不猜测跳转。深色配色修正彩色字边缘的白色残影，原 PDF 不改写。

Embedded PDF references/figure links navigate to their page positions, with return navigation. HTTP/HTTPS links open in the system browser; scripts and file actions are not executed. No destination is guessed for unlinked text. Dark colors correct white halos around colored text without modifying the PDF.

## 翻译滚动保留 / Translation while scrolling

滚动时保留翻译框，连续阅读暂留当前翻译的来源页，滚远后仍可保留为原位置的批注。普通框外点击、Esc 或 × 关闭，拖动滚动条不会关闭。

The translation panel remains open while scrolling, retaining its source page in continuous reading so it can still be saved as a note at the original passage. Ordinary outside click, Esc or × closes it; dragging the scrollbar does not.


## 聊天阅读位置 / Chat reading position

聊天按对话分别记住上次阅读的位置。正常退出后重新打开聊天，会回到上次的段落；上次在底部则回到最新回答。窗口宽度变化、聊天与 PDF 并排/专注阅读切换时，优先按回答和段落定位，避免只按像素恢复导致偏移。首次打开没有位置记录的历史对话时，显示最新内容。

Chat remembers the reading position separately for each conversation. After a normal exit, reopening chat returns to the last paragraph, or to the latest answer if it was at the bottom. Reply and paragraph anchors preserve the reading location across window resizing and PDF/chat layout changes. Existing conversations without a saved position initially show their latest content.

主动发送新问题时继续显示新回答；生成中手动向上阅读会暂停跟随，仍可通过“回到对话底部”查看最新内容。退出、切换对话和暂时收起聊天时都会保留位置；字体、公式或页面晚到的排版更新不会立即覆盖保存的位置。原定位的回答被删除或切换版本时，回退到附近仍存在的消息。

Sending a new question still follows the new answer. Manually scrolling upward during generation pauses following; the bottom button remains available. Positions survive exiting, switching conversations and hiding chat. Delayed font, formula or content layout does not overwrite the saved location. Deleted or replaced source answers fall back to a nearby surviving message.

聊天阅读位置只在本机保存对话/回答标识及显示位置，不复制聊天正文、PDF 文字或密钥，不进入聊天备份，也不发送给 AI。回收站中的对话可继续保留位置以供恢复，永久删除对话时清理其位置记录。

Chat reading preferences store only local conversation/reply identifiers and display positions. They contain no message text, PDF text or credentials, are excluded from conversation backups and are never sent to AI. Recycled conversations retain their preferences for recovery; permanent conversation removal clears the saved position.


## 首页功能截图 / Homepage screenshots

首页展示批注问答、引用批注、并排讨论与快速翻译的四张真实客户端截图。截图在独立演示资料中拍摄，使用虚构 PDF 和本地模拟回复，部分裁切以突出操作区域。`docs/images/` 只开放明确列出的四个 PNG；画面审阅、格式及审阅哈希检查见 [仓库规则](REPOSITORY_POLICY.md)。

The homepage shows four actual client screenshots covering annotation Q&A, annotation references, side-by-side discussion and quick translation. They use an isolated profile, a fictional PDF and local mock responses, with some captures cropped for clarity. Only the four named PNG files are allowed under `docs/images/`; see [Repository policy](REPOSITORY_POLICY.md) for visual review, format and reviewed-hash checks.

## 图片批注问答 / Image Q&A annotations (0.1.26)

在 PDF 工具栏点击“框选图片”，选中整幅图及坐标、图例或图注，在紧凑批注中点击“圈出疑问”。默认画圈，也可选择画笔、颜色和粗细，支持撤销与清空。保留圈画后输入问题，选择已保存的视觉模型连接即可提问。点击缩略图可临时放大，默认侧栏宽度约 280–320px；窄窗口移到页面下方。批注可拖动，用 × 或 Esc 收起，再点原图选区重新打开。

Choose Select image in the PDF toolbar, include the figure with its axes, legend or caption, then choose Circle a detail in the compact annotation. Circle is the default; pen, colors, widths, undo and clear are available. Keep the markings, enter a question and select a saved image-capable connection. Click the thumbnail to enlarge it. The default panel is about 280–320px wide and moves below the page in narrow windows. Drag the panel or close it with × or Esc; click its source region to reopen it.

只有主动发送图片问题时，才向所选连接发送本次原始配色选图、圈画、问题及所属文档的文字资料；小文件默认全文，大文件按需引用，不带聊天及其他批注。重新提问成功后才替换原问答和圈画。明确只支持文字的连接可在设置中标记并提前阻止请求；未知能力依据上游明确错误提示，不会自动发送测试图片或产生探测调用。

Only sending an image question transmits its original-color crop, markings, question and source-document text to the selected connection. Small files use full text and large files use relevant excerpts by default, without chat or other annotations. A successful re-question replaces the old Q&A and markings; failures keep them. Mark known text-only connections in settings to block image requests. Unknown capabilities are classified from explicit upstream errors, without automatic probe images or billable test calls.

保存和备份只新增文档关联、页码、相对选区及矢量笔迹，不为每条图片批注持久保存截图或 Base64。重新打开时从已保存 PDF 还原选图；原 PDF 仍按原附件机制保留。派生原色选图采用最多 32 MiB / 24 项的临时缓存，发送图片最多 1 MiB、最长边 1800px、200 万像素；活动预览、合成画布与 PDF 页面内存另计，收起或关闭后释放相应资源。图片批注备份请用 v0.1.26 或更新版本恢复。

Storage and backups add only the document association, page, normalized region and vector markings, without a persisted screenshot or Base64 copy for each annotation. Images are regenerated from the saved PDF; the original PDF remains an attachment. Derived original-color crops use a transient cache capped at 32 MiB / 24 entries. A transmitted image is capped at 1 MiB, 1800px per edge and two million pixels. Active previews, compositing canvases and PDF page memory are separate and released when no longer needed. Restore image-annotation backups with v0.1.26 or newer.

模块职责：FigureSelectionLayer 管理页内选区；FigureDrawingEditor 管理矢量圈画；FigureAnnotationPanel 复用现有批注编辑、重问与保存流程；adapters/figure 复用已加载 PDF 按选区渲染和压缩；server/vision 校验有界内联图片并向三种既有协议映射；持久化编解码只保存坐标和笔迹。所有真实图片请求沿用现有本机代理和凭证管理。

Module responsibilities: FigureSelectionLayer manages page regions; FigureDrawingEditor manages vector markings; FigureAnnotationPanel reuses annotation editing, re-questioning and persistence. The figure adapter renders bounded crops from the loaded PDF. server/vision validates bounded inline images and maps them to the three existing protocols. Storage codecs retain coordinates and vectors. Image requests use existing local proxy and credential handling.

## 图片快捷键与聊天设置 / Image shortcut and chat settings (0.1.27)

新增 Ctrl+Alt+A 图片框选快捷键，在 PDF 原排版中按下即可开始框选，再按一次或按 Esc 取消；输入文字、使用输入法和设置弹窗期间不会触发。聊天模式左下角提供独立“设置”入口，可直接切换中文 / English，查看快捷键并进入共享模型/API 连接管理；语言选择在本机记住。

Ctrl+Alt+A starts image selection in the original PDF view; press again or Esc to cancel. It does not trigger while editing text, composing input or using settings dialogs. A dedicated Settings entry at the bottom left of chat provides Chinese/English selection, a shortcut reminder and shared model/API connection management. The interface language is remembered locally.

## 多语言与批注缩放 / Languages and resizing (0.1.28)

语言选择框改为单层轻边框，去掉原来的棕色焦点框。界面新增西班牙语、日语、繁体中文、德语、阿拉伯语和法语，含简体中文及英语共八种语言；主要操作界面本地化，部分帮助和技术诊断回退英文。阿拉伯语界面从右向左排列，PDF、图表、公式、代码及原始内容保留各自方向。语言选择仅保存在本机，不会翻译或改写论文、聊天与批注正文。

The language picker uses one subtle border, replacing the brown focus frame. Spanish, Japanese, Traditional Chinese, German, Arabic and French join Simplified Chinese and English. Core controls are localized; some help and technical diagnostics fall back to English. Arabic uses a right-to-left interface while PDFs, figures, formulas, code and source content retain their own direction. Language preferences stay local and do not translate or rewrite papers, conversations or annotation content.

文字批注、图片问答和翻译浮窗可通过四边、四角拖拽调整大小，内容溢出时在框内滚动；保留标题栏拖动。双击缩放边角恢复默认大小，聚焦缩放手柄后可用方向键微调（Shift 加快）。窗口变小时约束尺寸，保持关闭按钮可见。尺寸只保留在当前打开的浮窗，不增加图片缓存或请求。

Text annotations, image Q&A and translation popups can be resized from every edge and corner, with internal scrolling and existing title-bar dragging. Double-click a handle to reset; focus it and use arrow keys for adjustments, with Shift for larger steps. Viewport limits keep the close control reachable. Sizes remain only in the open popup and create no image cache or model request.

主要界面翻译为静态本机字库，繁体字库仅转换程序自有模板，插值中的文件名与用户内容原样保留。新增语言没有自动调用翻译 API。

Core translations are static local catalogs. The Traditional Chinese catalog converts only application-owned templates; interpolated filenames and user content remain verbatim. Language changes make no translation API call.

## 图片批注占位修复 / Image dock layout fix (0.1.32)

修复图片批注拖走后，PDF 底部或侧边仍留下一大块空白的问题。拖动标题栏或缩放边角时自动改为浮窗，立即释放原停靠占位；PDF 恢复完整阅读区域。标题栏新增图钉按钮，可手动停靠或取消停靠。同一文档的本次阅读中，关闭再打开图片批注会继续使用浮窗模式；重新停靠会恢复默认尺寸和停靠位置。问答、圈画与编辑草稿保持原样。

Fixes the blank area left below or beside the PDF after moving an image annotation away. Dragging its title bar or resizing switches it to a floating popup and releases the reserved dock space, restoring the full reading area. A pin button also docks or undocks it explicitly. Reopening image annotations in the same document session retains floating mode; docking restores default size and placement. Q&A, markings and editing drafts are preserved.

停靠状态仅在当前阅读器实例的界面内存中保留，不写入文档、批注记录、备份或模型请求。浮窗占位节点脱离文档流，不截获 PDF 上的鼠标操作；圈画对话框仍保持可交互。

Docking state lives only in the current reader instance, outside documents, annotation records, backups and model requests. A floating host is outside document flow and does not intercept PDF pointer input; the drawing dialog stays interactive.


## AI 与翻译语言联动 / AI and translation languages

聊天、文字批注和图片批注的默认 AI 回答语言跟随界面语言，八种语言均生效。默认翻译目标和默认翻译提示词也跟随界面；在翻译设置中选择“自定义目标语言”可固定译文语言。自己写的回答偏好和翻译提示词原样保留；回答偏好或本次问题中明确指定的语言优先。旧版内置的固定中文默认提示词自动按当前界面处理，不批量改写保存的连接。切换仅影响新请求；已发出的请求、失败重试、旧回答和已有译文保持原样。语言切换本身不会发起模型调用，也不会翻译或改写文档及批注正文。

Default AI answer languages for chat, text annotations and image Q&A follow all eight interface languages. The default translation target and built-in translation prompt follow the interface too; choose Custom target language to keep a fixed target. Custom response preferences and translation prompts remain verbatim, with explicit language requests in response preferences or the current question taking priority. Exact legacy built-in Chinese defaults are resolved for the current interface without bulk-editing saved connections. Changes apply to fresh requests; sent requests, failed retries, existing answers and existing translations remain unchanged. Changing language makes no model request and does not translate or rewrite documents or annotation content.


## 批注操作布局 / Annotation action layout

修复批注“重新提问”时发送按钮紧贴输入框、遮挡焦点外圈的问题，输入区与操作区保留明确间距。文字批注和图片问答的发送、编辑、重问及重试操作栏按可用宽度换行，图标保持清晰，长错误信息自动换行；拖动改变批注大小或拉高输入框后，按钮仍在输入区下方。修复窄窗口下日语、德语等界面中模型/翻译设置的底部按钮和语言选择框溢出。

Fixes the Send and replace button touching the re-ask input and covering its focus ring, with a clear gap between the input and its actions. Send, edit, re-ask and retry actions in text and image annotations wrap to fit the available width while icons retain their size and long error messages wrap inside the panel. Actions stay below the input after resizing a popup or increasing the input height. Also fixes narrow-dialog overflow in model and translation footers and the language picker, including Japanese and German interfaces.


## 提问圈画的显示范围 / Question marking scope

圈画只显示在图片问答预览与圈画编辑器中，并叠加到主动发送给 AI 的选图；PDF 原页不再显示提问用的圈线或画笔。已有圈画、问答与重新提问草稿继续保留，原页的选区入口仍可用于重新打开图片批注，无需重新导入 PDF。

Question markings appear only in the image Q&A preview and drawing editor, and are included in the selected image explicitly sent to AI. The PDF source page no longer displays these circles or pen strokes. Existing markings, answers and replacement drafts remain intact; the source-region locator still reopens image annotations, without reimporting the PDF.

## 共享附件自动备份 / Automatic backups with shared attachments

v0.1.36 起，自动恢复点仅保存工作区记录和附件引用，附件以内容哈希在独立本地备份库共用。资料库的 PDF 原件与备份库的恢复副本保持独立，避免资料库损坏时失去唯一文件。旧自动备份采用有界分块读取、校验、发布替代副本和安全移除的流程转换；保留 5 个普通及最多 2 个升级恢复点，并在所有保留点都不再引用某附件时回收它。手动完整 JSON 导出保持自包含。详情与实测见 [性能和存储说明](PERFORMANCE.md)。

Since v0.1.36, automatic recovery points store workspace records and file references, sharing content-addressed attachments in a separate local backup store. Library originals and backup copies remain independent so library damage cannot destroy the only copy. Older automatic backups convert through bounded reads, integrity checks, durable replacement and safe removal. Retain five ordinary and up to two upgrade points; collect an attachment only when no retained point references it. Manual complete JSON exports stay self-contained. See [performance and storage](PERFORMANCE.md) for details and measurements.

## v0.1.39：电子书模块边界 / Ebook module boundaries

- 文件入口与资料层：扩展已知文档类型，保留原书和每章稳定 ID、文本及标题。旧 PDF 结构不变，既有增量保存、文件去重、共享附件和恢复流程继续使用。
- 解析层：`adapters/ebooks.ts` 负责固定版本 EPUB/MOBI 解析器、有限解压、DRM 检查、章节资源预算和生命周期；不加载第二套 PDF 引擎。
- 阅读层：`EbookReader` 按需显示一章，书内 HTML/CSS 与应用隔离，禁用脚本和远端资源。字体、行距、宽度和章节/段落位置单独保存为本机偏好。
- 交互层：复用 AnnotatedAnswer、AnnotationCard、翻译和引用聊天；框内原生 Range/CSS 高亮保持位置，不复制成页面图片。跨阅读区域坐标转换集中在 annotation-surface。
- 请求边界：批注仍只引用所属原书和本条问题，不引入聊天及其他笔记；翻译只发选段；小书默认全文，大书按需引用。PDF 图片问答不改变。

The file/data layer adds known ebook kinds and stable chapter IDs, text and titles while preserving PDF records and existing incremental saves, deduplication and shared backups. The ebook adapter owns bounded parsing and resource lifecycle. EbookReader renders one inert isolated chapter with separate typography/progress preferences. Existing annotation cards, translation and chat-reference UI are reused; native ranges/highlights reflow without page-image copies. Requests keep the existing source/chat isolation and selected-text-only translation boundaries. The PDF engine and figure Q&A are unchanged.

## v0.1.40：字号与整体缩放 / Typography and page zoom

整体缩放由 `adapters/ebook-zoom.ts` 管理：固定逻辑正文宽度，使用原生 CSS zoom 同比例显示当前章，复用仅含事件/数学处理的精确滚轮控制，不加载另一套渲染引擎，也不创建页面画布。批注范围继续对应原 DOM。字号和正文宽度属于独立排版偏好；缩放与横向位置是每本书的位置偏好，旧记录缺少新字段时使用 100%。框内范围位置继续使用浏览器视口坐标，外层浮窗保持原尺寸。

The ebook zoom adapter fixes logical content width and uses native CSS zoom, reusing precision-wheel handling without another rendering engine or page canvas. Annotation ranges remain in the same DOM. Typography stays independent; per-book zoom/horizontal position extend reading preferences with 100% defaults for older records. Native range coordinates locate source selections while outer popups retain normal UI dimensions.

## v0.1.42：独立排版和快译重开 / Separate typography and repeat translation

`ReaderToolbar` 在电子书中提供 Aa 排版入口。`EbookReader` 根据视口和排版设置确定逻辑宽度，缩放控制器只改变显示倍率。每本书沿用已保存的字号、行距和正文宽度，旧版的手动锁定不再生效。快译关闭后只在内存中记住一个原文选段和锚点，同一快捷键可在原文仍可见时重译；切换来源、保存译文或退出时清除。资料库和备份格式不变。

`ReaderToolbar` exposes Aa Typography only for ebooks. `EbookReader` derives the logical width from the viewport and typography, and the zoom controller changes only the display scale. Existing font size, spacing and width are preserved per book, while legacy locks are no longer applied. Dismissing quick translation remembers one passage and anchor in memory; the same shortcut translates it again while it remains visible. Leaving the source, saving the translation or exiting clears it. Database and backup formats are unchanged.
