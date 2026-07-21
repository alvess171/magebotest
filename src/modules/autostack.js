window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installautostackModule = function installautostackModule(bot) {

  const configStorageKey = "minibiaBot.autostack.config";

  const config = Object.assign(
    {
      tickMs   : 2000,
      maxStack : 100,
      targetBagIndex: 1, // 0 = primeira bag, 1 = segunda, etc.
      enabled  : false,
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    running  : false,
    timerId  : null,
    merged   : 0,
  };

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getTargetContainer() {
    const containers = getOpenContainers();
    const index = Math.max(0, Math.trunc(Number(config.targetBagIndex) || 0));
    return containers[index] || null;
  }

  function getItemDef(item) {
    if (!item) return null;
    return (
      window.gameClient?.itemDefinitionsByCid?.[item.cid ?? item.id] ||
      window.gameClient?.itemDefinitionsBySid?.[item.sid]            ||
      window.gameClient?.itemDefinitions?.[item.id]                  ||
      null
    );
  }

  function getItemName(item) {
    return String(getItemDef(item)?.properties?.name || item?.name || "").toLowerCase();
  }

  function isRune(item) {
    if (!item) return false;
    const def = getItemDef(item);
    if (def?.properties?.isRune || def?.properties?.rune) return true;
    return /\brune\b/i.test(getItemName(item));
  }

  function getRuneSlots() {
    const result = [];
    getOpenContainers().forEach((container, containerIndex) => {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const item = container.getSlotItem?.(slotIndex) || slots[slotIndex]?.item;
        if (!item?.id || !isRune(item)) continue;
        result.push({ container, containerIndex, slotIndex, item });
      }
    });
    return result;
  }

  function moveItem(from, to, count) {
    try {
      window.gameClient.mouse.sendItemMove(
        { which: from.container, index: from.slotIndex },
        { which: to.container,   index: to.slotIndex   },
        count
      );
      return true;
    } catch (e) {
      bot.log("autostack sendItemMove error", e?.message || e);
      return false;
    }
  }

  function findEmptySlotInContainer(container) {
    const slots = container?.slots || [];
    for (let i = 0; i < slots.length; i++) {
      const item = container.getSlotItem?.(i) || slots[i]?.item;
      if (!item?.id) return i;
    }
    return -1;
  }

  function runStack() {
    const first = getTargetContainer();
    if (!first) return 0;

    const runeSlots = getRuneSlots();
    if (!runeSlots.length) return 0;

    // Agrupa por id (cid/sid/id)
    const byId = new Map();
    for (const entry of runeSlots) {
      const id = entry.item.cid ?? entry.item.sid ?? entry.item.id;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(entry);
    }

    let merges = 0;

    for (const [id, group] of byId) {
      if (group.length < 2) continue;

      // Doadores: slots fora da primeira bag
      const donors = group.filter(e => e.container !== first);
      if (!donors.length) continue;

      for (const donor of donors) {
        if (!donor.item.count || donor.item.count <= 0) continue;

        // Tenta empilhar em slot existente na primeira bag (mesmo id)
        const firstBagSlots = group
          .filter(e => e.container === first)
          .sort((a, b) => b.item.count - a.item.count);

        for (const recv of firstBagSlots) {
          const space = config.maxStack - (recv.item.count || 0);
          if (space <= 0) continue;
          const toMove = Math.min(donor.item.count, space);
          if (moveItem(donor, recv, toMove)) {
            donor.item.count -= toMove;
            recv.item.count  += toMove;
            merges++;
            bot.log("autostack rune merged", {
              id,
              name   : getItemName(donor.item),
              count  : toMove,
              fromSlot: donor.slotIndex,
              toSlot  : recv.slotIndex,
            });
          }
          if (donor.item.count <= 0) break;
        }

        // Se ainda sobrou, move para slot vazio na primeira bag
        if (donor.item.count > 0) {
          const emptySlot = findEmptySlotInContainer(first);
          if (emptySlot >= 0) {
            const fakeRecv = { container: first, slotIndex: emptySlot, item: { count: 0 } };
            const toMove = Math.min(donor.item.count, config.maxStack);
            if (moveItem(donor, fakeRecv, toMove)) {
              donor.item.count -= toMove;
              merges++;
              bot.log("autostack rune → slot vazio", { id, toMove, emptySlot });
            }
          }
        }
      }
    }

    return merges;
  }

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

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) { bot.log("autostack already running"); return false; }
    state.running = true;
    state.merged  = 0;
    bot.log("autostack started (runas apenas → primeira bag)", { ...config });
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
    if ("targetBagIndex" in next) next.targetBagIndex = Math.max(0, Math.trunc(Number(next.targetBagIndex) || 0));
    Object.assign(config, next);
    persistConfig();
    bot.log("autostack config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.autostack = { start, stop, runOnce, status, updateConfig, config };
};
