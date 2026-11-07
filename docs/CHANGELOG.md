# 版本记录 / Changelog

## 0.1.23 · 20261107.3 · 2026-11-07

聊天文件栏改用居中的矢量箭头，并明确显示“展开 / 收起”，避免原来依赖字体的小字符箭头错位。纯聊天模式下，顶部同时提供“展开 PDF”和“阅读模式”：前者恢复 PDF 与聊天并排显示，后者直接返回专注阅读，均沿用文档的阅读页码与缩放。

The chat file bar now uses a centered vector chevron with explicit Expand / Collapse labels. Pure chat provides two separate actions: Open PDF restores side-by-side reading, while Reading mode returns directly to focused reading. Both retain the document's page and zoom.

修复不等号及否定关系符号（≠、不属于、非子集等）的斜线错位。原因是公式渲染器与加载的 KaTeX 样式版本不一致；现在统一为同一版本，并在全局加载本地样式与字体。修复覆盖聊天回答、批注问答、普通批注、临时翻译及流式显示。旧回答重新显示即可应用，无需重新生成。

Fixed misplaced negation slashes in not-equal, not-in and not-subset relations. The renderer and its KaTeX stylesheet had different versions; they now use the same pinned version with locally bundled styles and fonts. The correction applies to chat, annotation answers, plain notes, temporary translations and streaming output. Existing answers use the corrected layout when displayed, without regeneration.

277 项自动检查和 60 项实际 PDF 界面及公式检查通过。完整解压 Windows x64 ZIP，正常退出旧版后运行新目录的 AI-Embedded-Paper-PDF-Reader.exe。沿用原本机数据目录、聊天、批注及 API 配置。普通阅读与上述界面切换不调用 API；本次更新不改变提问、批注或翻译的发送范围。

277 automated tests and 60 real PDF UI and formula checks passed. Fully extract the Windows x64 ZIP, exit the old app normally and run AI-Embedded-Paper-PDF-Reader.exe from the new folder. Existing local data, chats, annotations and API settings remain in use. Reading and these interface switches make no API requests; this update does not change the context sent by chat, annotation or translation requests.

## 0.1.22 · 20261107.2 · 2026-11-07

聊天模式关闭 PDF 后保持聊天可见，顶部“展开 PDF”及聊天文件名可一键恢复并排阅读，沿用原页码与缩放。左上角长项目名按侧栏宽度换行。选中 PDF、AI 回答或聊天问题中的文字，可通过浮动按钮或右键“引用到聊天”，在输入框预览选段、补充问题再发送，不创建批注或自动调用 API。每次引用一段，重新选择会替换待发送段落，可用 × 取消。

Closing a PDF in chat keeps the conversation visible. Open PDF at the top, or the file name in chat, restores side-by-side reading with the saved page and zoom. Long branding wraps inside the sidebar. Select text in a PDF, AI answer or chat question and use Quote in chat from the selection action or context menu, preview the excerpt, add a question and send. This creates no annotation and makes no automatic API call. One pending excerpt can be replaced or removed with ×.

批注在点击聊天、正文、翻页和切换阅读布局时保持打开，用 × 或 Esc 收起；编辑中的修改在关闭或切换来源时保存。切换文件或对话会收起批注。临时翻译继续保持原来的框外点击、Esc / × 关闭及滚动保留规则；同时展开时，Esc 优先关闭翻译。

Annotations stay open while clicking chat/source text, turning pages or changing reading layout; use × or Esc to close. Pending edits are saved when closing or leaving the source. Switching documents or conversations dismisses the annotation. Temporary translation retains outside-click, Esc/× dismissal and scroll retention; when both panels are open, Esc dismisses translation first.

文字引用与本轮问题一起保存和备份，聊天仍按原设置带入有效聊天与文档资料。它与“只发送选段”的翻译功能不同；批注提问仍不引用聊天或其他批注。删除被引用的聊天轮次时，后续问题中的相关文字引用副本与旧重试缓存也会清除，PDF 引用和原文批注保留。新版本可读取旧备份，含文字引用的备份请使用 v0.1.22 或更新版本恢复。

Text quotations are saved and backed up with the question. Chat still uses valid history and document material according to existing scope settings, unlike selection-only translation. Annotation questions still exclude chat and other annotations. Deleting a quoted chat round clears its later quotation copies and stale retry snapshots while retaining PDF quotations and annotations. Older backups remain readable; restore backups with text quotations using v0.1.22 or newer.

验证：275 项自动检查和 40 项实际 PDF 界面检查通过，覆盖原页重开、标题换行、三种文字引用、实际模拟请求、删除清理、批注编辑保存、翻译关闭优先级及刷新恢复；全部使用虚构文档和隔离资料。

Validation: 275 tests and 40 real PDF UI checks passed, covering page restoration, wrapped branding, three quotation sources, actual mocked requests, deletion cleanup, note edits, translation dismissal priority and reload recovery, using synthetic documents and isolated profiles.

## 0.1.21 · 20261107.1 · 2026-11-07

优化聊天输入框：上方只保留文字输入，下方集中放本地文件、引用批注、模型与发送按钮，并增加间距及轻分隔线。批注数量并入按钮，窄栏自动缩短标签，模型下拉箭头保持居中；重复的“管理模型”入口收进模型列表，顶部设置继续可用。

