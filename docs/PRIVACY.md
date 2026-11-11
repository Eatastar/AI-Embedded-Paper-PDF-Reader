# 本地数据与模型请求 / Local data and model requests

AI-Embedded Paper PDF Reader 在本机保存阅读资料、聊天、批注和 API 连接配置。API 地址与密钥由你自行配置，不上传到项目方服务器；项目没有自建的密钥托管服务、云端文件库、账号服务或使用情况收集接口。

## 什么保存在本机

- 导入文件的原始字节、提取文字、聊天、批注与阅读位置。
- 各模型连接的名称、接口地址、模型名与回答偏好。
- 手动导出的聊天备份和桌面自动备份；备份含对话与原文件，应按个人资料保管。
- 桌面版通过系统凭证服务保存模型密钥。系统加密不可用时，连接配置仍可保存，密钥只在本次运行的内存中保留。Linux 的 `basic_text` 回退也按加密不可用处理。

模型配置和凭证独立于聊天数据库，聊天备份不包含模型凭证字段。桌面数据保存在当前系统账户的应用数据目录，与程序目录分开。删除或移动源码和程序文件，不会自动删除个人数据。

## 什么时候发送数据

打开、翻页、换色、搜索、写普通批注、保存模型配置和切换模型均不调用 AI。

聊天发送尚未删除的有效主对话及所选文档资料，默认不读取批注；点击输入框下方工具栏“引用批注”后，只把手动选择的问答或笔记加入该次问题。PDF 批注只引用所属文档、选段和本次问题，不带聊天及其他批注；在 AI 回答上提问时，仅引用批注绑定的那一版原回答。

文档范围继续支持自动、全文或按需引用：自动模式下，小文件发送全文提取文字，超过 25 MiB、300 页或 12 万提取字符时在本机检索，每份文档最多引用 2.4 万片段字符，选段和问题另计。普通文字提问不会上传原 PDF 或页面图片；主动图片提问的发送范围见下文。资料不足时明确提示，全文仍受请求和模型容量限制。批注失败重试保留本次问题、回答偏好和文档范围，从同一份不可变来源重新组装请求，不保存整段聊天快照。

引用批注会在发送时保存一份可查看的内容副本，之后编辑或删除原批注不会静默改写已经发送的聊天；删除对应聊天轮次会删除这份副本。每轮回答下方的“删除本轮”会直接删除本轮问题、全部回答版本及这些回答上的批注，不进入回收站；PDF 原文批注和文件保留。同时清除剩余失败回答的旧请求快照，后续聊天中对被删回答批注的手动引用也会移除，重试不会通过这些缓存带回已删内容。以前的自动备份、迁移存档和导出文件可能仍含旧内容。

点击“探测上游模型”或“探测模型”只发送模型列表请求及对应认证，不发送论文或聊天，也不会自动保存或启用新连接。

因此，“文件保存在本机”不代表提取文字不会发送给模型，“密钥保存在本机”也不代表调用 API 时无需发送认证。本地保存避免向项目方托管凭证，但不能保证所有环境下绝无泄露；所选服务、中转站及本机环境仍需可信。服务商如何保存请求数据，以服务商规则为准。处理私密资料前，请确认选择的服务和问题范围。

## 主动引用聊天文字 / Explicit text quotations

文字引用与本轮问题一起保存和备份，聊天仍按原设置带入有效聊天与文档资料。它与“只发送选段”的翻译功能不同；批注提问仍不引用聊天或其他批注。删除被引用的聊天轮次时，后续问题中的相关文字引用副本与旧重试缓存也会清除，PDF 引用和原文批注保留。新版本可读取旧备份，含文字引用的备份请使用 v0.1.22 或更新版本恢复。

Text quotations are saved and backed up with the question. Chat still uses valid history and document material according to existing scope settings, unlike selection-only translation. Annotation questions still exclude chat and other annotations. Deleting a quoted chat round clears its later quotation copies and stale retry snapshots while retaining PDF quotations and annotations. Older backups remain readable; restore backups with text quotations using v0.1.22 or newer.

未发送的引用仅在当前界面内存中，关闭程序后不恢复；已发送引用保存所选文字、来源名称及文档/消息版本标识，不包含 API 配置。每次最多 20000 字符，超出时提示缩小选区。阅读重开仅另存本机的文档标识和界面模式，原文件和页码/缩放继续按原机制保存。

Unsent quotations stay only in UI memory and do not survive app closure. Sent quotations store selected text, a source label and document/message version identifiers, without API settings. A selection is limited to 20,000 characters with an explicit error for longer excerpts. Reader reopening stores document identifiers and layout mode separately as local preferences; source files, page and zoom continue using existing storage.

## 代理与 IP

Windows 桌面版通过 Electron / Chromium 网络组件读取系统代理设置，每次模型请求前刷新配置。程序不内置代理订阅、代理账号、固定节点或固定公网 IP。

