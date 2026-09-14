/* ============================================================
   战锤知识档案库 · 应用逻辑（纯静态 SPA，无外部依赖）
   ============================================================ */
(function(){
  'use strict';

  const $ = (s,el=document)=>el.querySelector(s);
  const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
  const main = $('#main');
  const modal = $('#modal');
  const modalCard = $('#modal-card');

  const byId = (arr)=>Object.fromEntries(arr.map(x=>[x.id,x]));
  const F = byId(FACTIONS), C = byId(CONCEPTS), R = byId(REFS), T = byId(TECH);

  /* ---------- 实体链接：把文本里的派系/概念/科技/参考名标为可点击 ---------- */
  function buildEntityMap(){
    const map = new Map();
    const add = (name, type, id, priority=0)=>{
      if(!name) return;
      const key = String(name).trim();
      if(!key) return;
      const ex = map.get(key);
      if(!ex || priority > ex.priority) map.set(key, {type, id, priority});
    };
    // 名字最高优先级
    Object.values(F).forEach(f=>{ add(f.name,'faction',f.id,2); add(f.en,'faction',f.id,2); });
    Object.values(C).forEach(c=>{ add(c.name,'concept',c.id,2); add(c.en,'concept',c.id,2); });
    Object.values(T).forEach(t=>{ add(t.name,'tech',t.id,2); add(t.en,'tech',t.id,2); });
    Object.values(R).forEach(r=>{ add(r.name,'ref',r.id,2); add(r.en,'ref',r.id,2); });
    // 关键词次之
    // 只把「条目名/英文名」和明确「别名」设为可点击；关键词只做展示，
    // 不再自动链接，避免“世界/改造/造物/吞噬/现实”等普通词牵强成链。
    ALIASES.forEach(([name,type,id])=> add(name,type,id,3));
    return map;
  }
  // 简称/异称 → 对应实体：散文里常用的专有名词短称才需要指向
  const ALIASES = [
    ['灵族','faction','eldar'],
    ['古老者','faction','oldones'],
    ['死灵族','faction','necrons'],
    ['混沌','faction','chaos'],
    ['泰伦','faction','tyranids'],
    ['灵能造物','concept','psyker'],
    ['色孽','concept','chaos-gods'],
    ['恐虐','concept','chaos-gods'],
    ['奸奇','concept','chaos-gods'],
    ['纳垢','concept','chaos-gods'],
    ['欧克','faction','orks'],
    ['恐惧之眼','concept','eyeofterror'],
    ['卡迪亚陷落','concept','cadia'],
    ['阿巴顿','faction','chaos'],
  ];
  const entityMap = buildEntityMap();
  const entityKeys = [...entityMap.keys()].sort((a,b)=>b.length-a.length);
  const entityRegex = entityKeys.length
    ? new RegExp(entityKeys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'), 'g')
    : null;
  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function linkEntities(text){
    if(!text || !entityRegex) return text;
    return String(text).split(/(<[^>]+>)/g).map((part,i)=>{
      if(i%2===1 || part.startsWith('<')) return part;
      return part.replace(entityRegex, (m)=>{
        const e = entityMap.get(m);
        return `<span class="entity-link" data-open="${e.type}" data-id="${e.id}">${m}</span>`;
      });
    }).join('');
  }
  function richText(text){ return linkEntities(escapeHtml(text)); }

  const COLOR = {host:'#b5462f', kin:'#9b7cc0', serve:'#8B6914', ally:'#4a7c6f'};
  const REL_TXT = {host:'敌对', kin:'渊源', serve:'统属', ally:'同盟'};
  // 层级：子势力沿用父级阵营归类
  const effGroup = (f)=> f.parent ? F[f.parent].group : f.group;
  const isSub = (f)=> !!f.parent;

  let currentView = 'home';
  let factionFilter = '全部';
  let techCat = '全部';
  let searchQ = '';
  let graphRAF = null;

  /* ---------------- 视图切换 ---------------- */
  function setView(v){
    currentView = v;
    if(v!=='search') searchQ = '';
    $('#globalSearch').value = (v==='search') ? searchQ : '';
    $$('.nav-main a').forEach(a=>a.classList.toggle('active', a.dataset.view===v));
    const meta = {
      home:['INDEX-000','世界观总览'],
      factions:['FAC-INDEX','派系名录'],
      timeline:['TL-INDEX','历史时间轴'],
      concepts:['CON-INDEX','核心概念'],
      tech:['TEC-INDEX','科技图鉴'],
      search:['SCH-INDEX','全域检索'],
      graph:['GRAPH-001','关系拓扑图'],
      refs:['REF-INDEX','参考资料']
    }[v];
    $('#file-no').textContent = meta[0];
    $('#crumb-view').textContent = meta[1];
    if(graphRAF){ cancelAnimationFrame(graphRAF); graphRAF=null; }
    render();
  }

  /* ---------------- 渲染入口 ---------------- */
  function render(){
    let html='';
    if(currentView==='home') html = renderHome();
    else if(currentView==='factions') html = renderFactions();
    else if(currentView==='timeline') html = renderTimeline();
    else if(currentView==='concepts') html = renderConcepts();
    else if(currentView==='tech') html = renderTech();
    else if(currentView==='search') html = renderSearch();
    else if(currentView==='graph') html = renderGraph();
    else if(currentView==='refs') html = renderRefs();
    main.innerHTML = '<section class="view">'+html+'</section>';
    bindView();
  }

  /* ---------------- 首页（图文长卷） ---------------- */
  function renderHome(){
    const topFactions = FACTIONS.filter(f=>!f.parent);
    const subFactions = FACTIONS.filter(isSub);
    const totalFactions = topFactions.length;
    const totalConcepts = CONCEPTS.length;
    const totalEvents = ERAS.reduce((s,e)=>s+e.events.length,0);
    const totalRefs = REFS.length;
    const cats = {};
    topFactions.forEach(f=>cats[f.group]=(cats[f.group]||0)+1);

    const ORN = {
      aquila:`<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M32 12 V42"/><path d="M32 20 C20 13 9 17 7 29 C17 25 25 27 32 31"/><path d="M32 20 C44 13 55 17 57 29 C47 25 39 27 32 31"/><path d="M32 42 l-6 13 M32 42 l6 13"/><circle cx="32" cy="11" r="3.4" fill="currentColor"/></g></svg>`,
      eye:`<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.4"><path d="M8 32 Q32 12 56 32 Q32 52 8 32 Z"/><circle cx="32" cy="32" r="9" fill="currentColor"/><circle cx="32" cy="32" r="3.2" fill="#F6F2E7"/></g></svg>`,
      bolt:`<svg viewBox="0 0 64 64"><path d="M37 6 L17 37 L29 37 L25 58 L47 25 L34 25 Z" fill="currentColor"/></svg>`,
      compass:`<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="32" cy="32" r="22"/><path d="M32 13 L38 32 L32 51 L26 32 Z" fill="currentColor"/><path d="M13 32 L32 26 L51 32 L32 38 Z" fill="currentColor" opacity=".45"/></g></svg>`,
      scroll:`<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.4"><rect x="14" y="14" width="36" height="36" rx="3"/><path d="M22 26 H42 M22 34 H42 M22 42 H36"/></g></svg>`
    };

    const factionChips = topFactions.map(f=>
      `<span class="mini-chip" data-jump="factions"><span class="dot" style="background:${f.color}"></span>${f.name}</span>`
    ).join('');
    const conceptChips = CONCEPTS.map(c=>
      `<span class="mini-chip" data-jump="concepts"><span class="dot" style="background:${c.color}"></span>${c.name}</span>`
    ).join('');
    const eraTease = ERAS.map(e=>
      `<div class="et" data-jump="timeline"><span class="ys">${e.span}</span><span><span class="nm">${e.name}</span><br><span class="sp">${e.events.length} 个纪元节点</span></span></div>`
    ).join('');

    return `
    <div class="home-scroll">
      <div class="prose hero">
        <div class="hero-orn">${ORN.aquila}</div>
        <h2>人类帝国与银河诸族</h2>
        <p class="lead">第 41 千年 · 战锤 40K 世界观科普长卷</p>
        <p>${richText('在遥远的未来，唯有战争。人类帝国在僵化的神权官僚下苟延残喘，而四周环伺着混沌、异形与吞噬星河的虫潮。')}</p>
        <p>${richText('本档案以帝国圣典之体例，收纳派系、纪元、概念与关系拓扑，俾使后来者得以一窥这黑暗而壮丽的银河图景。')}</p>
        <div class="callout">「帝皇庇佑。本库为非官方科普索引，所有世界观设定归属 Games Workshop。数据截至 M41.999 修订版。」</div>
      </div>

      <section class="scroll-sec">
        <div class="scroll-sec-head"><span class="scroll-num">壹</span><h2>世界观概述</h2></div>
        <div class="scroll-body">
          <div class="txt">
            <p class="dropcap">${richText('银河广袤无垠，却无一处安宁。人类曾凭「科技黑暗时代」的伟力傲视群星，却因铁人叛乱与亚空间风暴跌落凡尘。当帝皇自泰拉崛起，以基因原体与星际战士重燃大一统的烽火时，谁也未曾料到，最大的裂痕竟来自最信任的继承人。')}</p>
            <p>${richText('今日的银河，是人类帝国、混沌、诸多异形文明与吞噬星海的虫潮彼此绞杀的修罗场。信仰、灵能与钢铁在此交汇，而时间，永远是帝国最稀缺的奢侈品。')}</p>
          </div>
          <div class="orn">${ORN.aquila}</div>
        </div>
      </section>

      <section class="scroll-sec">
        <div class="scroll-sec-head"><span class="scroll-num">贰</span><h2>银河格局</h2></div>
        <div class="scroll-body">
          <div class="txt">
            <p>${richText('以下为档案收录的主要势力。点击任一色标可直达派系名录；派系页可按「阵营」筛选帝国、混沌与异形诸族。')}</p>
            <div class="mini-chips">${factionChips}</div>
          </div>
          <div class="orn">${ORN.bolt}</div>
        </div>
      </section>

      <section class="scroll-sec">
        <div class="scroll-sec-head"><span class="scroll-num">叁</span><h2>时间长河</h2></div>
        <div class="scroll-body">
          <div class="txt">
            <p>${richText('自「战争之神代」的远古余烬，到大远征的辉煌、荷鲁斯叛乱的转折，再到大裂隙撕裂银河——历史从未真正远去。')}</p>
            <div class="era-tease">${eraTease}</div>
          </div>
          <div class="orn">${ORN.compass}</div>
        </div>
      </section>

      <section class="scroll-sec">
        <div class="scroll-sec-head"><span class="scroll-num">肆</span><h2>核心概念</h2></div>
        <div class="scroll-body">
          <div class="txt">
            <p>${richText('理解世界观的关键词：帝皇、亚空间、灵能、星语、阿斯塔特、混沌四神、网道……点击进入概念名录。')}</p>
            <div class="mini-chips">${conceptChips}</div>
          </div>
          <div class="orn">${ORN.eye}</div>
        </div>
      </section>

      <section class="scroll-sec">
        <div class="scroll-sec-head"><span class="scroll-num">伍</span><h2>档案总览</h2></div>
        <div class="scroll-body" style="display:block">
          <div class="stats-line">档案规模 · ${totalFactions} 主要势力 · ${subFactions.length} 下属分支 · ${totalConcepts} 核心概念 · ${totalEvents} 历史节点 · ${totalRefs} 参考资料</div>
          <div class="stats-grid">
            <div class="stat"><div class="num">${totalFactions}</div><div class="lbl">主要势力</div></div>
            <div class="stat"><div class="num">${subFactions.length}</div><div class="lbl">下属分支</div></div>
            <div class="stat"><div class="num">${totalConcepts}</div><div class="lbl">核心概念</div></div>
            <div class="stat"><div class="num">${totalEvents}</div><div class="lbl">纪元节点</div></div>
            <div class="stat"><div class="num">${totalRefs}</div><div class="lbl">参考典籍</div></div>
          </div>
          <div class="legend" style="margin-top:18px"><h3>主要势力色标</h3><div class="legend-row">${topFactions.map(f=>`<span class="chip" data-jump="factions"><span class="dot" style="background:${f.color}"></span>${f.name}</span>`).join('')}</div></div>
        </div>
      </section>

      <div class="scroll-cta">
        <button class="cta-btn" data-jump="factions">进入派系名录 →</button>
        <button class="cta-btn ghost" data-jump="tech">科技图鉴</button>
        <button class="cta-btn ghost" data-jump="timeline">浏览时间轴</button>
        <button class="cta-btn ghost" data-jump="graph">查看关系图</button>
        <button class="cta-btn ghost" data-jump="refs">参考资料</button>
      </div>
    </div>`;
  }

  /* ---------------- 派系 ---------------- */
  function renderFactions(){
    const groups = ['全部', ...Array.from(new Set(FACTIONS.map(effGroup)))];
    const fbtns = groups.map(g=>
      `<button class="fbtn ${g===factionFilter?'active':''}" data-filter="${g}">${g}</button>`
    ).join('');
    let list = FACTIONS.slice().sort((a,b)=>(isSub(a)?1:0)-(isSub(b)?1:0));
    if(factionFilter!=='全部') list = list.filter(f=>effGroup(f)===factionFilter);
    if(searchQ) list = list.filter(f=>matchFaction(f));
    const cards = list.length
      ? list.map(f=>factionCard(f)).join('')
      : `<div class="empty-note">未检索到匹配「${searchQ}」的派系档案。</div>`;
    const meta = searchQ ? `<div class="result-meta">检索「${searchQ}」· 命中 ${list.length} 条</div>` : '';
    return `
    <div class="section-head"><h2>派系名录</h2><span class="more">银河主要势力 · 含下属分支</span></div>
    <div class="filter-bar"><div class="filter-group"><span class="fg-label">阵营</span>${fbtns}</div></div>
    ${meta}
    <div class="card-grid">${cards}</div>`;
  }

  function factionCard(f){
    const badges = f.meta.map(m=>`<span class="tbadge">${m}</span>`).join('');
    const subTag = isSub(f) ? `<span class="tbadge sub">隶属 · ${F[f.parent].name}</span>` : '';
    return `<article class="tcard ${isSub(f)?'sub':''}" data-open="faction" data-id="${f.id}" style="--cat-color:${f.color}">
      <span class="tcount">${isSub(f)?F[f.parent].name:f.group}</span>
      <h3 class="tname">${f.name}</h3>
      <span class="ten">${f.en}</span>
      <div class="tmeta">${badges}${subTag}</div>
      <p class="tsum">${richText(f.summary)}</p>
    </article>`;
  }

  /* ---------------- 时间轴 ---------------- */
  function renderTimeline(){
    let eras = ERAS;
    if(searchQ){
      eras = ERAS.map(e=>({...e, events:e.events.filter(x=>matchText(x.title+x.sub+e.name))})).filter(e=>e.events.length);
    }
    if(!eras.length) return `<div class="section-head"><h2>历史时间轴</h2></div><div class="empty-note">未检索到匹配「${searchQ}」的纪元节点。</div>`;
    const meta = searchQ ? `<div class="result-meta">检索「${searchQ}」· 命中 ${eras.reduce((s,e)=>s+e.events.length,0)} 个节点</div>` : '';
    const body = eras.map(e=>{
      const items = e.events.map(ev=>`
        <div class="tl-item" style="--cat-color:${e.color}">
          <div class="tl-date">${ev.date}</div>
          <div class="tl-title">${richText(ev.title)}</div>
          <div class="tl-sub">${richText(ev.sub)}</div>
        </div>`).join('');
      return `<div class="tl-era">
        <div class="tl-era-head"><span class="name">${e.name}</span><span class="span">${e.span}</span></div>
        <div class="tl-track">${items}</div>
      </div>`;
    }).join('');
    return `
    <div class="section-head"><h2>历史时间轴</h2><span class="more">自远古战争至大裂隙</span></div>
    ${meta}
    <div class="timeline">${body}</div>`;
  }

  /* ---------------- 概念 ---------------- */
  function renderConcepts(){
    let list = CONCEPTS;
    if(searchQ) list = list.filter(c=>matchConcept(c));
    const meta = searchQ ? `<div class="result-meta">检索「${searchQ}」· 命中 ${list.length} 条</div>` : '';
    const cards = list.length
      ? list.map(c=>`<article class="ccard" data-open="concept" data-id="${c.id}" style="--cat-color:${c.color}">
          <span class="ctag">${c.cat}</span>
          <h3 class="cname">${c.name}</h3>
          <span class="cen">${c.en}</span>
          <p class="csum">${richText(c.summary)}</p>
        </article>`).join('')
      : `<div class="empty-note">未检索到匹配「${searchQ}」的概念。</div>`;
    return `
    <div class="section-head"><h2>核心概念</h2><span class="more">理解世界观的钥匙</span></div>
    ${meta}
    <div class="concept-grid">${cards}</div>`;
  }

  /* ---------------- 科技图鉴 ---------------- */
  function renderTech(){
    const cats = ['全部', ...Array.from(new Set(TECH.map(t=>t.cat)))];
    const fbtns = cats.map(g=>
      `<button class="fbtn ${g===techCat?'active':''}" data-techfilter="${g}">${g}</button>`
    ).join('');
    let list = TECH;
    if(techCat!=='全部') list = list.filter(t=>t.cat===techCat);
    if(searchQ) list = list.filter(t=>matchTech(t));
    const meta = searchQ ? `<div class="result-meta">检索「${searchQ}」· 命中 ${list.length} 条</div>` : '';
    const cards = list.length
      ? list.map(t=>`<article class="tech-card" data-open="tech" data-id="${t.id}" style="--cat-color:${t.color}">
          <div class="t-part">TEC-${t.id.toUpperCase().slice(0,4)}</div>
          <span class="t-cat">${t.cat}</span>
          <h3 class="t-name">${t.name}</h3>
          <span class="t-en">${t.en}</span>
          <p class="t-sum">${richText(t.summary)}</p>
        </article>`).join('')
      : `<div class="empty-note">未检索到匹配的科技条目。</div>`;
    return `
    <div class="section-head"><h2>科技图鉴</h2><span class="more">帝国 · 异形 · 混沌 · 远古</span></div>
    <div class="filter-bar"><div class="filter-group"><span class="fg-label">类别</span>${fbtns}</div></div>
    ${meta}
    <div class="tech-grid">${cards}</div>`;
  }

  /* ---------------- 全域检索（跨视图结果列表） ---------------- */
  function renderSearch(){
    const q = searchQ;
    const groups = [
      { label:'派系', type:'faction', items: FACTIONS.filter(f=>matchFaction(f)).map(f=>({id:f.id,name:f.name,en:f.en,sub:f.group})) },
      { label:'概念', type:'concept', items: CONCEPTS.filter(c=>matchConcept(c)).map(c=>({id:c.id,name:c.name,en:c.en,sub:''})) },
      { label:'科技', type:'tech', items: TECH.filter(t=>matchTech(t)).map(t=>({id:t.id,name:t.name,en:t.en,sub:t.cat})) },
      { label:'参考', type:'ref', items: REFS.filter(r=>matchText(r.name+r.en+r.tag+r.lead)).map(r=>({id:r.id,name:r.name,en:r.en,sub:r.tag})) }
    ];
    const total = groups.reduce((s,g)=>s+g.items.length,0);
    const meta = `<div class="result-meta">全域检索「${q}」· 命中 ${total} 条</div>`;
    const body = total
      ? groups.map(g=> g.items.length ? `
        <div class="search-group">
          <div class="sg-head" data-sgtoggle><span class="sg-chev">▸</span><span>${g.label}</span><span class="sg-count">${g.items.length}</span></div>
          <div class="search-list">
            ${g.items.map(it=>`<button class="search-item" data-open="${g.type}" data-id="${it.id}">
              <span class="si-name">${it.name}</span>
              <span class="si-en">${it.en}</span>
              <span class="si-cat">${it.sub}</span>
            </button>`).join('')}
          </div>
        </div>` : '').join('')
      : `<div class="empty-note">未检索到任何条目，换个关键词试试。</div>`;
    return `
    <div class="section-head"><h2>全域检索</h2><span class="more">派系 · 概念 · 科技 · 参考</span></div>
    ${meta}
    ${body}`;
  }

  /* ---------------- 关系图 ---------------- */
  function renderGraph(){
    const glegend = Object.entries(REL_TXT).map(([k,v])=>
      `<span class="lg-item"><span class="lg-dot" style="background:${COLOR[k]}"></span>${v}</span>`
    ).join('');
    return `
    <div class="section-head"><h2>关系拓扑图</h2><span class="more">派系 · 概念 · 渊源</span></div>
    <div class="graph-toolbar">
      <button class="fbtn active" id="linkModeBtn">连线着色：按关联类型</button>
      <span class="toolbar-note">切换可隐藏/显化关联类型的颜色编码</span>
    </div>
    <div class="glegend"><span class="lg-title">连线含义</span>${glegend}</div>
    <div class="graph-layout">
      <div class="graph-wrap">
        <svg id="graph-svg" class="mode-type" viewBox="0 0 900 600" preserveAspectRatio="xMidYMid meet"></svg>
        <div class="graph-hint">拖拽节点可调整布局 · 点击查看详情 · 悬停高亮关联</div>
      </div>
      <div class="graph-side">
        <h3>图例 · 节点</h3>
        ${GRAPH_NODES.map(n=>`<div class="node-link" data-gnode="${n.id}"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${n.color};margin-right:8px"></span>${n.label}<span style="float:right;font-size:11px;color:var(--ink-soft)">${n.type==='faction'?'派系':'概念'}</span></div>`).join('')}
      </div>
    </div>`;
  }

  /* ---------------- 资料 ---------------- */
  function renderRefs(){
    let list = REFS;
    if(searchQ) list = list.filter(r=>matchText(r.name+r.en+r.lead+r.tag));
    const meta = searchQ ? `<div class="result-meta">检索「${searchQ}」· 命中 ${list.length} 条</div>` : '';
    const cards = list.length
      ? list.map(r=>`<article class="ref-card" data-open="ref" data-id="${r.id}">
          <div class="rc-top"><span class="rc-tag">${r.tag}</span><span class="rc-year">${r.year}</span></div>
          <h3 class="rc-name">${r.name}</h3>
          <span class="rc-en">${r.en}</span>
          <p class="rc-lead">${richText(r.lead)}</p>
          <div class="rc-foot"><span class="rc-founder">点击查看卷宗详情</span><span class="rc-more">查阅 →</span></div>
        </article>`).join('')
      : `<div class="empty-note">未检索到匹配「${searchQ}」的参考资料。</div>`;
    return `
    <div class="section-head"><h2>参考资料</h2><span class="more">圣典 · 史书 · 密卷</span></div>
    ${meta}
    <div class="ref-grid">${cards}</div>`;
  }

  /* ---------------- 匹配函数 ---------------- */
  function matchText(t){ return t.toLowerCase().includes(searchQ.toLowerCase()); }
  function matchFaction(f){ return matchText(f.name+f.en+f.summary+f.meta.join(' ')+f.detail.关键词.join(' ')); }
  function matchConcept(c){ return matchText(c.name+c.en+c.summary+c.detail.关键词.join(' ')); }
  function matchTech(t){ return matchText(t.name+t.en+t.summary+t.detail.关键词.join(' ')+t.cat); }

  /* ---------------- 弹窗 ---------------- */
  function openModal(html){
    modalCard.innerHTML = html;
    modal.classList.remove('hidden');
  }
  function closeModal(){ modal.classList.add('hidden'); modalCard.innerHTML=''; }

  function factionModal(f){
    const rows = [];
    rows.push(row('概述', `<div class="m-summary">${richText(f.detail.概述)}</div>`));
    rows.push(row('起源', `<p class="m-people">${richText(f.detail.起源)}</p>`));
    rows.push(row('组织结构', `<ul class="m-list">${f.detail.结构.map(x=>`<li>${richText(x)}</li>`).join('')}</ul>`));
    rows.push(row('战力评估', `<p class="m-people">${richText(f.detail.战力)}</p>`));
    rows.push(row('关键词', `<div class="m-tags">${f.detail.关键词.map(k=>`<span class="m-tag">${richText(k)}</span>`).join('')}</div>`));
    openModal(`
      <div class="modal-head">
        <button class="m-close" data-close>×</button>
        <h2>${f.name}</h2>
        <div class="m-en">${f.en} · ${f.group}</div>
        <div class="m-badges">${f.meta.map(m=>`<span class="tbadge">${m}</span>`).join('')}</div>
      </div>
      <div class="modal-body">${rows.join('')}</div>`);
  }
  function conceptModal(c){
    const labelMap = {'说明':'释义','关键词':'关键词'};
    const body = Object.entries(c.detail).map(([k,v])=>{
      if(k==='关键词') return row('关键词', `<div class="m-tags">${v.map(x=>`<span class="m-tag">${richText(x)}</span>`).join('')}</div>`);
      return row(labelMap[k]||k, `<div class="m-summary">${richText(v)}</div>`);
    }).join('');
    openModal(`
      <div class="modal-head">
        <button class="m-close" data-close>×</button>
        <h2>${c.name}</h2>
        <div class="m-en">${c.en} · ${c.cat}</div>
      </div>
      <div class="modal-body">${body}</div>`);
  }
  function refModal(r){
    const drows = Object.entries(r.detail).map(([k,v])=>`<div class="m-sub">${k}：${richText(v)}</div>`).join('');
    openModal(`
      <div class="modal-head">
        <button class="m-close" data-close>×</button>
        <h2>${r.name}</h2>
        <div class="m-en">${r.en}</div>
        <div class="m-badges"><span class="tbadge">${r.tag}</span><span class="tbadge">${r.year}</span></div>
      </div>
      <div class="modal-body">
        ${row('提要', `<div class="m-summary">${richText(r.lead)}</div>`)}
        ${row('卷宗信息', drows)}
      </div>`);
  }
  function techModal(t){
    const reps = t.detail.代表 ? row('代表产物', `<ul class="m-list">${t.detail.代表.map(x=>`<li>${richText(x)}</li>`).join('')}</ul>`) : '';
    openModal(`
      <div class="modal-head">
        <button class="m-close" data-close>×</button>
        <h2>${t.name}</h2>
        <div class="m-en">${t.en} · ${t.cat}</div>
      </div>
      <div class="modal-body">
        ${row('说明', `<div class="m-summary">${richText(t.detail.说明)}</div>`)}
        ${reps}
        ${row('关键词', `<div class="m-tags">${t.detail.关键词.map(k=>`<span class="m-tag">${richText(k)}</span>`).join('')}</div>`)}
      </div>`);
  }
  function row(label, body){ return `<div class="m-row"><div class="m-label">${label}</div>${body}</div>`; }

  function openByType(type, id){
    if(type==='faction') factionModal(F[id]);
    else if(type==='concept') conceptModal(C[id]);
    else if(type==='tech') techModal(T[id]);
    else if(type==='ref') refModal(R[id]);
  }

  /* ---------------- 事件绑定 ---------------- */
  // 实体链接统一用事件委托：任何带 data-open 的元素（含弹窗内动态插入的）点击即响应，无需重复绑定
  document.addEventListener('click', (e)=>{
    const el = e.target.closest('[data-open]');
    if(!el) return;
    openByType(el.dataset.open, el.dataset.id);
  });
  function bindView(){
    $$('[data-jump]').forEach(el=>{
      el.addEventListener('click', ()=>setView(el.dataset.jump));
    });
    $$('.fbtn[data-filter]').forEach(b=>{
      b.addEventListener('click', ()=>{ factionFilter=b.dataset.filter; render(); });
    });
    $$('.fbtn[data-techfilter]').forEach(b=>{
      b.addEventListener('click', ()=>{ techCat=b.dataset.techfilter; render(); });
    });
    $$('.sg-head').forEach(h=>{
      h.addEventListener('click', ()=>h.closest('.search-group').classList.toggle('collapsed'));
    });
    const svg = $('#graph-svg');
    if(svg) initGraph(svg);
  }

  /* ---------------- 力导向关系图 ---------------- */
  function initGraph(svg){
    const W=900,H=600, cx=W/2, cy=H/2;
    const nodes = GRAPH_NODES.map((n,i)=>{
      const a = (i/GRAPH_NODES.length)*Math.PI*2;
      return {...n, x:cx+Math.cos(a)*220, y:cy+Math.sin(a)*160, vx:0, vy:0, r: n.type==='faction'?14:11};
    });
    const idIndex = {}; nodes.forEach((n,i)=>idIndex[n.id]=i);
    const links = GRAPH_LINKS.map(l=>({s:idIndex[l.s], t:idIndex[l.t], type:l.type}));
    const NS='http://www.w3.org/2000/svg';
    let dragNode=null, dragMoved=false;

    function mk(tag,attrs){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); return e; }

    // 连线
    const linkEls = links.map(l=>{
      const el = mk('line',{class:'glink rel-'+l.type,stroke:COLOR[l.type]}); svg.appendChild(el); return el;
    });
    // 节点
    const nodeEls = nodes.map((n,i)=>{
      const g = mk('g',{class:'gnode'}); g.dataset.id=n.id;
      const c = mk('circle',{r:n.r, fill:n.color});
      const t = mk('text',{x:0,y:n.r+13,'text-anchor':'middle'}); t.textContent=n.label;
      g.appendChild(c); g.appendChild(t); svg.appendChild(g);
      return g;
    });

    function render(){
      links.forEach((l,i)=>{
        const a=nodes[l.s], b=nodes[l.t];
        linkEls[i].setAttribute('x1',a.x); linkEls[i].setAttribute('y1',a.y);
        linkEls[i].setAttribute('x2',b.x); linkEls[i].setAttribute('y2',b.y);
      });
      nodes.forEach((n,i)=>{
        nodeEls[i].setAttribute('transform',`translate(${n.x},${n.y})`);
      });
    }

    function neighbors(id){
      const set=new Set([id]);
      links.forEach(l=>{
        if(nodes[l.s].id===id) set.add(nodes[l.t].id);
        if(nodes[l.t].id===id) set.add(nodes[l.s].id);
      });
      return set;
    }
    function highlight(id){
      const nb = id?neighbors(id):null;
      nodeEls.forEach((g,i)=>{
        const on = !id || nb.has(nodes[i].id);
        g.classList.toggle('dim', !on);
        g.classList.toggle('hl', id && nodes[i].id===id);
      });
      links.forEach((l,i)=>{
        const on = id && (nodes[l.s].id===id || nodes[l.t].id===id);
        linkEls[i].classList.toggle('hl', on);
      });
    }

    // 仿真
    const REP=2400, SPRING=0.02, LEN=120, CENTER=0.012, DAMP=0.86;
    let alpha=1;
    function tick(){
      for(let i=0;i<nodes.length;i++){
        for(let j=i+1;j<nodes.length;j++){
          const a=nodes[i], b=nodes[j];
          let dx=a.x-b.x, dy=a.y-b.y; let d2=dx*dx+dy*dy; if(d2<1) d2=1;
          const d=Math.sqrt(d2); const f=REP/d2;
          const fx=dx/d*f, fy=dy/d*f;
          a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
        }
      }
      links.forEach(l=>{
        const a=nodes[l.s], b=nodes[l.t];
        let dx=b.x-a.x, dy=b.y-a.y; const d=Math.sqrt(dx*dx+dy*dy)||1;
        const f=(d-LEN)*SPRING; const fx=dx/d*f, fy=dy/d*f;
        a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
      });
      nodes.forEach(n=>{
        if(dragNode===n) { n.vx=0; n.vy=0; return; }
        n.vx += (cx-n.x)*CENTER; n.vy += (cy-n.y)*CENTER;
        n.vx*=DAMP; n.vy*=DAMP;
        n.x += n.vx*alpha; n.y += n.vy*alpha;
        n.x=Math.max(40,Math.min(W-40,n.x)); n.y=Math.max(30,Math.min(H-30,n.y));
      });
      alpha = Math.max(0.05, alpha*0.992);
      render();
      graphRAF = requestAnimationFrame(tick);
    }

    // 交互
    function svgPoint(evt){
      const r=svg.getBoundingClientRect();
      const sx=W/r.width, sy=H/r.height;
      return {x:(evt.clientX-r.left)*sx, y:(evt.clientY-r.top)*sy};
    }
    nodeEls.forEach((g,i)=>{
      g.addEventListener('pointerenter', ()=>highlight(nodes[i].id));
      g.addEventListener('pointerleave', ()=>{ if(!dragNode) highlight(null); });
      g.addEventListener('pointerdown', (e)=>{
        e.preventDefault(); dragNode=nodes[i]; dragMoved=false; g.setPointerCapture(e.pointerId);
      });
      g.addEventListener('pointermove', (e)=>{
        if(dragNode!==nodes[i]) return;
        const p=svgPoint(e); dragNode.x=p.x; dragNode.y=p.y; dragMoved=true; alpha=Math.max(alpha,0.3);
      });
      g.addEventListener('pointerup', (e)=>{
        const wasDrag=dragMoved; dragNode=null; g.releasePointerCapture(e.pointerId);
        if(!wasDrag) openByType(nodes[i].type, nodes[i].id);
      });
    });
    $$('.node-link[data-gnode]', $('.graph-side')).forEach(el=>{
      el.addEventListener('mouseenter', ()=>highlight(el.dataset.gnode));
      el.addEventListener('mouseleave', ()=>highlight(null));
      el.addEventListener('click', ()=>{
        const n=nodes[idIndex[el.dataset.gnode]]; openByType(n.type, n.id);
      });
    });

    // 连线着色开关
    const lmBtn = $('#linkModeBtn');
    if(lmBtn){
      lmBtn.addEventListener('click', ()=>{
        const typeMode = svg.classList.toggle('mode-type');
        svg.classList.toggle('mode-plain', !typeMode);
        lmBtn.textContent = typeMode ? '连线着色：按关联类型' : '连线着色：单色';
        lmBtn.classList.toggle('active', typeMode);
      });
    }

    render();
    tick();
  }

  /* ---------------- 全局事件 ---------------- */
  $$('.nav-main a').forEach(a=>a.addEventListener('click', ()=>setView(a.dataset.view)));
  /* 全局搜索：输入即进入「全域检索」跨视图结果列表，清空则回首页 */
  $('#globalSearch').addEventListener('input', (e)=>{
    searchQ = e.target.value.trim();
    if(searchQ) setView('search');
    else setView('home');
  });
  modal.addEventListener('click', (e)=>{ if(e.target.dataset.close!==undefined) closeModal(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeModal(); });

  /* ---------------- 启动 ---------------- */
  setView('home');
})();
