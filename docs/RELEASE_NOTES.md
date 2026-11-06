# AI-Embedded Paper PDF Reader v0.1.21

优化聊天输入框：上方只保留文字输入，下方集中放本地文件、引用批注、模型与发送按钮，并增加间距及轻分隔线。批注数量并入按钮，窄栏自动缩短标签，模型下拉箭头保持居中；重复的“管理模型”入口收进模型列表，顶部设置继续可用。

Refines the chat composer: typing stays above one lower toolbar for local files, annotation references, model selection and Send, with more spacing and a subtle divider. Selected annotations use an inline count badge, labels adapt to narrow panes and the model arrow stays centered. Model management remains in the selector and top settings rather than repeating a text button.

269 项自动检查和 73 项实际界面检查通过。更新前正常退出旧版，完整解压 ZIP 后运行新目录的 EXE。API 连接、聊天、批注和阅读数据继续使用原本机目录。

269 tests and 73 real UI checks passed. Exit the old app normally, fully extract the ZIP and run the EXE from the new folder. API connections, chat, annotations and reading data continue using the existing local data directory.

## 同时包含 v0.1.20 改进 / Also includes v0.1.20 improvements

批注与聊天独立提问，保留论文背景，并支持手动引用批注和逐轮删除聊天。

Independent annotation and chat requests with paper context, explicit annotation references and per-round chat deletion.

## 请求范围 / Request scope

聊天发送尚未删除的有效主对话及所选文档资料，默认不读取批注；点击输入框下方工具栏“引用批注”后，只把手动选择的问答或笔记加入该次问题。PDF 批注只引用所属文档、选段和本次问题，不带聊天及其他批注；在 AI 回答上提问时，仅引用批注绑定的那一版原回答。

Chat sends the remaining valid main conversation and document material, without automatically reading annotations. Reference annotations in the composer toolbar adds only the Q&A or notes you select to that question. A PDF annotation uses only its own document, selection and current question, without chat or other annotations. An annotation on an AI answer uses only its bound original answer version.

文档范围继续支持自动、全文或按需引用：自动模式下，小文件发送全文提取文字，超过 25 MiB、300 页或 12 万提取字符时在本机检索，每份文档最多引用 2.4 万片段字符，选段和问题另计。原 PDF 和页面图片不作为文件上传。资料不足时明确提示，全文仍受请求和模型容量限制。批注失败重试保留本次问题、回答偏好和文档范围，从同一份不可变来源重新组装请求，不保存整段聊天快照。

Document scope still supports Auto, Full text and Relevant excerpts. Auto sends full extracted text for small files; above 25 MiB, 300 pages or 120,000 extracted characters, local retrieval sends at most 24,000 excerpt characters per document, with the selection and question additional. Original PDFs and page images are not uploaded as files. Missing evidence is disclosed, and full text remains subject to request/model limits. Failed annotation retries retain the question, answer preference and document scope and rebuild from the same immutable source, without storing a full-chat snapshot.

## 聊天操作 / Chat controls

点击输入框下方工具栏“引用批注”，搜索并选择当前阅读记录/对话中已保存的问答或笔记，每次最多 10 条；只有发送时才带入模型。问题下方可展开查看当时的内容副本。之后修改原批注不改写已发送聊天，需要更新时可在新问题中重新选择。

Use Reference annotations in the composer toolbar to search/select saved Q&A or notes in the current reading record/conversation, up to ten per question. Contents reach the model only when sent and can be expanded below that question. Editing the source later does not rewrite an existing discussion; select it again in a new question for an updated copy.

每轮回答下方的“删除本轮”会直接删除本轮问题、全部回答版本及这些回答上的批注，不进入回收站；PDF 原文批注和文件保留。同时清除剩余失败回答的旧请求快照，后续聊天中对被删回答批注的手动引用也会移除，重试不会通过这些缓存带回已删内容。以前的自动备份、迁移存档和导出文件可能仍含旧内容。

Delete round under each answer permanently removes that question, all answer versions and annotations attached to those answers, without Trash. PDF annotations and files remain. Remaining failed-answer snapshots and later manual references to the removed answer annotations are also cleared, so retries cannot restore deleted content through these caches. Earlier automatic backups, migration archives and exports may still contain old content.

## 保存与升级 / Saving and upgrading

已完成回答不再保存重复的请求快照，批注仅保存失败重试所需的小型设置。旧数据升级保留可见聊天、问答、高亮、原文和模型连接，清理重复上下文；读取旧版备份继续支持。含新增引用或重试字段的备份请用 0.1.20 或更新版本恢复，旧程序可能无法完整读取。

Completed answers no longer retain duplicate request snapshots. Annotation retries store only small settings. Upgrading preserves visible chat, Q&A, highlights, sources and model connections while pruning redundant contexts, and older backups remain readable. Restore backups containing new references/retry fields with v0.1.20 or newer; earlier apps may not read them fully.

完整解压 Windows x64 ZIP，更新前正常退出旧版，再运行新目录中的 AI-Embedded-Paper-PDF-Reader.exe。个人数据目录与 API 密钥存储方式沿用原设置。历史 Release、标签及附件保留。

Fully extract the Windows x64 ZIP, exit the old app normally and run AI-Embedded-Paper-PDF-Reader.exe from the new folder. The user-data directory and API credential storage remain the same. Historical releases, tags and assets are preserved.

验证：269 项自动检查及 21 项实际界面检查通过，覆盖全文背景保留、请求隔离、主动引用、失败重试、删除事务失败回滚、旧缓存升级与备份往返。使用虚构资料、隔离数据库和本机模拟接口，未读取个人资料或调用真实 API。

Validation: 269 automated tests and 21 real UI checks passed, covering full-paper background, request isolation, explicit references, retries, deletion transaction rollback, legacy-cache migration and backup round trips. Tests used synthetic material, isolated databases and local mock services, without personal data or real APIs.
