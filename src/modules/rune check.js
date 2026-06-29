window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installRuneCheckModule = function installRuneCheckModule(bot) {
  const configStorageKey = "minibiaBot.runeCheck.config";

  const state = {
    running: false,
    timerId: null,
    lastSeenAt: 0,
    lastSeenMessage: null,
    triggered: false,
    seenKeys: [],
  };

  const config = Object.assign(
    {
      tickMs: 1000,
      enabled: false,
      alarmEnabled: true,
      logoutEnabled: true,
      // Fragmentos de texto que identificam o rune check (case-insensitive)
      triggerPhrases: [
        "anti-bot rune check",
        "antibot rune check",
        "rune check in",
        "rune check",
      ],
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 1000;

  // ── helpers ───────────────────────────────────────────────────────────────

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function getRawChatEntries() {
    return (window.gameClient?.interface?.channelManager?.channels || []).flatMap((channel) =>
      (channel?.__contents || []).map((entry, index) => ({
        channelName: channel?.name || null,
        entry,
        index,
      }))
    );
  }

  function toChatMessage(rawEntry) {
    const entry = rawEntry?.entry || {};
    const rawMessage = String(entry?.message || entry?.text || "").trim();
    const sender = String(entry?.author || entry?.sender || entry?.name || "").trim() || null;
    const body = String(entry?.text || rawMessage).trim();
    const time = entry?.__time || entry?.time || null;
    const key = [
      rawEntry?.channelName || "",
      time || "",
      sender || "",
      rawMessage || "",
      rawEntry?.index || 0,
    ].join("|");

    return { key, channelName: rawEntry?.channelName || null, sender, body, rawMessage, time };
  }

  function getChatMessages() {
    return getRawChatEntries().map(toChatMessage).filter((m) => m.body);
  }

  function hasSeenKey(key) {
    return state.seenKeys.includes(key);
  }

  function rememberKey(key) {
    if (!key || hasSeenKey(key)) return;
    state.seenKeys.push(key);
    if (state.seenKeys.length > 500) {
      state.seenKeys = state.seenKeys.slice(-500);
    }
  }

  function isRuneCheckMessage(message) {
    const text = normalizeText(message?.body || message?.rawMessage || "");
    if (!text) return false;
    return config.triggerPhrases.some((phrase) => text.includes(normalizeText(phrase)));
  }

  // ── ações ao detectar ─────────────────────────────────────────────────────

  function doAlarm() {
    if (!config.alarmEnabled) return;
    try {
      bot.playAlarm?.();
      bot.log("rune check watcher: alarm triggered");
    } catch (err) {
      bot.log("rune check watcher: alarm failed", err?.message || err);
    }
  }

  function doLogout() {
    if (!config.logoutEnabled) return;
    try {
      // Para todos os módulos primeiro
      bot.rune?.stop?.({ persistEnabled: false });
      bot.heal?.stop?.({ persistEnabled: false });
      bot.invisible?.stop?.({ persistEnabled: false });
      bot.magicShield?.stop?.({ persistEnabled: false });
      bot.attack?.stop?.({ persistEnabled: false });
      bot.cave?.stop?.({ persistEnabled: false });
      bot.eat?.stop?.({ persistEnabled: false });
      bot.follow?.stop?.({ persistEnabled: false });

      // Tenta logout via métodos conhecidos do gameClient
      const gc = window.gameClient;

      if (typeof gc?.disconnect === "function") {
        gc.disconnect();
        bot.log("rune check watcher: logout via disconnect()");
        return;
      }

      if (typeof gc?.networkManager?.disconnect === "function") {
        gc.networkManager.disconnect();
        bot.log("rune check watcher: logout via networkManager.disconnect()");
        return;
      }

      if (typeof gc?.networkManager?.close === "function") {
        gc.networkManager.close();
        bot.log("rune check watcher: logout via networkManager.close()");
        return;
      }

      // Fallback: fecha o WebSocket diretamente
      const ws = gc?.networkManager?.__websocket || gc?.networkManager?.websocket || gc?.networkManager?._socket;
      if (ws && typeof ws.close === "function") {
        ws.close();
        bot.log("rune check watcher: logout via WebSocket.close()");
        return;
      }

      bot.log("rune check watcher: could not find logout method — check gameClient structure");
    } catch (err) {
      bot.log("rune check watcher: logout failed", err?.message || err);
    }
  }

  function triggerRuneCheck(message) {
    state.triggered = true;
    state.lastSeenAt = Date.now();
    state.lastSeenMessage = message?.body || message?.rawMessage || null;

    bot.log("rune check watcher: DETECTED", {
      channel: message?.channelName,
      message: message?.body,
    });

    doAlarm();

    // Pequeno delay antes do logout para o alarme ter tempo de tocar
    if (config.logoutEnabled) {
      window.setTimeout(() => {
        doLogout();
      }, 800);
    }
  }

  // ── tick ──────────────────────────────────────────────────────────────────

  function tick() {
    if (!state.running) return;

    try {
      if (!config.enabled) return;

      const messages = getChatMessages();
      const newMessages = messages.filter((m) => !hasSeenKey(m.key));

      // Marca todas como vistas antes de processar
      newMessages.forEach((m) => rememberKey(m.key));

      // Verifica se alguma nova mensagem é o rune check
      for (const message of newMessages) {
        if (isRuneCheckMessage(message)) {
          triggerRuneCheck(message);
          break;
        }
      }
    } catch (err) {
      bot.log("rune check watcher tick failed", err?.message || err);
    } finally {
      scheduleNextTick();
    }
  }

  function scheduleNextTick() {
    if (!state.running) return;
    state.timerId = window.setTimeout(() => tick(), config.tickMs);
  }

  // ── API pública ───────────────────────────────────────────────────────────

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 1000;
    persistConfig();

    if (state.running) {
      bot.log("rune check watcher already running");
      return false;
    }

    state.running = true;
    state.triggered = false;

    // Marca todas as mensagens existentes como já vistas para não disparar com histórico antigo
    getChatMessages().forEach((m) => rememberKey(m.key));

    bot.log("rune check watcher started", {
      alarmEnabled: config.alarmEnabled,
      logoutEnabled: config.logoutEnabled,
      triggerPhrases: config.triggerPhrases,
    });

    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("rune check watcher stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      triggered: state.triggered,
      lastSeenAt: state.lastSeenAt,
      lastSeenMessage: state.lastSeenMessage,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "triggerPhrases")) {
      if (!Array.isArray(nextConfig.triggerPhrases)) {
        delete nextConfig.triggerPhrases;
      } else {
        nextConfig.triggerPhrases = nextConfig.triggerPhrases
          .map((p) => String(p || "").trim())
          .filter(Boolean);
      }
    }

    Object.assign(config, nextConfig);
    config.tickMs = 1000;
    persistConfig();
    bot.log("rune check watcher config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.runeCheck = {
    start,
    stop,
    status,
    updateConfig,
    config,
  };
};
