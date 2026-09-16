// 工具：从 assets/data.js 的 CHANGELOG 一键生成仓库根 CHANGELOG.md（同源同步）
// 用法：node tools/gen-changelog-md.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const dataSrc = fs.readFileSync(path.join(ROOT, 'assets', 'data.js'), 'utf8');

// VM 求值整份 data.js，再取 CHANGELOG（顺带验证 data.js 语法与依赖完整性）
const ctx = { console };
vm.createContext(ctx);
let CHANGELOG;
try {
  const result = vm.runInContext(dataSrc + '\n;({ CHANGELOG })', ctx);
  CHANGELOG = result.CHANGELOG;
} catch (e) {
  console.error('data.js 求值失败:', e.message);
  process.exit(1);
}
if (!Array.isArray(CHANGELOG)) {
  console.error('未找到 CHANGELOG 数组');
  process.exit(1);
}

const lines = [];
lines.push('# 站务日志 · CHANGELOG');
lines.push('');
lines.push('> 记录本项目自建站以来的每次版本迭代。**最新在前**。站内亦提供同名「站务日志」视图呈现（`index.html` → 导航「日志」），二者同源同步。');
lines.push('>');
lines.push('> 资源版本号规约：`assets/{data,app,style}.js` 与 `favicon.svg` 通过 `index.html` 的 `?v=` 刷新缓存，每次发布升一位，即为日志版本号。');
lines.push('');
lines.push('---');
lines.push('');

CHANGELOG.forEach((log) => {
  const ai = log.ai || '—';
  lines.push(`## v${log.version} · ${log.title}（${log.date} · ${ai}）`);
  lines.push('');
  if (log.note) lines.push(`简介：${log.note}`);
  lines.push('');
  (log.points || []).forEach((p) => lines.push(`- ${p}`));
  lines.push('');
  lines.push('---');
  lines.push('');
});

fs.writeFileSync(path.join(ROOT, 'CHANGELOG.md'), lines.join('\n'), 'utf8');
console.log('已生成 CHANGELOG.md：' + CHANGELOG.length + ' 条，版本：' + CHANGELOG.map(x => x.version).join(' '));
