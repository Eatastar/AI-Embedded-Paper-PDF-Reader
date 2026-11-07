# AI-Embedded Paper PDF Reader

**AI 嵌入式论文 PDF 阅读器** · 0.1.22 · 20261107.2

主要功能：本地 PDF 阅读、自定义纸张配色、AI 问答批注、划词翻译及可选聊天模式。划选单词或段落后右键翻译或按 Alt+1，在原文旁查看译文；可配置独立 API、翻译提示词和快捷键，只发送选段与翻译提示词，并可将译文保留为普通批注。

Main features: local PDF reading, custom paper colors, AI Q&A annotations, selection translation and optional chat. Select a word or passage and right-click or press Alt+1 to read its translation beside the source. Configure an independent API, prompt and shortcut; only the selection and translation prompt are sent. Results can be kept as plain notes.

连接自己的 API 或自行部署的模型服务，在 PDF 原文的批注中直接询问 AI。以本地阅读为主，支持自定义纸张配色，聊天按需打开。项目介绍、功能、实现分工和复用说明见[项目首页](../../README.md)，历史变化见[版本记录](../../docs/CHANGELOG.md)。

Connect your own API or self-hosted model and ask AI directly in PDF annotations. Local reading comes first, with adjustable paper colors and optional chat. See the [project README](../../README.md) for features, implementation credits and adaptation, and the [changelog](../../docs/CHANGELOG.md) for history.

## 桌面版 / Desktop

完整解压 Windows ZIP，运行 `AI-Embedded-Paper-PDF-Reader.exe`，保留同目录所有文件。无需另外安装 Node.js。更新前正常退出旧版，避免同时打开新旧版本。

Fully extract the Windows ZIP and run `AI-Embedded-Paper-PDF-Reader.exe`, keeping all accompanying files. No separate Node.js installation is needed. Exit the old version normally before updating; do not run both versions together.

首页打开本地 PDF，或继续最近阅读。相同内容只显示一次，同名但不同内容分别保留。阅读工具栏左侧打开文件和文档导航，右侧是阅读设置、聊天和关闭。阅读设置支持连续/单页、纸张与文字配色、原色对照及语言选择。

Open a local PDF or continue a recent document. Identical content appears once; different content with the same filename remains separate. The toolbar provides file opening and navigation on the left, with reading settings, chat and close on the right. Reading settings offer continuous/single pages, paper/text colors, original colors and language.

## 批注与颜色 / Annotations and colors

划选原文，选择询问 AI 或只写批注。点击高亮打开批注，× 或 Esc 收起，点击聊天或正文保持打开，拖动标题栏可移动。每条批注的“高亮颜色”提供八种预设、系统颜色选择器和 `#RRGGBB` / `#RRGGBBAA` 输入。颜色随批注保存和备份。

Select text to ask AI or write a note. Click a highlight to open it; × or Esc closes the panel, while clicking chat or source text keeps it open. Drag its title bar to move it. Highlight color offers eight presets, a system color picker and `#RRGGBB` / `#RRGGBBAA` input. Colors are saved and backed up with annotations.

每处高亮保留一组当前问答。可编辑或重新提问，新回答成功后才替换旧问答；失败或停止保留旧结果。批注内没有嵌套批注。重新生成主回答创建独立版本，旧批注留在原回答上。

Each highlight has one current Q&A. Edit it or ask again; replacement happens only after a successful new answer. Failure or stopping keeps the old result. Annotations have no nested annotations. Regenerating the main answer creates a separate version, with old annotations staying on the original.

## 重新展开 PDF 与引用文字 / Reopen PDFs and quote text

聊天模式关闭 PDF 后保持聊天可见，顶部“展开 PDF”及聊天文件名可一键恢复并排阅读，沿用原页码与缩放。左上角长项目名按侧栏宽度换行。选中 PDF、AI 回答或聊天问题中的文字，可通过浮动按钮或右键“引用到聊天”，在输入框预览选段、补充问题再发送，不创建批注或自动调用 API。每次引用一段，重新选择会替换待发送段落，可用 × 取消。

Closing a PDF in chat keeps the conversation visible. Open PDF at the top, or the file name in chat, restores side-by-side reading with the saved page and zoom. Long branding wraps inside the sidebar. Select text in a PDF, AI answer or chat question and use Quote in chat from the selection action or context menu, preview the excerpt, add a question and send. This creates no annotation and makes no automatic API call. One pending excerpt can be replaced or removed with ×.

