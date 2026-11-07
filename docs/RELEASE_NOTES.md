# AI-Embedded Paper PDF Reader v0.1.25

聊天按对话分别记住上次阅读的位置。正常退出后重新打开聊天，会回到上次的段落；上次在底部则回到最新回答。窗口宽度变化、聊天与 PDF 并排/专注阅读切换时，优先按回答和段落定位，避免只按像素恢复导致偏移。首次打开没有位置记录的历史对话时，显示最新内容。

Chat remembers the reading position separately for each conversation. After a normal exit, reopening chat returns to the last paragraph, or to the latest answer if it was at the bottom. Reply and paragraph anchors preserve the reading location across window resizing and PDF/chat layout changes. Existing conversations without a saved position initially show their latest content.

主动发送新问题时继续显示新回答；生成中手动向上阅读会暂停跟随，仍可通过“回到对话底部”查看最新内容。退出、切换对话和暂时收起聊天时都会保留位置；字体、公式或页面晚到的排版更新不会立即覆盖保存的位置。原定位的回答被删除或切换版本时，回退到附近仍存在的消息。

Sending a new question still follows the new answer. Manually scrolling upward during generation pauses following; the bottom button remains available. Positions survive exiting, switching conversations and hiding chat. Delayed font, formula or content layout does not overwrite the saved location. Deleted or replaced source answers fall back to a nearby surviving message.

聊天阅读位置只在本机保存对话/回答标识及显示位置，不复制聊天正文、PDF 文字或密钥，不进入聊天备份，也不发送给 AI。回收站中的对话可继续保留位置以供恢复，永久删除对话时清理其位置记录。

Chat reading preferences store only local conversation/reply identifiers and display positions. They contain no message text, PDF text or credentials, are excluded from conversation backups and are never sent to AI. Recycled conversations retain their preferences for recovery; permanent conversation removal clears the saved position.

282 项自动检查、97 项既有界面回归检查及 30 项聊天位置检查通过，位置检查包含正常退出后启动第二个独立 Electron 进程。完整解压 Windows x64 ZIP，正常退出旧版后运行新目录的 AI-Embedded-Paper-PDF-Reader.exe。

282 automated tests, 97 existing UI regression checks and 30 chat-position checks passed. Position checks include normal shutdown and a second independent Electron process. Fully extract the Windows x64 ZIP, exit the old app normally and run AI-Embedded-Paper-PDF-Reader.exe from the new folder.
