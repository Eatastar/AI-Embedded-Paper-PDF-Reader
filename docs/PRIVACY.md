# 本地数据与模型请求 / Local data and model requests

AI-Embedded Paper PDF Reader 在本机保存阅读资料、聊天和批注。项目没有自建的云端文件库、账号服务或使用情况收集接口。

## 什么保存在本机

- 导入文件的原始字节、提取文字、聊天、批注与阅读位置。
- 各模型连接的名称、接口地址、模型名与回答偏好。
- 手动导出的聊天备份和桌面自动备份；备份含对话与原文件，应按个人资料保管。
- 桌面的模型密钥由 Windows 系统加密保存。系统加密不可用时，密钥仅本次运行有效。

模型配置和凭证独立于聊天数据库，聊天备份不包含模型密钥。桌面数据使用当前 Windows 账户的应用数据目录，与程序目录分开。删除或移动源码和程序文件，不会自动删除个人数据。

## 什么时候发送数据

打开、翻页、换色、搜索、写普通批注、保存模型配置和切换模型均不调用 AI。

发送主聊天问题或创建 AI 询问批注时，会向用户所选服务发送完整有效对话、该对话所有附件的提取文字，以及本次问题；批注请求另包含选中文段。原 PDF 和页面图片不会作为文件上传。接口密钥用于对应服务的请求授权。

因此，“文件保存在本机”不代表提取文字不会发送给模型。处理私密资料前，请确认选择的服务和问题范围。服务商如何保存请求数据，以服务商规则为准。

## 代理与 IP

Windows 桌面版通过 Electron / Chromium 网络组件读取系统代理设置，每次模型请求前刷新配置。程序不内置代理订阅、代理账号、固定节点或固定公网 IP。

系统代理接收到请求后，可能按其自身规则转发到代理节点，也可能直连。走代理时，服务端通常看到代理出口 IP；直连时则看到当前网络出口 IP。`localhost` / 回环地址的本地模型通常直接在本机连接。网页版的 Node 服务与桌面网络实现不同，不应假定它自动沿用 Windows 系统代理。

参考：[Electron 的代理解析、配置刷新和会话请求说明](https://www.electronjs.org/docs/latest/api/session)。

## 日志和仓库

请求诊断只保留时间、诊断编号、请求类型、接口格式、目标主机、模型名、结果、状态码和耗时等允许字段，不记录请求正文、授权头或密钥。日志仍可能包含用户自定义的模型名称和接口主机，分享前应先检查。

源码仓库不保存运行日志、用户数据库、实际模型配置、环境密钥、聊天备份、个人论文或阅读截图。公开发布包由程序和通用资源组成；使用后生成的个人数据不在发行包内。

反馈问题时请先去除密钥、聊天正文、私人文档、个人路径及代理订阅地址，勿直接提交整个用户数据目录。

## English

The app stores original document bytes, extracted text, conversations, annotations and reading position locally. Model connections and credentials are separate from the conversation database. Windows encrypts desktop API keys with the operating system; when encryption is unavailable, keys last only for the session. Conversation backups include original attachments and notes, but no model keys. Interface language is an independent local preference and is not included in these backups.

Reading, turning pages, recoloring, searching, writing personal notes and saving/switching connections make no AI requests. Asking sends the full valid main conversation, extracted text from all its attachments and your question to the selected service; annotation questions also include the selected passage. Original PDFs and page images are not uploaded as files. The provider determines its own data-processing rules.

The Windows desktop app uses Electron/Chromium to refresh and read system proxy settings before model requests. The app contains no proxy subscriptions, proxy credentials, fixed nodes or fixed public IP. Proxy rules may route a request through a node or directly. A provider normally sees the proxy exit IP for proxied requests and the network exit IP for direct requests. Local loopback model services usually connect directly. The browser version uses a different Node networking path and should not be assumed to inherit Windows system proxy settings.

Diagnostic logs retain only allowed metadata such as time, request ID, type, format, destination host, model name, result, status and duration. They exclude request bodies, authorization headers and keys, but user-defined model names and API hosts may still be sensitive. Review them before sharing. The source repository and release packages contain no personal runtime databases, actual model settings, environment secrets, backups, papers or reading screenshots. Remove keys, private content, personal paths and proxy subscription URLs before reporting a problem; do not submit the whole user-data directory.
