# 第三方组件

项目自身代码按根目录 MIT 许可证开放。第三方代码、字体、图标和运行时仍遵循各自许可证；项目的 MIT 许可不替代它们的版权与许可声明。

以下是当前直接运行依赖的锁定版本及包内许可证标识。

| 组件 | 版本 | 许可证 |
| --- | --- | --- |
| @ai-sdk/openai-compatible | 3.0.71 | Apache-2.0 |
| @annotorious/react | 3.9.4 | BSD-3-Clause |
| @assistant-ui/react | 0.15.29 | MIT |
| @noble/hashes | 2.4.0 | MIT |
| @recogito/react-text-annotator | 4.3.7 | BSD-3-Clause |
| @recogito/text-annotator | 4.3.7 | BSD-3-Clause |
| @streamdown/math | 1.0.3 | Apache-2.0 |
| ai | 7.0.143 | Apache-2.0 |
| dexie | 4.4.6 | Apache-2.0 |
| katex | 0.19.0 | MIT |
| lucide-react | 1.59.0 | ISC |
| pdfjs-dist | 6.4.299 | Apache-2.0 |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| streamdown | 2.7.0 | Apache-2.0 |

Windows 包另含 Electron 44.9.0、Chromium 及其他运行组件。发行目录保留 `LICENSE.electron.txt`、`LICENSES.chromium.html` 和 `THIRD-PARTY-NOTICES.txt`；应用归档内也保留第三方声明。PDF.js 的离线资源与其许可证一同分发。

`pnpm-lock.yaml` 固定了直接及间接依赖。构建脚本从已安装的包复制许可证、NOTICE 和 COPYING 文本到第三方声明中；修改依赖后，应重新生成并核对声明。
