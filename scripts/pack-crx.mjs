// 用固定私钥把 dist/ 打包为 crx3 + 生成本地 update.xml
// 产物 ID 由 key.pem 的公钥决定，与 manifest.json 的 key 字段一致（稳定扩展 ID）
import crx3 from 'crx3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distManifest = path.join(root, 'dist', 'manifest.json');
const keyPath = path.join(root, 'key.pem');
const crxPath = path.join(root, 'gdownload.crx');
const xmlPath = path.join(root, 'update.xml');

if (!fs.existsSync(distManifest)) {
  console.error('[pack-crx] dist/manifest.json 不存在，请先 `npm run build:chrome`');
  process.exit(1);
}
if (!fs.existsSync(keyPath)) {
  console.error('[pack-crx] key.pem 不存在（打包私钥，属发版机密，需离线保管/CI 注入）');
  process.exit(1);
}

// update.xml 的 codebase：本地策略静默安装用的 crx 路径。
// 安装器（NSIS）会把它重写为实际安装目录；此处用可被替换的占位默认值。
const crxURL = process.env.CRX_URL || 'file:///%GDOWNLOAD_DIR%/resources/extension/gdownload.crx';

crx3([distManifest], { keyPath, crxPath, xmlPath, crxURL })
  .then(() => {
    console.log('[pack-crx] ✓ 生成 gdownload.crx');
    console.log('[pack-crx] ✓ 生成 update.xml（codebase: ' + crxURL + '）');
  })
  .catch((err) => {
    console.error('[pack-crx] 失败:', err);
    process.exit(1);
  });
