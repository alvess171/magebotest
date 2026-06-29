// ============================================================
//  src/modules/heal.js
//
//  HP — dois níveis de cura com prioridade:
//    Nível 1 (fraco):  HP% < threshold1 → hotkey 1
//    Nível 2 (forte):  HP% < threshold2 → hotkey 2 (prioridade maior)
//    O nível 2 é verificado primeiro — se HP estiver muito baixo
//    usa a cura forte, senão usa a fraca.
//
//  Mana — um único nível:
//    Mana < minMana → hotkey mana
// ============================================================

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installHealModule = function installHealModule(bot) {

  const CONFIG_KEY = "minibiaBot.heal.config";

  const config = Object.assign(
    {
      tickMs           : 1,
      healCooldownMs   : 100,
      healRetryMs      : 100,
      healConfirmMs    : 100,
      enabled          : false,

      // HP nível 1 — cura fraca (prioridade baixa)
      hpThreshold1     : 90,   // % do HP máximo
      hpHotbarSlot1    : 1,

      // HP nível 2 — cura forte (prioridade alta)
      hpThreshold2     : 60,   // % do HP máximo
      hpHotbarSlot2    : 2,

      // Mana
      manaThreshold    : 50,   // % da mana máxima
      manaHotbarSlot   : 3,
    },
    bot.storage.get(CONFIG_KEY, {})
  );

  const state = {
    running             : false,
    timerId             : null,
    lastHpHeal1At       : 0,
    lastHpHeal2At       : 0,
    lastManaHealAt      : 0,
    lastHpAttempt1At    : 0,
    lastHpAttempt2At    : 0,
    lastManaAttemptAt   : 0,
    pendingHpAttempt1   : null,
    pendingHpAttempt2   : null,
    pendingManaAttempt  : null,
  };

  function persistConfig() { bot.storage.set(CONFIG_KEY, { ...config }); }

  function readStats() {
    const snap = bot.getPlayerSnapshot?.();
    return snap
      ? {
          hp   : { current: Number(snap.health ?? 0), max: Number(snap.maxHealth ?? 0) },
          mana : { current: Number(snap.mana   ?? 0), max: Number(snap.maxMana   ?? 0) },
        }
      : { hp: null, mana: null };
  }

  function normalizeSlot(slot) {
    const n = Math.trunc(Number(slot));
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
  }

  function getHpPct(stats) {
    if (!stats?.hp || stats.hp.max <= 0) return null;
    return (stats.hp.current / stats.hp.max) * 100;
  }

  function getManaPct(stats) {
    if (!stats?.mana || stats.mana.max <= 0) return null;
    return (stats.mana.current / stats.mana.max) * 100;
  }

  // ── Confirmação ─────────────────────────────────────────────

  function didHpHeal(stats, attempt) {
    if (!stats?.hp || !attempt) return false;
    return stats.hp.current > attempt.hpBefore;
  }

  function didManaHeal(stats, attempt) {
    if (!stats?.mana || !attempt) return false;
    return stats.mana.current > attempt.manaBefore;
  }

  function resolvePending(stats, now) {
    const cw = Math.max(50, Number(config.healConfirmMs) || 0);

    if (state.pendingHpAttempt2) {
      if (didHpHeal(stats, state.pendingHpAttempt2)) { state.lastHpHeal2At = state.pendingHpAttempt2.attemptedAt; bot.log("confirmed hp heal 2"); state.pendingHpAttempt2 = null; }
      else if (now - state.pendingHpAttempt2.attemptedAt >= cw) { bot.log("hp heal 2 did not register"); state.pendingHpAttempt2 = null; }
    }

    if (state.pendingHpAttempt1) {
      if (didHpHeal(stats, state.pendingHpAttempt1)) { state.lastHpHeal1At = state.pendingHpAttempt1.attemptedAt; bot.log("confirmed hp heal 1"); state.pendingHpAttempt1 = null; }
      else if (now - state.pendingHpAttempt1.attemptedAt >= cw) { bot.log("hp heal 1 did not register"); state.pendingHpAttempt1 = null; }
    }

    if (state.pendingManaAttempt) {
      if (didManaHeal(stats, state.pendingManaAttempt)) { state.lastManaHealAt = state.pendingManaAttempt.attemptedAt; bot.log("confirmed mana heal"); state.pendingManaAttempt = null; }
      else if (now - state.pendingManaAttempt.attemptedAt >= cw) { bot.log("mana heal did not register"); state.pendingManaAttempt = null; }
    }
  }

  // ── Disparo ──────────────────────────────────────────────────

  function triggerHeal(slot, now, stats, pendingKey, lastHealKey, lastAttemptKey, label) {
    const s = normalizeSlot(slot);
    if (!s) return false;
    if (state[pendingKey]) return false;
    if (now - state[lastHealKey]    < config.healCooldownMs) return false;
    if (now - state[lastAttemptKey] < Math.max(50, Number(config.healRetryMs) || 0)) return false;

    const clicked = bot.clickHotbar(s - 1);
    if (clicked) {
      state[lastAttemptKey] = now;
      state[pendingKey] = {
        attemptedAt : now,
        slot        : s,
        hpBefore    : Number(stats.hp?.current   ?? 0),
        manaBefore  : Number(stats.mana?.current ?? 0),
      };
      bot.log("pressed " + label, { slot: s });
    }
    return clicked;
  }

  function tryHeal() {
    if (!config.enabled) return false;
    const now   = Date.now();
    const stats = readStats();
    resolvePending(stats, now);

    // Não dispara se há cura pendente
    if (state.pendingHpAttempt1 || state.pendingHpAttempt2 || state.pendingManaAttempt) return false;

    const hpPct   = getHpPct(stats);
    const manaPct = getManaPct(stats);

    // ── HP nível 2 (forte) — prioridade alta ─────────────────
    if (hpPct != null && hpPct < Number(config.hpThreshold2)) {
      if (triggerHeal(config.hpHotbarSlot2, now, stats, "pendingHpAttempt2", "lastHpHeal2At", "lastHpAttempt2At", "hp heal 2 (forte)")) return true;
    }

    // ── HP nível 1 (fraco) — prioridade normal ───────────────
    if (hpPct != null && hpPct < Number(config.hpThreshold1)) {
      if (triggerHeal(config.hpHotbarSlot1, now, stats, "pendingHpAttempt1", "lastHpHeal1At", "lastHpAttempt1At", "hp heal 1 (fraco)")) return true;
    }

    // ── Mana ─────────────────────────────────────────────────
    if (manaPct != null && manaPct < Number(config.manaThreshold)) {
      if (triggerHeal(config.manaHotbarSlot, now, stats, "pendingManaAttempt", "lastManaHealAt", "lastManaAttemptAt", "mana heal")) return true;
    }

    return false;
  }

  function tick() {
    if (!state.running) return;
    try { tryHeal(); } catch (e) { bot.log("heal tick error", e?.message); }
    finally { state.timerId = window.setTimeout(tick, config.tickMs); }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) return false;
    state.running = true;
    bot.log("heal started", { ...config });
    tick();
    return true;
  }

  function stop(opts = {}) {
    state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (opts.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    bot.log("heal stopped");
    return true;
  }

  function status() {
    const stats = readStats();
    return {
      running  : state.running,
      config   : { ...config },
      stats,
      hpPct    : getHpPct(stats),
      manaPct  : getManaPct(stats),
    };
  }

  function updateConfig(next = {}) {
    if ("hpHotbarSlot1"  in next) next.hpHotbarSlot1  = normalizeSlot(next.hpHotbarSlot1)  ?? config.hpHotbarSlot1;
    if ("hpHotbarSlot2"  in next) next.hpHotbarSlot2  = normalizeSlot(next.hpHotbarSlot2)  ?? config.hpHotbarSlot2;
    if ("manaHotbarSlot" in next) next.manaHotbarSlot = normalizeSlot(next.manaHotbarSlot) ?? config.manaHotbarSlot;
    if ("hpThreshold1"   in next) next.hpThreshold1   = Math.min(100, Math.max(0, Number(next.hpThreshold1)   || 90));
    if ("hpThreshold2"   in next) next.hpThreshold2   = Math.min(100, Math.max(0, Number(next.hpThreshold2)   || 60));
    if ("manaThreshold"  in next) next.manaThreshold  = Math.min(100, Math.max(0, Number(next.manaThreshold)  || 50));
    ["healRetryMs","healConfirmMs","healCooldownMs"].forEach(k => { if (k in next) next[k] = Math.max(50, Number(next[k]) || 50); });
    Object.assign(config, next);
    persistConfig();
    bot.log("heal config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.heal = { start, stop, status, updateConfig, readStats, tryHeal, normalizeSlot, config };
};
