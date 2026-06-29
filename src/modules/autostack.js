window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoStackModule = function installAutoStackModule(bot) {

  const configStorageKey = "minibiaBot.autoStack.config";

  const config = Object.assign(
    {
      tickMs    : 2000,   // intervalo entre varreduras (ms)
      maxStack  : 100,    // tamanho máximo de stack (Tibia/Minibia = 100)
      enabled   : false,
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    running  : false,
    timerId  : null,
    lastRunAt: 0,
    merged   : 0,       // total de merges feitos na sessão
  };

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }

  // ── Helpers ──────────────────────────────────────────────────

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  // Retorna todos os slots de todos os containers abertos
  // cada entry: { container, containerIndex, slotIndex, item }
  function getAllSlots() {
    const result = [];
    getOpenContainers().forEach((container, containerIndex) => {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const slot = slots[slotIndex];
        const item = slot?.item;
        if (!item || !item.id) continue;
        result.push({ container, containerIndex, slotIndex, item });
      }
    });
    return result;
  }

  // Chama sendItemMove do mouse — move `count` itens de fromSlot para toSlot
  function moveItem(fromEntry, toEntry, count) {
    try {
      // sendItemMove(from, to, count)
      // from/to: { which: container, index: slotIndex }
      gameClient.mouse.sendItemMove(
        { which: fromEntry.container, index: fromEntry.slotIndex },
        { which: toEntry.container,   index: toEntry.slotIndex   },
        count
      );
      return true;
    } catch (e) {
      bot.log("autostack sendItemMove error", e?.message || e);
      return false;
    }
  }

  // ── Lógica principal de agrupamento ──────────────────────────
  //
  // Algoritmo:
  //   1. Agrupa slots pelo item.id
  //   2. Para cada grupo com mais de 1 slot:
  //      - Ordena por count DESC (o maior recebe, os menores doam)
  //      - Percorre os doadores (do menor para o maior)
  //        e envia itens para o primeiro slot que ainda tem espaço
  //   3. Retorna quantos merges foram feitos nessa varredura

  function runStack() {
    const slots = getAllSlots();
    if (!slots.length) return 0;

    // Agrupa por item id
    const byId = new Map();
    for (const entry of slots) {
      const id = entry.item.id;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(entry);
    }

    let merges = 0;

    for (const [id, group] of byId) {
      // Só itens stackáveis (count > 1 em qualquer slot, ou mais de 1 slot)
      const isStackable = group.some(e => e.item.count > 1) || group.length > 1;
      if (!isStackable || group.length < 2) continue;

      // Ordena: maior count primeiro (receptor), menor por último (doador)
      group.sort((a, b) => b.item.count - a.item.count);

      // Ponteiro do receptor (começa no slot com mais itens)
      let receiverIdx = 0;

      for (let donorIdx = group.length - 1; donorIdx > receiverIdx; donorIdx--) {
        const donor    = group[donorIdx];
        const receiver = group[receiverIdx];

        if (!donor.item.count || donor.item.count <= 0) continue;

        const space = config.maxStack - receiver.item.count;
        if (space <= 0) {
          // Receptor cheio — avança para o próximo
          receiverIdx++;
          if (receiverIdx >= donorIdx) break;
          continue;
        }

        const toMove = Math.min(donor.item.count, space);

        const ok = moveItem(donor, receiver, toMove);
        if (ok) {
          merges++;
          bot.log("autostack merged", {
            itemId   : id,
            count    : toMove,
            from     : { container: donor.containerIndex,    slot: donor.slotIndex,    before: donor.item.count    },
            to       : { container: receiver.containerIndex, slot: receiver.slotIndex, before: receiver.item.count },
          });

          // Atualiza counts localmente para calcular o próximo merge certo
          receiver.item.count += toMove;
          donor.item.count    -= toMove;

          // Se receptor ficou cheio, avança
          if (receiver.item.count >= config.maxStack) {
            receiverIdx++;
            if (receiverIdx >= donorIdx) break;
          }
        }
      }
    }

    return merges;
  }

  // ── Loop ─────────────────────────────────────────────────────

  function tick() {
    if (!state.running) return;
    try {
      if (config.enabled) {
        const merged = runStack();
        if (merged > 0) {
          state.merged += merged;
          bot.log("autostack completed", { merged, total: state.merged });
        }
      }
    } catch (e) {
      bot.log("autostack tick error", e?.message || e);
    } finally {
      state.timerId = window.setTimeout(tick, config.tickMs);
    }
  }

  // ── API pública ───────────────────────────────────────────────

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) { bot.log("autostack already running"); return false; }
    state.running = true;
    state.merged  = 0;
    bot.log("autostack started", { ...config });
    tick();
    return true;
  }

  function stop(opts = {}) {
    state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (opts.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    bot.log("autostack stopped", { totalMerged: state.merged });
    return true;
  }

  // Roda uma vez imediatamente sem ligar o loop
  function runOnce() {
    const merged = runStack();
    bot.log("autostack runOnce", { merged });
    return merged;
  }

  function status() {
    return {
      running : state.running,
      config  : { ...config },
      merged  : state.merged,
    };
  }

  function updateConfig(next = {}) {
    if ("tickMs"   in next) next.tickMs   = Math.max(500, Number(next.tickMs)   || 2000);
    if ("maxStack" in next) next.maxStack = Math.max(2,   Number(next.maxStack) || 100);
    Object.assign(config, next);
    persistConfig();
    bot.log("autostack config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.autoStack = { start, stop, runOnce, status, updateConfig, config };
};
