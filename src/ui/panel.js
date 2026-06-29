window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPanel = function installPanel(bot) {
  const panelPositionKey  = "minibiaBot.ui.panelPosition";
  const panelCollapsedKey = "minibiaBot.ui.panelCollapsed";
  const expandedModulesKey = "minibiaBot.ui.expandedModules";

  function getExpandedModules() { return bot.storage.get(expandedModulesKey, {}) || {}; }
  function saveExpandedModule(moduleId, expanded) { bot.storage.set(expandedModulesKey, { ...getExpandedModules(), [moduleId]: !!expanded }); }

  function initAccordions(panel) {
    const expanded = getExpandedModules();
    panel.querySelectorAll(".mb-accordion").forEach((accordion) => {
      const moduleId = accordion.dataset.module;
      if (!moduleId) return;
      const toggle = accordion.querySelector(".mb-accordion-toggle");
      const body   = accordion.querySelector(".mb-accordion-body");
      const setExpanded = (next) => {
        accordion.dataset.expanded = next ? "true" : "false";
        if (body)   body.hidden = !next;
        if (toggle) { toggle.textContent = next ? "−" : "+"; toggle.setAttribute("aria-label", next ? "Collapse section" : "Expand section"); }
        saveExpandedModule(moduleId, next);
      };
      setExpanded(expanded[moduleId] === true);
      accordion.querySelector(".mb-accordion-header")?.addEventListener("click", (e) => { if (e.target.closest("button, input, select, textarea, a, label")) return; setExpanded(accordion.dataset.expanded !== "true"); });
      toggle?.addEventListener("click", (e) => { e.stopPropagation(); setExpanded(accordion.dataset.expanded !== "true"); });
    });
  }

  function destroy() { document.getElementById("minibia-bot-panel")?.remove(); document.getElementById("minibia-bot-style")?.remove(); }
  function savePanelPosition(pos, key = panelPositionKey) { bot.storage.set(key, pos); }
  function getSavedPanelPosition(key = panelPositionKey) { return bot.storage.get(key, null); }
  function savePanelCollapsed(c) { bot.storage.set(panelCollapsedKey, !!c); }
  function getSavedPanelCollapsed() { return !!bot.storage.get(panelCollapsedKey, false); }

  // ── Export / Import de config ─────────────────────────────
  const ALL_CONFIG_KEYS = [
    "minibiaBot.heal.config", "minibiaBot.rune.config", "minibiaBot.cave.config",
    "minibiaBot.attack.config", "minibiaBot.eat.config", "minibiaBot.invisible.config",
    "minibiaBot.magicShield.config", "minibiaBot.equipRing.config", "minibiaBot.follow.config",
    "minibiaBot.talk.config", "minibiaBot.autoStack.config", "minibiaBot.autoRingByCap.config", "minibiaBot.haste.config", "minibiaBot.friendHeal.config",
    "minibiaBot.autoSpell.config", "minibiaBot.distanceAttack.config",
    "minibiaBot.pz.home", "minibiaBot.panic.config",
    "minibiaBot.cave.route", "minibiaBot.cave.transitions", "minibiaBot.cave.presets",
    "minibiaBot.cave.config",
  ];

  function exportConfig() {
    const data = {};
    ALL_CONFIG_KEYS.forEach((key) => {
      const v = bot.storage.get(key, null);
      if (v !== null) data[key] = v;
    });
    return JSON.stringify(data, null, 2);
  }

  function importConfig(json) {
    try {
      const data = JSON.parse(json);
      if (typeof data !== "object" || !data) return false;
      Object.entries(data).forEach(([key, value]) => bot.storage.set(key, value));
      return true;
    } catch (e) { return false; }
  }

  // ── Refresh functions ─────────────────────────────────────
  function refreshHomeLabel() { const el = document.getElementById("minibia-bot-home"); if (!el) return; const h = bot.pz?.getHomePz?.(); el.textContent = h ? `Home PZ: ${h.x}, ${h.y}, ${h.z}` : "Home PZ: not set"; }
  function refreshPanicStatus() {
    const s = bot.panic?.status?.()?.config;
    const u = document.getElementById("minibia-bot-panic-unknown"); if (u) u.checked = !!s?.unknownPlayerEnabled;
    const h = document.getElementById("minibia-bot-panic-health");  if (h) h.checked = !!s?.healthLossEnabled;
    const r = document.getElementById("minibia-bot-panic-return");  if (r) r.checked = !!s?.returnToOriginEnabled;
  }
  function refreshXrayStatus() {
    const status = bot.xray?.status?.(); const me = bot.getPlayerPosition?.();
    const ob = document.getElementById("minibia-bot-xray-overlay-toggle"); if (ob) ob.textContent = status?.config?.overlayEnabled ? "Disable Overlay" : "Enable Overlay";
    const ol = document.getElementById("minibia-bot-xray-overlay-status");
    if (ol) { const fl = status?.config?.selectedFloor == null ? "all floors" : String(me ? me.z - status.config.selectedFloor : status.config.selectedFloor); ol.textContent = `${status?.config?.overlayEnabled ? "Overlay: on" : "Overlay: off"} • ${fl}`; }
    const fs = document.getElementById("minibia-bot-xray-floor-select");
    if (fs) {
      const floors = Array.from(new Set((status?.visibleCreatures||[]).map(c=>c?.position?.z).filter(f=>f!=null))).sort((a,b)=>a-b);
      const sel = status?.config?.selectedFloor;
      if (sel != null && !floors.includes(sel)) { floors.push(sel); floors.sort((a,b)=>a-b); }
      fs.innerHTML = ""; const ao = document.createElement("option"); ao.value="all"; ao.textContent="All floors"; fs.appendChild(ao);
      floors.forEach(f=>{ const o=document.createElement("option"); o.value=String(f); o.textContent = me ? String(me.z-f) : String(f); fs.appendChild(o); });
      fs.value = sel==null?"all":String(sel);
    }
  }
  function renderList(listId, names, onRemove) {
    const list = document.getElementById(listId); if (!list) return;
    list.innerHTML = "";
    if (!names.length) { const e=document.createElement("div"); e.className="mb-small-note"; e.textContent="Vazio."; list.appendChild(e); return; }
    names.forEach((name,index) => {
      const row=document.createElement("div"); row.className="mb-list-row";
      const label=document.createElement("span"); label.textContent=name;
      const btn=document.createElement("button"); btn.type="button"; btn.className="mb-small-button"; btn.textContent="Remove";
      btn.addEventListener("click",()=>onRemove(index));
      row.appendChild(label); row.appendChild(btn); list.appendChild(row);
    });
  }
  function renderTrustedNames() { renderList("minibia-bot-panic-trusted-list", bot.panic?.config?.trustedNames||[], (i)=>{ bot.panic.updateConfig({trustedNames:(bot.panic.config.trustedNames||[]).filter((_,j)=>j!==i)}); renderTrustedNames(); }); }
  function renderGameMasterNames() { renderList("minibia-bot-panic-gm-list", bot.panic?.config?.gameMasterNames||[], (i)=>{ bot.panic.updateConfig({gameMasterNames:(bot.panic.config.gameMasterNames||[]).filter((_,j)=>j!==i)}); renderGameMasterNames(); }); }
  function renderAttackTargetNames() { renderList("minibia-bot-auto-attack-target-list", bot.attack?.config?.targetNames||[], (i)=>{ bot.attack.updateConfig({targetNames:(bot.attack.config.targetNames||[]).filter((_,j)=>j!==i)}); renderAttackTargetNames(); }); }
  function refreshRuneStatus() { const t=document.getElementById("minibia-bot-rune-enabled"); if(t) t.checked=!!bot.rune?.status?.().running; }
  function refreshAutoEatStatus() { const t=document.getElementById("minibia-bot-auto-eat-enabled"); if(t) t.checked=!!bot.eat?.status?.().running; }
  function refreshAutoHealStatus() { const t=document.getElementById("minibia-bot-auto-heal-enabled"); if(t) t.checked=!!bot.heal?.status?.().running; }
  function refreshAutoInvisibleStatus() { const t=document.getElementById("minibia-bot-auto-invisible-enabled"); if(t) t.checked=!!bot.invisible?.status?.().running; }
  function refreshAutoMagicShieldStatus() { const t=document.getElementById("minibia-bot-auto-magic-shield-enabled"); if(t) t.checked=!!bot.magicShield?.status?.().running; }
  function refreshAutoAttackStatus() { const t=document.getElementById("minibia-bot-auto-attack-enabled"); if(t) t.checked=!!bot.attack?.status?.().running; }
  function refreshEquipRingStatus() { const t=document.getElementById("minibia-bot-equip-ring-enabled"); if(t) t.checked=!!bot.equipRing?.status?.().running; }
  function refreshAutoStackStatus() { const t=document.getElementById("minibia-bot-auto-stack-enabled"); const l=document.getElementById("minibia-bot-auto-stack-status"); const s=bot.autoStack?.status?.(); if(t) t.checked=!!s?.running; if(l) l.textContent=s?.running?`Status: ativo • merges: ${s.merged}`:"Status: parado"; }
  function refreshHasteStatus() { const t=document.getElementById("mb-haste-enabled"); const l=document.getElementById("mb-haste-status"); const s=bot.haste?.status?.(); if(t) t.checked=!!s?.running; if(!l||!s) return; if(!s.running){l.textContent="Status: parado";return;} const g=s.gates; l.textContent=`Status: ativo - haste:${g.hasteactive?"sim":"nao"} - target:${g.targetonscreen?"sim":"nao"}`; }
  function refreshCapRingStatus() { const t=document.getElementById("mb-capring-enabled"); const l=document.getElementById("mb-capring-status"); const s=bot.autoRingByCap?.status?.(); if(t) t.checked=!!s?.running; if(!l||!s) return; if(!s.running){l.textContent="Status: parado";return;} const cap=s.currentCap!=null?s.currentCap:"?"; const anel=s.ringEquipped?"💍 equipado":"sem anel"; const origem=s.ringOrigin?`origem: container ${s.ringOrigin.containerId??"?"} slot ${s.ringOrigin.slotIndex??"?"}`:"sem origem salva"; l.textContent=`Status: ativo • cap ${cap} • ${anel} • ${origem}`; }
  function refreshFollowStatus() {
    const t=document.getElementById("minibia-bot-follow-enabled"); const l=document.getElementById("minibia-bot-follow-status"); const s=bot.follow?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) { if(!s?.targetName) l.textContent="Status: no player set"; else if(s?.running) { const d=s.currentDistance!=null?`, dist ${s.currentDistance}/${s.desiredDistance} sqm`:""; l.textContent=`Status: following ${s.targetName}${d}${s.targetVisible?" (visible)":" (lost)"}`; } else l.textContent=`Status: idle (${s.targetName||"no player"})`; }
  }
  function refreshTalkStatus() {
    const t=document.getElementById("minibia-bot-talk-enabled"); const l=document.getElementById("minibia-bot-talk-status"); const s=bot.talk?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) { if(!s?.config?.apiKey) l.textContent="Status: API key missing"; else if(s?.pending) l.textContent="Status: generating"; else if(s?.running) l.textContent="Status: listening"; else l.textContent="Status: idle"; }
  }
  function refreshCaveStatus() {
    const sl=document.getElementById("minibia-bot-cave-status"); const sb=document.getElementById("minibia-bot-cave-start"); const st=document.getElementById("minibia-bot-cave-stop");
    const route=bot.cave?.getRoute?.()||[]; const status=bot.cave?.status?.();
    if(sl) { if(!route.length) sl.textContent="Status: no waypoints"; else if(status?.running) { const wp=(status.currentIndex??0)+1; const dist=Number.isFinite(status?.distanceToWaypoint)&&status.distanceToWaypoint>=0?`, dist ${status.distanceToWaypoint}`:""; const pause=status?.pausedForSpawn?", waiting spawn":status?.pausedForCreatures?`, waiting (${status.nearbyCreatureCount||0})`:status?.pausedForCombat?", paused combat":""; sl.textContent=`Status: running (${wp}/${route.length}${dist}${pause})`; } else sl.textContent=`Status: idle (${route.length} waypoints)`; }
    if(sb) sb.disabled=!route.length||!!status?.running;
    if(st) st.disabled=!status?.running;
  }
  function refreshCavePresetControls() {
    const sel=document.getElementById("minibia-bot-cave-preset-select"); const lbl=document.getElementById("minibia-bot-cave-preset-status"); const del=document.getElementById("minibia-bot-cave-preset-delete");
    const status=bot.cave?.status?.(); const names=status?.presetNames||bot.cave?.getPresetNames?.()||[]; const active=status?.activePresetName||bot.cave?.getActivePresetName?.()||"Default";
    if(sel) { const prev=sel.value; sel.innerHTML=""; if(!names.length){const o=document.createElement("option");o.value="";o.textContent="No saved presets";sel.appendChild(o);sel.disabled=true;}else{names.forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;sel.appendChild(o)});sel.disabled=false;const nv=names.includes(active)?active:prev;if(nv)sel.value=nv;} }
    if(lbl) lbl.textContent=names.length?`Preset: ${active} (${names.length} saved)`:`Preset: ${active}`;
    if(del) del.disabled=!names.length||!sel?.value;
  }
  function refreshCaveClosestStatus() { const l=document.getElementById("minibia-bot-cave-closest"); if(!l) return; const pos=bot.getPlayerPosition?.(); const route=bot.cave?.getRoute?.()||[]; if(!pos){l.textContent="Closest: no position";return;} if(!route.filter(w=>w?.type!=="delay").length){l.textContent="Closest: no waypoints";return;} const idx=bot.cave?.findClosestWaypointIndex?.(pos)??0; const w=route[idx]; l.textContent=w?`Closest: ${idx+1}. ${w.x},${w.y},${w.z}`:"Closest: unavailable"; }
  function refreshCaveTransitionStatus() { const l=document.getElementById("minibia-bot-cave-transition-status"); if(!l) return; const t=bot.cave?.getTransitions?.()||[]; if(!t.length){l.textContent="Transitions: none";return;} const lt=t.slice().sort((a,b)=>Number(b?.lastSeenAt||0)-Number(a?.lastSeenAt||0))[0]; if(!lt?.from||!lt?.to){l.textContent=`Transitions: ${t.length}`;return;} const ex=t.length>1?` (+${t.length-1})`:""; l.textContent=`Transitions: ${lt.from.x},${lt.from.y},${lt.from.z} → ${lt.to.x},${lt.to.y},${lt.to.z}${ex}`; }
  function refreshProfilesPanel() {
    const al=document.getElementById("minibia-bot-profiles-active"); const sel=document.getElementById("minibia-bot-profiles-select"); const ni=document.getElementById("minibia-bot-profiles-name-input");
    const s=bot.profiles?.status?.(); const profiles=s?.profiles||[]; const active=s?.activeProfile||null;
    if(al) al.textContent=active?`Active: ${active}`:"Active: none";
    if(sel) { const prev=sel.value; sel.innerHTML=""; if(!profiles.length){const o=document.createElement("option");o.value="";o.textContent="No profiles";sel.appendChild(o);sel.disabled=true;}else{sel.disabled=false;profiles.forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;sel.appendChild(o)});const ts=profiles.includes(active)?active:profiles.includes(prev)?prev:profiles[0];if(ts){sel.value=ts;if(ni&&!ni.value)ni.value=ts;}} }
  }
  function refreshFriendHealStatus() {
    const t=document.getElementById("minibia-bot-friend-heal-enabled"); const l=document.getElementById("minibia-bot-friend-heal-status"); const s=bot.friendHeal?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) { if(!s?.config?.targetName) l.textContent="Status: configure o target"; else l.textContent=s?.running?`Status: ativo • ${s.targetFound?"✓ visível":"✗ não encontrado"}${s.targetHpPercent!=null?" • HP: "+s.targetHpPercent.toFixed(1)+"%":""}`:"Status: parado"; }
  }
  function refreshAutoSpellStatus() {
    const t=document.getElementById("minibia-bot-auto-spell-enabled"); const l=document.getElementById("minibia-bot-auto-spell-status"); const s=bot.autoSpell?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) l.textContent=s?.running?`Status: ativo • mobs: ${s.adjacentMobs} • combat: ${s.combatActive?"✓":"✗"}`:"Status: parado";
  }
  function refreshDistanceAttackStatus() {
    const t=document.getElementById("minibia-bot-distance-attack-enabled"); const l=document.getElementById("minibia-bot-distance-attack-status"); const s=bot.distanceAttack?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) { if(s?.running) { const dist=Number.isFinite(s.distanceToTarget)?s.distanceToTarget:"?"; const stuck=s.stuckCount>0?` • stuck:${s.stuckCount}`:""; l.textContent=`Status: ativo • dist: ${dist} sqm • alvo: ${s.currentTarget?.name||"nenhum"}${stuck}`; } else l.textContent="Status: parado"; }
  }
  function refreshVisibleCreatures() {
    const list=document.getElementById("minibia-bot-visible-creatures-list"); if(!list) return;
    const me=bot.getPlayerPosition?.(); const status=bot.xray?.status?.(); const creatures=status?.visibleCreatures||[]; const sel=status?.config?.selectedFloor;
    list.innerHTML="";
    if(!me){const e=document.createElement("div");e.className="mb-small-note";e.textContent="Position unavailable.";list.appendChild(e);return;}
    const visible=creatures.filter(c=>{const f=c?.position?.z;if(f==null)return false;if(sel!=null)return f===sel;return f!==me.z;}).sort((a,b)=>{const fa=Math.abs((a.position?.z||0)-me.z),fb=Math.abs((b.position?.z||0)-me.z);if(fa!==fb)return fa-fb;const da=Math.abs((a.position?.x||0)-me.x)+Math.abs((a.position?.y||0)-me.y),db=Math.abs((b.position?.x||0)-me.x)+Math.abs((b.position?.y||0)-me.y);return da-db;});
    if(!visible.length){const e=document.createElement("div");e.className="mb-small-note";e.textContent="No off-floor creatures.";list.appendChild(e);return;}
    let curFloor=null;
    visible.forEach(c=>{
      const f=c.position?.z;
      if(f!==curFloor){curFloor=f;const fo=me.z-f;const fol=fo===0?"0":fo>0?`+${fo}`:`${fo}`;const fl=document.createElement("div");fl.className="mb-floor-label";fl.textContent=fol;list.appendChild(fl);}
      const row=document.createElement("div");row.className="mb-creature-row";
      const name=document.createElement("div");name.className="mb-creature-name";name.textContent=c.name||(c.type===0?"Player":"Mob");
      const meta=document.createElement("div");meta.className="mb-small-note";meta.textContent=`${c.type===0?"Player":"Mob"} at ${c.position.x},${c.position.y},${c.position.z}`;
      row.appendChild(name);row.appendChild(meta);list.appendChild(row);
    });
  }

  function setPanelCollapsed(panel, collapsed) {
    if(!panel) return;
    const body=panel.querySelector(".mb-body"); const toggle=panel.querySelector("#minibia-bot-collapse");
    panel.dataset.collapsed=collapsed?"true":"false";
    if(body) body.hidden=collapsed;
    if(toggle){toggle.textContent=collapsed?"+":"−";toggle.setAttribute("aria-label",collapsed?"Maximize":"Minimize");toggle.setAttribute("title",collapsed?"Maximize":"Minimize");}
    savePanelCollapsed(collapsed);
  }

  function applySavedPanelPosition(panel, key=panelPositionKey) {
    const p=getSavedPanelPosition(key); if(!p) return;
    if(typeof p.top==="number") panel.style.top=`${p.top}px`;
    if(typeof p.left==="number"){panel.style.left=`${p.left}px`;panel.style.right="auto";}
  }

  function enableDrag(panel, key=panelPositionKey) {
    const handle=panel.querySelector(".mb-title"); if(!handle) return;
    let drag=null;
    const onMove=(e)=>{ if(!drag) return; const maxL=Math.max(0,window.innerWidth-panel.offsetWidth),maxT=Math.max(0,window.innerHeight-panel.offsetHeight); panel.style.left=`${Math.min(Math.max(0,e.clientX-drag.ox),maxL)}px`; panel.style.top=`${Math.min(Math.max(0,e.clientY-drag.oy),maxT)}px`; panel.style.right="auto"; };
    const onUp=()=>{ if(!drag) return; drag=null; const r=panel.getBoundingClientRect(); savePanelPosition({left:r.left,top:r.top},key); };
    handle.addEventListener("mousedown",(e)=>{ if(e.button!==0) return; const r=panel.getBoundingClientRect(); drag={ox:e.clientX-r.left,oy:e.clientY-r.top}; e.preventDefault(); });
    window.addEventListener("mousemove",onMove); window.addEventListener("mouseup",onUp);
    bot.addCleanup(()=>{ window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); });
  }

  function inject() {
    destroy();

    const style=document.createElement("style"); style.id="minibia-bot-style";
    style.textContent=`
      #minibia-bot-panel{position:fixed;top:10px;right:10px;z-index:999999;width:460px;max-width:calc(100vw - 20px);background:#d4d0c8;border:2px solid;border-color:#ffffff #808080 #808080 #ffffff;font:13px/1.4 Segoe UI,Arial,sans-serif;color:#000;user-select:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;font-weight:normal}
      #minibia-bot-panel *{box-sizing:border-box}
      #minibia-bot-panel .mb-titlebar{background:linear-gradient(to right,#0a246a 0%,#a6caf0 100%);color:#fff;font-size:13px;padding:3px 4px 3px 6px;display:flex;align-items:center;justify-content:space-between;gap:4px;cursor:move}
      #minibia-bot-panel .mb-title{flex:1;white-space:nowrap}
      #minibia-bot-panel .mb-titlebar-btns{display:flex;gap:2px}
      #minibia-bot-panel .mb-icon-button{width:16px;height:14px;min-width:16px;padding:0;background:#d4d0c8;border:1px solid;border-color:#ffffff #808080 #808080 #ffffff;color:#000;font:normal 11px Segoe UI,Arial,sans-serif;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
      #minibia-bot-panel .mb-icon-button:active{border-color:#808080 #ffffff #ffffff #808080}
      #minibia-bot-panel .mb-tabs{display:flex;flex-wrap:wrap;padding:3px 4px 0;gap:2px;background:#d4d0c8;border-bottom:1px solid #808080}
      #minibia-bot-panel .mb-tab{padding:2px 8px 3px;border:1px solid;border-color:#ffffff #808080 #d4d0c8 #ffffff;background:#bbb8b0;font:13px Segoe UI,Arial,sans-serif;cursor:pointer;border-bottom:none;position:relative;top:1px;color:#000;white-space:nowrap}
      #minibia-bot-panel .mb-tab.mb-tab-active{background:#d4d0c8;z-index:2;padding-bottom:4px}
      #minibia-bot-panel .mb-tab:hover:not(.mb-tab-active){background:#c8c5be}
      #minibia-bot-panel .mb-tab-content{display:none}
      #minibia-bot-panel .mb-tab-content.mb-tab-active{display:block}
      #minibia-bot-panel .mb-body{padding:6px;max-height:min(70vh,520px);overflow-y:auto;scrollbar-width:thin;background:#d4d0c8}
      #minibia-bot-panel .mb-group{border:1px solid #808080;border-top:none;padding:10px 8px 8px;position:relative;margin-top:10px;background:#d4d0c8}
      #minibia-bot-panel .mb-group-title{position:absolute;top:-7px;left:8px;background:#d4d0c8;padding:0 3px;font-size:13px}
      #minibia-bot-panel .mb-stack{display:flex;flex-direction:column;gap:5px}
      #minibia-bot-panel .mb-row{display:flex;align-items:center;gap:6px}
      #minibia-bot-panel .mb-toggle{display:flex;align-items:center;gap:5px;font-size:13px;color:#000;cursor:pointer}
      #minibia-bot-panel .mb-toggle input[type="checkbox"]{width:13px;height:13px;margin:0;cursor:pointer}
      #minibia-bot-panel button{height:21px;min-width:60px;padding:0 8px;border:1px solid;border-color:#ffffff #808080 #808080 #ffffff;background:#d4d0c8;font:13px Segoe UI,Arial,sans-serif;cursor:pointer;color:#000;white-space:nowrap}
      #minibia-bot-panel button:hover{background:#e0ddd5}
      #minibia-bot-panel button:active{border-color:#808080 #ffffff #ffffff #808080}
      #minibia-bot-panel button:disabled{color:#808080;cursor:default}
      #minibia-bot-panel button.mb-btn-full{width:100%}
      #minibia-bot-panel .mb-small-button{height:18px;min-width:40px;padding:0 6px;font-size:13px}
      #minibia-bot-panel input:not([type="checkbox"]),#minibia-bot-panel select,#minibia-bot-panel textarea{height:19px;border:1px solid;border-color:#808080 #ffffff #ffffff #808080;background:#fff;padding:0 3px;font:13px Segoe UI,Arial,sans-serif;color:#000;width:100%}
      #minibia-bot-panel textarea{height:auto;min-height:48px;padding:3px;resize:vertical}
      #minibia-bot-panel input[type="number"]{width:60px}
      #minibia-bot-panel .mb-inline{display:grid;grid-template-columns:1fr auto;gap:4px;align-items:center}
      #minibia-bot-panel .mb-field{display:flex;flex-direction:column;gap:2px}
      #minibia-bot-panel .mb-field-label{font-size:13px;color:#000}
      #minibia-bot-panel .mb-field input{width:100%}
      #minibia-bot-panel .mb-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
      #minibia-bot-panel .mb-small-note{font-size:13px;color:#444}
      #minibia-bot-panel .mb-label{font-size:13px;color:#000}
      #minibia-bot-panel .mb-note{font-size:12px;color:#666;margin-top:4px}
      #minibia-bot-panel .mb-list{display:flex;flex-direction:column;gap:3px}
      #minibia-bot-panel .mb-list-row{display:grid;grid-template-columns:1fr auto;gap:4px;align-items:center;border-bottom:1px solid #c0bdb5;padding-bottom:3px}
      #minibia-bot-panel .mb-creature-row{border-bottom:1px solid #c0bdb5;padding:2px 0;font-size:13px}
      #minibia-bot-panel .mb-creature-name{font-weight:normal}
      #minibia-bot-panel .mb-floor-label{font-size:13px;color:#0a246a;margin-top:4px;margin-bottom:2px}
      #minibia-bot-panel .mb-actions-inline-two{display:grid;grid-template-columns:1fr 1fr;gap:4px}
      #minibia-bot-panel .mb-actions-inline-three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}
      #minibia-bot-panel .mb-statusbar{background:#d4d0c8;border-top:1px solid #808080;padding:3px 6px;display:flex;gap:6px;font-size:13px}
      #minibia-bot-panel .mb-statuspanel{border:1px solid;border-color:#808080 #ffffff #ffffff #808080;padding:1px 6px;font-size:13px;color:#000;white-space:nowrap}
      #minibia-bot-panel .mb-row-three{display:grid;grid-template-columns:auto minmax(80px,1fr) 56px;align-items:center;gap:6px}
      #minibia-bot-panel .mb-row-three input{min-width:0}
      #minibia-bot-panel #minibia-bot-visible-creatures-list{max-height:100px;overflow-y:auto}
      #minibia-bot-panel #minibia-bot-panic-trusted-list{max-height:80px;overflow-y:auto}
      #minibia-bot-panel .mb-accordion{display:contents}
      #minibia-bot-panel .mb-accordion-header{display:none}
      #minibia-bot-panel .mb-accordion-body{display:block!important}
      #minibia-bot-panel .mb-accordion-body[hidden]{display:none!important}
    `;
    document.head.appendChild(style);

    const panel=document.createElement("div"); panel.id="minibia-bot-panel";
    panel.innerHTML=`
      <div class="mb-titlebar">
        <span class="mb-title">Minibia Bot v0.3</span>
        <div class="mb-titlebar-btns"><button type="button" class="mb-icon-button" id="minibia-bot-collapse" title="Minimize">_</button></div>
      </div>
      <div class="mb-tabs" id="minibia-bot-tabs">
        <div class="mb-tab mb-tab-active" data-tab="heal">Heal</div>
        <div class="mb-tab" data-tab="rune">Rune</div>
        <div class="mb-tab" data-tab="attack">Attack</div>
        <div class="mb-tab" data-tab="cave">Cave</div>
        <div class="mb-tab" data-tab="panic">Panic</div>
        <div class="mb-tab" data-tab="extra">Extra</div>
        <div class="mb-tab" data-tab="tools">Tools</div>
        <div class="mb-tab" data-tab="config">Config</div>
      </div>
      <div class="mb-body">

        <!-- ABA: Heal -->
        <div class="mb-tab-content mb-tab-active" data-tab="heal">
          <div class="mb-group"><span class="mb-group-title">Auto Heal</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-heal-enabled" /><span>Enable Auto Heal</span></label>
              <span class="mb-small-note">HP: Nível 2 tem prioridade sobre Nível 1</span>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">HP% Nível 1 (fraco)</span><input type="number" id="minibia-bot-hp-threshold1" min="1" max="100" placeholder="90" /></div>
                <div class="mb-field"><span class="mb-field-label">Hotkey Nível 1</span><input type="number" id="minibia-bot-hp-hotkey1" min="1" max="12" placeholder="1" /></div>
                <div class="mb-field"><span class="mb-field-label">HP% Nível 2 (forte)</span><input type="number" id="minibia-bot-hp-threshold2" min="1" max="100" placeholder="60" /></div>
                <div class="mb-field"><span class="mb-field-label">Hotkey Nível 2</span><input type="number" id="minibia-bot-hp-hotkey2" min="1" max="12" placeholder="2" /></div>
                <div class="mb-field"><span class="mb-field-label">Mana% threshold</span><input type="number" id="minibia-bot-mana-threshold" min="1" max="100" placeholder="50" /></div>
                <div class="mb-field"><span class="mb-field-label">Mana Hotkey</span><input type="number" id="minibia-bot-mana-hotkey" min="1" max="12" placeholder="3" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown HP (ms)</span><input type="number" id="minibia-bot-heal-cooldown" min="50" placeholder="100" /></div>
                <div class="mb-field"><span class="mb-field-label">Retry HP (ms)</span><input type="number" id="minibia-bot-heal-retry" min="50" placeholder="100" /></div>
              </div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Utilities</span>
            <div class="mb-stack">
              <div class="mb-row"><label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-eat-enabled" /><span>Auto Eat</span></label><span class="mb-field-label" style="margin-left:auto">Slot</span><input type="number" id="minibia-bot-auto-eat-hotkey" min="1" max="12" placeholder="10" style="width:44px" /></div>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-invisible-enabled" /><span>Auto Invisible (utana vid)</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-magic-shield-enabled" /><span>Auto Utamo Vita</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-equip-ring-enabled" /><span>Auto Equip Ring</span></label>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Stack (Runas)</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-stack-enabled" /><span>Enable Auto Stack</span></label>
              <div class="mb-row"><span class="mb-field-label">Intervalo (ms)</span><input type="number" id="minibia-bot-auto-stack-tick" min="500" placeholder="2000" style="width:70px" /><button type="button" class="mb-small-button" id="minibia-bot-auto-stack-now">Agrupar agora</button></div>
              <span class="mb-small-note" id="minibia-bot-auto-stack-status">Status: parado</span>
              <span class="mb-note">Agrupa apenas runas na primeira bag aberta.</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Ring por Cap</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="mb-capring-enabled" /><span>Enable Auto Ring por Cap</span></label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Tirar anel (cap &lt;)</span><input type="number" id="mb-capring-min" min="0" placeholder="200" /></div>
                <div class="mb-field"><span class="mb-field-label">Colocar anel (cap ≥)</span><input type="number" id="mb-capring-put" min="0" placeholder="300" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown (ms)</span><input type="number" id="mb-capring-cd" min="500" placeholder="1500" /></div>
              </div>
              <button type="button" class="mb-small-button mb-btn-full" id="mb-capring-clear-origin">Limpar origem salva do anel</button>
              <span class="mb-small-note" id="mb-capring-status">Status: parado</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Haste</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="mb-haste-enabled" /><span>Enable Haste</span></label>
              <div class="mb-field"><span class="mb-field-label">Spell</span><input type="text" id="mb-haste-spell" placeholder="utani hur" style="width:100%" /></div>
              <span class="mb-small-note" id="mb-haste-status">Status: parado</span>
              <span class="mb-note">Detecta automatico pelo ID 17. Nao lanca com target na tela.</span>
            </div>
          </div>
        </div>

        <!-- ABA: Rune -->
        <div class="mb-tab-content" data-tab="rune">
          <div class="mb-group"><span class="mb-group-title">Magic Level Trainer</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-rune-enabled" /><span>Enable</span></label>
              <div class="mb-field"><span class="mb-field-label">Spell words</span><input type="text" id="minibia-bot-rune-spell" placeholder="adori vita vis" style="width:100%" /></div>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Min Mana</span><input type="number" id="minibia-bot-rune-mana-min" min="0" placeholder="600" /></div>
                <div class="mb-field"><span class="mb-field-label">Max Mana</span><input type="number" id="minibia-bot-rune-mana-max" min="0" placeholder="600" /></div>
              </div>
            </div>
          </div>
        </div>

        <!-- ABA: Attack -->
        <div class="mb-tab-content" data-tab="attack">
          <div class="mb-group"><span class="mb-group-title">Auto Attack</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-enabled" /><span>Enable Auto Attack</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-melee" /><span>Melee Mode</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-skill-train" /><span>Skill Train on Monster</span></label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Range (sqm)</span><input type="number" id="minibia-bot-auto-attack-max-distance" min="1" max="15" placeholder="6" /></div>
                <div class="mb-field"><span class="mb-field-label">Target Hotkey</span><input type="number" id="minibia-bot-auto-attack-hotkey" min="1" max="12" placeholder="3" /></div>
                <div class="mb-field"><span class="mb-field-label">Rune Hotkey</span><input type="number" id="minibia-bot-auto-attack-rune-hotkey" min="1" max="12" placeholder="4" /></div>
                <div class="mb-field"><span class="mb-field-label">Rune Cooldown (ms)</span><input type="number" id="minibia-bot-auto-attack-rune-cooldown" min="200" placeholder="1200" /></div>
              </div>
              <div class="mb-inline"><input type="text" id="minibia-bot-auto-attack-target-input" placeholder="e.g. Rotworm" style="width:100%" /><button type="button" class="mb-small-button" id="minibia-bot-auto-attack-target-add">Add</button></div>
              <div class="mb-list" id="minibia-bot-auto-attack-target-list"></div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Distance Attack</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-distance-attack-enabled" /><span>Enable Distance Attack</span></label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Manter distância (sqm)</span><input type="number" id="minibia-bot-distance-keep" min="1" max="10" placeholder="3" /></div>
                <div class="mb-field"><span class="mb-field-label">Hotkey de ataque (1-12)</span><input type="number" id="minibia-bot-distance-hotkey" min="1" max="12" placeholder="4" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown (ms)</span><input type="number" id="minibia-bot-distance-cooldown" min="200" placeholder="1200" /></div>
              </div>
              <span class="mb-small-note" id="minibia-bot-distance-attack-status">Status: parado</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Melee Position</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="mb-melee-enabled"/><span>Enable Melee Position</span></label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Spell Hotkey (1-12)</span><input type="number" id="mb-melee-slot" min="1" max="12" placeholder="5"/></div>
                <div class="mb-field"><span class="mb-field-label">Spell Cooldown (ms)</span><input type="number" id="mb-melee-cd" min="200" placeholder="2000"/></div>
                <div class="mb-field"><span class="mb-field-label">Modo</span><select id="mb-melee-mode"><option value="ortogonal">N/S/L/O (ortogonal)</option><option value="diagonal">Diagonal</option><option value="any">Qualquer lado</option></select></div>
                <div class="mb-field"><span class="mb-field-label">Só atira se adjacente</span><select id="mb-melee-require"><option value="true">Sim</option><option value="false">Não</option></select></div>
              </div>
              <span class="mb-small-note" id="mb-melee-status">Status: parado</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Follow</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-follow-enabled" /><span>Enable Auto Follow</span></label>
              <div class="mb-field"><span class="mb-field-label">Player Name</span><input type="text" id="minibia-bot-follow-target" placeholder="Name of player to follow" style="width:100%" /></div>
              <div class="mb-row"><span class="mb-field-label">Distance (sqm)</span><input type="number" id="minibia-bot-follow-distance" min="0" max="10" placeholder="2" style="width:50px" /></div>
              <span class="mb-small-note" id="minibia-bot-follow-status">Status: idle</span>
            </div>
          </div>
        </div>

        <!-- ABA: Cave -->
        <div class="mb-tab-content" data-tab="cave">
          <div class="mb-group"><span class="mb-group-title">Cave Bot</span>
            <div class="mb-stack">
              <div class="mb-field"><span class="mb-field-label">Preset</span><select id="minibia-bot-cave-preset-select"></select></div>
              <div class="mb-actions-inline-two"><button type="button" class="mb-small-button" id="minibia-bot-cave-preset-new">New</button><button type="button" class="mb-small-button" id="minibia-bot-cave-preset-delete">Delete</button></div>
              <div class="mb-actions-inline-two"><button type="button" class="mb-small-button" id="minibia-bot-cave-preset-export">Export</button><button type="button" class="mb-small-button" id="minibia-bot-cave-preset-import">Import</button></div>
              <div class="mb-actions-inline-two"><button type="button" class="mb-small-button" id="minibia-bot-cave-record">Record Spot</button><button type="button" class="mb-small-button" id="minibia-bot-cave-add-delay">Add Delay</button></div>
              <button type="button" class="mb-small-button mb-btn-full" id="minibia-bot-cave-remove-last">Remove Last Waypoint</button>
              <span class="mb-small-note" id="minibia-bot-cave-closest">Closest: no waypoints</span>
              <span class="mb-small-note" id="minibia-bot-cave-transition-status">Transitions: none</span>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-cave-pause-until-clear" /><span>Pause Until Clear</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-cave-strict-mode" /><span>Strict Mode (inteligente)</span></label>
              <div class="mb-row-three"><span>Loop Type</span><select id="minibia-bot-cave-loop-type"><option value="reverse">Volta (reverse)</option><option value="restart">Pula pro 1º (restart)</option></select></div>
              <div class="mb-row-three"><span>Max Proximity Skip</span><input type="number" id="minibia-bot-cave-max-proximity-skip" min="1" max="10" value="3" placeholder="3" style="width:60px" /></div>
              <div class="mb-row-three"><label class="mb-toggle"><input type="checkbox" id="minibia-bot-cave-pause-until-spawn" /><span>Pause Until Monster on Floor</span></label><span></span><input type="number" id="minibia-bot-cave-spawn-floor-offset" placeholder="+1" style="width:50px" /></div>
              <div class="mb-actions-inline-two"><button type="button" id="minibia-bot-cave-start">Start</button><button type="button" id="minibia-bot-cave-stop">Stop</button></div>
              <span class="mb-small-note" id="minibia-bot-cave-status">Status: no waypoints</span>
              <span class="mb-small-note">Hotkey: Insert iniciar • Delete parar</span>
            </div>
          </div>
        </div>

        <!-- ABA: Panic -->
        <div class="mb-tab-content" data-tab="panic">
          <div class="mb-group"><span class="mb-group-title">Panic Runner</span>
            <div class="mb-stack">
              <span class="mb-label" id="minibia-bot-home">Home PZ: not set</span>
              <button type="button" id="minibia-bot-set-home">Set Home (current spot)</button>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-unknown" /><span>Flee on unknown player</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-health" /><span>Flee on health loss</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-return" /><span>Auto return after flee</span></label>
              <div class="mb-inline"><input type="text" id="minibia-bot-panic-trusted-input" placeholder="Trusted player name" style="width:100%" /><button type="button" class="mb-small-button" id="minibia-bot-panic-trusted-add">Add</button></div>
              <div class="mb-list" id="minibia-bot-panic-trusted-list"></div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">GM Kill Switch</span>
            <div class="mb-stack">
              <div class="mb-inline"><input type="text" id="minibia-bot-panic-gm-input" placeholder="Game master name" style="width:100%" /><button type="button" class="mb-small-button" id="minibia-bot-panic-gm-add">Add</button></div>
              <div class="mb-list" id="minibia-bot-panic-gm-list"></div>
            </div>
          </div>
        </div>

        <!-- ABA: Extra (Friend Heal + Auto Spell) -->
        <div class="mb-tab-content" data-tab="extra">
          <div class="mb-group"><span class="mb-group-title">Friend Heal</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-friend-heal-enabled" /><span>Enable Friend Heal</span></label>
              <div class="mb-field"><span class="mb-field-label">Nome do player a curar</span><input type="text" id="minibia-bot-friend-heal-target" placeholder="ex: Xanathos" style="width:100%" /></div>
              <div class="mb-field"><span class="mb-field-label">Feitiço</span><input type="text" id="minibia-bot-friend-heal-spell" placeholder="exura sio" style="width:100%" /></div>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Curar quando HP% ≤</span><input type="number" id="minibia-bot-friend-heal-hp" min="1" max="100" placeholder="70" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown (ms)</span><input type="number" id="minibia-bot-friend-heal-cooldown" min="500" placeholder="1500" /></div>
              </div>
              <span class="mb-small-note" id="minibia-bot-friend-heal-status">Status: parado</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Spell (AoE)</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-spell-enabled" /><span>Enable Auto Spell</span></label>
              <div class="mb-field"><span class="mb-field-label">Feitiço</span><input type="text" id="minibia-bot-auto-spell-words" placeholder="exori" style="width:100%" /></div>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Mínimo de mobs</span><input type="number" id="minibia-bot-auto-spell-min-mobs" min="1" placeholder="2" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown (ms)</span><input type="number" id="minibia-bot-auto-spell-cooldown" min="500" placeholder="2000" /></div>
              </div>
              <span class="mb-small-note" id="minibia-bot-auto-spell-status">Status: parado</span>
            </div>
          </div>
        </div>

        <!-- ABA: Tools -->
        <div class="mb-tab-content" data-tab="tools">
          <div class="mb-group"><span class="mb-group-title">Xray</span>
            <div class="mb-stack">
              <div class="mb-actions-inline-two"><button type="button" id="minibia-bot-xray-overlay-toggle">Enable Overlay</button><select id="minibia-bot-xray-floor-select"><option value="all">All floors</option></select></div>
              <span class="mb-small-note" id="minibia-bot-xray-overlay-status">Overlay: off</span>
              <div class="mb-list" id="minibia-bot-visible-creatures-list"></div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Talk (Gemini)</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-talk-enabled" /><span>Enable Auto Reply</span></label>
              <div class="mb-field"><span class="mb-field-label">Gemini API Key</span><input type="password" id="minibia-bot-talk-api-key" placeholder="API key" style="width:100%" /></div>
              <div class="mb-field"><span class="mb-field-label">Reply Prompt</span><textarea id="minibia-bot-talk-prompt" placeholder="Reply style prompt" style="width:100%"></textarea></div>
              <span class="mb-small-note" id="minibia-bot-talk-status">Status: idle</span>
            </div>
          </div>
        </div>

        <!-- ABA: Config -->
        <div class="mb-tab-content" data-tab="config">
          <div class="mb-group"><span class="mb-group-title">Profiles</span>
            <div class="mb-stack">
              <span class="mb-small-note" id="minibia-bot-profiles-active">Active: none</span>
              <div class="mb-field"><span class="mb-field-label">Profile Name</span><input type="text" id="minibia-bot-profiles-name-input" placeholder="e.g. Mage lvl 100" style="width:100%" /></div>
              <div class="mb-actions-inline-two"><button type="button" id="minibia-bot-profiles-save">Save Current</button><button type="button" id="minibia-bot-profiles-load">Load</button></div>
              <div class="mb-field"><span class="mb-field-label">Saved Profiles</span><select id="minibia-bot-profiles-select" style="width:100%"></select></div>
              <div class="mb-actions-inline-two"><button type="button" id="minibia-bot-profiles-delete">Delete</button><button type="button" id="minibia-bot-profiles-export">Export JSON</button></div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Export / Import Config</span>
            <div class="mb-stack">
              <span class="mb-small-note">Exporta/importa todas as configurações do bot (heal, cave, attack, etc). Útil para fazer backup ou migrar para outro PC.</span>
              <div class="mb-actions-inline-two">
                <button type="button" id="minibia-bot-export-config">Exportar Config</button>
                <button type="button" id="minibia-bot-import-config">Importar Config</button>
              </div>
              <span class="mb-small-note" id="minibia-bot-config-status"></span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Bot</span>
            <div class="mb-stack"><button type="button" id="minibia-bot-reload">Reload Bot</button></div>
          </div>
        </div>

      </div>
      <div class="mb-statusbar">
        <div class="mb-statuspanel" id="minibia-bot-status-hp">HP: --</div>
        <div class="mb-statuspanel" id="minibia-bot-status-mana">MP: --</div>
        <div class="mb-statuspanel" id="minibia-bot-status-run">Idle</div>
      </div>
    `;
    document.body.appendChild(panel);

    const unlockAudio=()=>bot.unlockAudio?.();
    panel.addEventListener("pointerdown",unlockAudio,{passive:true});
    panel.addEventListener("keydown",unlockAudio);
    bot.addCleanup(()=>{panel.removeEventListener("pointerdown",unlockAudio);panel.removeEventListener("keydown",unlockAudio);});

    applySavedPanelPosition(panel);
    enableDrag(panel);
    setPanelCollapsed(panel, getSavedPanelCollapsed());
    initAccordions(panel);

    const activeTabKey="minibiaBot.ui.activeTab";
    function switchTab(tabId){panel.querySelectorAll(".mb-tab").forEach(t=>t.classList.toggle("mb-tab-active",t.dataset.tab===tabId));panel.querySelectorAll(".mb-tab-content").forEach(c=>c.classList.toggle("mb-tab-active",c.dataset.tab===tabId));bot.storage.set(activeTabKey,tabId);}
    panel.querySelectorAll(".mb-tab").forEach(tab=>tab.addEventListener("click",()=>switchTab(tab.dataset.tab)));
    switchTab(bot.storage.get(activeTabKey,"heal"));

    // Status bar
    const sbt=window.setInterval(()=>{const snap=bot.getPlayerSnapshot?.();const hpEl=document.getElementById("minibia-bot-status-hp");const mpEl=document.getElementById("minibia-bot-status-mana");const runEl=document.getElementById("minibia-bot-status-run");if(hpEl&&snap?.health!=null)hpEl.textContent="HP: "+snap.health+"/"+(snap.maxHealth||"?");if(mpEl&&snap?.mana!=null)mpEl.textContent="MP: "+snap.mana+"/"+(snap.maxMana||"?");if(runEl){const r=bot.rune?.status?.().running||bot.heal?.status?.().running||bot.attack?.status?.().running||bot.cave?.status?.().running||bot.autoStack?.status?.().running;runEl.textContent=r?"Running":"Idle";runEl.style.color=r?"#006400":"#000";}},1000);
    bot.addCleanup(()=>window.clearInterval(sbt));

    // ── Collapse ──────────────────────────────────────────────
    panel.querySelector("#minibia-bot-collapse")?.addEventListener("click",()=>setPanelCollapsed(panel,panel.dataset.collapsed!=="true"));
    panel.querySelector("#minibia-bot-reload")?.addEventListener("click",()=>window.minibiaBotReload?.());
    panel.querySelector("#minibia-bot-set-home")?.addEventListener("click",()=>{bot.pz.setHomePzCurrentSpot();refreshHomeLabel();});

    // ── Export/Import Config ──────────────────────────────────
    panel.querySelector("#minibia-bot-export-config")?.addEventListener("click",async()=>{
      const json=exportConfig(); let copied=false;
      try{if(navigator?.clipboard?.writeText){await navigator.clipboard.writeText(json);copied=true;}}catch(e){}
      const lbl=document.getElementById("minibia-bot-config-status");
      if(copied){if(lbl)lbl.textContent="✓ Config copiada para o clipboard!";}
      else{window.prompt("Copie o JSON abaixo:",json);}
    });
    panel.querySelector("#minibia-bot-import-config")?.addEventListener("click",()=>{
      const json=window.prompt("Cole o JSON de config aqui:");
      if(!json) return;
      const lbl=document.getElementById("minibia-bot-config-status");
      if(importConfig(json)){if(lbl)lbl.textContent="✓ Config importada! Recarregue o bot.";setTimeout(()=>window.minibiaBotReload?.(),1000);}
      else{if(lbl)lbl.textContent="✗ JSON inválido.";}
    });

    // ── Heal ──────────────────────────────────────────────────
    const hpThreshold1I=panel.querySelector("#minibia-bot-hp-threshold1");
    const hpHotkey1I=panel.querySelector("#minibia-bot-hp-hotkey1");
    const hpThreshold2I=panel.querySelector("#minibia-bot-hp-threshold2");
    const hpHotkey2I=panel.querySelector("#minibia-bot-hp-hotkey2");
    const manaThresholdI=panel.querySelector("#minibia-bot-mana-threshold");
    const manaHotkeyI=panel.querySelector("#minibia-bot-mana-hotkey");
    const healEnabledI=panel.querySelector("#minibia-bot-auto-heal-enabled");
    if(hpThreshold1I){hpThreshold1I.value=String(bot.heal?.config?.hpThreshold1??90);hpThreshold1I.addEventListener("change",()=>{const v=Math.min(100,Math.max(1,Number(hpThreshold1I.value)||90));hpThreshold1I.value=String(v);bot.heal.updateConfig({hpThreshold1:v});});}
    if(hpHotkey1I){hpHotkey1I.value=String(bot.heal?.config?.hpHotbarSlot1??1);hpHotkey1I.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(hpHotkey1I.value)||1));hpHotkey1I.value=String(v);bot.heal.updateConfig({hpHotbarSlot1:v});});}
    if(hpThreshold2I){hpThreshold2I.value=String(bot.heal?.config?.hpThreshold2??60);hpThreshold2I.addEventListener("change",()=>{const v=Math.min(100,Math.max(1,Number(hpThreshold2I.value)||60));hpThreshold2I.value=String(v);bot.heal.updateConfig({hpThreshold2:v});});}
    if(hpHotkey2I){hpHotkey2I.value=String(bot.heal?.config?.hpHotbarSlot2??2);hpHotkey2I.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(hpHotkey2I.value)||2));hpHotkey2I.value=String(v);bot.heal.updateConfig({hpHotbarSlot2:v});});}
    if(manaThresholdI){manaThresholdI.value=String(bot.heal?.config?.manaThreshold??50);manaThresholdI.addEventListener("change",()=>{const v=Math.min(100,Math.max(1,Number(manaThresholdI.value)||50));manaThresholdI.value=String(v);bot.heal.updateConfig({manaThreshold:v});});}
    if(manaHotkeyI){manaHotkeyI.value=String(bot.heal?.config?.manaHotbarSlot??3);manaHotkeyI.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(manaHotkeyI.value)||3));manaHotkeyI.value=String(v);bot.heal.updateConfig({manaHotbarSlot:v});});}
    const healCooldownI=panel.querySelector("#minibia-bot-heal-cooldown");
    const healRetryI=panel.querySelector("#minibia-bot-heal-retry");
    if(healCooldownI){healCooldownI.value=String(bot.heal?.config?.healCooldownMs??100);healCooldownI.addEventListener("change",()=>{const v=Math.max(50,Number(healCooldownI.value)||100);healCooldownI.value=String(v);bot.heal.updateConfig({healCooldownMs:v});});}
    if(healRetryI){healRetryI.value=String(bot.heal?.config?.healRetryMs??100);healRetryI.addEventListener("change",()=>{const v=Math.max(50,Number(healRetryI.value)||100);healRetryI.value=String(v);bot.heal.updateConfig({healRetryMs:v});});}
    if(healEnabledI){
      healEnabledI.checked=!!bot.heal?.status?.().running;
      healEnabledI.addEventListener("change",()=>{
        if(healEnabledI.checked){
          bot.heal.start({
            hpThreshold1  : Math.min(100,Math.max(1,Number(hpThreshold1I?.value)||90)),
            hpHotbarSlot1 : Math.min(12,Math.max(1,Number(hpHotkey1I?.value)||1)),
            hpThreshold2  : Math.min(100,Math.max(1,Number(hpThreshold2I?.value)||60)),
            hpHotbarSlot2 : Math.min(12,Math.max(1,Number(hpHotkey2I?.value)||2)),
            manaThreshold : Math.min(100,Math.max(1,Number(manaThresholdI?.value)||50)),
            manaHotbarSlot: Math.min(12,Math.max(1,Number(manaHotkeyI?.value)||3)),
            healCooldownMs: Math.max(50,Number(healCooldownI?.value)||100),
            healRetryMs   : Math.max(50,Number(healRetryI?.value)||100),
          });
        } else { bot.heal.stop(); }
        refreshAutoHealStatus();
      });
    }

    // ── Eat ───────────────────────────────────────────────────
    const eatHotkeyI=panel.querySelector("#minibia-bot-auto-eat-hotkey");
    const eatEnabledI=panel.querySelector("#minibia-bot-auto-eat-enabled");
    if(eatHotkeyI){eatHotkeyI.value=String(bot.eat?.config?.eatHotbarSlot??10);eatHotkeyI.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(eatHotkeyI.value)||1));eatHotkeyI.value=String(v);bot.eat.updateConfig({eatHotbarSlot:v});});}
    if(eatEnabledI){eatEnabledI.checked=!!bot.eat?.status?.().running;eatEnabledI.addEventListener("change",()=>{const s=Math.min(12,Math.max(1,Number(eatHotkeyI?.value)||bot.eat.config.eatHotbarSlot||1));if(eatEnabledI.checked)bot.eat.start({eatHotbarSlot:s});else bot.eat.stop();refreshAutoEatStatus();});}

    // ── Invisible / MagicShield / EquipRing ───────────────────
    const invI=panel.querySelector("#minibia-bot-auto-invisible-enabled");
    if(invI){invI.checked=!!bot.invisible?.status?.().running;invI.addEventListener("change",()=>{if(invI.checked)bot.invisible.start();else bot.invisible.stop();refreshAutoInvisibleStatus();});}
    const msI=panel.querySelector("#minibia-bot-auto-magic-shield-enabled");
    if(msI){msI.checked=!!bot.magicShield?.status?.().running;msI.addEventListener("change",()=>{if(msI.checked)bot.magicShield.start();else bot.magicShield.stop();refreshAutoMagicShieldStatus();});}
    const erI=panel.querySelector("#minibia-bot-equip-ring-enabled");
    if(erI){erI.checked=!!bot.equipRing?.status?.().running;erI.addEventListener("change",()=>{if(erI.checked)bot.equipRing.start();else bot.equipRing.stop();refreshEquipRingStatus();});}

    // ── Auto Stack ────────────────────────────────────────────
    const asTickI=panel.querySelector("#minibia-bot-auto-stack-tick");
    const asNowB=panel.querySelector("#minibia-bot-auto-stack-now");
    const asEnabledI=panel.querySelector("#minibia-bot-auto-stack-enabled");
    if(asTickI){asTickI.value=String(bot.autoStack?.config?.tickMs??2000);asTickI.addEventListener("change",()=>{const v=Math.max(500,Number(asTickI.value)||2000);asTickI.value=String(v);bot.autoStack?.updateConfig?.({tickMs:v});});}
    if(asNowB){asNowB.addEventListener("click",()=>{const m=bot.autoStack?.runOnce?.();const l=document.getElementById("minibia-bot-auto-stack-status");if(l)l.textContent=`Agrupados: ${m??0} merge(s)`;});}
    if(asEnabledI){asEnabledI.checked=!!bot.autoStack?.status?.().running;asEnabledI.addEventListener("change",()=>{const t=Math.max(500,Number(asTickI?.value)||2000);if(asEnabledI.checked)bot.autoStack?.start?.({tickMs:t});else bot.autoStack?.stop?.();refreshAutoStackStatus();});}

    // ── Auto Ring por Cap ─────────────────────────────────────
    const capMinI=panel.querySelector("#mb-capring-min");
    const capPutI=panel.querySelector("#mb-capring-put");
    const capCdI=panel.querySelector("#mb-capring-cd");
    const capEnI=panel.querySelector("#mb-capring-enabled");
    const capClrB=panel.querySelector("#mb-capring-clear-origin");
    if(capMinI){capMinI.value=String(bot.autoRingByCap?.config?.capMin??200);capMinI.addEventListener("change",()=>{const v=Math.max(0,Number(capMinI.value)||0);capMinI.value=String(v);bot.autoRingByCap?.updateConfig?.({capMin:v});refreshCapRingStatus();});}
    if(capPutI){capPutI.value=String(bot.autoRingByCap?.config?.capPut??300);capPutI.addEventListener("change",()=>{const v=Math.max(0,Number(capPutI.value)||0);capPutI.value=String(v);bot.autoRingByCap?.updateConfig?.({capPut:v});refreshCapRingStatus();});}
    if(capCdI){capCdI.value=String(bot.autoRingByCap?.config?.equipCooldownMs??1500);capCdI.addEventListener("change",()=>{const v=Math.max(500,Number(capCdI.value)||1500);capCdI.value=String(v);bot.autoRingByCap?.updateConfig?.({equipCooldownMs:v});});}
    if(capClrB){capClrB.addEventListener("click",()=>{bot.autoRingByCap?.clearOrigin?.();refreshCapRingStatus();});}
    if(capEnI){capEnI.checked=!!bot.autoRingByCap?.status?.().running;capEnI.addEventListener("change",()=>{if(capEnI.checked)bot.autoRingByCap?.start?.({capMin:Math.max(0,Number(capMinI?.value)||200),capPut:Math.max(0,Number(capPutI?.value)||300),equipCooldownMs:Math.max(500,Number(capCdI?.value)||1500)});else bot.autoRingByCap?.stop?.();refreshCapRingStatus();});}

    // ── Haste ────────────────────────────────────────────
    const hasteSpellI=panel.querySelector("#mb-haste-spell");
    const hasteEnI=panel.querySelector("#mb-haste-enabled");
    if(hasteSpellI){hasteSpellI.value=bot.haste?.config?.spellwords??"utani hur";hasteSpellI.addEventListener("change",()=>{bot.haste?.updateconfig?.({spellwords:hasteSpellI.value.trim()});});}
    if(hasteEnI){hasteEnI.checked=!!bot.haste?.status?.().running;hasteEnI.addEventListener("change",()=>{if(hasteEnI.checked)bot.haste?.start?.({spellwords:hasteSpellI?.value?.trim()||"utani hur"});else bot.haste?.stop?.();refreshHasteStatus();});}

    // ── Rune ──────────────────────────────────────────────────
    const spellI=panel.querySelector("#minibia-bot-rune-spell");
    const manaMinI=panel.querySelector("#minibia-bot-rune-mana-min");
    const manaMaxI=panel.querySelector("#minibia-bot-rune-mana-max");
    const runeI=panel.querySelector("#minibia-bot-rune-enabled");
    if(spellI){spellI.value=bot.rune?.config?.runeSpellWords||"";spellI.addEventListener("change",()=>bot.rune.updateConfig({runeSpellWords:spellI.value.trim()}));}
    function syncRuneMana(r=bot.rune?.config){if(!r)return;const mn=Math.max(0,Number(r.runeManaMin??r.runeManaCost)||0);const mx=Math.max(0,Number(r.runeManaMax??r.runeManaCost)||0);if(manaMinI)manaMinI.value=String(Math.min(mn,mx));if(manaMaxI)manaMaxI.value=String(Math.max(mn,mx));}
    syncRuneMana();
    manaMinI?.addEventListener("change",()=>{bot.rune.updateConfig({runeManaMin:Math.max(0,Number(manaMinI.value)||0),runeManaMax:Math.max(0,Number(manaMaxI?.value)||0)});syncRuneMana(bot.rune.config);});
    manaMaxI?.addEventListener("change",()=>{bot.rune.updateConfig({runeManaMin:Math.max(0,Number(manaMinI?.value)||0),runeManaMax:Math.max(0,Number(manaMaxI.value)||0)});syncRuneMana(bot.rune.config);});
    if(runeI){runeI.checked=!!bot.rune?.status?.().running;runeI.addEventListener("change",()=>{if(runeI.checked)bot.rune.start({runeSpellWords:spellI?.value?.trim()||bot.rune.config.runeSpellWords,runeManaMin:Math.max(0,Number(manaMinI?.value)||0),runeManaMax:Math.max(0,Number(manaMaxI?.value)||0)});else bot.rune.stop();refreshRuneStatus();});}

    // ── Attack ────────────────────────────────────────────────
    const atkDistI=panel.querySelector("#minibia-bot-auto-attack-max-distance");
    const atkHkI=panel.querySelector("#minibia-bot-auto-attack-hotkey");
    const atkRuneHkI=panel.querySelector("#minibia-bot-auto-attack-rune-hotkey");
    const atkMeleeI=panel.querySelector("#minibia-bot-auto-attack-melee");
    const atkSkillI=panel.querySelector("#minibia-bot-auto-attack-skill-train");
    const atkTargetI=panel.querySelector("#minibia-bot-auto-attack-target-input");
    const atkTargetAddB=panel.querySelector("#minibia-bot-auto-attack-target-add");
    const atkEnabledI=panel.querySelector("#minibia-bot-auto-attack-enabled");
    if(atkDistI){atkDistI.value=String(bot.attack?.config?.maxTargetDistance??6);atkDistI.addEventListener("change",()=>{const v=Math.min(15,Math.max(1,Math.trunc(Number(atkDistI.value)||6)));atkDistI.value=String(v);bot.attack.updateConfig({maxTargetDistance:v});});}
    if(atkHkI){atkHkI.value=String(bot.attack?.config?.targetHotbarSlot??3);atkHkI.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(atkHkI.value)||1));atkHkI.value=String(v);bot.attack.updateConfig({targetHotbarSlot:v});});}
    if(atkRuneHkI){atkRuneHkI.value=bot.attack?.config?.runeHotbarSlot?String(bot.attack.config.runeHotbarSlot):"";atkRuneHkI.addEventListener("change",()=>{const r=Number(atkRuneHkI.value);const v=Number.isFinite(r)&&r>=1&&r<=12?Math.trunc(r):null;atkRuneHkI.value=v?String(v):"";bot.attack.updateConfig({runeHotbarSlot:v});});}
    if(atkMeleeI){atkMeleeI.checked=bot.attack?.config?.meleeMode!==false;atkMeleeI.addEventListener("change",()=>bot.attack.updateConfig({meleeMode:atkMeleeI.checked}));}
    if(atkSkillI){atkSkillI.checked=!!bot.attack?.config?.skillTrainOnMonster;atkSkillI.addEventListener("change",()=>bot.attack.updateConfig({skillTrainOnMonster:atkSkillI.checked}));}
    function addAttackTarget(){const raw=atkTargetI?.value?.trim()||"";if(!raw)return;const cur=bot.attack?.config?.targetNames||[];if(!cur.some(n=>n.trim().toLowerCase()===raw.toLowerCase()))bot.attack.updateConfig({targetNames:[...cur,raw]});if(atkTargetI)atkTargetI.value="";renderAttackTargetNames();}
    atkTargetAddB?.addEventListener("click",addAttackTarget);
    atkTargetI?.addEventListener("keydown",(e)=>{if(e.key==="Enter"){e.preventDefault();addAttackTarget();}});
    const atkRuneCdI=panel.querySelector("#minibia-bot-auto-attack-rune-cooldown");
    if(atkRuneCdI){atkRuneCdI.value=String(bot.attack?.config?.runeCooldownMs??1200);atkRuneCdI.addEventListener("change",()=>{const v=Math.max(200,Number(atkRuneCdI.value)||1200);atkRuneCdI.value=String(v);bot.attack.updateConfig({runeCooldownMs:v});});}
    if(atkEnabledI){atkEnabledI.checked=!!bot.attack?.status?.().running;atkEnabledI.addEventListener("change",()=>{const th=Math.min(12,Math.max(1,Number(atkHkI?.value)||bot.attack.config.targetHotbarSlot||1));const rh=(()=>{const r=Number(atkRuneHkI?.value);return Number.isFinite(r)&&r>=1&&r<=12?Math.trunc(r):bot.attack.config.runeHotbarSlot??null;})();const ml=!!atkMeleeI?.checked;const st=!!atkSkillI?.checked;const md=Math.min(15,Math.max(1,Math.trunc(Number(atkDistI?.value)||bot.attack.config.maxTargetDistance||6)));const rc=Math.max(200,Number(atkRuneCdI?.value)||bot.attack.config.runeCooldownMs||1200);if(atkEnabledI.checked)bot.attack.start({targetHotbarSlot:th,runeHotbarSlot:rh,meleeMode:ml,skillTrainOnMonster:st,maxTargetDistance:md,runeCooldownMs:rc});else bot.attack.stop();refreshAutoAttackStatus();});}

    // ── Distance Attack ───────────────────────────────────────
    const daKeepI=panel.querySelector("#minibia-bot-distance-keep");
    const daHkI=panel.querySelector("#minibia-bot-distance-hotkey");
    const daCdI=panel.querySelector("#minibia-bot-distance-cooldown");
    const daEnabledI=panel.querySelector("#minibia-bot-distance-attack-enabled");
    if(daKeepI){daKeepI.value=String(bot.distanceAttack?.config?.keepDistance??3);daKeepI.addEventListener("change",()=>{const v=Math.max(1,Math.min(10,Number(daKeepI.value)||3));daKeepI.value=String(v);bot.distanceAttack?.updateConfig?.({keepDistance:v});});}
    if(daHkI){daHkI.value=String(bot.distanceAttack?.config?.runeHotbarSlot??4);daHkI.addEventListener("change",()=>{const v=Math.max(1,Math.min(12,Number(daHkI.value)||4));daHkI.value=String(v);bot.distanceAttack?.updateConfig?.({runeHotbarSlot:v});});}
    if(daCdI){daCdI.value=String(bot.distanceAttack?.config?.runeCooldownMs??1200);daCdI.addEventListener("change",()=>{const v=Math.max(200,Number(daCdI.value)||1200);daCdI.value=String(v);bot.distanceAttack?.updateConfig?.({runeCooldownMs:v});});}
    if(daEnabledI){daEnabledI.checked=!!bot.distanceAttack?.status?.().running;daEnabledI.addEventListener("change",()=>{if(daEnabledI.checked)bot.distanceAttack?.start?.({keepDistance:Math.max(1,Math.min(10,Number(daKeepI?.value)||3)),runeHotbarSlot:Math.max(1,Math.min(12,Number(daHkI?.value)||4)),runeCooldownMs:Math.max(200,Number(daCdI?.value)||1200)});else bot.distanceAttack?.stop?.();refreshDistanceAttackStatus();});}

    // ── Melee Position ───────────────────────────────────────
    const meleeEI   = panel.querySelector("#mb-melee-enabled");
    const meleeSlotI= panel.querySelector("#mb-melee-slot");
    const meleeCdI  = panel.querySelector("#mb-melee-cd");
    const meleeModeI= panel.querySelector("#mb-melee-mode");
    const meleeReqI = panel.querySelector("#mb-melee-require");
    function refreshMeleePosition() {
      const s = bot.meleePosition?.status?.();
      if(meleeEI) meleeEI.checked = !!s?.running;
      const l = document.getElementById("mb-melee-status");
      if(l) {
        if(s?.running) {
          const adj = s.isAdjacent ? "✓ adjacente" : "✗ movendo...";
          const tgt = s.currentTarget ? `${s.currentTarget.name} (${s.currentTarget.direction})` : "nenhum";
          l.textContent = `Status: ativo • ${adj} • alvo: ${tgt}`;
        } else { l.textContent = "Status: parado"; }
      }
    }
    if(meleeSlotI){meleeSlotI.value=String(bot.meleePosition?.config?.spellHotbarSlot??5);meleeSlotI.addEventListener("change",()=>{const v=Math.max(1,Math.min(12,Number(meleeSlotI.value)||5));meleeSlotI.value=String(v);bot.meleePosition?.updateConfig?.({spellHotbarSlot:v});});}
    if(meleeCdI){meleeCdI.value=String(bot.meleePosition?.config?.spellCooldownMs??2000);meleeCdI.addEventListener("change",()=>{const v=Math.max(200,Number(meleeCdI.value)||2000);meleeCdI.value=String(v);bot.meleePosition?.updateConfig?.({spellCooldownMs:v});});}
    if(meleeModeI){meleeModeI.value=bot.meleePosition?.config?.mode||"any";meleeModeI.addEventListener("change",()=>bot.meleePosition?.updateConfig?.({mode:meleeModeI.value}));}
    if(meleeReqI){meleeReqI.value=String(bot.meleePosition?.config?.requireAdjacent!==false);meleeReqI.addEventListener("change",()=>bot.meleePosition?.updateConfig?.({requireAdjacent:meleeReqI.value==="true"}));}
    if(meleeEI){meleeEI.checked=!!bot.meleePosition?.status?.().running;meleeEI.addEventListener("change",()=>{if(meleeEI.checked)bot.meleePosition?.start?.({spellHotbarSlot:Math.max(1,Math.min(12,Number(meleeSlotI?.value)||5)),spellCooldownMs:Math.max(200,Number(meleeCdI?.value)||2000),mode:meleeModeI?.value||"any",requireAdjacent:meleeReqI?.value!=="false"});else bot.meleePosition?.stop?.();refreshMeleePosition();});}
    const meleeTid=window.setInterval(refreshMeleePosition,1000); bot.addCleanup(()=>window.clearInterval(meleeTid));
    refreshMeleePosition();

    // ── Follow ────────────────────────────────────────────────
    const followEI=panel.querySelector("#minibia-bot-follow-enabled");
    const followTI=panel.querySelector("#minibia-bot-follow-target");
    const followDI=panel.querySelector("#minibia-bot-follow-distance");
    if(followTI){followTI.value=bot.follow?.config?.targetPlayerName||"";followTI.addEventListener("change",()=>{bot.follow?.updateConfig?.({targetPlayerName:followTI.value.trim()});refreshFollowStatus();});}
    if(followDI){followDI.value=String(bot.follow?.config?.followDistance??2);followDI.addEventListener("change",()=>{const d=Math.max(0,Math.min(10,Math.trunc(Number(followDI.value)||0)));followDI.value=String(d);bot.follow?.updateConfig?.({followDistance:d});refreshFollowStatus();});}
    if(followEI){followEI.checked=!!bot.follow?.status?.().running;followEI.addEventListener("change",()=>{const n=followTI?.value?.trim()||bot.follow?.config?.targetPlayerName||"";const d=Math.max(0,Math.min(10,Math.trunc(Number(followDI?.value)||2)));if(followEI.checked)bot.follow?.start?.({targetPlayerName:n,followDistance:d});else bot.follow?.stop?.();refreshFollowStatus();});}

    // ── Cave ──────────────────────────────────────────────────
    panel.querySelector("#minibia-bot-cave-record")?.addEventListener("click",()=>{bot.cave.addWaypointCurrentSpot();refreshCavePresetControls();refreshCaveClosestStatus();refreshCaveTransitionStatus();});
    panel.querySelector("#minibia-bot-cave-add-delay")?.addEventListener("click",()=>{const r=window.prompt("Delay in seconds:","90");if(r==null)return;const s=Math.max(1,Math.trunc(Number(r)||0));if(!Number.isFinite(s)||s<=0){window.alert("Invalid number.");return;}bot.cave.addDelay(s);refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    panel.querySelector("#minibia-bot-cave-remove-last")?.addEventListener("click",()=>{bot.cave.removeLastWaypoint();refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    const cpucI=panel.querySelector("#minibia-bot-cave-pause-until-clear");
    if(cpucI){cpucI.checked=bot.cave?.config?.pauseUntilClear!==false;cpucI.addEventListener("change",()=>{bot.cave.updateConfig({pauseUntilClear:cpucI.checked});refreshCaveStatus();});}
    const caveStrictModeI=panel.querySelector("#minibia-bot-cave-strict-mode");
    if(caveStrictModeI){caveStrictModeI.checked=!!bot.cave?.config?.strictMode;caveStrictModeI.addEventListener("change",()=>{bot.cave.updateConfig({strictMode:caveStrictModeI.checked});refreshCaveStatus();});}
    const caveLoopTypeI=panel.querySelector("#minibia-bot-cave-loop-type");
    if(caveLoopTypeI){caveLoopTypeI.value=bot.cave?.config?.loopType||"reverse";caveLoopTypeI.addEventListener("change",()=>{bot.cave.updateConfig({loopType:caveLoopTypeI.value});refreshCaveStatus();});}
    const caveMaxProximitySkipI=panel.querySelector("#minibia-bot-cave-max-proximity-skip");
    if(caveMaxProximitySkipI){caveMaxProximitySkipI.value=String(bot.cave?.config?.maxProximitySkip??3);caveMaxProximitySkipI.addEventListener("change",()=>{const v=Math.max(1,Math.trunc(Number(caveMaxProximitySkipI.value)||3));caveMaxProximitySkipI.value=String(v);bot.cave.updateConfig({maxProximitySkip:v});refreshCaveStatus();});}
    const csoI=panel.querySelector("#minibia-bot-cave-spawn-floor-offset");
    if(csoI){csoI.value=String(bot.cave?.config?.pauseUntilSpawnFloorOffset??1);csoI.addEventListener("change",()=>{const v=Math.trunc(Number(csoI.value)||0);csoI.value=String(v);bot.cave.updateConfig({pauseUntilSpawnFloorOffset:v});refreshCaveStatus();});}
    const cpusI=panel.querySelector("#minibia-bot-cave-pause-until-spawn");
    if(cpusI){cpusI.checked=!!bot.cave?.config?.pauseUntilSpawn;cpusI.addEventListener("change",()=>{bot.cave.updateConfig({pauseUntilSpawn:cpusI.checked,pauseUntilSpawnFloorOffset:Math.trunc(Number(csoI?.value)||bot.cave?.config?.pauseUntilSpawnFloorOffset||0)});refreshCaveStatus();});}
    panel.querySelector("#minibia-bot-cave-start")?.addEventListener("click",()=>{bot.cave.start();refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    panel.querySelector("#minibia-bot-cave-stop")?.addEventListener("click",()=>{bot.cave.stop();refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    const cpsI=panel.querySelector("#minibia-bot-cave-preset-select");
    cpsI?.addEventListener("change",()=>{const n=cpsI.value||"";if(!n||n===bot.cave?.getActivePresetName?.())return;bot.cave.loadPreset(n);refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();refreshCaveTransitionStatus();});
    panel.querySelector("#minibia-bot-cave-preset-new")?.addEventListener("click",()=>{const n=window.prompt("Name the new cave preset:");if(n==null)return;if(!bot.cave.createPreset(n))return;refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    panel.querySelector("#minibia-bot-cave-preset-delete")?.addEventListener("click",()=>{const n=cpsI?.value||"";if(!n)return;if(!bot.cave.deletePreset(n))return;refreshCavePresetControls();refreshCaveStatus();});
    panel.querySelector("#minibia-bot-cave-preset-export")?.addEventListener("click",async()=>{const p=bot.cave?.exportPresets?.();if(!p){window.alert("Could not export.");return;}const s=JSON.stringify(p,null,2);let c=false;try{if(navigator?.clipboard?.writeText){await navigator.clipboard.writeText(s);c=true;}}catch(e){}if(c){window.alert("Cave presets copied to clipboard.");}else{window.prompt("Copy your cave presets JSON:",s);}});
    panel.querySelector("#minibia-bot-cave-preset-import")?.addEventListener("click",()=>{const i=window.prompt("Paste cave presets JSON:");if(i==null)return;const im=bot.cave?.importPresets?.(i);if(!im){window.alert("Import failed.");return;}refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();refreshCaveTransitionStatus();window.alert("Imported "+(im.presets?.length||0)+" preset(s).");});

    // ── Panic ─────────────────────────────────────────────────
    const puI=panel.querySelector("#minibia-bot-panic-unknown");
    const phI=panel.querySelector("#minibia-bot-panic-health");
    const prI=panel.querySelector("#minibia-bot-panic-return");
    const ptI=panel.querySelector("#minibia-bot-panic-trusted-input");
    const ptAB=panel.querySelector("#minibia-bot-panic-trusted-add");
    const pgI=panel.querySelector("#minibia-bot-panic-gm-input");
    const pgAB=panel.querySelector("#minibia-bot-panic-gm-add");
    if(puI){puI.checked=!!bot.panic?.status?.().config?.unknownPlayerEnabled;puI.addEventListener("change",()=>{bot.panic.updateConfig({unknownPlayerEnabled:puI.checked});refreshPanicStatus();});}
    if(phI){phI.checked=!!bot.panic?.status?.().config?.healthLossEnabled;phI.addEventListener("change",()=>{bot.panic.updateConfig({healthLossEnabled:phI.checked});refreshPanicStatus();});}
    if(prI){prI.checked=!!bot.panic?.status?.().config?.returnToOriginEnabled;prI.addEventListener("change",()=>{bot.panic.updateConfig({returnToOriginEnabled:prI.checked});refreshPanicStatus();});}
    function addTrusted(){const raw=ptI?.value?.trim()||"";if(!raw)return;const cur=bot.panic?.config?.trustedNames||[];if(!cur.some(n=>n.trim().toLowerCase()===raw.toLowerCase()))bot.panic.updateConfig({trustedNames:[...cur,raw]});if(ptI)ptI.value="";renderTrustedNames();}
    ptAB?.addEventListener("click",addTrusted);
    ptI?.addEventListener("keydown",(e)=>{if(e.key==="Enter"){e.preventDefault();addTrusted();}});
    function addGM(){const raw=pgI?.value?.trim()||"";if(!raw)return;const cur=bot.panic?.config?.gameMasterNames||[];if(!cur.some(n=>n.trim().toLowerCase()===raw.toLowerCase()))bot.panic.updateConfig({gameMasterNames:[...cur,raw]});if(pgI)pgI.value="";renderGameMasterNames();}
    pgAB?.addEventListener("click",addGM);
    pgI?.addEventListener("keydown",(e)=>{if(e.key==="Enter"){e.preventDefault();addGM();}});

    // ── Friend Heal ───────────────────────────────────────────
    const fhEI=panel.querySelector("#minibia-bot-friend-heal-enabled");
    const fhTI=panel.querySelector("#minibia-bot-friend-heal-target");
    const fhSI=panel.querySelector("#minibia-bot-friend-heal-spell");
    const fhHpI=panel.querySelector("#minibia-bot-friend-heal-hp");
    const fhCdI=panel.querySelector("#minibia-bot-friend-heal-cooldown");
    if(fhTI){fhTI.value=bot.friendHeal?.config?.targetName||"";fhTI.addEventListener("change",()=>{bot.friendHeal?.updateConfig?.({targetName:fhTI.value.trim()});refreshFriendHealStatus();});}
    if(fhSI){fhSI.value=bot.friendHeal?.config?.spellWords||"exura sio";fhSI.addEventListener("change",()=>bot.friendHeal?.updateConfig?.({spellWords:fhSI.value.trim()}));}
    if(fhHpI){fhHpI.value=String(bot.friendHeal?.config?.minHpPercent??70);fhHpI.addEventListener("change",()=>{const v=Math.min(100,Math.max(1,Number(fhHpI.value)||70));fhHpI.value=String(v);bot.friendHeal?.updateConfig?.({minHpPercent:v});});}
    if(fhCdI){fhCdI.value=String(bot.friendHeal?.config?.healCooldownMs??1500);fhCdI.addEventListener("change",()=>{const v=Math.max(500,Number(fhCdI.value)||1500);fhCdI.value=String(v);bot.friendHeal?.updateConfig?.({healCooldownMs:v});});}
    if(fhEI){fhEI.checked=!!bot.friendHeal?.status?.().running;fhEI.addEventListener("change",()=>{if(fhEI.checked){bot.friendHeal?.updateConfig?.({targetName:fhTI?.value?.trim()||"",spellWords:fhSI?.value?.trim()||"exura sio",minHpPercent:Math.min(100,Math.max(1,Number(fhHpI?.value)||70)),healCooldownMs:Math.max(500,Number(fhCdI?.value)||1500)});if(!bot.friendHeal?.start?.())fhEI.checked=false;}else bot.friendHeal?.stop?.();refreshFriendHealStatus();});}

    // ── Auto Spell ────────────────────────────────────────────
    const asSpellI=panel.querySelector("#minibia-bot-auto-spell-words");
    const asMinMobsI=panel.querySelector("#minibia-bot-auto-spell-min-mobs");
    const asSpellCdI=panel.querySelector("#minibia-bot-auto-spell-cooldown");
    const asSpellEI=panel.querySelector("#minibia-bot-auto-spell-enabled");
    if(asSpellI){asSpellI.value=bot.autoSpell?.config?.spellWords||"exori";asSpellI.addEventListener("change",()=>bot.autoSpell?.updateConfig?.({spellWords:asSpellI.value.trim()}));}
    if(asMinMobsI){asMinMobsI.value=String(bot.autoSpell?.config?.minMobCount??2);asMinMobsI.addEventListener("change",()=>{const v=Math.max(1,Number(asMinMobsI.value)||2);asMinMobsI.value=String(v);bot.autoSpell?.updateConfig?.({minMobCount:v});});}
    if(asSpellCdI){asSpellCdI.value=String(bot.autoSpell?.config?.cooldownMs??2000);asSpellCdI.addEventListener("change",()=>{const v=Math.max(500,Number(asSpellCdI.value)||2000);asSpellCdI.value=String(v);bot.autoSpell?.updateConfig?.({cooldownMs:v});});}
    if(asSpellEI){asSpellEI.checked=!!bot.autoSpell?.status?.().running;asSpellEI.addEventListener("change",()=>{if(asSpellEI.checked)bot.autoSpell?.start?.({spellWords:asSpellI?.value?.trim()||"exori",minMobCount:Math.max(1,Number(asMinMobsI?.value)||2),cooldownMs:Math.max(500,Number(asSpellCdI?.value)||2000)});else bot.autoSpell?.stop?.();refreshAutoSpellStatus();});}

    // ── Xray ─────────────────────────────────────────────────
    const xrayOvB=panel.querySelector("#minibia-bot-xray-overlay-toggle");
    const xrayFsI=panel.querySelector("#minibia-bot-xray-floor-select");
    xrayOvB?.addEventListener("click",()=>{bot.xray?.setOverlayEnabled?.(!bot.xray?.status?.().config?.overlayEnabled);refreshXrayStatus();});
    xrayFsI?.addEventListener("change",()=>{const v=xrayFsI.value;bot.xray?.setSelectedFloor?.(v==="all"?null:Number(v));refreshXrayStatus();refreshVisibleCreatures();});

    // ── Talk ──────────────────────────────────────────────────
    const talkAkI=panel.querySelector("#minibia-bot-talk-api-key");
    const talkPrI=panel.querySelector("#minibia-bot-talk-prompt");
    const talkEI=panel.querySelector("#minibia-bot-talk-enabled");
    if(talkAkI){talkAkI.value=bot.talk?.config?.apiKey||"";talkAkI.addEventListener("change",()=>{bot.talk.updateConfig({apiKey:talkAkI.value.trim()});refreshTalkStatus();});}
    if(talkPrI){talkPrI.value=bot.talk?.config?.systemPrompt||"";talkPrI.addEventListener("change",()=>bot.talk.updateConfig({systemPrompt:talkPrI.value.trim()}));}
    if(talkEI){talkEI.checked=!!bot.talk?.status?.().running;talkEI.addEventListener("change",()=>{if(talkEI.checked){bot.talk.updateConfig({apiKey:talkAkI?.value?.trim()||"",systemPrompt:talkPrI?.value?.trim()||bot.talk.config.systemPrompt||""});if(!bot.talk.start())talkEI.checked=false;}else bot.talk.stop();refreshTalkStatus();});}

    // ── Profiles ──────────────────────────────────────────────
    const prNameI=panel.querySelector("#minibia-bot-profiles-name-input");
    const prSelI=panel.querySelector("#minibia-bot-profiles-select");
    const prSaveB=panel.querySelector("#minibia-bot-profiles-save");
    const prLoadB=panel.querySelector("#minibia-bot-profiles-load");
    const prDelB=panel.querySelector("#minibia-bot-profiles-delete");
    const prExpB=panel.querySelector("#minibia-bot-profiles-export");
    prSelI?.addEventListener("change",()=>{if(prNameI&&prSelI.value)prNameI.value=prSelI.value;});
    prSaveB?.addEventListener("click",()=>{const n=prNameI?.value?.trim()||"";if(!n){alert("Enter a profile name.");return;}bot.profiles?.save?.(n);refreshProfilesPanel();});
    prLoadB?.addEventListener("click",()=>{const n=prSelI?.value||prNameI?.value?.trim()||"";if(!n){alert("Select a profile to load.");return;}bot.profiles?.load?.(n);});
    prDelB?.addEventListener("click",()=>{const n=prSelI?.value||"";if(!n)return;if(!confirm("Delete profile: "+n+"?"))return;bot.profiles?.delete?.(n);if(prNameI)prNameI.value="";refreshProfilesPanel();});
    prExpB?.addEventListener("click",()=>{const n=prSelI?.value||"";bot.profiles?.export?.(n||null);});

    // ── Refresh inicial ───────────────────────────────────────
    refreshHomeLabel();refreshPanicStatus();refreshXrayStatus();
    renderGameMasterNames();renderTrustedNames();renderAttackTargetNames();
    refreshRuneStatus();refreshAutoHealStatus();refreshAutoInvisibleStatus();
    refreshAutoMagicShieldStatus();refreshAutoAttackStatus();refreshAutoEatStatus();
    refreshCaveStatus();refreshEquipRingStatus();refreshTalkStatus();
    refreshProfilesPanel();refreshFollowStatus();refreshVisibleCreatures();
    refreshCavePresetControls();refreshCaveClosestStatus();refreshCaveTransitionStatus();
    refreshAutoStackStatus();refreshCapRingStatus();refreshHasteStatus();refreshFriendHealStatus();refreshAutoSpellStatus();
    refreshDistanceAttackStatus();

    // ── Timers ────────────────────────────────────────────────
    const t1=window.setInterval(refreshVisibleCreatures,1000); bot.addCleanup(()=>window.clearInterval(t1));
    const t2=window.setInterval(()=>{refreshTalkStatus();refreshFollowStatus();refreshProfilesPanel();refreshAutoStackStatus();refreshCapRingStatus();refreshHasteStatus();refreshFriendHealStatus();refreshAutoSpellStatus();refreshDistanceAttackStatus();},1000); bot.addCleanup(()=>window.clearInterval(t2));
    const t3=window.setInterval(()=>{refreshCaveStatus();refreshCavePresetControls();refreshCaveClosestStatus();refreshCaveTransitionStatus();},1000); bot.addCleanup(()=>window.clearInterval(t3));
  }

  bot.ui = {
    inject, destroy,
    refreshHomeLabel, refreshPanicStatus, refreshXrayStatus,
    refreshRuneStatus, refreshAutoHealStatus, refreshAutoInvisibleStatus,
    refreshAutoMagicShieldStatus, refreshAutoAttackStatus, renderAttackTargetNames,
    refreshAutoEatStatus, refreshCaveStatus, refreshCavePresetControls,
    refreshEquipRingStatus, refreshTalkStatus, refreshProfilesPanel,
    refreshFollowStatus, refreshVisibleCreatures, refreshCaveClosestStatus,
    refreshCaveTransitionStatus, refreshAutoStackStatus, refreshCapRingStatus, refreshHasteStatus,
    refreshFriendHealStatus, refreshAutoSpellStatus, refreshDistanceAttackStatus,
    getSavedPanelPosition, getSavedPanelCollapsed,
    setPanelCollapsed:(collapsed)=>{const p=document.getElementById("minibia-bot-panel");setPanelCollapsed(p,collapsed);},
  };
};