批注在点击聊天、正文、翻页和切换阅读布局时保持打开，用 × 或 Esc 收起；编辑中的修改在关闭或切换来源时保存。切换文件或对话会收起批注。临时翻译继续保持原来的框外点击、Esc / × 关闭及滚动保留规则；同时展开时，Esc 优先关闭翻译。

Annotations stay open while clicking chat/source text, turning pages or changing reading layout; use × or Esc to close. Pending edits are saved when closing or leaving the source. Switching documents or conversations dismisses the annotation. Temporary translation retains outside-click, Esc/× dismissal and scroll retention; when both panels are open, Esc dismisses translation first.

文字引用与本轮问题一起保存和备份，聊天仍按原设置带入有效聊天与文档资料。它与“只发送选段”的翻译功能不同；批注提问仍不引用聊天或其他批注。删除被引用的聊天轮次时，后续问题中的相关文字引用副本与旧重试缓存也会清除，PDF 引用和原文批注保留。新版本可读取旧备份，含文字引用的备份请使用 v0.1.22 或更新版本恢复。

Text quotations are saved and backed up with the question. Chat still uses valid history and document material according to existing scope settings, unlike selection-only translation. Annotation questions still exclude chat and other annotations. Deleting a quoted chat round clears its later quotation copies and stale retry snapshots while retaining PDF quotations and annotations. Older backups remain readable; restore backups with text quotations using v0.1.22 or newer.

## 引用批注与删除对话 / References and chat deletion

在输入框下方工具栏点击“引用批注”，可搜索并选择当前阅读记录/对话中已保存的问答或笔记，每次最多 10 条。发送后可在该条问题下展开查看引用副本，后续讨论沿用聊天中已发送的内容。

Use Reference annotations in the composer toolbar to search and select saved Q&A or notes from the current reading record/conversation, up to ten per question. Expand the sent question to inspect the reference copy; subsequent discussion uses the contents already sent in chat.

每轮回答下方的“删除本轮”会直接删除本轮问题、全部回答版本及这些回答上的批注，不进入回收站；PDF 原文批注和文件保留。同时清除剩余失败回答的旧请求快照，后续聊天中对被删回答批注的手动引用也会移除，重试不会通过这些缓存带回已删内容。以前的自动备份、迁移存档和导出文件可能仍含旧内容。

Delete round under each answer permanently removes that question, all answer versions and annotations attached to those answers, without Trash. PDF annotations and files remain. Remaining failed-answer snapshots and later manual references to the removed answer annotations are also cleared, so retries cannot restore deleted content through these caches. Earlier automatic backups, migration archives and exports may still contain old content.

0.1.20 可读取旧备份；含手动引用或新重试设置的备份请使用 0.1.20 或更新版本恢复，不保证旧程序能完整读取这些新增字段。

v0.1.20 reads older backups. Restore backups containing manual references or new retry settings with v0.1.20 or newer; earlier apps may not fully understand these fields.

## 界面语言 / Interface language

在首页、阅读设置或模型设置中选择“简体中文 / English”，选择会在本机记住。切换只影响菜单、按钮和提示，不改写论文、聊天、笔记、已保存连接名称或回答偏好。AI 回答语言仍由你的问题和模型偏好决定。

Choose 简体中文 / English on the home screen or in reading/model settings. The app remembers your choice locally. Switching changes menus, buttons and hints; it does not rewrite papers, conversations, notes, saved connection names or answer preferences. AI answer language still depends on your question and model preferences.

## 模型与联网 / Models and networking

在“模型与设置”保存自己的 API 地址、模型名和密钥。提供 GPT、Claude、DeepSeek、中转站及“其他”模板，其他服务含 Kimi、千问、Gemini 兼容入口、Grok、Ollama、LM Studio 和自定义地址。接口格式表示协议：Chat Completions、Responses 或 Anthropic Messages。

Save your API address, model name and key in Models & settings. Templates include GPT, Claude, DeepSeek, relays and Other, with Kimi, Qwen, Gemini's compatible endpoint, Grok, Ollama, LM Studio and custom addresses. API formats are protocols: Chat Completions, Responses or Anthropic Messages.

保存或切换连接不发送问题。远程服务用 HTTPS，本机未启用鉴权时可留空密钥。桌面版沿用系统代理；API 地址仍填服务商地址。聊天发送尚未删除的有效主对话及所选文档资料，默认不读取批注；点击输入框下方工具栏“引用批注”后，只把手动选择的问答或笔记加入该次问题。PDF 批注只引用所属文档、选段和本次问题，不带聊天及其他批注；在 AI 回答上提问时，仅引用批注绑定的那一版原回答。

