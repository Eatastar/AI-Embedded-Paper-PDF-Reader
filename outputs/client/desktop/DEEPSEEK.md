# 配置自己的 API / Configure your API (0.1.32)

完整解压 Windows x64 ZIP，正常退出旧版后运行 AI-Embedded-Paper-PDF-Reader.exe，保留同目录全部文件。无法启动时运行“启动诊断.cmd”。

Fully extract the Windows x64 ZIP, exit the old app normally and run AI-Embedded-Paper-PDF-Reader.exe, keeping all files. Use the launch diagnostic script if needed.

首页“配置 API / 获取模型”可保存模型连接。按服务商实际说明选择 Chat Completions、Responses 或 Claude Messages 格式，填写基础地址、密钥并获取模型列表；模板不保证所选模型支持图片。所有功能共用连接列表，图片问答和翻译可各自选择连接。

Use API setup / Fetch models on the home screen to save a connection. Choose Chat Completions, Responses or Claude Messages according to the provider, enter its base URL and key, then fetch models. A template does not guarantee image support. Connections are shared; image Q&A and translation can select their own connection.

在 PDF 工具栏点击“框选图片”，选中整幅图及坐标、图例或图注，在紧凑批注中点击“圈出疑问”。默认画圈，也可选择画笔、颜色和粗细，支持撤销与清空。保留圈画后输入问题，选择已保存的视觉模型连接即可提问。点击缩略图可临时放大，默认侧栏宽度约 280–320px；窄窗口移到页面下方。批注可拖动，用 × 或 Esc 收起，再点原图选区重新打开。

Choose Select image in the PDF toolbar, include the figure with its axes, legend or caption, then choose Circle a detail in the compact annotation. Circle is the default; pen, colors, widths, undo and clear are available. Keep the markings, enter a question and select a saved image-capable connection. Click the thumbnail to enlarge it. The default panel is about 280–320px wide and moves below the page in narrow windows. Drag the panel or close it with × or Esc; click its source region to reopen it.

只有主动发送图片问题时，才向所选连接发送本次原始配色选图、圈画、问题及所属文档的文字资料；小文件默认全文，大文件按需引用，不带聊天及其他批注。重新提问成功后才替换原问答和圈画。明确只支持文字的连接可在设置中标记并提前阻止请求；未知能力依据上游明确错误提示，不会自动发送测试图片或产生探测调用。

Only sending an image question transmits its original-color crop, markings, question and source-document text to the selected connection. Small files use full text and large files use relevant excerpts by default, without chat or other annotations. A successful re-question replaces the old Q&A and markings; failures keep them. Mark known text-only connections in settings to block image requests. Unknown capabilities are classified from explicit upstream errors, without automatic probe images or billable test calls.

文本提问保留原功能。小文件默认全文，大文件按需引用；PDF 批注只引用所属文档、选段和问题，不带主聊天及其他批注。原 PDF 不作为文件上传。普通笔记、阅读、换色与搜索不请求 AI。

Text questions retain existing behavior. Small files use full text and large files relevant excerpts. PDF annotations use only their document, selection and question, without main chat or other notes. Original PDF files are not uploaded. Plain notes, reading, colors and search make no AI request.

Windows 桌面版沿用系统代理并使用系统加密保存密钥；加密不可用时密钥只留在本次内存，不写明文。聊天备份不包含密钥或连接配置。失败后可修正连接并重试，原问题和成功回答保留。

The Windows desktop app uses the system proxy and operating-system encryption for saved keys. If encryption is unavailable, keys stay in session memory without plaintext storage. Backups exclude keys and connection configuration. Correct the connection and retry after failure; your question and previous successful answer are retained.
