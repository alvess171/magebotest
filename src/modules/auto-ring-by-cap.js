window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoRingByCapModule = function installAutoRingByCapModule(bot) {

  const configStorageKey = "minibiaBot.autoRingByCap.config";
  const originStorageKey = "minibiaBot.autoRingByCap.origin";
  const RING_SLOT = 8;

  const config = Object.assign(
    {
      tickMs         : 1000,
      equipCooldownMs: 1500,
      capMin         : 200,
      capPut         : 300,
      enabled        : false,
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    running     : false,
    timerId     : null,
    lastActionAt: 0,
    ringOrigin  : bot.storage.get(originStorageKey, null),
  };

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function persistOrigin()  { bot.storage.set(originStorageKey, state.ringOrigin); }

  function getEquipment()      { return window.gameClient?.player?.equipment || null; }
  function getOpenContainers() { return Array.from(window.gameClient?.player?.__openedContainers || []); }

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

  function isRingItem(item) {
    if (!item) return false;
    const def  = getItemDef(item);
    const slot = String(def?.properties?.slotType || def?.properties?.slot || "").toLowerCase();
    if (slot === "ring") return true;
    return /\bring\b/i.test(getItemName(item));
  }

  function getEquippedRing() {
    return getEquipment()?.getSlotItem?.(RING_SLOT) || null;
  }

  function getCurrentCap() {
    return bot.getPlayerSnapshot?.()?.capacity ?? null;
  }

  function findContainerById(id) {
    if (id == null) return null;
    return getOpenContainers().find(c => (c.__containerId ?? c.id) === id) || null;
  }

  function findRingInContainers() {
    for (const c of getOpenContainers()) {
      const slots = c?.slots || [];
      for (let i = 0; i < slots.length; i++) {
        const item = c.getSlotItem?.(i) || slots[i]?.item;
        if (item?.id && isRingItem(item)) {
          return { container: c, slotIndex: i, item, containerId: c.__containerId ?? c.id };
        }
      }
    }
    return null;
  }

  function findEmptySlot(preferContainerId = null) {
    const containers = getOpenContainers();
    const ordered = preferContainerId != null
      ? [
          ...containers.filter(c => (c.__containerId ?? c.id) === preferContainerId),
          ...containers.filter(c => (c.__containerId ?? c.id) !== preferContainerId),
        ]
      : containers;

    for (const c of ordered) {
      const slots = c?.slots || [];
      for (let i = 0; i < slots.length; i++) {
        const item = c.getSlotItem?.(i) || slots[i]?.item;
        if (!item?.id) return { container: c, slotIndex: i, containerId: c.__containerId ?? c.id };
      }
    }
    return null;
  }

  function sendMove(from, to) {
    try {
      if (window.ItemMovePacket && typeof window.gameClient?.send === "function") {
        window.gameClient.send(new ItemMovePacket(from, to, 1));
        return true;
      }
      if (typeof window.gameClient?.mouse?.sendItemMove === "function") {
        window.gameClient.mouse.sendItemMove(from, to, 1);
        return true;
      }
      return false;
    } catch (e) {
      bot.log("autoRingByCap sendMove error", e?.message || e);
      return false;
    }
  }

  function removeRing(now) {
    const eq   = getEquipment();
    const ring = getEquippedRing();
    if (!eq || !ring) return false;

    let destContainer = null;
    let destSlot      = null;

    // Tenta devolver ao slot original
    if (state.ringOrigin) {
      const c = findContainerById(state.ringOrigin.containerId);
      if (c) {
        const item = c.getSlotItem?.(state.ringOrigin.slotIndex) || c.slots?.[state.ringOrigin.slotIndex]?.item;
        if (!item?.id) {
          destContainer = c;
          destSlot      = state.ringOrigin.slotIndex;
        }
      }
    }

    // Fallback: primeiro slot vazio disponível (preferindo mesmo container)
    if (!destContainer) {
      const empty = findEmptySlot(state.ringOrigin?.containerId);
      if (!empty) { bot.log("autoRingByCap: sem slot vazio para devolver anel"); return false; }
      destContainer = empty.container;
      destSlot      = empty.slotIndex;
    }

    const ok = sendMove(
      { which: eq,            index: RING_SLOT },
      { which: destContainer, index: destSlot  }
    );

    if (ok) {
      state.lastActionAt = now;
      bot.log("autoRingByCap: anel removido (cap baixa)", {
        cap    : getCurrentCap(),
        capMin : config.capMin,
        ring   : getItemName(ring),
        destSlot,
      });
    }
    return ok;
  }

  function equipRing(now) {
    const eq = getEquipment();
    if (!eq || getEquippedRing()) return false;

    let src = null;

    // Tenta origem salva primeiro
    if (state.ringOrigin) {
      const c = findContainerById(state.ringOrigin.containerId);
      if (c) {
        const item = c.getSlotItem?.(state.ringOrigin.slotIndex) || c.slots?.[state.ringOrigin.slotIndex]?.item;
        if (item?.id && isRingItem(item)) {
          src = { container: c, slotIndex: state.ringOrigin.slotIndex, item, containerId: state.ringOrigin.containerId };
        }
      }
    }

    // Fallback: busca em qualquer container aberto
    if (!src) src = findRingInContainers();
    if (!src) { bot.log("autoRingByCap: nenhum anel encontrado nos containers"); return false; }

    // Salva a origem antes de mover
    state.ringOrigin = { containerId: src.containerId, slotIndex: src.slotIndex };
    persistOrigin();

    const ok = sendMove(
      { which: src.container, index: src.slotIndex },
      { which: eq,            index: RING_SLOT      }
    );

    if (ok) {
      state.lastActionAt = now;
      bot.log("autoRingByCap: anel equipado (cap ok)", {
        cap           : getCurrentCap(),
        capPut        : config.capPut,
        ring          : getItemName(src.item),
        fromSlot      : src.slotIndex,
        fromContainerId: src.containerId,
      });
    }
    return ok;
  }

  function tryManageRing() {
    if (!config.enabled) return false;
    const now = Date.now();
    if (now - state.lastActionAt < config.equipCooldownMs) return false;

    const cap = getCurrentCap();
    if (cap == null) return false;

    if (cap < config.capMin &&  getEquippedRing()) return removeRing(now);
    if (cap >= config.capPut && !getEquippedRing()) return equipRing(now);
    return false;
  }

  function tick() {
    if (!state.running) return;
    try {
      tryManageRing();
    } catch (e) {
      bot.log("autoRingByCap tick error", e?.message || e);
    } finally {
      if (state.running) state.timerId = window.setTimeout(tick, config.tickMs);
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) { bot.log("autoRingByCap already running"); return false; }
    state.running = true;
    bot.log("autoRingByCap started", { ...config });
    tick();
    return true;
  }

  function stop(opts = {}) {
    state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (opts.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    bot.log("autoRingByCap stopped");
    return true;
  }

  function status() {
    return {
      running      : state.running,
      config       : { ...config },
      currentCap   : getCurrentCap(),
      ringEquipped : !!getEquippedRing(),
      ringOrigin   : state.ringOrigin ? { ...state.ringOrigin } : null,
      lastActionAt : state.lastActionAt,
    };
  }

  function updateConfig(next = {}) {
    if ("capMin"          in next) next.capMin          = Math.max(0,   Number(next.capMin)          || 0);
    if ("capPut"          in next) next.capPut          = Math.max(0,   Number(next.capPut)          || 0);
    if ("equipCooldownMs" in next) next.equipCooldownMs = Math.max(500, Number(next.equipCooldownMs) || 1500);
    if ("tickMs"          in next) next.tickMs          = Math.max(500, Number(next.tickMs)          || 1000);
    Object.assign(config, next);
    persistConfig();
    bot.log("autoRingByCap config updated", { ...config });
    return { ...config };
  }

  function clearOrigin() {
    state.ringOrigin = null;
    bot.storage.remove(originStorageKey);
    bot.log("autoRingByCap: origem do anel limpa");
  }

  if (config.enabled) start();

  bot.autoRingByCap = { start, stop, status, updateConfig, clearOrigin, tryManageRing, config };
};
