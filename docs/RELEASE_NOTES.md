# AI-Embedded Paper PDF Reader v0.1.45

从 v0.1.38 升级，新增电子书阅读、最近阅读整理和多平台试用。

Since v0.1.38, the reader adds ebook support, recent reading management, and cross-platform previews.

## 下载 / Downloads

- **Windows x64** · 解压后运行 `AI-Embedded-Paper-PDF-Reader.exe`。Fully extract the ZIP, then run the EXE. [ZIP](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases/download/v0.1.45/AI-Embedded-Paper-PDF-Reader-0.1.45-Windows-x64.zip)
- **Linux x64（预览 / Preview）** · 在 Linux 桌面解压并运行 `ai-embedded-paper-pdf-reader`。Extract and run on a Linux desktop. [tar.gz](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases/download/v0.1.45/AI-Embedded-Paper-PDF-Reader-0.1.45-Linux-x64.tar.gz)
- **macOS（便携试用 / Portable preview）** · 解压后打开 `Start Reader.command`。Extract and open the launcher. [Apple 芯片 / Apple silicon](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases/download/v0.1.45/AI-Embedded-Paper-PDF-Reader-0.1.45-macOS-arm64.zip) · [Intel](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases/download/v0.1.45/AI-Embedded-Paper-PDF-Reader-0.1.45-macOS-x64.zip)

[SHA-256 校验 / Checksums](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases/download/v0.1.45/SHA256SUMS.txt)

## 本次更新 / What’s new

- **电子书 / Ebooks**。支持无 DRM 的 EPUB、MOBI、AZW3，按章加载，保留目录、搜索、批注和快译。
  Open DRM-free EPUB, MOBI, and AZW3 with chapter loading, contents, search, annotations, and quick translation.
- **排版与缩放 / Typography and zoom**。点电子书右上角的 **Aa 排版** 调字号、行距和宽度。双指、Ctrl＋滚轮或加减按钮缩放时保留换行。
  Use **Aa Typography** for font size, spacing, and width. Pinch, Ctrl+wheel, or +/− to zoom while preserving line breaks.
- **最近阅读 / Recent reading**。首页默认显示 5 条，可展开、批量移出和恢复。原文件、批注和进度都会保留。
  The home page shows five entries by default. Expand, remove, or restore entries while keeping files, annotations, and progress.
- **快译重试 / Repeat translation**。关闭译文后，原文可见时再按同一快捷键即可重译。
  Press the same shortcut again while the passage is visible to repeat a dismissed translation.
- **桌面缓存 / Desktop cache**。限制 HTTP 磁盘缓存，新构建首次启动时清理旧编译缓存。
  Limit HTTP disk-cache usage and refresh compiled JavaScript caches on the first launch of a new build.

## 升级与验证 / Updating and validation

同一 Windows 账户升级会沿用资料。退出旧版，解压新版并确认资料可读，再清理旧 ZIP 和目录。跨系统可导出和恢复完整 JSON。导入电子书后请使用 v0.1.39 或更新版本。

Updates on the same Windows account reuse your profile. Quit the old app, extract the new build, and check your data before deleting the old ZIP and folder. Use a full JSON backup to move data between systems. Use v0.1.39 or later with ebook profiles.

构建 **20261111.5**。Windows 和 Ubuntu 通过启动与保存退出检查。Mac 包已检查架构与文件，待实机试用。

Build **20261111.5**. Startup and save-on-exit checks passed on Windows and Ubuntu. Mac previews passed package checks and await testing on a Mac.

[Windows 升级与资料迁移 / Windows update and migration](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/releases/download/v0.1.45/READ-ME-FIRST-Update-and-Data-Migration.txt)
