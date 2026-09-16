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
  const F = byId(FACTIONS), C = byId(CONCEPTS), R = byId(REFS), T = byId(TECH), G = CHANGELOG;
  const GN = byId(GRAPH_NODES); // id -> 关系图节点

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
    ['色孽','concept','slaanesh'],
    ['恐虐','concept','khorne'],
    ['奸奇','concept','tzeentch'],
    ['纳垢','concept','nurgle'],
    ['欧克','faction','orks'],
    ['恐惧之眼','concept','eyeofterror'],
    ['卡迪亚陷落','concept','cadia'],
    ['阿巴顿','concept','abaddon'],
    ['荷鲁斯','concept','horus'],
    ['基里曼','concept','guilliman'],
    ['黑色军团','concept','blacklegion'],
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
  // Fisher-Yates 洗牌（返回新数组，不改原数组）
  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; }
    return a;
  }

  const COLOR = {host:'#b5462f', kin:'#9b7cc0', serve:'#8B6914', ally:'#4a7c6f'};
  const REL_TXT = {host:'敌对', kin:'渊源', serve:'统属', ally:'同盟'};
  // 层级：子势力沿用父级阵营归类
  const effGroup = (f)=> f.parent ? F[f.parent].group : f.group;
  const isSub = (f)=> !!f.parent;

  let currentView = 'home';
  let currentId = null;
  let factionFilter = '全部';
  let techCat = '全部';
  let conceptCat = '全部';
  let refMode = 'card'; // 'card' 卡片网格 / 'list' 列表行
  let searchQ = '';
  let graphRAF = null;

  /* ---------------- 视图切换 ---------------- */
  function setView(v, id){
    currentView = v;
    currentId = id || null;
    if(v!=='search') searchQ = '';
    $('#globalSearch').value = (v==='search') ? searchQ : '';
    const navV = (v==='techdetail') ? 'tech' : v;
    $$('.nav-main a').forEach(a=>a.classList.toggle('active', a.dataset.view===navV));
    let meta;
    if(v==='techdetail' && currentId && T[currentId]){
      meta = ['TEC-'+currentId.toUpperCase().slice(0,4), T[currentId].name];
    } else {
      meta = {
        home:['INDEX-000','世界观总览'],
        factions:['FAC-INDEX','派系名录'],
        timeline:['TL-INDEX','历史时间轴'],
        concepts:['CON-INDEX','核心概念'],
        tech:['TEC-INDEX','科技图鉴'],
        search:['SCH-INDEX','全域检索'],
        graph:['GRAPH-001','关系拓扑图'],
        refs:['REF-INDEX','参考资料'],
        changelog:['LOG-INDEX','站务日志']
      }[v];
    }
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
    else if(currentView==='techdetail') html = renderTechDetail();
    else if(currentView==='search') html = renderSearch();
    else if(currentView==='graph') html = renderGraph();
    else if(currentView==='refs') html = renderRefs();
    else if(currentView==='changelog') html = renderChangelog();
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

    const factionChips = topFactions.map(f=>
      `<span class="mini-chip" data-jump="factions"><span class="dot" style="background:${f.color}"></span>${f.name}</span>`
    ).join('');
    const conceptAll = shuffle(CONCEPTS);
    const HOME_CONCEPT_PREVIEW = 30;
    const conceptPreview = conceptAll.slice(0, HOME_CONCEPT_PREVIEW).map(c=>
      `<span class="mini-chip" data-jump="concepts"><span class="dot" style="background:${c.color}"></span>${c.name}</span>`
    ).join('');
    const conceptRest = conceptAll.slice(HOME_CONCEPT_PREVIEW).map(c=>
      `<span class="mini-chip" data-jump="concepts"><span class="dot" style="background:${c.color}"></span>${c.name}</span>`
    ).join('');
    const eraTease = ERAS.map(e=>
      `<div class="et" data-jump="timeline"><span class="ys">${e.span}</span><span><span class="nm">${e.name}</span><br><span class="sp">${e.events.length} 个纪元节点</span></span></div>`
    ).join('');

    return `
    <div class="home-scroll">
      <div class="prose hero">
        <h2>第 41 千年 · 战锤 40K 世界观科普长卷</h2>
        <p class="lead">人类帝国与银河诸族</p>
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
        </div>
      </section>

      <section class="scroll-sec">
        <div class="scroll-sec-head"><span class="scroll-num">贰</span><h2>银河格局</h2></div>
        <div class="scroll-body">
          <div class="txt">
            <p>${richText('以下为档案收录的主要势力。点击任一色标可直达派系名录；派系页可按「阵营」筛选帝国、混沌与异形诸族。')}</p>
            <div class="mini-chips">${factionChips}</div>
          </div>
        </div>
      </section>

      <section class="scroll-sec">
        <div class="scroll-sec-head"><span class="scroll-num">叁</span><h2>时间长河</h2></div>
        <div class="scroll-body">
          <div class="txt">
            <p>${richText('自「战争之神代」的远古余烬，到大远征的辉煌、荷鲁斯叛乱的转折，再到大裂隙撕裂银河——历史从未真正远去。')}</p>
            <div class="era-tease">${eraTease}</div>
          </div>
        </div>
      </section>

      <section class="scroll-sec">
        <div class="scroll-sec-head"><span class="scroll-num">肆</span><h2>核心概念</h2></div>
        <div class="scroll-body">
          <div class="txt">
            <p>${richText('理解世界观的关键词：帝皇、亚空间、灵能、星语、阿斯塔特、混沌四神、网道……点击进入概念名录。')}</p>
            <div class="mini-chips" id="homeConceptChips">${conceptPreview}<span class="concept-rest" hidden>${conceptRest}</span></div>
            <button type="button" class="expand-btn" id="homeConceptToggle" aria-expanded="false">展开全部 ${CONCEPTS.length} 个概念 ↓</button>
          </div>
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
  const conceptCats = ['全部', ...Array.from(new Set(CONCEPTS.map(c=>c.cat)))];
  function renderConcepts(){
    let list = shuffle(CONCEPTS); // 每次打开随机排序，增加探索性
    if(conceptCat!=='全部') list = list.filter(c=>c.cat===conceptCat);
    if(searchQ) list = list.filter(c=>matchConcept(c));
    const meta = searchQ ? `<div class="result-meta">检索「${searchQ}」· 命中 ${list.length} 条</div>` : '';
    const fbtns = conceptCats.map(g=>
      `<button class="fbtn ${g===conceptCat?'active':''}" data-concatfilter="${g}">${g}</button>`
    ).join('');
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
    <div class="filter-bar"><div class="filter-group"><span class="fg-label">类别</span>${fbtns}</div></div>
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

  /* 科技全页详情的「蓝图」文本：按四类工艺体系生成原理与建造流程，织入该条目自身的名称/代表/关键词 */
  function techBlueprint(t){
    const reps = (t.detail && t.detail.代表) ? t.detail.代表 : [];
    const kws = (t.detail && t.detail.关键词) ? t.detail.关键词 : [];
    const repTxt = reps.length ? reps.join('、') : '相应配套子系统';
    const kwTxt = kws.length ? kws.join('、') : '标准工艺';
    const cat = t.cat;
    let principle, steps;
    if(cat==='帝国科技'){
      principle = `「${t.name}」（${t.en}）承袭人类帝国机械神教的造物传统：一切技术皆为「机魂」之显化，须以标准模板（STC）为范、经火星议会核准方可铸成。其运作内核对${kwTxt}的调控至为关键，常体现于${repTxt}等造物之中。`;
      steps = [
        `设计核准：由驻火星的机械神教议会依 STC 残卷核定「${t.name}」蓝图，凡偏离标准者皆需大贤者（Magos）特许。`,
        `材料备料：于铸造世界（Forge World）开采精纯金属与合成物料，并以${kwTxt}相关元件铸模。`,
        `核心锻造：Tech-priest 于神圣锻造厂以机魂铭刻仪式浇筑主体，确保「${t.name}」的意志与帝国意志合一。`,
        `亚空间禁制与列装：为远航与作战加装亚空间导航禁制（Gellar Field 同级逻辑），经测试后配发${repTxt}所属作战单位。`
      ];
    } else if(cat==='异形科技'){
      principle = `「${t.name}」属于异形种族的工艺体系，与帝国 STC 路数迥异，往往根植于${kwTxt}的独特物理或灵能理解，并凝结于${repTxt}之上。`;
      steps = [
        `工艺溯源：依该异形种族世代相传的造物法门确立「${t.name}」之形制，不假 STC 而自成体系。`,
        `本源采集：取${kwTxt}相关稀有素材，于种族工坊精加工。`,
        `核心构筑：以异形特有的工艺完成主体，强调与种族生理或灵能的契合，代表如${repTxt}。`,
        `整合列装：将成品接入该族作战序列，完成适配与实战校调。`
      ];
    } else if(cat==='混沌科技'){
      principle = `「${t.name}」乃混沌势力之造物，由铁匠战帮（Warpsmith）在亚空间熔炉中锻造，常将恶魔熔金与凡铁熔铸，其原理与${kwTxt}及邪神赐福纠葛难分，显化于${repTxt}。`;
      steps = [
        `邪宠授意：铁匠战帮于亚空间熔炉受混乱诸神或恶魔低语指引，定下「${t.name}」的亵渎形制。`,
        `恶魔熔金：采集被诅咒的金属与凡人牺牲之灰，于混沌锻炉熔融。`,
        `核心铸形：将恶魔之魂禁锢入${repTxt}，使造物兼具杀伤与扭曲现实之能。`,
        `玷污列装：成品经混沌仪式加持后配发战帮，随军征伐。`
      ];
    } else { // 远古科技（黑暗科技时代 DAoT 失落造物）
      principle = `「${t.name}」是人类「黑暗科技时代」（DAoT）的失落造物，其原理远超当今帝国所能全然理解，仅能从${repTxt}与${kwTxt}的残迹中窥得一二。`;
      steps = [
        `遗存发现：于远古废墟、失落的 STC 宝库或星舰残骸中寻得「${t.name}」的原型或碎片。`,
        `逆向工程：由机械神教贤者小心翼翼拆解、模仿，忌惮其力量而步履维艰。`,
        `机魂唤醒：尝试重启沉睡的机魂，往往伴有不可预知的异象与代价。`,
        `珍惜列装：因不可复制，仅作为圣物级造物配发最紧要之处，由${repTxt}相关者妥为保管。`
      ];
    }
    return { principle, steps };
  }

  /* 科技全页详情视图 */
  function renderTechDetail(){
    const t = T[currentId];
    if(!t) return renderTech();
    const b = techBlueprint(t);
    const reps = (t.detail.代表)
      ? `<section class="detail-sec"><h3 class="detail-h">代表产物</h3><ul class="m-list">${t.detail.代表.map(x=>`<li>${richText(x)}</li>`).join('')}</ul></section>`
      : '';
    const kws = (t.detail.关键词)
      ? `<section class="detail-sec"><h3 class="detail-h">关键词</h3><div class="m-tags">${t.detail.关键词.map(k=>`<span class="m-tag">${richText(k)}</span>`).join('')}</div></section>`
      : '';
    // 通用「历史/影响/运作」等附加详述段落（若 data 存在则渲染）
    const extraSecs = ['历史','影响','运作'].filter(k=>t.detail[k]).map(k=>
      `<section class="detail-sec"><h3 class="detail-h">${k}</h3><p class="m-summary">${richText(t.detail[k])}</p></section>`
    ).join('');
    return `
    <div class="section-head"><h2>${t.name}</h2><span class="more">${t.en} · ${t.cat}</span></div>
    <button type="button" class="back-btn" data-jump="tech">← 返回科技图鉴</button>
    <div class="detail-body">
      <section class="detail-sec">
        <h3 class="detail-h">详细介绍</h3>
        <div class="m-summary">${richText(t.detail.说明)}</div>
        ${t.summary?`<p class="m-people">${richText(t.summary)}</p>`:''}
      </section>
      ${extraSecs}
      <section class="detail-sec">
        <h3 class="detail-h">蓝图介绍 · 原理</h3>
        <p class="m-summary">${richText(b.principle)}</p>
      </section>
      <section class="detail-sec">
        <h3 class="detail-h">建造蓝图 · 流程</h3>
        <ol class="blueprint-steps">${b.steps.map(s=>`<li>${richText(s)}</li>`).join('')}</ol>
      </section>
      ${reps}
      ${kws}
    </div>`;
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
    const gcats = {};
    GRAPH_NODES.forEach(n=>{ const cc = n.type==='faction' ? '派系' : (C[n.id]?C[n.id].cat:'核心'); gcats[cc]=(gcats[cc]||0)+1; });
    const gchips = Object.keys(gcats).sort().map(c=>`<button class="gfilter active" data-cat="${c}">${c}<span class="gf-count">${gcats[c]}</span></button>`).join('');
    return `
    <div class="section-head"><h2>关系拓扑图</h2><span class="more">派系 · 概念 · 渊源</span></div>
    <div class="graph-toolbar">
      <button class="fbtn active" id="linkModeBtn">连线着色：按关联类型</button>
      <span class="toolbar-note">切换可隐藏/显化关联类型的颜色编码</span>
    </div>
    <div class="glegend"><span class="lg-title">连线含义</span>${glegend}</div>
    <div class="gfilter-bar"><span class="gf-title">分类显隐</span>${gchips}<button class="gfilter all" data-cat="__all__">全显</button></div>
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
    const toggle = `<div class="view-switch"><span class="vs-label">视图</span>
      <button type="button" class="vs-btn ${refMode==='card'?'active':''}" data-refmode="card">卡片</button>
      <button type="button" class="vs-btn ${refMode==='list'?'active':''}" data-refmode="list">列表</button></div>`;
    const empty = `<div class="empty-note">未检索到匹配「${searchQ}」的参考资料。</div>`;
    let body = empty;
    if(list.length){
      if(refMode==='card'){
        body = `<div class="ref-grid">${list.map(r=>`<article class="ref-card" data-open="ref" data-id="${r.id}">
          <div class="rc-top"><span class="rc-tag">${r.tag}</span><span class="rc-year">${r.year}</span></div>
          <h3 class="rc-name">${r.name}</h3>
          <span class="rc-en">${r.en}</span>
          <p class="rc-lead">${richText(r.lead)}</p>
          <div class="rc-foot"><span class="rc-founder">点击查看卷宗详情</span><span class="rc-more">查阅 →</span></div>
        </article>`).join('')}</div>`;
      } else {
        body = `<ul class="ref-list">${list.map(r=>`<li class="ref-row" data-open="ref" data-id="${r.id}">
          <span class="rr-tag">${r.tag}</span>
          <span class="rr-name">${r.name}</span>
          <span class="rr-en">${r.en}</span>
          <span class="rr-lead">${richText(r.lead)}</span>
          <span class="rr-year">${r.year}</span>
          <span class="rr-more">查阅 →</span>
        </li>`).join('')}</ul>`;
      }
    }
    return `
    <div class="section-head"><h2>参考资料</h2><span class="more">圣典 · 史书 · 密卷</span></div>
    ${toggle}
    ${meta}
    ${body}`;
  }

  /* ---------------- 站务日志 ---------------- */
  function renderChangelog(){
    const entries = CHANGELOG; // 数组按版本倒序即最新在前（CHANGELOG 已按 l→a 写入）
    if(!entries.length) return `<div class="empty-note">暂无更新记录。</div>`;
    const body = entries.map(log=>{
      const aiTag = log.ai ? `<span class="lg-ai">${log.ai}</span>` : '';
      const pts = log.points || [];
      const noteSec = log.note ? `<p class="lg-note">${richText(log.note)}</p>` : '';
      // 要点≥5 视为长条目：默认只显示前4条，其余折叠可展开
      const LONG = 4;
      const long = pts.length > LONG;
      const headPts = pts.slice(0,LONG).map(p=>`<li>${richText(p)}</li>`).join('');
      const restHtml = long
        ? `<div class="lg-rest" hidden><ul class="lg-points">${pts.slice(LONG).map(p=>`<li>${richText(p)}</li>`).join('')}</ul></div>`
        : '';
      const toggle = long
        ? `<button type="button" class="lg-toggle" data-lgtoggle>展开完整内容（共 ${pts.length} 点） ↓</button>`
        : '';
      const list = `<ul class="lg-points">${headPts}</ul>${restHtml}`;
      return `<article class="lg-card">
        <div class="lg-head">
          <span class="lg-ver">v${log.version}</span>
          <span class="lg-date">${log.date}</span>
          ${aiTag}
        </div>
        <h3 class="lg-title">${richText(log.title)}</h3>
        ${noteSec}
        ${list}
        ${toggle}
      </article>`;
    }).join('');
    return `
    <div class="section-head"><h2>站务日志</h2><span class="more">版本 · 时间 · 工具 · 修订</span></div>
    <p class="log-intro">记录本项目自建站以来的每次版本迭代：版本号、日期、协作 AI 与主要内容。最新在前；要点较多时默认收起，可展开查看完整条目。</p>
    <div class="log-list">${body}</div>`;
  }
  // 日志条目「展开/收起」：切换该卡片折叠区 lg-rest 与按钮文案
  function toggleLog(btn){
    const card = btn.closest('.lg-card');
    if(!card) return;
    const rest = card.querySelector('.lg-rest');
    if(!rest) return;
    const hidden = rest.hasAttribute('hidden');
    if(hidden){ rest.removeAttribute('hidden'); btn.textContent = '收起 ↑'; }
    else { rest.setAttribute('hidden',''); btn.textContent = '展开完整内容（共 '+(card.querySelectorAll('.lg-points li').length)+' 点） ↓'; }
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

  // 关系图邻居 -> 可点击关联节点（仅保留能弹窗的 faction/concept）
  function relatedNodes(id){
    const seen = {}, out = [];
    GRAPH_LINKS.forEach(l=>{
      let nid = l.s===id ? l.t : (l.t===id ? l.s : null);
      if(!nid || seen[nid]) return;
      const n = GN[nid];
      if(!n) return;
      const ok = (n.type==='faction' && F[nid]) || (n.type==='concept' && C[nid]);
      if(!ok) return;
      seen[nid]=1;
      out.push({id:nid, label:n.label, type:n.type});
    });
    return out;
  }
  function relatedHtml(id){
    const rel = relatedNodes(id);
    if(!rel.length) return '<div class="m-empty">暂无关联节点</div>';
    return `<div class="m-reltags">${rel.map(x=>`<span class="m-reltag" data-open="${x.type}" data-id="${x.id}">${escapeHtml(x.label)}</span>`).join('')}</div>`;
  }
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
      <div class="modal-body">
        ${rows.join('')}
        ${row('相关节点', relatedHtml(f.id))}
      </div>`);
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
      <div class="modal-body">
        ${body}
        ${row('相关节点', relatedHtml(c.id))}
      </div>`);
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
        <button type="button" class="m-more-btn" data-techdetail="${t.id}">查看完整档案 · 蓝图与原理 ⤢</button>
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
    const td = e.target.closest('[data-techdetail]');
    if(td && td.dataset.techdetail!==undefined){ closeModal(); setView('techdetail', td.dataset.techdetail); return; }
    const el = e.target.closest('[data-open]');
    if(el && el.dataset.open!==undefined) openByType(el.dataset.open, el.dataset.id);
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
    $$('.fbtn[data-concatfilter]').forEach(b=>{
      b.addEventListener('click', ()=>{ conceptCat=b.dataset.concatfilter; render(); });
    });
    // 资料页：卡片/列表 视图切换
    $$('.vs-btn[data-refmode]').forEach(b=>{
      b.addEventListener('click', ()=>{ refMode=b.dataset.refmode; render(); });
    });
    // 站务日志：展开/收起长条目
    $$('[data-lgtoggle]').forEach(b=>{
      b.addEventListener('click', ()=>toggleLog(b));
    });
    $$('.sg-head').forEach(h=>{
      h.addEventListener('click', ()=>h.closest('.search-group').classList.toggle('collapsed'));
    });
    const homeToggle = $('#homeConceptToggle');
    if(homeToggle) homeToggle.addEventListener('click', ()=>{
      const rest = $('#homeConceptChips .concept-rest');
      const expanded = !rest.hasAttribute('hidden');
      if(expanded){ rest.setAttribute('hidden',''); homeToggle.setAttribute('aria-expanded','false'); homeToggle.textContent='展开全部 '+CONCEPTS.length+' 个概念 ↓'; }
      else { rest.removeAttribute('hidden'); homeToggle.setAttribute('aria-expanded','true'); homeToggle.textContent='收起 ↑'; }
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
    const catOf = {};
    GRAPH_NODES.forEach(n=>{ catOf[n.id] = n.type==='faction' ? '派系' : (C[n.id]?C[n.id].cat:'核心'); });
    const hiddenCats = new Set();
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
          if(hiddenCats.has(catOf[a.id])||hiddenCats.has(catOf[b.id])) continue;
          let dx=a.x-b.x, dy=a.y-b.y; let d2=dx*dx+dy*dy; if(d2<1) d2=1;
          const d=Math.sqrt(d2); const f=REP/d2;
          const fx=dx/d*f, fy=dy/d*f;
          a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
        }
      }
      links.forEach(l=>{
        const a=nodes[l.s], b=nodes[l.t];
        if(hiddenCats.has(catOf[a.id])||hiddenCats.has(catOf[b.id])) return;
        let dx=b.x-a.x, dy=b.y-a.y; const d=Math.sqrt(dx*dx+dy*dy)||1;
        const f=(d-LEN)*SPRING; const fx=dx/d*f, fy=dy/d*f;
        a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
      });
      nodes.forEach(n=>{
        if(dragNode===n) { n.vx=0; n.vy=0; return; }
        if(hiddenCats.has(catOf[n.id])) { n.vx=0; n.vy=0; return; }
        n.vx += (cx-n.x)*CENTER; n.vy += (cy-n.y)*CENTER;
        n.vx*=DAMP; n.vy*=DAMP;
        n.x += n.vx*alpha; n.y += n.vy*alpha;
        n.x=Math.max(40,Math.min(W-40,n.x)); n.y=Math.max(30,Math.min(H-30,n.y));
      });
      alpha = alpha*0.992;
      render();
      if(alpha>0.02 || dragNode){ graphRAF = requestAnimationFrame(tick); }
      else { graphRAF = null; }
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
        e.preventDefault(); dragNode=nodes[i]; dragMoved=false; g.setPointerCapture(e.pointerId); wake();
      });
      g.addEventListener('pointermove', (e)=>{
        if(dragNode!==nodes[i]) return;
        const p=svgPoint(e); dragNode.x=p.x; dragNode.y=p.y; dragMoved=true; alpha=Math.max(alpha,0.3); wake();
      });
      g.addEventListener('pointerup', (e)=>{
        const wasDrag=dragMoved; dragNode=null; g.releasePointerCapture(e.pointerId);
        alpha=Math.max(alpha,0.2); wake();
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

    // 分类显隐筛选
    const layout = $('.graph-layout');
    function applyVisibility(){
      nodes.forEach((n,i)=>{ nodeEls[i].style.display = hiddenCats.has(catOf[n.id]) ? 'none' : ''; });
      links.forEach((l,i)=>{ const hide = hiddenCats.has(catOf[nodes[l.s].id]) || hiddenCats.has(catOf[nodes[l.t].id]); linkEls[i].style.display = hide ? 'none' : ''; });
      $$('.node-link[data-gnode]', $('.graph-side')).forEach(el=>{ el.style.display = hiddenCats.has(catOf[el.dataset.gnode]) ? 'none' : ''; });
      highlight(null);
    }
    $$('.gfilter:not(.all)', layout).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const cat = btn.dataset.cat;
        if(hiddenCats.has(cat)){ hiddenCats.delete(cat); btn.classList.add('active'); }
        else { hiddenCats.add(cat); btn.classList.remove('active'); }
        applyVisibility();
        alpha = Math.max(alpha, 0.6); wake();
      });
    });
    const allBtn = $('.gfilter.all', layout);
    if(allBtn) allBtn.addEventListener('click', ()=>{
      hiddenCats.clear();
      $$('.gfilter:not(.all)', layout).forEach(x=>x.classList.add('active'));
      applyVisibility();
      alpha = Math.max(alpha, 0.6); wake();
    });

    function wake(){ if(!graphRAF){ graphRAF = requestAnimationFrame(tick); } }

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

  /* ---------------- 深色模式 ---------------- */
  function applyThemeGlyph(){
    const tbtn = $('#themeToggle');
    if(tbtn) tbtn.textContent = document.documentElement.classList.contains('dark') ? '☀' : '☾';
  }
  function setTheme(name){
    const dark = name==='dark';
    document.documentElement.classList.toggle('dark', dark);
    const mc = document.querySelector('meta[name="theme-color"]');
    if(mc) mc.setAttribute('content', dark ? '#1a1714' : '#F6F2E7');
    try{ localStorage.setItem('wh-theme', name); }catch(e){}
    applyThemeGlyph();
  }
  function initTheme(){
    // head 内联脚本已预置 class；此处同步图标与 meta，并绑定切换
    const dark = document.documentElement.classList.contains('dark');
    const mc = document.querySelector('meta[name="theme-color"]');
    if(mc) mc.setAttribute('content', dark ? '#1a1714' : '#F6F2E7');
    applyThemeGlyph();
    const tbtn = $('#themeToggle');
    if(tbtn) tbtn.addEventListener('click', ()=> setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'));
  }

  /* ---------------- 启动 ---------------- */
  initTheme();
  setView('home');
})();
