# AI-Embedded Paper PDF Reader v0.1.18

修复深色纸张下 PDF 引用数字的白色重影，并自动调整链接文字颜色。

Fixes white halos around PDF citations on dark paper and adapts embedded link text colors.

- 深色纸张上的引用、图号等文字链接改为柔和浅蓝色，并根据纸张颜色保持可读对比度。
  Citations, figure references and other embedded text links use a soft light blue with readable contrast against dark paper.
- 字形与白底抗锯齿边缘一并换色，不再依赖每个边缘像素旁边都有纯色笔画；细字和不同缩放下也使用相同规则。
  Glyphs and their white-matted antialiased edges are recolored together, without requiring a solid-color stroke beside each edge pixel. Thin text and different zoom levels share the same rule.
- 换色范围限定为 PDF 链接与提取文字的交集，图片链接不会整块换色。浅色纸张、原色对照、文内跳转及自选批注颜色继续保留。
  Recoloring is restricted to the intersection of PDF links and extracted text, rather than whole image links. Light paper, original-color comparison, embedded navigation and custom annotation colors retain their existing behavior.
- 首帧、快速预览、后台换色与无 Worker 的分批处理均使用相同文字范围；缩放或调色后不会重新出现深蓝字与白边。
  Initial frames, fast previews, background recoloring and chunked rendering without workers use the same text regions, keeping link colors consistent after zooming or color adjustments.

先正常退出旧版，完整解压 ZIP，再运行 AI-Embedded-Paper-PDF-Reader.exe。数据位置、数据库与备份格式兼容，已公开的历史 Release 和附件保留。

Exit the old version normally, fully extract the ZIP and run AI-Embedded-Paper-PDF-Reader.exe. The data location, database and backup formats remain compatible. Published historical releases and assets are preserved.

源码采用 MIT，第三方许可与署名保留。原创应用代码由 GPT 通过 Codex 实现，人类发起者负责想法、需求和功能取舍。

Original code remains under MIT with third-party notices retained. GPT through Codex implemented the original application code; the human initiator supplied ideas, requirements and feature trade-offs.

## 验证 / Validation

256 项自动检查、568 项交付核对，以及两次实际 EXE 启动、保存、完整备份和正常退出通过。合成 PDF 在 50%、75%、100% 和 250% 缩放、普通/双倍/分数屏幕缩放的六种组合下验证引用换色，实际 Worker 与快速预览结果一致；原色逐字节恢复，彩色图块保留原 RGB。测试未读取个人文档或调用真实模型 API。

256 automated tests, 568 delivery checks and two real EXE startup/save/full-backup/normal-exit checks passed. A synthetic PDF verified six combinations of 50%, 75%, 100% and 250% zoom with standard, double and fractional pixel ratios. Actual workers and fast previews matched initial frame rendering; original comparison restored every source byte and colored figure samples kept their original RGB values. Tests used no personal documents or real model APIs.

ZIP SHA-256: `278c7daf59fff557780b13840ad44d2bde4a7db4c73f4e91cdba2e70845ea4a0`
