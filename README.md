# AI-Embedded Paper PDF Reader

**AI 嵌入式论文 PDF 阅读器** · 原名 learn something

以本地论文阅读为主、AI 对话为辅助。在 PDF 原文或 AI 回答中划选文字，就地询问或写笔记。收起后保留自选颜色的高亮，点击即可重新打开。支持中文和 English 界面，语言选择保存在本机。

A local paper reader with optional AI conversations. Select text in a PDF or an AI answer to ask a question or write a note in place. Highlights keep your chosen colors; click one to reopen it. Choose a Chinese or English interface, remembered locally.

[下载 / Downloads](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases) · [隐私 / Privacy](docs/PRIVACY.md) · [版本记录 / Changelog](docs/CHANGELOG.md) · [项目总纲 / Project outline](docs/PROJECT.md)

当前源码版本为 **0.1.15**，首个公开正式版为 **v0.1.11**。请以 Releases 中实际发布的附件为准。项目采用 [MIT 许可证](LICENSE)。仓库已更名为 AI-Embedded-Paper-PDF-Reader；原 Learn-Something 地址会跳转到新仓库，已有下载和引用链接继续有效。

The current source version is **0.1.15**; **v0.1.11** was the first public release. Download the assets actually available on the Releases page. The project uses the [MIT license](LICENSE). The repository is now named AI-Embedded-Paper-PDF-Reader. The former Learn-Something address redirects to it, preserving existing download and reference links.

## 开始使用 / Getting started

1. 完整解压 Windows x64 ZIP，运行 `AI-Embedded-Paper-PDF-Reader.exe`，保留同目录所有文件。v0.1.11 的入口是 `LearnSomething.exe`。
   Fully extract the Windows x64 ZIP and run `AI-Embedded-Paper-PDF-Reader.exe`, keeping all accompanying files. The v0.1.11 entry point is `LearnSomething.exe`.
2. 在首页打开本地 PDF；在首页、阅读设置或模型设置中选择中文 / English。阅读设置可自定义纸张和文字颜色。
   Open a local PDF from the home screen. Choose Chinese / English on the home screen or in reading/model settings. Customize paper and text colors in Reading settings.
3. 划选原文，选择询问 AI 或只写批注。在批注框的“高亮颜色”中选择预设色、自定义颜色或十六进制颜色。
   Select text to ask AI or write a note. Highlight color in the annotation panel offers presets, custom colors and hexadecimal input.
4. 首页直接显示 API 连接。填写地址和密钥，点击“探测上游模型”并选择模型；也可手动填写，从首页或聊天输入框切换已保存连接。
   The home screen shows your API connection. Enter its address and key, click Discover models and choose one, or enter a name manually. Switch saved connections on the home screen or at the lower left of chat.

普通阅读、搜索和笔记不调用 AI。发送问题会发送完整有效主对话；附件默认小文件全文、大文件按需引用，另带选中文字及所在页片段。原文件留在本机。自动模式在超过 25 MiB、300 页或 12 万提取字符时使用本地关键词检索，每份引用片段最多 2.4 万字符；选区和对话另计。阅读设置可切换全文或按需引用，工具栏显示范围。失败重试沿用首次请求的资料；资料不足会明确提示，全文仍受请求与模型容量限制，不静默截断主对话。桌面版沿用系统代理，不附带代理节点或 API 密钥。详见[隐私说明](docs/PRIVACY.md)。

Reading, search and personal notes make no AI requests. Asking sends the full valid main conversation. Auto mode sends full extracted text for small files and locally retrieved excerpts for large files, plus the selection and passages from its page. Original files stay local. Above 25 MiB, 300 pages or 120,000 extracted characters, local keyword retrieval selects up to 24,000 excerpt characters per file; the selection and conversation are additional. Reading settings can override this scope, shown in the toolbar. Failed requests retry with their original material. Missing evidence is disclosed; full text remains subject to request and model capacity, without silently truncating the main conversation. The desktop app follows your system proxy and includes no proxy nodes or API keys. See [Privacy](docs/PRIVACY.md).

## 功能 / Features

| 功能 | Feature |
| --- | --- |
| 本地阅读优先，重复内容只显示一次，聊天按需打开 | Local reading first, duplicate content displayed once, optional chat |
| PDF 原排版、单页/连续阅读、手势缩放与续读 | Original PDF layout, single/continuous pages, pinch zoom and reading position memory |
| 整套阅读器随纸张换色、后台快速预览、保留彩图和原色对照 | Reader-wide paper colors, background previews, preserved colored areas and original-color comparison |
| 自选高亮颜色、可拖动批注框、框外点击收起 | Custom highlight colors, movable panels and outside-click dismissal |
| 原文提问、普通笔记、成功后才覆盖的重新提问 | Questions about text, personal notes and replace-on-success questions |
| 回答版本独立，旧批注跟随原回答 | Separate answer versions; annotations stay with the original answer |
| PDF 目录、全文搜索、批注筛选定位 | PDF contents, full-text search and filtered annotation navigation |
| 中英文界面切换并记忆，不改写原文和聊天 | Remembered Chinese/English interface, without rewriting documents or chats |
| 首页 API 入口、上游模型获取与筛选、手动填写兜底 | Home API setup, model discovery/filtering and manual fallback |
| 多模型预载、三种接口格式及本地模型 | Saved connections, three API formats and local models |
| PDF 最大 150 MiB / 5000 页、本地按需引用、固定资料重试 | PDFs up to 150 MiB / 5,000 pages, local excerpt retrieval and fixed-context retries |
| 回收站恢复/永久删除、完整备份与追加导入 | Trash restore/permanent deletion, full backups and additive import |

