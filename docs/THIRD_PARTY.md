# 第三方组件 / Third-party components

项目自身代码按根目录 MIT 许可证开放。第三方代码、字体、图标和运行时仍遵循各自许可证；项目的 MIT 许可不替代它们的版权与许可声明。

以下是当前直接运行依赖的锁定版本及包内许可证标识。

| 组件 | 版本 | 许可证 |
| --- | --- | --- |
| @ai-sdk/openai-compatible | 3.0.71 | Apache-2.0 |
| @assistant-ui/react | 0.15.29 | MIT |
| @noble/hashes | 2.4.0 | MIT |
| @recogito/text-annotator | 4.3.7 | BSD-3-Clause |
| @streamdown/math | 1.0.3 | Apache-2.0 |
| ai | 7.0.143 | Apache-2.0 |
| dexie | 4.4.6 | Apache-2.0 |
| katex | 0.16.47 | MIT |
| lucide-react | 1.59.0 | ISC |
| pdfjs-dist | 6.4.299 | Apache-2.0 |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| streamdown | 2.7.0 | Apache-2.0 |

Windows 包另含 Electron 44.9.0、Chromium 及其他运行组件。发行目录保留 `LICENSE.electron.txt`、`LICENSES.chromium.html` 和 `THIRD-PARTY-NOTICES.txt`；应用归档内也保留第三方声明。PDF.js 的离线资源与其许可证一同分发。

v0.1.33 移除没有被运行代码使用的 `@annotorious/react` 和 `@recogito/react-text-annotator` 封装，继续使用底层文字批注库。历史发行包中的第三方版权与许可声明继续适用。

v0.1.33 removes the unused `@annotorious/react` and `@recogito/react-text-annotator` wrappers while retaining the underlying text annotation library. Third-party notices in historical releases remain applicable.

`pnpm-lock.yaml` 固定了直接及间接依赖。构建脚本从已安装的包复制许可证、NOTICE 和 COPYING 文本到第三方声明中；修改依赖后，应重新生成并核对声明。

Original project code uses the root MIT license. Third-party code, fonts, icons and runtimes retain their own copyrights and licenses; the project license does not replace them. The table above lists pinned direct runtime dependencies and their package license identifiers. Windows packages retain Electron/Chromium license files and generated THIRD-PARTY-NOTICES.txt. The builder copies installed LICENSE, NOTICE and COPYING texts; review and regenerate notices when dependencies change. The GPT implementation credit applies only to original application code.

## 电子书解析 / Ebook parsers

仅打包 [Foliate-js](https://github.com/johnfactotum/foliate-js) 的 `epub.js`、`mobi.js`、`epubcfi.js` 及其 `vendor/zip.js`、`vendor/fflate.js`，固定在提交 `78914aef4466eb960965702401634c2cb348e9b1`。保留 Foliate-js 的 MIT 许可证，并附上 zip.js 的 BSD-3-Clause 和 fflate 的 MIT 完整许可文本，来源、实际 SHA-256 和本地改动记录在 `outputs/client/vendor/foliate-js/ORIGIN.json`。不打包 Foliate 的应用界面、阅读视图或 PDF 引擎。

Only the EPUB/MOBI/CFI parsers and their ZIP/inflation modules from Foliate-js are vendored at the commit above. Preserve its MIT license and include the full zip.js BSD-3-Clause and fflate MIT license texts. ORIGIN.json records provenance, actual file hashes and local patches. The Foliate application UI, view and PDF engine are not included.

本地 `mobi.js` 改动：为 MOBI6/KF8 增加章节资源卸载及缓存清理；限制解压文字、字典递归、索引/标签范围、字体缓冲和原始文字偏移；检查组合书的 DRM，按记录批次让出界面，提供图像与资源预算检查回调。构建时核对哈希，Windows 包的第三方声明中保留上游许可证。第三方作者仍拥有这些模块的版权，GPT 实现声明不覆盖它们。

Local mobi.js patches add MOBI6/KF8 resource unloading/cache clearing, bounds for text expansion, dictionary recursion, index/tag data, font buffers and raw-text offsets, combo-book DRM checks, batch yielding and resource-validation hooks. Builds verify recorded hashes; Windows third-party notices retain the upstream license. These modules remain third-party work and are excluded from the original-code GPT credit.
