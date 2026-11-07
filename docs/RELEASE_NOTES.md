# AI-Embedded Paper PDF Reader v0.1.32

自选 API 的本地 PDF 阅读器：阅读论文与书籍、调整纸张颜色、划词翻译，在文字或图片批注中询问 AI，需要深入讨论时打开聊天。

A local PDF reader with your own API: read papers and books, adjust paper colors, translate selected text, ask AI in text or image annotations and open chat for deeper discussion.

## 本次更新 / What’s new

- **原图不再显示提问圈画**：移除 PDF 页面上重复叠加的红圈和画笔。原页保留图片批注的定位入口，便于重新打开问答。
  **Keep question markings off the source PDF**: remove the duplicated circle and pen overlay from PDF pages while retaining the source-region locator for reopening image Q&A.
- **提问预览与 AI 截图继续保留标记**：圈画仍显示在图片问答预览和编辑器中，也会合成到主动发送给 AI 的选图里，继续支持圈图提问和重新提问。
  **Keep markings in previews and AI images**: circles and pen strokes remain in the Q&A preview and drawing editor, and are included in the selected image explicitly sent to AI. Marked-image questions and re-questioning continue to work.
- **兼容已有图片批注**：旧圈画、问答和重新提问草稿保留；关闭、重开、重启及撤销删除后，圈画都不会再覆盖 PDF 原图，无需重新导入 PDF。
  **Preserve existing image annotations**: saved markings, answers and replacement drafts remain intact. Closing, reopening, restarting and undoing deletion do not put the markings back on the source page; no PDF reimport is required.

八语界面、界面语言对应的默认回答/翻译、批注拖动缩放、图片问答、快速翻译与并排聊天等原有功能继续保留。
Eight interface languages, language-aware answers and translation, popup moving/resizing, image Q&A, quick translation and side-by-side chat remain available.

## 下载与更新 / Download and update

下载 Assets 中的 **AI-Embedded-Paper-PDF-Reader-0.1.32-Windows-x64.zip**，完整解压，先正常退出旧版，再运行新目录内的 **AI-Embedded-Paper-PDF-Reader.exe**，保留同目录文件。原本机资料与 API 连接继续使用；应用正常使用时只运行一个版本。GitHub 自动生成的 Source code 压缩包用于查看或构建源码，Windows 用户请选择完整客户端 ZIP。

Download **AI-Embedded-Paper-PDF-Reader-0.1.32-Windows-x64.zip** from Assets and fully extract it. Exit the old app normally, then run **AI-Embedded-Paper-PDF-Reader.exe** from the new folder, keeping all accompanying files. Existing local data and API connections remain in use; run one normal app instance at a time. GitHub’s automatic source archives are for inspecting or building the code; Windows users should choose the complete client ZIP.

## 隐私与数据 / Privacy and data

API 配置与阅读资料保存在本机；系统加密可用时，密钥使用系统加密，密钥不进入聊天备份。只有主动提问时，才向你配置的服务发送认证信息、本次提问图片与对应资料。圈画是图片批注数据，不会写入原 PDF 文件。详见[隐私说明](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md)。

API settings and reading data stay local. Saved keys use system encryption when available and are excluded from chat backups. Explicit questions send authentication, their question image and scoped material to your configured provider. Markings belong to image annotations and are not written into the original PDF. See [Privacy](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader/blob/main/docs/PRIVACY.md).

## 验证与校验 / Validation and checksum

318 项自动测试、129 项实际客户端检查、7 项旧版批注兼容检查和 552 项发行包核验通过；实际 EXE 的启动、保存、备份和正常退出验证通过。测试使用虚构 PDF、隔离资料和模拟接口；对照原图验证实际发送图片新增了圈画，同时原 PDF 文件字节保持一致。

Passed: 318 automated tests, 129 real-client checks, 7 legacy-annotation checks and 552 package checks, plus real EXE startup, save, backup and normal-exit verification. Tests use fictional PDFs, isolated profiles and mock APIs. Pixel comparisons verify newly drawn markings in sent images while the saved source PDF bytes remain unchanged.

ZIP SHA-256:

```text
295d6fe40d57c5c23ddb4d1ff49561b867c4be190fe6f4a00b6ea3db36239fee
```

## 实现与复用 / Implementation and reuse

原创应用代码全部由 GPT 通过 Codex 实现；人类发起者负责想法、需求及功能取舍。第三方组件保留各自作者及许可证。项目采用 MIT 许可证，欢迎用 AI agent 或 vibe coding 改成适合自己的版本，发布衍生项目时请链接[本项目](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader)。

Original application code was implemented entirely by GPT through Codex; the human initiator provides ideas, requirements and product decisions. Third-party authorship and licenses remain distinct. The project uses MIT: adapt it with an AI agent or vibe coding and please link to [this project](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader) when publishing a derivative.