支持 Chat Completions、Responses、Anthropic Messages。模板包括 GPT、Claude、DeepSeek、中转站、Kimi、千问、Gemini 兼容入口、Grok、Ollama、LM Studio 及自定义服务。可用模型由服务商决定。扫描页支持查看和换色，目前不含 OCR 或图片理解。

Supports Chat Completions, Responses and Anthropic Messages. Templates include GPT, Claude, DeepSeek, relays, Kimi, Qwen, Gemini's compatible endpoint, Grok, Ollama, LM Studio and custom services. Model availability depends on the provider. Scanned pages support viewing and recoloring, without OCR or image understanding.

## 自由修改与署名 / Adaptation and credits

欢迎任何人下载、使用、fork 本项目，并用 **AI agent / vibe coding** 修改成适合自己的版本。发布衍生版时，请在 README 或发布说明中链接[本项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)，例如“基于 AI-Embedded Paper PDF Reader 修改”。这是友好的来源标注请求，不增加 MIT 许可证之外的限制。

Everyone is welcome to download, use and fork this project, and adapt it with **AI agents / vibe coding**. Please link to [this project](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing a derivative, for example “Based on AI-Embedded Paper PDF Reader.” This is a courtesy request and adds no restrictions to the MIT license.

**本项目的原创应用代码全部由 GPT 通过 Codex 实现。人类发起者负责提出想法、确定需求，并对功能进行选择和取舍。** 第三方代码保留各自作者的版权、署名和许可证，不属于上述 GPT 原创声明。见[贡献说明](docs/ATTRIBUTION.md)和[第三方组件](docs/THIRD_PARTY.md)。

**All original application code was implemented by GPT through Codex. The human initiator proposed ideas, defined requirements and selected features and trade-offs.** Third-party code retains its own authorship, copyright and licenses and is not claimed as original GPT work. See [Attribution](docs/ATTRIBUTION.md) and [Third-party components](docs/THIRD_PARTY.md).

GitHub 项目来源请使用仓库链接；需要通知维护者时，可在相关 Issue、PR 或 Discussion 中 `@Eatastar`。仓库本身不是可用 `@项目名` 通知的用户账户。

Use a repository link to credit the project. To notify the maintainer, mention `@Eatastar` in a relevant issue, pull request or discussion. A repository is not a user account that can be notified with `@project-name`.

## 开发 / Development

需要 Node.js 22.12+ 与 pnpm。依赖版本由锁文件固定。

Requires Node.js 22.12+ and pnpm. Dependencies are pinned in the lockfile.

```sh
pnpm --dir outputs/client install --frozen-lockfile
pnpm --dir outputs/client test
pnpm --dir outputs/client build
pnpm --dir outputs/client dev
pnpm --dir outputs/client build:desktop
```

源码在 `outputs/client/`，桌面包在本机生成到 `outputs/windows/`。构建时复制 PDF.js 离线资源。详见[客户端说明](outputs/client/README.md)、[后续计划](docs/ROADMAP.md)。

Source lives in `outputs/client/`; desktop packages are generated locally in `outputs/windows/`. The build copies PDF.js offline assets. See the [client guide](outputs/client/README.md) and [roadmap](docs/ROADMAP.md).

## 提交范围与许可 / Repository scope and license

这里只保存源码、测试、依赖清单、通用品牌资源和文档。个人聊天、API 配置与密钥、日志、备份、论文和阅读截图不属于源码。发布前运行 `node tools/source-audit.mjs`，报告写到忽略的 `work/` 目录，不读取个人数据目录。

Only source, tests, dependency manifests, generic branding assets and documentation belong here. Personal conversations, API settings/keys, logs, backups, papers and reading screenshots do not. Run `node tools/source-audit.mjs` before publishing. Reports go to ignored `work/` and do not read the personal data directory.

项目自身代码采用 [MIT](LICENSE)，第三方许可继续保留。首次公开前检查范围见 [OPEN_SOURCE_RELEASE](docs/OPEN_SOURCE_RELEASE.md)，提交规则见 [REPOSITORY_POLICY](docs/REPOSITORY_POLICY.md)。Windows 包保留 Electron、Chromium 及依赖许可文件。

Original project code uses [MIT](LICENSE), with third-party licenses retained. See [OPEN_SOURCE_RELEASE](docs/OPEN_SOURCE_RELEASE.md) for the first public release audit and [REPOSITORY_POLICY](docs/REPOSITORY_POLICY.md) for commit rules. Windows packages keep Electron, Chromium and dependency license files.


## 模型选择 / Model selection

连接名称只作本地备注；在上游模型下拉框中选择实际调用模型，保存并使用后生效。模型按名称及自然数字顺序排列，手动输入按需展开，保留未列出的自定义模型。

Connection names are local labels. Choose the actual API model in the upstream list and Save and use. Models sort by name with natural numbers; manual entry expands on demand and preserves unlisted custom models.