Refines the chat composer: typing stays above one lower toolbar for local files, annotation references, model selection and Send, with more spacing and a subtle divider. Selected annotations use an inline count badge, labels adapt to narrow panes and the model arrow stays centered. Model management remains in the selector and top settings rather than repeating a text button.

验证：269 项自动检查及 73 项实际界面检查通过；覆盖中英文、288–640px 输入栏、批注选中/清除，以及原有引用、删除与重试。

Validation: 269 tests and 73 real UI checks passed, covering Chinese/English, 288–640px composer panes, selecting/clearing references and existing reference/deletion/retry behavior.

## 0.1.20 · 20261106.9 · 2026-11-06

聊天发送尚未删除的有效主对话及所选文档资料，默认不读取批注；点击输入框上方“引用批注”后，只把手动选择的问答或笔记加入该次问题。PDF 批注只引用所属文档、选段和本次问题，不带聊天及其他批注；在 AI 回答上提问时，仅引用批注绑定的那一版原回答。

Chat sends the remaining valid main conversation and document material, without automatically reading annotations. Reference annotations above the composer adds only the Q&A or notes you select to that question. A PDF annotation uses only its own document, selection and current question, without chat or other annotations. An annotation on an AI answer uses only its bound original answer version.

每轮回答下方的“删除本轮”会直接删除本轮问题、全部回答版本及这些回答上的批注，不进入回收站；PDF 原文批注和文件保留。同时清除剩余失败回答的旧请求快照，后续聊天中对被删回答批注的手动引用也会移除，重试不会通过这些缓存带回已删内容。以前的自动备份、迁移存档和导出文件可能仍含旧内容。

Delete round under each answer permanently removes that question, all answer versions and annotations attached to those answers, without Trash. PDF annotations and files remain. Remaining failed-answer snapshots and later manual references to the removed answer annotations are also cleared, so retries cannot restore deleted content through these caches. Earlier automatic backups, migration archives and exports may still contain old content.

已完成回答清理请求快照，批注失败重试只保存偏好和文档范围；旧缓存自动转换，保留可见结果。聊天新增可搜索批注选择器，发送时固定所选副本，每次最多 10 条。269 项自动检查、21 项实际界面检查通过；原文全文/按需范围及旧数据恢复规则见[本版说明](RELEASE_NOTES.md)。

Completed responses discard request snapshots. Annotation retries store preference/scope only; legacy caches are converted without losing visible results. Chat adds a searchable annotation picker with a sending-time copy of up to ten selections. 269 automated tests and 21 real UI checks passed. See [release notes](RELEASE_NOTES.md) for full/relevant source scope and backup compatibility.

## 0.1.19 · 20261106.8 · 2026-11-06

正式发布说明汇总 v0.1.15 之后的划词翻译、滚动保留译文、PDF 引用跳转、深色链接配色和高清阅读更新；README 的主要功能与开始使用新增中英双语划词翻译介绍。此次发布文档整理保留已验证的客户端与 ZIP 字节。

Release notes collect selection translation, retained translation panels, PDF reference navigation, dark link colors and sharper reading since v0.1.15. The README now highlights translation in its bilingual main features and getting-started steps. Release documentation leaves the verified application and ZIP bytes unchanged.

新增可视区域高清重绘，改善整页像素上限导致的高倍放大发虚。整页底图继续限制内存，可视区域单独按屏幕密度绘制，每页高清缓冲最多 800 万像素；滚动复用边缘，过期任务丢弃，移出视野后释放缓存和 Worker。高清层不拦截鼠标，配色及原色对照同步，文字选取、引用跳转和批注层沿用原位置。

Adds high-resolution visible-area redrawing to improve enlarged text softened by the whole-page pixel limit. The bounded base bitmap remains, while visible regions render separately at screen-aware density with at most eight million detail pixels per page. Scrolling reuses margins, discards stale work and releases offscreen caches/workers. The detail layer does not intercept pointer events; colors and original comparison stay synchronized, and selection, reference navigation and annotations retain their original geometry.

## 0.1.18 · 20261106.7 · 2026-11-06

深色纸张下，PDF 自带引用、图号等文字链接统一使用柔和浅蓝色，并根据纸张颜色保持可读对比度。链接字形与全部抗锯齿边缘一并换色，避免仅修补邻接像素时遗漏白色残影。范围限定为链接与提取文字的交集，图片链接不会整块变色；原色对照与浅色纸张保留原有显示。缩放、快速配色预览和后台换色使用相同的文字范围，PDF 跳转及个人批注颜色保留。

On dark paper, embedded PDF text links such as citations and figure references use a soft light blue with readable contrast against the selected paper. Glyphs and all antialiased edges change together, avoiding white halos missed by neighboring-pixel repairs. Recoloring is limited to the intersection of links and extracted text, so image links are not recolored as a whole. Original comparison and light paper retain their existing rendering. Zooming, quick color previews and background recoloring share the same text regions; PDF navigation and personal highlight colors remain available.

## 0.1.17 · 20261106.6 · 2026-11-06

移除翻译框的滚动关闭行为，暂留当前翻译的来源页，保证跨页阅读后仍能保存回原位置。框外点击与滚动/拖动区分，Esc 和 × 继续关闭。默认 Alt+1 与选段请求范围不变。

