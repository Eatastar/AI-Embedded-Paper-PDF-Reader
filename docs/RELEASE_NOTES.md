# AI-Embedded Paper PDF Reader v0.1.37

面向论文与 PDF 书籍精读的本地阅读器：接入自己的 API，调整纸张与文字颜色，在原文旁进行文字/图片批注问答和划词翻译，需要时打开聊天深入讨论。

A local reader for close reading of papers and PDF books. Connect your own API, adjust paper and text colors, ask AI in text or image annotations, translate selected passages and open chat for deeper discussion.

[功能截图与完整介绍 / Screenshots and overview](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader#readme)

## 从 v0.1.32 以来的更新 / Changes since v0.1.32

- **减少内存峰值**：备份分块处理，PDF 渲染任务统一排队并及时释放闲置资源；长聊天只挂载阅读区域附近的消息，合并流式更新并限制搜索缓存。保留现有阅读、批注、翻译和聊天功能。
  **Reduce memory peaks**: process backups in chunks, coordinate PDF rendering and release idle resources. Long chats mount nearby messages, batch streaming updates and bound search caches while preserving existing reading, annotation, translation and chat features.
- **自动备份共享附件**：同样内容的 PDF 等附件在自动备份库中只保存一份，多个恢复点共同引用。旧自动备份逐份校验转换，替代副本安全写入后才移除原副本。手动导出的完整 JSON 仍自带附件，可单独恢复。
  **Share backup attachments**: automatic recovery points share one backup copy of identical PDFs and other files. Older backups are verified and converted individually, with originals removed only after durable replacements exist. Complete manual JSON exports still include their attachments and can be restored independently.
- **备份可以逐条删除**：在“菜单 → 备份与恢复”点击垃圾桶，确认后移除普通或升级前恢复点。当前 PDF、笔记、批注和聊天不受影响；共享附件仅在没有恢复点引用时清理。
  **Delete recovery points individually**: use a record’s trash icon in Menu → Backup & restore, then confirm removal of an ordinary or pre-upgrade point. Current PDFs, notes, annotations and chats remain intact; shared files are collected only when no recovery point needs them.
- **减少重复历史备份**：有变化时每 10 分钟检查一次，正常退出和“立即备份”仍会核对并保存最新状态；内容相同则复用恢复点。聊天、批注等主资料仍及时自动保存。默认保留最近 5 份普通和最多 2 份升级前恢复点。
  **Avoid excessive snapshots**: check changed data every 10 minutes, and verify the latest state on normal exit or Back up now. Identical contents reuse an existing point. Primary chats and annotations still save promptly. Retain five ordinary and up to two pre-upgrade recovery points by default.
- **首页即可管理资料与设置**：左上角菜单可直接进入设置、API、翻译、历史对话、回收站及备份恢复。修正导出范围的下拉箭头，并补充中英双语升级说明，八种界面语言继续支持。
  **Manage data and settings from the start page**: the top-left menu opens settings, API connections, translation, conversations, trash and backup/restore. Correct the export-scope dropdown arrow and include bilingual update instructions, retaining all eight interface languages.

性能效果取决于 PDF、聊天长度及运行环境；上述优化不代表整台客户端固定的内存上限。可重复的虚构场景测量见[性能说明](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PERFORMANCE.md)。

Results depend on the PDF, conversation length and environment; these changes do not impose a fixed total desktop-memory limit. See [performance notes](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PERFORMANCE.md) for reproducible synthetic measurements.

## 下载与保留资料更新 / Download and keep your data

1. 下载 Assets 中的 **AI-Embedded-Paper-PDF-Reader-0.1.37-Windows-x64.zip**，完整解压。不要只复制 EXE。
2. 推荐先从旧版导出“全部记录（含回收站）”完整 JSON，存到旧程序文件夹以外；然后正常退出旧版。
3. 运行新文件夹中的 **AI-Embedded-Paper-PDF-Reader.exe**。同一电脑、同一 Windows 账户会继续读取原 PDF、笔记、批注、聊天和 API 连接；资料已出现就不要重复导入。
4. 检查原资料正常后再删除旧程序文件夹、旧 ZIP 和校验文件。换电脑或账户时，需通过“从文件恢复”导入完整 JSON，并重新配置 API。

1. Download **AI-Embedded-Paper-PDF-Reader-0.1.37-Windows-x64.zip** from Assets and fully extract it. Keep all accompanying files.
2. An extra complete JSON export of all records, including trash, is recommended before updating. Save it outside the old program folder, then exit the old app normally.
3. Run **AI-Embedded-Paper-PDF-Reader.exe** from the new folder. Same-computer, same-Windows-account updates reuse existing PDFs, notes, annotations, chats and API connections. Do not import again when the data is already present.
4. Check your data before removing the old program folder, ZIP and checksum. Moving to another computer/account requires Restore from file with a complete JSON export and reconfiguration of API connections.

详细步骤见附件 **READ-ME-FIRST-Update-and-Data-Migration.txt**（中英双语，压缩包内也有）。完整 JSON 包含聊天、笔记、批注、图片选区和已导入 PDF，**不包含 API 配置和密钥**。内部 `.snapshot.json` 依赖共享附件，不能单独用于搬家。新版共享恢复点需 v0.1.36 或更高版本；旧版仍可读取主资料，或导入完整 JSON。请勿为了删除旧包而清理 `%APPDATA%\MarginChat`。

See **READ-ME-FIRST-Update-and-Data-Migration.txt** in Assets or inside the ZIP for bilingual steps. Complete JSON includes chats, notes, annotations, figure regions and imported PDFs, **excluding API profiles and keys**. Internal `.snapshot.json` files depend on shared attachments and are not standalone migration files. Shared recovery points need v0.1.36 or later; older apps can still open the primary data or import a complete JSON export. Do not delete `%APPDATA%\MarginChat` when removing old program packages.

## 隐私、验证与校验 / Privacy, validation and checksum

阅读资料、批注和 API 配置保存在本机；系统加密可用时密钥使用系统加密，且不进入导出的备份。使用 AI 功能时，请求会发送给你配置的服务；获取上游模型列表也需向该服务认证。发布包不包含个人资料或 API 配置。详见[隐私说明](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md)。

Reading data, annotations and API settings stay local. Saved keys use system encryption when available and are excluded from exported backups. AI requests go to your configured provider; fetching its model list also requires authentication. The distribution contains no personal profile or API configuration. See [Privacy](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md).

363 项自动测试通过；另使用隔离资料和模拟服务验证升级保留数据、八语布局、逐条删除备份、共享附件保留、手动/退出备份及旧版完整 JSON 导入兼容。升级说明更名后重新核对发行包内容与 SHA-256。

363 automated tests passed. Isolated-profile and mock-service checks also cover data-preserving upgrades, eight-language layout, individual backup deletion, retained shared files, manual/exit checkpoints and complete-JSON compatibility with an older app. Package contents and SHA-256 were rechecked after renaming the update guide.

ZIP SHA-256:

```text
998a0856a6f9ce1116e036796d14af2f3ee9125c72de7d36da057749901ed332
```

## 实现与复用 / Implementation and reuse

原创应用代码全部由 GPT 通过 Codex 实现；人类发起者负责想法、需求及功能取舍。第三方组件保留各自作者及许可证。项目采用 MIT 许可证，欢迎用 AI agent 或 vibe coding 改成适合自己的版本；发布衍生项目时请链接[本项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。

Original application code was implemented entirely by GPT through Codex; the human initiator provides ideas, requirements and product decisions. Third-party authorship and licenses remain distinct. The project uses MIT: adapt it with an AI agent or vibe coding and please link to [this project](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing a derivative.
