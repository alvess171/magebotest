(function () {

  // -----------------------------------------------------------------------
  // 1. AUTO FRIEND HEAL
  // -----------------------------------------------------------------------
  function installAutoFriendHealModule(bot) {
    const configStorageKey = "minibiaBot.friendHeal.config";
    const state = { running: false, timerId: null, lastHealAt: 0, lastAttemptAt: 0, pendingAttempt: null };
    const config = Object.assign({ tickMs: 100, healCooldownMs: 1500, healRetryMs: 300, healConfirmMs: 400, minHpPercent: 70, spellWords: "exura sio", targetName: "", enabled: false }, bot.storage.get(configStorageKey, {}));
    function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
    function normalizeName(n) { return String(n || "").trim().toLowerCase(); }
    function findTargetCreature() {
      const t = normalizeName(config.targetName);
      if (!t) return null;
      for (const c of Object.values(window.gameClient?.world?.activeCreatures || {})) {
        if (c && normalizeName(c.name) === t) return c;
      }
      return null;
    }
    function readHpPct(c) {
      if (!c) return null;
      const hp = Number(c.health ?? c.hp ?? c.currentHealth ?? c.state?.health);
      const max = Number(c.maxHealth ?? c.maxHp ?? c.maximumHealth ?? c.state?.maxHealth);
      if (Number.isFinite(hp) && Number.isFinite(max) && max > 0) return (hp / max) * 100;
      const pct = Number(c.healthPercent ?? c.hpPercent ?? c.healthpercentage ?? c.state?.healthPercent);
      return Number.isFinite(pct) ? pct : null;
    }
    function readHpAbs(c) {
      if (!c) return null;
      const hp = Number(c.health ?? c.hp ?? c.currentHealth ?? c.state?.health);
      return Number.isFinite(hp) ? hp : null;
    }
    function buildCmd() {
      const n = String(config.targetName || "").trim();
      const s = String(config.spellWords || "exura sio").trim();
      return n ? `${s} "${n}"` : null;
    }
    function didSucceed(c, a) {
      if (!c || !a) return false;
      const hp = readHpAbs(c); if (hp != null && hp > a.hpBefore) return true;
      const pct = readHpPct(c); return pct != null && pct > a.pctBefore;
    }
    function resolvePending(c, now) {
      if (!state.pendingAttempt) return;
      if (didSucceed(c, state.pendingAttempt)) { state.lastHealAt = state.pendingAttempt.attemptedAt; bot.log("friend heal confirmed", { target: config.targetName }); state.pendingAttempt = null; return; }
      if (now - state.pendingAttempt.attemptedAt >= Math.max(50, Number(config.healConfirmMs) || 400)) { bot.log("friend heal no HP change"); state.pendingAttempt = null; }
    }
    function canHeal(now, c) {
      if (!c || state.pendingAttempt) return false;
      if (now - state.lastHealAt < Math.max(0, Number(config.healCooldownMs) || 1500)) return false;
      if (now - state.lastAttemptAt < Math.max(50, Number(config.healRetryMs) || 300)) return false;
      const pct = readHpPct(c); return pct != null && pct <= Math.max(0, Number(config.minHpPercent) || 70);
    }
    function tryHeal() {
      if (!config.enabled) return false;
      const now = Date.now(), c = findTargetCreature();
      resolvePending(c, now);
      if (!canHeal(now, c)) return false;
      const cmd = buildCmd(); if (!cmd) { bot.log("friend heal: targetName não configurado"); return false; }
      const sent = bot.sendChat(cmd);
      if (sent) { state.lastAttemptAt = now; state.pendingAttempt = { attemptedAt: now, spell: cmd, hpBefore: readHpAbs(c) ?? 0, pctBefore: readHpPct(c) ?? 0 }; bot.log("friend heal cast", { target: config.targetName, spell: cmd, hp: state.pendingAttempt.pctBefore.toFixed(1) + "%" }); }
      return sent;
    }
    function scheduleNextTick() { if (!state.running) return; state.timerId = window.setTimeout(() => tick(), config.tickMs); }
    function tick() { if (!state.running) return; try { tryHeal(); } catch (e) { bot.log("friend heal tick error", e?.message); } finally { scheduleNextTick(); } }
    function start(ov = {}) { Object.assign(config, ov, { enabled: true }); persistConfig(); if (state.running) return false; state.running = true; bot.log("friend heal started", { ...config }); tick(); return true; }
    function stop(opts = {}) { const p = opts.persistEnabled !== false; state.running = false; if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; } if (p) { config.enabled = false; persistConfig(); } state.pendingAttempt = null; bot.log("friend heal stopped"); return true; }
    function status() { const c = findTargetCreature(); return { running: state.running, config: { ...config }, targetFound: !!c, targetHpPercent: readHpPct(c), lastHealAt: state.lastHealAt }; }
    function updateConfig(next = {}) {
      if ("minHpPercent" in next) next.minHpPercent = Math.min(100, Math.max(0, Number(next.minHpPercent) || 70));
      if ("targetName" in next) next.targetName = String(next.targetName || "").trim();
      if ("spellWords" in next) next.spellWords = String(next.spellWords || "exura sio").trim() || "exura sio";
      if ("healCooldownMs" in next) next.healCooldownMs = Math.max(0, Number(next.healCooldownMs) || 1500);
      Object.assign(config, next); persistConfig(); bot.log("friend heal config updated", { ...config }); return { ...config };
    }
    if (config.enabled && config.targetName) start();
    bot.friendHeal = { start, stop, status, updateConfig, tryHeal, findTargetCreature, readTargetHpPercent: readHpPct, config };
  }

  // -----------------------------------------------------------------------
  // 2. PAINEL: FRIEND HEAL
  // -----------------------------------------------------------------------
  function patchFriendHealPanel(bot) {
    if (!bot.friendHeal) return;
    const body = window.document.querySelector("#minibia-bot-panel .mb-body");
    if (!body || window.document.getElementById("minibia-bot-friend-heal-enabled")) return;
    const accordion = window.document.createElement("div");
    accordion.className = "mb-accordion";
    accordion.dataset.module = "friendHeal";
    accordion.innerHTML = `
      <div class="mb-accordion-header">
        <span class="mb-accordion-title">Friend Heal</span>
        <button type="button" class="mb-accordion-toggle mb-icon-button" aria-label="Expand section">+</button>
      </div>
      <div class="mb-accordion-body" hidden>
        <div class="mb-stack">
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-friend-heal-enabled" /><span>Enable Friend Heal</span></label>
          <label class="mb-field" for="minibia-bot-friend-heal-target"><span class="mb-field-label">Nome do player a curar</span><input type="text" id="minibia-bot-friend-heal-target" placeholder="ex: Xanathos" /></label>
          <label class="mb-field" for="minibia-bot-friend-heal-spell"><span class="mb-field-label">Feitiço (sem o nome)</span><input type="text" id="minibia-bot-friend-heal-spell" placeholder="exura sio" /></label>
          <label class="mb-field" for="minibia-bot-friend-heal-hp"><span class="mb-field-label">Curar quando HP% ≤</span><input type="number" id="minibia-bot-friend-heal-hp" min="1" max="100" placeholder="70" /></label>
          <label class="mb-field" for="minibia-bot-friend-heal-cooldown"><span class="mb-field-label">Cooldown entre curas (ms)</span><input type="number" id="minibia-bot-friend-heal-cooldown" min="500" placeholder="1500" /></label>
          <div class="mb-small-note" id="minibia-bot-friend-heal-status">Status: idle</div>
          <div class="mb-small-note">Envia: <b>exura sio "Nome"</b> quando HP% do alvo cair abaixo do threshold.</div>
        </div>
      </div>`;
    const talkAccordion = body.querySelector('.mb-accordion[data-module="talk"]');
    talkAccordion ? body.insertBefore(accordion, talkAccordion) : body.appendChild(accordion);
    const enabledInput = accordion.querySelector("#minibia-bot-friend-heal-enabled");
    const targetInput = accordion.querySelector("#minibia-bot-friend-heal-target");
    const spellInput = accordion.querySelector("#minibia-bot-friend-heal-spell");
    const hpInput = accordion.querySelector("#minibia-bot-friend-heal-hp");
    const cooldownInput = accordion.querySelector("#minibia-bot-friend-heal-cooldown");
    const statusLabel = accordion.querySelector("#minibia-bot-friend-heal-status");
    enabledInput.checked = !!bot.friendHeal.status().running;
    targetInput.value = bot.friendHeal.config.targetName || "";
    spellInput.value = bot.friendHeal.config.spellWords || "exura sio";
    hpInput.value = String(bot.friendHeal.config.minHpPercent ?? 70);
    cooldownInput.value = String(bot.friendHeal.config.healCooldownMs ?? 1500);
    function refreshStatus() {
      const s = bot.friendHeal.status();
      const pct = s.targetHpPercent;
      if (!s.config.targetName) { statusLabel.textContent = "Status: configure o nome do target"; return; }
      statusLabel.textContent = s.running ? `Status: ativo • target: ${s.targetFound ? "✓ visível" : "✗ não encontrado"}${pct != null ? " • HP: " + pct.toFixed(1) + "%" : ""}` : "Status: parado";
      enabledInput.checked = s.running;
    }
    targetInput.addEventListener("change", () => { bot.friendHeal.updateConfig({ targetName: targetInput.value.trim() }); refreshStatus(); });
    spellInput.addEventListener("change", () => { bot.friendHeal.updateConfig({ spellWords: spellInput.value.trim() }); });
    hpInput.addEventListener("change", () => { const v = Math.min(100, Math.max(1, Number(hpInput.value) || 70)); hpInput.value = String(v); bot.friendHeal.updateConfig({ minHpPercent: v }); });
    cooldownInput.addEventListener("change", () => { const v = Math.max(500, Number(cooldownInput.value) || 1500); cooldownInput.value = String(v); bot.friendHeal.updateConfig({ healCooldownMs: v }); });
    enabledInput.addEventListener("change", () => {
      if (enabledInput.checked) { bot.friendHeal.updateConfig({ targetName: targetInput.value.trim(), spellWords: spellInput.value.trim(), minHpPercent: Math.min(100, Math.max(1, Number(hpInput.value) || 70)), healCooldownMs: Math.max(500, Number(cooldownInput.value) || 1500) }); if (!bot.friendHeal.start()) enabledInput.checked = false; }
      else { bot.friendHeal.stop(); }
      refreshStatus();
    });
    const toggle = accordion.querySelector(".mb-accordion-toggle");
    const abody = accordion.querySelector(".mb-accordion-body");
    accordion.querySelector(".mb-accordion-header").addEventListener("click", (e) => { if (e.target.closest("button:not(.mb-accordion-toggle), input, select, textarea, a, label")) return; const exp = accordion.dataset.expanded === "true"; accordion.dataset.expanded = exp ? "false" : "true"; abody.hidden = exp; toggle.textContent = exp ? "+" : "−"; });
    toggle.addEventListener("click", (e) => { e.stopPropagation(); const exp = accordion.dataset.expanded === "true"; accordion.dataset.expanded = exp ? "false" : "true"; abody.hidden = exp; toggle.textContent = exp ? "+" : "−"; });
    const tid = window.setInterval(refreshStatus, 1000);
    bot.addCleanup(() => window.clearInterval(tid));
    bot.ui.refreshFriendHealStatus = refreshStatus;
    refreshStatus();
  }

  // -----------------------------------------------------------------------
  // 3. AUTO SPELL (AoE)
  // -----------------------------------------------------------------------
  function installAutoSpellModule(bot) {
    const configStorageKey = "minibiaBot.autoSpell.config";
    const state = { running: false, timerId: null, lastCastAt: 0 };
    const config = Object.assign({ tickMs: 200, spellWords: "exori", minMobCount: 2, cooldownMs: 2000, enabled: false }, bot.storage.get(configStorageKey, {}));
    function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
    function getAdjacentMobs() {
      const playerPos = bot.getPlayerPosition();
      if (!playerPos) return [];
      return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []).filter((creature) => {
        const pos = creature?.__position || creature?.getPosition?.();
        if (!pos || pos.z !== playerPos.z) return false;
        return Math.abs(pos.x - playerPos.x) <= 1 && Math.abs(pos.y - playerPos.y) <= 1;
      });
    }
    function isCombatActive() { return !!bot.attack?.isCombatActive?.(); }
    function canCast(now) {
      if (!config.enabled || !isCombatActive()) return false;
      if (now - state.lastCastAt < Math.max(0, Number(config.cooldownMs) || 2000)) return false;
      return getAdjacentMobs().length >= Math.max(1, Number(config.minMobCount) || 2);
    }
    function tryCast() {
      const now = Date.now();
      if (!canCast(now)) return false;
      const sent = bot.sendChat(config.spellWords);
      if (sent) { state.lastCastAt = now; bot.log("auto spell cast", { spell: config.spellWords, adjacentMobs: getAdjacentMobs().length }); }
      return sent;
    }
    function scheduleNextTick() { if (!state.running) return; state.timerId = window.setTimeout(() => tick(), config.tickMs); }
    function tick() { if (!state.running) return; try { tryCast(); } catch (e) { bot.log("auto spell tick error", e?.message); } finally { scheduleNextTick(); } }
    function start(ov = {}) { Object.assign(config, ov, { enabled: true }); persistConfig(); if (state.running) return false; state.running = true; bot.log("auto spell started", { ...config }); tick(); return true; }
    function stop(opts = {}) { const p = opts.persistEnabled !== false; state.running = false; if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; } if (p) { config.enabled = false; persistConfig(); } bot.log("auto spell stopped"); return true; }
    function status() { return { running: state.running, config: { ...config }, adjacentMobs: getAdjacentMobs().length, combatActive: isCombatActive(), lastCastAt: state.lastCastAt }; }
    function updateConfig(next = {}) {
      if ("spellWords" in next) next.spellWords = String(next.spellWords || "").trim() || config.spellWords;
      if ("minMobCount" in next) next.minMobCount = Math.max(1, Math.trunc(Number(next.minMobCount) || 2));
      if ("cooldownMs" in next) next.cooldownMs = Math.max(500, Number(next.cooldownMs) || 2000);
      Object.assign(config, next); persistConfig(); bot.log("auto spell config updated", { ...config }); return { ...config };
    }
    if (config.enabled) start();
    bot.autoSpell = { start, stop, status, updateConfig, getAdjacentMobs, tryCast, config };
  }

  // -----------------------------------------------------------------------
  // 4. PAINEL: AUTO SPELL
  // -----------------------------------------------------------------------
  function patchAutoSpellPanel(bot) {
    if (!bot.autoSpell) return;
    const body = window.document.querySelector("#minibia-bot-panel .mb-body");
    if (!body || window.document.getElementById("minibia-bot-auto-spell-enabled")) return;
    const accordion = window.document.createElement("div");
    accordion.className = "mb-accordion";
    accordion.dataset.module = "autoSpell";
    accordion.innerHTML = `
      <div class="mb-accordion-header">
        <span class="mb-accordion-title">Auto Spell (AoE)</span>
        <button type="button" class="mb-accordion-toggle mb-icon-button" aria-label="Expand section">+</button>
      </div>
      <div class="mb-accordion-body" hidden>
        <div class="mb-stack">
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-spell-enabled" /><span>Enable Auto Spell</span></label>
          <label class="mb-field" for="minibia-bot-auto-spell-words"><span class="mb-field-label">Feitiço</span><input type="text" id="minibia-bot-auto-spell-words" placeholder="exori" /></label>
          <label class="mb-field" for="minibia-bot-auto-spell-min-mobs"><span class="mb-field-label">Mínimo de mobs adjacentes</span><input type="number" id="minibia-bot-auto-spell-min-mobs" min="1" placeholder="2" /></label>
          <label class="mb-field" for="minibia-bot-auto-spell-cooldown"><span class="mb-field-label">Cooldown (ms)</span><input type="number" id="minibia-bot-auto-spell-cooldown" min="500" placeholder="2000" /></label>
          <div class="mb-small-note" id="minibia-bot-auto-spell-status">Status: idle</div>
          <div class="mb-small-note">Só castea se o auto attack estiver ativo E tiver X mobs a 1 sqm (corpo a corpo). Para se player desconhecido aparecer no floor.</div>
        </div>
      </div>`;
    const friendHealAccordion = body.querySelector('.mb-accordion[data-module="friendHeal"]');
    const talkAccordion = body.querySelector('.mb-accordion[data-module="talk"]');
    const insertBefore = friendHealAccordion || talkAccordion;
    insertBefore ? body.insertBefore(accordion, insertBefore) : body.appendChild(accordion);
    const enabledInput = accordion.querySelector("#minibia-bot-auto-spell-enabled");
    const spellInput = accordion.querySelector("#minibia-bot-auto-spell-words");
    const minMobsInput = accordion.querySelector("#minibia-bot-auto-spell-min-mobs");
    const cooldownInput = accordion.querySelector("#minibia-bot-auto-spell-cooldown");
    const statusLabel = accordion.querySelector("#minibia-bot-auto-spell-status");
    enabledInput.checked = !!bot.autoSpell.status().running;
    spellInput.value = bot.autoSpell.config.spellWords || "exori";
    minMobsInput.value = String(bot.autoSpell.config.minMobCount ?? 2);
    cooldownInput.value = String(bot.autoSpell.config.cooldownMs ?? 2000);
    function refreshStatus() {
      const s = bot.autoSpell.status();
      enabledInput.checked = s.running;
      statusLabel.textContent = s.running ? `Status: ativo • mobs adjacentes: ${s.adjacentMobs} • combat: ${s.combatActive ? "✓" : "✗"}` : "Status: parado";
    }
    spellInput.addEventListener("change", () => { bot.autoSpell.updateConfig({ spellWords: spellInput.value.trim() }); });
    minMobsInput.addEventListener("change", () => { const v = Math.max(1, Number(minMobsInput.value) || 2); minMobsInput.value = String(v); bot.autoSpell.updateConfig({ minMobCount: v }); });
    cooldownInput.addEventListener("change", () => { const v = Math.max(500, Number(cooldownInput.value) || 2000); cooldownInput.value = String(v); bot.autoSpell.updateConfig({ cooldownMs: v }); });
    enabledInput.addEventListener("change", () => {
      if (enabledInput.checked) { bot.autoSpell.updateConfig({ spellWords: spellInput.value.trim(), minMobCount: Math.max(1, Number(minMobsInput.value) || 2), cooldownMs: Math.max(500, Number(cooldownInput.value) || 2000) }); if (!bot.autoSpell.start()) enabledInput.checked = false; }
      else { bot.autoSpell.stop(); }
      refreshStatus();
    });
    const toggle = accordion.querySelector(".mb-accordion-toggle");
    const abody = accordion.querySelector(".mb-accordion-body");
    accordion.querySelector(".mb-accordion-header").addEventListener("click", (e) => { if (e.target.closest("button:not(.mb-accordion-toggle), input, select, textarea, a, label")) return; const exp = accordion.dataset.expanded === "true"; accordion.dataset.expanded = exp ? "false" : "true"; abody.hidden = exp; toggle.textContent = exp ? "+" : "−"; });
    toggle.addEventListener("click", (e) => { e.stopPropagation(); const exp = accordion.dataset.expanded === "true"; accordion.dataset.expanded = exp ? "false" : "true"; abody.hidden = exp; toggle.textContent = exp ? "+" : "−"; });
    const tid = window.setInterval(refreshStatus, 1000);
    bot.addCleanup(() => window.clearInterval(tid));
    bot.ui.refreshAutoSpellStatus = refreshStatus;
    refreshStatus();
  }

  // -----------------------------------------------------------------------
  // 5. FIX: isSated
  // -----------------------------------------------------------------------
  function patchIsSated(bot) {
    bot.eat.isSated = function () {
      const foodText = window.document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() || "";
      if (foodText) { const match = foodText.match(/^(\d{1,2}):(\d{2})$/); if (match) return (Number(match[1]) * 60 + Number(match[2])) > 0; }
      return false;
    };
    bot.eat.updateConfig({ eatCooldownMs: 60000 });
    bot.log("isSated patch aplicado");
  }

  // -----------------------------------------------------------------------
  // 6. FIX: returnDelayMs — 5s
  // -----------------------------------------------------------------------
  function patchReturnDelay(bot) {
    bot.panic.updateConfig({ returnDelayMs: 5000, returnDelayJitterMs: 0 });
    bot.log("returnDelayMs patch aplicado — 5s");
  }

  // -----------------------------------------------------------------------
  // 7. FIX: Panic Runner — somente floor atual
  // -----------------------------------------------------------------------
  function patchPanicFloorOnly(bot) {
    bot.panic.getVisiblePlayers = function () {
      const me = bot.getPlayerPosition();
      const players = bot.xray?.getVisiblePlayers?.({ sameFloorOnly: true }) || [];
      if (!me) return players;
      return players.filter((c) => { const z = Number(c?.__position?.z); return Number.isFinite(z) && z === me.z; });
    };
    bot.panic.getUnknownVisiblePlayers = function () {
      const trusted = new Set(bot.panic.getTrustedNames());
      return bot.panic.getVisiblePlayers().filter((c) => { const name = String(c?.name || "").trim().toLowerCase(); return !!name && !trusted.has(name); });
    };
    bot.panic.getTrustedVisiblePlayers = function () {
      const trusted = new Set(bot.panic.getTrustedNames());
      return bot.panic.getVisiblePlayers().filter((c) => { const name = String(c?.name || "").trim().toLowerCase(); return !!name && trusted.has(name); });
    };
    bot.panic.getVisibleGameMasters = function () {
      const gms = new Set(bot.panic.getGameMasterNames());
      return bot.panic.getVisiblePlayers().filter((c) => { const name = String(c?.name || "").trim().toLowerCase(); return !!name && gms.has(name); });
    };
    bot.log("panic floor-only patch aplicado");
  }

  // -----------------------------------------------------------------------
  // 8. ALARM STOP — para o alarme quando player sumir do floor
  // -----------------------------------------------------------------------
  function patchAlarmStop(bot) {
    let _ourAudio = null;
    const _alarmSrc = bot.getAlarmAudioSrc();
    function getOurAudio() {
      if (!_ourAudio) { _ourAudio = new Audio(_alarmSrc); _ourAudio.preload = "auto"; }
      return _ourAudio;
    }
    bot.playAlarm = function () {
      try {
        const audio = getOurAudio();
        audio.pause(); audio.currentTime = 0; audio.muted = false;
        audio.play().catch((e) => bot.log("alarm play error", e?.message));
        bot.log("alarme tocando");
        return true;
      } catch (e) { bot.log("playAlarm error", e?.message); return false; }
    };
    bot.stopAlarm = function () {
      try {
        if (_ourAudio) { _ourAudio.pause(); _ourAudio.currentTime = 0; }
        bot.log("alarme parado");
        return true;
      } catch (e) { bot.log("stopAlarm error", e?.message); return false; }
    };
    if (window._alarmStopWatcherId) window.clearInterval(window._alarmStopWatcherId);
    let alarmActive = false;
    let lastTriggerAt = bot.panic.status().lastTriggerAt || 0;
    function getUnknownPlayersSameFloor() {
      const trusted = new Set((bot.panic?.getTrustedNames?.() || []).map(n => String(n).trim().toLowerCase()));
      const myName = String(bot.getPlayerName?.() || "").trim().toLowerCase();
      const myId = window.gameClient?.player?.id;
      return (bot.xray?.getVisiblePlayers?.({ sameFloorOnly: true }) || []).filter((c) => {
        if (c.id === myId) return false;
        const name = String(c.name || "").trim().toLowerCase();
        if (name && name === myName) return false;
        if (name && trusted.has(name)) return false;
        return true;
      });
    }
    window._alarmStopWatcherId = window.setInterval(() => {
      const currentTriggerAt = bot.panic.status().lastTriggerAt || 0;
      if (currentTriggerAt > lastTriggerAt) { lastTriggerAt = currentTriggerAt; alarmActive = true; bot.log("alarme ativado — aguardando player sumir"); }
      if (alarmActive && getUnknownPlayersSameFloor().length === 0) { alarmActive = false; bot.stopAlarm(); }
    }, 500);
    bot.addCleanup(() => window.clearInterval(window._alarmStopWatcherId));
    bot.log("alarm stop watcher instalado");
  }

  // -----------------------------------------------------------------------
  // 9. WATCHER: Auto Spell pausa se player desconhecido no floor atual
  // -----------------------------------------------------------------------
  function installSpellPlayerWatcher(bot) {
    if (window._autoSpellPlayerWatcherId) window.clearInterval(window._autoSpellPlayerWatcherId);
    let playerOnScreen = false;
    function getUnknownPlayersSameFloor() {
      const trusted = new Set((bot.panic?.getTrustedNames?.() || []).map(n => String(n).trim().toLowerCase()));
      const myName = String(bot.getPlayerName?.() || "").trim().toLowerCase();
      const myId = window.gameClient?.player?.id;
      return (bot.xray?.getVisiblePlayers?.({ sameFloorOnly: true }) || []).filter((c) => {
        if (c.id === myId) return false;
        const name = String(c.name || "").trim().toLowerCase();
        if (name && name === myName) return false;
        if (name && trusted.has(name)) return false;
        return true;
      });
    }
    function tick() {
      const unknown = getUnknownPlayersSameFloor();
      const hasPlayer = unknown.length > 0;
      if (hasPlayer && !playerOnScreen) {
        playerOnScreen = true;
        if (bot.autoSpell?.status?.().running) { bot.autoSpell.stop({ persistEnabled: false }); bot.log("auto spell pausado — player no floor:", unknown.map(p => p.name)); }
      } else if (!hasPlayer && playerOnScreen) {
        playerOnScreen = false;
        const saved = bot.storage.get("minibiaBot.autoSpell.config", {});
        if (saved.enabled) { bot.autoSpell?.start?.(); bot.log("auto spell retomado — floor limpo"); }
      }
    }
    window._autoSpellPlayerWatcherId = window.setInterval(tick, 500);
    bot.addCleanup(() => window.clearInterval(window._autoSpellPlayerWatcherId));
    bot.log("auto spell player watcher instalado");
  }

  // -----------------------------------------------------------------------
  // 10. FIX: Trusted Names — lista expansível + botão Add funcional
  // -----------------------------------------------------------------------
  function patchTrustedNamesPanel(bot) {
    function renderTrustedNames() {
      const list = window.document.getElementById("minibia-bot-panic-trusted-list");
      if (!list) return;
      const trustedNames = bot.panic?.config?.trustedNames || [];
      list.innerHTML = "";
      list.style.cssText = "max-height: none !important; height: auto !important; overflow: visible !important; display: grid; gap: 6px;";
      const accordionBody = list.closest(".mb-accordion-body");
      if (accordionBody) accordionBody.style.cssText = "overflow: visible !important;";
      const mbBody = window.document.querySelector("#minibia-bot-panel .mb-body");
      if (mbBody) { mbBody.style.maxHeight = "none"; mbBody.style.overflow = "visible"; }
      if (!trustedNames.length) {
        const empty = window.document.createElement("div");
        empty.className = "mb-small-note";
        empty.textContent = "No trusted names saved.";
        list.appendChild(empty);
        return;
      }
      trustedNames.forEach((name, index) => {
        const row = window.document.createElement("div");
        row.className = "mb-list-row";
        const label = window.document.createElement("span");
        label.textContent = name;
        const removeButton = window.document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "mb-small-button";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => {
          const next = (bot.panic?.config?.trustedNames || []).filter((_, i) => i !== index);
          bot.panic.updateConfig({ trustedNames: next });
          renderTrustedNames();
        });
        row.appendChild(label);
        row.appendChild(removeButton);
        list.appendChild(row);
      });
    }

    function addTrustedName() {
      const input = window.document.getElementById("minibia-bot-panic-trusted-input");
      const rawName = input?.value?.trim() || "";
      if (!rawName) return;
      const current = bot.panic?.config?.trustedNames || [];
      const exists = current.some(n => String(n).trim().toLowerCase() === rawName.toLowerCase());
      if (!exists) bot.panic.updateConfig({ trustedNames: [...current, rawName] });
      if (input) input.value = "";
      renderTrustedNames();
    }

    const oldBtn = window.document.getElementById("minibia-bot-panic-trusted-add");
    if (oldBtn) {
      const newBtn = window.document.createElement("button");
      newBtn.type = "button";
      newBtn.className = "mb-small-button";
      newBtn.id = "minibia-bot-panic-trusted-add";
      newBtn.textContent = "Add";
      newBtn.addEventListener("click", addTrustedName);
      oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    }

    const oldInput = window.document.getElementById("minibia-bot-panic-trusted-input");
    if (oldInput) {
      const newInput = window.document.createElement("input");
      newInput.type = "text";
      newInput.id = "minibia-bot-panic-trusted-input";
      newInput.placeholder = "Trusted name";
      newInput.className = oldInput.className;
      newInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTrustedName(); } });
      oldInput.parentNode.replaceChild(newInput, oldInput);
    }

    renderTrustedNames();
    if (window._trustedNamesTimerId) window.clearInterval(window._trustedNamesTimerId);
    window._trustedNamesTimerId = window.setInterval(renderTrustedNames, 2000);
    bot.addCleanup(() => window.clearInterval(window._trustedNamesTimerId));
    bot.log("trusted names panel restaurado");
  }

  // -----------------------------------------------------------------------
  // APPLY ALL
  // -----------------------------------------------------------------------
  function applyAll(bot) {
    installAutoFriendHealModule(bot);
    patchFriendHealPanel(bot);
    installAutoSpellModule(bot);
    patchAutoSpellPanel(bot);
    patchIsSated(bot);
    patchReturnDelay(bot);
    patchPanicFloorOnly(bot);
    patchAlarmStop(bot);
    installSpellPlayerWatcher(bot);
    patchTrustedNamesPanel(bot);
    console.log("[minibia-bot] ✓ v2.0 — todos os patches aplicados");
  }

  applyAll(minibiaBot);

  const _originalReload = window.minibiaBotReload;
  window.minibiaBotReload = function () {
    window.clearInterval(window._alarmStopWatcherId);
    window.clearInterval(window._autoSpellPlayerWatcherId);
    window.clearInterval(window._trustedNamesTimerId);
    _originalReload();
    setTimeout(() => applyAll(minibiaBot), 600);
  };

  console.log("[minibia-bot] ✓ v2.0 patch completo instalado — persiste em minibiaBotReload()");

})();