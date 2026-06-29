window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installastemodule = function installastemodule(bot) {

  const configstoragekey = "minibiaBot.haste.config";
  const haste_condition_id = 17;

  const config = Object.assign(
    {
      tickms    : 500,
      spellwords: "utani hur",
      enabled   : false,
    },
    bot.storage.get(configstoragekey, {})
  );

  const state = {
    running   : false,
    timerid   : null,
    lastcastat: 0,
  };

  let resumelistenersattached = false;

  function persistconfig() { bot.storage.set(configstoragekey, { ...config }); }

  function ishasteactive() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;
    if (conditions?.__conditions?.has?.(haste_condition_id)) return true;
    if (conditions?.has?.(haste_condition_id)) return true;
    if (player?.hasCondition?.(haste_condition_id)) return true;
    return false;
  }

  function hasvisibletarget() {
    if (window.gameClient?.player?.__target) return true;
    const monsters = bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
    return monsters.length > 0;
  }

  function getgatestatus() {
    const hasteactive    = ishasteactive();
    const targetonscreen = hasvisibletarget();
    return {
      hasteactive,
      targetonscreen,
      cancast: !hasteactive && !targetonscreen,
    };
  }

  function trycasthaste() {
    if (!config.enabled) return false;
    const gate = getgatestatus();
    if (!gate.cancast) return false;
    // Anti-spam mínimo de 1s para não mandar dois packets no mesmo tick
    const now = Date.now();
    if (now - state.lastcastat < 1000) return false;
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
      running   : state.running,
      config    : { ...config },
      gates     : getgatestatus(),
      lastcastat: state.lastcastat,
    };
  }

  function updateconfig(next = {}) {
    if ("spellwords" in next) next.spellwords = String(next.spellwords || "").trim() || config.spellwords;
    if ("tickms"     in next) next.tickms     = Math.max(250, Number(next.tickms) || 500);
    Object.assign(config, next);
    persistconfig();
    bot.log("haste config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.haste = { start, stop, status, updateconfig, ishasteactive, hasvisibletarget, trycasthaste, config };
};
