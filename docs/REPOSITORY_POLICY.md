# 源码提交范围

此仓库用于项目版本管理。只提交经过检查的源代码和项目文档。

## 允许提交

- 客户端、服务、桌面入口和构建脚本。
- 依赖清单与锁文件、编译配置和通用启动脚本。
- 单元测试与测试代码内明确的虚构数据。
- 产品的铅笔图标与启动品牌资源。
- 项目总纲、待办、使用说明及发布说明。
- 项目许可证、第三方组件说明、隐私说明与公开检查范围。
- 密钥字段为空的 `.env.example` 模板。

## 保留在本机

- 实际聊天、批注、个人文档和文件提取内容。
- API 密钥、真实环境配置和个人模型配置，包括加密后的凭证文件。
- 浏览器及桌面用户数据、数据库、阅读偏好和阅读位置。
- 运行日志、诊断输出、聊天备份、论文和阅读截图。
- 安装依赖、构建产物、EXE、ZIP 和临时工作目录。

通过审查的通用 Windows ZIP 和校验文件可作为 GitHub Release 附件公开分发；它们不提交到 Git 文件历史，且不得夹带运行后生成的用户数据。

桌面个人数据位于应用自己的用户数据目录，和源码分开。上传工具不读取该目录。

## 提交检查

1. 根目录 `.gitignore` 只开放已知源码和文档位置。
2. `node tools/source-audit.mjs` 从明确的文件范围生成清单，检查路径、扩展名和内容。
3. 检查真实密钥特征、非空凭证字面量、私有文件路径和意外的个人数据文件。
4. 测试中的虚构凭证只用于验证协议与脱敏，不是可用密钥。
5. 发布时对照允许清单检查整个远端文件树及文件哈希，确认无额外文件。

忽略规则只控制文件范围，不能代替内容检查。后续新增源码文件也需执行同样的检查。

## English summary

Publish only reviewed source, tests, manifests, generic branding and documentation. Exclude personal conversations, API keys/configuration, runtime databases, logs, backups, PDFs and screenshots. Use the explicit source-audit manifest and review changes before publication. Never package an existing personal profile. The canonical source URL is now https://github.com/Eatastar/AI-Embedded-Paper-PDF-Reader. The former Learn-Something URL redirects to it. Preserve MIT and third-party notices, document GPT implementation credits accurately, and request upstream links from derivatives without adding license restrictions.
