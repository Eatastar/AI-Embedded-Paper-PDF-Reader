# AI-Embedded Paper PDF Reader v0.1.44

这次更新带来 EPUB、MOBI 和 AZW3 阅读，并改进电子书排版、划词翻译和桌面磁盘缓存。从 v0.1.38 升级可一次获得这些变化。

This update adds EPUB, MOBI and AZW3 reading and improves ebook typography, quick translation and desktop disk caching. It includes the changes since v0.1.38.

[功能截图与完整介绍 / Screenshots and overview](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader#readme)

## 本次更新 / What’s new

- **阅读电子书**。从首页打开无 DRM 的 EPUB、MOBI 和 AZW3（KF8），使用目录、搜索、原文笔记、AI 批注问答和划词翻译。按章加载，并按书记住阅读位置。
  **Read ebooks**. Open DRM-free EPUB, MOBI and AZW3 (KF8) from the home screen. Use contents, search, source notes, annotation Q&A and quick translation. Chapters load on demand and progress is remembered per book.
- **排版与缩放分开**。电子书右上角的 **Aa 排版** 可调字号、行距和正文宽度。双指捏合、Ctrl＋滚轮或加减按钮整体缩放，保持当前换行。排版按书保存，窄栏也有 Aa 入口。
  **Adjust typography and zoom independently**. Use **Aa Typography** to change font size, line spacing and text width. Pinch, Ctrl+wheel or +/− scales the current layout while preserving line breaks. Typography is remembered per book, and Aa stays available in narrow panes.
- **快译关闭后可重译**。原文仍可见时，再按同一快捷键（默认 **Alt＋1**）即可重译。新选段优先，点击保留可将译文存为普通批注。
  **Repeat a dismissed translation**. Press the same shortcut (Alt+1 by default) again while the passage is still visible. A new selection takes priority. Choose Keep to save a translation as a plain note.
- **减少桌面缓存累积**。HTTP 磁盘缓存采用 24 MiB 预算。首次启动新构建时回收旧 JavaScript 编译缓存，随后重开同一构建可复用新缓存。
  **Reduce desktop cache buildup**. The HTTP disk cache uses a 24 MiB budget. The first launch of a new build refreshes old JavaScript code caches, and later launches reuse the current build’s compiled code.

## 下载与升级 / Download and update

1. 建议先在旧版“菜单 → 备份与恢复”导出完整 JSON，存到旧程序文件夹之外。
2. 正常退出旧版，完整解压 **AI-Embedded-Paper-PDF-Reader-0.1.44-Windows-x64.zip**，运行解压目录里的 **AI-Embedded-Paper-PDF-Reader.exe**。
3. 同一电脑和 Windows 账户下，新版会沿用已有文件、笔记、批注、聊天和 API 连接。确认资料可用后，再清理旧程序和 ZIP。

1. Export a complete JSON backup from **Menu → Backup & restore** and save it outside the old program folder.
2. Exit the old app normally. Fully extract **AI-Embedded-Paper-PDF-Reader-0.1.44-Windows-x64.zip** and run **AI-Embedded-Paper-PDF-Reader.exe** from the extracted folder.
3. On the same computer and Windows account, the new app reuses your existing files, notes, annotations, chats and API connections. Check your data before removing the old program or ZIP.

导入电子书后，请使用 v0.1.39 或更新版本处理这份资料。附件 **READ-ME-FIRST-Update-and-Data-Migration.txt** 有中英双语升级及迁移步骤。

After importing ebooks, use v0.1.39 or later with that profile. See **READ-ME-FIRST-Update-and-Data-Migration.txt** for bilingual update and migration instructions.

## 验证与校验 / Validation and checksum

构建 **20261111.3**。381 项回归测试通过，解压版通过隔离启动与退出保存检查。电子书排版、PDF 阅读、快译和缓存测试使用虚构资料与模拟接口。

Build **20261111.3**. All 381 regression tests passed, along with isolated startup and save-on-exit checks for the extracted app. Ebook typography, PDF reading, quick translation and cache checks used synthetic content and mock services.

Windows x64 ZIP SHA-256

```text
22623464e505d4a941e36c45b253c30cb2f2106933e4eb176d057abe707a149e
```
