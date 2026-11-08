# 升级并删除旧版：一步一步操作 / Update and remove the old app

发行包内的中英双语 TXT 名称：`READ-ME-FIRST-Update-and-Data-Migration.txt`。

适用：Windows 桌面版，在同一台电脑、同一个 Windows 账户中更新。下面以旧版本（例如 v0.1.32）升级到 v0.1.37 为例。

**照这个顺序做：留一份备份 → 退出旧版 → 解压新版 → 确认资料 → 删除旧版。**

程序和资料分开保存。正常更新时，新版直接读取原来的本机资料，不需要手动搬数据库，也不需要先导出再导入。下面的备份步骤是额外保险。

## 第 1 步：先留一份备份（推荐）

1. 打开阅读器。v0.1.34 及以上可在首页左上角点击“菜单”→“备份与恢复”；更早版本先点聊天按钮进入聊天模式，再点击左下角“备份与恢复”。
2. “导出范围”选择“全部记录（含回收站）”，点击“导出备份”。
3. 把下载的 `.json` 文件放到桌面或其他单独的文件夹。不要放在准备删除的旧程序文件夹里。

完整备份包括聊天、回答版本、笔记、批注、图片选区与笔迹，以及已导入的 PDF 原文件。API 连接配置和密钥不包含在这份备份中；同机更新时，它们继续保留在原本的资料目录里。

## 第 2 步：正常退出旧版

点击旧版窗口右上角的 ×，等待保存完成、窗口消失。此时先保留旧程序文件夹，暂时不要删除。

## 第 3 步：完整解压新版

1. 下载新版 Windows ZIP，例如 `AI-Embedded-Paper-PDF-Reader-0.1.37-Windows-x64.zip`。
2. 右键 ZIP，选择“全部解压”或解压软件里的“解压到…”。
3. 解压到一个新的、能分清版本的文件夹，例如桌面上的 `AI-Embedded-Paper-PDF-Reader-0.1.37-Windows-x64`。
4. 保留解压出来的全部文件。不要在 ZIP 内直接运行，也不要只把 EXE 单独拖出来。

## 第 4 步：打开新版，检查原来的资料

1. 进入刚才解压的新文件夹，双击 `AI-Embedded-Paper-PDF-Reader.exe`。
2. 看窗口上方的版本号，确认是 `0.1.37`。
3. 打开一份以前读过的 PDF，点开一条以前的批注，再打开一段历史聊天，确认内容都在。
4. 打开模型设置，确认原来的连接仍在。

**如果旧资料已经出现，直接继续使用，不要再把备份导入一遍。** 同机同账户更新会自动沿用原资料；v0.1.33 首次打开已有资料时，还会先建立经过校验的升级检查点。

## 第 5 步：确认无误后，再删除旧版

例如，现在有下面两个程序文件夹：

- `AI-Embedded-Paper-PDF-Reader-0.1.32-Windows-x64`：旧版，确认资料正常后可以删除。
- `AI-Embedded-Paper-PDF-Reader-0.1.37-Windows-x64`：新版，保留整个文件夹。

旧版的 ZIP 和对应 `.sha256` 校验文件也可以删除。第 1 步导出的 `.json` 备份先留着。

如果自己曾把论文、备份等文件放进旧程序文件夹，先把这些文件移到别处，再删除旧文件夹。找不到旧程序位置时，可以右键旧版快捷方式，选择“打开文件所在的位置”。

## 第 6 步：以后从新版启动

以后从新文件夹中的 EXE 启动。旧桌面快捷方式可能还指向旧文件夹，需要为新版重新创建快捷方式；删除旧快捷方式本身不影响资料。

## 如果新版没有显示旧资料

1. 先不要删除旧版，也不要清理本机资料目录。
2. 在新版中打开“备份与恢复”，点击“从文件恢复”。
3. 选择第 1 步保存的 `.json` 完整备份，等待完成。
4. 再检查 PDF、批注和聊天，确认后再删除旧版。正常打开新版时，从文件恢复会添加为新对话；读取失败后的恢复界面会先保留原记录副本。

