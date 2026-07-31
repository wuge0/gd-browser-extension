# 打包与本地分发（不上架商店）

GDownload 浏览器扩展采用**本地分发**：不上架应用商店，随桌面端安装包内置，
由固定私钥打包得到**稳定扩展 ID**，配合策略静默安装 / 引导安装。

## 固定扩展 ID

- **Chrome/Edge ID**：`kllgnmkbgmlefbmliedjnfffbifelcmb`
  （由 `key.pem` 的公钥经 SHA-256 前 16 字节映射 a–p 得到；公钥已写入 `manifest.json` 的 `key` 字段，
  因此**打包与开发态加载**的 ID 一致）
- **Firefox ID**：`gdownload@wuge0.github.io`（`manifest.json` 的 `browser_specific_settings.gecko.id`）

> 该 ID 由打包私钥决定。若更换私钥，需同步更新 `manifest.json` 的 `key` 字段与本文件、
> 以及桌面端 host manifest 的 `allowed_origins` / 策略安装脚本中的 ID。

## 私钥管理（发版机密）

- `key.pem`：crx3 打包私钥，**属发版机密，已 gitignore，绝不提交仓库**。
  离线保管、纳入发版机密、CI 从机密注入。
- `manifest.json` 的 `key` 字段是**公钥**（base64 DER），可安全提交——它固定开发态 ID。
- 轮换流程：重新 `openssl genrsa -out key.pem 2048` → 导出公钥 DER base64 更新 `manifest.json` 的 `key`
  → 重算 ID 更新本文件与桌面端引用。

## 打包命令

### Chrome / Edge（crx3 + update.xml）

```sh
npm run package:crx
```

产出（均 gitignore）：
- `gdownload.crx`：用 `key.pem` 签名的 crx3 包。
- `update.xml`：本地 update manifest，`codebase` 默认是占位 `file:///%GDOWNLOAD_DIR%/...`，
  由安装器（NSIS）重写为实际安装目录。可用 `CRX_URL` 环境变量覆盖：
  ```sh
  CRX_URL="file:///D:/GDownload/resources/extension/gdownload.crx" npm run package:crx
  ```

策略静默安装时，浏览器策略 `ExtensionInstallForcelist` 指向该 `update.xml`，
按 `appid` + `codebase` 拉取并强制安装 crx（详见桌面端 T2.2b）。

### Firefox（AMO 自托管签名，不公开上架）

```sh
# 需 AMO API 凭据（发版机密），走 unlisted 自托管渠道：
WEB_EXT_API_KEY=<key> WEB_EXT_API_SECRET=<secret> npm run package:firefox-sign
```

产出 signed `.xpi`（unlisted，不公开上架），供策略 `ExtensionSettings`
（`installation_mode: force_installed`）本地安装。凭据从 https://addons.mozilla.org 开发者中心获取。

## 分发物料清单（随桌面端安装包）

打包后落地到桌面端安装目录 `resources/extension/`：
- `gdownload.crx`（Chrome/Edge）
- `update.xml`（codebase 已重写为实际路径）
- signed `.xpi`（Firefox）
- 三家 host manifest（含固定扩展 ID 的 `allowed_origins`/`allowed_extensions`）

> host manifest 模板见桌面端 `src/Tools/NativeHost/com.gdownload.host.*.template.json`，
> 其 `@CHROME_EXTENSION_ID@` 填 `kllgnmkbgmlefbmliedjnfffbifelcmb`、
> `@FIREFOX_EXTENSION_ID@` 填 `gdownload@wuge0.github.io`。
