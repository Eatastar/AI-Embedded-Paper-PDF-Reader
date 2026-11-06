# AI-Embedded Paper PDF Reader

**AI 嵌入式论文 PDF 阅读器**

**接入自己的 API，在论文原文的批注中直接向 AI 提问。**

这是一个以本地 PDF 阅读为主的桌面阅读器。你可以连接自选的 AI 服务、中转 API，或自行部署的本地模型服务；遇到不懂的内容，划选原文，在批注框里提问、查看回答，再回到原处继续阅读。纸张颜色可以自由调整，需要展开讨论时再打开聊天模式。

**Connect your own API and ask AI questions directly in annotations on a paper.**

A desktop reader built around local PDFs. Connect your preferred AI provider, relay API or self-hosted local model service. Select a passage, ask a question in its annotation panel and read the answer beside the source. Adjust the paper colors to your preference, and open chat when you want a longer discussion.

[下载 / Downloads](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases) · [本版发布说明 / Release notes](docs/RELEASE_NOTES.md) · [隐私 / Privacy](docs/PRIVACY.md) · [版本记录 / Changelog](docs/CHANGELOG.md) · [项目总纲 / Project outline](docs/PROJECT.md)

当前源码版本：**0.1.19**。Windows x64 客户端请以 Releases 中实际发布的完整 ZIP 为准。中文 / English 界面均可在程序内切换，选择保存在本机。

Current source version: **0.1.19**. Download the complete Windows x64 ZIP actually published on Releases. Switch between Chinese and English in the app; your choice is remembered locally.

## 主要功能 / Main features

| 功能 | Feature |
| --- | --- |
| **阅读本地 PDF**：保留论文原排版，支持连续滚动、单页阅读、目录、全文搜索、手势缩放和阅读位置记忆。 | **Read local PDFs** with their original layout, continuous or single-page reading, contents, full-text search, pinch zoom and reading position memory. |
| **自定义纸张颜色**：调节 PDF 纸张和文字颜色，阅读区及工具栏随之配色；保留彩图并可切回原色对照。减少刺眼白底，方便畏光或对明亮屏幕敏感的读者按个人感受调整。 | **Customize paper colors**: adjust PDF paper and text colors, with matching reader controls and margins. Preserve colored figures and compare with original colors. Reduce bright white backgrounds and tailor the display for readers with light sensitivity, including photophobia. |
| **在批注中询问 AI**：划选原文就地提问，问答与来源文字绑定；收起后保留高亮，点击即可重开。支持自选高亮颜色、重新提问，也可只写普通笔记。 | **Ask AI in annotations**: select a passage and ask in place, keeping the Q&A attached to its source. Close the panel and click the highlight to reopen it. Choose highlight colors, ask again or write a plain note. |
| **按需打开聊天模式**：需要进一步讨论时展开聊天，收起后继续阅读，保留当前文档、位置和缩放。聊天回答中的文字也可添加批注。 | **Open chat when needed** for a longer discussion, then return to the same document, position and zoom. Text in AI answers can also be annotated. |

## 自选 API，本地保存配置 / Your API, locally stored settings

**API 地址、模型配置和密钥保存在你的电脑上，不上传到项目方服务器。** 程序不提供项目方托管的密钥服务，也不附带可用密钥；你决定连接谁、使用哪个模型。Windows 桌面版使用系统加密保存密钥；系统加密不可用时，只在本次运行的内存中保留密钥，不写入明文密钥文件。密钥配置与聊天分开保存，不进入聊天备份；请求诊断日志不记录密钥或授权头。

**Your API endpoints, model settings and keys are stored on your computer, not uploaded to a project-operated server.** The app provides no project-hosted credential service or preloaded keys; you choose the service and model. The Windows desktop app encrypts saved keys using the operating system. If encryption is unavailable, keys stay in memory for that session rather than being written to a plaintext key file. Credentials are stored separately from conversations and excluded from conversation backups; diagnostic logs omit keys and authorization headers.

普通阅读、搜索、调色和笔记不调用 AI。**提问或获取模型列表时，密钥会发送给你配置的服务用于认证；提问还会发送相应的对话和文档提取文字。** 原 PDF 不作为文件上传。划词翻译只发送选段和翻译提示词。项目没有云端文件库、账号服务或使用情况收集接口。本地保存避免向项目方托管密钥，但安全性仍取决于你选择的服务和本机环境。完整的数据范围与代理说明见[隐私说明](docs/PRIVACY.md)。

Reading, search, recoloring and plain notes make no AI requests. **Asking a question or fetching models sends authentication to your configured service; questions also send the relevant conversation and extracted document text.** Original PDFs are not uploaded as files. Quick translation sends only the selection and translation prompt. The project has no cloud document library, account service or usage collection endpoint. Local storage avoids entrusting credentials to the project, but security still depends on your chosen service and computer. See [Privacy](docs/PRIVACY.md) for data scope and proxy behavior.

## 开始使用 / Getting started

1. 从 [Releases](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases) 下载 Windows x64 ZIP，**完整解压**后运行 `AI-Embedded-Paper-PDF-Reader.exe`，保留同目录所有文件。更新前先正常退出旧版。
   Download the Windows x64 ZIP from [Releases](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases), **fully extract it** and run `AI-Embedded-Paper-PDF-Reader.exe`, keeping all accompanying files. Exit the old app normally before updating.