如果没有提前导出备份，先回到旧版导出，再按上面的步骤恢复。不要用删除资料目录的方式排查问题。

## 已经删了旧版怎么办？

如果只删了旧程序文件夹或旧 ZIP，先直接打开新版，通常仍能读取原资料；不需要重新安装旧版来搬文件。资料另存于 `%APPDATA%\MarginChat`，不在程序文件夹中。

如果没有看到旧资料，可以使用之前导出的完整备份恢复。没有备份时，先保留现状和原资料目录，不要继续清理它。

## 哪些可以删，哪些要留？

- 可以删：确认更新成功后的旧程序文件夹、旧 ZIP、旧 ZIP 的校验文件、旧快捷方式。
- 要保留：新版的整个程序文件夹、自己的论文和导出的备份。
- 不要为了清理旧版而删除：`%APPDATA%\MarginChat`，以及其中的 `Session`、数据库或 `Backups`。这些属于本机资料，不是旧安装包。用户不需要进入这个目录进行正常升级。

## 换电脑、换 Windows 账户或浏览器版转桌面版

这些情况需要使用备份迁移：在旧环境导出完整备份，把 `.json` 文件复制到新环境，再在新版“备份与恢复”中点击“从文件恢复”。API 连接和密钥需要在新环境重新配置。

## 兼容与后续更新

v0.1.33 保留 v0.1.32 的资料目录、固定本机地址、数据库版本和记录格式。正常退出新版后，可重新打开保留的 v0.1.32；v0.1.32 也能恢复新版导出的紧凑完整备份。最近两份受保护升级检查点独立于普通五份自动备份轮换。

以后更新也遵循“先确认新版资料正常，再删除旧程序”的顺序。任何需要改变数据格式的版本，都必须先建立可恢复检查点，并说明兼容和回退范围。各未来版本是否允许回退，以对应发布说明为准。

---

# English: step-by-step update and removal

The bilingual TXT in the release is named `READ-ME-FIRST-Update-and-Data-Migration.txt`.

For the Windows desktop app on the same computer and Windows account. This example updates an older version, such as v0.1.32, to v0.1.37.

**Back up → exit the old app → extract the new ZIP → check your data → remove the old app.** The app and your profile are stored separately. Same-account updates reuse the profile automatically; exporting and importing is not normally required. The backup is an extra precaution.

1. **Keep a backup first (recommended).** In v0.1.34 or later, choose **Menu → Backup & restore** at the top left of the start page. In earlier versions, open chat mode first, then choose **Backup & restore** at the lower left. Select **All records (including trash)** and click **Export backup**. Save the `.json` on your desktop or elsewhere outside the old program folder. It includes chats, answer versions, notes, annotations, figure regions/markings and imported PDFs, but excludes API connections and keys.
2. **Exit the old app normally.** Click × and wait for saving to finish and the window to disappear. Keep its folder for now.
3. **Fully extract the new ZIP into a new folder.** For example, extract `AI-Embedded-Paper-PDF-Reader-0.1.37-Windows-x64.zip` into a separate folder with that version number. Keep every accompanying file. Do not run from inside the ZIP or copy only the EXE.
4. **Open and check the new app.** Run `AI-Embedded-Paper-PDF-Reader.exe` from the new folder. Verify `0.1.37` in the window, open an existing PDF and annotation, check an old chat, and confirm your saved model connections. If the data is present, continue using it; do not import the backup again. The new version creates a verified upgrade checkpoint when it first opens an existing profile from an earlier version.
5. **Only then delete the old version folder.** You may remove the old program folder (for example, `0.1.32`), its ZIP and checksum. Keep the entire `0.1.37` folder and your exported backup. Move any PDFs or backups you manually placed inside the old folder elsewhere before deleting it.
6. **Launch the new app from now on.** Replace old desktop shortcuts with shortcuts to the new EXE. Removing an old shortcut does not delete data.

**If old data does not appear:** keep the old version and profile. In the new app, choose **Backup & restore → Restore from file**, select the complete `.json`, and recheck the contents before removing the old app. In normal operation, restoring adds new conversations; the recovery screen shown after a read failure preserves the prior records before replacement. If you have no export yet, use the old app to create one.

