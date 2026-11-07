# AI-Embedded Paper PDF Reader v0.1.22

聊天模式关闭 PDF 后保持聊天可见，顶部“展开 PDF”及聊天文件名可一键恢复并排阅读，沿用原页码与缩放。左上角长项目名按侧栏宽度换行。选中 PDF、AI 回答或聊天问题中的文字，可通过浮动按钮或右键“引用到聊天”，在输入框预览选段、补充问题再发送，不创建批注或自动调用 API。每次引用一段，重新选择会替换待发送段落，可用 × 取消。

Closing a PDF in chat keeps the conversation visible. Open PDF at the top, or the file name in chat, restores side-by-side reading with the saved page and zoom. Long branding wraps inside the sidebar. Select text in a PDF, AI answer or chat question and use Quote in chat from the selection action or context menu, preview the excerpt, add a question and send. This creates no annotation and makes no automatic API call. One pending excerpt can be replaced or removed with ×.

批注在点击聊天、正文、翻页和切换阅读布局时保持打开，用 × 或 Esc 收起；编辑中的修改在关闭或切换来源时保存。切换文件或对话会收起批注。临时翻译继续保持原来的框外点击、Esc / × 关闭及滚动保留规则；同时展开时，Esc 优先关闭翻译。

Annotations stay open while clicking chat/source text, turning pages or changing reading layout; use × or Esc to close. Pending edits are saved when closing or leaving the source. Switching documents or conversations dismisses the annotation. Temporary translation retains outside-click, Esc/× dismissal and scroll retention; when both panels are open, Esc dismisses translation first.

文字引用与本轮问题一起保存和备份，聊天仍按原设置带入有效聊天与文档资料。它与“只发送选段”的翻译功能不同；批注提问仍不引用聊天或其他批注。删除被引用的聊天轮次时，后续问题中的相关文字引用副本与旧重试缓存也会清除，PDF 引用和原文批注保留。新版本可读取旧备份，含文字引用的备份请使用 v0.1.22 或更新版本恢复。

Text quotations are saved and backed up with the question. Chat still uses valid history and document material according to existing scope settings, unlike selection-only translation. Annotation questions still exclude chat and other annotations. Deleting a quoted chat round clears its later quotation copies and stale retry snapshots while retaining PDF quotations and annotations. Older backups remain readable; restore backups with text quotations using v0.1.22 or newer.

275 项自动检查和 40 项实际 PDF 界面检查通过。完整解压 Windows x64 ZIP，正常退出旧版后运行新目录的 AI-Embedded-Paper-PDF-Reader.exe。沿用原本机数据目录与 API 配置，历史 Release、标签和附件保留。

275 automated tests and 40 real PDF UI checks passed. Fully extract the Windows x64 ZIP, exit the old app normally and run AI-Embedded-Paper-PDF-Reader.exe in the new folder. The existing local data directory and API settings remain in use; historical releases, tags and assets are preserved.
