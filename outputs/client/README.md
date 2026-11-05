# AI-Embedded Paper PDF Reader

**AI 嵌入式论文 PDF 阅读器** · 0.1.12 · 20261106.1

本地 PDF 阅读、原文批注和按需 AI 问答。项目介绍、功能、实现分工和复用说明见[项目首页](../../README.md)，历史变化见[版本记录](../../docs/CHANGELOG.md)。

Local PDF reading, annotations and optional AI questions. See the [project README](../../README.md) for features, implementation credits and adaptation, and the [changelog](../../docs/CHANGELOG.md) for history.

## 桌面版 / Desktop

完整解压 Windows ZIP，运行 `AI-Embedded-Paper-PDF-Reader.exe`，保留同目录所有文件。无需另外安装 Node.js。更新前正常退出旧版，避免同时打开新旧版本。

Fully extract the Windows ZIP and run `AI-Embedded-Paper-PDF-Reader.exe`, keeping all accompanying files. No separate Node.js installation is needed. Exit the old version normally before updating; do not run both versions together.

首页打开本地 PDF，或继续最近阅读。相同内容只显示一次，同名但不同内容分别保留。阅读工具栏左侧打开文件和文档导航，右侧是阅读设置、聊天和关闭。阅读设置支持连续/单页、纸张与文字配色、原色对照及语言选择。

Open a local PDF or continue a recent document. Identical content appears once; different content with the same filename remains separate. The toolbar provides file opening and navigation on the left, with reading settings, chat and close on the right. Reading settings offer continuous/single pages, paper/text colors, original colors and language.

## 批注与颜色 / Annotations and colors

划选原文，选择询问 AI 或只写批注。点击高亮打开批注，× 或框外点击收起，拖动标题栏可移动。每条批注的“高亮颜色”提供八种预设、系统颜色选择器和 `#RRGGBB` / `#RRGGBBAA` 输入。颜色随批注保存和备份。

Select text to ask AI or write a note. Click a highlight to open it; × or an outside click closes the panel. Drag its title bar to move it. Highlight color offers eight presets, a system color picker and `#RRGGBB` / `#RRGGBBAA` input. Colors are saved and backed up with annotations.

每处高亮保留一组当前问答。可编辑或重新提问，新回答成功后才替换旧问答；失败或停止保留旧结果。批注内没有嵌套批注。重新生成主回答创建独立版本，旧批注留在原回答上。

Each highlight has one current Q&A. Edit it or ask again; replacement happens only after a successful new answer. Failure or stopping keeps the old result. Annotations have no nested annotations. Regenerating the main answer creates a separate version, with old annotations staying on the original.

## 界面语言 / Interface language

在首页、阅读设置或模型设置中选择“简体中文 / English”，选择会在本机记住。切换只影响菜单、按钮和提示，不改写论文、聊天、笔记、已保存连接名称或回答偏好。AI 回答语言仍由你的问题和模型偏好决定。

Choose 简体中文 / English on the home screen or in reading/model settings. The app remembers your choice locally. Switching changes menus, buttons and hints; it does not rewrite papers, conversations, notes, saved connection names or answer preferences. AI answer language still depends on your question and model preferences.

## 模型与联网 / Models and networking

在“模型与设置”保存自己的 API 地址、模型名和密钥。提供 GPT、Claude、DeepSeek、中转站及“其他”模板，其他服务含 Kimi、千问、Gemini 兼容入口、Grok、Ollama、LM Studio 和自定义地址。接口格式表示协议：Chat Completions、Responses 或 Anthropic Messages。

Save your API address, model name and key in Models & settings. Templates include GPT, Claude, DeepSeek, relays and Other, with Kimi, Qwen, Gemini's compatible endpoint, Grok, Ollama, LM Studio and custom addresses. API formats are protocols: Chat Completions, Responses or Anthropic Messages.

保存或切换连接不发送问题。远程服务用 HTTPS，本机未启用鉴权时可留空密钥。桌面版沿用系统代理；API 地址仍填服务商地址。发送问题会发送完整有效主对话和该对话全部附件提取文字，不静默截断。详见[隐私说明](../../docs/PRIVACY.md)。

Saving or switching sends no question. Use HTTPS for remote services; leave the key empty for local services without authentication. The desktop app follows the system proxy; use the provider's address in the API field. Asking sends the full valid main conversation and extracted text from all its attachments without silent truncation. See [Privacy](../../docs/PRIVACY.md).

## 数据与备份 / Data and backups

更名不迁移原数据。桌面版沿用 `%APPDATA%\MarginChat`、原数据库名称和应用标识。界面语言、阅读颜色和位置是单独的本机偏好，不进入聊天备份。普通删除进入回收站，可恢复或确认永久删除；以前的自动备份和导出文件可能仍包含旧内容。

Renaming does not move existing data. The desktop app keeps `%APPDATA%\MarginChat`, its database name and app identity. Interface language, reading colors and position are separate local preferences, outside conversation backups. Ordinary deletion moves records to trash for restoration or confirmed permanent deletion. Earlier backups and exports may still contain old content.

“备份与恢复”支持完整/当前对话导出、兼容旧版导出、自动备份和恢复为新对话。备份含批注、回答版本和附件原文件，不含模型配置或密钥。正常关闭会等待保存；保存失败可重试或取消退出。启动无反应时可运行同目录“启动诊断.cmd”，不要向别人发送整个数据目录或模型配置。

Backup & restore supports full/current-conversation export, legacy export, automatic backups and restoration as new conversations. Backups include annotations, answer versions and original attachments, but no model settings or keys. Normal exit waits for saving; retry or cancel exit if saving fails. If startup fails, run the bundled 启动诊断.cmd. Do not share your whole data directory or model configuration.

## 限制 / Limits

单文件最多 25 MiB、PDF 300 页、提取文本 100 万字符，每对话最多 10 个附件。扫描页可看和换色，目前无 OCR 或图像理解。目录依赖内嵌结构，搜索使用本机提取文本。

Each file is limited to 25 MiB, 300 PDF pages and 1 million extracted characters; each conversation supports up to 10 attachments. Scanned pages support viewing and recoloring, without OCR or image understanding. Contents depend on embedded outlines; search uses locally extracted text.

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

原创应用代码全部由 GPT 通过 Codex 实现，人类发起者提出想法、确定需求并选择功能。欢迎任何人下载并用 AI agent / vibe coding 修改；发布衍生版时，请链接[上游](https://github.com/Eatastar/Learn-Something)。项目自身代码采用 MIT，第三方署名和许可继续保留。见[贡献说明](../../docs/ATTRIBUTION.md)。

All original application code was implemented by GPT through Codex; the human initiator proposed ideas, defined requirements and selected features. Anyone may download and adapt it with AI agents / vibe coding. Please link to [upstream](https://github.com/Eatastar/Learn-Something) when publishing a derivative. Original code uses MIT; third-party attribution and licenses remain applicable. See [Attribution](../../docs/ATTRIBUTION.md).