**Already deleted the old program?** If you removed only its program folder or ZIP, open the new app first: your data normally remains in `%APPDATA%\MarginChat`. You do not need to reinstall the old app merely to move files. If data is missing, restore an existing export; otherwise retain the profile while investigating.

**Keep:** the complete new program folder, your PDFs and exported backups. Do not delete `%APPDATA%\MarginChat`, its `Session`, databases or `Backups` as part of removing an old version. Normal updates do not require opening that profile folder.

**Different computer/account, or browser-to-desktop:** export a complete backup in the old environment, copy the `.json` to the new one, and restore it there. Configure API connections and keys again. On a same-account update, the existing API settings stay in the original profile.

v0.1.33 preserves v0.1.32's profile, fixed local origin, database version and record format. Exit the new app before reopening a retained v0.1.32; that version can restore new compact complete backups. The latest two protected upgrade checkpoints are separate from the five rolling ordinary backups. Future updates must create recoverable checkpoints before format changes and document compatibility and rollback limits.

## v0.1.36 的自动备份变化 / Automatic backups in v0.1.36

日常更新与 JSON 导出、恢复的操作不变。自动备份现在把记录文件和附件分开保存：同样内容的 PDF 等附件，在 `Backups/Attachments/` 中只保存一份，多个恢复点共同引用。第一次成功建立新版检查点后，程序逐份校验旧自动备份，只有新副本和保护信息安全写入后才移除旧副本；损坏或暂不支持的旧布局保留原文件，并按原有保留规则轮换。处理过程中不会改写主资料库的原文、聊天或批注，也不调用 API。

Normal updates, JSON export and restore use the same steps. Automatic backups now separate records from attachments: identical PDFs and other files have one copy in `Backups/Attachments/`, shared by recovery points. After the first successful new checkpoint, the app verifies and converts older automatic backups individually. It removes originals only after replacements and protection information are durable; damaged or unsupported layouts are left intact and rotate under existing retention rules. The conversion does not rewrite the primary library, chat or annotations and calls no API.

**搬资料时仍推荐在“菜单 → 备份与恢复”导出完整 JSON。** 导出的 JSON 自带所有附件，可单独导入；本地的 `.snapshot.json` 只是恢复记录，不能只拿这一个文件搬家。如果手动复制整个自动备份目录，必须把 `Backups` 连同内部 `Attachments` 和索引文件一并保留，切勿单独删除共享附件。

**For moving data, keep exporting complete JSON through Menu → Backup & restore.** Exported JSON contains every attachment and can be imported alone. A local `.snapshot.json` is only a recovery record, so it is not a standalone transfer file. A manual copy of the automatic backup directory must include all of `Backups`, including `Attachments` and index files. Do not remove shared attachments individually.

主资料库格式与固定数据位置不变，旧程序仍可读取主资料；但新版共享恢复点需要 v0.1.36 或更新版本读取。需要回退旧程序时，先导出一份完整 JSON，留在程序目录之外。API 连接和密钥依然不包含在这份导出中。

The primary database format and fixed data location are unchanged, so older apps can still open the primary data. Shared recovery points require v0.1.36 or later. Before downgrading, export complete JSON outside the program folder. API profiles and keys remain excluded from that export.

## 删除历史备份 / Delete historical backups

v0.1.37 可在“菜单 → 备份与恢复”中点击每条记录旁的垃圾桶，确认时间和用途后删除。它只移除历史恢复点，不删除当前聊天、笔记、批注或 PDF；仍被其他恢复点引用的附件继续保留。升级前恢复点也允许删除。之后仍会每 10 分钟按变化备份，正常退出及手动操作也可建立新点；不是关闭自动备份。

In v0.1.37, choose Menu → Backup & restore and click a record’s trash icon. Confirm its timestamp and purpose before deleting. This removes only a historical recovery point, preserving current chats, notes, annotations and PDFs and any files referenced by other points. Pre-upgrade points can also be deleted. Changed data continues to be backed up every 10 minutes, on normal exit, or manually; deletion does not disable automatic backups.