文档范围继续支持自动、全文或按需引用：自动模式下，小文件发送全文提取文字，超过 25 MiB、300 页或 12 万提取字符时在本机检索，每份文档最多引用 2.4 万片段字符，选段和问题另计。原 PDF 和页面图片不作为文件上传。资料不足时明确提示，全文仍受请求和模型容量限制。批注失败重试保留本次问题、回答偏好和文档范围，从同一份不可变来源重新组装请求，不保存整段聊天快照。详见[隐私说明](../../docs/PRIVACY.md)。

Saving or switching sends no question. Use HTTPS for remote services; unauthenticated local services may leave the key empty. The desktop app follows the system proxy. Chat sends the remaining valid main conversation and document material, without automatically reading annotations. Reference annotations in the composer toolbar adds only the Q&A or notes you select to that question. A PDF annotation uses only its own document, selection and current question, without chat or other annotations. An annotation on an AI answer uses only its bound original answer version.

Document scope still supports Auto, Full text and Relevant excerpts. Auto sends full extracted text for small files; above 25 MiB, 300 pages or 120,000 extracted characters, local retrieval sends at most 24,000 excerpt characters per document, with the selection and question additional. Original PDFs and page images are not uploaded as files. Missing evidence is disclosed, and full text remains subject to request/model limits. Failed annotation retries retain the question, answer preference and document scope and rebuild from the same immutable source, without storing a full-chat snapshot. See [Privacy](../../docs/PRIVACY.md).

## 数据与备份 / Data and backups

更名不迁移原数据。桌面版沿用 `%APPDATA%\MarginChat`、原数据库名称和应用标识。界面语言、阅读颜色和位置是单独的本机偏好，不进入聊天备份。普通删除进入回收站，可恢复或确认永久删除；以前的自动备份和导出文件可能仍包含旧内容。

Renaming does not move existing data. The desktop app keeps `%APPDATA%\MarginChat`, its database name and app identity. Interface language, reading colors and position are separate local preferences, outside conversation backups. Ordinary deletion moves records to trash for restoration or confirmed permanent deletion. Earlier backups and exports may still contain old content.

“备份与恢复”支持完整/当前对话导出、兼容旧版导出、自动备份和恢复为新对话。备份含批注、回答版本和附件原文件，不含模型配置或密钥。正常关闭会等待保存；保存失败可重试或取消退出。启动无反应时可运行同目录“启动诊断.cmd”，不要向别人发送整个数据目录或模型配置。

Backup & restore supports full/current-conversation export, legacy export, automatic backups and restoration as new conversations. Backups include annotations, answer versions and original attachments, but no model settings or keys. Normal exit waits for saving; retry or cancel exit if saving fails. If startup fails, run the bundled 启动诊断.cmd. Do not share your whole data directory or model configuration.

## 限制 / Limits

PDF 最大 150 MiB、5000 页、1000 万提取字符；TXT/Markdown 最大 25 MiB、100 万字符，每对话最多 10 个附件。全工作区含原文件的备份仍受 350 MB 上限保护，超出前拒绝操作并保留旧记录；可分别导出对话。打开时显示提取进度并可取消。扫描页可看和换色，目前无 OCR 或图像理解。目录依赖内嵌结构，搜索使用本机提取文本。

PDFs support up to 150 MiB, 5,000 pages and 10 million extracted characters; TXT/Markdown up to 25 MiB and 1 million characters, with up to 10 attachments per conversation. The full workspace backup, including original files, retains a 350 MB capacity guard; oversized operations are rejected before replacing existing records. Export conversations separately when needed. Opening shows extraction progress and supports cancellation. Scanned pages support viewing and recoloring, without OCR or image understanding. Contents depend on embedded outlines; search uses locally extracted text.

## 开发 / Development

需要 Node.js 22.12+ 和 pnpm，在本目录运行：

