window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installFriendHealModule = function installFriendHealModule(bot) {
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
    const cmd = buildCmd(); if (!cmd) return false;
    const sent = bot.sendChat(cmd);
    if (sent) { state.lastAttemptAt = now; state.pendingAttempt = { attemptedAt: now, spell: cmd, hpBefore: readHpAbs(c) ?? 0, pctBefore: readHpPct(c) ?? 0 }; bot.log("friend heal cast", { target: config.targetName, hp: state.pendingAttempt.pctBefore.toFixed(1) + "%" }); }
    return sent;
  }
  function tick() { if (!state.running) return; try { tryHeal(); } catch (e) { bot.log("friend heal tick error", e?.message); } finally { if (state.running) state.timerId = window.setTimeout(tick, config.tickMs); } }
  function start(ov = {}) { Object.assign(config, ov, { enabled: true }); persistConfig(); if (state.running) return false; state.running = true; bot.log("friend heal started", { ...config }); tick(); return true; }
  function stop(opts = {}) { const p = opts.persistEnabled !== false; state.running = false; if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; } if (p) { config.enabled = false; persistConfig(); } state.pendingAttempt = null; bot.log("friend heal stopped"); return true; }
  function status() { const c = findTargetCreature(); return { running: state.running, config: { ...config }, targetFound: !!c, targetHpPercent: readHpPct(c), lastHealAt: state.lastHealAt }; }
  function updateConfig(next = {}) {
    if ("minHpPercent" in next) next.minHpPercent = Math.min(100, Math.max(0, Number(next.minHpPercent) || 70));
    if ("targetName" in next) next.targetName = String(next.targetName || "").trim();
    if ("spellWords" in next) next.spellWords = String(next.spellWords || "exura sio").trim() || "exura sio";
    if ("healCooldownMs" in next) next.healCooldownMs = Math.max(0, Number(next.healCooldownMs) || 1500);
    Object.assign(config, next); persistConfig(); return { ...config };
  }
  if (config.enabled && config.targetName) start();
  bot.friendHeal = { start, stop, status, updateConfig, tryHeal, config };
};
