# AI-Embedded Paper PDF Reader v0.1.17

修复翻译面板随滚动消失的问题。默认快捷键仍为 Alt+1。

Fixes translation panels disappearing when scrolling. Alt+1 remains the default shortcut.

- 滚轮、触控板上下滚动和拖动滚动条时，翻译框保持在屏幕当前位置，可以继续拖动。
  The translation panel stays at its screen position during scrolling and scrollbar dragging, and remains movable.
- 连续阅读暂留当前翻译的来源页，避免页面离开视野后译文被清除；滚远后仍可保留为原位置的普通批注。仅暂留当前翻译对应的一页。
  Continuous reading retains the current translation's source page so leaving the viewport cannot discard its result or note anchor. Keep as a plain note still saves at the original passage after scrolling away. Only the current translation's source page is retained for this purpose.
- 区分框外点击与拖动/滚动手势；普通框外点击、Esc 和 × 仍关闭并丢弃临时译文，未完成请求同时取消。
  Outside clicks are distinguished from dragging/scrolling gestures. An ordinary outside click, Esc or × still discards the temporary result and cancels pending work.
- 保留独立翻译 API、自定义提示词与快捷键、仅发送选段以及共享连接等现有规则。原数据位置、数据库和备份格式兼容，旧版 Release 与附件保留。
  Independent translation APIs, custom prompts/shortcuts, selection-only requests and shared connections retain their existing behavior. Data location, database and backup compatibility and historical releases/assets are preserved.

先正常退出旧版，完整解压 ZIP，再运行 AI-Embedded-Paper-PDF-Reader.exe。
Exit the old version normally, fully extract the ZIP and run AI-Embedded-Paper-PDF-Reader.exe.

源码仍采用 MIT，第三方许可与署名保留。原创应用代码由 GPT 通过 Codex 实现，人类发起者负责想法、需求和功能取舍。
Original code remains under MIT with third-party notices retained. GPT through Codex implemented the original application code; the human initiator supplied ideas, requirements and feature trade-offs.

## 验证 / Validation

251 项自动检查、563 项交付核对和两次 EXE 实际启动、保存、完整备份及正常退出通过。合成六页 PDF 验证从第一页滚到第六页仍保留译文，拖动滚动条不关闭，并能保存回第一页原句；普通框外点击和 Esc 关闭正常。未读取个人资料或调用真实模型 API。

251 automated tests, 563 package checks and two real EXE startup/save/full-backup/normal-exit checks passed. A synthetic six-page PDF confirmed retained translations from page 1 to page 6, scrollbar dragging and note saving at the original page. Outside clicks and Esc remain functional. No personal material or real model API was used.

ZIP SHA-256: `d6da9b3e0bdc4831d957d234ec0dcb9d787393547ef7038952198699db51f9c6`
