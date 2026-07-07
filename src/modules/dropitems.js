window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installDropitemsModule = function installDropitemsModule(bot) {
  const configStorageKey = "minibiaBot.dropItems.config";

  const config = Object.assign(
    {
      enabled: false,
      tickMs: 1000,
      // Lista de itens a jogar no chão. Cada entrada pode ter sid e/ou cid
      // (o que você tiver disponível já serve pra identificar o item).
      itens: [], // ex: [{ sid: 3031, cid: null, nome: "moeda de ouro" }]
      // Se null, joga sempre na posição atual do personagem.
      // Se definido ({x,y,z}), joga sempre nesse lugar fixo.
      posicaoFixa: null,
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    running: false,
    timerId: null,
    totalJogados: 0,
  };

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDef(item) {
    if (!item) return null;
    return (
      window.gameClient?.itemDefinitionsByCid?.[item.cid ?? item.id] ||
      window.gameClient?.itemDefinitionsBySid?.[item.sid] ||
      window.gameClient?.itemDefinitions?.[item.id] ||
      null
    );
  }

  function getItemName(item) {
    return String(getItemDef(item)?.properties?.name || item?.name || "");
  }

  function itemBateComLista(item) {
    if (!item) return false;
    return (config.itens || []).some((alvo) => {
      const bateSid = alvo.sid != null && item.sid === alvo.sid;
      const bateCid = alvo.cid != null && (item.cid ?? item.id) === alvo.cid;
      return bateSid || bateCid;
    });
  }

  function getGroundTile() {
    const pos = config.posicaoFixa || bot.getPlayerPosition?.();
    if (!pos) return null;
    return window.gameClient?.world?.getTileFromWorldPosition?.(pos) || null;
  }

  function usarPosicaoAtual() {
    const pos = bot.getPlayerPosition?.();
    if (!pos) return false;
    config.posicaoFixa = { x: pos.x, y: pos.y, z: pos.z };
    persistConfig();
    bot.log("dropItems: posição fixa definida", config.posicaoFixa);
    return true;
  }

  function limparPosicaoFixa() {
    config.posicaoFixa = null;
    persistConfig();
    bot.log("dropItems: voltou a usar a posição atual do personagem");
    return true;
  }

  function jogarItemNoChao(container, slotIndex, item) {
    const tileChao = getGroundTile();
    if (!tileChao) {
      bot.log("dropItems: não achei o tile do chão");
      return false;
    }

    const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;

    try {
      window.gameClient.mouse.sendItemMove(
        { which: container, index: slotIndex },
        { which: tileChao, index: 0 },
        count
      );
      state.totalJogados += 1;
      bot.log("dropItems: item jogado no chão", {
        nome: getItemName(item),
        sid: item.sid,
        cid: item.cid ?? item.id,
        count,
      });
      return true;
    } catch (erro) {
      bot.log("dropItems: erro ao jogar item", erro?.message || erro);
      return false;
    }
  }

  function verificarEJogarItens() {
    let jogados = 0;

    getOpenContainers().forEach((container) => {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const item = container.getSlotItem?.(slotIndex) || slots[slotIndex]?.item;
        if (!item?.id) continue;
        if (!itemBateComLista(item)) continue;

        if (jogarItemNoChao(container, slotIndex, item)) {
          jogados++;
        }
      }
    });

    return jogados;
  }

  function tick() {
    if (!state.running) return;

    try {
      if (config.enabled && (config.itens || []).length > 0) {
        verificarEJogarItens();
      }
    } catch (erro) {
      bot.log("dropItems tick error", erro?.message || erro);
    } finally {
      state.timerId = window.setTimeout(tick, config.tickMs);
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();

    if (state.running) {
      bot.log("dropItems already running");
      return false;
    }

    state.running = true;
    bot.log("dropItems started", { itens: config.itens });
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
    bot.log("dropItems stopped");
    return true;
  }

  function addItem(sid, cid, nome) {
    const entrada = { sid: sid ?? null, cid: cid ?? null, nome: nome || "" };
    config.itens = [...(config.itens || []), entrada];
    persistConfig();
    return entrada;
  }

  function removeItem(index) {
    config.itens = (config.itens || []).filter((_, i) => i !== index);
    persistConfig();
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      totalJogados: state.totalJogados,
    };
  }

  function updateConfig(next = {}) {
    Object.assign(config, next);
    persistConfig();
    return { ...config };
  }

  if (config.enabled) start();

  bot.dropitems = {
    start,
    stop,
    status,
    updateConfig,
    addItem,
    removeItem,
    usarPosicaoAtual,
    limparPosicaoFixa,
    runOnce: verificarEJogarItens,
  };
};
