window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installastemodule = function installastemodule(bot) {

  const configstoragekey = "minibiaBot.haste.config";
  // ID 17 = utani hur | ID 14 = utani gran hur
  const haste_condition_ids = [14, 17];

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
    for (const id of haste_condition_ids) {
      if (conditions?.__conditions?.has?.(id)) return true;
      if (conditions?.has?.(id)) return true;
      if (player?.hasCondition?.(id)) return true;
    }
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
    // Verifica state.running E config.enabled — dupla proteção
    if (!state.running || !config.enabled) return false;
    const gate = getgatestatus();
    if (!gate.cancast) return false;
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

  function tick() {
    // Dupla verificação no início do tick
    if (!state.running || !config.enabled) return;
    try { trycasthaste(); }
    catch (e) { bot.log("haste tick error", e?.message || e); }
    finally {
      // Só agenda próximo tick se ainda estiver rodando
      if (state.running && config.enabled) schedulenexttick();
    }
  }

  function runimmediatetick() {
    if (!state.running) return;
    if (state.timerid != null) { window.clearTimeout(state.timerid); state.timerid = null; }
    tick();
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
    // Para tudo imediatamente
    state.running = false;
    config.enabled = false;
    if (state.timerid != null) {
      window.clearTimeout(state.timerid);
      state.timerid = null;
    }
    detachresumelisteners();
    if (opts.persistEnabled !== false) { persistconfig(); }
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