2. 在首页打开本地 PDF，在阅读设置中调整纸张和文字颜色。无需配置 API 即可阅读和写普通批注。
   Open a local PDF from the home screen and adjust paper/text colors in Reading settings. Reading and plain annotations work without an API connection.
3. 要使用 AI，在首页点击“配置 API”，填写服务地址和密钥，再“探测上游模型”。从列表选择实际调用的模型，点击“保存并使用”；服务不提供列表时可手动填写模型名称。
   To use AI, open API setup on the home screen, enter the endpoint/key and discover upstream models. Choose the actual model and Save and use, or enter its name manually if listing is unavailable.
4. 划选原文，选择“询问 AI”或“只写批注”。点击高亮重开批注；需要更长的讨论时，从阅读器工具栏打开聊天。
   Select text to ask AI or write a note. Click a highlight to reopen its panel, or open chat from the reader toolbar for a longer discussion.

## 划词翻译与 PDF 链接 / Translation and PDF links

选中文字后右键翻译或按默认 Alt+1；右上角独立“翻译”按钮可设置目标语言、提示词、独立 API 及自定义快捷键。连接列表共用，翻译选择不切换聊天。只发送选段和翻译提示词，不发送全文、所在页或聊天历史。临时面板显示译文和模型，框外点击、Esc 或 × 关闭并丢弃；点击保留后才创建普通批注。翻译设置单独记在本机，不进入聊天备份。

Select text and right-click to translate or press Alt+1. The separate Translate button configures the target language, prompt, independent API and shortcut. Connections are shared without switching chat. Only the selection and translation prompt are sent, without full text, page or history. Outside click, Esc or × discards temporary text/model results; Keep creates a plain note. Settings stay local outside conversation backups.

PDF 自带的参考文献和图号链接支持文内精确跳转，并可返回跳转前位置。HTTP/HTTPS 网页链接交由系统浏览器打开，不执行脚本或文件动作；没有原生链接的文字不猜测跳转。深色配色修正彩色字边缘的白色残影，原 PDF 不改写。

Embedded PDF references/figure links navigate to their page positions, with return navigation. HTTP/HTTPS links open in the system browser; scripts and file actions are not executed. No destination is guessed for unlinked text. Dark colors correct white halos around colored text without modifying the PDF.

## 连接与文档支持 / Connections and document support

- **自选模型服务**：支持 Chat Completions、Responses 和 Anthropic Messages 三种接口格式。提供 GPT、Claude、DeepSeek、中转站、Kimi、千问、Gemini 兼容入口、Grok、Ollama、LM Studio 及自定义模板。阅读器负责连接服务，模型服务本身需自行提供或部署。可用模型及权限由服务商决定。
  **Choose your model service** with Chat Completions, Responses or Anthropic Messages. Templates cover GPT, Claude, DeepSeek, relays, Kimi, Qwen, Gemini's compatible endpoint, Grok, Ollama, LM Studio and custom services. The reader connects to a service you provide or deploy; model availability and permissions depend on that service.
- **获取并选择上游模型**：读取服务的模型列表 API，按实际模型 ID 排序，可筛选并直接选择。连接名称只是本地备注，模型 ID 才是实际调用名称；未列出的模型仍可手动填写。
  **Discover and select upstream models** through the service's model-list API, with filtering and sorting by actual model ID. Connection names are local labels; the selected model ID is what the API receives. Manual entry remains available for unlisted models.
- **大文件按需引用**：PDF 支持最大 150 MiB、5000 页及 1000 万提取字符，打开时显示进度并可取消。默认小文件发送全文提取文字，大文件在本机查找相关段落后发送；可切换范围，原文件留在本机。扫描页可查看和换色，目前无 OCR 或图像理解。
  **Retrieve excerpts for large files**: PDFs support up to 150 MiB, 5,000 pages and 10 million extracted characters, with progress and cancellation. By default, small files contribute their full extracted text; large files contribute locally retrieved passages. The scope is adjustable and original files stay local. Scanned pages support viewing/recoloring, without OCR or image understanding.
- **保留阅读与批注成果**：支持批注定位、问答重新生成、回收站恢复与永久删除、完整备份和追加导入。重新提问成功后才替换旧批注问答，失败重试保留原请求资料。具体范围和容量限制见[客户端说明](outputs/client/README.md)。
  **Keep your reading and annotation work** with annotation navigation, regenerated answers, trash restore/permanent deletion, full backups and additive import. A new annotation answer replaces the previous one only after success; retries retain the original request material. See the [client guide](outputs/client/README.md) for scope and capacity limits.

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

## 翻译滚动保留 / Translation while scrolling

滚动时保留翻译框，连续阅读暂留当前翻译的来源页，滚远后仍可保留为原位置的批注。普通框外点击、Esc 或 × 关闭，拖动滚动条不会关闭。

The translation panel remains open while scrolling, retaining its source page in continuous reading so it can still be saved as a note at the original passage. Ordinary outside click, Esc or × closes it; dragging the scrollbar does not.