Requires Node.js 22.12+ and pnpm. Run in this directory:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
pnpm build:desktop
```

模块职责见 [PROJECT](../../docs/PROJECT.md)，后续计划见 [ROADMAP](../../docs/ROADMAP.md)。公开提交前在仓库根运行 `node tools/source-audit.mjs`。不要提交运行数据、依赖、密钥或论文。

See [PROJECT](../../docs/PROJECT.md) for modules and [ROADMAP](../../docs/ROADMAP.md) for plans. Run `node tools/source-audit.mjs` from the repository root before publishing. Do not commit runtime data, dependencies, keys or papers.

## 实现与复用 / Credits and reuse

原创应用代码全部由 GPT 通过 Codex 实现，人类发起者提出想法、确定需求并选择功能。欢迎任何人下载并用 AI agent / vibe coding 修改；发布衍生版时，请链接[上游](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。项目自身代码采用 MIT，第三方署名和许可继续保留。见[贡献说明](../../docs/ATTRIBUTION.md)。

All original application code was implemented by GPT through Codex; the human initiator proposed ideas, defined requirements and selected features. Anyone may download and adapt it with AI agents / vibe coding. Please link to [upstream](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing a derivative. Original code uses MIT; third-party attribution and licenses remain applicable. See [Attribution](../../docs/ATTRIBUTION.md).


## 获取模型 / Model discovery

首页 API 区直接进入配置。先填地址与密钥，再获取并筛选模型，无需先填写模型名。兼容接口读取 `/models`，Claude 支持分页；未提供列表时手动填写，不自动猜测其他地址。列表可能含图像或语音模型，请选择支持文字对话的模型。获取沿用桌面系统代理，不发送论文或聊天，也不保存、启用未提交配置。

Open configuration from the home API card, enter the endpoint/key and fetch/filter models before entering a model name. Compatible APIs use `/models`; Claude supports pagination. Unsupported listing falls back to manual entry, without probing other addresses. Lists may contain image/audio models, so choose a text-chat model. Discovery uses the desktop proxy path, sends no paper/chat content, and does not save or activate unsubmitted settings.

API references: [OpenAI models](https://developers.openai.com/api/reference/resources/models/methods/list), [Claude models](https://platform.claude.com/docs/en/api/models/list), [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility).


模型探照说明 / Model discovery details

首页“探测上游模型”直接进入列表获取，已保存可用连接会自动读取。使用服务商的 GET 模型列表 API，不是管理后台网页。兼容以 /responses、/chat/completions、/messages 或 /models 结尾的完整地址；推导列表路径时保留主机与前缀，不改保存的连接或密钥。界面显示请求路径及 HTTP 失败状态，仍可手动填模型名。

Discover models on the home screen opens discovery and fetches immediately for a usable saved connection. It uses the provider's GET model-list API, rather than a management webpage. Full /responses, /chat/completions, /messages and /models addresses are accepted; the provider prefix/origin and saved connection/key are preserved. The UI shows the request path and HTTP failure status, with manual model entry available.


## 模型选择 / Model selection

连接名称只作本地备注；在上游模型下拉框中选择实际调用模型，保存并使用后生效。模型按名称及自然数字顺序排列，手动输入按需展开，保留未列出的自定义模型。

Connection names are local labels. Choose the actual API model in the upstream list and Save and use. Models sort by name with natural numbers; manual entry expands on demand and preserves unlisted custom models.

## 划词翻译与 PDF 链接 / Translation and PDF links

选中文字后右键翻译或按默认 Alt+1；右上角独立“翻译”按钮可设置目标语言、提示词、独立 API 及自定义快捷键。连接列表共用，翻译选择不切换聊天。只发送选段和翻译提示词，不发送全文、所在页或聊天历史。临时面板显示译文和模型，框外点击、Esc 或 × 关闭并丢弃；点击保留后才创建普通批注。翻译设置单独记在本机，不进入聊天备份。

Select text and right-click to translate or press Alt+1. The separate Translate button configures the target language, prompt, independent API and shortcut. Connections are shared without switching chat. Only the selection and translation prompt are sent, without full text, page or history. Outside click, Esc or × discards temporary text/model results; Keep creates a plain note. Settings stay local outside conversation backups.

PDF 自带的参考文献和图号链接支持文内精确跳转，并可返回跳转前位置。HTTP/HTTPS 网页链接交由系统浏览器打开，不执行脚本或文件动作；没有原生链接的文字不猜测跳转。深色配色修正彩色字边缘的白色残影，原 PDF 不改写。

Embedded PDF references/figure links navigate to their page positions, with return navigation. HTTP/HTTPS links open in the system browser; scripts and file actions are not executed. No destination is guessed for unlinked text. Dark colors correct white halos around colored text without modifying the PDF.

## 翻译滚动保留 / Translation while scrolling

滚动时保留翻译框，连续阅读暂留当前翻译的来源页，滚远后仍可保留为原位置的批注。普通框外点击、Esc 或 × 关闭，拖动滚动条不会关闭。

The translation panel remains open while scrolling, retaining its source page in continuous reading so it can still be saved as a note at the original passage. Ordinary outside click, Esc or × closes it; dragging the scrollbar does not.
