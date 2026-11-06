# AI-Embedded Paper PDF Reader v0.1.15

**接入自己的 API，在论文原文的批注中直接向 AI 提问。** 这是一个以本地 PDF 阅读为主的桌面阅读器，支持自选 AI 服务、中转 API 和自行部署的模型服务。

**Connect your own API and ask AI questions directly in annotations on a paper.** A desktop reader built around local PDFs, with your preferred AI provider, relay API or self-hosted model service.

## 四项主要功能 / Four main features

- **阅读 PDF**：保留原排版，连续滚动或单页阅读，支持目录、搜索、手势缩放及续读。
  **Read PDFs** in their original layout, with continuous/single-page reading, contents, search, pinch zoom and reading position memory.
- **调整纸张颜色**：自选纸张和文字颜色，阅读器工具栏与周边同步配色，保留彩图并支持原色对照。减少刺眼白底，方便畏光或对明亮屏幕敏感的读者按个人感受调整。
  **Adjust paper colors** with matching reader controls/margins, preserved colored figures and original-color comparison. Reduce bright white backgrounds and tailor the display for readers with light sensitivity, including photophobia.
- **AI 问答批注**：划选原文就地提问，问答留在对应高亮里，点击重开；支持自选高亮颜色、重新提问及普通笔记。
  **AI Q&A annotations**: select a passage and ask in place. Reopen the Q&A from its highlight, choose highlight colors, ask again or write a plain note.
- **聊天模式**：需要进一步讨论时打开，收起后回到原文，保留阅读位置和缩放。
  **Optional chat** for longer discussions, returning to the document with reading position and zoom retained.

## 自 v0.1.12 以来的更新 / Updates since v0.1.12

- **API 入口与模型选择更直接**：首页显示 API 配置及“探测上游模型”；有可用连接时直接读取服务的模型列表 API。兼容完整的 `/responses`、`/chat/completions`、`/messages` 或 `/models` 地址，修复列表地址拼接错误。模型按实际 ID 排序，可筛选、直接选择并保存使用；手动输入按需展开。连接名称只是本地备注。
  **Easier API setup and model selection**: configure or discover models from the home screen. A usable saved connection fetches the provider's model-list API directly. Full `/responses`, `/chat/completions`, `/messages` and `/models` addresses are supported with corrected list-path derivation. Filter models, sorted by their actual IDs, then select and save one. Manual entry expands on demand; connection names are local labels.
- **支持更大的论文**：PDF 上限提高到 150 MiB、5000 页和 1000 万提取字符；提取显示进度并可取消，页面按需准备和绘制。默认“小文件全文，大文件按需引用”，在本机查找相关段落，减少不必要的 AI 上下文；可在阅读设置中切换范围。
  **Larger papers**: PDFs support up to 150 MiB, 5,000 pages and 10 million extracted characters, with cancellable extraction progress and on-demand page preparation/rendering. Auto mode uses full extracted text for small files and locally retrieved passages for large files, reducing unnecessary AI context. Override the scope in Reading settings.
- **阅读配色更连贯**：纸张色同步到工具栏、阅读区边缘、设置、导航和批注框。调色在后台快速预览，停下后恢复清晰；过期结果不再覆盖新颜色，选色器不再被色值回写打断。
  **More consistent reading colors**: paper colors extend to the toolbar, margins, settings, navigation and annotation panels. Background previews refine after adjustment; stale jobs no longer overwrite newer colors or reset the native picker.
- **失败重试保留原资料**：主聊天和批注均沿用首次请求的资料，后续切换范围不改变该次重试；全文超出请求或模型容量时明确提示。
  **Retries retain their original material** for both chat and annotations, even after changing context scope. Oversized full-text requests produce an explicit error.

## API 与隐私 / API and privacy

API 地址、模型配置和密钥保存在本机，不上传到项目方服务器。Windows 桌面版使用系统加密保存密钥；系统加密不可用时，密钥仅留在本次运行的内存中。模型凭证字段不进入聊天备份，诊断日志不记录密钥或授权头。

