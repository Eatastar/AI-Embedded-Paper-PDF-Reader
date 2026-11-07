# AI-Embedded Paper PDF Reader v0.1.25

面向文献、教材与 PDF 书籍精读的本地阅读器。接入自己的 API，在原文旁批注提问、划词翻译，需要展开讨论时再打开聊天。支持自定义纸张与文字颜色，适合希望减少刺眼白底、按个人感受调整阅读显示的读者。

A local reader for close reading of papers, textbooks and PDF books. Connect your own API to ask in annotations and translate selected text beside the source, then open chat for deeper discussion. Customize paper and text colors to reduce bright white backgrounds and suit your reading preferences.

[查看功能截图与完整介绍 / Screenshots and overview](https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader#readme)

## 从 v0.1.21 以来的更新 / Changes since v0.1.21

- **记住聊天阅读位置**：每段对话独立保存，正常退出后恢复到上次段落或底部；切换对话、PDF 布局及窗口宽度时尽量保持阅读位置。
  **Resume chat reading**: each conversation remembers its paragraph or bottom position across normal restarts, conversation switches, PDF layout changes and window resizing.
- **更方便地切换 PDF 与聊天**：关闭 PDF 后可快速重新展开，也可直接回到专注阅读模式，保留页码和缩放。
  **Switch between PDF and chat**: quickly reopen a closed PDF or return directly to focused reading while retaining the page and zoom.
- **引用文字继续提问**：选择 PDF、AI 回答或聊天问题中的文字，预览后附在下一次提问中。
  **Quote text in chat**: select a passage in a PDF, AI answer or chat question, preview it and attach it to your next question.
- **批注在讨论时保持打开**：点击聊天、正文或翻页继续查看原文问答，用 × 或 Esc 收起。聊天中可主动选择已有批注继续讨论。
  **Keep annotations open while discussing**: consult source Q&A while interacting with chat or turning pages, then close with × or Esc. Explicitly select saved annotations as chat references.
- **修复公式显示和鼠标反馈**：修复聊天、批注和翻译中不等号等否定符号的斜线错位；光标按文字、按钮、空白和拖动操作切换。
  **Correct math and cursor feedback**: fix misplaced negation slashes in chat, annotation and translation formulas, with appropriate cursors for text, controls, whitespace and dragging.
- **更新双语首页介绍**：用四张真实客户端截图展示批注问答、引用批注、并排讨论及快速翻译；截图使用虚构文档和本地模拟回复。
  **Refresh the bilingual homepage**: four actual client screenshots show annotation Q&A, references, side-by-side discussion and quick translation, using a fictional document and local mock responses.

## 划词翻译 / Quick translation

选中单词或段落后，按默认 **Alt+1** 或右键翻译，在原文旁查看临时译文；可保留为普通批注。翻译 API、提示词和快捷键可独立设置，只发送选中文字和翻译提示词。

Select a word or passage and press **Alt+1** or right-click to translate beside the source. Optionally keep the result as a plain note. Configure the translation API, prompt and shortcut separately; only the selected text and translation prompt are sent.

## 下载与更新 / Download and update

下载 Windows x64 ZIP 并完整解压，正常退出旧版后运行新目录中的 `AI-Embedded-Paper-PDF-Reader.exe`。配置和阅读成果保存在本机；提问资料会发送给你自己配置的服务。阅读位置偏好不进入聊天备份，也不发送给 AI。

Download and fully extract the Windows x64 ZIP, exit the old app normally and run `AI-Embedded-Paper-PDF-Reader.exe` from the new folder. Settings and reading work stay local; question material is sent to your configured service. Reading-position preferences are excluded from conversation backups and model requests.

ZIP SHA-256:

```text
f082f7f8309243862269e89bbbc8ee0a432c3936d16dbaaa094ec79ba60bef88
```

应用验证：282 项自动检查、97 项既有界面检查、30 项聊天位置检查，以及真实 EXE 启动、保存和正常退出验证通过。首页截图另在当前客户端中实际操作并逐图审阅；客户端功能代码和已核对的 Windows ZIP 未因本次文档更新而修改。

Application validation: 282 automated tests, 97 existing UI checks, 30 chat-position checks and real EXE startup/save/normal-exit verification passed. Homepage screenshots were captured through actual client interactions and individually reviewed. This documentation update leaves the validated client code and Windows ZIP unchanged.
