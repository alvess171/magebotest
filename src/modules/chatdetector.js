window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installChatdetectorModule = function installChatdetectorModule(bot) {
  const configStorageKey = "minibiaBot.chatDetector.config";

  const defaultConfig = {
    enabled: false,
    alarmarQualquer: true,   // toca alarme em qualquer mensagem de outra pessoa
    alarmarMencao: false,    // toca alarme quando te mencionam
    alarmarVigiados: false,  // toca alarme quando bate um termo vigiado
    volume: 0.3,
    tomHz: 880,
    qtdBips: 3,
    canaisPermitidos: ["Default", "Console"],
    ignorarSeContiver: ["hitpoints", "attack"],
    termosVigiados: [],
    pollIntervalMs: 500,
  };

  const config = Object.assign({}, defaultConfig, bot.storage.get(configStorageKey, {}));

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  const state = {
    running: false,
    timerId: null,
    playerName: null,
    ultimaContagemPorCanal: new Map(),
  };

  function tocarAlarme() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();

      for (let i = 0; i < config.qtdBips; i++) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.type = "square";
        oscillator.frequency.value = config.tomHz;
        gain.gain.value = config.volume;

        const inicio = ctx.currentTime + i * 0.3;
        oscillator.start(inicio);
        oscillator.stop(inicio + 0.2);
      }
    } catch (erro) {
      bot.log("chatDetector alarm error: " + erro?.message);
    }
  }

  function deveIgnorar(mensagem, remetente) {
    const texto = (mensagem || "").toLowerCase();
    const nome = (remetente || "").toLowerCase();
    return (config.ignorarSeContiver || []).some((padrao) => {
      const p = padrao.toLowerCase();
      return texto.includes(p) || nome === p;
    });
  }

  function processarMensagem(msgObj, nomeCanal, ehHistorico) {
    const remetente = (msgObj.name || "Sistema").trim();
    const mensagem = msgObj.message || "";

    if (deveIgnorar(mensagem, remetente)) return;

    const souEu = state.playerName ? remetente.toLowerCase() === state.playerName.toLowerCase() : false;
    const fuiMencionado = state.playerName && !souEu && mensagem.toLowerCase().includes(state.playerName.toLowerCase());
    const bateuVigiado = !souEu && (config.termosVigiados || []).some((termo) =>
      mensagem.toLowerCase().includes(termo.toLowerCase())
    );

    const deveAlarmar =
      !ehHistorico && (
        (config.alarmarQualquer && !souEu) ||
        (config.alarmarMencao && fuiMencionado) ||
        (config.alarmarVigiados && bateuVigiado)
      );

    const prefixo = "[" + nomeCanal + "]";

    if (bateuVigiado) {
      console.log(
        "%c" + prefixo + " [VIGIADO] " + remetente + ": " + mensagem,
        "color: #ff5555; font-weight: bold;"
      );
    } else if (fuiMencionado) {
      console.log(
        "%c" + prefixo + " [MENÇÃO] " + remetente + ": " + mensagem,
        "color: orange; font-weight: bold;"
      );
    } else {
      console.log(prefixo + " [" + remetente + "] " + mensagem);
    }

    if (deveAlarmar) {
      tocarAlarme();
    }
  }

  function verificarCanais(ehVerificacaoInicial) {
    const channelManager = window.gameClient?.interface?.channelManager;
    if (!channelManager || !Array.isArray(channelManager.channels)) {
      return;
    }

    channelManager.channels.forEach((channel, indice) => {
      const nomeCanal = channel.name || ("Canal " + indice);

      if (config.canaisPermitidos.length > 0 && !config.canaisPermitidos.includes(nomeCanal)) {
        return;
      }

      const contents = channel.__contents || [];
      const contagemAnterior = state.ultimaContagemPorCanal.get(indice) || 0;

      if (contents.length > contagemAnterior) {
        for (let i = contagemAnterior; i < contents.length; i++) {
          processarMensagem(contents[i], nomeCanal, ehVerificacaoInicial);
        }
      }

      state.ultimaContagemPorCanal.set(indice, contents.length);
    });
  }

  function start() {
    config.enabled = true;
    persistConfig();

    if (state.running) {
      bot.log("chat detector already running");
      return false;
    }

    if (!window.gameClient) {
      bot.log("chat detector cannot start: gameClient not ready");
      return false;
    }

    state.playerName = (window.gameClient?.player?.name || "").trim() || null;
    state.ultimaContagemPorCanal.clear();

    // Primeira passada: marca tudo que já existe como "histórico"
    // (não dispara alarme), só estabelece o ponto de partida.
    verificarCanais(true);

    state.timerId = window.setInterval(() => verificarCanais(false), config.pollIntervalMs);
    state.running = true;
    bot.log("chat detector started", { jogador: state.playerName });
    return true;
  }

  function stop(options = {}) {
    const { persistEnabled = true } = options;

    if (state.timerId != null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    state.running = false;

    if (persistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("chat detector stopped");
    return true;
  }

  function updateConfig(overrides = {}) {
    Object.assign(config, overrides);
    persistConfig();
    return { ...config };
  }

  function addIgnored(termo) {
    const t = (termo || "").trim();
    if (!t) return false;
    if ((config.ignorarSeContiver || []).some((x) => x.toLowerCase() === t.toLowerCase())) {
      return false;
    }
    config.ignorarSeContiver = [...(config.ignorarSeContiver || []), t];
    persistConfig();
    return true;
  }

  function removeIgnored(termo) {
    config.ignorarSeContiver = (config.ignorarSeContiver || []).filter((x) => x !== termo);
    persistConfig();
    return true;
  }

  function addWatched(termo) {
    const t = (termo || "").trim();
    if (!t) return false;
    if ((config.termosVigiados || []).some((x) => x.toLowerCase() === t.toLowerCase())) {
      return false;
    }
    config.termosVigiados = [...(config.termosVigiados || []), t];
    persistConfig();
    return true;
  }

  function removeWatched(termo) {
    config.termosVigiados = (config.termosVigiados || []).filter((x) => x !== termo);
    persistConfig();
    return true;
  }

  function status() {
    return {
      running: state.running,
      playerName: state.playerName,
      config: { ...config },
    };
  }

  if (config.enabled) {
    start();
  }

  bot.Chatdetector = {
    start,
    stop,
    status,
    updateConfig,
    addIgnored,
    removeIgnored,
    addWatched,
    removeWatched,
  };

  bot.addCleanup(() => stop({ persistEnabled: false }));
};
