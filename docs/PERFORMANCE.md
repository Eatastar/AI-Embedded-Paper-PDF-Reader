# 性能与架构 / Performance and architecture

v0.1.33 在保留阅读、批注问答、图片问答、划词翻译和聊天功能的前提下，减少大对象副本与闲置资源。程序和数据的更新约定见 [UPDATING.md](UPDATING.md)。v0.1.32 发布包不被覆盖。

v0.1.33 reduces copies of large objects and idle resources while preserving reading, annotation Q&A, figure questions, quick translation and chat. See [UPDATING.md](UPDATING.md) for data-preserving updates. Existing v0.1.32 packages are not overwritten.

## v0.1.37：减少频繁恢复点并支持删除 / Fewer frequent points and explicit deletion

主资料的及时自动保存保持不变。历史恢复点从“修改停止 3 秒”和每分钟检查，调整为每 10 分钟检查变化；正常退出与手动“立即备份”仍写入或核对最新状态。内容完全相同时复用现有恢复点。保留上限仍是 5 个普通点及最多 2 个升级前点，不自动缩减已有点的数量；用户可在列表中逐条确认删除。

Prompt saving of primary data is unchanged. Historical checkpoints move from a three-second edit debounce plus minute checks to changed-data checks every 10 minutes. Normal exit and Back up now still write or verify the current state. Identical contents reuse a point. Retention stays at five ordinary and up to two pre-upgrade points, without automatically reducing existing history; users can confirm individual deletions in the list.

删除通过可信本地顶层页面的桌面接口串行执行，普通和受保护的恢复点都允许删除。先记录可恢复的删除操作，再更新保护信息、移除记录，最后按剩余引用清理附件；失败会恢复保护，崩溃后按文件是否已移除恢复或完成操作。删除状态无法确认时停止清理。不会访问或删除主资料库原件。删除后使前端检查点状态失效；正常退出和手动备份会强制重新核对，避免“已无备份却跳过保存”。

Deletion is serialized through the trusted local top-level desktop interface and supports ordinary and protected points. Journal the operation, update protection, remove the record, then collect attachments by remaining references. On failure restore protection; after a crash recover or finish according to whether removal occurred. Uncertain deletion state blocks cleanup. Primary-library originals are not accessed or deleted. Invalidate the renderer’s checkpoint cache after deletion; exit and manual backups force verification so an empty backup store cannot be mistaken for a current checkpoint.

## v0.1.36：自动备份附件共享 / Shared attachments in automatic backups

新的自动恢复点是小型 `.snapshot.json` 记录文件；附件在本机 `Backups/Attachments/<SHA-256>.bin` 中按内容共用。文件名、文档编号不同而内容相同，也只保存一份备份附件。资料库仍保留自己的原件，这一份独立恢复副本用于应对资料库损坏。图片问答仍只存选区和笔迹，不增加持久截图副本。

New automatic recovery points are small `.snapshot.json` record files. Attachments share content-addressed copies under local `Backups/Attachments/<SHA-256>.bin`; identical contents share one backup copy even with different filenames or document IDs. The library retains its own original, with an independent recovery copy protecting against library damage. Figure questions continue to store regions and markings without persistent screenshot copies.

上传及旧备份转换均按有界分块处理，不拼接整份 PDF 的 Base64 字符串。附件先同步写盘、校验实际内容，再发布恢复记录；保护索引安全更新后才轮换和清理。旧自动备份逐份校验、建立替代副本后移除；损坏或暂不支持的布局保留原文件并按正常规则轮换。保留最近 5 份普通恢复点和最多 2 份升级前恢复点；只有所有保留点都不再引用的附件才会回收。任一恢复记录或保护索引无法确认时停止附件清理。

Uploads and old-backup conversion use bounded chunks rather than building a complete PDF Base64 string. Attachment bytes are synced and verified before publishing recovery records; protection updates precede rotation and cleanup. Old automatic backups are verified and replaced individually, while damaged or unsupported layouts remain intact under normal retention. Keep five ordinary and up to two protected upgrade points. Collect attachments only after their final retained reference disappears; uncertainty about any shared record or protection index stops attachment cleanup.