Endpoints, model settings and keys stay on your computer, without upload to a project-operated server. The Windows desktop app encrypts saved keys using the operating system; if encryption is unavailable, keys remain in session memory only. Model credential fields are excluded from conversation backups; diagnostic logs omit keys and authorization headers.

普通阅读、调色、搜索和笔记不调用 AI。提问或获取模型列表时，密钥会发给你配置的服务用于认证；提问还会发送相应的对话和提取文字，原 PDF 不作为文件上传。默认大文件采用本地检索片段，仍包含选区、所在页片段和完整有效主对话；按需引用可能遗漏材料，可按需要切换。所选服务和本机环境仍影响安全性。详见[隐私说明](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md)。

Reading, recoloring, search and plain notes make no AI requests. Asking or listing models sends authentication to your configured service; questions also send conversation and extracted text. Original PDFs are not uploaded as files. Large-file retrieval includes the selection, passages from its page and full valid main conversation; retrieval can miss material, so adjust the scope when needed. Security still depends on your chosen service and computer. See [Privacy](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md).

## 下载与更新 / Download and update

下载 `AI-Embedded-Paper-PDF-Reader-0.1.15-Windows-x64.zip`，**完整解压**，运行其中的 `AI-Embedded-Paper-PDF-Reader.exe`。保留同目录全部文件，无需另装 Node.js。更新前正常退出旧版，不要同时运行新旧版本；已有聊天、批注、阅读偏好和模型连接继续沿用。历史 Release 与附件保留。

Download `AI-Embedded-Paper-PDF-Reader-0.1.15-Windows-x64.zip`, **fully extract it** and run `AI-Embedded-Paper-PDF-Reader.exe`. Keep all accompanying files; no separate Node.js installation is needed. Exit the old app normally before updating and avoid running both versions together. Existing conversations, annotations, reading preferences and connections remain in use. Historical releases/assets are preserved.

本版仍不包含 OCR 或扫描图片理解；全工作区备份保留 350 MB 容量保护，大量文件可分别导出对话。上游模型列表、权限和上下文容量由所选服务决定。

This release has no OCR or scanned-image understanding. Full workspace backups retain a 350 MB capacity guard; export conversations separately for larger collections. Upstream model listing, permissions and context capacity depend on the chosen service.

校验文件 / Checksum file: `AI-Embedded-Paper-PDF-Reader-0.1.15-Windows-x64.zip.sha256`

ZIP SHA-256: `45e4aeaf8ffde1aeea15a4dbc0b1bfe9cb0ef2509461c3b21ba390880c3e5cd0`

## 验证与署名 / Validation and credits

此程序已通过 243 项自动检查、555 项交付核对，以及两次实际 EXE 启动、保存、完整备份和正常退出验证。隔离测试使用合成 PDF 和模拟 API，核对大文件、配色、模型选择及实际请求中的模型 ID，不读取个人记录或调用真实 API。此次发布文档整理不改动已验证的程序和 ZIP 字节。

The application passed 243 automated tests, 555 package checks and two real EXE startup/save/full-backup/normal-exit checks. Isolated testing used synthetic PDFs and mocked APIs to check large files, colors, model selection and the model ID in an actual mocked request. No personal records or real API calls were used. This release documentation update does not alter the verified application or ZIP bytes.

原创应用代码全部由 GPT 通过 Codex 实现；人类发起者负责想法、需求与功能取舍。欢迎下载、fork 和用 AI agent / vibe coding 修改成适合自己的版本，发布衍生版时请链接[上游项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。这是友好署名请求；MIT 与第三方许可继续适用。

GPT through Codex implemented all original application code; the human initiator supplied ideas, requirements and feature trade-offs. Download, fork and adapt with AI agents / vibe coding; please link [upstream](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing derivatives. This is a courtesy attribution request; MIT and third-party licenses continue to apply.
