# AI-Embedded Paper PDF Reader v0.1.23

聊天文件栏改用居中的矢量箭头，并明确显示“展开 / 收起”，避免原来依赖字体的小字符箭头错位。纯聊天模式下，顶部同时提供“展开 PDF”和“阅读模式”：前者恢复 PDF 与聊天并排显示，后者直接返回专注阅读，均沿用文档的阅读页码与缩放。

The chat file bar now uses a centered vector chevron with explicit Expand / Collapse labels. Pure chat provides two separate actions: Open PDF restores side-by-side reading, while Reading mode returns directly to focused reading. Both retain the document's page and zoom.

修复不等号及否定关系符号（≠、不属于、非子集等）的斜线错位。原因是公式渲染器与加载的 KaTeX 样式版本不一致；现在统一为同一版本，并在全局加载本地样式与字体。修复覆盖聊天回答、批注问答、普通批注、临时翻译及流式显示。旧回答重新显示即可应用，无需重新生成。

Fixed misplaced negation slashes in not-equal, not-in and not-subset relations. The renderer and its KaTeX stylesheet had different versions; they now use the same pinned version with locally bundled styles and fonts. The correction applies to chat, annotation answers, plain notes, temporary translations and streaming output. Existing answers use the corrected layout when displayed, without regeneration.

277 项自动检查和 60 项实际 PDF 界面及公式检查通过。完整解压 Windows x64 ZIP，正常退出旧版后运行新目录的 AI-Embedded-Paper-PDF-Reader.exe。沿用原本机数据目录、聊天、批注及 API 配置。普通阅读与上述界面切换不调用 API；本次更新不改变提问、批注或翻译的发送范围。

277 automated tests and 60 real PDF UI and formula checks passed. Fully extract the Windows x64 ZIP, exit the old app normally and run AI-Embedded-Paper-PDF-Reader.exe from the new folder. Existing local data, chats, annotations and API settings remain in use. Reading and these interface switches make no API requests; this update does not change the context sent by chat, annotation or translation requests.
