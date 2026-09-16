/* warhammer-tech 本地校验脚本（纯 node，无外部依赖）
 * 运行：node tests/check.js  （或 npm run check）
 *
 * 覆盖：
 *   1. 数据健康：id 唯一、图谱无孤立点/悬空边、TECH 字段完整
 *   2. DOM 桩渲染冒烟：加载 data.js + app.js，遍历全部视图渲染无报错，
 *      并触发科技详情页、概念分类筛选的行为校验
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'assets', 'data.js');
const APP = path.join(ROOT, 'assets', 'app.js');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };

/* ---------- 1. 数据健康 ---------- */
console.log('== 数据健康 ==');
const ctx0 = { console };
vm.createContext(ctx0);
let DATA_OK = false;
try {
  vm.runInContext(fs.readFileSync(DATA, 'utf8'), ctx0);
  DATA_OK = true;
} catch (e) {
  console.log('  ✗ data.js 解析失败：' + e.message);
  process.exit(1);
}

const get = () => vm.runInContext('({FACTIONS,CONCEPTS,TECH,REFS,ERAS,GRAPH_NODES,GRAPH_LINKS})', ctx0);
const { FACTIONS, CONCEPTS, TECH, REFS, ERAS, GRAPH_NODES, GRAPH_LINKS } = get();

ok('factions=' + FACTIONS.length + ' concepts=' + CONCEPTS.length + ' tech=' + TECH.length + ' refs=' + REFS.length, DATA_OK);
const allIds = [...FACTIONS, ...CONCEPTS, ...TECH, ...REFS].map(x => x.id);
ok('实体 id 唯一', new Set(allIds).size === allIds.length);

const gn = new Set(GRAPH_NODES.map(n => n.id));
const linked = new Set(); GRAPH_LINKS.forEach(l => { linked.add(l.s); linked.add(l.t); });
ok('图谱无孤立点', GRAPH_NODES.filter(n => !linked.has(n.id)).length === 0);
ok('图谱无悬空边', GRAPH_LINKS.filter(l => !gn.has(l.s) || !gn.has(l.t)).length === 0);

const missing = TECH.filter(t => !t.detail.说明 || !t.detail.历史 || !t.detail.影响 || !t.detail.运作 || !Array.isArray(t.detail.关键词));
ok('TECH 字段齐全（说明/历史/影响/运作/关键词）', missing.length === 0);
const dupName = (() => {
  const names = {}; [FACTIONS, CONCEPTS, TECH, REFS].forEach(a => a.forEach(x => { names[x.name] = (names[x.name] || 0) + 1; }));
  return Object.entries(names).filter(([, n]) => n > 1).length;
})();
ok('跨类别无重名', dupName === 0);
ok('无 SEARCH_INDEX 死代码残留', !fs.readFileSync(DATA, 'utf8').includes('SEARCH_INDEX'));

/* ---------- DOM 桩（最小实现，掩盖全部 DOM API） ---------- */
console.log('== DOM 桩渲染冒烟 ==');
function FakeEl() {
  return {
    innerHTML: '', textContent: '', value: '', hidden: false, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(t, f) { this['on_' + t] = f; }, _click() { if (this.on_click) this.on_click(); },
    closest() { return null; }, appendChild() {}, removeChild() {}, setAttributeNS() {},
  };
}
const REQUIRED = ['#main', '#globalSearch', '#modal', '#modal-card', '#breadcrumb', '#file-no', '#crumb-view', '#themeToggle'];
const els = {};
const navs = ['home', 'factions', 'timeline', 'concepts', 'tech', 'graph', 'refs'].map(v => {
  const a = FakeEl(); a.dataset.view = v; return a;
});
const fbtns = ['全部', '核心', '帝国', '历史', '混沌', '人物', '组织', '地点', '物种', '事件', '圣物', '宇宙'].map(c => {
  const b = FakeEl(); b.dataset.concatfilter = c; return b;
});
const doc = {
  documentElement: { classList: { contains() { return false; }, toggle() {} } },
  querySelector(sel) { return REQUIRED.includes(sel) ? (els[sel] || (els[sel] = FakeEl())) : (els[sel] || null); },
  querySelectorAll(sel) {
    if (sel === '.nav-main a') return navs;
    if (sel.includes('data-concatfilter')) return fbtns;
    return [];
  },
  addEventListener(t, f) { this['_' + t] = f; }, removeEventListener() {},
  createElementNS() { return FakeEl(); },
};
const ctx = {
  document: doc, console,
  localStorage: { setItem() {}, getItem() { return null; } },
  matchMedia() { return { matches: false }; },
  requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
};
vm.createContext(ctx);
try {
  vm.runInContext(fs.readFileSync(DATA, 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(APP, 'utf8'), ctx);
  ok('data.js + app.js 在 DOM 桩中加载无报错', true);
} catch (e) {
  ok('data.js + app.js 在 DOM 桩中加载无报错', false);
  console.log('  错误：' + e.message);
  process.exit(1);
}

const main = els['#main'];
// 遍历各视图渲染不报错（graph 是 SVG，桩已掩盖 appendChild/createElementNS）
ok('初始 home 已渲染（长度>0）', main.innerHTML.length > 0);
const renderAll = !navs.filter(a => a.dataset.view !== 'tech').some(a => { try { a._click(); return false; } catch (e) { console.log('   视图 ' + a.dataset.view + ' 渲染报错：' + e.message); return true; } });
ok('home/factions/timeline/concepts/graph/refs 渲染无报错', renderAll);

/* ---------- 科技详情页行为 ---------- */
console.log('== 科技详情页 ==');
// 触发 techdetail：直接构造 tech 导航 + 卡片点击 → 用 data-techdetail 委托模拟
navs.find(a => a.dataset.view === 'tech')._click();
const techBtn = FakeEl(); techBtn.dataset.techdetail = 'bolter'; techBtn.closest = s => (s === '[data-techdetail]' ? techBtn : null);
if (doc._click) doc._click({ target: techBtn }); // 触发文档委托
const techHtml = main.innerHTML;
ok('科技详情页含「历史」区段', techHtml.includes('<h3 class="detail-h">历史</h3>'));
ok('科技详情页含「影响」区段', techHtml.includes('<h3 class="detail-h">影响</h3>'));
ok('科技详情页含「运作」区段', techHtml.includes('<h3 class="detail-h">运作</h3>'));
ok('科技详情页含「蓝图介绍」区段', techHtml.includes('蓝图介绍'));

/* ---------- 概念分类筛选行为 ---------- */
console.log('== 概念分类筛选 ==');
navs.find(a => a.dataset.view === 'concepts')._click();
function cardCats() { const h = main.innerHTML; return [...h.matchAll(/ctag">\s*([^<]+?)\s*<\/span>/g)].map(m => m[1]); }
const allCats = new Set(cardCats());
ok('概念页含分类筛选条', main.innerHTML.includes('data-concatfilter'));
ok('概念页初始渲染出卡片且分类多元（>' + allCats.size + ' 类）', allCats.size > 1);
const personBtn = fbtns.find(b => b.dataset.concatfilter === '人物');
if (personBtn) { personBtn._click(); }
const personCats = cardCats();
ok('点「人物」后全部卡片为人物', personCats.length > 0 && personCats.every(c => c === '人物'));
fbtns.find(b => b.dataset.concatfilter === '全部')._click();
ok('点「全部」后分类恢复多元', new Set(cardCats()).size > 1);

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