手动导出和从恢复点导出的 JSON 仍包含原文件，可独立恢复并供旧版本导入。本地共享记录本身需要 v0.1.36 或更新版本读取；手动搬整个自动备份库时必须连同附件和索引一起复制。主资料库格式和 API 配置位置不变。更新步骤见 [UPDATING.md](UPDATING.md)。

Manual JSON and exports from recovery points still include original files and remain independently restorable by older importers. Local shared records themselves require v0.1.36 or later; moving the automatic backup store manually requires its attachments and indexes too. The primary database format and API configuration location are unchanged. See [UPDATING.md](UPDATING.md).

### 可重复空间对照 / Reproducible storage comparison

```sh
node --expose-gc --import tsx scripts/benchmark-backups.ts
node --expose-gc --import tsx scripts/benchmark-backups.ts --mib=64
```

脚本只在独立临时目录构造虚构二进制附件和 7 个旧恢复点，再建立新检查点、转换旧副本并逐份恢复核对附件哈希。下表为备份目录文件的逻辑大小，不含资料库原件或文件系统开销；不是用户实际资料的统计。

The script creates fictional binary data and seven legacy recovery points in an isolated temporary directory. It then writes a new checkpoint, converts older copies, and restores each retained point to check attachment hashes. Sizes below are logical backup-directory file sizes, excluding library originals and filesystem overhead, not measurements of personal data.

| 相同附件 / Identical attachment | 旧备份库 / Before | 共享备份库 / After | 减少 / Reduction | 保留恢复点 / Points |
| --- | ---: | ---: | ---: | ---: |
| 8 MiB | 74.69 MiB | 8.03 MiB | 89.26% | 7 |
| 64 MiB | 597.36 MiB | 64.02 MiB | 89.28% | 7 |

上述 64 MiB 场景转换约 4.67 秒，转换期间 Node 进程 RSS 相对开始时的峰值增量约 123.89 MiB；8 MiB 场景约 0.47 秒、127.81 MiB。瞬时内存受分配器、回收和运行环境影响，不代表全客户端内存上限。两种场景最终都只剩 1 份共享附件，所有保留恢复点均通过恢复校验。

The 64 MiB run converted in approximately 4.67 seconds with a peak Node RSS increase of 123.89 MiB from its starting sample; the 8 MiB run took about 0.47 seconds with a 127.81 MiB increase. Transient memory depends on allocation, collection and environment, and is not a full-client memory cap. Both runs ended with one shared attachment copy and every retained point passed restore checks.

## 资源边界 / Resource ownership

- **文档会话**：底图、高清补图和截图共用绘制队列；页面通过使用计数管理，最后一个使用者结束后清理 PDF.js 页面资源。旧文档的加载可以取消。连续阅读的底图共享 1600 万像素目标预算；高清补图仍保留单张 800 万像素上限。固定在离屏位置的批注或翻译保留文字锚点，释放其底图像素。
- **改色处理器**：替换来源时立即释放旧像素；闲置后释放线程来源；高清补图发布后不保留一份多余的原色补图。已传回的像素直接用于 ImageData，避免重复复制。白底原始绘制仍在后台完成，保留锐利缩放与换色时不闪白的行为。
- **工作区与请求**：不可变业务记录仍是主要数据源。编码缓存保留指纹和长度，避免常驻整份 JSON 副本。AI 流式片段按约 32ms 合并显示与保存更新，成功、失败、停止时补齐最后片段；固定重试资料和聊天/批注上下文隔离保持不变。
- **聊天视图**：只挂载视野附近的 Markdown、公式和批注组件；使用中的批注、翻译或选区保留来源。全选复制从记录构建完整文字，保留 Markdown、LaTeX 与主动引用，无需重新渲染离屏消息。轻量占位保存消息顺序与高度，草稿和滚动位置不依赖重型内容常驻。
- **搜索与检索**：不再为整本书保存两份逐字符位置数组，只为实际命中映射原文位置。搜索缓存用 UTF-8 字节存储，上限 8 MiB；长书分批搜索并允许取消。全文请求资料缓存最多 4 份、预算 8 MiB；AI 按需引用索引最多缓存 3 份文档，估算预算 16 MiB。原始文字及正在使用的固定请求不受缓存淘汰影响。
- **存储与备份**：自动备份逐份读取附件，以拥有独立缓冲区的 256 KiB 分块传递给桌面端，直接写入临时文件并增量计算、复核 SHA-256。校验、同步和原子提交完成后才轮换旧恢复点。手动导出采用分块 Blob；手动导出仍是兼容 v0.1.32 的完整 JSON；v0.1.36 的本地自动存储改为上述共享附件格式。
- **依赖**：移除未使用的两个 React 批注封装库。翻译常量与模型地址工具放入中立的 shared 目录，前端不再依赖服务端业务模块。PDF.js 本体继续按需加载。

