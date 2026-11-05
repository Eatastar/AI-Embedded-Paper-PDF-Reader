# learn something

以本地 PDF 阅读为主、AI 对话为辅助的学习工具。在 AI 回答或 PDF 文字中划选一段，就地询问 AI 或添加普通批注；收起后保留高亮，再次点击即可打开。

首个公开正式版为 **v0.1.11**，应用构建 **20261105.10**，项目代码使用 **MIT** 许可证。

[下载 Windows x64 完整包](https://github.com/Eatastar/Learn-Something/releases/tag/v0.1.11) · [隐私与联网说明](docs/PRIVACY.md) · [版本记录](docs/CHANGELOG.md) · [开源前检查范围](docs/OPEN_SOURCE_RELEASE.md)

## 开始使用

1. 下载 Release 中的完整 ZIP，全部解压后运行 `LearnSomething.exe`，不要只复制一个 EXE。
2. 在默认阅读首页选择本地 PDF。可调整纸张和文字颜色，连续阅读、搜索并添加普通笔记。
3. 需要 AI 时，从“模型与设置”添加自己的服务地址、模型名和密钥。支持 Kimi、千问、Gemini 兼容入口、Grok、Ollama、LM Studio 及自定义兼容服务。

普通阅读和笔记不调用 AI。发送问题时会向所选服务发送完整有效对话及该对话所有附件的提取文字，详见隐私说明。Windows 桌面版沿用系统代理；程序不附带代理节点或模型密钥。

## 当前能力

- 主聊天与回答版本切换；旧批注保留在原回答版本。
- 原文高亮、可拖动批注框、一处高亮一组可替换的当前问答与普通笔记。
- PDF、TXT、Markdown 本机导入；PDF 原排版划选、分页或连续阅读、手势缩放。
- 按需打开文档导航：目录跳转、全文搜索、按页码/类型/内容筛选批注并返回原句。
- 原色、暖黄、浅灰、深色及自定义纸张和文字颜色，不改写原文件。
- 阅读位置记忆、对话删除恢复、完整聊天备份与追加导入。
- 多模型预载，支持 Chat Completions、Responses 和 Claude Messages。
- Windows x64 免安装桌面包及系统代理接入。
- 完整上下文去重、变化记录事务保存、升级前兼容备份与可选范围导出。

扫描页当前只提供查看和换色，不含 OCR；搜索依据本机提取文字，PDF 目录取决于文件是否内嵌。后续工作见 [改进清单](docs/ROADMAP.md)。

## 目录

| 路径 | 用途 |
| --- | --- |
| `outputs/client/` | 客户端源码、服务、桌面入口和测试 |
| `outputs/windows/开始使用.txt` | 随桌面包分发的使用说明 |
| `docs/PROJECT.md` | 项目总纲与模块职责 |
| `docs/ROADMAP.md` | 按优先级整理的改进清单 |
| `docs/CHANGELOG.md` | 当前基准版及验证范围 |
| `docs/PRIVACY.md` | 本地数据、模型请求和代理边界 |
| `docs/THIRD_PARTY.md` | 第三方组件及其许可 |
| `LICENSE` | 项目自身代码的 MIT 许可证 |
| `docs/REPOSITORY_POLICY.md` | 源码提交范围和个人数据排除规则 |
| `tools/source-audit.mjs` | 生成并检查允许提交的文件清单 |

保留现有目录结构，确保桌面构建脚本的资源和输出路径一致。`work/`、程序包、安装依赖和运行数据均在本机生成。

## 开发与验证

需要 Node.js 22.12 或更新版本，以及 pnpm。

```sh
pnpm --dir outputs/client install --frozen-lockfile
pnpm --dir outputs/client test
pnpm --dir outputs/client build
pnpm --dir outputs/client dev
```

构建 Windows 桌面版：

```sh
pnpm --dir outputs/client build:desktop
```

输出到 `outputs/windows/`。PDF.js 的离线字体和解码资源由构建前步骤从锁定依赖复制，无需将生成资源提交到仓库。

## 许可证

项目自身代码见 [MIT 许可证](LICENSE)，第三方组件的版权与许可证继续保留，见[第三方组件说明](docs/THIRD_PARTY.md)。Windows 包同时保留 Electron、Chromium 和依赖组件的许可文件。

首次运行是本地演示模式。通过“模型与设置”填写自己的连接后使用；仓库中的 `.env.example` 只有公开接口示例和空白密钥字段。

## 提交范围

这里只保存源码、依赖清单、测试、通用品牌资源和项目文档。聊天数据库、个人模型配置、真实 API 密钥、日志、聊天备份、个人论文及阅读截图均留在本机。

提交前运行：

```sh
node tools/source-audit.mjs
```

运行结果写入被忽略的 `work/`，不会写入个人数据目录。