Translation panels now remain open during scrolling, retaining their source page for note saving after cross-page reading. Outside clicks are distinguished from scrolling/dragging; Esc and × still close the panel. Alt+1 and selection-only requests are unchanged.

## 0.1.16 · 20261106.5 · 2026-11-06

新增右键 / Alt+1 划词翻译：独立 API 与提示词，只发送选段；临时结果可转普通笔记。恢复 PDF 自带的引用、图号链接及返回位置，修正深色背景下彩色字边缘白色残影。完整规则与验证见[本版发布说明](RELEASE_NOTES.md)。

Adds right-click / Alt+1 translation with its own API and prompt, selection-only requests and optional plain-note saving. Restores embedded PDF reference/figure navigation and return positions, and corrects colored-text white halos on dark paper. See [release notes](RELEASE_NOTES.md) for details and validation.

验证：251 项自动检查、558 项交付核对及两次实际 EXE 启动 / 保存 / 完整备份 / 退出通过，163 份允许公开源码检查通过。隔离界面和实际备份验证仅发送选段、保留才保存、独立模型与 PDF 链接位置；未使用个人资料或真实 API。

Validation: 251 tests, 558 package checks, two real EXE startup/save/full-backup/exit checks and the 163-file public source review passed. Synthetic UI and actual-backup checks covered selection-only requests, explicit note saving, independent models and PDF link positions. No personal material or real API was used.

## 0.1.15 · 20261106.4 · 2026-11-06

发布文档：重写双语 README，突出自选 API / 自部署模型服务、PDF 阅读、可调纸张配色、AI 问答批注和可选聊天；隐私说明区分本地密钥存储与发往所选服务的请求认证。新增[本版发布说明](RELEASE_NOTES.md)，汇总自公开 v0.1.12 以来的更新。此次文档整理不改动已验证的 0.1.15 程序和 ZIP 字节。

Release documentation: the bilingual README now foregrounds your own API / self-hosted model service, PDF reading, adjustable paper colors, AI Q&A annotations and optional chat. Privacy wording distinguishes local credential storage from authentication sent to the chosen service. [Release notes](RELEASE_NOTES.md) collect updates since public v0.1.12. This documentation update leaves the verified 0.1.15 application and ZIP bytes unchanged.

“连接名称”是本地备注；模型 ID 是实际发给 API 的调用名称。获取列表后，直接在“上游模型”中选择，点击“保存并使用”生效。默认收起重复的手动输入框，保留“手动填写模型名称”入口；手动填写的未列出模型会明确显示，不会被列表静默覆盖。

The connection name is a local label; the model ID is the actual API identifier. After discovery, select the upstream model and Save and use. The duplicate text field is hidden by default, with a manual-entry option retained. An unlisted manually entered model remains explicitly visible and is not silently replaced.

列表按实际模型 ID 的名称顺序排列，忽略大小写并按自然数字排序，例如 model-2 排在 model-10 前。可读别名放在 ID 后面，排序和显示不改写实际调用 ID。

Models are sorted by their actual IDs, case-insensitively with natural numeric order: model-2 precedes model-10. Friendly labels follow the ID; sorting/display never changes the identifier sent to the API.

界面验证使用模拟连接与模型：从列表选择后发出真实的本机模拟聊天请求，核对请求中的 model 为所选 ID，未读取个人配置或调用真实 API。正常退出旧版后运行新版，继续沿用原聊天、批注、阅读设置和模型连接。已公开的历史 Release 与附件保持原样。

Isolated UI validation selects a model and verifies the model ID in an actual local mocked chat request. No personal settings or real API calls are used. Exit the old app normally before running the new version; existing conversations, annotations, reading settings and connections remain in use. Published historical releases/assets are unchanged.