- **Document session:** base, detail and crop rasters share a queue. Page leases delay cleanup until every user finishes. Obsolete document loads can abort. Continuous base frames share a 16-million-pixel target budget; detail tiles retain their eight-million-pixel cap. Offscreen pinned notes/translations keep text anchors without keeping their base pixels.
- **Color processing:** source replacement releases old pixels; idle workers release their source, and completed detail tiles discard spare original pixels. Returned buffers feed ImageData without another full copy. Original white rendering remains offscreen, preserving sharp zoom and flash-free recoloring.
- **Workspace and requests:** immutable records remain canonical. Encoded caches retain fingerprints and lengths rather than entire JSON strings. Streamed text updates are coalesced at about 32ms and flushed on completion, error and stop. Frozen retries and isolated chat/annotation contexts are preserved.
- **Chat view:** heavy Markdown, math and annotators mount near the viewport, with sources pinned while a note, translation or selection uses them. Whole-conversation copy builds complete text from records, retaining Markdown, LaTeX and explicit references without rendering offscreen messages. Lightweight slots preserve ordering/heights; drafts and saved positions survive heavy-content unmounts.
- **Search and retrieval:** whole-book character-offset arrays are replaced by mapping actual hits. UTF-8 search cache is capped at 8 MiB, with yielding/cancellable book search. Full-document request cache holds at most four documents under 8 MiB; relevant-context indexes hold at most three under an estimated 16 MiB. Eviction never changes original text or frozen requests in use.
- **Storage and backups:** attachments are read sequentially and sent as owned 256 KiB buffers. The desktop writes directly to a temporary file and calculates/verifies SHA-256 incrementally. Rotation follows verification, sync and atomic commit. Manual exports use chunked Blobs. Complete JSON exports remain compatible with v0.1.32; v0.1.36 local automatic storage uses shared attachments as described above.
- **Dependencies:** two unused React annotation wrappers were removed. Pure translation constants and model-URL helpers live in shared modules. PDF.js remains dynamically loaded.

## 安装包、资料与内存 / Package, data and memory

对本机生成的 v0.1.34 Windows x64 ZIP 实测：压缩包约 **139.57 MiB**，完整解压约 **333.25 MiB**；其中 `resources/app.asar`（应用代码、界面、PDF 和公式资源）约 **10.46 MiB**，在 ZIP 内约 **4.03 MiB**。其余主要是随包分发的 Electron/Chromium 运行环境及其资源。安装包不含用户的 PDF、聊天、批注或 API 配置；新增批注也不会修改安装包。这里的文件大小不是客户端运行内存。

Measured on the locally generated v0.1.34 Windows x64 package: **139.57 MiB** compressed and **333.25 MiB** extracted. The application archive `resources/app.asar`, including UI, PDF and math assets, is **10.46 MiB**, or **4.03 MiB** inside the ZIP. Most remaining space is the bundled Electron/Chromium runtime and its resources. The package contains no personal PDFs, chats, annotations or API configuration, and adding annotations does not modify it. These are file sizes, not runtime memory.

完成的文字问答保存选文、位置、问题和回答；图片问答保存选区和矢量笔迹，不按批注重复保存整份 PDF 或截图。图片派生 Blob 缓存全局上限为 32 MiB / 24 条，活动预览、PDF 解码、渲染画布和 GPU 资源另计。大图扫描件与高倍率渲染仍可能使整个客户端超过 500 MiB，缓存上限并非整个程序的内存保证。

Completed text Q&A stores selections, anchors, questions and answers. Figure Q&A stores regions and vector markings rather than another complete PDF or screenshot for each annotation. The global derived-image Blob cache is capped at 32 MiB / 24 entries; active previews, PDF decoding, canvases and GPU resources are additional. Large scanned pages or high zoom can still push total client memory above 500 MiB; cache limits are not a whole-app memory guarantee.

