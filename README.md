# learn something

支持自定义 AI API 的学习与阅读工具。在 AI 回答或 PDF 文字中划选一段，就地询问 AI 或添加普通批注；收起后保留高亮，再次点击即可打开。

当前客户端版本为 **0.1.9**，新增共享完整上下文快照、按记录增量保存、紧凑备份和旧记录安全升级；保留批注重新提问、回收站永久删除、可靠退出及 PDF 阅读配色。

## 当前能力

- 主聊天与回答版本切换；旧批注保留在原回答版本。
- 原文高亮、可拖动批注框、一处高亮一组可替换的当前问答与普通笔记。
- PDF、TXT、Markdown 本机导入；PDF 原排版划选、翻页和缩放。
- 原色、暖黄、浅灰、深色及自定义纸张和文字颜色，不改写原文件。
- 阅读位置记忆、对话删除恢复、完整聊天备份与追加导入。
- 多模型预载，支持 Chat Completions、Responses 和 Claude Messages。
- Windows x64 免安装桌面包及系统代理接入。
- 完整上下文去重、变化记录事务保存、升级前兼容备份与可选范围导出。

扫描页当前只提供查看和换色，不含 OCR。连续滚动、目录、全文搜索等见 [改进清单](docs/ROADMAP.md)。

## 目录

| 路径 | 用途 |
| --- | --- |
| `outputs/client/` | 客户端源码、服务、桌面入口和测试 |
| `outputs/windows/开始使用.txt` | 随桌面包分发的使用说明 |
| `docs/PROJECT.md` | 项目总纲与模块职责 |
| `docs/ROADMAP.md` | 按优先级整理的改进清单 |
| `docs/CHANGELOG.md` | 当前基准版及验证范围 |
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

首次运行是本地演示模式。通过“模型与设置”填写自己的连接后使用；仓库中的 `.env.example` 只有公开接口示例和空白密钥字段。

## 提交范围

这里只保存源码、依赖清单、测试、通用品牌资源和项目文档。聊天数据库、个人模型配置、真实 API 密钥、日志、聊天备份、个人论文及阅读截图均留在本机。

提交前运行：

```sh
node tools/source-audit.mjs
```

运行结果写入被忽略的 `work/`，不会写入个人数据目录。
