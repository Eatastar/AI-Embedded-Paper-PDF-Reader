# AI-Embedded Paper PDF Reader v0.1.16

新增划词翻译，并修复深色阅读的彩色字边缘与 PDF 引用跳转。
Adds selection translation and fixes colored text edges in dark reading and PDF reference navigation.

## 划词翻译 / Quick translation

- 选中文字后右键翻译或按 **Alt+1**。支持 PDF 原排版、提取文字与聊天中的完整回答。
  Select text and right-click to translate or press **Alt+1** in PDF pages, extracted text and completed chat answers.
- 右上角独立“翻译”按钮，与阅读设置分开，可设置目标语言、自定义提示词、独立 API 和快捷键，并恢复默认。原文语言自动识别，目标语言与界面语言分开。
  A separate Translate button configures target language, custom prompt, independent API and shortcut, with restore-default actions. Source language is detected automatically; the target language is independent of the interface language.
- 连接与聊天、批注共用。新建连接可供全程序使用，选择翻译连接不切换聊天；编辑共享连接会影响所有使用它的功能。
  Connections are shared with chat and annotations. New connections are available throughout the app; choosing a translation connection does not switch chat. Editing a shared connection affects every feature using it.
- **只发送选中文字和翻译提示词**，不带全文、所在页、聊天历史、其他批注或聊天偏好。三种接口格式沿用已有系统代理和本机加密凭证。
  **Only the selection and translation prompt are sent**, without full text, the page, chat history, other annotations or chat preferences. All three API formats retain existing proxy and locally encrypted credential handling.
- 原文旁的临时面板只显示译文和本次模型，提供复制、保留、关闭操作，可拖动并跟随阅读配色。框外点击、Esc 或 × 关闭并停止未完成请求，晚到结果不会重新弹出。超长选段明确提示，不截断。
  A movable temporary panel beside the source shows the translation and its model, with copy, keep and close controls and matching reading colors. Outside click, Esc or × discards it and cancels pending work; late results do not reopen it. Oversized selections are rejected without truncation.
- 点击“保留为普通批注”才创建高亮和可编辑笔记，保留译文与模型来源。临时译文不进入聊天、批注列表或备份；保留后随普通笔记正常保存、备份和恢复。
  Keep as a plain note creates the highlight and editable note with its translation/model source. Temporary results stay out of chats, annotation lists and backups; kept notes persist, back up and restore normally.

## PDF 修复 / PDF fixes

- 修正蓝色引用等彩色字与白纸混合的抗锯齿边缘，减少深色背景下的白色残影；保留彩色区域内部和原 PDF 字节。
  Corrects white-matted antialiased edges around colored text on dark paper, preserving colored interiors and original PDF bytes.
- 恢复 PDF 自带的参考文献和图号链接，跳到目的页的具体位置。连续和单页模式均支持，可从工具栏返回跳转前位置；保留正常拖选，已有批注优先打开。
  Follows embedded PDF reference/figure links to their positions within destination pages in continuous and single-page modes, with return navigation. Text selection remains available and existing annotations take precedence.
- 普通 HTTP/HTTPS 链接在系统浏览器打开，不执行 PDF 脚本、启动文件或外部文档动作。没有内嵌链接的文字不会猜测跳转。
  HTTP/HTTPS links open in the system browser. PDF scripts, file launches and external-document actions are not executed. No destination is guessed for unlinked text.

## 隐私与更新 / Privacy and updating

API 配置与密钥保存在本机，不上传到项目方服务器；调用时仍向所选服务发送认证。翻译设置单独记在本机，不进入聊天备份。原应用标识、数据位置、数据库与备份格式保持兼容，历史 Release、标签和附件保留。

API settings and keys stay on your computer rather than being uploaded to a project-operated server; authentication is sent to the chosen service when calling it. Translation settings are separate local preferences outside conversation backups. App identity, data location, database and backup formats remain compatible; historical releases, tags and assets are preserved.

下载完整 Windows x64 ZIP，全部解压后运行 AI-Embedded-Paper-PDF-Reader.exe，保留同目录全部文件。先正常退出旧版，再运行新版。
Download and fully extract the Windows x64 ZIP, then run AI-Embedded-Paper-PDF-Reader.exe, keeping all accompanying files. Exit the old version normally before starting the new one.

原创应用代码全部由 GPT 通过 Codex 实现；人类发起者负责想法、需求与功能取舍。欢迎下载、fork 和用 AI agent / vibe coding 改造，发布衍生版时请链接[上游项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。MIT 与第三方许可继续适用。

GPT through Codex implemented all original application code; the human initiator supplied ideas, requirements and feature trade-offs. Download, fork and adapt with AI agents / vibe coding; please link [upstream](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing derivatives. MIT and third-party licenses continue to apply.

## 验证与校验 / Validation and checksum

251 项自动检查、558 项交付核对通过。打包目录与最终交付目录的 EXE 均实际启动、保存、创建完整备份并正常退出。隔离界面验证右键 / Alt+1 / 自定义快捷键、共享连接新建、独立模型调用、译文转笔记及刷新恢复；实际导出的备份不包含临时译文、翻译设置或模型凭证，合成 PDF 原字节一致。连续和单页引用、图号定位、返回及深色边缘均已检查。所有验证使用合成资料和模拟 API，不读取个人记录或调用真实服务。

251 automated tests and 558 package checks passed. Both packaged and delivered executables passed real startup, save, full backup and normal exit. Isolated UI checks covered right-click / Alt+1 / custom shortcuts, shared connection creation, independent model calls, conversion to notes and reload persistence. An actual exported backup excluded temporary translations, translation settings and model credentials, while retaining the exact synthetic PDF bytes. Continuous/single-page references, figure destinations, return navigation and dark edges were checked. All verification used synthetic material and mocked APIs, without personal records or real services.

ZIP: AI-Embedded-Paper-PDF-Reader-0.1.16-Windows-x64.zip

SHA-256: `23e0e0fbabdd711e7aafc91fd50c0ead6d1d6e5c787bec86a15d415580076eb3`
