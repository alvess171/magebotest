window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installastemodule = function installastemodule(bot) {

  const configstoragekey = "minibiaBot.haste.config";
  const haste_condition_ids = [6, 7, 8];

  const config = Object.assign(
    {
      tickms          : 500,
      recastcooldownms: 2000,
      spellwords      : "utani hur",
      enabled         : false,
    },
    bot.storage.get(configstoragekey, {})
  );

  const state = {
    running    : false,
    timerid    : null,
    lastcastat : 0,
  };

  let resumelistenersattached = false;

  function persistconfig() { bot.storage.set(configstoragekey, { ...config }); }

  function ishasteactive() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;

    for (const id of haste_condition_ids) {
      if (conditions?.has?.(id)) return true;
      if (player?.hasCondition?.(id)) return true;
    }

    const namedkeys = ["HASTE", "SPEED", "SWIFT", "SWIFTNESS", "UTANI"];
    for (const key of namedkeys) {
      const condid = window.ConditionManager?.prototype?.[key];
      if (condid != null) {
        if (conditions?.has?.(condid)) return true;
        if (player?.hasCondition?.(condid)) return true;
      }
    }

    const basespeed = player?.baseSpeed ?? player?.state?.baseSpeed ?? null;
    const currspeed = player?.speed    ?? player?.state?.speed    ?? null;
    if (basespeed != null && currspeed != null) {
      return Number(currspeed) > Number(basespeed);
    }

    return false;
  }

  function hasvisibletarget() {
    if (window.gameClient?.player?.__target) return true;
    const monsters = bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
    return monsters.length > 0;
  }

  function getgatestatus(now = Date.now()) {
    const hasteactive    = ishasteactive();
    const targetonscreen = hasvisibletarget();
    const cooldownms     = Math.max(0, config.recastcooldownms - (now - state.lastcastat));
    const cooldownready  = cooldownms === 0;
    return {
      hasteactive,
      targetonscreen,
      cooldownready,
      cooldownremainingms: cooldownms,
      cancast: !hasteactive && !targetonscreen && cooldownready,
    };
  }

  function trycasthaste(now = Date.now()) {
    if (!config.enabled) return false;
    const gate = getgatestatus(now);
    if (!gate.cancast) return false;
    const sent = bot.sendChat(config.spellwords);
    if (sent) {
      state.lastcastat = now;
      bot.log("haste cast", { spell: config.spellwords });
    }
    return sent;
  }

  function schedulenexttick() {
    if (!state.running) return;
    state.timerid = window.setTimeout(tick, config.tickms);
  }

  function runimmediatetick() {
    if (!state.running) return;
    if (state.timerid != null) { window.clearTimeout(state.timerid); state.timerid = null; }
    tick();
  }

  function tick() {
    if (!state.running) return;
    try { trycasthaste(); }
    catch (e) { bot.log("haste tick error", e?.message || e); }
    finally { schedulenexttick(); }
  }

  function handleresume() {
    if (document.hidden) return;
    runimmediatetick();
  }

  function attachresumelisteners() {
    if (resumelistenersattached) return;
    document.addEventListener("visibilitychange", handleresume);
    window.addEventListener("focus", handleresume);
    window.addEventListener("pageshow", handleresume);
    resumelistenersattached = true;
  }

  function detachresumelisteners() {
    if (!resumelistenersattached) return;
    document.removeEventListener("visibilitychange", handleresume);
    window.removeEventListener("focus", handleresume);
    window.removeEventListener("pageshow", handleresume);
    resumelistenersattached = false;
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistconfig();
    if (state.running) { bot.log("haste already running"); return false; }
    state.running = true;
    attachresumelisteners();
    bot.log("haste started", { ...config });
    tick();
    return true;
  }

  function stop(opts = {}) {
    state.running = false;
    if (state.timerid != null) { window.clearTimeout(state.timerid); state.timerid = null; }
    detachresumelisteners();
    if (opts.persistEnabled !== false) { config.enabled = false; persistconfig(); }
    bot.log("haste stopped");
    return true;
  }

  function status() {
    return {
      running    : state.running,
      config     : { ...config },
      gates      : getgatestatus(),
      lastcastat : state.lastcastat,
    };
  }

  function updateconfig(next = {}) {
    if ("spellwords"       in next) next.spellwords       = String(next.spellwords || "").trim() || config.spellwords;
    if ("recastcooldownms" in next) next.recastcooldownms = Math.max(500, Number(next.recastcooldownms) || 2000);
    if ("tickms"           in next) next.tickms           = Math.max(250, Number(next.tickms) || 500);
    Object.assign(config, next);
    persistconfig();
    bot.log("haste config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.haste = { start, stop, status, updateconfig, ishasteactive, hasvisibletarget, trycasthaste, config };
};