原创应用代码全部由 GPT 通过 Codex 实现；人类发起者负责想法、需求与功能取舍。欢迎下载、fork 和使用 AI agent / vibe coding 改造；发布衍生版时请链接[上游项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。MIT 与第三方许可继续适用。

GPT through Codex implemented all original application code; the human initiator supplied ideas, requirements and feature trade-offs. Download, fork and adapt with AI agents / vibe coding; please link [upstream](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing derivatives. MIT and third-party licenses continue to apply.


验证：243 项自动检查、555 项交付核对及两次实际 EXE 启动、保存、备份和退出通过。隔离界面验证名称自然排序、默认隐藏重复输入、手动未列出 ID 保留、重新从列表选择后收起输入，以及中英提示。从列表选择 model-2 后，实际模拟聊天请求中的 model 为 model-2，而非显示别名或本地连接名称。未使用个人配置或真实 API。

Validation: 243 tests, 555 package checks and two real EXE startup/save/backup/exit checks passed. Isolated UI testing covered natural sorting, hidden duplicate input, retained manual unlisted IDs, returning to list selection and both languages. Selecting model-2 produced model-2 in the actual mocked chat request, rather than its friendly label or local connection name. No personal settings or real API calls were used.

本机清理：核对原 ZIP 哈希及旧程序逐文件内容后，移除 0.1.12–0.1.14 程序、ZIP、校验和旧说明，以及临时构建和明确隔离的测试副本，共 19 处、2,052,401,296 字节。发行目录只保留 0.1.15，真实个人数据、源码/Git 历史及已公开 Release 资产保留。

Local cleanup removed 19 verified old release/build/test targets (2,052,401,296 bytes). The release directory retains only 0.1.15. Personal data, source/Git history and published GitHub assets remain intact.

## 0.1.14 · 20261106.3 · 2026-11-06

修复填写完整 `/v1/responses` 地址后，模型列表被误拼为 `/v1/responses/models` 的问题。现在兼容基础地址及以 `/responses`、`/chat/completions`、`/messages` 或 `/models` 结尾的完整地址，保留服务商原有前缀和主机。只推导列表请求地址，不修改已保存连接，也不会因此清除原密钥。

Fixes model discovery incorrectly requesting `/v1/responses/models` when given a full `/v1/responses` address. Base addresses and full `/responses`, `/chat/completions`, `/messages` or `/models` addresses now derive the sibling model-list API while preserving the provider's prefix/origin. Saved connections and credentials are unchanged.

首页把“配置 API”和“探测上游模型”分成两个按钮。有可用的已保存连接时，点击探测直接获取列表并定位到结果；支持筛选、选择及保存，模型名仍可手动填写。新连接先填地址和密钥，再点“探测模型”，无需先填模型名。

The home screen separates API setup from Discover models. With a usable saved connection, discovery fetches models immediately and brings the results into view. Filter, select and save a model, or enter a name manually. New connections can fetch models after entering the endpoint/key, without a model name.

探照调用服务商的模型列表 API（通常 `GET /v1/models`），不是抓取管理后台的 Models 网页。界面显示实际请求路径及上游 HTTP 失败状态，方便检查地址、权限或列表接口是否开放；不会自动试探其他主机，也不会逐个调用模型生成回答。

Discovery calls the provider's model-list API (usually `GET /v1/models`), rather than scraping its Models management webpage. The UI shows the request path and upstream HTTP failure status, helping distinguish address, permission and endpoint availability issues. It does not probe other hosts or run a generation against each model.

首页与设置共用统一的原生下拉框，右侧箭头在 36px 区域内居中，文字预留 48px。保留原生列表及键盘选择，点击箭头区域同样展开。

Home and settings now share a native select with a centered arrow in a 36px area and 48px text clearance. Native menus and keyboard selection are retained, including clicking the arrow area.

验证使用合成连接与严格模拟接口，不读取个人配置或调用真实 API。原数据位置、数据库和阅读/批注规则继续沿用。请先正常退出旧版，完整解压新 ZIP，再运行其中的 EXE。已公开的旧 Release 和附件保持原样。

Validation uses synthetic connections and strict mocked endpoints, without personal settings or real API calls. Existing data identity/database and reading/annotation rules remain in use. Exit the old app normally, fully extract the new ZIP and run its EXE. Previously published releases/assets remain unchanged.

原创应用代码全部由 GPT 通过 Codex 实现；人类发起者负责想法、需求与功能取舍。欢迎下载、fork 和使用 AI agent / vibe coding 改造；发布衍生版时请链接[上游项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。MIT 与第三方许可继续适用。

GPT through Codex implemented all original application code; the human initiator supplied ideas, requirements and feature trade-offs. Download, fork and adapt with AI agents / vibe coding; please link [upstream](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing derivatives. MIT and third-party licenses continue to apply.


验证：241 项自动检查、555 项交付包核对通过。严格模拟服务只接受 /v1/models，实际界面验证保存的完整 /v1/responses 地址可直接探测、筛选选择并保存；空模型名获取、本机空密钥、错误路径与 HTTP 404 的中英提示均通过。点击首页箭头区域展开原生列表，36px 箭头区中心差为 0、文字留白 48px。两次实际 EXE 启动、保存、完整备份和退出通过，界面无错误。未读取个人配置或调用真实 API；真实服务商是否开放模型列表仍需其服务确认。

Validation: 241 tests and 555 package checks passed. A strict mock accepted only /v1/models; the UI fetched from a saved full /v1/responses address, filtered/selected and saved models. Blank model names, keyless local services and bilingual path/HTTP 404 feedback were checked. Clicking the home arrow opened the native list; its 36px arrow area had zero center offset and 48px text clearance. Two real EXE startup/save/full-backup/exit checks passed with no renderer errors. No personal settings or real API calls were used; actual provider list availability remains service-dependent.

## 0.1.13 · 20261106.2 · 2026-11-06

- 首页直接显示当前 API 与配置入口；填写地址和密钥后可获取、筛选上游模型，不必先查模型名。兼容接口与 Claude 列表分页已用模拟服务验证；服务未提供列表时仍可手动填写。
  The home screen exposes API status/setup. Enter an endpoint/key to fetch and filter models before choosing a name. Compatible endpoints and Claude pagination were verified with mocks; manual entry remains available when listing is unsupported.
- PDF 上限提高到 **150 MiB、5000 页、1000 万提取字符**。打开时显示提取进度并可取消；按需读取页面几何、绘制附近页面，减少长文档的启动与滚动负担。
  PDFs now support **150 MiB, 5,000 pages and 10 million extracted characters**. Opening shows cancellable extraction progress; page geometry and nearby canvases are prepared on demand.
- 默认“小文件全文，大文件按需引用”。超过 25 MiB、300 页或 12 万字符时，在本机按问题查找相关段落，再带上选区、所在页片段和完整有效主对话。每份检索片段最多 2.4 万字符，选区和对话另计；可在阅读设置中改为全文或按需引用，界面显示当前范围。扫描图片仍不做 OCR。
  Auto sends full small files and locally retrieved excerpts for large files (above 25 MiB, 300 pages or 120,000 characters), along with the selection, its page passages and full valid main conversation. Retrieved excerpts are capped at 24,000 characters per file; the selection/conversation are additional. Reading settings can override the visible scope. Scanned images still have no OCR.
- 主聊天和批注失败重试固定首次请求资料；切换范围或随后新增对话不会悄悄改变该次重试。全文超过本机请求或模型容量时明确提示，不静默截断。
  Failed main/annotation requests retry with their original material, even after scope or conversation changes. Full text exceeding request/model capacity produces an explicit error instead of silent truncation.
- 纸张色同步到工具栏、阅读区边缘、设置、导航与批注框。调色移入后台，拖动快速预览、停下恢复清晰；原生选色器不再被色值回写打断，过期结果不覆盖新颜色。
  Paper colors extend to the toolbar, margins, settings, navigation and annotation panels. Background recoloring uses fast previews then full-resolution refinement; the native picker is no longer reset by controlled RGB updates, and stale jobs cannot overwrite newer colors.

验证使用合成 PDF、隔离数据库和模拟 API，不使用个人论文、聊天或真实密钥。实际检查约 34 MB / 321 页 PDF 的打开、远页与末页导航、中英切换、连续调色，以及小文件自动全文和失败重试资料一致性。服务商真实模型权限与物理选色手感仍以实际使用为准。

Validation used synthetic PDFs, isolated storage and mocked APIs, with no personal papers, conversations or real keys. UI checks covered a roughly 34 MB / 321-page PDF, distant/final-page navigation, both languages, rapid color changes, small-file full text and identical retry material. Actual provider permissions and physical picker feel remain subject to real usage.

更新前正常退出旧版，完整解压新 ZIP 并保留同目录全部文件。沿用原数据位置与数据库；原有聊天、密钥、批注和阅读记录继续使用。备份格式仍可读取旧版；新增大文件和主请求快照建议用新版恢复。全工作区备份继续受 350 MB 容量保护，可分别导出对话。已发布的旧 Release 与附件保持原样。

Exit the old app normally, fully extract the new ZIP and keep all files together. Existing data identity/database remain in use. Older backups remain readable; restore new large-file/main-request snapshots with the new version. Full-workspace backups retain the 350 MB guard; export conversations separately as needed. Previously published releases/assets remain unchanged.

原创应用代码全部由 GPT 通过 Codex 实现；人类发起者负责想法、需求与功能取舍。欢迎下载、fork，使用 AI agent / vibe coding 改造为自己的版本；发布衍生版本时请链接 [上游项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。MIT 与第三方许可继续适用。

GPT through Codex implemented all original application code; the human initiator supplied ideas, requirements and feature trade-offs. Download, fork and adapt with AI agents / vibe coding; please link [upstream](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing derivatives. MIT and third-party licenses continue to apply.


验证：239 项自动检查、555 项交付包核对通过。隔离界面验证首页 API 入口、未填模型名获取并筛选模型、约 34 MB / 321 页 PDF 打开及远页/末页导航、快速连续换色、中英文切换与刷新恢复，以及小文件自动全文。模拟失败后切换资料范围，重试的实际请求资料哈希保持一致。打包目录与交付目录均实际启动、保存、备份并正常退出，界面无错误。未使用个人资料或真实 API。真实服务商权限和物理选色手感仍待使用体验。

Validation: 239 automated tests and 555 package checks passed. Isolated UI checks covered the home API entry, fetching/filtering models without a model name, opening a roughly 34 MB / 321-page PDF, distant/final-page navigation, rapid color changes, both languages with reload persistence and small-file full text. After a simulated failure and scope change, the actual retry material retained the same hash. Both packaged and delivered executables passed startup, save, backup and normal exit with no renderer errors. No personal data or real API calls were used; actual provider permissions and physical picker feel remain subject to usage.

## 0.1.12 · 20261106.1 · 2026-11-06

更名为 **AI-Embedded Paper PDF Reader**（AI 嵌入式论文 PDF 阅读器）。应用、介绍、使用说明及本条发布记录支持中英文；首页、阅读设置和模型设置可切换简体中文 / English，并在本机记住。切换不改写论文、聊天、笔记、已保存连接名称或回答偏好。

Renamed to **AI-Embedded Paper PDF Reader**. Introductions, user guides and this release entry are bilingual. Choose Chinese / English on the home screen or in reading/model settings; the app remembers it locally without rewriting papers, conversations, notes, saved connection names or answer preferences.

批注增加八种预设色、自定义颜色及 #RRGGBB / #RRGGBBAA 输入。颜色随原批注保存并进入备份；改色不改变来源、问答和冻结上下文，生成中也可换色。

Annotations now offer eight preset colors, custom colors and #RRGGBB / #RRGGBBAA input. Colors are saved and backed up with each annotation. Recoloring preserves the source, Q&A and frozen context, including during generation.

明确欢迎下载、fork 和用 AI agent / vibe coding 改造，发布衍生版请链接上游。原创应用代码全部由 GPT 通过 Codex 实现，人类发起者负责想法、需求和功能取舍。MIT 与第三方许可保持原有条款。

Everyone is welcome to download, fork and adapt this project with AI agents / vibe coding. Please link upstream when publishing a derivative. GPT through Codex implemented all original application code; the human initiator supplied ideas, requirements and feature trade-offs. MIT and third-party license terms are unchanged.

兼容性：沿用原应用标识、数据目录、数据库和备份格式；已公开的 v0.1.11 附件保持原样。新增功能只属于 0.1.12。

Compatibility: app identity, data directory, database and backup formats are preserved. Published v0.1.11 assets remain unchanged; these features belong to 0.1.12.


验证：223 项自动检查、554 项交付包检查通过。隔离界面验证中英文切换与刷新记忆、PDF 原文自定义高亮、非法颜色拒绝、中文笔记在英文界面保持原样，以及重开后颜色恢复。实际导出备份与合成 PDF 原字节一致。打包目录和交付目录均实际启动、保存、建立完整备份并正常退出；未读取个人记录或调用真实 API。

Validation: 223 automated tests and 554 package checks passed. Isolated UI checks covered language switching/reload persistence, custom PDF highlights, invalid-color rejection, verbatim Chinese notes in the English UI and color persistence after reopening. An exported backup retained the exact synthetic PDF bytes. Both packaged and delivered executables passed real startup, save, full backup and normal exit checks. No personal records or real API calls were used.

## v0.1.11 首个公开正式版

沿用构建 20261105.10 的阅读、聊天和批注行为，补充 MIT 许可证、第三方组件、隐私与系统代理说明，以及公开前历史检查范围。发行 ZIP 增加许可文件，已验证的 EXE 和应用归档保持原字节；公开版不附带个人数据、实际模型配置、API 密钥或代理节点。

## 0.1.11 构建 20261105.10 - 2026年11月5日

统一模型设置三个下拉框的箭头：右侧 36px 独立区域居中，文字留 48px，已保存连接和操作按钮间距 12px；保留原生选择和键盘行为。接口格式改用“通用兼容格式”“Responses 格式”“Messages 格式”等名称，明确格式与品牌分开，常用服务自动填写。原协议标识和凭证保持不变，Gemini 继续走官方兼容入口。

## 0.1.11 构建 20261105.9 - 2026年11月5日

模型设置增加“其他”模板，提供自定义 API、Ollama、LM Studio、Kimi、千问、Gemini 与 Grok 的快捷填写；继续使用三种现有协议，以上快捷服务默认走聊天兼容接口。地址、端口和模型名可修改，本机未启用鉴权时可留空密钥，区域服务提示地址与密钥匹配。

已保存连接改为一行原生下拉框，选中后在原表单中编辑，旁边保留使用、编辑和删除按钮；使用中标记和密钥状态继续显示，删除仍需确认。选择、新建、模板切换及取消均不发送模型请求。原加密配置、聊天保存格式和阅读体验沿用。

215 项自动检查及 551 项交付核对通过。六种快捷服务与自定义服务均以模拟接口验证主聊天、批注全文上下文、准确路径和凭证隔离；界面验证下拉展开、选择后按需使用、旧连接编辑保留密钥、删除取消、快捷填入及本地无密钥保存/回答，零界面错误。打包目录和原程序目录两次实际启动、保存、完整备份及正常退出通过；原 0.1.11 目录和 ZIP 更新，测试不使用个人数据或真实付费 API。

快捷地址参照服务商官方说明：[Ollama](https://docs.ollama.com/api/openai-compatibility)、[LM Studio](https://lmstudio.ai/docs/developer/openai-compat)、[Kimi](https://platform.moonshot.cn/docs/guide/migrating-from-openai-to-kimi)、[百炼地域地址](https://www.alibabacloud.com/help/en/model-studio/base-url)、[Gemini 兼容接口](https://ai.google.dev/gemini-api/docs/openai)、[xAI 聊天接口](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions)。模型名称仍以本机或账户当前可用标识为准。

## 0.1.11 构建 20261105.8 - 2026年11月5日

程序默认进入本地阅读器。首次使用可从“打开本地 PDF”直接选择文件；已有续读记录时恢复上次文档，关闭文档回到阅读首页。PDF 顶栏左侧可打开其他本地文件，右侧原位置按需打开聊天；窄窗口聊天覆盖阅读器，收起后保留原文档和页码。

本地阅读记录按原文件字节的 SHA-256 分组，同内容改名仍复用，同名不同内容保持独立；只对相同大小的候选读取原字节，结果仅缓存在本机内存。再次从阅读器打开同一文件不新增记录。对话里的“本地文件”默认折叠，重复文件只列一次。已有重复条目只合并显示，同一对话的批注按页映射到当前原文；原始记录、来源标识、冻结上下文和备份不改写，其他对话的阅读记录仍可从首页展开。

214 项自动检查通过。隔离界面验证真实本地文件选择器、首次阅读首页、续读、重复打开与改名复用、同名不同内容区分、对话文件折叠及窄窗口聊天后仍保留第 20 页。实际旧构建创建 6 份相同 PDF 和两条批注，升级后只显示一份且两条均可打开，旧问答重新提问成功；升级前后导出的原文件字节、批注 ID、来源版本与锚点逐项一致。界面零错误，未读取个人资料或调用真实 API。

本构建另通过 551 项交付包核对，打包目录和原交付目录均实际启动、保存、生成完整备份并正常退出；原 0.1.11 文件夹和完整 ZIP 已同步更新，仅保留当前可用版。

## 0.1.11 构建 20261105.7 - 2026年11月5日

PDF 默认连续滚动，旧版单页偏好首次升级也采用连续阅读；随后在“阅读设置”中手动选择单页会保存该选择。专注阅读仅保留一条 48px 工具栏，合并重复标题、移除常驻提示；显示方式、翻页方式、配色、原色对照、模型与备份移到按需设置浮层，打开设置不挤占正文。旧偏好保留，使用 v2 阅读位置键记录新选择，聊天格式、原文件与模型配置不改动。

208 项自动检查通过。隔离界面从实际旧版升级，同一合成 PDF 复现旧版滚到第 1 页底部停止；新版实际滚轮跨到第 2、4 页，并可反向滚动。1280×720 测试中正文视口顶部由 223.5px 降至 48px，400px 窄窗口仍为单行且无横向溢出。单页选择重开保留、连续模式重开、设置浮层/ESC/模型入口、聊天切换、原文搜索及模拟缩放均验证，界面零错误。未使用个人记录或真实 API，物理触控板手感仍待用户体验。

本构建另通过 551 项交付包核对，打包目录和原交付目录均实际启动、保存、生成完整备份并正常退出；原 0.1.11 文件夹与完整 ZIP 已同步更新，仅保留当前可用程序。

## 0.1.11 阅读效率 - 2026年11月5日

- 增加连续 PDF 阅读并保留分页，滚动时更新页码；保存阅读模式和页内位置。
- 视野附近页面按需绘制，单队列可取消；打开的批注页保持挂载，混合页面尺寸占位并补偿阅读点。
- “文档导航”默认收起，窄窗口使用浮层；PDF 内嵌目录可直接跳转章节。
- 本机全文搜索显示总数、页码和片段，点击标记原文；列表前 200 处，可用上/下一个、Enter 和 Shift + Enter 切换。
- 按页码、类型和内容筛选批注，点击恢复精确引用范围，直接回到原句并打开批注。
- 搜索标记不改写文字节点及已有批注锚点；延续暖黄/深色、手势缩放和完整上下文规则。聊天格式、数据库身份和凭证存储不变。
- 打包保留官方 Electron 运行文件的原始字节，并在交付前校验。此机拒绝资源改写后的 EXE，原始运行文件已通过实际启动检查；不调整 Windows 应用控制策略。

206 项自动检查、551 项交付包核对及打包/交付目录两次隔离实际 EXE 启动、保存、完整备份和正常退出通过。合成 30 页 PDF 实测目录跳转、混合页尺寸、1050 处全文匹配/前 200 处列表、键盘切换、原排版与文本标记、批注筛选、离屏返回原句、位置恢复与窄窗口浮层；界面零错误。暖黄 1165 帧、深色 1906 帧测试记录均未观察到白底角落采样；这是本次合成文档测试，不代表所有 PDF。模拟手势已测试，物理触控板手感待用户体验，未调用真实模型或读取个人数据。目录缺失时给出说明；扫描文字 OCR、跨页批注、缩略图和书签仍未提供。


## 0.1.10 构建 20261105.5 - 2026年11月5日

- 按使用反馈将双指捏合及 Ctrl + 滚轮的缩放灵敏度提高 50%，保留微小增量、阅读点补偿、普通滚动、按钮步长和 50%–250% 边界。
- 更新现有 0.1.10 程序目录与完整 ZIP，不新增版本目录。按用户要求移除 0.1.6–0.1.9 程序、压缩包及旧构建副本，Git 代码历史和个人数据备份继续保留。
- 195 项自动检查、542 项交付核对及两次隔离实际 EXE 保存退出通过，原数据目录及模型配置沿用。清理 21 处旧交付物和临时副本，共 5,243,591,847 字节（约 4.88 GiB）；保留当前 EXE 目录、完整 ZIP 和校验文件。

## 0.1.10 PDF 白闪与触控板缩放 - 2026年11月5日

- 将白底绘制、文字层和换色移到后台，完成后同步显示；翻页沿用纸张底色，缩放期间保留已有画面，不自动回退白底。
- 支持阅读区内双指捏合及 Ctrl + 滚轮缩放，普通双指滑动继续滚动；每帧合并手势，围绕指针补偿原文位置，缩放范围仍为 50%–250%。
- 缩放和改宽先预览已有页面，停止连续变化后重绘清晰画面；文字层、高亮和选取继续按完整新画面对齐，取消旧任务防止迟到结果覆盖。
- 独立交付 0.1.10 并保留 0.1.9，聊天格式、完整上下文、原文件和加密模型配置沿用。

195 项自动检查、547 项交付包核对及打包/交付目录两次隔离实际 EXE 保存退出通过；同一合成 PDF 在旧版检出 7 帧白底角落采样，新版深色和暖黄测试均为 0。浏览器验证模拟手势、实际滚动、阅读区宽度切换、选区及缩放翻页后重开批注。物理触控板尚待实际体验。

## 0.1.9 存储与性能 - 2026年11月5日

- 批注共用不可变完整上下文及内容标识，避免重复保存同一篇资料；本次重试仍使用原快照，覆盖问答保留旧结果的规则继续生效。
- 对话、消息、回答版本、批注和文档页面按记录原子保存；合并过期保存任务，永久删除同步清理无引用快照，拒绝另一窗口的旧记录覆盖。
- 旧格式首次升级先创建旧版兼容完整文件备份，再原子迁移；失败保留原记录。数据库版本不增加，最近 2 份升级前文件独立于普通 5 份轮换保护。
- 默认备份使用紧凑格式 2，仍可导入旧 JSON。备份窗口新增全部/当前对话范围及“兼容旧版导出”；回退旧程序须恢复兼容备份。
- 0.1.9 独立交付，保留 0.1.8 程序与源码基准，数据目录和加密模型配置继续沿用。

185 项自动检查、546 项交付包核对和两次隔离实际 EXE 启动保存退出通过；浏览器实测旧版升级、批注重开、演示流式替换、刷新保留及新备份入口。合成的 100 万字符资料与 10 条批注，文字记录由约 11 MB 减为约 2 MB（81.71%）；30 次连续更新每次最多提交 3 条记录、2,432 字节。此为序列化元数据比较，不代表磁盘或真实模型速度。

## 0.1.8 覆盖问答与回收站 - 2026年11月5日

- 已成功的询问批注可重新提问，沿用原高亮与引用；新回答成功后替换当前问答，不累积批注聊天历史。
- 新尝试使用当前完整主对话与附件，失败或停止保留原问答；重试固定本次问题与上下文，也可主动修改问题或返回原问答。未完成尝试可保存、备份与重开。
- 回收站统一管理对话与批注，提供恢复、单条永久删除和清空，永久删除前明确确认范围。
- 永久删除实际移除当前记录；对话附件原字节与元数据使用同一事务清理，失败整体回滚，并与普通保存共用队列防止旧快照复活。历史备份继续保留独立恢复能力。
- 保留 0.1.7 文件夹、数据目录、模型配置及旧 JSON 备份格式。

169 项自动检查、547 项交付包核对和两次独立实际 EXE 保存退出检查通过。交互使用模拟网络，删除提交使用隔离数据库验证，不读取或删除个人聊天。

## 0.1.7 稳定性更新 - 2026年11月5日

- 询问批注新增“停止回答”；× 只收起窗口，停止后重试原问题和首次上下文，仍只允许一次成功问答。
- 创建、修改、导入和流式接收前统一检查记录数量、文字长度和完整备份体积，超限保留上一个合法状态。
- 保存提供可等待的提交屏障；桌面退出先停止生成、保存批注编辑、等待文件处理和写入，再完成完整检查点。失败可重试、取消退出或明确直接退出。
- 桌面完整备份使用临时文件、同步落盘、原子更名及 SHA-256 校验，成功后保留最近 5 份；持续输出时每分钟建立检查点。
- 新增“备份与恢复”。正常使用时追加恢复为新对话；读取失败时以单笔事务恢复元数据和附件，另外保留最近 3 份原记录副本。
- 显示版本与构建标识，保留数据目录、应用身份、协议与旧 JSON 格式。0.1.6 基准保持独立。

验证使用隔离测试数据与演示/模拟接口；未读取个人模型凭证，未调用真实付费模型。154 项自动检查和 543 项交付包核对通过，打包目录与交付目录的 EXE 均确认保存、自动备份后正常退出。

## 0.1.6 仓库基准 - 2026年11月5日

- learn something 品牌与暖黄主界面。
- 主聊天、回答版本、持久高亮、一次成功问答及普通笔记。
- 批注右键操作、可恢复删除、框外收起及拖动。
- PDF/TXT/Markdown 本机导入和完整原文件备份。
- 专注阅读、阅读配色、原色对照与按文档记忆阅读位置。
- 修复 PDF 多行摘要拖选截断、端点偏移和并排阅读临界页高的反复重建。
- 多模型预载、三种文字接口、桌面加密保存及系统代理支持。

基准记录：129 项客户端检查、528 项交付包核对和隔离桌面启动通过。真实模型和后续扩展的验证范围独立记录。

这次归档保留已经验证的应用代码，新增源码提交范围、仓库说明和改进清单；不包含个人数据和程序安装包。

## 仓库更名与共同作者 / Repository rename and co-author

2026-11-06：仓库更名为 AI-Embedded-Paper-PDF-Reader，文档和客户端源码中的上游链接同步新地址；v0.1.12 与 v0.1.11 的既有提交标签及发行附件保留原样。截图中的 Source code (zip/tar.gz) 是 GitHub 自动提供的对应标签源码，继续保留。新提交使用 Codex 共同作者条目，项目所有者的常规作者身份继续保留。

2026-11-06: Renamed the repository to AI-Embedded-Paper-PDF-Reader and updated upstream links in documentation and client source. Existing v0.1.12/v0.1.11 tags and release assets remain unchanged. GitHub automatically provides the Source code ZIP/tar.gz archives for each tag. New Codex-assisted commits include the Codex co-author trailer while retaining the owner's normal author identity.
