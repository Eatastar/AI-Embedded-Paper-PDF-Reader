# AI-Embedded Paper PDF Reader v0.1.19

放大后自动为可视区域补上高清绘制，改善高倍阅读时文字偏软的问题。

Visible areas receive a high-resolution redraw after zooming to improve enlarged PDF text.

- 整页底图保留原有像素上限，可视区域使用独立高清层，避免为了放大一小块而提高整张大页面的内存占用。
  A bounded whole-page bitmap remains available, while an independent detail layer redraws the visible area without raising the resolution of the entire enlarged page.
- 按屏幕像素密度绘制，普通屏幕至少以两倍采样为目标；高清缓冲最多 800 万像素，极大窗口仍按预算调整精度。
  Detail rendering follows display pixel density, targeting at least double sampling on standard-density screens. Detail buffers are capped at eight million pixels; exceptionally large viewports still adjust density to fit that budget.
- 滚动时复用边缘缓存，停下后补上新区域。过期渲染会取消；页面移出视野或关闭时释放高清缓冲与 Worker。
  Scrolling reuses cached margins and redraws newly visible areas. Stale renders are cancelled, and offscreen pages or unmounting release detail buffers and workers.
- 高清层不接收鼠标事件，文字选择、引用跳转、批注和划词翻译继续使用原文字层；暖黄、深色、自定义配色及原色对照同步处理。
  The detail layer receives no pointer events. Selection, reference navigation, annotations and selection translation continue to use the original text layer, while warm, dark, custom colors and original comparison stay synchronized.

先正常退出旧版，完整解压 ZIP，再运行 AI-Embedded-Paper-PDF-Reader.exe。原数据位置、数据库和备份格式兼容。

Exit the old version normally, fully extract the ZIP and run AI-Embedded-Paper-PDF-Reader.exe. Existing data locations, database and backup formats remain compatible.

源码采用 MIT，第三方许可与署名保留。原创应用代码由 GPT 通过 Codex 实现，人类发起者负责想法、需求和功能取舍。已公开的历史 Release 与附件保留。

Original code remains under MIT with third-party notices retained. GPT through Codex implemented the original application code; the human initiator supplied ideas, requirements and feature trade-offs. Published historical releases and assets are preserved.

## 验证 / Validation

259 项自动检查、574 项交付核对和两次实际 EXE 启动、保存、完整备份及正常退出通过。合成 PDF 在 200%–250% 放大、普通/分数/高密度屏幕及暖黄/深色配色下，验证可视区域从约 1 倍提升至 2–2.5 倍采样，缓冲保持在像素预算内。实际阅读组件验证缩放重建、深色引用颜色、原色对照和卸载；滚动验证选区保留、引用命中、过期任务丢弃及移出视野后的释放。未读取个人文档或调用真实模型 API。

259 automated tests, 574 delivery checks and two real EXE startup/save/full-backup/normal-exit checks passed. Synthetic PDFs at 200%–250% zoom on standard, fractional and high-density displays with warm/dark colors verified visible-area sampling increasing from approximately 1× to 2–2.5× within the pixel budget. The actual reader component verified zoom rebuilding, dark citation colors, original comparison and unmounting. Scrolling covered retained selection, reference hit testing, stale-work rejection and offscreen release. No personal documents or real model APIs were used.

ZIP SHA-256: `f6cae2ef092bac0c256200e9b9df722308a453c69bdee0d3e86839b36001a94c`
