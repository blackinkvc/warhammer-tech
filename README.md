# 战锤 40K 世界观科普档案库

🔗 **在线访问：https://blackinkvc.github.io/warhammer-tech/**

一个以「羊皮纸 · 墨字 · 暗金」卷宗风呈现的 Warhammer 40,000 世界观科普单页站点。纯静态、无构建、无外部依赖，开箱即用。

> 非官方粉丝向科普索引。所有世界观设定、派系与科技名称之著作权均归属 Games Workshop，本库仅作学习与检索用途。

## 特性

- **派系名录**：人类帝国、混沌、异形等势力，含「子势力层级」（审判庭、战斗修女等作为人类帝国下属分支呈现）。
- **核心概念**：基因原体、大裂隙、不屈远征等术语卡片。
- **历史时间轴**：从科技黑暗时代到第 41 千年的纪元脉络。
- **科技图鉴**：149 条科技条目，按 **帝国 / 异形 / 远古 / 混沌** 四类着色，支持分类筛选与详情弹窗。
- **关系拓扑图**：自写力导向关系图（无 D3），支持拖拽、悬停高亮与「按关联类型着色」开关。
- **全域检索**：顶部搜索框跨 派系 / 概念 / 科技 / 参考 聚合结果，按类别折叠（手风琴）。

## 技术

- 纯 HTML / CSS / 原生 JavaScript，单页应用（SPA）。
- 数据集中在 `assets/data.js`，逻辑在 `assets/app.js`，样式在 `assets/style.css`。
- 关系图为手写力导向仿真，不依赖任何图表库。

## 目录结构

```
index.html            # 站点入口
assets/
  data.js             # 全部数据（派系/概念/纪元/科技/参考）
  app.js              # 视图渲染、关系图、搜索逻辑
  style.css           # 卷宗视觉体系
```

## 本地预览

直接用浏览器打开 `index.html` 即可；或起一个本地静态服务：

```bash
python3 -m http.server 8000
# 然后访问 http://localhost:8000
```

## 部署（GitHub Pages）

本仓库通过 GitHub Pages 发布。将代码推送到 `main` 分支后，在仓库
**Settings → Pages** 中设置 Source 为 `Deploy from a branch`、Branch 选 `main`、文件夹 `/root`，
保存后约一分钟内即可通过 `https://<用户名>.github.io/warhammer-tech/` 访问。

## 许可声明

本站为个人学习与非商业科普用途制作，与 Games Workshop 无任何隶属关系。