系统代理接收到请求后，可能按其自身规则转发到代理节点，也可能直连。走代理时，服务端通常看到代理出口 IP；直连时则看到当前网络出口 IP。`localhost` / 回环地址的本地模型通常直接在本机连接。网页版的 Node 服务与桌面网络实现不同，不应假定它自动沿用 Windows 系统代理。

参考：[Electron 的代理解析、配置刷新和会话请求说明](https://www.electronjs.org/docs/latest/api/session)。

## 日志和仓库

请求诊断只保留时间、诊断编号、请求类型、接口格式、目标主机、模型名、结果、状态码和耗时等允许字段，不记录请求正文、授权头或密钥。日志仍可能包含用户自定义的模型名称和接口主机，分享前应先检查。

源码仓库不保存运行日志、用户数据库、实际模型配置、环境密钥、聊天备份、个人论文或阅读截图。公开发布包由程序和通用资源组成；使用后生成的个人数据不在发行包内。

反馈问题时请先去除密钥、聊天正文、私人文档、个人路径及代理订阅地址，勿直接提交整个用户数据目录。

## English

The app stores original document bytes, extracted text, conversations, annotations, reading position and API connection settings locally. You supply the endpoints and keys; the app does not upload them to a project-operated server. The project runs no credential hosting, cloud document library, account service or usage collection endpoint. Model connections and credentials are separate from the conversation database. The desktop app encrypts saved keys through the operating system's credential service. Without encryption, including Linux's `basic_text` fallback, the app saves connection metadata and keeps keys only in session memory. Conversation backups include original attachments and notes, but no model credential fields. Interface language is an independent local preference and is not included in these backups.

Reading, turning pages, recoloring, searching, writing personal notes and saving/switching connections make no AI requests. Chat sends the remaining valid main conversation and document material, without automatically reading annotations. Reference annotations in the composer toolbar adds only the Q&A or notes you select to that question. A PDF annotation uses only its own document, selection and current question, without chat or other annotations. An annotation on an AI answer uses only its bound original answer version.

Document scope still supports Auto, Full text and Relevant excerpts. Auto sends full extracted text for small files; above 25 MiB, 300 pages or 120,000 extracted characters, local retrieval sends at most 24,000 excerpt characters per document, with the selection and question additional. Ordinary text questions do not upload original PDFs or page images; explicit image questions are described below. Missing evidence is disclosed, and full text remains subject to request/model limits. Failed annotation retries retain the question, answer preference and document scope and rebuild from the same immutable source, without storing a full-chat snapshot.

An explicit annotation reference stores a visible copy at sending time. Later edits or deletion of the source annotation do not silently rewrite an already sent discussion; deleting its chat round removes the copy. Delete round under each answer permanently removes that question, all answer versions and annotations attached to those answers, without Trash. PDF annotations and files remain. Remaining failed-answer snapshots and later manual references to the removed answer annotations are also cleared, so retries cannot restore deleted content through these caches. Earlier automatic backups, migration archives and exports may still contain old content.

Model discovery sends only a model-list request and authentication, without papers or chat, and does not save or activate a connection. Local storage does not mean authentication or extracted text never leaves the computer. Your chosen provider determines its own data-processing rules.

The Windows desktop app uses Electron/Chromium to refresh and read system proxy settings before model requests. The app contains no proxy subscriptions, proxy credentials, fixed nodes or fixed public IP. Proxy rules may route a request through a node or directly. A provider normally sees the proxy exit IP for proxied requests and the network exit IP for direct requests. Local loopback model services usually connect directly. The browser version uses a different Node networking path and should not be assumed to inherit Windows system proxy settings.

Diagnostic logs retain only allowed metadata such as time, request ID, type, format, destination host, model name, result, status and duration. They exclude request bodies, authorization headers and keys, but user-defined model names and API hosts may still be sensitive. Review them before sharing. The source repository and release packages contain no personal runtime databases, actual model settings, environment secrets, backups, papers or reading screenshots. Remove keys, private content, personal paths and proxy subscription URLs before reporting a problem; do not submit the whole user-data directory.

## 划词翻译 / Selection translation

目标语言、提示词、快捷键和共享连接标识单独保存在本机，不进入聊天备份。翻译只发送所选文字、提示词与目标语言，不发送整篇论文、所在页、聊天记录、其他批注或聊天偏好。临时译文只在内存中，关闭即丢弃；主动保留为普通笔记后才保存和备份。诊断可标识 translation 请求，但不记录原文、译文或提示词。

The target language, prompt, shortcut and shared connection ID are separate local preferences outside conversation backups. Translation sends only the selection, prompt and target language, without the paper, page, chat history, other annotations or chat preferences. Temporary results remain in memory until closed; Keep creates a plain note included in normal storage/backups. Diagnostics can identify translation requests, but omit source text, translations and prompts.

点击 PDF 外部网页链接会在系统浏览器打开对应 HTTP/HTTPS 地址，后续网页访问由浏览器处理；文内跳转不访问外部服务。
External PDF web links open their HTTP/HTTPS addresses in the system browser, which handles subsequent browsing. Internal PDF navigation contacts no external service.


## 聊天阅读位置 / Chat reading position

聊天阅读位置只在本机保存对话/回答标识及显示位置，不复制聊天正文、PDF 文字或密钥，不进入聊天备份，也不发送给 AI。回收站中的对话可继续保留位置以供恢复，永久删除对话时清理其位置记录。

Chat reading preferences store only local conversation/reply identifiers and display positions. They contain no message text, PDF text or credentials, are excluded from conversation backups and are never sent to AI. Recycled conversations retain their preferences for recovery; permanent conversation removal clears the saved position.

## 图片批注问答 / Image Q&A annotations

只有主动发送图片问题时，才向所选连接发送本次原始配色选图、圈画、问题及所属文档的文字资料；小文件默认全文，大文件按需引用，不带聊天及其他批注。重新提问成功后才替换原问答和圈画。明确只支持文字的连接可在设置中标记并提前阻止请求；未知能力依据上游明确错误提示，不会自动发送测试图片或产生探测调用。

Only sending an image question transmits its original-color crop, markings, question and source-document text to the selected connection. Small files use full text and large files use relevant excerpts by default, without chat or other annotations. A successful re-question replaces the old Q&A and markings; failures keep them. Mark known text-only connections in settings to block image requests. Unknown capabilities are classified from explicit upstream errors, without automatic probe images or billable test calls.

保存和备份只新增文档关联、页码、相对选区及矢量笔迹，不为每条图片批注持久保存截图或 Base64。重新打开时从已保存 PDF 还原选图；原 PDF 仍按原附件机制保留。派生原色选图采用最多 32 MiB / 24 项的临时缓存，发送图片最多 1 MiB、最长边 1800px、200 万像素；活动预览、合成画布与 PDF 页面内存另计，收起或关闭后释放相应资源。图片批注备份请用 v0.1.26 或更新版本恢复。

Storage and backups add only the document association, page, normalized region and vector markings, without a persisted screenshot or Base64 copy for each annotation. Images are regenerated from the saved PDF; the original PDF remains an attachment. Derived original-color crops use a transient cache capped at 32 MiB / 24 entries. A transmitted image is capped at 1 MiB, 1800px per edge and two million pixels. Active previews, compositing canvases and PDF page memory are separate and released when no longer needed. Restore image-annotation backups with v0.1.26 or newer.

圈画、预览和切换连接不发起模型请求。图片内容和 Base64 不写入文字上下文快照、API 配置或诊断日志。图片问答的连接选择只另存一个本机共享连接标识，不复制密钥，不进入聊天备份。所选服务会接收到主动发送的图片与资料，应依其数据处理规则使用。

Drawing, previewing and switching connections make no model request. Image bytes and Base64 are excluded from text context snapshots, API configuration and diagnostic logs. The image-model preference stores only a local shared-connection ID, without duplicating keys or entering conversation backups. Your chosen service receives images and material you explicitly send and applies its own data-processing rules.

## 新增界面语言 / Additional interface languages

语言选择框改为单层轻边框，去掉原来的棕色焦点框。界面新增西班牙语、日语、繁体中文、德语、阿拉伯语和法语，含简体中文及英语共八种语言；主要操作界面本地化，部分帮助和技术诊断回退英文。阿拉伯语界面从右向左排列，PDF、图表、公式、代码及原始内容保留各自方向。语言选择仅保存在本机，不会翻译或改写论文、聊天与批注正文。

The language picker uses one subtle border, replacing the brown focus frame. Spanish, Japanese, Traditional Chinese, German, Arabic and French join Simplified Chinese and English. Core controls are localized; some help and technical diagnostics fall back to English. Arabic uses a right-to-left interface while PDFs, figures, formulas, code and source content retain their own direction. Language preferences stay local and do not translate or rewrite papers, conversations or annotation content.

浮窗大小只在界面内存中使用，不复制批注正文、图像或模型凭证，不进入聊天备份。

Popup sizes stay only in UI memory, without copying annotation text, images or credentials or entering conversation backups.


## 请求语言偏好 / Request language preferences

界面语言和翻译目标模式仍保存在本机，不进入聊天备份。下一次 AI 提问会在请求提示词中带入默认回答语言；翻译请求带入实际目标语言和所用提示词。只切换语言不联网、不自动翻译已有内容，不修改密钥、地址或自定义偏好。失败请求的重试保留原请求语言。

Interface language and translation target mode remain local preferences outside conversation backups. Fresh AI requests include a default answer-language instruction; translation requests include their resolved target language and prompt. Switching language alone makes no network request, translates no existing content and changes no keys, endpoints or custom preferences. Failed retries retain their original request language.
