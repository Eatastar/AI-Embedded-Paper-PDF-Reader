# 改进清单 / Roadmap

审查基准为客户端 0.1.6；截至 0.1.16 已完成项用勾选标记，其余仍为待办。优先处理长期保存、恢复和操作可控性，再补齐论文阅读流程。

## 优先处理

- [x] 01 共用不可变上下文快照，避免每条询问批注重复保存整篇资料。
- [x] 02 按对话、消息和批注增量保存，合并过期的保存任务。
- [x] 03 创建前统一检查保存上限，避免进入无法保存或备份的状态。
- [x] 04 正常退出确认写入完成，异常退出提供最近检查点恢复。
- [x] 05 为本地读取失败增加恢复入口和可恢复错误页面。
- [x] 06 自动轮换备份、文件内容校验和恢复验证。
- [x] 07 增加独立的批注停止按钮，保留 × 只收起窗口的行为。
- [ ] 08 开放请求时限和输出长度设置，区分首字等待与输出中断。
- [ ] 09 将所选资料始终留在引用数据区域，统一资料与系统规则的边界。
- [x] 10 保留兼容版本号，并增加构建号、构建时间与可追溯更新记录。

## 阅读与资料管理

- [x] 11 默认连续滚动阅读，旧版偏好一次迁移；保留可记忆的单页选择和阅读位置。
- [x] 12a PDF 内嵌文档目录与章节跳转。
- [ ] 12b 页面缩略图与书签。
- [x] 13 当前文档全文搜索、结果页码、原文标记与跳转。
- [x] 14 按需打开批注总览，按页码、类型和内容筛选并返回原句。
- [ ] 15 AI 回答附带可点击的原文文件、页码和引用片段。
- [ ] 16 提取文字预览，以及双栏、断词、上下标和公式的阅读顺序检查。
- [ ] 17 对支持图片的模型提供主动发送选中区域或当前页的入口。
- [ ] 18 OCR 及识别结果提示，作为扫描资料扩展。
- [ ] 19 文档导入进度、取消，以及先阅读后后台提取的方案。
- [ ] 20 大图、长论文、密集公式下的性能测量和针对性优化。

## 日常使用与工程管理

- [ ] 21 独立文献库和文件去重，保持不同对话的批注关联。
- [ ] 22 单独移除附件与空间占用查看；0.1.8 已完成回收站单条永久删除、清空和关联文件清理。
- [ ] 23 主动连接测试，区分已配置、验证成功与连接失败。
- [ ] 24 模型来源、耗时、用量记录，以及按配置估算费用。
- [x] 25 按用户选择默认“小文件全文、大文件按需引用”，完整保留有效主对话，展示发送范围并固定失败请求资料。
- [ ] 26 可阅读的 Markdown、Word 或 PDF 笔记导出，以及标准 PDF 批注导出方案。
- [ ] 27 按对话持久化主问题草稿，增加重命名、查找、置顶和归档。
- [ ] 28 可调聊天字号、界面字号、批注框尺寸和展开阅读。
- [ ] 29 固定真实文档类型的自动交互回归、压力测试和服务商兼容记录。
- [ ] 30 完善模块接口、版本管理和统一的持续检查与发布流程。

## 审查证据摘要

- 合成资料包含 100 万字符，附带 10 条完整上下文询问后，文字记录约从 1 MB 增至 11 MB。
- 0.1.9 的相同规模合成测试：旧格式 11,011,174 字节，紧凑文字记录 2,014,113 字节，减少 81.71%；30 次流式更新每次最多提交 3 条记录、2,432 字节。这是序列化元数据的对比，不代表实际磁盘占用或真实阅读器速度。可在客户端目录运行 `pnpm benchmark:storage` 复测。
- 0.1.6 审查时创建逻辑可以产生第 1001 条对话；0.1.7 已在改变界面或写入附件之前拒绝超限操作。
- 退出保存、复杂页面性能等项目属于需要加固或继续测量的设计风险，未据此宣称发生了真实个人数据损失。

## 0.1.12 已落实 / Completed in 0.1.12

- [x] 批注高亮颜色可选择预设或自定义，并随批注保存。 / Preset and custom highlight colors saved with annotations.
- [x] 应用内中文 / English 切换并记忆。 / Remembered in-app Chinese/English selection.
- [x] 新名称、双语介绍、GPT 实现署名与衍生项目说明。 / New name, bilingual introductions, GPT implementation credit and derivative guidance.

Next priorities remain request controls, clearer source references, extraction quality, thumbnails/bookmarks and optional OCR/image workflows. These are plans rather than released capabilities. Existing completed items above record earlier storage, recovery and reading improvements.

## 0.1.16 已落实 / Completed in 0.1.16

- [x] 独立 API / 提示词 / 快捷键划词翻译，Alt+1 默认，临时结果可转普通笔记。 / Independent selection translation; Alt+1 by default, temporary results can become plain notes.
- [x] PDF 原生引用、图号链接、页内定位和返回，保留正常拖选。 / Embedded PDF reference/figure links with within-page positions and return navigation.
- [x] 深色背景下彩色字边缘去除白色残影。 / Remove white mattes around colored text on dark paper.
