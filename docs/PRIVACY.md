# 本地数据与模型请求 / Local data and model requests

AI-Embedded Paper PDF Reader 在本机保存阅读资料、聊天、批注和 API 连接配置。API 地址与密钥由你自行配置，不上传到项目方服务器；项目没有自建的密钥托管服务、云端文件库、账号服务或使用情况收集接口。

## 什么保存在本机

- 导入文件的原始字节、提取文字、聊天、批注与阅读位置。
- 各模型连接的名称、接口地址、模型名与回答偏好。
- 手动导出的聊天备份和桌面自动备份；备份含对话与原文件，应按个人资料保管。
- Windows 桌面版使用系统加密保存模型密钥。系统加密不可用时，连接配置仍可保存，密钥只在本次运行的内存中保留，不写入明文密钥文件。

模型配置和凭证独立于聊天数据库，聊天备份不包含模型凭证字段。桌面数据使用当前 Windows 账户的应用数据目录，与程序目录分开。删除或移动源码和程序文件，不会自动删除个人数据。

## 什么时候发送数据

打开、翻页、换色、搜索、写普通批注、保存模型配置和切换模型均不调用 AI。

发送问题会发送完整有效主对话；附件默认小文件全文、大文件按需引用，另带选中文字及所在页片段。原文件留在本机。自动模式在超过 25 MiB、300 页或 12 万提取字符时使用本地关键词检索，每份引用片段最多 2.4 万字符；选区和对话另计。阅读设置可切换全文或按需引用，工具栏显示范围。失败重试沿用首次请求的资料；资料不足会明确提示，全文仍受请求与模型容量限制，不静默截断主对话。原 PDF 和页面图片不会作为文件上传。点击首页“探测上游模型”或设置中的“探测模型”会向所填地址发送模型列表请求及对应密钥授权，不发送论文或聊天；获取本身不保存或启用新配置，修改地址或协议后不沿用旧密钥。接口密钥用于对应服务的请求授权。

因此，“文件保存在本机”不代表提取文字不会发送给模型，“密钥保存在本机”也不代表调用 API 时无需发送认证。本地保存避免向项目方托管凭证，但不能保证所有环境下绝无泄露；所选服务、中转站及本机环境仍需可信。服务商如何保存请求数据，以服务商规则为准。处理私密资料前，请确认选择的服务和问题范围。

## 代理与 IP

Windows 桌面版通过 Electron / Chromium 网络组件读取系统代理设置，每次模型请求前刷新配置。程序不内置代理订阅、代理账号、固定节点或固定公网 IP。

系统代理接收到请求后，可能按其自身规则转发到代理节点，也可能直连。走代理时，服务端通常看到代理出口 IP；直连时则看到当前网络出口 IP。`localhost` / 回环地址的本地模型通常直接在本机连接。网页版的 Node 服务与桌面网络实现不同，不应假定它自动沿用 Windows 系统代理。

参考：[Electron 的代理解析、配置刷新和会话请求说明](https://www.electronjs.org/docs/latest/api/session)。

## 日志和仓库

请求诊断只保留时间、诊断编号、请求类型、接口格式、目标主机、模型名、结果、状态码和耗时等允许字段，不记录请求正文、授权头或密钥。日志仍可能包含用户自定义的模型名称和接口主机，分享前应先检查。

源码仓库不保存运行日志、用户数据库、实际模型配置、环境密钥、聊天备份、个人论文或阅读截图。公开发布包由程序和通用资源组成；使用后生成的个人数据不在发行包内。

反馈问题时请先去除密钥、聊天正文、私人文档、个人路径及代理订阅地址，勿直接提交整个用户数据目录。

## English

The app stores original document bytes, extracted text, conversations, annotations, reading position and API connection settings locally. You supply the endpoints and keys; the app does not upload them to a project-operated server. The project runs no credential hosting, cloud document library, account service or usage collection endpoint. Model connections and credentials are separate from the conversation database. The Windows desktop app encrypts saved keys with the operating system; if encryption is unavailable, connection metadata can still be saved but keys remain only in session memory, without a plaintext key file. Conversation backups include original attachments and notes, but no model credential fields. Interface language is an independent local preference and is not included in these backups.

Reading, turning pages, recoloring, searching, writing personal notes and saving/switching connections make no AI requests. Asking sends the full valid main conversation. Auto mode sends full extracted text for small files and locally retrieved excerpts for large files, plus the selection and passages from its page. Original files stay local. Above 25 MiB, 300 pages or 120,000 extracted characters, local keyword retrieval selects up to 24,000 excerpt characters per file; the selection and conversation are additional. Reading settings can override this scope, shown in the toolbar. Failed requests retry with their original material. Missing evidence is disclosed; full text remains subject to request and model capacity, without silently truncating the main conversation. Original PDFs and page images are not uploaded as files. Clicking Discover models or Fetch models sends a list request and the corresponding authentication to the entered endpoint, without paper or chat content. Discovery does not save or activate a new connection, and an old key is not reused after changing its endpoint or protocol. Local storage does not mean that authentication or extracted text never leaves the computer. It avoids entrusting credentials to the project, but cannot guarantee security in every environment; your provider, relay and computer still need to be trusted. The provider determines its own data-processing rules.

The Windows desktop app uses Electron/Chromium to refresh and read system proxy settings before model requests. The app contains no proxy subscriptions, proxy credentials, fixed nodes or fixed public IP. Proxy rules may route a request through a node or directly. A provider normally sees the proxy exit IP for proxied requests and the network exit IP for direct requests. Local loopback model services usually connect directly. The browser version uses a different Node networking path and should not be assumed to inherit Windows system proxy settings.

Diagnostic logs retain only allowed metadata such as time, request ID, type, format, destination host, model name, result, status and duration. They exclude request bodies, authorization headers and keys, but user-defined model names and API hosts may still be sensitive. Review them before sharing. The source repository and release packages contain no personal runtime databases, actual model settings, environment secrets, backups, papers or reading screenshots. Remove keys, private content, personal paths and proxy subscription URLs before reporting a problem; do not submit the whole user-data directory.
