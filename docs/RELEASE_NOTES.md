# AI-Embedded Paper PDF Reader v0.1.19

本版汇总 v0.1.15 之后的改进：新增划词翻译，恢复 PDF 引用跳转，并改善深色引用配色及高倍阅读清晰度。

This release collects improvements since v0.1.15: selection translation, restored PDF reference navigation, adapted dark citation colors and sharper enlarged reading.

## 划词翻译与阅读体验 / Selection translation and reading

- 选中单词或段落，右键翻译或按默认 Alt+1，在原文旁直接查看译文和所用模型。滚动、跨页时面板仍保留，可拖动位置；点击框外、Esc 或 × 关闭临时结果。
  Select a word or passage and right-click or press Alt+1 to see the translation and model beside the source. The movable panel stays open during scrolling and cross-page reading. Outside click, Esc or × closes temporary results.
- 翻译可独立选择已保存的 API，也可新建共用连接；支持目标语言、自定义提示词与快捷键。仅发送选中文字和翻译提示词，不附带整篇文档、所在页或聊天历史。需要长期保存时，可将译文转为普通批注。
  Translation can use its own saved API or a new shared connection, with configurable target language, prompt and shortcut. Only the selected text and translation prompt are sent, without the full document, page or chat history. Keep a result as a plain note when needed.
- 恢复 PDF 自带的参考文献与图号链接，支持文内精确跳转及返回原位置。深色纸张下，链接文字与抗锯齿边缘一起调整为柔和浅蓝色，减少白色重影。
  Embedded PDF reference and figure links navigate to their exact page positions and support returning to the source. On dark paper, link glyphs and their antialiased edges share a soft light-blue foreground to reduce white halos.
- README 将划词翻译与 PDF 阅读、纸张调色、AI 问答批注和聊天模式一同列为主打功能，介绍与发布说明保持中英双语。
  The README features selection translation alongside PDF reading, adjustable paper colors, AI Q&A annotations and chat. Introductions and release notes remain bilingual.

## 放大后更清晰 / Sharper enlarged reading

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