v0.1.35 及更早版本的自动完整 JSON 备份包含 PDF 的 Base64，附件部分约为原文件的 4/3。自动保留最近 5 份普通备份和另外最多 2 份升级前备份；如果这 7 份都含同一份 50 MiB PDF，资料库原件加这些备份仅附件部分约为 **517 MiB 磁盘空间**。相同内容会复用已有备份，但批注内容变化后生成的新完整备份仍包含附件。这些备份文件不会常驻全部读入内存。v0.1.36 的自动备份已改为前述附件共用方式；手动导出继续保持自包含、可独立恢复。

In v0.1.35 and earlier, complete automatic JSON backups contain Base64-encoded PDFs, using about 4/3 of the original attachment size. Retention allows five ordinary backups plus up to two protected upgrade backups. If all seven contain the same 50 MiB PDF, the stored original and backup attachment data alone occupy about **517 MiB on disk**. Identical backup contents reuse an existing file; a new complete backup after note changes still includes attachments. All these backup files are not kept loaded in memory. v0.1.36 automatic backups instead share attachments as described above; manual exports remain self-contained and independently restorable.

### 批注增长测量 / Annotation growth measurement

在客户端目录运行；只构造虚构元数据，不创建或读取个人 PDF、资料库或 API：

Run from the client directory. The script constructs synthetic metadata without opening personal PDFs, profiles or APIs:

```sh
node --expose-gc --import tsx scripts/benchmark-annotations.ts
node --expose-gc --import tsx scripts/benchmark-annotations.ts --interrupted
```

一次 Node 对照：100 万字符原文，1000 条各含 1000 字符回答的文字批注，逐次按全文资料准备请求。紧凑元数据从 **0.97 MiB** 增长至 **3.47 MiB**（约增加 **2.50 MiB**）；全部为中断请求时约 **2.59 MiB**。本次保留的 Node JS 堆增量分别约 **5.97 / 5.28 MiB**。不包含 PDF 原件、实际数据库开销、备份文件或界面/GPU 内存，也不能据此保证任意论文和任意长回答都只占这些空间。

One Node run used one million source characters and 1000 text annotations with 1000-character answers, preparing full-document requests sequentially. Compact metadata grew from **0.97 MiB** to **3.47 MiB**, an increase of about **2.50 MiB**; all-interrupted requests used about **2.59 MiB**. Retained Node JS heap increased by approximately **5.97 / 5.28 MiB** respectively. This excludes original PDF bytes, physical database overhead, backup files and renderer/GPU memory. It is not a size or memory guarantee for arbitrary papers or answers.

### 实际桌面进程采样 / Desktop-process samples

对 v0.1.35 EXE 使用独立资料目录、24 页虚构纯文字 PDF，读取 Electron `app.getAppMetrics()` 在 Windows 报告的各进程 `privateBytes` 并求和。一次采样：首页约 **242.33 MiB**，首次打开 PDF 约 **446.30 MiB**，连续三次重新打开分别约 **477.70 / 485.79 / 486.71 MiB**；最后关闭后约 **424.80 MiB**。仅用于诊断、手动触发渲染器 JS 回收后约 **397.81 MiB**；正式程序没有为这次测试新增强制回收行为。短期重复打开的采样不能证明长期无泄漏。

Using the v0.1.35 EXE, an isolated profile and a fictional 24-page text-only PDF, one Windows run summed process `privateBytes` reported by Electron `app.getAppMetrics()`. Samples were **242.33 MiB** at home, **446.30 MiB** on first open, **477.70 / 485.79 / 486.71 MiB** on three reopens, and **424.80 MiB** after the last close. A diagnostic-only renderer JS collection reduced the sample to **397.81 MiB**; no forced collection behavior was added to the shipped app. These short repeated-open samples do not establish freedom from long-term leaks.

以上是多个进程的私有提交内存，不是单份 PDF 的文件大小，也不等同于任务管理器中某一项物理内存读数。进程工作集还包含共享页，直接相加会重复计数。分辨率、缩放、显卡、扫描图片、PDF 字体和取样时刻都会影响结果；当前客户端确有数百 MiB 的基础及渲染成本，本轮下拉框修正并未降低这些成本。v0.1.35 的应用归档相比 v0.1.34 只增加 523 字节，未新增运行库。

