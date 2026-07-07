window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installLasttargetModule = function installLasttargetModule(bot) {
  const configStorageKey = "minibiaBot.lastTarget.config";

  const config = Object.assign(
    {
      enabled: false,
      graceMs: 60000,       // por quanto tempo continua tentando o mesmo alvo depois de sumir
      checkIntervalMs: 300, // com que frequência verifica
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    running: false,
    timerId: null,
    lastTargetId: null,
    lastSeenAt: 0,
  };

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getCurrentTarget() {
    return window.gameClient?.player?.__target || null;
  }

  function findCreatureById(id) {
    if (id == null) return null;

    const monstros = bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
    const jogadores = bot.xray?.getVisiblePlayers?.({ sameFloorOnly: true }) || [];
    return [...monstros, ...jogadores].find((c) => c?.id === id) || null;
  }

  function setTarget(creature) {
    if (!creature || !window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }
    if (typeof TargetPacket !== "function") {
      return false;
    }

    window.gameClient.player.setTarget(creature);
    window.gameClient.send(new TargetPacket(creature.id));
    return true;
  }

  function tick() {
    if (!state.running) return;

    try {
      const now = Date.now();
      const currentTarget = getCurrentTarget();

      if (currentTarget) {
        // Já tem alvo — só atualiza a "última vez visto" e segue o jogo.
        state.lastTargetId = currentTarget.id;
        state.lastSeenAt = now;
      } else if (state.lastTargetId != null) {
        const dentroDaMargem = (now - state.lastSeenAt) < Math.max(0, Number(config.graceMs) || 0);

        if (dentroDaMargem) {
          const creature = findCreatureById(state.lastTargetId);
          if (creature) {
            if (setTarget(creature)) {
              state.lastSeenAt = now;
              bot.log("lastTarget: alvo reencontrado e re-selecionado", {
                id: creature.id,
                name: creature.name || "Mob",
              });
            }
          }
          // Se não achou ainda, só continua esperando (dentro da margem).
        } else {
          bot.log("lastTarget: margem esgotada, esquecendo o alvo anterior");
          state.lastTargetId = null;
          state.lastSeenAt = 0;
        }
      }
    } catch (erro) {
      bot.log("lastTarget tick error", erro?.message || erro);
    } finally {
      state.timerId = window.setTimeout(tick, Math.max(100, Number(config.checkIntervalMs) || 300));
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();

    if (state.running) {
      bot.log("lastTarget already running");
      return false;
    }

    state.running = true;
    state.lastTargetId = null;
    state.lastSeenAt = 0;
    bot.log("lastTarget started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (options.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }

    state.lastTargetId = null;
    state.lastSeenAt = 0;

    bot.log("lastTarget stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      lastTargetId: state.lastTargetId,
      waiting: !getCurrentTarget() && state.lastTargetId != null,
    };
  }

  function updateConfig(next = {}) {
    if ("graceMs" in next) {
      next.graceMs = Math.max(0, Math.trunc(Number(next.graceMs) || 0));
    }
    if ("checkIntervalMs" in next) {
      next.checkIntervalMs = Math.max(100, Math.trunc(Number(next.checkIntervalMs) || 300));
    }

    Object.assign(config, next);
    persistConfig();
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.lasttarget = {
    start,
    stop,
    status,
    updateConfig,
  };

  bot.addCleanup(() => stop({ persistEnabled: false }));
};
