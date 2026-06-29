window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPanel = function installPanel(bot) {
  const panelPositionKey = "minibiaBot.ui.panelPosition";
  const panelCollapsedKey = "minibiaBot.ui.panelCollapsed";
  const expandedModulesKey = "minibiaBot.ui.expandedModules";

  function getExpandedModules() {
    return bot.storage.get(expandedModulesKey, {}) || {};
  }

  function saveExpandedModule(moduleId, expanded) {
    const next = { ...getExpandedModules(), [moduleId]: !!expanded };
    bot.storage.set(expandedModulesKey, next);
  }

  function initAccordions(panel) {
    const expanded = getExpandedModules();
    panel.querySelectorAll(".mb-accordion").forEach((accordion) => {
      const moduleId = accordion.dataset.module;
      if (!moduleId) return;
      const toggle = accordion.querySelector(".mb-accordion-toggle");
      const body = accordion.querySelector(".mb-accordion-body");
      const setExpanded = (nextExpanded) => {
        accordion.dataset.expanded = nextExpanded ? "true" : "false";
        if (body) body.hidden = !nextExpanded;
        if (toggle) {
          toggle.textContent = nextExpanded ? "−" : "+";
          toggle.setAttribute("aria-label", nextExpanded ? "Collapse section" : "Expand section");
        }
        saveExpandedModule(moduleId, nextExpanded);
      };
      setExpanded(expanded[moduleId] === true);
      accordion.querySelector(".mb-accordion-header")?.addEventListener("click", (event) => {
        if (event.target.closest("button, input, select, textarea, a, label")) return;
        setExpanded(accordion.dataset.expanded !== "true");
      });
      toggle?.addEventListener("click", (event) => {
        event.stopPropagation();
        setExpanded(accordion.dataset.expanded !== "true");
      });
    });
  }

  function destroy() {
    document.getElementById("minibia-bot-panel")?.remove();
    document.getElementById("minibia-bot-style")?.remove();
  }

  function savePanelPosition(position, key = panelPositionKey) { bot.storage.set(key, position); }
  function getSavedPanelPosition(key = panelPositionKey) { return bot.storage.get(key, null); }
  function savePanelCollapsed(collapsed) { bot.storage.set(panelCollapsedKey, !!collapsed); }
  function getSavedPanelCollapsed() { return !!bot.storage.get(panelCollapsedKey, false); }

  function refreshHomeLabel() {
    const homeLabel = document.getElementById("minibia-bot-home");
    if (!homeLabel) return;
    const home = bot.pz?.getHomePz?.();
    homeLabel.textContent = home ? `Panic Runner Home: ${home.x}, ${home.y}, ${home.z}` : "Panic Runner Home: not set";
  }

  function refreshPanicStatus() {
    const unknownToggle = document.getElementById("minibia-bot-panic-unknown");
    const healthToggle  = document.getElementById("minibia-bot-panic-health");
    const returnToggle  = document.getElementById("minibia-bot-panic-return");
    const status = bot.panic?.status?.();
    if (unknownToggle) unknownToggle.checked = !!status?.config?.unknownPlayerEnabled;
    if (healthToggle)  healthToggle.checked  = !!status?.config?.healthLossEnabled;
    if (returnToggle)  returnToggle.checked  = !!status?.config?.returnToOriginEnabled;
  }

  function refreshXrayStatus() {
    const status = bot.xray?.status?.();
    const me = bot.getPlayerPosition?.();
    const overlayButton = document.getElementById("minibia-bot-xray-overlay-toggle");
    const overlayLabel  = document.getElementById("minibia-bot-xray-overlay-status");
    const floorSelect   = document.getElementById("minibia-bot-xray-floor-select");
    const formatFloorOffset = (floor) => {
      if (!me || floor == null) return null;
      const offset = me.z - floor;
      return offset === 0 ? "0" : offset > 0 ? `+${offset}` : `${offset}`;
    };
    if (overlayButton) overlayButton.textContent = status?.config?.overlayEnabled ? "Disable Overlay" : "Enable Overlay";
    if (overlayLabel) {
      const floorLabel = status?.config?.selectedFloor == null ? "all floors" : `${formatFloorOffset(status.config.selectedFloor) ?? "?"}`;
      overlayLabel.textContent = `${status?.config?.overlayEnabled ? "Overlay: on" : "Overlay: off"} • ${floorLabel}`;
    }
    if (floorSelect) {
      const floors = Array.from(new Set((status?.visibleCreatures || []).map((c) => c?.position?.z).filter((f) => f != null))).sort((a, b) => a - b);
      const selectedFloor = status?.config?.selectedFloor;
      if (selectedFloor != null && !floors.includes(selectedFloor)) { floors.push(selectedFloor); floors.sort((a, b) => a - b); }
      floorSelect.innerHTML = "";
      const allOption = document.createElement("option"); allOption.value = "all"; allOption.textContent = "All floors"; floorSelect.appendChild(allOption);
      floors.forEach((floor) => { const opt = document.createElement("option"); opt.value = String(floor); const ol = formatFloorOffset(floor); opt.textContent = ol == null ? String(floor) : ol; floorSelect.appendChild(opt); });
      floorSelect.value = selectedFloor == null ? "all" : String(selectedFloor);
    }
  }

  function renderTrustedNames() {
    const list = document.getElementById("minibia-bot-panic-trusted-list");
    if (!list) return;
    const trustedNames = bot.panic?.config?.trustedNames || [];
    list.innerHTML = "";
    if (!trustedNames.length) { const e = document.createElement("div"); e.className = "mb-small-note"; e.textContent = "No trusted names saved."; list.appendChild(e); return; }
    trustedNames.forEach((name, index) => {
      const row = document.createElement("div"); row.className = "mb-list-row";
      const label = document.createElement("span"); label.textContent = name;
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "mb-small-button"; btn.textContent = "Remove";
      btn.addEventListener("click", () => { bot.panic.updateConfig({ trustedNames: trustedNames.filter((_, i) => i !== index) }); renderTrustedNames(); });
      row.appendChild(label); row.appendChild(btn); list.appendChild(row);
    });
  }

  function renderGameMasterNames() {
    const list = document.getElementById("minibia-bot-panic-gm-list");
    if (!list) return;
    const gameMasterNames = bot.panic?.config?.gameMasterNames || [];
    list.innerHTML = "";
    if (!gameMasterNames.length) { const e = document.createElement("div"); e.className = "mb-small-note"; e.textContent = "No game master names saved."; list.appendChild(e); return; }
    gameMasterNames.forEach((name, index) => {
      const row = document.createElement("div"); row.className = "mb-list-row";
      const label = document.createElement("span"); label.textContent = name;
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "mb-small-button"; btn.textContent = "Remove";
      btn.addEventListener("click", () => { bot.panic.updateConfig({ gameMasterNames: gameMasterNames.filter((_, i) => i !== index) }); renderGameMasterNames(); });
      row.appendChild(label); row.appendChild(btn); list.appendChild(row);
    });
  }

  function refreshRuneStatus() {
    const t = document.getElementById("minibia-bot-rune-enabled");
    if (t) t.checked = !!bot.rune?.status?.().running;
  }
  function refreshAutoEatStatus() {
    const t = document.getElementById("minibia-bot-auto-eat-enabled");
    if (t) t.checked = !!bot.eat?.status?.().running;
  }
  function refreshAutoHealStatus() {
    const t = document.getElementById("minibia-bot-auto-heal-enabled");
    if (t) t.checked = !!bot.heal?.status?.().running;
  }
  function refreshAutoInvisibleStatus() {
    const t = document.getElementById("minibia-bot-auto-invisible-enabled");
    if (t) t.checked = !!bot.invisible?.status?.().running;
  }
  function refreshAutoMagicShieldStatus() {
    const t = document.getElementById("minibia-bot-auto-magic-shield-enabled");
    if (t) t.checked = !!bot.magicShield?.status?.().running;
  }
  function refreshAutoAttackStatus() {
    const t = document.getElementById("minibia-bot-auto-attack-enabled");
    if (t) t.checked = !!bot.attack?.status?.().running;
  }

  function renderAttackTargetNames() {
    const list = document.getElementById("minibia-bot-auto-attack-target-list");
    if (!list) return;
    const targetNames = bot.attack?.config?.targetNames || [];
    list.innerHTML = "";
    if (!targetNames.length) { const e = document.createElement("div"); e.className = "mb-small-note"; e.textContent = "No target names saved. Attacks all visible monsters."; list.appendChild(e); return; }
    targetNames.forEach((name, index) => {
      const row = document.createElement("div"); row.className = "mb-list-row";
      const label = document.createElement("span"); label.textContent = name;
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "mb-small-button"; btn.textContent = "Remove";
      btn.addEventListener("click", () => { bot.attack.updateConfig({ targetNames: targetNames.filter((_, i) => i !== index) }); renderAttackTargetNames(); });
      row.appendChild(label); row.appendChild(btn); list.appendChild(row);
    });
  }

  function refreshCaveStatus() {
    const statusLabel = document.getElementById("minibia-bot-cave-status");
    const startButton = document.getElementById("minibia-bot-cave-start");
    const stopButton  = document.getElementById("minibia-bot-cave-stop");
    const route  = bot.cave?.getRoute?.() || [];
    const status = bot.cave?.status?.();
    if (statusLabel) {
      if (!route.length) { statusLabel.textContent = "Status: no waypoints"; }
      else if (status?.running) {
        const wp = (status.currentIndex ?? 0) + 1;
        const dist = Number.isFinite(status?.distanceToWaypoint) && status.distanceToWaypoint >= 0 ? `, dist ${status.distanceToWaypoint}` : "";
        const pause = status?.pausedForSpawn ? `, waiting for spawn (${status.spawnFloorOffset > 0 ? `+${status.spawnFloorOffset}` : status.spawnFloorOffset})` : status?.pausedForCreatures ? `, waiting (${status.nearbyCreatureCount || 0} creature${(status.nearbyCreatureCount || 0) === 1 ? "" : "s"})` : status?.pausedForCombat ? ", paused for combat" : "";
        statusLabel.textContent = `Status: running (${wp}/${route.length}${dist}${pause})`;
      } else { statusLabel.textContent = `Status: idle (${route.length} waypoint${route.length === 1 ? "" : "s"})`; }
    }
    if (startButton) startButton.disabled = !route.length || !!status?.running;
    if (stopButton)  stopButton.disabled  = !status?.running;
  }

  function refreshCavePresetControls() {
    const select = document.getElementById("minibia-bot-cave-preset-select");
    const label  = document.getElementById("minibia-bot-cave-preset-status");
    const deleteButton = document.getElementById("minibia-bot-cave-preset-delete");
    const status = bot.cave?.status?.();
    const presetNames = status?.presetNames || bot.cave?.getPresetNames?.() || [];
    const activePresetName = status?.activePresetName || bot.cave?.getActivePresetName?.() || "Default";
    if (select) {
      const prev = select.value; select.innerHTML = "";
      if (!presetNames.length) { const o = document.createElement("option"); o.value = ""; o.textContent = "No saved presets"; select.appendChild(o); select.disabled = true; }
      else {
        presetNames.forEach((name) => { const o = document.createElement("option"); o.value = name; o.textContent = name; select.appendChild(o); });
        select.disabled = false;
        const next = presetNames.includes(activePresetName) ? activePresetName : prev;
        if (next) select.value = next;
      }
    }
    if (label) label.textContent = presetNames.length ? `Preset: ${activePresetName} (${presetNames.length} saved)` : `Preset: ${activePresetName}`;
    if (deleteButton) deleteButton.disabled = !presetNames.length || !select?.value;
  }

  function refreshCaveClosestStatus() {
    const label = document.getElementById("minibia-bot-cave-closest");
    if (!label) return;
    const position = bot.getPlayerPosition?.();
    const route = bot.cave?.getRoute?.() || [];
    if (!position) { label.textContent = "Closest start: current position unavailable"; return; }
    const posWaypoints = route.filter((w) => w?.type !== "delay");
    if (!posWaypoints.length) { label.textContent = "Closest start: no waypoints"; return; }
    const closestIndex = bot.cave?.findClosestWaypointIndex?.(position) ?? 0;
    const waypoint = route[closestIndex];
    if (!waypoint) { label.textContent = "Closest start: unavailable"; return; }
    label.textContent = `Closest start: ${closestIndex + 1}. ${waypoint.x}, ${waypoint.y}, ${waypoint.z}`;
  }

  function refreshCaveTransitionStatus() {
    const label = document.getElementById("minibia-bot-cave-transition-status");
    if (!label) return;
    const transitions = bot.cave?.getTransitions?.() || [];
    if (!transitions.length) { label.textContent = "Transitions learned: none"; return; }
    const latest = transitions.slice().sort((a, b) => Number(b?.lastSeenAt || 0) - Number(a?.lastSeenAt || 0))[0];
    if (!latest?.from || !latest?.to) { label.textContent = `Transitions learned: ${transitions.length}`; return; }
    const extra = transitions.length > 1 ? ` (+${transitions.length - 1} more)` : "";
    label.textContent = `Transitions learned: ${latest.from.x}, ${latest.from.y}, ${latest.from.z} -> ${latest.to.x}, ${latest.to.y}, ${latest.to.z}${extra}`;
  }

  function refreshEquipRingStatus() {
    const t = document.getElementById("minibia-bot-equip-ring-enabled");
    if (t) t.checked = !!bot.equipRing?.status?.().running;
  }

  // ── NOVO: Auto Stack status ──────────────────────────────────
  function refreshAutoStackStatus() {
    const toggle = document.getElementById("minibia-bot-auto-stack-enabled");
    const label  = document.getElementById("minibia-bot-auto-stack-status");
    const s = bot.autoStack?.status?.();
    if (toggle) toggle.checked = !!s?.running;
    if (label) {
      if (s?.running) {
        label.textContent = `Status: ativo • merges: ${s.merged}`;
      } else {
        label.textContent = "Status: parado";
      }
    }
  }

  function refreshProfilesPanel() {
    const activeLabel = document.getElementById("minibia-bot-profiles-active");
    const select = document.getElementById("minibia-bot-profiles-select");
    const nameInput = document.getElementById("minibia-bot-profiles-name-input");
    const status = bot.profiles?.status?.();
    const profiles = status?.profiles || [];
    const active = status?.activeProfile || null;
    if (activeLabel) activeLabel.textContent = active ? `Active profile: ${active}` : "Active profile: none";
    if (select) {
      const prev = select.value; select.innerHTML = "";
      if (!profiles.length) { const o = document.createElement("option"); o.value = ""; o.textContent = "No profiles saved"; select.appendChild(o); select.disabled = true; }
      else {
        select.disabled = false;
        profiles.forEach((name) => { const o = document.createElement("option"); o.value = name; o.textContent = name; select.appendChild(o); });
        const toSelect = profiles.includes(active) ? active : profiles.includes(prev) ? prev : profiles[0];
        if (toSelect) select.value = toSelect;
        if (nameInput && !nameInput.value && toSelect) nameInput.value = toSelect;
      }
    }
  }

  function refreshRuneCheckStatus() {
    const enabledToggle = document.getElementById("minibia-bot-rune-check-enabled");
    const alarmToggle   = document.getElementById("minibia-bot-rune-check-alarm");
    const logoutToggle  = document.getElementById("minibia-bot-rune-check-logout");
    const statusLabel   = document.getElementById("minibia-bot-rune-check-status");
    const status = bot.runeCheck?.status?.();
    if (enabledToggle) enabledToggle.checked = !!status?.running;
    if (alarmToggle)   alarmToggle.checked   = !!status?.config?.alarmEnabled;
    if (logoutToggle)  logoutToggle.checked  = !!status?.config?.logoutEnabled;
    if (statusLabel) {
      if (status?.triggered) { const ago = status.lastSeenAt ? `${Math.round((Date.now() - status.lastSeenAt) / 1000)}s ago` : ""; statusLabel.textContent = `⚠ DETECTED ${ago}: ${status.lastSeenMessage || ""}`; }
      else if (status?.running) { statusLabel.textContent = "Status: watching..."; }
      else { statusLabel.textContent = "Status: idle"; }
    }
  }

  function refreshFollowStatus() {
    const toggle = document.getElementById("minibia-bot-follow-enabled");
    const label  = document.getElementById("minibia-bot-follow-status");
    const status = bot.follow?.status?.();
    if (toggle) toggle.checked = !!status?.running;
    if (label) {
      if (!status?.targetName) { label.textContent = "Status: no player set"; }
      else if (status?.running) { const d = status.currentDistance != null ? `, dist ${status.currentDistance}/${status.desiredDistance} sqm` : ""; const v = status.targetVisible ? " (visible)" : " (lost)"; label.textContent = `Status: following ${status.targetName}${d}${v}`; }
      else { label.textContent = `Status: idle (${status.targetName || "no player"})`; }
    }
  }

  function refreshTalkStatus() {
    const toggle = document.getElementById("minibia-bot-talk-enabled");
    const label  = document.getElementById("minibia-bot-talk-status");
    const status = bot.talk?.status?.();
    if (toggle) toggle.checked = !!status?.running;
    if (label) {
      if (!status?.config?.apiKey) { label.textContent = "Status: API key missing"; }
      else if (status?.pending)    { label.textContent = "Status: generating"; }
      else if (status?.running)    { label.textContent = "Status: listening to Default"; }
      else                         { label.textContent = "Status: idle"; }
    }
  }

  function refreshVisibleCreatures() {
    const list = document.getElementById("minibia-bot-visible-creatures-list");
    if (!list) return;
    const me = bot.getPlayerPosition?.();
    const status = bot.xray?.status?.();
    const creatures = status?.visibleCreatures || [];
    const selectedFloor = status?.config?.selectedFloor;
    list.innerHTML = "";
    if (!me) { const e = document.createElement("div"); e.className = "mb-small-note"; e.textContent = "Current position unavailable."; list.appendChild(e); return; }
    const getFloorOffset = (c) => (c.position?.z || 0) - me.z;
    const getFloorDistance = (c) => Math.abs(getFloorOffset(c));
    const visible = creatures.filter((c) => { const f = c?.position?.z; if (f == null) return false; if (selectedFloor != null) return f === selectedFloor; return f !== me.z; }).sort((a, b) => { const fd = getFloorDistance(a) - getFloorDistance(b); if (fd !== 0) return fd; const od = getFloorOffset(a) - getFloorOffset(b); if (od !== 0) return od; const ad = Math.abs((a.position?.x||0)-me.x)+Math.abs((a.position?.y||0)-me.y); const bd = Math.abs((b.position?.x||0)-me.x)+Math.abs((b.position?.y||0)-me.y); return ad-bd; });
    if (!visible.length) { const e = document.createElement("div"); e.className = "mb-small-note"; e.textContent = selectedFloor == null ? "No off-floor creatures." : `No creatures on floor ${selectedFloor}.`; list.appendChild(e); return; }
    let currentFloor = null;
    visible.forEach((c) => {
      const floor = c.position?.z;
      if (floor !== currentFloor) { currentFloor = floor; const fo = me.z - floor; const fol = fo === 0 ? "0" : fo > 0 ? `+${fo}` : `${fo}`; const fl = document.createElement("div"); fl.className = "mb-floor-label"; fl.textContent = fol; list.appendChild(fl); }
      const row = document.createElement("div"); row.className = "mb-creature-row";
      const name = document.createElement("div"); name.className = "mb-creature-name"; name.textContent = c.name || (c.type === 0 ? "Player" : "Mob");
      const meta = document.createElement("div"); meta.className = "mb-small-note"; meta.textContent = `${c.type === 0 ? "Player" : "Mob"} at ${c.position.x}, ${c.position.y}, ${c.position.z}`;
      row.appendChild(name); row.appendChild(meta); list.appendChild(row);
    });
  }

  function setPanelCollapsed(panel, collapsed) {
    if (!panel) return;
    const body = panel.querySelector(".mb-body");
    const toggle = panel.querySelector("#minibia-bot-collapse");
    const nextCollapsed = !!collapsed;
    panel.dataset.collapsed = nextCollapsed ? "true" : "false";
    if (body) body.hidden = nextCollapsed;
    if (toggle) { toggle.textContent = nextCollapsed ? "+" : "−"; toggle.setAttribute("aria-label", nextCollapsed ? "Maximize panel" : "Minimize panel"); toggle.setAttribute("title", nextCollapsed ? "Maximize" : "Minimize"); }
    savePanelCollapsed(nextCollapsed);
  }

  function applySavedPanelPosition(panel, key = panelPositionKey) {
    const position = getSavedPanelPosition(key);
    if (!position) return;
    if (typeof position.top === "number") panel.style.top = `${position.top}px`;
    if (typeof position.left === "number") { panel.style.left = `${position.left}px`; panel.style.right = "auto"; }
  }

  function clampPanelPosition(panel, left, top) {
    return { left: Math.min(Math.max(0, left), Math.max(0, window.innerWidth - panel.offsetWidth)), top: Math.min(Math.max(0, top), Math.max(0, window.innerHeight - panel.offsetHeight)) };
  }

  function enableDrag(panel, key = panelPositionKey) {
    const handle = panel.querySelector(".mb-title");
    if (!handle) return;
    let dragState = null;
    const onMouseMove = (e) => { if (!dragState) return; const next = clampPanelPosition(panel, e.clientX - dragState.offsetX, e.clientY - dragState.offsetY); panel.style.left = `${next.left}px`; panel.style.top = `${next.top}px`; panel.style.right = "auto"; };
    const onMouseUp = () => { if (!dragState) return; dragState = null; const rect = panel.getBoundingClientRect(); savePanelPosition({ left: rect.left, top: rect.top }, key); };
    handle.addEventListener("mousedown", (e) => { if (e.button !== 0) return; const rect = panel.getBoundingClientRect(); dragState = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }; e.preventDefault(); });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    bot.addCleanup(() => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); });
  }

  function inject() {
    destroy();

    const style = document.createElement("style");
    style.id = "minibia-bot-style";
    style.textContent = `
      #minibia-bot-panel { position:fixed; top:10px; right:10px; z-index:999999; width:420px; max-width:calc(100vw - 20px); background:#d4d0c8; border:2px solid; border-color:#ffffff #808080 #808080 #ffffff; font:11px/1.35 Tahoma,'MS Sans Serif',Arial,sans-serif; color:#000000; user-select:none; }
      #minibia-bot-panel * { box-sizing:border-box; }
      #minibia-bot-panel .mb-titlebar { background:linear-gradient(to right,#0a246a 0%,#a6caf0 100%); color:#ffffff; font-weight:normal; font-size:11px; padding:3px 4px 3px 6px; display:flex; align-items:center; justify-content:space-between; gap:4px; cursor:move; }
      #minibia-bot-panel .mb-title { flex:1; white-space:nowrap; }
      #minibia-bot-panel .mb-titlebar-btns { display:flex; gap:2px; }
      #minibia-bot-panel .mb-icon-button { width:16px; height:14px; min-width:16px; padding:0; background:#d4d0c8; border:1px solid; border-color:#ffffff #808080 #808080 #ffffff; color:#000; font:normal 9px Tahoma,sans-serif; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; }
      #minibia-bot-panel .mb-icon-button:active { border-color:#808080 #ffffff #ffffff #808080; }
      #minibia-bot-panel .mb-tabs { display:flex; flex-wrap:wrap; padding:3px 4px 0; gap:2px; background:#d4d0c8; border-bottom:1px solid #808080; }
      #minibia-bot-panel .mb-tab { padding:2px 10px 3px; border:1px solid; border-color:#ffffff #808080 #d4d0c8 #ffffff; background:#bbb8b0; font:11px Tahoma,sans-serif; cursor:pointer; border-bottom:none; position:relative; top:1px; color:#000; white-space:nowrap; }
      #minibia-bot-panel .mb-tab.mb-tab-active { background:#d4d0c8; z-index:2; padding-bottom:4px; top:1px; }
      #minibia-bot-panel .mb-tab:hover:not(.mb-tab-active) { background:#c8c5be; }
      #minibia-bot-panel .mb-tab-content { display:none; }
      #minibia-bot-panel .mb-tab-content.mb-tab-active { display:block; }
      #minibia-bot-panel .mb-body { padding:6px; max-height:min(70vh,520px); overflow-y:auto; scrollbar-width:thin; background:#d4d0c8; }
      #minibia-bot-panel .mb-group { border:1px solid #808080; border-top:none; padding:10px 8px 8px; position:relative; margin-top:10px; background:#d4d0c8; }
      #minibia-bot-panel .mb-group-title { position:absolute; top:-7px; left:8px; background:#d4d0c8; padding:0 3px; font-weight:normal; font-size:11px; }
      #minibia-bot-panel .mb-stack { display:flex; flex-direction:column; gap:5px; }
      #minibia-bot-panel .mb-row { display:flex; align-items:center; gap:6px; }
      #minibia-bot-panel .mb-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
      #minibia-bot-panel .mb-grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; }
      #minibia-bot-panel .mb-toggle { display:flex; align-items:center; gap:5px; font-size:11px; color:#000; cursor:pointer; }
      #minibia-bot-panel .mb-toggle input[type="checkbox"] { width:13px; height:13px; margin:0; cursor:pointer; }
      #minibia-bot-panel button { height:21px; min-width:60px; padding:0 8px; border:1px solid; border-color:#ffffff #808080 #808080 #ffffff; background:#d4d0c8; font:11px Tahoma,sans-serif; cursor:pointer; color:#000; white-space:nowrap; }
      #minibia-bot-panel button:hover { background:#e0ddd5; }
      #minibia-bot-panel button:active { border-color:#808080 #ffffff #ffffff #808080; }
      #minibia-bot-panel button:disabled { color:#808080; cursor:default; }
      #minibia-bot-panel button.mb-btn-full { width:100%; }
      #minibia-bot-panel .mb-small-button { height:18px; min-width:40px; padding:0 6px; font-size:11px; }
      #minibia-bot-panel input:not([type="checkbox"]), #minibia-bot-panel select, #minibia-bot-panel textarea { height:19px; border:1px solid; border-color:#808080 #ffffff #ffffff #808080; background:#ffffff; padding:0 3px; font:11px Tahoma,sans-serif; color:#000; width:100%; }
      #minibia-bot-panel textarea { height:auto; min-height:48px; padding:3px; resize:vertical; }
      #minibia-bot-panel input[type="number"] { width:60px; }
      #minibia-bot-panel .mb-inline { display:grid; grid-template-columns:1fr auto; gap:4px; align-items:center; }
      #minibia-bot-panel .mb-field { display:flex; flex-direction:column; gap:2px; }
      #minibia-bot-panel .mb-field-label { font-size:11px; color:#000; }
      #minibia-bot-panel .mb-field input { width:100%; }
      #minibia-bot-panel .mb-field-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
      #minibia-bot-panel .mb-small-note { font-size:11px; color:#444; }
      #minibia-bot-panel .mb-label { font-size:11px; color:#000; }
      #minibia-bot-panel .mb-note { font-size:10px; color:#666; margin-top:4px; }
      #minibia-bot-panel .mb-list { display:flex; flex-direction:column; gap:3px; }
      #minibia-bot-panel .mb-list-row { display:grid; grid-template-columns:1fr auto; gap:4px; align-items:center; border-bottom:1px solid #c0bdb5; padding-bottom:3px; }
      #minibia-bot-panel .mb-creature-row { border-bottom:1px solid #c0bdb5; padding:2px 0; font-size:11px; }
      #minibia-bot-panel .mb-creature-name { font-weight:normal; }
      #minibia-bot-panel .mb-floor-label { font-weight:normal; font-size:11px; color:#0a246a; margin-top:4px; margin-bottom:2px; }
      #minibia-bot-panel .mb-actions { display:flex; flex-direction:column; gap:4px; }
      #minibia-bot-panel .mb-actions-inline-two { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
      #minibia-bot-panel .mb-actions-inline-three { display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; }
      #minibia-bot-panel .mb-statusbar { background:#d4d0c8; border-top:1px solid #808080; padding:3px 6px; display:flex; gap:6px; font-size:11px; }
      #minibia-bot-panel .mb-statuspanel { border:1px solid; border-color:#808080 #ffffff #ffffff #808080; padding:1px 6px; font-size:11px; color:#000; white-space:nowrap; }
      #minibia-bot-panel .mb-row-three { display:grid; grid-template-columns:auto minmax(80px,1fr) 56px; align-items:center; gap:6px; }
      #minibia-bot-panel .mb-row-three input { min-width:0; }
      #minibia-bot-panel #minibia-bot-visible-creatures-list { max-height:100px; overflow-y:auto; }
      #minibia-bot-panel #minibia-bot-panic-trusted-list { max-height:80px; overflow-y:auto; }
      #minibia-bot-panel .mb-accordion { display:contents; }
      #minibia-bot-panel .mb-accordion-header { display:none; }
      #minibia-bot-panel .mb-accordion-body { display:block !important; }
      #minibia-bot-panel .mb-accordion-body[hidden] { display:none !important; }
      #minibia-bot-panel .mb-section { padding:0; border:none; }
      @media (max-width:440px) { #minibia-bot-panel { width:calc(100vw - 8px); right:4px; } #minibia-bot-panel .mb-field-grid { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);

    const panel = document.createElement("div");
    panel.id = "minibia-bot-panel";
    panel.innerHTML = `
      <div class="mb-titlebar">
        <span class="mb-title">Minibia Bot v0.3</span>
        <div class="mb-titlebar-btns">
          <button type="button" class="mb-icon-button" id="minibia-bot-collapse" title="Minimize">_</button>
        </div>
      </div>
      <div class="mb-tabs" id="minibia-bot-tabs">
        <div class="mb-tab mb-tab-active" data-tab="heal">Heal</div>
        <div class="mb-tab" data-tab="rune">Rune</div>
        <div class="mb-tab" data-tab="attack">Attack</div>
        <div class="mb-tab" data-tab="cave">Cave</div>
        <div class="mb-tab" data-tab="panic">Panic</div>
        <div class="mb-tab" data-tab="tools">Tools</div>
        <div class="mb-tab" data-tab="profiles">Config</div>
      </div>
      <div class="mb-body">

        <!-- ABA: Heal -->
        <div class="mb-tab-content mb-tab-active" data-tab="heal">
          <div class="mb-group">
            <span class="mb-group-title">Auto Heal</span>
            <div class="mb-stack">
              <label class="mb-toggle">
                <input type="checkbox" id="minibia-bot-auto-heal-enabled" />
                <span>Enable Auto Heal</span>
              </label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Min HP</span><input type="number" id="minibia-bot-auto-heal-min-hp" min="0" placeholder="250" /></div>
                <div class="mb-field"><span class="mb-field-label">HP Hotkey (1-12)</span><input type="number" id="minibia-bot-auto-heal-hp-hotkey" min="1" max="12" placeholder="1" /></div>
                <div class="mb-field"><span class="mb-field-label">Min Mana</span><input type="number" id="minibia-bot-auto-heal-min-mana" min="0" placeholder="150" /></div>
                <div class="mb-field"><span class="mb-field-label">Mana Hotkey (1-12)</span><input type="number" id="minibia-bot-auto-heal-mana-hotkey" min="1" max="12" placeholder="2" /></div>
              </div>
            </div>
          </div>
          <div class="mb-group">
            <span class="mb-group-title">Utilities</span>
            <div class="mb-stack">
              <div class="mb-row">
                <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-eat-enabled" /><span>Auto Eat</span></label>
                <span class="mb-field-label" style="margin-left:auto">Slot</span>
                <input type="number" id="minibia-bot-auto-eat-hotkey" min="1" max="12" placeholder="10" style="width:44px" />
              </div>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-invisible-enabled" /><span>Auto Invisible (utana vid)</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-magic-shield-enabled" /><span>Auto Utamo Vita</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-equip-ring-enabled" /><span>Auto Equip Ring</span></label>
            </div>
          </div>
          <!-- ── NOVO: Auto Stack ── -->
          <div class="mb-group">
            <span class="mb-group-title">Auto Stack</span>
            <div class="mb-stack">
              <label class="mb-toggle">
                <input type="checkbox" id="minibia-bot-auto-stack-enabled" />
                <span>Enable Auto Stack</span>
              </label>
              <div class="mb-row">
                <span class="mb-field-label">Intervalo (ms)</span>
                <input type="number" id="minibia-bot-auto-stack-tick" min="500" placeholder="2000" style="width:70px" />
                <button type="button" class="mb-small-button" id="minibia-bot-auto-stack-now">Agrupar agora</button>
              </div>
              <span class="mb-small-note" id="minibia-bot-auto-stack-status">Status: parado</span>
            </div>
          </div>
        </div>

        <!-- ABA: Rune -->
        <div class="mb-tab-content" data-tab="rune">
          <div class="mb-group">
            <span class="mb-group-title">Magic Level Trainer</span>
            <div class="mb-stack">
              <div class="mb-row"><label class="mb-toggle"><input type="checkbox" id="minibia-bot-rune-enabled" /><span>Enable</span></label></div>
              <div class="mb-field"><span class="mb-field-label">Spell words</span><input type="text" id="minibia-bot-rune-spell" placeholder="adori vita vis" style="width:100%" /></div>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Min Mana</span><input type="number" id="minibia-bot-rune-mana-min" min="0" placeholder="600" /></div>
                <div class="mb-field"><span class="mb-field-label">Max Mana</span><input type="number" id="minibia-bot-rune-mana-max" min="0" placeholder="600" /></div>
              </div>
              <span class="mb-note">Random threshold between min-max each cast.</span>
            </div>
          </div>
          <div class="mb-group">
            <span class="mb-group-title">Rune Check Watcher</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-rune-check-enabled" /><span>Enable Watcher</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-rune-check-alarm" /><span>Play Alarm on detect</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-rune-check-logout" /><span>Auto Logout on detect</span></label>
              <span class="mb-small-note" id="minibia-bot-rune-check-status">Status: idle</span>
            </div>
          </div>
        </div>

        <!-- ABA: Attack -->
        <div class="mb-tab-content" data-tab="attack">
          <div class="mb-group">
            <span class="mb-group-title">Auto Attack</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-enabled" /><span>Enable Auto Attack</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-melee" /><span>Melee Mode</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-skill-train" /><span>Skill Train on Monster</span></label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Range (sqm)</span><input type="number" id="minibia-bot-auto-attack-max-distance" min="1" max="15" placeholder="6" /></div>
                <div class="mb-field"><span class="mb-field-label">Target Hotkey</span><input type="number" id="minibia-bot-auto-attack-hotkey" min="1" max="12" placeholder="3" /></div>
                <div class="mb-field"><span class="mb-field-label">Rune Hotkey</span><input type="number" id="minibia-bot-auto-attack-rune-hotkey" min="1" max="12" placeholder="4" /></div>
              </div>
              <div class="mb-field-label">Target Names (empty = all monsters)</div>
              <div class="mb-inline">
                <input type="text" id="minibia-bot-auto-attack-target-input" placeholder="e.g. Rotworm" style="width:100%" />
                <button type="button" class="mb-small-button" id="minibia-bot-auto-attack-target-add">Add</button>
              </div>
              <div class="mb-list" id="minibia-bot-auto-attack-target-list"></div>
            </div>
          </div>
          <div class="mb-group">
            <span class="mb-group-title">Auto Follow</span>
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
          <div class="mb-group">
            <span class="mb-group-title">Cave Bot</span>
            <div class="mb-stack">
              <div class="mb-field"><span class="mb-field-label">Preset</span><select id="minibia-bot-cave-preset-select"></select></div>
              <div class="mb-actions-inline-two">
                <button type="button" class="mb-small-button" id="minibia-bot-cave-preset-new">New</button>
                <button type="button" class="mb-small-button" id="minibia-bot-cave-preset-delete">Delete</button>
              </div>
              <div class="mb-actions-inline-two">
                <button type="button" class="mb-small-button" id="minibia-bot-cave-preset-export">Export</button>
                <button type="button" class="mb-small-button" id="minibia-bot-cave-preset-import">Import</button>
              </div>
              <div class="mb-actions-inline-two">
                <button type="button" class="mb-small-button" id="minibia-bot-cave-record">Record Spot</button>
                <button type="button" class="mb-small-button" id="minibia-bot-cave-add-delay">Add Delay</button>
              </div>
              <button type="button" class="mb-small-button mb-btn-full" id="minibia-bot-cave-remove-last">Remove Last Waypoint</button>
              <span class="mb-small-note" id="minibia-bot-cave-closest">Closest: no waypoints</span>
              <span class="mb-small-note" id="minibia-bot-cave-transition-status">Transitions: none</span>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-cave-pause-until-clear" /><span>Pause Until Clear</span></label>
              <div class="mb-row-three">
                <label class="mb-toggle"><input type="checkbox" id="minibia-bot-cave-pause-until-spawn" /><span>Pause Until Monster on Floor</span></label>
                <span></span>
                <input type="number" id="minibia-bot-cave-spawn-floor-offset" placeholder="+1" style="width:50px" />
              </div>
              <div class="mb-actions-inline-two">
                <button type="button" id="minibia-bot-cave-start">Start</button>
                <button type="button" id="minibia-bot-cave-stop">Stop</button>
              </div>
              <span class="mb-small-note" id="minibia-bot-cave-status">Status: no waypoints</span>
            </div>
          </div>
        </div>

        <!-- ABA: Panic -->
        <div class="mb-tab-content" data-tab="panic">
          <div class="mb-group">
            <span class="mb-group-title">Panic Runner</span>
            <div class="mb-stack">
              <span class="mb-label" id="minibia-bot-home">Home PZ: not set</span>
              <button type="button" id="minibia-bot-set-home">Set Home (current spot)</button>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-unknown" /><span>Flee on unknown player</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-health" /><span>Flee on health loss</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-return" /><span>Auto return after flee</span></label>
              <div class="mb-field-label">Trusted Names</div>
              <div class="mb-inline"><input type="text" id="minibia-bot-panic-trusted-input" placeholder="Trusted player name" style="width:100%" /><button type="button" class="mb-small-button" id="minibia-bot-panic-trusted-add">Add</button></div>
              <div class="mb-list" id="minibia-bot-panic-trusted-list"></div>
            </div>
          </div>
          <div class="mb-group">
            <span class="mb-group-title">GM Kill Switch</span>
            <div class="mb-stack">
              <div class="mb-inline"><input type="text" id="minibia-bot-panic-gm-input" placeholder="Game master name" style="width:100%" /><button type="button" class="mb-small-button" id="minibia-bot-panic-gm-add">Add</button></div>
              <div class="mb-list" id="minibia-bot-panic-gm-list"></div>
            </div>
          </div>
        </div>

        <!-- ABA: Tools -->
        <div class="mb-tab-content" data-tab="tools">
          <div class="mb-group">
            <span class="mb-group-title">Xray</span>
            <div class="mb-stack">
              <div class="mb-actions-inline-two">
                <button type="button" id="minibia-bot-xray-overlay-toggle">Enable Overlay</button>
                <select id="minibia-bot-xray-floor-select"><option value="all">All floors</option></select>
              </div>
              <span class="mb-small-note" id="minibia-bot-xray-overlay-status">Overlay: off</span>
              <div class="mb-list" id="minibia-bot-visible-creatures-list"></div>
            </div>
          </div>
          <div class="mb-group">
            <span class="mb-group-title">Auto Talk (Gemini)</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-talk-enabled" /><span>Enable Auto Reply</span></label>
              <div class="mb-field"><span class="mb-field-label">Gemini API Key</span><input type="password" id="minibia-bot-talk-api-key" placeholder="API key" style="width:100%" /></div>
              <div class="mb-field"><span class="mb-field-label">Reply Prompt</span><textarea id="minibia-bot-talk-prompt" placeholder="Reply style prompt" style="width:100%"></textarea></div>
              <span class="mb-small-note" id="minibia-bot-talk-status">Status: idle</span>
            </div>
          </div>
        </div>

        <!-- ABA: Config -->
        <div class="mb-tab-content" data-tab="profiles">
          <div class="mb-group">
            <span class="mb-group-title">Profiles</span>
            <div class="mb-stack">
              <span class="mb-small-note" id="minibia-bot-profiles-active">Active: none</span>
              <div class="mb-field"><span class="mb-field-label">Profile Name</span><input type="text" id="minibia-bot-profiles-name-input" placeholder="e.g. Mage lvl 100" style="width:100%" /></div>
              <div class="mb-actions-inline-two">
                <button type="button" id="minibia-bot-profiles-save">Save Current</button>
                <button type="button" id="minibia-bot-profiles-load">Load</button>
              </div>
              <div class="mb-field"><span class="mb-field-label">Saved Profiles</span><select id="minibia-bot-profiles-select" style="width:100%"></select></div>
              <div class="mb-actions-inline-two">
                <button type="button" id="minibia-bot-profiles-delete">Delete</button>
                <button type="button" id="minibia-bot-profiles-export">Export JSON</button>
              </div>
            </div>
          </div>
          <div class="mb-group" style="margin-top:14px">
            <span class="mb-group-title">Bot</span>
            <div class="mb-stack">
              <button type="button" id="minibia-bot-reload">Reload Bot</button>
            </div>
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

    const unlockAudio = () => bot.unlockAudio?.();
    panel.addEventListener("pointerdown", unlockAudio, { passive: true });
    panel.addEventListener("keydown", unlockAudio);
    bot.addCleanup(() => { panel.removeEventListener("pointerdown", unlockAudio); panel.removeEventListener("keydown", unlockAudio); });

    applySavedPanelPosition(panel);
    enableDrag(panel);
    setPanelCollapsed(panel, getSavedPanelCollapsed());
    initAccordions(panel);

    const activeTabKey = "minibiaBot.ui.activeTab";
    function switchTab(tabId) {
      panel.querySelectorAll(".mb-tab").forEach((t) => t.classList.toggle("mb-tab-active", t.dataset.tab === tabId));
      panel.querySelectorAll(".mb-tab-content").forEach((c) => c.classList.toggle("mb-tab-active", c.dataset.tab === tabId));
      bot.storage.set(activeTabKey, tabId);
    }
    panel.querySelectorAll(".mb-tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
    switchTab(bot.storage.get(activeTabKey, "heal"));

    function refreshStatusBar() {
      const snap = bot.getPlayerSnapshot?.();
      const hpEl  = document.getElementById("minibia-bot-status-hp");
      const mpEl  = document.getElementById("minibia-bot-status-mana");
      const runEl = document.getElementById("minibia-bot-status-run");
      if (hpEl && snap?.health != null) hpEl.textContent = "HP: " + snap.health + "/" + (snap.maxHealth || "?");
      if (mpEl && snap?.mana != null)   mpEl.textContent = "MP: " + snap.mana   + "/" + (snap.maxMana   || "?");
      if (runEl) { const running = bot.rune?.status?.().running || bot.heal?.status?.().running || bot.attack?.status?.().running || bot.cave?.status?.().running || bot.autoStack?.status?.().running; runEl.textContent = running ? "Running" : "Idle"; runEl.style.color = running ? "#006400" : "#000"; }
    }
    const statusBarTimerId = window.setInterval(refreshStatusBar, 1000);
    refreshStatusBar();
    bot.addCleanup(() => window.clearInterval(statusBarTimerId));

    // ── Inputs ──────────────────────────────────────────────────
    const spellInput               = panel.querySelector("#minibia-bot-rune-spell");
    const manaMinInput             = panel.querySelector("#minibia-bot-rune-mana-min");
    const manaMaxInput             = panel.querySelector("#minibia-bot-rune-mana-max");
    const runeEnabledInput         = panel.querySelector("#minibia-bot-rune-enabled");
    const autoEatEnabledInput      = panel.querySelector("#minibia-bot-auto-eat-enabled");
    const autoEatHotkeyInput       = panel.querySelector("#minibia-bot-auto-eat-hotkey");
    const autoInvisibleEnabledInput     = panel.querySelector("#minibia-bot-auto-invisible-enabled");
    const autoMagicShieldEnabledInput   = panel.querySelector("#minibia-bot-auto-magic-shield-enabled");
    const equipRingEnabledInput         = panel.querySelector("#minibia-bot-equip-ring-enabled");
    const autoHealEnabledInput          = panel.querySelector("#minibia-bot-auto-heal-enabled");
    const autoHealMinHpInput            = panel.querySelector("#minibia-bot-auto-heal-min-hp");
    const autoHealHpHotkeyInput         = panel.querySelector("#minibia-bot-auto-heal-hp-hotkey");
    const autoHealMinManaInput          = panel.querySelector("#minibia-bot-auto-heal-min-mana");
    const autoHealManaHotkeyInput       = panel.querySelector("#minibia-bot-auto-heal-mana-hotkey");
    const autoAttackEnabledInput        = panel.querySelector("#minibia-bot-auto-attack-enabled");
    const autoAttackMeleeInput          = panel.querySelector("#minibia-bot-auto-attack-melee");
    const autoAttackSkillTrainInput     = panel.querySelector("#minibia-bot-auto-attack-skill-train");
    const autoAttackMaxDistanceInput    = panel.querySelector("#minibia-bot-auto-attack-max-distance");
    const autoAttackHotkeyInput         = panel.querySelector("#minibia-bot-auto-attack-hotkey");
    const autoAttackRuneHotkeyInput     = panel.querySelector("#minibia-bot-auto-attack-rune-hotkey");
    const autoAttackTargetInput         = panel.querySelector("#minibia-bot-auto-attack-target-input");
    const autoAttackTargetAddButton     = panel.querySelector("#minibia-bot-auto-attack-target-add");
    const talkEnabledInput              = panel.querySelector("#minibia-bot-talk-enabled");
    const talkApiKeyInput               = panel.querySelector("#minibia-bot-talk-api-key");
    const talkPromptInput               = panel.querySelector("#minibia-bot-talk-prompt");
    const panicGmNameInput              = panel.querySelector("#minibia-bot-panic-gm-input");
    const panicGmAddButton              = panel.querySelector("#minibia-bot-panic-gm-add");
    const panicUnknownInput             = panel.querySelector("#minibia-bot-panic-unknown");
    const panicHealthInput              = panel.querySelector("#minibia-bot-panic-health");
    const panicReturnInput              = panel.querySelector("#minibia-bot-panic-return");
    const panicTrustedInput             = panel.querySelector("#minibia-bot-panic-trusted-input");
    const panicTrustedAddButton         = panel.querySelector("#minibia-bot-panic-trusted-add");
    const xrayOverlayButton             = panel.querySelector("#minibia-bot-xray-overlay-toggle");
    const xrayFloorSelect               = panel.querySelector("#minibia-bot-xray-floor-select");
    const collapseButton                = panel.querySelector("#minibia-bot-collapse");
    const reloadButton                  = panel.querySelector("#minibia-bot-reload");
    const caveRecordButton              = panel.querySelector("#minibia-bot-cave-record");
    const caveAddDelayButton            = panel.querySelector("#minibia-bot-cave-add-delay");
    const caveRemoveLastButton          = panel.querySelector("#minibia-bot-cave-remove-last");
    const caveStartButton               = panel.querySelector("#minibia-bot-cave-start");
    const caveStopButton                = panel.querySelector("#minibia-bot-cave-stop");
    const cavePauseUntilClearInput      = panel.querySelector("#minibia-bot-cave-pause-until-clear");
    const cavePauseUntilSpawnInput      = panel.querySelector("#minibia-bot-cave-pause-until-spawn");
    const caveSpawnFloorOffsetInput     = panel.querySelector("#minibia-bot-cave-spawn-floor-offset");
    const cavePresetSelect              = panel.querySelector("#minibia-bot-cave-preset-select");
    const cavePresetNewButton           = panel.querySelector("#minibia-bot-cave-preset-new");
    const cavePresetDeleteButton        = panel.querySelector("#minibia-bot-cave-preset-delete");
    const cavePresetExportButton        = panel.querySelector("#minibia-bot-cave-preset-export");
    const cavePresetImportButton        = panel.querySelector("#minibia-bot-cave-preset-import");
    // ── NOVO: Auto Stack ─────────────────────────────────────────
    const autoStackEnabledInput         = panel.querySelector("#minibia-bot-auto-stack-enabled");
    const autoStackTickInput            = panel.querySelector("#minibia-bot-auto-stack-tick");
    const autoStackNowButton            = panel.querySelector("#minibia-bot-auto-stack-now");

    if (collapseButton) collapseButton.addEventListener("click", () => setPanelCollapsed(panel, panel.dataset.collapsed !== "true"));
    if (reloadButton)   reloadButton.addEventListener("click", () => window.minibiaBotReload?.());

    // ── Auto Stack eventos ────────────────────────────────────
    if (autoStackTickInput) {
      autoStackTickInput.value = String(bot.autoStack?.config?.tickMs ?? 2000);
      autoStackTickInput.addEventListener("change", () => {
        const v = Math.max(500, Number(autoStackTickInput.value) || 2000);
        autoStackTickInput.value = String(v);
        bot.autoStack?.updateConfig?.({ tickMs: v });
      });
    }
    if (autoStackNowButton) {
      autoStackNowButton.addEventListener("click", () => {
        const merged = bot.autoStack?.runOnce?.();
        const label = document.getElementById("minibia-bot-auto-stack-status");
        if (label) label.textContent = `Agrupados agora: ${merged ?? 0} merge(s)`;
      });
    }
    if (autoStackEnabledInput) {
      autoStackEnabledInput.checked = !!bot.autoStack?.status?.().running;
      autoStackEnabledInput.addEventListener("change", () => {
        const tickMs = Math.max(500, Number(autoStackTickInput?.value) || 2000);
        if (autoStackEnabledInput.checked) { bot.autoStack?.start?.({ tickMs }); }
        else { bot.autoStack?.stop?.(); }
        refreshAutoStackStatus();
      });
    }

    // ── Panic ─────────────────────────────────────────────────
    function addTrustedName() {
      const raw = panicTrustedInput?.value?.trim() || "";
      if (!raw) return;
      const cur = bot.panic?.config?.trustedNames || [];
      if (!cur.some((n) => n.trim().toLowerCase() === raw.toLowerCase())) bot.panic.updateConfig({ trustedNames: [...cur, raw] });
      if (panicTrustedInput) panicTrustedInput.value = "";
      renderTrustedNames();
    }
    function addGameMasterName() {
      const raw = panicGmNameInput?.value?.trim() || "";
      if (!raw) return;
      const cur = bot.panic?.config?.gameMasterNames || [];
      if (!cur.some((n) => n.trim().toLowerCase() === raw.toLowerCase())) bot.panic.updateConfig({ gameMasterNames: [...cur, raw] });
      if (panicGmNameInput) panicGmNameInput.value = "";
      renderGameMasterNames();
    }
    panicGmAddButton?.addEventListener("click", addGameMasterName);
    panicGmNameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addGameMasterName(); } });
    panicTrustedAddButton?.addEventListener("click", addTrustedName);
    panicTrustedInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTrustedName(); } });

    // ── Rune ──────────────────────────────────────────────────
    if (spellInput) { spellInput.value = bot.rune?.config?.runeSpellWords || ""; spellInput.addEventListener("change", () => bot.rune.updateConfig({ runeSpellWords: spellInput.value.trim() })); }
    function readRuneManaRange() { const min = Math.max(0, Number(manaMinInput?.value) || 0); const max = Math.max(0, Number(manaMaxInput?.value) || 0); return { runeManaMin: Math.min(min, max), runeManaMax: Math.max(min, max) }; }
    function syncRuneManaInputs(range = bot.rune?.config) { if (!range) return; const min = Math.max(0, Number(range.runeManaMin ?? range.runeManaCost) || 0); const max = Math.max(0, Number(range.runeManaMax ?? range.runeManaCost) || 0); if (manaMinInput) manaMinInput.value = String(Math.min(min, max)); if (manaMaxInput) manaMaxInput.value = String(Math.max(min, max)); }
    function updateRuneManaConfig() { bot.rune.updateConfig(readRuneManaRange()); syncRuneManaInputs(bot.rune.config); }
    syncRuneManaInputs();
    manaMinInput?.addEventListener("change", updateRuneManaConfig);
    manaMaxInput?.addEventListener("change", updateRuneManaConfig);
    if (runeEnabledInput) { runeEnabledInput.checked = !!bot.rune?.status?.().running; runeEnabledInput.addEventListener("change", () => { const s = spellInput?.value?.trim() || bot.rune.config.runeSpellWords; const r = readRuneManaRange(); if (runeEnabledInput.checked) bot.rune.start({ runeSpellWords: s, ...r }); else bot.rune.stop(); syncRuneManaInputs(bot.rune.config); refreshRuneStatus(); }); }

    // ── Auto Eat ──────────────────────────────────────────────
    if (autoEatHotkeyInput) { autoEatHotkeyInput.value = String(bot.eat?.config?.eatHotbarSlot ?? 10); autoEatHotkeyInput.addEventListener("change", () => { const v = Math.min(12, Math.max(1, Number(autoEatHotkeyInput.value) || 1)); autoEatHotkeyInput.value = String(v); bot.eat.updateConfig({ eatHotbarSlot: v }); }); }
    if (autoEatEnabledInput) { autoEatEnabledInput.checked = !!bot.eat?.status?.().running; autoEatEnabledInput.addEventListener("change", () => { const s = Math.min(12, Math.max(1, Number(autoEatHotkeyInput?.value) || bot.eat.config.eatHotbarSlot || 1)); if (autoEatEnabledInput.checked) bot.eat.start({ eatHotbarSlot: s }); else bot.eat.stop(); refreshAutoEatStatus(); }); }
    if (autoInvisibleEnabledInput) { autoInvisibleEnabledInput.checked = !!bot.invisible?.status?.().running; autoInvisibleEnabledInput.addEventListener("change", () => { if (autoInvisibleEnabledInput.checked) bot.invisible.start(); else bot.invisible.stop(); refreshAutoInvisibleStatus(); }); }
    if (autoMagicShieldEnabledInput) { autoMagicShieldEnabledInput.checked = !!bot.magicShield?.status?.().running; autoMagicShieldEnabledInput.addEventListener("change", () => { if (autoMagicShieldEnabledInput.checked) bot.magicShield.start(); else bot.magicShield.stop(); refreshAutoMagicShieldStatus(); }); }
    if (equipRingEnabledInput) { equipRingEnabledInput.checked = !!bot.equipRing?.status?.().running; equipRingEnabledInput.addEventListener("change", () => { if (equipRingEnabledInput.checked) bot.equipRing.start(); else bot.equipRing.stop(); refreshEquipRingStatus(); }); }

    // ── Heal ──────────────────────────────────────────────────
    if (autoHealMinHpInput)       { autoHealMinHpInput.value = String(bot.heal?.config?.minHp ?? 0); autoHealMinHpInput.addEventListener("change", () => { const v = Math.max(0, Number(autoHealMinHpInput.value) || 0); autoHealMinHpInput.value = String(v); bot.heal.updateConfig({ minHp: v }); }); }
    if (autoHealHpHotkeyInput)    { autoHealHpHotkeyInput.value = String(bot.heal?.config?.hpHotbarSlot ?? 1); autoHealHpHotkeyInput.addEventListener("change", () => { const v = Math.min(12, Math.max(1, Number(autoHealHpHotkeyInput.value) || 1)); autoHealHpHotkeyInput.value = String(v); bot.heal.updateConfig({ hpHotbarSlot: v }); }); }
    if (autoHealMinManaInput)     { autoHealMinManaInput.value = String(bot.heal?.config?.minMana ?? 0); autoHealMinManaInput.addEventListener("change", () => { const v = Math.max(0, Number(autoHealMinManaInput.value) || 0); autoHealMinManaInput.value = String(v); bot.heal.updateConfig({ minMana: v }); }); }
    if (autoHealManaHotkeyInput)  { autoHealManaHotkeyInput.value = String(bot.heal?.config?.manaHotbarSlot ?? 1); autoHealManaHotkeyInput.addEventListener("change", () => { const v = Math.min(12, Math.max(1, Number(autoHealManaHotkeyInput.value) || 1)); autoHealManaHotkeyInput.value = String(v); bot.heal.updateConfig({ manaHotbarSlot: v }); }); }
    if (autoHealEnabledInput) {
      autoHealEnabledInput.checked = !!bot.heal?.status?.().running;
      autoHealEnabledInput.addEventListener("change", () => {
        const minHp = Math.max(0, Number(autoHealMinHpInput?.value) || bot.heal.config.minHp || 0);
        const hpHotbarSlot = Math.min(12, Math.max(1, Number(autoHealHpHotkeyInput?.value) || bot.heal.config.hpHotbarSlot || 1));
        const minMana = Math.max(0, Number(autoHealMinManaInput?.value) || bot.heal.config.minMana || 0);
        const manaHotbarSlot = Math.min(12, Math.max(1, Number(autoHealManaHotkeyInput?.value) || bot.heal.config.manaHotbarSlot || 1));
        if (autoHealEnabledInput.checked) bot.heal.start({ minHp, hpHotbarSlot, minMana, manaHotbarSlot });
        else bot.heal.stop();
        refreshAutoHealStatus();
      });
    }

    // ── Attack ────────────────────────────────────────────────
    if (autoAttackMaxDistanceInput) { autoAttackMaxDistanceInput.value = String(bot.attack?.config?.maxTargetDistance ?? 6); autoAttackMaxDistanceInput.addEventListener("change", () => { const v = Math.min(15, Math.max(1, Math.trunc(Number(autoAttackMaxDistanceInput.value) || 6))); autoAttackMaxDistanceInput.value = String(v); bot.attack.updateConfig({ maxTargetDistance: v }); }); }
    if (autoAttackHotkeyInput)      { autoAttackHotkeyInput.value = String(bot.attack?.config?.targetHotbarSlot ?? 3); autoAttackHotkeyInput.addEventListener("change", () => { const v = Math.min(12, Math.max(1, Number(autoAttackHotkeyInput.value) || 1)); autoAttackHotkeyInput.value = String(v); bot.attack.updateConfig({ targetHotbarSlot: v }); }); }
    if (autoAttackRuneHotkeyInput)  { autoAttackRuneHotkeyInput.value = bot.attack?.config?.runeHotbarSlot ? String(bot.attack.config.runeHotbarSlot) : ""; autoAttackRuneHotkeyInput.addEventListener("change", () => { const r = Number(autoAttackRuneHotkeyInput.value); const v = Number.isFinite(r) && r >= 1 && r <= 12 ? Math.trunc(r) : null; autoAttackRuneHotkeyInput.value = v ? String(v) : ""; bot.attack.updateConfig({ runeHotbarSlot: v }); }); }
    if (autoAttackMeleeInput)       { autoAttackMeleeInput.checked = bot.attack?.config?.meleeMode !== false; autoAttackMeleeInput.addEventListener("change", () => bot.attack.updateConfig({ meleeMode: autoAttackMeleeInput.checked })); }
    if (autoAttackSkillTrainInput)  { autoAttackSkillTrainInput.checked = !!bot.attack?.config?.skillTrainOnMonster; autoAttackSkillTrainInput.addEventListener("change", () => bot.attack.updateConfig({ skillTrainOnMonster: autoAttackSkillTrainInput.checked })); }
    function addAttackTargetName() {
      const raw = autoAttackTargetInput?.value?.trim() || "";
      if (!raw) return;
      const cur = bot.attack?.config?.targetNames || [];
      if (!cur.some((n) => n.trim().toLowerCase() === raw.toLowerCase())) bot.attack.updateConfig({ targetNames: [...cur, raw] });
      if (autoAttackTargetInput) autoAttackTargetInput.value = "";
      renderAttackTargetNames();
    }
    autoAttackTargetAddButton?.addEventListener("click", addAttackTargetName);
    autoAttackTargetInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addAttackTargetName(); } });
    if (autoAttackEnabledInput) {
      autoAttackEnabledInput.checked = !!bot.attack?.status?.().running;
      autoAttackEnabledInput.addEventListener("change", () => {
        const targetHotbarSlot = Math.min(12, Math.max(1, Number(autoAttackHotkeyInput?.value) || bot.attack.config.targetHotbarSlot || 1));
        const runeHotbarSlot = (() => { const r = Number(autoAttackRuneHotkeyInput?.value); return Number.isFinite(r) && r >= 1 && r <= 12 ? Math.trunc(r) : bot.attack.config.runeHotbarSlot ?? null; })();
        const meleeMode = !!autoAttackMeleeInput?.checked;
        const skillTrainOnMonster = !!autoAttackSkillTrainInput?.checked;
        const maxTargetDistance = Math.min(15, Math.max(1, Math.trunc(Number(autoAttackMaxDistanceInput?.value) || bot.attack.config.maxTargetDistance || 6)));
        if (autoAttackMaxDistanceInput) autoAttackMaxDistanceInput.value = String(maxTargetDistance);
        if (autoAttackEnabledInput.checked) bot.attack.start({ targetHotbarSlot, runeHotbarSlot, meleeMode, skillTrainOnMonster, maxTargetDistance });
        else bot.attack.stop();
        refreshAutoAttackStatus();
      });
    }

    // ── Cave ──────────────────────────────────────────────────
    caveRecordButton?.addEventListener("click", () => { bot.cave.addWaypointCurrentSpot(); refreshCavePresetControls(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); });
    caveAddDelayButton?.addEventListener("click", () => { const r = window.prompt("Delay in seconds:", "90"); if (r == null) return; const s = Math.max(1, Math.trunc(Number(r) || 0)); if (!Number.isFinite(s) || s <= 0) { window.alert("Please enter a valid number greater than 0."); return; } bot.cave.addDelay(s); refreshCavePresetControls(); refreshCaveStatus(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); });
    caveRemoveLastButton?.addEventListener("click", () => { bot.cave.removeLastWaypoint(); refreshCavePresetControls(); refreshCaveStatus(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); });
    if (cavePauseUntilClearInput) { cavePauseUntilClearInput.checked = bot.cave?.config?.pauseUntilClear !== false; cavePauseUntilClearInput.addEventListener("change", () => { bot.cave.updateConfig({ pauseUntilClear: cavePauseUntilClearInput.checked }); refreshCaveStatus(); }); }
    if (caveSpawnFloorOffsetInput) { caveSpawnFloorOffsetInput.value = String(bot.cave?.config?.pauseUntilSpawnFloorOffset ?? 1); caveSpawnFloorOffsetInput.addEventListener("change", () => { const v = Math.trunc(Number(caveSpawnFloorOffsetInput.value) || 0); caveSpawnFloorOffsetInput.value = String(v); bot.cave.updateConfig({ pauseUntilSpawnFloorOffset: v }); refreshCaveStatus(); }); }
    if (cavePauseUntilSpawnInput) { cavePauseUntilSpawnInput.checked = !!bot.cave?.config?.pauseUntilSpawn; cavePauseUntilSpawnInput.addEventListener("change", () => { const o = Math.trunc(Number(caveSpawnFloorOffsetInput?.value) || bot.cave?.config?.pauseUntilSpawnFloorOffset || 0); bot.cave.updateConfig({ pauseUntilSpawn: cavePauseUntilSpawnInput.checked, pauseUntilSpawnFloorOffset: o }); refreshCaveStatus(); }); }
    caveStartButton?.addEventListener("click", () => { bot.cave.start(); refreshCavePresetControls(); refreshCaveStatus(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); });
    caveStopButton?.addEventListener("click",  () => { bot.cave.stop();  refreshCavePresetControls(); refreshCaveStatus(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); });
    cavePresetSelect?.addEventListener("change", () => { const n = cavePresetSelect.value || ""; if (!n || n === bot.cave?.getActivePresetName?.()) { refreshCavePresetControls(); return; } bot.cave.loadPreset(n); refreshCavePresetControls(); refreshCaveStatus(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); });
    cavePresetNewButton?.addEventListener("click", () => { const n = window.prompt("Name the new cave preset:"); if (n == null) return; if (!bot.cave.createPreset(n)) return; refreshCavePresetControls(); refreshCaveStatus(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); });
    cavePresetDeleteButton?.addEventListener("click", () => { const n = cavePresetSelect?.value || ""; if (!n) return; if (!bot.cave.deletePreset(n)) return; refreshCavePresetControls(); refreshCaveStatus(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); });
    cavePresetExportButton?.addEventListener("click", async () => { const p = bot.cave?.exportPresets?.(); if (!p) { window.alert("Could not export cave presets."); return; } const s = JSON.stringify(p, null, 2); let copied = false; try { if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(s); copied = true; } } catch(e) {} if (copied) { window.alert("Cave presets copied to clipboard."); return; } window.prompt("Copy your cave presets JSON:", s); });
    cavePresetImportButton?.addEventListener("click", () => { const i = window.prompt("Paste cave presets JSON to import:"); if (i == null) return; const im = bot.cave?.importPresets?.(i); if (!im) { window.alert("Import failed. Please verify your JSON."); return; } refreshCavePresetControls(); refreshCaveStatus(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); window.alert("Imported " + (im.presets?.length || 0) + " cave preset(s)."); });

    // ── Xray ─────────────────────────────────────────────────
    xrayOverlayButton?.addEventListener("click", () => { bot.xray?.setOverlayEnabled?.(!bot.xray?.status?.().config?.overlayEnabled); refreshXrayStatus(); });
    xrayFloorSelect?.addEventListener("change", () => { const v = xrayFloorSelect.value; bot.xray?.setSelectedFloor?.(v === "all" ? null : Number(v)); refreshXrayStatus(); refreshVisibleCreatures(); });

    // ── Talk ──────────────────────────────────────────────────
    if (talkApiKeyInput) { talkApiKeyInput.value = bot.talk?.config?.apiKey || ""; talkApiKeyInput.addEventListener("change", () => { bot.talk.updateConfig({ apiKey: talkApiKeyInput.value.trim() }); refreshTalkStatus(); }); }
    if (talkPromptInput) { talkPromptInput.value = bot.talk?.config?.systemPrompt || ""; talkPromptInput.addEventListener("change", () => bot.talk.updateConfig({ systemPrompt: talkPromptInput.value.trim() })); }
    if (talkEnabledInput) { talkEnabledInput.checked = !!bot.talk?.status?.().running; talkEnabledInput.addEventListener("change", () => { if (talkEnabledInput.checked) { bot.talk.updateConfig({ apiKey: talkApiKeyInput?.value?.trim() || "", systemPrompt: talkPromptInput?.value?.trim() || bot.talk.config.systemPrompt || "" }); if (!bot.talk.start()) talkEnabledInput.checked = false; } else { bot.talk.stop(); } refreshTalkStatus(); }); }

    // ── Panic ─────────────────────────────────────────────────
    if (panicUnknownInput) { panicUnknownInput.checked = !!bot.panic?.status?.().config?.unknownPlayerEnabled; panicUnknownInput.addEventListener("change", () => { bot.panic.updateConfig({ unknownPlayerEnabled: panicUnknownInput.checked }); refreshPanicStatus(); }); }
    if (panicHealthInput)  { panicHealthInput.checked  = !!bot.panic?.status?.().config?.healthLossEnabled;    panicHealthInput.addEventListener("change",  () => { bot.panic.updateConfig({ healthLossEnabled:    panicHealthInput.checked  }); refreshPanicStatus(); }); }
    if (panicReturnInput)  { panicReturnInput.checked  = !!bot.panic?.status?.().config?.returnToOriginEnabled; panicReturnInput.addEventListener("change", () => { bot.panic.updateConfig({ returnToOriginEnabled: panicReturnInput.checked  }); refreshPanicStatus(); }); }

    // ── Profiles ──────────────────────────────────────────────
    const profilesNameInput   = panel.querySelector("#minibia-bot-profiles-name-input");
    const profilesSelect      = panel.querySelector("#minibia-bot-profiles-select");
    const profilesSaveButton  = panel.querySelector("#minibia-bot-profiles-save");
    const profilesLoadButton  = panel.querySelector("#minibia-bot-profiles-load");
    const profilesDeleteButton= panel.querySelector("#minibia-bot-profiles-delete");
    const profilesExportButton= panel.querySelector("#minibia-bot-profiles-export");
    profilesSelect?.addEventListener("change", () => { if (profilesNameInput && profilesSelect.value) profilesNameInput.value = profilesSelect.value; });
    profilesSaveButton?.addEventListener("click", () => { const n = profilesNameInput?.value?.trim() || ""; if (!n) { alert("Enter a profile name before saving."); return; } bot.profiles?.save?.(n); refreshProfilesPanel(); });
    profilesLoadButton?.addEventListener("click", () => { const n = profilesSelect?.value || profilesNameInput?.value?.trim() || ""; if (!n) { alert("Select or enter a profile name to load."); return; } bot.profiles?.load?.(n); });
    profilesDeleteButton?.addEventListener("click", () => { const n = profilesSelect?.value || ""; if (!n) return; if (!confirm("Delete profile: " + n + "?")) return; bot.profiles?.delete?.(n); if (profilesNameInput) profilesNameInput.value = ""; refreshProfilesPanel(); });
    profilesExportButton?.addEventListener("click", () => { const n = profilesSelect?.value || ""; bot.profiles?.export?.(n || null); });

    // ── Rune Check ────────────────────────────────────────────
    const runeCheckEnabledInput = panel.querySelector("#minibia-bot-rune-check-enabled");
    const runeCheckAlarmInput   = panel.querySelector("#minibia-bot-rune-check-alarm");
    const runeCheckLogoutInput  = panel.querySelector("#minibia-bot-rune-check-logout");
    if (runeCheckAlarmInput)  { runeCheckAlarmInput.checked  = !!bot.runeCheck?.config?.alarmEnabled;  runeCheckAlarmInput.addEventListener("change",  () => { bot.runeCheck?.updateConfig?.({ alarmEnabled:  runeCheckAlarmInput.checked  }); refreshRuneCheckStatus(); }); }
    if (runeCheckLogoutInput) { runeCheckLogoutInput.checked = !!bot.runeCheck?.config?.logoutEnabled; runeCheckLogoutInput.addEventListener("change", () => { bot.runeCheck?.updateConfig?.({ logoutEnabled: runeCheckLogoutInput.checked }); refreshRuneCheckStatus(); }); }
    if (runeCheckEnabledInput) { runeCheckEnabledInput.checked = !!bot.runeCheck?.status?.().running; runeCheckEnabledInput.addEventListener("change", () => { if (runeCheckEnabledInput.checked) bot.runeCheck?.start?.(); else bot.runeCheck?.stop?.(); refreshRuneCheckStatus(); }); }

    // ── Follow ────────────────────────────────────────────────
    const followEnabledInput  = panel.querySelector("#minibia-bot-follow-enabled");
    const followTargetInput   = panel.querySelector("#minibia-bot-follow-target");
    const followDistanceInput = panel.querySelector("#minibia-bot-follow-distance");
    if (followTargetInput)   { followTargetInput.value   = bot.follow?.config?.targetPlayerName || ""; followTargetInput.addEventListener("change", () => { bot.follow?.updateConfig?.({ targetPlayerName: followTargetInput.value.trim() }); refreshFollowStatus(); }); }
    if (followDistanceInput) { followDistanceInput.value = String(bot.follow?.config?.followDistance ?? 2); followDistanceInput.addEventListener("change", () => { const d = Math.max(0, Math.min(10, Math.trunc(Number(followDistanceInput.value) || 0))); followDistanceInput.value = String(d); bot.follow?.updateConfig?.({ followDistance: d }); refreshFollowStatus(); }); }
    if (followEnabledInput)  { followEnabledInput.checked = !!bot.follow?.status?.().running; followEnabledInput.addEventListener("change", () => { const n = followTargetInput?.value?.trim() || bot.follow?.config?.targetPlayerName || ""; const d = Math.max(0, Math.min(10, Math.trunc(Number(followDistanceInput?.value) || 2))); if (followEnabledInput.checked) bot.follow?.start?.({ targetPlayerName: n, followDistance: d }); else bot.follow?.stop?.(); refreshFollowStatus(); }); }

    // ── Misc ──────────────────────────────────────────────────
    panel.querySelector("#minibia-bot-set-home")?.addEventListener("click", () => { bot.pz.setHomePzCurrentSpot(); refreshHomeLabel(); });

    // ── Refresh inicial ───────────────────────────────────────
    refreshHomeLabel(); refreshPanicStatus(); refreshXrayStatus();
    renderGameMasterNames(); renderTrustedNames(); refreshRuneStatus();
    refreshAutoHealStatus(); refreshAutoInvisibleStatus(); refreshAutoMagicShieldStatus();
    refreshAutoAttackStatus(); renderAttackTargetNames(); refreshAutoEatStatus();
    refreshCaveStatus(); refreshEquipRingStatus(); refreshTalkStatus();
    refreshProfilesPanel(); refreshRuneCheckStatus(); refreshFollowStatus();
    refreshVisibleCreatures(); refreshCavePresetControls(); refreshCaveClosestStatus();
    refreshCaveTransitionStatus(); refreshAutoStackStatus();

    // ── Timers de refresh ─────────────────────────────────────
    const tid1 = window.setInterval(refreshVisibleCreatures, 1000);
    bot.addCleanup(() => window.clearInterval(tid1));
    const tid2 = window.setInterval(() => { refreshTalkStatus(); refreshFollowStatus(); refreshRuneCheckStatus(); refreshProfilesPanel(); refreshAutoStackStatus(); }, 1000);
    bot.addCleanup(() => window.clearInterval(tid2));
    const tid3 = window.setInterval(() => { refreshCaveStatus(); refreshCavePresetControls(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); }, 1000);
    bot.addCleanup(() => window.clearInterval(tid3));
  }

  bot.ui = {
    inject, destroy,
    refreshHomeLabel, refreshPanicStatus, refreshXrayStatus,
    refreshRuneStatus, refreshAutoHealStatus, refreshAutoInvisibleStatus,
    refreshAutoMagicShieldStatus, refreshAutoAttackStatus, renderAttackTargetNames,
    refreshAutoEatStatus, refreshCaveStatus, refreshCavePresetControls,
    refreshEquipRingStatus, refreshTalkStatus, refreshProfilesPanel,
    refreshRuneCheckStatus, refreshFollowStatus, refreshVisibleCreatures,
    refreshCaveClosestStatus, refreshCaveTransitionStatus,
    refreshAutoStackStatus,   // ← novo
    getSavedPanelPosition, getSavedPanelCollapsed,
    setPanelCollapsed: (collapsed) => { const p = document.getElementById("minibia-bot-panel"); setPanelCollapsed(p, collapsed); },
  };
};
