// install.js — npm postinstall entry point.
// Thin shim; the real dispatcher lives in install/main.js.
// Kept at the root because npm's postinstall convention expects it here.
import('./install/main.js').then((m) => m.main()).catch((err) => {
  process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
  process.exit(1);
});