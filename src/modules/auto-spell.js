window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoSpellModule = function installAutoSpellModule(bot) {
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
    if (sent) { state.lastCastAt = now; bot.log("auto spell cast", { spell: config.spellWords, mobs: getAdjacentMobs().length }); }
    return sent;
  }
  function tick() { if (!state.running) return; try { tryCast(); } catch (e) { bot.log("auto spell tick error", e?.message); } finally { if (state.running) state.timerId = window.setTimeout(tick, config.tickMs); } }
  function start(ov = {}) { Object.assign(config, ov, { enabled: true }); persistConfig(); if (state.running) return false; state.running = true; bot.log("auto spell started", { ...config }); tick(); return true; }
  function stop(opts = {}) { const p = opts.persistEnabled !== false; state.running = false; if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; } if (p) { config.enabled = false; persistConfig(); } bot.log("auto spell stopped"); return true; }
  function status() { return { running: state.running, config: { ...config }, adjacentMobs: getAdjacentMobs().length, combatActive: isCombatActive(), lastCastAt: state.lastCastAt }; }
  function updateConfig(next = {}) {
    if ("spellWords" in next) next.spellWords = String(next.spellWords || "").trim() || config.spellWords;
    if ("minMobCount" in next) next.minMobCount = Math.max(1, Math.trunc(Number(next.minMobCount) || 2));
    if ("cooldownMs" in next) next.cooldownMs = Math.max(500, Number(next.cooldownMs) || 2000);
    Object.assign(config, next); persistConfig(); return { ...config };
  }
  if (config.enabled) start();
  bot.autoSpell = { start, stop, status, updateConfig, getAdjacentMobs, tryCast, config };
};
