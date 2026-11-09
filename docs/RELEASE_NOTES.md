# AI-Embedded Paper PDF Reader v0.1.38

面向论文与 PDF 书籍精读的本地阅读器：接入自己的 API，调整纸张与文字颜色，在原文旁批注提问、圈图询问或划词翻译，需要时打开聊天深入讨论。

A local reader for close reading of papers and PDF books. Connect your own API, customize reading colors, ask AI in text or image annotations, translate selected passages and open chat for deeper discussion.

[功能截图与完整介绍 / Screenshots and overview](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader#readme)

## 本次更新 / What’s new

- **按轮跳转聊天**：点击聊天右侧的短线，回到对应回答；打开目录可按每次提问的开头查找，长列表按页显示。跳转支持尚未显示在屏幕上的旧回答，并保持阅读位置。
  **Navigate chat by turn**: use the markers beside chat to jump to an answer, or find a question by its opening in the paginated index. Offscreen answers load on demand and reading positions are preserved.
- **多选、全选与清空聊天**：在目录中选择“管理与删除”，可删除多轮或清空当前聊天。确认页面列出每个所选问题的开头，支持跨页选择。保存失败时，保留全部原记录。
  **Select, delete or clear chat**: choose Manage and delete in the index to remove multiple turns or clear the current chat. Confirmation previews the selected questions, including selections across pages. A failed save leaves all original turns intact.
- **从批注直接继续讨论**：文字问答、图片问答和普通笔记底部新增“引用到聊天继续追问”。点击后保存当前编辑、展开聊天、带上该批注并聚焦输入框；原 PDF、批注窗口和已有输入草稿保留，**不会自动发送**。
  **Continue from an annotation**: text Q&A, figure Q&A and plain notes gain Reference in chat and ask further. Save pending edits, open chat, select that annotation and focus the composer while retaining the PDF, note window and existing draft. **No request is sent automatically.**
- **保持阅读连贯性**：改进跳转后立即切换阅读模式时的位置保持；新入口覆盖八种界面语言。导航仅保存编号和有上限的问题摘要，不复制回答、图片或完整上下文，也没有新增运行依赖。
  **Keep your place**: preserve the latest position when switching to reading mode immediately after a jump. New controls support all eight interface languages. Navigation descriptors contain IDs and bounded question previews, without copies of answers, images or full contexts. No runtime dependencies are added.

## 删除范围 / What deletion removes

删除所选轮次会移除问题、全部回答版本及这些回答上的批注，并清理后续聊天中对应的引用与重试上下文；**导入的 PDF 和 PDF 原文批注保留**。此操作不进入回收站。以前的自动备份和导出备份可能仍保留历史内容，需要在备份管理中单独处理。

Deleting selected turns removes their questions, every answer version and annotations on those answers, together with corresponding downstream references and retry contexts. **Imported PDFs and annotations on the source PDFs remain.** Deleted turns do not go to Trash. Earlier automatic and exported backups may retain historical contents and are managed separately.

批注提问仍只按阅读设置引用所属原文，不自动带入主聊天或其他批注；聊天只引用你主动选择的批注。

Annotation questions continue to use their own source under the reading-context settings, without automatically including main chat or other annotations. Chat includes only annotations you explicitly select.

## 下载与保留资料更新 / Download and keep your data

1. 推荐先在旧版“菜单 → 备份与恢复”导出“全部记录（含回收站）”，将 JSON 放在旧程序文件夹之外。
2. 正常退出旧版，下载并完整解压 **AI-Embedded-Paper-PDF-Reader-0.1.38-Windows-x64.zip**，保留全部配套文件。
3. 运行新文件夹中的 **AI-Embedded-Paper-PDF-Reader.exe**。同一电脑、同一 Windows 账户下，会沿用原 PDF、笔记、批注、聊天和 API 连接；资料已出现就不要重复导入。
4. 检查资料正常后再删除旧程序文件夹、旧 ZIP 和校验文件。换电脑或账户时，通过“从文件恢复”导入完整 JSON，并重新配置 API。

1. Exporting All records (including trash) through Menu → Backup & restore is recommended. Save the JSON outside the old program folder.
2. Exit the old app normally, then download and fully extract **AI-Embedded-Paper-PDF-Reader-0.1.38-Windows-x64.zip**, keeping all accompanying files.
3. Run **AI-Embedded-Paper-PDF-Reader.exe** from the new folder. Same-computer, same-Windows-account updates reuse existing PDFs, notes, annotations, chats and API connections. Do not import again if the data is already present.
4. Check your data before removing the old program folder, ZIP and checksum. Moving to another computer/account requires Restore from file with a complete JSON export and reconfiguration of API connections.

详细步骤见附件 **READ-ME-FIRST-Update-and-Data-Migration.txt**（中英双语，ZIP 内也有）。完整 JSON 包含聊天、笔记、批注和已导入 PDF，**不含 API 配置和密钥**。内部 `.snapshot.json` 依赖共享附件，不能单独用于迁移。请勿为了清理旧包而删除 `%APPDATA%\MarginChat`。

See **READ-ME-FIRST-Update-and-Data-Migration.txt** in Assets or inside the ZIP for bilingual instructions. Complete JSON includes chats, notes, annotations and imported PDFs, **excluding API profiles and keys**. Internal `.snapshot.json` files depend on shared attachments and are not standalone migration files. Do not delete `%APPDATA%\MarginChat` when removing old packages.

## 隐私与验证 / Privacy and validation

阅读资料与 API 配置保存在本机；系统加密可用时，保存的密钥使用系统加密，且不进入导出的备份。AI 请求及获取模型列表时的认证会发送给你配置的服务。发布包不含个人资料或 API 配置。详见[隐私说明](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md)。

Reading data and API settings stay local. Saved keys use system encryption when available and are excluded from exported backups. AI requests and model-list authentication go to your configured provider. The distribution contains no personal profile or API configuration. See [Privacy](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md).

371 项自动测试及 23 项隔离客户端核对通过，覆盖长聊天跳转、跨页选择、删除确认、重启后的删除与位置保持、批注引用和草稿保留、八语窄窗口，以及清空聊天后原文批注仍可使用。最终 EXE 的启动、保存和正常退出验证通过，ZIP 与解压目录内容一致。测试使用虚构 PDF、隔离资料和模拟接口。

371 automated tests and 23 isolated-client checks passed, covering long-chat navigation, cross-page selection, deletion confirmation, deletion and position persistence across restarts, annotation references, draft retention, eight-language narrow layouts and preserved PDF annotations after clearing chat. Final EXE startup, save and normal-exit checks passed; ZIP contents match the extracted folder. Tests use fictional PDFs, isolated profiles and mock services.

## ZIP SHA-256

```text
5b94b85a2bccb3f082d4f852705b1c00cdec57b13fa4a0ed14b5339f3874a4c3
```

## 实现与复用 / Implementation and reuse

原创应用代码全部由 GPT 通过 Codex 实现；人类发起者负责想法、需求及功能取舍。第三方组件保留各自作者与许可证。项目采用 MIT 许可证，欢迎用 AI agent 或 vibe coding 改成适合自己的版本；发布衍生项目时请链接[本项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。

Original application code was implemented entirely by GPT through Codex; the human initiator provides ideas, requirements and product decisions. Third-party authorship and licenses remain distinct. The project uses MIT: adapt it with an AI agent or vibe coding and please link to [this project](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing a derivative.
