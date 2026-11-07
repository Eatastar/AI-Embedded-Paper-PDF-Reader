# AI-Embedded Paper PDF Reader v0.1.31

面向文献、教材与 PDF 书籍精读的本地阅读器。接入自己的 API，在原文旁批注提问、圈图询问或快速翻译，需要展开讨论时再打开聊天；纸张与文字颜色可按个人感受调整。

A local reader for close reading of papers, textbooks and PDF books. Connect your own API to ask beside a passage, mark a figure for image Q&A or translate selected text. Open chat for deeper discussion and adjust paper and text colors to suit your reading preferences.

## 从 v0.1.25 以来的更新 / Changes since v0.1.25

- **图片圈画问答**：在 PDF 中按 **Ctrl+Alt+A** 或点击框选图片，选中图表、坐标、图例或图注。默认画圈，也可切换画笔、颜色和粗细，再使用自己保存的视觉模型提问。问答、选区和笔迹保存在本机；重新提问成功后才替换原内容。
  **Marked-image Q&A**: press **Ctrl+Alt+A** or use Select image to capture a PDF figure with its axes, legend or caption. Circle a detail by default, or use the pen, colors and widths, then ask a saved image-capable model. Q&A, regions and markings stay local; re-questioning replaces the original only after a successful answer.
- **清楚处理模型能力与缓存**：可标记只支持文字的连接，提前阻止图片请求；上游拒绝图片时显示对应提示并保留问题与原问答。图片只在主动提问时发送，不自动探测；派生选图使用最多 **32 MiB / 24 项**的临时缓存，不为每条批注持久保存截图副本。
  **Model capability and bounded image caching**: mark text-only connections to block image requests before sending. Explicit image-rejection errors retain the question and existing Q&A. Images are sent only on an explicit question, without automatic probe calls. Derived crops use a transient cache capped at **32 MiB / 24 entries**, without a persistent screenshot copy per annotation.
- **八种界面语言**：支持简体中文、English、西班牙语、日语、繁体中文、德语、阿拉伯语及法语。阿拉伯语界面支持从右向左排列，PDF、图表和公式保留各自方向。主要操作已本地化，部分帮助和技术诊断回退英文。
  **Eight interface languages**: Simplified Chinese, English, Spanish, Japanese, Traditional Chinese, German, Arabic and French. Arabic uses a right-to-left interface while PDFs, figures and formulas keep their own directions. Core controls are localized; some help and technical diagnostics fall back to English.
- **回答与翻译跟随语言**：聊天、文字/图片批注的默认回答语言，以及默认翻译目标和默认提示词，跟随界面语言。翻译可设置固定目标语言；自定义提示词保留，明确指定的回答语言优先。切换不改写已有内容，失败重试保留原请求。
  **Language-aware answers and translation**: default chat and annotation answers, translation targets and built-in prompts follow the interface. Translation can use a fixed target. Custom prompts remain intact and explicit answer-language requests take priority. Existing content and frozen failed-request retries stay unchanged.
- **批注框可拖动、缩放及停靠**：文字、图片和翻译面板可从边角调整大小。图片批注拖走或缩放后自动释放原停靠区域，不再留下大片空白；图钉可重新停靠。聊天左下角新增设置入口。
  **Move, resize and dock popups**: resize text, image and translation panels from their edges or corners. Moving or resizing image Q&A releases its reserved dock area, removing the blank space; use the pin to dock again. Chat now has a settings entry at the bottom left.
- **修复遮挡与溢出**：重新提问的发送按钮与输入框保留明确间距，窄面板下操作栏自动换行；修复模型/翻译设置、语言选择框和长接口错误信息溢出。
  **Fix overlapping and overflowing controls**: a clear gap separates re-ask inputs from Send and replace. Actions wrap in narrow panels. Model/translation settings, the language picker and long upstream errors stay within their bounds.

## 原有精读功能 / Existing close-reading features

本地 PDF 阅读、自选 API、自定义纸张与文字颜色、划词翻译（默认 **Alt+1**）、文字批注、主动引用批注到聊天、聊天阅读位置恢复等功能继续保留。

Local PDF reading, your own API, adjustable paper/text colors, quick translation (**Alt+1**), text annotations, explicit annotation references in chat and restored chat reading positions remain available.

## 下载与更新 / Download and update

下载 Assets 中的 **AI-Embedded-Paper-PDF-Reader-0.1.31-Windows-x64.zip**，完整解压，正常退出旧版后运行新目录内的 **AI-Embedded-Paper-PDF-Reader.exe**，保留同目录文件。原本机聊天、批注、阅读数据与 API 连接继续使用。GitHub 自动生成的 Source code 压缩包用于查看或构建源码，Windows 用户请选择完整客户端 ZIP。建议用本版恢复包含图片批注的新备份。

Download **AI-Embedded-Paper-PDF-Reader-0.1.31-Windows-x64.zip** from Assets, fully extract it, exit the old app normally and run **AI-Embedded-Paper-PDF-Reader.exe** from the new folder, keeping all accompanying files. Existing local chat, annotations, reading data and API connections remain in use. GitHub's automatic source archives are for inspecting or building the code; Windows users should choose the full client ZIP. Use this version to restore new backups containing image annotations.

## 本地数据与 AI 请求 / Local data and AI requests

API 配置保存在本机；系统加密可用时，保存的密钥使用系统加密，密钥不进入聊天备份。项目不运行文档、凭证托管或使用统计服务。主动调用 AI 时，认证信息与本次选中的文字、图片或对应资料会发送给你配置的服务。PDF 批注不自动带入聊天及其他批注；翻译只发送选中文字与翻译设置。详见[隐私说明](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md)。

API settings stay local. Saved keys use operating-system encryption when available and are excluded from conversation backups. The project operates no document hosting, credential hosting or usage analytics service. Explicit AI requests send authentication and their scoped text, image or source material to your configured provider. PDF annotations do not automatically include chat or other annotations; translation sends only selected text and translation settings. See [Privacy](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md).

## 验证与校验 / Validation and checksum

318 项自动测试、125 项完整客户端交互检查、107 项图片问答检查、97 项原有界面检查、19 项停靠检查、432 组布局检查及 18 组长文本检查通过；实际 EXE 启动、保存、备份及正常退出验证通过。测试使用虚构资料和本地模拟接口。

Validation passed: 318 automated tests, 125 full-client interaction checks, 107 image Q&A checks, 97 existing UI checks, 19 docking checks, 432 layout cases and 18 long-text cases, plus real EXE startup, save, backup and normal-exit verification. Tests use synthetic data and local mock endpoints.

ZIP SHA-256:

```text
c712cd5a7e15b63580bf1afb7ddae8595baf207a07859b5e7fb310d87a5c873d
```

## 实现与复用 / Implementation and reuse

本项目原创应用代码全部由 GPT 通过 Codex 实现；人类发起者负责想法、需求及功能取舍。第三方组件保留各自作者与许可证。项目采用 MIT 许可证，欢迎下载并通过 AI agent 或 vibe coding 改成适合自己的版本；发布衍生项目时，请链接[本项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。

Original application code was implemented entirely by GPT through Codex; the human initiator provides ideas, requirements and product decisions. Third-party authorship and licenses remain distinct. The project uses MIT: download it and adapt it with an AI agent or vibe coding. Please link to [this project](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing a derivative.