These are private committed bytes across processes, not the PDF file size or a specific Task Manager physical-memory reading. Working sets include shared pages and their sum can double-count them. Display resolution, zoom, GPU, scans, PDF fonts and sample timing affect results. The client has real baseline and rendering costs of hundreds of MiB; this select-control fix does not reduce them. The v0.1.35 application archive adds only 523 bytes over v0.1.34, with no new runtime library.

## 可复现对照 / Reproducible comparison

从客户端目录执行：

```sh
node scripts/benchmark-memory.mjs --baseline=255b900
```

基线是 v0.1.32 源码提交 `255b900`。脚本从 Git 读取该提交的源码，在独立子进程中使用虚构资料比较，结果写到被忽略的 `work/performance-tests/memory-results.json`。不读取个人资料，也不调用真实模型。

The baseline is v0.1.32 source commit `255b900`. The script reads that source from Git and compares synthetic workloads in separate child processes. Results go to ignored `work/performance-tests/memory-results.json`. It reads no personal profile and calls no real model.

一次 Windows / Node 24.22.1 对照结果如下，单位 MiB。峰值为操作期间进程 RSS 相对操作前的增量：

One Windows / Node 24.22.1 run produced the following MiB results. Peak values are process RSS increases over each operation's starting point:

| 虚构场景 / Synthetic workload | v0.1.32 | v0.1.33 |
| --- | ---: | ---: |
| 2500 页文字搜索峰值增量 / 2500-page search peak increase | 79.59 | 25.86 |
| 搜索后保留的 JS 堆与数组缓冲增量 / Retained search heap + ArrayBuffers | 49.07 | 14.15 |
| 1000 页记录编码后保留的 JS 堆增量 / Retained record-encoding heap | 9.65 | 5.30 |
| 64 MiB 附件完整备份峰值增量 / Complete 64 MiB attachment backup peak increase | 710.66 | 101.32 |

这是受控的 Node 数据处理测试，不是桌面客户端总内存、GPU 显存或用户实际文献的占用保证。采样不能捕捉所有瞬时分配，RSS 也会受垃圾回收和系统分配器影响。首次搜索会以额外计算换取更少的长期索引；首次编码增加指纹计算。重复流式更新通过合并与缓存减少工作。

This is a controlled Node data-processing benchmark, not a guarantee about desktop total RAM, GPU memory or a user's documents. Sampling cannot observe every instantaneous allocation; garbage collection and allocators affect RSS. Initial search trades some computation for a smaller retained index, and initial encoding adds fingerprint calculation. Batching and caching reduce repeated streaming work.

## 保留的兼容边界 / Compatibility limits

本轮验证包括 331 项回归测试，以及独立 Windows 资料中的实际界面检查：160 条消息、18 页虚构 PDF、笔记及图片批注、完整复制、收起聊天后保留草稿、重启恢复同一段落、深色配色、放大和框选图片。真实发行 EXE 另通过启动、退出保存与无打包密钥检查；从另一程序目录启动同一测试资料后，160 条消息、2 条批注、PDF 和聊天位置仍可读取。新版完整备份也由 v0.1.32 提交中的原解析器核对。所有测试使用虚构资料，不读取个人工作区。

Validation includes 331 regression tests and actual UI checks in an isolated Windows profile: 160 messages, an 18-page synthetic PDF, notes/figure annotations, whole-chat copy, retained drafts when hiding chat, restored paragraph position, dark colors, zoom and crop previews. The real packaged EXE passed startup, exit-save and no-packaged-key checks. Launching it from a different program folder retained the same test profile's 160 messages, two annotations, PDF and chat position. The original v0.1.32 parser also verified new complete backups. All tests use synthetic material rather than personal profiles.

为保持 v0.1.32 原地打开与回退，数据库版本、记录格式及附件存储没有改变，因此附件仍需一次读取一份完整文件。PDF 内部解码图像、字体、浏览器和 GPU 另有开销；底图预算不等于整个进程的硬性内存上限。以后如引入附件分段存储或逐会话加载，需要另行设计迁移与回退测试。

For v0.1.32 compatibility and rollback, the database version, record format and attachment representation are unchanged, so one complete attachment is still read at a time. Decoded PDF images, fonts, browser and GPU allocations add overhead; a base-pixel budget is not a hard process-memory limit. Chunked attachment storage or lazy conversation loading would require separate migration and rollback work.
