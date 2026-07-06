/**
 * game-edit.js — ортақ редактор (жаңартылған)
 * Барлық ойын файлы осы скриптті қосуы керек.
 */
(function(){
  'use strict';

  const API = location.origin;
  const params = new URLSearchParams(location.search);
  const PLAY_ID = params.get('play');
  const EDIT_MODE = params.get('edit') === '1';

  /* ── Play mode ── */
  if(PLAY_ID){
    fetch(`${API}/api/game/${PLAY_ID}`)
      .then(r=>r.json())
      .then(data=>{ if(data.config && window.setGameConfig) window.setGameConfig(data.config); })
      .catch(()=>{});
    return;
  }

  if(!EDIT_MODE) return;

  /* ── Styles ── */
  const style = document.createElement('style');
  style.textContent = `
    #ge-fab{
      position:fixed;bottom:24px;left:24px;z-index:9999;
      background:#ffd700;color:#000;border:none;
      padding:12px 22px;border-radius:30px;font-weight:800;
      cursor:pointer;font-size:0.9rem;
      box-shadow:0 6px 24px rgba(0,0,0,0.4);
      transition:transform 0.15s,box-shadow 0.15s;
      display:flex;align-items:center;gap:8px;
    }
    #ge-fab:hover{transform:scale(1.06);box-shadow:0 8px 32px rgba(0,0,0,0.5);}
    #ge-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9997;display:none;}
    #ge-panel{
      position:fixed;top:0;right:-520px;width:min(500px,100vw);height:100vh;
      background:#0a0c1e;border-left:1px solid rgba(255,200,100,0.2);
      z-index:9998;transition:right 0.3s ease;overflow-y:auto;
      font-family:'Segoe UI',system-ui,sans-serif;color:#fff;
    }
    #ge-panel.open{right:0;}
    #ge-header{
      padding:20px 22px 16px;border-bottom:1px solid rgba(255,200,100,0.12);
      display:flex;align-items:center;justify-content:space-between;
      position:sticky;top:0;background:#0a0c1e;z-index:1;
    }
    #ge-header h3{font-size:1rem;font-weight:800;color:#ffd700;letter-spacing:0.08em;}
    #ge-close-btn{background:none;border:none;color:rgba(255,255,255,0.5);font-size:1.4rem;cursor:pointer;padding:4px;}
    #ge-close-btn:hover{color:#fff;}
    #ge-body{padding:20px 22px;}
    .ge-section{margin-bottom:22px;}
    .ge-label{
      font-size:0.72rem;font-weight:700;color:rgba(255,200,100,0.8);
      letter-spacing:0.14em;text-transform:uppercase;margin-bottom:8px;
    }
    .ge-inp{
      width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
      border-radius:8px;padding:10px 13px;color:#fff;font-size:0.88rem;
      outline:none;resize:vertical;transition:border-color 0.2s;font-family:inherit;
    }
    .ge-inp:focus{border-color:rgba(255,200,100,0.4);}
    .ge-inp::placeholder{color:rgba(255,255,255,0.2);}
    .ge-hint{font-size:0.68rem;color:rgba(255,255,255,0.3);margin-top:5px;line-height:1.5;}
    .ge-list{display:flex;flex-direction:column;gap:8px;}
    .ge-item{
      background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
      border-radius:8px;padding:10px 12px;position:relative;
    }
    .ge-item-del{
      position:absolute;top:8px;right:8px;background:none;border:none;
      color:rgba(255,100,100,0.6);cursor:pointer;font-size:0.9rem;padding:2px 5px;
    }
    .ge-item-del:hover{color:#f87171;}
    .ge-item .ge-inp{margin-bottom:6px;}
    .ge-item .ge-inp:last-of-type{margin-bottom:0;}
    .ge-add-btn{
      width:100%;background:rgba(255,255,255,0.05);border:1px dashed rgba(255,255,255,0.2);
      border-radius:8px;padding:10px;color:rgba(255,255,255,0.45);
      cursor:pointer;font-size:0.82rem;transition:background 0.2s;margin-top:4px;
    }
    .ge-add-btn:hover{background:rgba(255,255,255,0.09);}
    .ge-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;}
    .ge-photo-btn{
      display:block;width:100%;background:rgba(100,150,255,0.1);
      border:1px dashed rgba(100,150,255,0.3);border-radius:6px;
      padding:8px;color:rgba(150,180,255,0.8);cursor:pointer;
      font-size:0.75rem;text-align:center;margin-bottom:6px;
    }
    .ge-photo-preview{
      width:100%;height:80px;object-fit:cover;border-radius:6px;
      margin-bottom:6px;border:1px solid rgba(255,255,255,0.1);
    }
    #ge-footer{
      padding:16px 22px 28px;border-top:1px solid rgba(255,200,100,0.1);
      display:flex;flex-direction:column;gap:10px;
    }
    #ge-instruction{
      background:rgba(255,200,80,0.07);border:1px solid rgba(255,200,80,0.2);
      border-radius:10px;padding:11px 14px;margin-bottom:18px;
      font-size:0.72rem;color:rgba(255,220,120,0.85);line-height:1.7;
    }
    #ge-preview-btn{
      background:rgba(100,200,255,0.12);border:1px solid rgba(100,200,255,0.35);
      color:#7dd3fc;padding:11px;border-radius:10px;
      font-weight:700;font-size:0.85rem;cursor:pointer;
      letter-spacing:0.04em;transition:background 0.2s;
    }
    #ge-preview-btn:hover{background:rgba(100,200,255,0.22);}
    #ge-save-btn{
      background:linear-gradient(135deg,#d97706,#f59e0b);border:none;color:#000;
      padding:13px;border-radius:10px;font-weight:800;font-size:0.9rem;
      cursor:pointer;letter-spacing:0.05em;transition:opacity 0.2s;
    }
    #ge-save-btn:hover{opacity:0.88;}
    #ge-save-btn:disabled{opacity:0.5;cursor:not-allowed;}
    #ge-link-box{
      display:none;background:rgba(255,255,255,0.04);
      border:1px solid rgba(100,255,100,0.3);border-radius:10px;
      padding:14px;text-align:center;
    }
    #ge-link-box .lbl{
      font-size:0.7rem;color:rgba(100,255,100,0.7);letter-spacing:0.12em;
      text-transform:uppercase;margin-bottom:8px;
    }
    #ge-link-text{font-size:0.75rem;color:#4ade80;word-break:break-all;margin-bottom:10px;line-height:1.5;}
    #ge-copy-btn{
      background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.4);
      color:#4ade80;padding:8px 20px;border-radius:7px;cursor:pointer;
      font-size:0.78rem;font-weight:700;transition:background 0.2s;
    }
    #ge-copy-btn:hover{background:rgba(74,222,128,0.25);}
    #ge-status{font-size:0.75rem;text-align:center;color:rgba(255,255,255,0.4);min-height:16px;}
    select.ge-inp{-webkit-appearance:none;appearance:none;cursor:pointer;}
    select.ge-inp option{background:#0a0c1e;color:#fff;}
    .ge-qrow{display:grid;grid-template-columns:24px 1fr 110px;gap:5px;margin-bottom:5px;align-items:center;}
    .ge-qnum{font-size:0.68rem;color:rgba(255,200,100,0.55);font-weight:700;text-align:center;}
    .ge-qrow .ge-inp{margin-bottom:0;padding:7px 10px;font-size:0.8rem;}
  `;
  document.head.appendChild(style);

  /* ── FAB ── */
  const fab = document.createElement('button');
  fab.id = 'ge-fab';
  fab.innerHTML = '✏️ <span>Өзгерту</span>';
  fab.onclick = openPanel;
  document.body.appendChild(fab);

  const overlay = document.createElement('div');
  overlay.id = 'ge-overlay';
  overlay.onclick = closePanel;
  document.body.appendChild(overlay);

  const panel = document.createElement('div');
  panel.id = 'ge-panel';
  panel.innerHTML = `
    <div id="ge-header">
      <h3 id="ge-panel-title">✏️ Өзгерту</h3>
      <button id="ge-close-btn" onclick="__geClose()">✕</button>
    </div>
    <div id="ge-body"></div>
    <div id="ge-footer">
      <button id="ge-preview-btn" onclick="__gePreview()">👁 Дайынды көру</button>
      <button id="ge-save-btn" onclick="__geSave()">✅ Аяқтау → Сілтеме алу</button>
      <div id="ge-link-box">
        <div class="lbl">✅ Сілтемеңіз дайын!</div>
        <div id="ge-link-text"></div>
        <button id="ge-copy-btn" onclick="__geCopy()">📋 Көшіру</button>
      </div>
      <div id="ge-status"></div>
    </div>`;
  document.body.appendChild(panel);

  window.__geClose = closePanel;

  // Auto-open panel when page loads with ?edit=1
  window.addEventListener('load', ()=>{ setTimeout(openPanel, 300); });

  function openPanel(){
    buildBody();
    // Add instruction banner at top of body
    const body = document.getElementById('ge-body');
    const inst = document.createElement('div');
    inst.id = 'ge-instruction';
    inst.innerHTML = '✏️ <b>Өзгертуді толтыр</b>, содан «Дайынды көру» батырмасын басып тексер, дайын болған соң <b>«Аяқтау»</b> батырмасын басып сілтеме ал.';
    body.insertBefore(inst, body.firstChild);
    panel.classList.add('open');
    overlay.style.display = 'block';
    document.getElementById('ge-link-box').style.display = 'none';
    document.getElementById('ge-status').textContent = '';
  }

  function closePanel(){
    panel.classList.remove('open');
    overlay.style.display = 'none';
  }

  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function uid(){ return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

  /* ── Photo resize helper ── */
  function resizePhoto(file, cb){
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        const MAX = 400;
        let w = img.width, h = img.height;
        if(w > MAX){ h = Math.round(h*MAX/w); w = MAX; }
        if(h > MAX){ w = Math.round(w*MAX/h); h = MAX; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        cb(c.toDataURL('image/jpeg', 0.65));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ── Common delete ── */
  window.__geDel = function(id){ document.getElementById(id)?.remove(); };

  /* ── Build body by game type ── */
  function buildBody(){
    const body = document.getElementById('ge-body');
    const type = window.GAME_TYPE || 'unknown';
    document.getElementById('ge-panel-title').textContent = `✏️ ${window.GAME_TITLE||'Өзгерту'}`;
    body.innerHTML = '';
    switch(type){
      case 'quiz':       buildQuizForm(body); break;
      case 'names':      buildNamesForm(body); break;
      case 'poets':      buildPoetsForm(body); break;
      case 'subjects':   buildSubjectsForm(body); break;
      case 'planet':     buildPlanetForm(body); break;
      case 'login-lamp': buildLampForm(body); break;
      case 'reveal':     buildRevealForm(body); break;
      case 'logo3d':     buildLogo3dForm(body); break;
      case 'card3d':     buildCard3dForm(body); break;
      case 'book':       buildBookForm(body); break;
      default:           buildGenericForm(body);
    }
  }

  /* ───────────────────────────────────────────────
     LOGIN-LAMP: 10 оқушы × 3 сөз жұбы
  ─────────────────────────────────────────────── */
  function buildLampForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {students:[]};
    const students = cfg.students || [];
    const items = students.map((s,i)=>{
      const pairs = (s.pairs||[]).slice(0,3);
      while(pairs.length < 3) pairs.push({col1:'',col2:''});
      return `
      <div class="ge-item" id="lp-${i}">
        <button class="ge-item-del" onclick="__geDel('lp-${i}')">✕</button>
        <input class="ge-inp" placeholder="Оқушы аты" value="${esc(s.name||'')}">
        ${pairs.map(p=>`
        <div class="ge-row2">
          <input class="ge-inp" placeholder="Қазақша сөз" value="${esc(p.col1||'')}">
          <input class="ge-inp" placeholder="Аудармасы" value="${esc(p.col2||'')}">
        </div>`).join('')}
      </div>`;
    }).join('');
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">10 оқушы — әрқайсысына 3 сөз</div>
        <div class="ge-hint" style="margin-bottom:10px">Оқушы атын жазыңыз, сосын оның 3 сөз жұбын. «Келесі оқушы» батырмасымен ауысады.</div>
        <div class="ge-list" id="lp-list">${items}</div>
        <button class="ge-add-btn" onclick="__geAddLp()">+ Оқушы қосу (max 10)</button>
      </div>`;
    window.__geAddLp = function(){
      const list = document.getElementById('lp-list');
      if(list.children.length >= 10){ alert('Максимум 10 оқушы!'); return; }
      const id = uid();
      const div = document.createElement('div');
      div.className='ge-item'; div.id=id;
      div.innerHTML=`
        <button class="ge-item-del" onclick="__geDel('${id}')">✕</button>
        <input class="ge-inp" placeholder="Оқушы аты">
        <div class="ge-row2"><input class="ge-inp" placeholder="Қазақша сөз 1"><input class="ge-inp" placeholder="Аудармасы"></div>
        <div class="ge-row2"><input class="ge-inp" placeholder="Қазақша сөз 2"><input class="ge-inp" placeholder="Аудармасы"></div>
        <div class="ge-row2"><input class="ge-inp" placeholder="Қазақша сөз 3"><input class="ge-inp" placeholder="Аудармасы"></div>`;
      list.appendChild(div);
    };
  }
  function readLampForm(){
    const items = document.querySelectorAll('#lp-list .ge-item');
    const students = Array.from(items).map(el=>{
      const inps = el.querySelectorAll('input');
      const name = inps[0]?.value.trim()||'';
      const pairs = [];
      for(let i=1; i+1<inps.length; i+=2){
        const col1 = inps[i]?.value.trim()||'';
        const col2 = inps[i+1]?.value.trim()||'';
        if(col1||col2) pairs.push({col1,col2});
      }
      return {name, pairs};
    }).filter(s=>s.name);
    return {students};
  }

  /* ───────────────────────────────────────────────
     REVEAL: сұрақ + жауап жұптары (10-ға дейін)
  ─────────────────────────────────────────────── */
  function buildRevealForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {riddles:[]};
    const riddles = cfg.riddles || [];
    const items = riddles.map((r,i)=>`
      <div class="ge-item" id="rv-${i}">
        <button class="ge-item-del" onclick="__geDel('rv-${i}')">✕</button>
        <input class="ge-inp" placeholder="Жұмбақ / Сұрақ (тұман үстінде жазылады)" value="${esc(r.q||'')}">
        <input class="ge-inp" placeholder="Жауап (тұманды ажыратқаннан кейін шығады)" value="${esc(r.a||'')}">
      </div>`).join('');
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">Жұмбақтар тізімі (10-ға дейін)</div>
        <div class="ge-hint" style="margin-bottom:10px">Сұрақ тұманның үстінде жазылады. Мышкамен тұманды ажыратқаннан кейін жауап шығады. Өткізу батырмасымен келесі жұмбақ.</div>
        <div class="ge-list" id="rv-list">${items}</div>
        <button class="ge-add-btn" onclick="__geAddRv()">+ Жұмбақ қосу (max 10)</button>
      </div>`;
    window.__geAddRv = function(){
      const list = document.getElementById('rv-list');
      if(list.children.length >= 10){ alert('Максимум 10 жұмбақ!'); return; }
      const id = uid();
      const div = document.createElement('div');
      div.className='ge-item'; div.id=id;
      div.innerHTML=`
        <button class="ge-item-del" onclick="__geDel('${id}')">✕</button>
        <input class="ge-inp" placeholder="Жұмбақ / Сұрақ">
        <input class="ge-inp" placeholder="Жауап">`;
      list.appendChild(div);
    };
  }
  function readRevealForm(){
    const items = document.querySelectorAll('#rv-list .ge-item');
    const riddles = Array.from(items).map(el=>{
      const inps = el.querySelectorAll('input');
      return {q:inps[0]?.value.trim()||'', a:inps[1]?.value.trim()||''};
    }).filter(r=>r.q);
    return {riddles};
  }

  /* ───────────────────────────────────────────────
     LOGO3D: оқушылар аттары — кубиктер жиналады
  ─────────────────────────────────────────────── */
  function buildLogo3dForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {students:[]};
    const students = (cfg.students||[]).slice(0,10);
    let rows = '';
    for(let i=0;i<10;i++){
      const v = esc(students[i]||'');
      rows += `<div class="ge-qrow">
        <span class="ge-qnum">${i+1}</span>
        <input class="ge-inp" placeholder="Оқушы аты (БАС ӘРІППЕН)" value="${v}">
      </div>`;
    }
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">10 Оқушы аты</div>
        <div class="ge-hint" style="margin-bottom:8px">Кубиктер жиналып әр баланың атын жазады. «Келесі» батырмасымен ауысады.</div>
        <div id="logo-rows">${rows}</div>
      </div>`;
  }
  function readLogo3dForm(){
    const rows = document.querySelectorAll('#logo-rows .ge-qrow input');
    const students = Array.from(rows)
      .map(inp=>inp.value.trim().toUpperCase())
      .filter(Boolean)
      .slice(0,10);
    return {students};
  }

  /* ───────────────────────────────────────────────
     CARD3D: оқушы аты + сұрақ (10 оқушы)
  ─────────────────────────────────────────────── */
  function buildCard3dForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {students:[]};
    const students = cfg.students || [];
    const items = students.map((s,i)=>`
      <div class="ge-item" id="cd-${i}">
        <button class="ge-item-del" onclick="__geDel('cd-${i}')">✕</button>
        <input class="ge-inp" placeholder="Оқушының аты" value="${esc(s.name||'')}">
        <input class="ge-inp" placeholder="Сұрақ / Тапсырма" value="${esc(s.question||'')}">
      </div>`).join('');
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">10 оқушы аты және сұрақ</div>
        <div class="ge-hint" style="margin-bottom:8px">Картада оқушының аты мен сұрағы шығады. Өткізу батырмасымен келесі оқушыға өтесіз.</div>
        <div class="ge-list" id="cd-list">${items}</div>
        <button class="ge-add-btn" onclick="__geAddCd()">+ Оқушы қосу (max 10)</button>
      </div>`;
    window.__geAddCd = function(){
      const list = document.getElementById('cd-list');
      if(list.children.length >= 10){ alert('Максимум 10 оқушы!'); return; }
      const id = uid();
      const div = document.createElement('div');
      div.className='ge-item'; div.id=id;
      div.innerHTML=`
        <button class="ge-item-del" onclick="__geDel('${id}')">✕</button>
        <input class="ge-inp" placeholder="Оқушының аты">
        <input class="ge-inp" placeholder="Сұрақ / Тапсырма">`;
      list.appendChild(div);
    };
  }
  function readCard3dForm(){
    const items = document.querySelectorAll('#cd-list .ge-item');
    const students = Array.from(items).map(el=>{
      const inps = el.querySelectorAll('input');
      return {name:inps[0]?.value.trim()||'', question:inps[1]?.value.trim()||''};
    }).filter(s=>s.name);
    return {students};
  }

  /* ───────────────────────────────────────────────
     PLANET: өз объектілерің + фото (5–10)
  ─────────────────────────────────────────────── */
  function makePlItem(i, item){
    return `
      <div class="ge-item" id="pl-${i}">
        <button class="ge-item-del" onclick="__geDel('pl-${i}')">✕</button>
        <input class="ge-inp" placeholder="Атауы (мысалы: Меркурий)" value="${esc(item.name||'')}">
        <input class="ge-inp" placeholder="Сипаттама (қысқаша)" value="${esc(item.desc||'')}">
        ${item.photo ? `<img class="ge-photo-preview" id="plprev-${i}" src="${esc(item.photo)}" style="display:block">` : `<img class="ge-photo-preview" id="plprev-${i}" style="display:none">`}
        <label class="ge-photo-btn">📸 Фото жүктеу (міндетті емес)
          <input type="file" accept="image/*" style="display:none" onchange="__gePlPhoto(this,'plprev-${i}','pldata-${i}')">
        </label>
        <input type="hidden" id="pldata-${i}" value="${esc(item.photo||'')}">
      </div>`;
  }
  function buildPlanetForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {items:[]};
    const items = cfg.items || [];
    const htmlItems = items.map((item,i)=>makePlItem(i,item)).join('');
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">Тақырып атауы</div>
        <input class="ge-inp" id="gf-pl-title" value="${esc(cfg.title||'')}" placeholder="Мысалы: Үй жануарлары, Саяхат, Тарих...">
        <div class="ge-hint">Бұл ат ойын жоғарысында шағын жазу ретінде шығады.</div>
      </div>
      <div class="ge-section">
        <div class="ge-label">Объектілер: сұрақ + 4 жауап (8-ге дейін)</div>
        <div class="ge-hint" style="margin-bottom:8px">Сұрақты жазыңыз, 4 жауап нұсқасын толтырыңыз, дұрыс жауапты белгілеңіз.</div>
        <div class="ge-list" id="pl-list">${htmlItems}</div>
        <button class="ge-add-btn" onclick="__geAddPl()">+ Объект қосу (max 8)</button>
      </div>`;
    window.__gePlPhoto = function(input, prevId, dataId){
      const file = input.files[0];
      if(!file) return;
      resizePhoto(file, b64=>{
        const img = document.getElementById(prevId);
        if(img){ img.src=b64; img.style.display='block'; }
        const inp = document.getElementById(dataId);
        if(inp) inp.value = b64;
      });
    };
    window.__geAddPl = function(){
      const list = document.getElementById('pl-list');
      if(list.children.length >= 8){ alert('Максимум 8 объект!'); return; }
      const id = uid();
      const div = document.createElement('div');
      div.innerHTML = makePlItem(id, {name:'',desc:'',answers:['','','',''],correct:0,photo:''});
      list.appendChild(div.firstElementChild);
    };
  }
  function readPlanetForm(){
    const title = document.getElementById('gf-pl-title')?.value.trim()||'';
    const items = document.querySelectorAll('#pl-list .ge-item');
    const result = Array.from(items).map(el=>{
      const inps = el.querySelectorAll('input:not([type=hidden]):not([type=file])');
      const hidInp = el.querySelector('input[type=hidden]');
      return {
        name: inps[0]?.value.trim()||'',
        desc: inps[1]?.value.trim()||'',
        photo: hidInp?.value||''
      };
    }).filter(p=>p.name);
    return {title, items:result};
  }

  /* ───────────────────────────────────────────────
     QUIZ: есеп / сұрақ / жұмбақ (30-ға дейін)
  ─────────────────────────────────────────────── */
  function buildQuizForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {problems:[]};
    const problems = cfg.problems || [];
    const SUBJECTS = ['Математика','Қазақ тілі','Орыс тілі','Ағылшын тілі',
      'Биология','Химия','Физика','История','География',
      'Информатика','Жаратылыстану','Дүниетану','Музыка','Әдебиет','Басқа'];
    const curSubj = cfg.subject || 'Математика';
    const opts = SUBJECTS.map(s=>`<option value="${esc(s)}"${s===curSubj?' selected':''}>${esc(s)}</option>`).join('');
    let rows = '';
    for(let i=0;i<30;i++){
      const p = problems[i]||{};
      const q = esc(String(p.full||p.s||''));
      const a = esc(String(p.a!=null?p.a:''));
      rows += `<div class="ge-qrow">
        <span class="ge-qnum">${i+1}</span>
        <input class="ge-inp" placeholder="Сұрақ немесе есеп" value="${q}">
        <input class="ge-inp" placeholder="Жауап" value="${a}">
      </div>`;
    }
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">Пәнді таңдаңыз</div>
        <select class="ge-inp" id="gf-subject">${opts}</select>
      </div>
      <div class="ge-section">
        <div class="ge-label">30 Сұрақ / Есеп</div>
        <div class="ge-hint" style="margin-bottom:10px">Сұрақты сол жаққа, жауабын оң жаққа жазыңыз. Бос жолдар елеулмейді.</div>
        <div id="quiz-rows">${rows}</div>
      </div>`;
  }
  function readQuizForm(){
    const subject = document.getElementById('gf-subject')?.value||'Математика';
    const rows = document.querySelectorAll('#quiz-rows .ge-qrow');
    const problems = [];
    rows.forEach(row=>{
      const inps = row.querySelectorAll('input');
      const full = inps[0]?.value.trim()||'';
      const aStr = inps[1]?.value.trim()||'';
      if(!full) return;
      const num = parseFloat(aStr);
      problems.push({s:full, full:full, a:isNaN(num)?aStr:num});
    });
    return {title:subject, subject, problems};
  }

  /* ───────────────────────────────────────────────
     NAMES (Star Trek): оқушы аты + сұрақ
  ─────────────────────────────────────────────── */
  function buildNamesForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {students:[]};
    const students = cfg.students || [];
    const items = students.map((s,i)=>`
      <div class="ge-item" id="nm-${i}">
        <button class="ge-item-del" onclick="__geDel('nm-${i}')">✕</button>
        <input class="ge-inp" placeholder="Оқушы аты (БАС ӘРІППЕН)" value="${esc(s.name||'')}">
        <input class="ge-inp" placeholder="Сұрақ / Есеп" value="${esc(s.q||'')}">
        <input class="ge-inp" placeholder="Жауап" value="${esc(s.a||'')}">
      </div>`).join('');
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">10 оқушы аты, сұрақ және жауап</div>
        <div class="ge-hint" style="margin-bottom:8px">Баланы басқанда оның сұрағы шығады. Жауапты оқушы айтады, содан кейін "Жауап" батырмасымен тексереді.</div>
        <div class="ge-list" id="nm-list">${items}</div>
        <button class="ge-add-btn" onclick="__geAddNm()">+ Оқушы қосу (max 10)</button>
      </div>`;
    window.__geAddNm = function(){
      const list = document.getElementById('nm-list');
      if(list.children.length >= 10){ alert('Максимум 10 оқушы!'); return; }
      const id = uid();
      const div = document.createElement('div');
      div.className='ge-item'; div.id=id;
      div.innerHTML=`
        <button class="ge-item-del" onclick="__geDel('${id}')">✕</button>
        <input class="ge-inp" placeholder="Оқушы аты">
        <input class="ge-inp" placeholder="Сұрақ / Есеп">
        <input class="ge-inp" placeholder="Жауап">`;
      list.appendChild(div);
    };
  }
  function readNamesForm(){
    const items = document.querySelectorAll('#nm-list .ge-item');
    const students = Array.from(items).map(el=>{
      const inps = el.querySelectorAll('input');
      return {name:(inps[0]?.value.trim()||'').toUpperCase(), q:inps[1]?.value.trim()||'', a:inps[2]?.value.trim()||''};
    }).filter(s=>s.name);
    return {students};
  }

  /* ───────────────────────────────────────────────
     SUBJECTS: пән + 10 сұрақ:жауап
  ─────────────────────────────────────────────── */
  function makeSbQItem(subId, qIdx, q){
    const letters = ['A','B','C','D'];
    const opts = q.opts || ['','','',''];
    const ans = typeof q.ans === 'number' ? q.ans : 0;
    const radios = letters.map((l,j)=>`
      <label style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:rgba(255,200,100,0.75);cursor:pointer;">
        <input type="radio" name="sbcr-${subId}-${qIdx}" value="${j}" ${j===ans?'checked':''} style="accent-color:#ffd700;">
        ${l}
      </label>`).join('');
    return `
      <div class="ge-item sbq-item" id="sbq-${subId}-${qIdx}" style="padding:10px 12px;margin-bottom:6px;border:1px solid rgba(255,255,255,0.07);border-radius:8px;position:relative;">
        <button class="ge-item-del" onclick="__geDel('sbq-${subId}-${qIdx}')">✕</button>
        <input class="ge-inp" placeholder="Сұрақ" value="${esc(q.q||'')}">
        ${letters.map((l,j)=>`
          <div style="display:grid;grid-template-columns:18px 1fr;gap:4px;margin-bottom:3px;align-items:center;">
            <span style="font-size:0.65rem;color:rgba(255,200,100,0.5);font-weight:700;text-align:center">${l}</span>
            <input class="ge-inp" style="margin-bottom:0;padding:6px 8px;font-size:0.78rem" placeholder="Жауап ${l}" value="${esc(opts[j]||'')}">
          </div>`).join('')}
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;align-items:center;font-size:0.68rem;color:rgba(255,200,100,0.55);">Дұрыс: ${radios}</div>
      </div>`;
  }

  function makeSbItem(subId, s){
    const qs = s.questions || [];
    const qHtml = qs.map((q,qi)=>makeSbQItem(subId, qi, q)).join('');
    return `
      <div class="ge-item sb-item" id="sb-${subId}">
        <button class="ge-item-del" onclick="__geDel('sb-${subId}')">✕</button>
        <div class="ge-row2">
          <input class="ge-inp" placeholder="Пән атауы" value="${esc(s.name||'')}">
          <input class="ge-inp" placeholder="Эмодзи" value="${esc(s.icon||'📚')}" style="max-width:80px">
        </div>
        <div class="ge-label" style="font-size:0.63rem;margin:6px 0 4px;letter-spacing:0.1em;">Сұрақтар (10-ға дейін)</div>
        <div class="sbq-list" id="sbql-${subId}">${qHtml}</div>
        <button class="ge-add-btn" style="margin-top:4px;font-size:0.75rem;padding:6px 12px;" onclick="__geAddSbQ('${subId}')">+ Сұрақ қосу</button>
      </div>`;
  }

  function buildSubjectsForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {subjects:[]};
    const subs = cfg.subjects || [];
    const items = subs.map((s,i)=>makeSbItem(String(i), s)).join('');
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">Пәндер және сұрақтар (10-ға дейін)</div>
        <div class="ge-hint" style="margin-bottom:8px">Әр пәнге сұрақ + 4 жауап нұсқасы қосыңыз. Дұрыс жауапты белгілеңіз.</div>
        <div class="ge-list" id="sb-list">${items}</div>
        <button class="ge-add-btn" onclick="__geAddSb()">+ Пән қосу</button>
      </div>`;
    window.__geAddSbQ = function(subId){
      const list = document.getElementById('sbql-'+subId);
      if(!list) return;
      const qi = list.querySelectorAll('.sbq-item').length;
      if(qi >= 10){ alert('Максимум 10 сұрақ!'); return; }
      const div = document.createElement('div');
      div.innerHTML = makeSbQItem(subId, qi, {q:'',opts:['','','',''],ans:0});
      list.appendChild(div.firstElementChild);
    };
    window.__geAddSb = function(){
      const list = document.getElementById('sb-list');
      if(list.querySelectorAll('.sb-item').length >= 10){ alert('Максимум 10 пән!'); return; }
      const id = uid();
      const div = document.createElement('div');
      div.innerHTML = makeSbItem(id, {name:'',icon:'📚',questions:[]});
      list.appendChild(div.firstElementChild);
    };
  }
  function readSubjectsForm(){
    const items = document.querySelectorAll('#sb-list .sb-item');
    const subjects = Array.from(items).map(el=>{
      const row2 = el.querySelector('.ge-row2');
      const inps = row2 ? row2.querySelectorAll('input') : [];
      const name = inps[0]?.value.trim()||'';
      const icon = inps[1]?.value.trim()||'📚';
      const qEls = el.querySelectorAll('.sbq-item');
      const questions = Array.from(qEls).map(qEl=>{
        const qInps = qEl.querySelectorAll('input:not([type=radio])');
        const q = qInps[0]?.value.trim()||'';
        const opts = [
          qInps[1]?.value.trim()||'',
          qInps[2]?.value.trim()||'',
          qInps[3]?.value.trim()||'',
          qInps[4]?.value.trim()||''
        ];
        let ans = 0;
        qEl.querySelectorAll('input[type=radio]').forEach(r=>{ if(r.checked) ans=parseInt(r.value); });
        return {q, opts, ans};
      }).filter(qo=>qo.q);
      return {name, icon, questions};
    }).filter(s=>s.name);
    return {subjects};
  }

  /* ───────────────────────────────────────────────
     POETS: ақын аты + тапсырма + фото (10-ға дейін)
  ─────────────────────────────────────────────── */
  function buildPoetsForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {title:'',poets:[]};
    const poets = cfg.poets || [];
    const items = poets.map((p,i)=>`
      <div class="ge-item" id="pt-${i}">
        <button class="ge-item-del" onclick="__geDel('pt-${i}')">✕</button>
        <input class="ge-inp" placeholder="Ақын аты (мысалы: Абай Құнанбаев)" value="${esc(p.name||'')}">
        <input class="ge-inp" placeholder="Жылдары (мысалы: 1845–1904)" value="${esc(p.years||'')}">
        <input class="ge-inp" placeholder="Инициалдар (мысалы: АҚ)" value="${esc(p.sh||'')}">
        <input class="ge-inp" placeholder="Шығармалары (Enter арқылы бөл)" value="${esc((p.work||'').replace(/<br>/g,'\n'))}">
        <input class="ge-inp" placeholder="Оқушыға тапсырма (мысалы: Осы өлеңін айтып бер)" value="${esc(p.task||'')}">
        ${p.photo ? `<img class="ge-photo-preview" id="ptprev-${i}" src="${esc(p.photo)}" style="display:block">` : `<img class="ge-photo-preview" id="ptprev-${i}" style="display:none">`}
        <label class="ge-photo-btn">📸 Фото қосу (міндетті емес)
          <input type="file" accept="image/*" style="display:none" onchange="__gePtPhoto(this,'ptprev-${i}','ptdata-${i}')">
        </label>
        <input type="hidden" id="ptdata-${i}" value="${esc(p.photo||'')}">
      </div>`).join('');
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">Тақырып атауы</div>
        <input class="ge-inp" id="gf-ptitle" value="${esc(cfg.title||'Қазақ Ақындары')}" placeholder="Атауы">
      </div>
      <div class="ge-section">
        <div class="ge-label">Ақындар тізімі (10-ға дейін)</div>
        <div class="ge-hint" style="margin-bottom:8px">Ақынның атын жаз. Оқушыға тапсырма жаз (мысалы: "Осы өлеңін айтып бер"). Фото қосу міндетті емес — ақынды басқанда шығады.</div>
        <div class="ge-list" id="pt-list">${items}</div>
        <button class="ge-add-btn" onclick="__geAddPt()">+ Ақын қосу (max 10)</button>
      </div>`;
    window.__gePtPhoto = function(input, prevId, dataId){
      const file = input.files[0];
      if(!file) return;
      resizePhoto(file, b64=>{
        const img = document.getElementById(prevId);
        if(img){ img.src=b64; img.style.display='block'; }
        const inp = document.getElementById(dataId);
        if(inp) inp.value = b64;
      });
    };
    window.__geAddPt = function(){
      const list = document.getElementById('pt-list');
      if(list.children.length >= 10){ alert('Максимум 10 ақын!'); return; }
      const i = uid();
      const div = document.createElement('div');
      div.className='ge-item'; div.id=`pt-${i}`;
      div.innerHTML=`
        <button class="ge-item-del" onclick="__geDel('pt-${i}')">✕</button>
        <input class="ge-inp" placeholder="Ақын аты">
        <input class="ge-inp" placeholder="Жылдары">
        <input class="ge-inp" placeholder="Инициалдар">
        <input class="ge-inp" placeholder="Шығармалары">
        <input class="ge-inp" placeholder="Оқушыға тапсырма">
        <img class="ge-photo-preview" id="ptprev-${i}" style="display:none">
        <label class="ge-photo-btn">📸 Фото қосу
          <input type="file" accept="image/*" style="display:none" onchange="__gePtPhoto(this,'ptprev-${i}','ptdata-${i}')">
        </label>
        <input type="hidden" id="ptdata-${i}" value="">`;
      list.appendChild(div);
    };
  }
  function readPoetsForm(){
    const title = document.getElementById('gf-ptitle')?.value.trim()||'Қазақ Ақындары';
    const COLORS=[['#0d1b6b','#2a3fa0'],['#1b5e20','#2e7d32'],['#4a148c','#6a1b9a'],
      ['#b71c1c','#c62828'],['#00695c','#00838f'],['#33691e','#558b2f'],
      ['#0d47a1','#1565c0'],['#bf360c','#e64a19'],['#263238','#455a64'],['#880e4f','#ad1457']];
    const items = document.querySelectorAll('#pt-list .ge-item');
    const poets = Array.from(items).map((el,i)=>{
      const inps = el.querySelectorAll('input:not([type=hidden]):not([type=file])');
      const hidInp = el.querySelector('input[type=hidden]');
      const name = inps[0]?.value.trim()||'';
      const years = inps[1]?.value.trim()||'';
      const sh = inps[2]?.value.trim()||name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
      const work = (inps[3]?.value||'').replace(/\n/g,'<br>');
      const task = inps[4]?.value.trim()||'';
      const photo = hidInp?.value||'';
      const [c1,c2] = COLORS[i%COLORS.length];
      return {name,years,sh,work,task,photo,c1,c2};
    }).filter(p=>p.name);
    return {title,poets};
  }

  /* ───────────────────────────────────────────────
     BOOK: PDF жүктеу → 3D кітапта ашылады
  ─────────────────────────────────────────────── */
  function buildBookForm(body){
    const cfg = window.getGameConfig ? window.getGameConfig() : {pages:[]};
    const existing = cfg.pages || [];
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">PDF жүктеу (30 бетке дейін)</div>
        <input class="ge-inp" id="gf-book-title" placeholder="Кітап атауы" value="${esc(cfg.title||'')}">
        <label class="ge-photo-btn" style="font-size:0.88rem;padding:14px 16px;margin-top:8px;display:block;cursor:pointer">
          📄 PDF файл таңдаңыз
          <input type="file" accept="application/pdf,image/*" multiple style="display:none" id="gf-pdf-input">
        </label>
        <div id="gf-pdf-status" style="font-size:0.74rem;color:rgba(255,200,100,0.75);margin-top:6px;line-height:1.5"></div>
        <div id="gf-pdf-preview" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px"></div>
        <button onclick="__geBookClear()" style="width:100%;background:rgba(255,100,100,0.08);border:1px solid rgba(255,100,100,0.25);color:#f87171;border-radius:8px;padding:9px;font-size:0.8rem;cursor:pointer;margin-top:8px;letter-spacing:0.04em;">🗑️ Барлық беттерді жою</button>
        <input type="hidden" id="gf-book-pages" value="${esc(JSON.stringify(existing))}">
      </div>`;
    window.__geBookClear = function(){
      document.getElementById('gf-book-pages').value = '[]';
      document.getElementById('gf-pdf-status').textContent = '🗑️ Беттер жойылды. Жаңа файл жүктеңіз.';
      document.getElementById('gf-pdf-preview').innerHTML = '';
    };
    if(existing.length){
      document.getElementById('gf-pdf-status').textContent = '✅ ' + existing.length + ' бет жүктелген';
      document.getElementById('gf-pdf-preview').innerHTML =
        existing.slice(0,6).map(p=>`<img src="${p}" style="width:calc(33% - 3px);border-radius:4px;border:1px solid rgba(255,255,255,0.1)">`).join('');
    }
    document.getElementById('gf-pdf-input').onchange = function(){
      __geHandlePdfOrImages(this.files);
    };
  }

  window.__geHandlePdfOrImages = async function(files){
    if(!files || !files.length) return;
    const status  = document.getElementById('gf-pdf-status');
    const preview = document.getElementById('gf-pdf-preview');
    status.textContent = 'Жүктелуде...';
    preview.innerHTML = '';

    const pages = [];

    // Image files — тікелей жүктеу
    const imgFiles = Array.from(files).filter(f=>f.type.startsWith('image/'));
    const pdfFiles = Array.from(files).filter(f=>f.type==='application/pdf'||f.name.endsWith('.pdf'));

    for(const f of imgFiles.slice(0,30)){
      await new Promise(res=>{
        resizePhoto(f, b64=>{ pages.push(b64); res(); });
      });
      status.textContent = pages.length + ' сурет өңделді...';
    }

    // PDF файл — PDF.js арқылы
    for(const f of pdfFiles){
      if(pages.length >= 30) break;
      status.textContent = 'PDF жүктелуде...';
      try {
        if(!window.pdfjsLib){
          await new Promise((ok,fail)=>{
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            s.onload = ok; s.onerror = fail;
            document.head.appendChild(s);
          });
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const ab  = await f.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: new Uint8Array(ab)}).promise;
        const total = Math.min(pdf.numPages, 30 - pages.length);
        for(let i=1; i<=total; i++){
          const page     = await pdf.getPage(i);
          const vp       = page.getViewport({scale:1.8});
          const canvas   = document.createElement('canvas');
          canvas.width   = vp.width;
          canvas.height  = vp.height;
          await page.render({canvasContext:canvas.getContext('2d'), viewport:vp}).promise;
          pages.push(canvas.toDataURL('image/jpeg', 0.72));
          status.textContent = `${i}/${total} бет өңделуде...`;
        }
      } catch(e){
        status.textContent = 'PDF қатесі: ' + (e.message||e);
        return;
      }
    }

    document.getElementById('gf-book-pages').value = JSON.stringify(pages);
    status.textContent = '✅ ' + pages.length + ' бет дайын! «Аяқтау» батырмасын басыңыз.';
    preview.innerHTML = pages.slice(0,6).map(p=>
      `<img src="${p}" style="width:calc(33% - 3px);border-radius:4px;border:1px solid rgba(255,255,255,0.1)">`).join('');
  };

  function readBookForm(){
    let pages = [];
    try { pages = JSON.parse(document.getElementById('gf-book-pages')?.value||'[]'); } catch(e){}
    const title = document.getElementById('gf-book-title')?.value.trim()||'PDF Кітап';
    return {pages, title};
  }

  /* ─── Generic ─── */
  function buildGenericForm(body){
    body.innerHTML = `
      <div class="ge-section">
        <div class="ge-label">Сабақ атауы</div>
        <input class="ge-inp" id="gf-gen-title" value="${esc(window.GAME_TITLE||'Сабақ')}" placeholder="Атауы">
      </div>`;
  }
  function readGenericForm(){
    return {title: document.getElementById('gf-gen-title')?.value.trim()||window.GAME_TITLE||'Сабақ'};
  }

  /* ── Read form by type ── */
  function readForm(){
    switch(window.GAME_TYPE){
      case 'quiz':       return readQuizForm();
      case 'names':      return readNamesForm();
      case 'poets':      return readPoetsForm();
      case 'subjects':   return readSubjectsForm();
      case 'planet':     return readPlanetForm();
      case 'login-lamp': return readLampForm();
      case 'reveal':     return readRevealForm();
      case 'logo3d':     return readLogo3dForm();
      case 'card3d':     return readCard3dForm();
      case 'book':       return readBookForm();
      default:           return readGenericForm();
    }
  }

  /* ── Preview (apply config, close panel) ── */
  window.__gePreview = function(){
    try{
      const config = readForm();
      if(window.setGameConfig) window.setGameConfig(config);
    }catch(e){}
    closePanel();
  };

  /* ── Save & get link ── */
  window.__geSave = async function(){
    const btn = document.getElementById('ge-save-btn');
    const status = document.getElementById('ge-status');
    const linkBox = document.getElementById('ge-link-box');
    btn.disabled = true; btn.textContent = '⏳ Сақталуда...';
    status.textContent = ''; linkBox.style.display = 'none';
    try{
      const config = readForm();
      if(window.setGameConfig) window.setGameConfig(config);
      const r = await fetch(`${API}/api/save-game`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:window.GAME_TYPE||'unknown', title:window.GAME_TITLE||'Сабақ', config})
      });
      const d = await r.json();
      if(d.id){
        const link = `${location.origin}/play/${d.id}`;
        document.getElementById('ge-link-text').textContent = link;
        linkBox.style.display = 'block';
        status.textContent = '✅ Сақталды! Сілтемені көшіріп сабағыңызда пайдаланыңыз.';
      } else {
        status.textContent = d.error||'Қате болды';
      }
    } catch(e){
      status.textContent = 'Сервермен байланыс жоқ (localhost:5000)';
    }
    btn.disabled = false;
    btn.textContent = '✅ Аяқтау → Сілтеме алу';
  };

  window.__geCopy = function(){
    navigator.clipboard.writeText(document.getElementById('ge-link-text').textContent)
      .then(()=>{
        const btn = document.getElementById('ge-copy-btn');
        btn.textContent = '✅ Көшірілді!';
        setTimeout(()=>{ btn.textContent = '📋 Көшіру'; }, 2000);
      });
  };

})();
