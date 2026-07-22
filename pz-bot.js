(function () {
  // ===== SHIM MÍNIMO (funciona com ou sem window.minibiaBot) =====
  const externalBot = window.minibiaBot;
  const STORAGE_PREFIX = "allInOne.";

  let quietMode = localStorage.getItem(STORAGE_PREFIX + "performanceMode.quiet") === "true";

  function log(...args) {
    if (quietMode) return;
    console.log("[allInOne]", ...args);
  }

  const bot = {
    log,
    storage: {
      get(key, fallback = null) {
        if (externalBot?.storage?.get) return externalBot.storage.get(key, fallback);
        try {
          const raw = localStorage.getItem(STORAGE_PREFIX + key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        if (externalBot?.storage?.set) return externalBot.storage.set(key, value);
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        return value;
      },
      remove(key) {
        if (externalBot?.storage?.remove) return externalBot.storage.remove(key);
        localStorage.removeItem(STORAGE_PREFIX + key);
      },
    },
    sendChat(text) {
      if (externalBot?.sendChat) return externalBot.sendChat(text);
      const cm = window.gameClient?.interface?.channelManager;
      if (!cm || !text) return false;
      cm.sendMessageText(text);
      log("sent chat:", text);
      return true;
    },
    clickHotbar(index) {
      if (externalBot?.clickHotbar) return externalBot.clickHotbar(index);
      const btn = window.gameClient?.interface?.hotbarManager?.slots?.[index]?.canvas?.canvas;
      if (!btn) return false;
      btn.click();
      return true;
    },
    getPlayerState() {
      if (externalBot?.getPlayerState) return externalBot.getPlayerState();
      return window.gameClient?.player?.state || null;
    },
    getPlayerSnapshot() {
      const s = bot.getPlayerState();
      if (!s) return null;
      return {
        health: Number(s.health ?? 0),
        maxHealth: Number(s.maxHealth ?? 0),
        mana: Number(s.mana ?? 0),
        maxMana: Number(s.maxMana ?? 0),
      };
    },
    getPlayerPosition() {
      if (externalBot?.getPlayerPosition) return externalBot.getPlayerPosition();
      return window.gameClient?.player?.getPosition?.() || null;
    },
    xray: {
      getVisibleMonsters(options = {}) {
        if (externalBot?.xray?.getVisibleMonsters) return externalBot.xray.getVisibleMonsters(options);
        const me = bot.getPlayerPosition();
        if (!me) return [];
        const myId = window.gameClient?.player?.id;
        return Object.values(window.gameClient?.world?.activeCreatures || {}).filter((c) => {
          if (!c || c.id === myId || c.type === 0) return false;
          const p = c.__position;
          if (!p) return false;
          if (options.sameFloorOnly && p.z !== me.z) return false;
          return Math.abs(p.x - me.x) <= 8 && Math.abs(p.y - me.y) <= 6;
        });
      },
      getVisiblePlayers(options = {}) {
        if (externalBot?.xray?.getVisiblePlayers) return externalBot.xray.getVisiblePlayers(options);
        const me = bot.getPlayerPosition();
        if (!me) return [];
        const myId = window.gameClient?.player?.id;
        return Object.values(window.gameClient?.world?.activeCreatures || {}).filter((c) => {
          if (!c || c.id === myId || c.type !== 0) return false;
          const p = c.__position;
          if (!p) return false;
          if (options.sameFloorOnly && p.z !== me.z) return false;
          return Math.abs(p.x - me.x) <= 8 && Math.abs(p.y - me.y) <= 6;
        });
      },
    },
    addCleanup(fn) {
      if (typeof fn === "function") cleanupFns.push(fn);
    },
    playAlarm() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < 3; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.value = 880;
          osc.connect(gain);
          gain.connect(ctx.destination);
          const startAt = ctx.currentTime + i * 0.3;
          gain.gain.setValueAtTime(0.2, startAt);
          osc.start(startAt);
          osc.stop(startAt + 0.15);
        }
      } catch (e) { log("playAlarm failed", e?.message || e); }
    },
  };
  const cleanupFns = [];

  // Declarados aqui em cima (não lá embaixo, perto do painel) porque módulos
  // com enabled:true salvo de sessões anteriores chamam updatePanel() assim
  // que são definidos — se essas variáveis só existissem mais abaixo no
  // arquivo, isso geraria "Cannot access before initialization".
  let panelEl, bodyEl, tabsEl, contentWrapEl;

  // ===== MÓDULO: RUNE MAKER =====
  const Rune = (() => {
    const KEY = "rune.config";
    const state = { running: false, timerId: null, lastRuneAt: 0 };
    const config = Object.assign(
      { minHpPercent: 50, minFoodSeconds: 30, runeSpellWords: "adori vita vis", runeManaMin: 600, runeManaMax: 600, runeCooldownMs: 3500, enabled: false },
      bot.storage.get(KEY, {})
    );
    let nextThreshold = null;

    function persist() { bot.storage.set(KEY, { ...config }); }

    function rollThreshold() {
      const min = Math.min(config.runeManaMin, config.runeManaMax);
      const max = Math.max(config.runeManaMin, config.runeManaMax);
      nextThreshold = min === max ? min : Math.floor(Math.random() * (max - min + 1)) + min;
      return nextThreshold;
    }

    function readStats() {
      const p = bot.getPlayerState();
      const hp = p ? { current: p.health ?? 0, max: p.maxHealth ?? 0 } : null;
      const mana = p ? { current: p.mana ?? 0, max: p.maxMana ?? 0 } : null;
      const foodText = document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() || null;
      let food = null;
      if (foodText) {
        const m = foodText.match(/^(\d{1,2}):(\d{2})$/);
        food = m ? { seconds: Number(m[1]) * 60 + Number(m[2]) } : { seconds: null };
      }
      return { hp, mana, food };
    }

    function canMake() {
      const { hp, mana, food } = readStats();
      if (!hp || !mana) return false;
      const hpPct = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
      const threshold = nextThreshold ?? rollThreshold();
      const enoughFood = food?.seconds == null || food.seconds >= config.minFoodSeconds;
      const cooldownOk = Date.now() - state.lastRuneAt >= config.runeCooldownMs;
      return hpPct >= config.minHpPercent && mana.current >= threshold && enoughFood && cooldownOk;
    }

    function tick() {
      if (!state.running) return;
      try {
        if (canMake()) {
          if (bot.sendChat(config.runeSpellWords)) {
            state.lastRuneAt = Date.now();
            rollThreshold();
          }
        }
      } catch (e) { log("rune tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 250);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist();
      rollThreshold(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, get running() { return state.running; } };
  })();

  // ===== MÓDULO: HASTE =====
  const Haste = (() => {
    const KEY = "haste.config";
    const HASTE_IDS = [14, 17];
    const state = { running: false, timerId: null, lastCastAt: 0 };
    const config = Object.assign({ spellwords: "utani hur", enabled: false }, bot.storage.get(KEY, {}));

    function persist() { bot.storage.set(KEY, { ...config }); }

    function isActive() {
      const conditions = window.gameClient?.player?.conditions;
      return HASTE_IDS.some((id) => conditions?.__conditions?.has?.(id) || conditions?.has?.(id));
    }

    function hasTarget() {
      if (window.gameClient?.player?.__target) return true;
      return bot.xray.getVisibleMonsters({ sameFloorOnly: true }).length > 0;
    }

    function tick() {
      if (!state.running) return;
      try {
        if (!isActive() && !hasTarget() && Date.now() - state.lastCastAt >= 1000) {
          if (bot.sendChat(config.spellwords)) state.lastCastAt = Date.now();
        }
      } catch (e) { log("haste tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 500);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, get running() { return state.running; } };
  })();

  // ===== MÓDULO: AUTO EAT =====
  const Eat = (() => {
    const KEY = "eat.config";
    const state = { running: false, timerId: null, lastFoodAt: 0 };
    const config = Object.assign({ eatHotbarSlot: 10, eatCooldownMs: 6000, enabled: false }, bot.storage.get(KEY, {}));

    function persist() { bot.storage.set(KEY, { ...config }); }

    function isSated() {
      const foodText = document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() || null;
      if (!foodText) return true;
      const m = foodText.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return true;
      return (Number(m[1]) * 60 + Number(m[2])) > 0;
    }

    function tick() {
      if (!state.running) return;
      try {
        if (!isSated() && Date.now() - state.lastFoodAt >= config.eatCooldownMs) {
          if (bot.clickHotbar(config.eatHotbarSlot - 1)) state.lastFoodAt = Date.now();
        }
      } catch (e) { log("eat tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 1000);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, get running() { return state.running; } };
  })();

  // ===== MÓDULO: EQUIP RING =====
  const Ring = (() => {
    const KEY = "ring.config";
    const RING_SLOT = 8;
    const state = { running: false, timerId: null, lastEquipAt: 0 };
    const config = Object.assign({ equipCooldownMs: 1500, enabled: false }, bot.storage.get(KEY, {}));

    function persist() { bot.storage.set(KEY, { ...config }); }

    function getEquipment() { return window.gameClient?.player?.equipment || null; }
    function getOpenContainers() { return Array.from(window.gameClient?.player?.__openedContainers || []); }
    function getItemDef(item) {
      if (!item) return null;
      return window.gameClient?.itemDefinitionsBySid?.[item.sid] || window.gameClient?.itemDefinitions?.[item.id] || null;
    }
    function getItemName(item) { return getItemDef(item)?.properties?.name || item?.name || ""; }
    function isRingItem(item) {
      if (!item) return false;
      const def = getItemDef(item);
      const slotType = String(def?.properties?.slotType || def?.properties?.slot || "").toLowerCase();
      return slotType === "ring" || /\bring\b/i.test(getItemName(item));
    }
    function hasEquippedRing() {
      return !!getEquipment()?.getSlotItem?.(RING_SLOT);
    }
    function findSource() {
      const eq = getEquipment();
      if (!eq) return null;
      let best = null, bestCount = -1;
      for (let i = 0; i < eq.slots.length; i++) {
        if (i === RING_SLOT) continue;
        const item = eq.getSlotItem(i);
        if (isRingItem(item)) {
          const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
          if (count > bestCount) { bestCount = count; best = { container: eq, slotIndex: i, item, count }; }
        }
      }
      getOpenContainers().forEach((c) => {
        (c?.slots || []).forEach((slot, i) => {
          const item = c.getSlotItem(i);
          if (isRingItem(item)) {
            const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
            if (count > bestCount) { bestCount = count; best = { container: c, slotIndex: i, item, count }; }
          }
        });
      });
      return best;
    }

    function tick() {
      if (!state.running) return;
      try {
        if (!hasEquippedRing() && Date.now() - state.lastEquipAt >= config.equipCooldownMs) {
          const eq = getEquipment();
          const source = findSource();
          if (eq && source) {
            window.gameClient.send(new ItemMovePacket({ which: source.container, index: source.slotIndex }, { which: eq, index: RING_SLOT }, source.count || 1));
            state.lastEquipAt = Date.now();
            log("anel equipado", getItemName(source.item));
          }
        }
      } catch (e) { log("ring tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 1000);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, hasEquippedRing, get running() { return state.running; } };
  })();

  // ===== MÓDULO: MONK WATCHER =====
  const Monk = (() => {
    const KEY = "monk.config";
    const state = { running: false, timerId: null, lastCastAt: 0, castCount: 0 };
    const config = Object.assign({ monsterName: "monk", spellWords: "utevo res monk", cooldownMs: 4000, enabled: false }, bot.storage.get(KEY, {}));

    function persist() { bot.storage.set(KEY, { ...config }); }

    function hasNearby() {
      const creatures = window.gameClient?.world?.activeCreatures;
      if (!creatures) return false;
      const target = config.monsterName.trim().toLowerCase();
      return Object.values(creatures).some((c) => typeof c?.name === "string" && c.name.toLowerCase() === target);
    }

    function tick() {
      if (!state.running) return;
      try {
        if (!hasNearby() && Date.now() - state.lastCastAt >= config.cooldownMs) {
          if (bot.sendChat(config.spellWords)) { state.lastCastAt = Date.now(); state.castCount++; }
        }
      } catch (e) { log("monk tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 1000);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, hasNearby, get running() { return state.running; }, get castCount() { return state.castCount; } };
  })();

  // ===== MÓDULO: DRAG STONES =====
  const Stones = (() => {
    const KEY = "stones.config";
    const state = { running: false, timerId: null, movedCount: 0 };
    const config = Object.assign({ handSlot: 5, stoneSid: 1294, stoneCid: 1781, enabled: false }, bot.storage.get(KEY, {}));

    function persist() { bot.storage.set(KEY, { ...config }); }

    function getEquipment() { return window.gameClient?.player?.equipment || null; }
    function getOpenContainers() { return Array.from(window.gameClient?.player?.__openedContainers || []); }
    function isStoneItem(item) { return item && (item.sid === config.stoneSid || item.cid === config.stoneCid); }
    function isHandFree() { return !getEquipment()?.getSlotItem?.(config.handSlot); }

    function findSource() {
      let best = null, bestCount = -1;
      getOpenContainers().forEach((c) => {
        (c?.slots || []).forEach((slot, i) => {
          const item = c.getSlotItem(i);
          if (!isStoneItem(item)) return;
          const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
          if (count > bestCount) { bestCount = count; best = { container: c, slotIndex: i, item, count }; }
        });
      });
      return best;
    }

    function tick() {
      if (!state.running) return;
      try {
        const eq = getEquipment();
        if (eq && isHandFree()) {
          const source = findSource();
          if (source) {
            window.gameClient.send(new ItemMovePacket({ which: source.container, index: source.slotIndex }, { which: eq, index: config.handSlot }, source.count || 1));
            state.movedCount++;
          }
        }
        if (!findSource()) { stop(); }
      } catch (e) { log("stones tick failed", e?.message); }
      updatePanel();
      if (state.running) state.timerId = window.setTimeout(tick, 1000);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, get running() { return state.running; }, get movedCount() { return state.movedCount; } };
  })();

  // ===== MÓDULO: PANIC (fugir de jogador desconhecido) =====
  const Panic = (() => {
    const KEY = "panic.config";
    const state = { running: false, rafId: null, fleeing: false, clearSince: null, returnTimerId: null };
    const config = Object.assign(
      { friends: [], runDirLabel: "North (↑)", returnDirLabel: "South (↓)", returnDelaySec: 5, returnPresses: 1, enabled: false },
      bot.storage.get(KEY, {})
    );

    const DIRECTION_OPTIONS = ["North (↑)", "South (↓)", "West (←)", "East (→)", "Northeast", "Northwest", "Southeast", "Southwest"];

    function persist() { bot.storage.set(KEY, { ...config }); }

    function getDirectionMap() {
      const D = window.CONST?.DIRECTION || {};
      return {
        "North (↑)": D.NORTH, "South (↓)": D.SOUTH, "West (←)": D.WEST, "East (→)": D.EAST,
        "Northeast": D.NORTHEAST, "Northwest": D.NORTHWEST, "Southeast": D.SOUTHEAST, "Southwest": D.SOUTHWEST,
      };
    }

    function normalizeName(name) { return String(name || "").trim().toLowerCase(); }

    function getUnknownPlayers() {
      const friends = new Set(config.friends.map(normalizeName));
      return bot.xray.getVisiblePlayers().filter((c) => {
        const name = normalizeName(c?.name);
        return !!name && !friends.has(name);
      });
    }

    function moveDirection(directionValue) {
      if (directionValue == null) return;
      try {
        window.gameClient.keyboard.handleMoveKey.call(window.gameClient.keyboard, directionValue);
      } catch (e) { log("panic move failed:", e?.message || e); }
    }

    function cancelReturnTimer() {
      if (state.returnTimerId != null) { clearTimeout(state.returnTimerId); state.returnTimerId = null; }
    }

    function scheduleReturn() {
      cancelReturnTimer();
      state.returnTimerId = setTimeout(() => {
        if (getUnknownPlayers().length) return;
        const dirMap = getDirectionMap();
        const directionValue = dirMap[config.returnDirLabel];
        let presses = Math.max(1, Number(config.returnPresses) || 1);
        let i = 0;
        const pressLoop = setInterval(() => {
          if (i >= presses || getUnknownPlayers().length) {
            clearInterval(pressLoop);
            state.fleeing = false;
            updatePanel();
            return;
          }
          moveDirection(directionValue);
          i++;
        }, 400);
      }, Math.max(0, Number(config.returnDelaySec) || 0) * 1000);
    }

    let lastStatus = "sem ameaças";

    function frame() {
      if (!state.running) { state.rafId = null; return; }
      try {
        const unknown = getUnknownPlayers();
        if (unknown.length) {
          cancelReturnTimer();
          state.fleeing = true;
          state.clearSince = null;
          const dirMap = getDirectionMap();
          moveDirection(dirMap[config.runDirLabel]);
          lastStatus = "⚠ " + unknown.map((p) => p.name).join(", ");
        } else if (state.fleeing && state.clearSince == null) {
          state.clearSince = Date.now();
          lastStatus = "aguardando pra voltar...";
          scheduleReturn();
        } else if (!state.fleeing) {
          lastStatus = "sem ameaças";
        }
      } catch (e) { log("panic frame failed:", e?.message || e); }
      updatePanel();
      state.rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist();
      frame();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.rafId != null) { cancelAnimationFrame(state.rafId); state.rafId = null; }
      cancelReturnTimer();
      state.fleeing = false; state.clearSince = null; lastStatus = "sem ameaças";
      updatePanel();
    }

    function addFriend(name) {
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      if (!config.friends.some((f) => normalizeName(f) === normalizeName(trimmed))) {
        config.friends.push(trimmed);
        persist();
      }
    }
    function removeFriend(name) {
      config.friends = config.friends.filter((f) => f !== name);
      persist();
    }

    return {
      config, start, stop, addFriend, removeFriend, DIRECTION_OPTIONS,
      get running() { return state.running; },
      get status() { return lastStatus; },
    };
  })();

  // ===== MÓDULO: HEAL (HP 2 níveis + mana, via hotbar) =====
  const Heal = (() => {
    const KEY = "heal.config";
    const state = {
      running: false, timerId: null,
      lastHpHeal1At: 0, lastHpHeal2At: 0, lastManaHealAt: 0,
      lastHpAttempt1At: 0, lastHpAttempt2At: 0, lastManaAttemptAt: 0,
      pendingHpAttempt1: null, pendingHpAttempt2: null, pendingManaAttempt: null,
    };
    const config = Object.assign(
      {
        tickMs: 100, healCooldownMs: 300, healRetryMs: 200, healConfirmMs: 300,
        hpThreshold1: 90, hpHotbarSlot1: 1,
        hpThreshold2: 60, hpHotbarSlot2: 2,
        manaThreshold: 50, manaHotbarSlot: 3,
        enabled: false,
      },
      bot.storage.get(KEY, {})
    );

    function persist() { bot.storage.set(KEY, { ...config }); }
    function normalizeSlot(slot) {
      const n = Math.trunc(Number(slot));
      return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
    }
    function readStats() {
      const snap = bot.getPlayerSnapshot();
      return snap
        ? { hp: { current: snap.health, max: snap.maxHealth }, mana: { current: snap.mana, max: snap.maxMana } }
        : { hp: null, mana: null };
    }
    function getHpPct(stats) { return stats?.hp && stats.hp.max > 0 ? (stats.hp.current / stats.hp.max) * 100 : null; }
    function getManaPct(stats) { return stats?.mana && stats.mana.max > 0 ? (stats.mana.current / stats.mana.max) * 100 : null; }
    function didHpHeal(stats, a) { return stats?.hp && a && stats.hp.current > a.hpBefore; }
    function didManaHeal(stats, a) { return stats?.mana && a && stats.mana.current > a.manaBefore; }

    function resolvePending(stats, now) {
      const cw = Math.max(50, Number(config.healConfirmMs) || 0);
      if (state.pendingHpAttempt2) {
        if (didHpHeal(stats, state.pendingHpAttempt2)) { state.lastHpHeal2At = state.pendingHpAttempt2.attemptedAt; state.pendingHpAttempt2 = null; }
        else if (now - state.pendingHpAttempt2.attemptedAt >= cw) state.pendingHpAttempt2 = null;
      }
      if (state.pendingHpAttempt1) {
        if (didHpHeal(stats, state.pendingHpAttempt1)) { state.lastHpHeal1At = state.pendingHpAttempt1.attemptedAt; state.pendingHpAttempt1 = null; }
        else if (now - state.pendingHpAttempt1.attemptedAt >= cw) state.pendingHpAttempt1 = null;
      }
      if (state.pendingManaAttempt) {
        if (didManaHeal(stats, state.pendingManaAttempt)) { state.lastManaHealAt = state.pendingManaAttempt.attemptedAt; state.pendingManaAttempt = null; }
        else if (now - state.pendingManaAttempt.attemptedAt >= cw) state.pendingManaAttempt = null;
      }
    }

    function triggerHeal(slot, now, stats, pendingKey, lastHealKey, lastAttemptKey) {
      const s = normalizeSlot(slot);
      if (!s || state[pendingKey]) return false;
      if (now - state[lastHealKey] < config.healCooldownMs) return false;
      if (now - state[lastAttemptKey] < Math.max(50, Number(config.healRetryMs) || 0)) return false;
      const clicked = bot.clickHotbar(s - 1);
      if (clicked) {
        state[lastAttemptKey] = now;
        state[pendingKey] = { attemptedAt: now, slot: s, hpBefore: Number(stats.hp?.current ?? 0), manaBefore: Number(stats.mana?.current ?? 0) };
      }
      return clicked;
    }

    function tryHeal() {
      const now = Date.now();
      const stats = readStats();
      resolvePending(stats, now);
      if (state.pendingHpAttempt1 || state.pendingHpAttempt2 || state.pendingManaAttempt) return false;
      const hpPct = getHpPct(stats), manaPct = getManaPct(stats);
      if (hpPct != null && hpPct < Number(config.hpThreshold2)) {
        if (triggerHeal(config.hpHotbarSlot2, now, stats, "pendingHpAttempt2", "lastHpHeal2At", "lastHpAttempt2At")) return true;
      }
      if (hpPct != null && hpPct < Number(config.hpThreshold1)) {
        if (triggerHeal(config.hpHotbarSlot1, now, stats, "pendingHpAttempt1", "lastHpHeal1At", "lastHpAttempt1At")) return true;
      }
      if (manaPct != null && manaPct < Number(config.manaThreshold)) {
        if (triggerHeal(config.manaHotbarSlot, now, stats, "pendingManaAttempt", "lastManaHealAt", "lastManaAttemptAt")) return true;
      }
      return false;
    }

    function tick() {
      if (!state.running) return;
      try { tryHeal(); } catch (e) { log("heal tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, config.tickMs);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, get running() { return state.running; } };
  })();

  // ===== MÓDULO: INVISIBLE =====
  const Invisible = (() => {
    const KEY = "invisible.config";
    const INVISIBLE_ID = 4;
    const state = { running: false, timerId: null, lastCastAt: 0 };
    const config = Object.assign({ spellWords: "utana vid", recastCooldownMs: 2000, enabled: false }, bot.storage.get(KEY, {}));

    function persist() { bot.storage.set(KEY, { ...config }); }
    function getConditionId() { return window.ConditionManager?.prototype?.INVISIBLE ?? INVISIBLE_ID; }
    function isActive() {
      const player = window.gameClient?.player;
      const conditions = player?.conditions;
      const id = getConditionId();
      if (conditions?.has) return conditions.has(id);
      if (player?.hasCondition) return player.hasCondition(id);
      return false;
    }

    function tick() {
      if (!state.running) return;
      try {
        if (!isActive() && Date.now() - state.lastCastAt >= config.recastCooldownMs) {
          if (bot.sendChat(config.spellWords)) state.lastCastAt = Date.now();
        }
      } catch (e) { log("invisible tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 500);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, isActive, get running() { return state.running; } };
  })();

  // ===== MÓDULO: MAGIC SHIELD =====
  const MagicShield = (() => {
    const KEY = "magicShield.config";
    const FALLBACK_MS = 180000;
    const state = { running: false, timerId: null, lastCastAt: 0, assumedActiveUntil: 0 };
    const config = Object.assign({ spellWords: "utamo vita", recastCooldownMs: 2000, enabled: false }, bot.storage.get(KEY, {}));

    function persist() { bot.storage.set(KEY, { ...config }); }
    function getConditionId() {
      const proto = window.ConditionManager?.prototype;
      const conds = window.gameClient?.player?.conditions;
      for (const key of ["MAGIC_SHIELD", "MANA_SHIELD", "MAGICSHIELD", "MANASHIELD", "UTAMO_VITA"]) {
        const v = proto?.[key] ?? conds?.[key];
        if (typeof v === "number") return v;
      }
      return null;
    }
    function isActive(now = Date.now()) {
      const player = window.gameClient?.player;
      const conditions = player?.conditions;
      const id = getConditionId();
      if (id != null) {
        if (conditions?.has) return conditions.has(id);
        if (player?.hasCondition) return player.hasCondition(id);
      }
      return now < state.assumedActiveUntil;
    }

    function tick() {
      if (!state.running) return;
      try {
        const now = Date.now();
        if (!isActive(now) && now - state.lastCastAt >= config.recastCooldownMs) {
          if (bot.sendChat(config.spellWords)) {
            state.lastCastAt = now;
            state.assumedActiveUntil = now + FALLBACK_MS;
          }
        }
      } catch (e) { log("magic shield tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 500);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, isActive, get running() { return state.running; } };
  })();

  // ===== MÓDULO: FOLLOW (seguir jogador a uma distância) =====
  const Follow = (() => {
    const KEY = "follow.config";
    const state = { running: false, timerId: null, lastMoveAt: 0, lastTargetSeenAt: 0, lastTargetPosition: null };
    const config = Object.assign(
      { targetPlayerName: "", followDistance: 2, moveCooldownMs: 400, lostTargetMs: 5000, enabled: false },
      bot.storage.get(KEY, {})
    );

    function persist() { bot.storage.set(KEY, { ...config }); }
    function normalizeName(n) { return String(n || "").trim().toLowerCase(); }
    function normalizePosition(v) {
      if (!v) return null;
      const x = Number(v.x), y = Number(v.y), z = Number(v.z);
      if (![x, y, z].every(Number.isFinite)) return null;
      return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
    }
    function getDistance(from, to) {
      if (!from || !to || from.z !== to.z) return Infinity;
      return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
    }
    function findTargetPlayer() {
      const name = normalizeName(config.targetPlayerName);
      if (!name) return null;
      return bot.xray.getVisiblePlayers({ sameFloorOnly: true }).find((p) => normalizeName(p.name) === name) || null;
    }
    function getTileFromPosition(pos) {
      if (!pos || typeof Position !== "function") return null;
      return window.gameClient?.world?.getTileFromWorldPosition?.(new Position(pos.x, pos.y, pos.z)) || null;
    }
    function getDesiredPosition(myPos, targetPos, desiredDist) {
      if (!myPos || !targetPos) return null;
      const dx = targetPos.x - myPos.x, dy = targetPos.y - myPos.y;
      const currentDist = getDistance(myPos, targetPos);
      if (currentDist === desiredDist) return null;
      const steps = currentDist - desiredDist;
      if (steps === 0) return null;
      const signX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
      const signY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
      const moveSteps = Math.min(Math.abs(steps), 3);
      const direction = steps > 0 ? 1 : -1;
      return { x: myPos.x + signX * moveSteps * direction, y: myPos.y + signY * moveSteps * direction, z: myPos.z };
    }
    function pathTo(pos) {
      if (!pos || typeof Position !== "function") return false;
      const from = bot.getPlayerPosition();
      if (!from) return false;
      const pathfinder = window.gameClient?.world?.pathfinder;
      if (!pathfinder) return false;
      const destTile = getTileFromPosition(pos);
      if (destTile?.isWalkable && !destTile.isWalkable()) return false;
      try {
        pathfinder.findPath(from, new Position(pos.x, pos.y, pos.z));
        return true;
      } catch (e) { log("follow pathfind failed", e?.message); return false; }
    }

    function tryFollow() {
      if (!config.targetPlayerName) return false;
      const now = Date.now();
      const myPos = normalizePosition(bot.getPlayerPosition());
      if (!myPos) return false;
      const target = findTargetPlayer();
      if (target) {
        const targetPos = normalizePosition(target.__position || target.position);
        if (targetPos) { state.lastTargetSeenAt = now; state.lastTargetPosition = targetPos; }
      }
      const targetPos = state.lastTargetPosition;
      if (!targetPos) return false;
      if (now - state.lastTargetSeenAt > config.lostTargetMs) return false;
      const currentDist = getDistance(myPos, targetPos);
      const desiredDist = Math.max(0, Number(config.followDistance) || 0);
      if (currentDist === desiredDist) return false;
      if (now - state.lastMoveAt < config.moveCooldownMs) return false;
      const dest = getDesiredPosition(myPos, targetPos, desiredDist);
      if (!dest) return false;
      const moved = pathTo(dest);
      if (moved) state.lastMoveAt = now;
      return moved;
    }

    function tick() {
      if (!state.running) return;
      try { tryFollow(); } catch (e) { log("follow tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 250);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist();
      state.lastTargetPosition = null; state.lastTargetSeenAt = 0; state.lastMoveAt = 0;
      tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { config, start, stop, findTargetPlayer, get running() { return state.running; } };
  })();

  // ===== MÓDULO: FRIEND HEAL (cura outro jogador por nome) =====
  const FriendHeal = (() => {
    const KEY = "friendHeal.config";
    const state = { running: false, timerId: null, lastHealAt: 0, lastAttemptAt: 0, pendingAttempt: null };
    const config = Object.assign(
      { healCooldownMs: 1500, healRetryMs: 300, healConfirmMs: 400, minHpPercent: 70, spellWords: "exura sio", targetName: "", enabled: false },
      bot.storage.get(KEY, {})
    );

    function persist() { bot.storage.set(KEY, { ...config }); }
    function normalizeName(n) { return String(n || "").trim().toLowerCase(); }
    function findTargetCreature() {
      const t = normalizeName(config.targetName);
      if (!t) return null;
      for (const c of Object.values(window.gameClient?.world?.activeCreatures || {})) {
        if (c && normalizeName(c.name) === t) return c;
      }
      return null;
    }
    function readHpPct(c) {
      if (!c) return null;
      const hp = Number(c.health ?? c.hp ?? c.currentHealth ?? c.state?.health);
      const max = Number(c.maxHealth ?? c.maxHp ?? c.maximumHealth ?? c.state?.maxHealth);
      if (Number.isFinite(hp) && Number.isFinite(max) && max > 0) return (hp / max) * 100;
      const pct = Number(c.healthPercent ?? c.hpPercent ?? c.state?.healthPercent);
      return Number.isFinite(pct) ? pct : null;
    }
    function readHpAbs(c) {
      const hp = Number(c?.health ?? c?.hp ?? c?.currentHealth ?? c?.state?.health);
      return Number.isFinite(hp) ? hp : null;
    }
    function buildCmd() {
      const n = String(config.targetName || "").trim();
      const s = String(config.spellWords || "exura sio").trim();
      return n ? `${s} "${n}"` : null;
    }
    function didSucceed(c, a) {
      if (!c || !a) return false;
      const hp = readHpAbs(c);
      if (hp != null && hp > a.hpBefore) return true;
      const pct = readHpPct(c);
      return pct != null && pct > a.pctBefore;
    }
    function resolvePending(c, now) {
      if (!state.pendingAttempt) return;
      if (didSucceed(c, state.pendingAttempt)) { state.lastHealAt = state.pendingAttempt.attemptedAt; state.pendingAttempt = null; return; }
      if (now - state.pendingAttempt.attemptedAt >= Math.max(50, Number(config.healConfirmMs) || 400)) state.pendingAttempt = null;
    }
    function canHeal(now, c) {
      if (!c || state.pendingAttempt) return false;
      if (now - state.lastHealAt < Math.max(0, Number(config.healCooldownMs) || 1500)) return false;
      if (now - state.lastAttemptAt < Math.max(50, Number(config.healRetryMs) || 300)) return false;
      const pct = readHpPct(c);
      return pct != null && pct <= Math.max(0, Number(config.minHpPercent) || 70);
    }
    function tryHeal() {
      const now = Date.now(), c = findTargetCreature();
      resolvePending(c, now);
      if (!canHeal(now, c)) return false;
      const cmd = buildCmd();
      if (!cmd) return false;
      const sent = bot.sendChat(cmd);
      if (sent) {
        state.lastAttemptAt = now;
        state.pendingAttempt = { attemptedAt: now, spell: cmd, hpBefore: readHpAbs(c) ?? 0, pctBefore: readHpPct(c) ?? 0 };
      }
      return sent;
    }

    function tick() {
      if (!state.running) return;
      try { tryHeal(); } catch (e) { log("friend heal tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 300);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      state.pendingAttempt = null;
      updatePanel();
    }

    return { config, start, stop, findTargetCreature, readHpPct, get running() { return state.running; } };
  })();

  // ===== MÓDULO: LAST TARGET (reencontrar alvo perdido) =====
  const LastTarget = (() => {
    const KEY = "lastTarget.config";
    const state = { running: false, timerId: null, lastTargetId: null, lastSeenAt: 0 };
    const config = Object.assign({ graceMs: 60000, enabled: false }, bot.storage.get(KEY, {}));

    function persist() { bot.storage.set(KEY, { ...config }); }
    function getCurrentTarget() { return window.gameClient?.player?.__target || null; }
    function findCreatureById(id) {
      if (id == null) return null;
      const monstros = bot.xray.getVisibleMonsters({ sameFloorOnly: true });
      const jogadores = bot.xray.getVisiblePlayers({ sameFloorOnly: true });
      return [...monstros, ...jogadores].find((c) => c?.id === id) || null;
    }
    function setTarget(creature) {
      if (!creature || !window.gameClient?.player || typeof window.gameClient.send !== "function") return false;
      if (typeof TargetPacket !== "function") return false;
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
          state.lastTargetId = currentTarget.id;
          state.lastSeenAt = now;
        } else if (state.lastTargetId != null) {
          const withinGrace = (now - state.lastSeenAt) < Math.max(0, Number(config.graceMs) || 0);
          if (withinGrace) {
            const creature = findCreatureById(state.lastTargetId);
            if (creature && setTarget(creature)) state.lastSeenAt = now;
          } else {
            state.lastTargetId = null; state.lastSeenAt = 0;
          }
        }
      } catch (e) { log("last target tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 300);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist();
      state.lastTargetId = null; state.lastSeenAt = 0;
      tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      state.lastTargetId = null; state.lastSeenAt = 0;
      updatePanel();
    }

    return { config, start, stop, get running() { return state.running; } };
  })();

  // ===== MÓDULO: ATTACK HOTKEY CASTER (aperta hotkey com delay enquanto o Attack está em combate) =====
  const AttackSpellCaster = (() => {
    const KEY = "attackHotkeyCaster.config";
    const state = { running: false, timerId: null, lastCastAt: 0 };
    const config = Object.assign(
      { hotbarSlot: 1, delayMs: 2000, enabled: false },
      bot.storage.get(KEY, {})
    );

    function persist() { bot.storage.set(KEY, { ...config }); }

    function isInCombat() {
      try {
        return !!bot.attack?.isCombatActive?.();
      } catch {
        return false;
      }
    }

    function normalizeSlot(slot) {
      const n = Math.trunc(Number(slot));
      return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
    }

    function tick() {
      if (!state.running) return;
      try {
        const now = Date.now();
        const slot = normalizeSlot(config.hotbarSlot);
        if (slot && isInCombat() && now - state.lastCastAt >= Math.max(200, Number(config.delayMs) || 2000)) {
          if (bot.clickHotbar(slot - 1)) {
            state.lastCastAt = now;
            log("attack hotkey pressed, slot:", slot);
          }
        }
      } catch (e) { log("attack hotkey caster tick failed", e?.message); }
      updatePanel();
      state.timerId = window.setTimeout(tick, 250);
    }

    function start() {
      if (state.running) return;
      state.running = true; config.enabled = true; persist(); tick();
    }
    function stop() {
      state.running = false; config.enabled = false; persist();
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    if (config.enabled) start();

    return { config, start, stop, isInCombat, get running() { return state.running; } };
  })();

  // ===== MÓDULO: PZ RETURNER (insiste até chegar no PZ salvo, com limite de tempo) =====
  const PzReturner = (() => {
    const state = { running: false, timerId: null, startedAt: 0 };
    const MAX_DURATION_MS = 60000; // desiste depois de 60s tentando
    const RETRY_INTERVAL_MS = 1500;

    function normalizePosition(value) {
      if (!value) return null;
      const x = Number(value.x), y = Number(value.y), z = Number(value.z);
      if (![x, y, z].every(Number.isFinite)) return null;
      return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
    }

    function getDistance(from, to) {
      if (!from || !to || from.z !== to.z) return Infinity;
      return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
    }

    function hasArrived() {
      const home = bot.pz?.getHomePz?.();
      const me = normalizePosition(bot.getPlayerPosition());
      if (!home || !me) return false;
      return getDistance(me, home) <= 1;
    }

    let lastStatus = "parado";

    function tick() {
      if (!state.running) return;

      try {
        if (hasArrived()) {
          lastStatus = "chegou no PZ";
          stop();
          return;
        }

        if (Date.now() - state.startedAt > MAX_DURATION_MS) {
          lastStatus = "desistiu (tempo esgotado)";
          stop();
          return;
        }

        bot.pz?.goToHomePz?.();
        lastStatus = "tentando chegar...";
      } catch (error) {
        log("pz returner tick failed", error?.message || error);
      }

      updatePanel();
      state.timerId = window.setTimeout(tick, RETRY_INTERVAL_MS);
    }

    function start() {
      if (state.running) return;
      if (!bot.pz?.getHomePz?.()) {
        log("PZ returner: nenhum PZ salvo ainda");
        return;
      }
      state.running = true;
      state.startedAt = Date.now();
      lastStatus = "tentando chegar...";
      tick();
    }

    function stop() {
      state.running = false;
      if (state.timerId != null) { clearTimeout(state.timerId); state.timerId = null; }
      updatePanel();
    }

    return { start, stop, get running() { return state.running; }, get status() { return lastStatus; } };
  })();

  // ===== MÓDULO: HIDE SPELL ANIMATIONS (esconde projétil/área visual de magias) =====
  const HideSpellAnimations = (() => {
    const KEY = "hideSpellAnimations.config";
    const config = Object.assign({ enabled: false }, bot.storage.get(KEY, {}));
    const state = { active: false, originalAddDistance: null, originalAddPosition: null };

    function persist() { bot.storage.set(KEY, { ...config }); }

    function start() {
      if (state.active) return;
      const renderer = window.gameClient?.renderer;
      if (!renderer || typeof renderer.addDistanceAnimation !== "function" || typeof renderer.addPositionAnimation !== "function") {
        log("hide spell animations: renderer não disponível ainda");
        return;
      }

      state.originalAddDistance = renderer.addDistanceAnimation;
      state.originalAddPosition = renderer.addPositionAnimation;

      renderer.addDistanceAnimation = function () {}; // projétil (ex: bola de fogo voando)
      renderer.addPositionAnimation = function () {}; // efeito de área (ex: explosão no tile)

      state.active = true;
      config.enabled = true;
      persist();
      log("hide spell animations ativado — projétil e área de magia não são mais desenhados");
      updatePanel();
    }

    function stop() {
      const renderer = window.gameClient?.renderer;
      if (renderer && state.originalAddDistance) renderer.addDistanceAnimation = state.originalAddDistance;
      if (renderer && state.originalAddPosition) renderer.addPositionAnimation = state.originalAddPosition;

      state.active = false;
      state.originalAddDistance = null;
      state.originalAddPosition = null;
      config.enabled = false;
      persist();
      log("hide spell animations desativado");
      updatePanel();
    }

    if (config.enabled) start();

    return { config, start, stop, get running() { return state.active; } };
  })();

  // ===== MÓDULO: PERFORMANCE MODE (silencia logs + desativa animações CSS) =====
  const PerformanceMode = (() => {
    const KEY = "performanceMode.config";
    const config = Object.assign({ enabled: false }, bot.storage.get(KEY, {}));
    const state = { active: false, styleEl: null };

    function persist() { bot.storage.set(KEY, { ...config }); }

    function injectCss() {
      if (state.styleEl) return;
      state.styleEl = document.createElement("style");
      state.styleEl.id = "allInOne-performance-mode-css";
      state.styleEl.textContent = `
        *, *::before, *::after {
          animation-duration: 0.001s !important;
          animation-delay: 0s !important;
          transition-duration: 0.001s !important;
          transition-delay: 0s !important;
          scroll-behavior: auto !important;
        }
      `;
      document.head.appendChild(state.styleEl);
    }

    function removeCss() {
      if (state.styleEl) {
        state.styleEl.remove();
        state.styleEl = null;
      }
    }

    function start() {
      if (state.active) return;
      state.active = true;
      config.enabled = true;
      quietMode = true;
      localStorage.setItem(STORAGE_PREFIX + "performanceMode.quiet", "true");
      persist();
      injectCss();
      try { window.gameClient?.renderer?.setWeather?.(false); } catch (e) { log("setWeather failed", e?.message || e); }
      console.log("[allInOne] Performance Mode ativado (logs silenciados, animações desativadas, weather desligado)");
      updatePanel();
    }

    function stop() {
      state.active = false;
      config.enabled = false;
      quietMode = false;
      localStorage.setItem(STORAGE_PREFIX + "performanceMode.quiet", "false");
      persist();
      removeCss();
      try { window.gameClient?.renderer?.setWeather?.(true); } catch (e) { log("setWeather failed", e?.message || e); }
      console.log("[allInOne] Performance Mode desativado");
      updatePanel();
    }

    if (config.enabled) start();

    return { config, start, stop, get running() { return state.active; } };
  })();

  // ===== MÓDULO: ZOOM BLOCKER (bloqueia zoom do navegador via ctrl+scroll, ctrl+/-, pinça) =====
  const ZoomBlocker = (() => {
    const KEY = "zoomBlocker.config";
    const config = Object.assign({ enabled: false }, bot.storage.get(KEY, {}));
    const state = { active: false };

    function persist() { bot.storage.set(KEY, { ...config }); }

    function onWheel(e) {
      if (e.ctrlKey) e.preventDefault();
    }
    function onKeydown(e) {
      if (e.ctrlKey && ["+", "-", "=", "0"].includes(e.key)) e.preventDefault();
    }
    function onGesture(e) {
      e.preventDefault();
    }

    function applyViewportMeta() {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "viewport";
        document.head.appendChild(meta);
      }
      meta.dataset.zoomBlockerOriginal = meta.dataset.zoomBlockerOriginal ?? meta.content ?? "";
      meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
    }

    function restoreViewportMeta() {
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta && meta.dataset.zoomBlockerOriginal !== undefined) {
        meta.content = meta.dataset.zoomBlockerOriginal;
        delete meta.dataset.zoomBlockerOriginal;
      }
    }

    function start() {
      if (state.active) return;
      state.active = true;
      config.enabled = true;
      persist();
      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("keydown", onKeydown, { passive: false });
      document.addEventListener("gesturestart", onGesture, { passive: false });
      document.addEventListener("gesturechange", onGesture, { passive: false });
      applyViewportMeta();
      log("zoom blocker ativado");
      updatePanel();
    }

    function stop() {
      if (!state.active) { config.enabled = false; persist(); return; }
      state.active = false;
      config.enabled = false;
      persist();
      window.removeEventListener("wheel", onWheel, { passive: false });
      window.removeEventListener("keydown", onKeydown, { passive: false });
      document.removeEventListener("gesturestart", onGesture, { passive: false });
      document.removeEventListener("gesturechange", onGesture, { passive: false });
      restoreViewportMeta();
      log("zoom blocker desativado");
      updatePanel();
    }

    if (config.enabled) start();

    return { config, start, stop, get running() { return state.active; } };
  })();

  // ===== MÓDULO: SWIPE NAV BLOCKER (bloqueia gesto de voltar/avançar por swipe lateral) =====
  const SwipeNavBlocker = (() => {
    const KEY = "swipeNavBlocker.config";
    const config = Object.assign({ enabled: false }, bot.storage.get(KEY, {}));
    const state = { active: false, touchStartX: 0, touchStartY: 0 };

    function persist() { bot.storage.set(KEY, { ...config }); }

    function onTouchStart(e) {
      state.touchStartX = e.touches[0].clientX;
      state.touchStartY = e.touches[0].clientY;
    }
    function onTouchMove(e) {
      const touchEndX = e.touches[0].clientX;
      const touchEndY = e.touches[0].clientY;
      const diffX = touchEndX - state.touchStartX;
      const diffY = touchEndY - state.touchStartY;
      if (Math.abs(diffX) > Math.abs(diffY)) e.preventDefault();
    }
    function onWheel(e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    }

    function applyOverscroll() {
      document.body.dataset.swipeBlockerOriginalBody = document.body.style.overscrollBehaviorX || "";
      document.documentElement.dataset.swipeBlockerOriginalHtml = document.documentElement.style.overscrollBehaviorX || "";
      document.body.style.overscrollBehaviorX = "none";
      document.documentElement.style.overscrollBehaviorX = "none";
    }
    function restoreOverscroll() {
      document.body.style.overscrollBehaviorX = document.body.dataset.swipeBlockerOriginalBody || "";
      document.documentElement.style.overscrollBehaviorX = document.documentElement.dataset.swipeBlockerOriginalHtml || "";
      delete document.body.dataset.swipeBlockerOriginalBody;
      delete document.documentElement.dataset.swipeBlockerOriginalHtml;
    }

    function start() {
      if (state.active) return;
      state.active = true;
      config.enabled = true;
      persist();
      document.addEventListener("touchstart", onTouchStart, { passive: true });
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("wheel", onWheel, { passive: false });
      applyOverscroll();
      log("swipe nav blocker ativado");
      updatePanel();
    }

    function stop() {
      if (!state.active) { config.enabled = false; persist(); return; }
      state.active = false;
      config.enabled = false;
      persist();
      document.removeEventListener("touchstart", onTouchStart, { passive: true });
      document.removeEventListener("touchmove", onTouchMove, { passive: false });
      window.removeEventListener("wheel", onWheel, { passive: false });
      restoreOverscroll();
      log("swipe nav blocker desativado");
      updatePanel();
    }

    if (config.enabled) start();

    return { config, start, stop, get running() { return state.active; } };
  })();

  // ===== MÓDULO: HAZARD STEPPER (passo manual através de fogo/campos perigosos) =====
  const HazardStepper = (() => {
    const state = { rafId: null, lastPositionKey: null, lastProgressAt: 0, running: false, stepsCount: 0 };
    const STUCK_THRESHOLD_MS = 300;

    function normalizePosition(value) {
      if (!value) return null;
      const x = Number(value.x), y = Number(value.y), z = Number(value.z);
      if (![x, y, z].every(Number.isFinite)) return null;
      return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
    }
    function getPositionKey(pos) { return pos ? `${pos.x},${pos.y},${pos.z}` : null; }
    function getMyPosition() { return normalizePosition(bot.getPlayerPosition()); }

    function getDirectionToward(from, to) {
      const D = window.CONST?.DIRECTION;
      if (!D || !from || !to) return null;
      const dx = to.x - from.x, dy = to.y - from.y;
      if (dx === 0 && dy < 0) return D.NORTH;
      if (dx === 0 && dy > 0) return D.SOUTH;
      if (dy === 0 && dx < 0) return D.WEST;
      if (dy === 0 && dx > 0) return D.EAST;
      if (dx > 0 && dy < 0) return D.NORTHEAST;
      if (dx < 0 && dy < 0) return D.NORTHWEST;
      if (dx > 0 && dy > 0) return D.SOUTHEAST;
      if (dx < 0 && dy > 0) return D.SOUTHWEST;
      return null;
    }

    const DIRECTION_OFFSETS = () => {
      const D = window.CONST?.DIRECTION;
      if (!D) return {};
      return {
        [D.NORTH]: { x: 0, y: -1 }, [D.SOUTH]: { x: 0, y: 1 },
        [D.WEST]: { x: -1, y: 0 }, [D.EAST]: { x: 1, y: 0 },
        [D.NORTHEAST]: { x: 1, y: -1 }, [D.NORTHWEST]: { x: -1, y: -1 },
        [D.SOUTHEAST]: { x: 1, y: 1 }, [D.SOUTHWEST]: { x: -1, y: 1 },
      };
    };

    // Prioriza o waypoint atual do cave bot (já disponível como bot.cave nesse painel)
    function getGuideDestination() {
      const caveWaypoint = bot?.cave?.getCurrentWaypoint?.();
      if (caveWaypoint && caveWaypoint.type !== "delay") {
        const pos = normalizePosition(caveWaypoint);
        if (pos) return pos;
      }
      return normalizePosition(window.gameClient?.world?.pathfinder?.__finalDestination);
    }

    function getTileAt(pos) {
      if (!pos || typeof Position !== "function") return null;
      try {
        return window.gameClient?.world?.getTileFromWorldPosition?.(new Position(pos.x, pos.y, pos.z)) || null;
      } catch { return null; }
    }

    function isNextTileHazardBlocked(from, direction) {
      const offsets = DIRECTION_OFFSETS();
      const offset = offsets[direction];
      if (!offset) return false;
      const nextPos = { x: from.x + offset.x, y: from.y + offset.y, z: from.z };
      const tile = getTileAt(nextPos);
      if (!tile) return false;
      try { return !!tile.isNotPathable?.(); } catch { return false; }
    }

    function tryManualStep(destination) {
      const from = getMyPosition();
      if (!from || !destination || from.z !== destination.z) return false;
      const direction = getDirectionToward(from, destination);
      if (direction == null) return false;
      if (!isNextTileHazardBlocked(from, direction)) return false;
      try {
        window.gameClient.keyboard.handleMoveKey.call(window.gameClient.keyboard, direction);
        state.stepsCount++;
        log("hazard stepper: passo manual através de campo perigoso", { from, destination, direction });
        return true;
      } catch (error) {
        log("hazard stepper: passo manual falhou", error?.message || error);
        return false;
      }
    }

    let lastStatus = "parado";

    function frame() {
      if (!state.running) { state.rafId = null; return; }
      try {
        const position = getMyPosition();
        const positionKey = getPositionKey(position);
        const now = Date.now();

        if (positionKey && positionKey !== state.lastPositionKey) {
          state.lastPositionKey = positionKey;
          state.lastProgressAt = now;
        }

        const destination = getGuideDestination();

        if (!destination) {
          lastStatus = "sem waypoint/destino ativo";
        } else if (positionKey === getPositionKey(destination)) {
          lastStatus = "no waypoint";
        } else {
          const stuckForMs = state.lastProgressAt ? now - state.lastProgressAt : 0;
          if (stuckForMs >= STUCK_THRESHOLD_MS) {
            const direction = getDirectionToward(position, destination);
            const isHazard = direction != null && isNextTileHazardBlocked(position, direction);
            if (isHazard) {
              const stepped = tryManualStep(destination);
              state.lastProgressAt = now;
              lastStatus = stepped ? "passo através de campo perigoso" : "campo perigoso, passo falhou";
            } else {
              lastStatus = "preso (sem campo perigoso, ignorando)";
            }
          } else {
            lastStatus = "indo normal";
          }
        }
      } catch (error) {
        log("hazard stepper frame failed", error?.message || error);
      }
      updatePanel();
      state.rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (state.running) return;
      state.running = true;
      state.lastPositionKey = getPositionKey(getMyPosition());
      state.lastProgressAt = Date.now();
      frame();
    }
    function stop() {
      state.running = false;
      if (state.rafId != null) { cancelAnimationFrame(state.rafId); state.rafId = null; }
      lastStatus = "parado";
      updatePanel();
    }

    return { start, stop, get running() { return state.running; }, get stepsCount() { return state.stepsCount; }, get status() { return lastStatus; } };
  })();

  // ===== MÓDULO: PROFILES (salva/restaura config dos módulos deste painel) =====
  const Profiles = (() => {
    const ALL_MODULES = { Rune, Haste, Eat, Ring, Monk, Stones, Panic, Heal, Invisible, MagicShield, Follow, FriendHeal, LastTarget };
    const LIST_KEY = "profiles.list";
    const ACTIVE_KEY = "profiles.active";

    function loadProfiles() { return bot.storage.get(LIST_KEY, {}) || {}; }
    function saveProfiles(p) { bot.storage.set(LIST_KEY, p); }
    function getActiveName() { return bot.storage.get(ACTIVE_KEY, null); }
    function setActiveName(name) { bot.storage.set(ACTIVE_KEY, name || null); }

    function captureSnapshot() {
      const snap = {};
      for (const [name, mod] of Object.entries(ALL_MODULES)) snap[name] = { ...mod.config };
      return snap;
    }

    function applySnapshot(snapshot) {
      if (!snapshot) return false;
      for (const [name, mod] of Object.entries(ALL_MODULES)) {
        if (snapshot[name]) Object.assign(mod.config, snapshot[name]);
      }
      return true;
    }

    function list() { return Object.keys(loadProfiles()).sort(); }

    function save(name) {
      const trimmed = String(name || "").trim();
      if (!trimmed) return false;
      const profiles = loadProfiles();
      profiles[trimmed] = { savedAt: Date.now(), configs: captureSnapshot() };
      saveProfiles(profiles);
      setActiveName(trimmed);
      log("perfil salvo:", trimmed);
      return true;
    }

    function load(name) {
      const trimmed = String(name || "").trim();
      const profiles = loadProfiles();
      const profile = profiles[trimmed];
      if (!profile) { log("perfil não encontrado:", trimmed); return false; }
      applySnapshot(profile.configs);
      setActiveName(trimmed);
      log("perfil carregado:", trimmed, "— ajuste manualmente cada campo no painel ou recarregue a página");
      return true;
    }

    function remove(name) {
      const trimmed = String(name || "").trim();
      const profiles = loadProfiles();
      if (!profiles[trimmed]) return false;
      delete profiles[trimmed];
      saveProfiles(profiles);
      if (getActiveName() === trimmed) setActiveName(null);
      return true;
    }

    return { list, save, load, delete: remove, getActiveName };
  })();

  // ===== MÓDULOS EMBUTIDOS (código original, adaptado pra rodar aqui dentro) =====
  // Estes módulos foram escritos no formato do bundle grande
  // (window.__minibiaBotBundle.installXModule). Colamos o código-fonte
  // original sem alterações e chamamos a instalação passando nosso "bot"
  // shim -- assim toda a lógica interna (cave, panic, attack, drop)
  // continua idêntica ao que já foi testado.

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackModule = function installAutoAttackModule(bot) {
  const configStorageKey = "minibiaBot.attack.config";
  const state = {
    running: false,
    timerId: null,
    lastTargetHotkeyAt: 0,
    lastRuneHotkeyAt: 0,
    engagedTargetId: null,
    combatStartedAt: 0,
    lastChaseAt: 0,
    lastChaseDestinationKey: null,
    lastFollowTargetId: null,
    lastFollowDistance: Number.POSITIVE_INFINITY,
    lastFollowProgressAt: 0,
    lastFollowStallAt: 0,
    lastSkillTrainSwitchAt: 0,
    skippedTargetIds: new Map(),
  };

  const storedConfig = bot.storage.get(configStorageKey, {}) || {};
  const config = Object.assign(
    {
      tickMs: 100,
      targetHotbarSlot: 3,
      runeHotbarSlot: null,
      targetCooldownMs: 100,
      runeCooldownMs: 100,
      maxTargetDistance: 6,
      meleeMode: true,
      targetNames: [],
      skillTrainOnMonster: false,
      skillTrainRetargetMs: 50,
      enabled: false,
    },
    storedConfig
  );
  config.targetNames = normalizeTargetNames(config.targetNames);
  if (config.targetHotbarSlot == null && storedConfig.hotbarSlot != null) {
    config.targetHotbarSlot = storedConfig.hotbarSlot;
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeTargetNames(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const deduped = new Map();
    value.forEach((name) => {
      const normalized = String(name || "").trim();
      if (!normalized) {
        return;
      }

      deduped.set(normalized.toLowerCase(), normalized);
    });
    return Array.from(deduped.values());
  }

  function getCreatureName(creature) {
    return String(creature?.name || "").trim();
  }

  function isAllowedTarget(creature) {
    const allowedNames = normalizeTargetNames(config.targetNames);
    if (!allowedNames.length) {
      return true;
    }

    const name = getCreatureName(creature).toLowerCase();
    if (!name) {
      return false;
    }

    return allowedNames.some((allowed) => allowed.toLowerCase() === name);
  }

  function normalizeHotbarSlot(slot) {
    const value = Number(slot);
    if (!Number.isFinite(value)) {
      return null;
    }

    const normalized = Math.trunc(value);
    if (normalized < 1 || normalized > 12) {
      return null;
    }

    return normalized;
  }

  function getMaxTargetDistance() {
    return Math.max(1, Number(config.maxTargetDistance) || 6);
  }

  function isWithinTargetDistance(creature, playerPosition = normalizePosition(bot.getPlayerPosition())) {
    if (!playerPosition) {
      return true;
    }

    const creaturePosition = normalizePosition(
      creature?.getPosition?.() || creature?.__position || creature?.position
    );
    return getTileDistance(playerPosition, creaturePosition) <= getMaxTargetDistance();
  }

  function getNearbyMonsters() {
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [])
      .filter((creature) => isAllowedTarget(creature))
      .filter((creature) => isWithinTargetDistance(creature, playerPosition));
  }

  function normalizePosition(value) {
    if (!value) {
      return null;
    }

    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return {
      x: Math.trunc(x),
      y: Math.trunc(y),
      z: Math.trunc(z),
    };
  }

  function getPositionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : null;
  }

  function isAdjacentTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return false;
    }

    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));
    return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
  }

  function getTileDistance(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.max(
      Math.abs(Number(from.x) - Number(to.x)),
      Math.abs(Number(from.y) - Number(to.y))
    );
  }

  function isSameCreature(left, right) {
    if (!left || !right) {
      return false;
    }

    return left === right || left.id === right.id;
  }

  function findNearbyMonster(creature) {
    if (!creature) {
      return null;
    }

    const nearbyMonsters = getNearbyMonsters();
    return nearbyMonsters.find((monster) => isSameCreature(monster, creature)) || null;
  }

  function findNearbyMonsterById(id) {
    if (id == null) {
      return null;
    }

    return getNearbyMonsters().find((monster) => monster?.id === id) || null;
  }

  function getCurrentTarget() {
    return window.gameClient?.player?.__target || null;
  }

  function getCurrentFollowTarget() {
    return window.gameClient?.player?.__followTarget || null;
  }

  function pruneSkippedTargets(now = Date.now()) {
    for (const [id, expiresAt] of state.skippedTargetIds.entries()) {
      if (expiresAt <= now) {
        state.skippedTargetIds.delete(id);
      }
    }
  }

  function resetFollowProgress() {
    state.lastFollowTargetId = null;
    state.lastFollowDistance = Number.POSITIVE_INFINITY;
    state.lastFollowProgressAt = 0;
    state.lastFollowStallAt = 0;
  }

  function clearEngagedTarget() {
    state.engagedTargetId = null;
    state.combatStartedAt = 0;
    state.lastChaseDestinationKey = null;
    resetFollowProgress();
  }

  function clearCurrentFollowTarget() {
    if (!window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof FollowPacket !== "function") {
      return false;
    }

    if (!getCurrentFollowTarget()) {
      return false;
    }

    window.gameClient.player.setFollowTarget(null);
    window.gameClient.send(new FollowPacket(0));
    return true;
  }

  function clearCurrentTarget() {
    if (!window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof TargetPacket !== "function") {
      return false;
    }

    if (!getCurrentTarget()) {
      return false;
    }

    window.gameClient.player.setTarget(null);
    window.gameClient.send(new TargetPacket(0));
    return true;
  }

  function markCombatActive(now = Date.now()) {
    if (!state.combatStartedAt) {
      state.combatStartedAt = now;
    }
  }

  function getCombatTargetCount() {
    return getEngagedTarget() ? 1 : 0;
  }

  function isCombatActive() {
    if (!config.enabled || !state.running) {
      return false;
    }

    return !!getEngagedTarget();
  }

  function syncCombatState(now = Date.now()) {
    if (isCombatActive()) {
      markCombatActive(now);
      return true;
    }

    state.combatStartedAt = 0;
    return false;
  }

  function getEngagedTarget() {
    const currentTarget = getCurrentTarget();
    if (currentTarget) {
      if (!isAllowedTarget(currentTarget)) {
        skipTarget(currentTarget, "not in target name list", Date.now(), 60000);
        return null;
      }

      state.engagedTargetId = currentTarget.id;
      return currentTarget;
    }

    if (state.engagedTargetId == null) {
      return null;
    }

    const followTarget = getCurrentFollowTarget();
    if (followTarget && followTarget.id === state.engagedTargetId) {
      const nearbyFollowTarget = findNearbyMonster(followTarget);
      if (nearbyFollowTarget) {
        return nearbyFollowTarget;
      }

      if (!isAllowedTarget(followTarget)) {
        skipTarget(followTarget, "not in target name list", Date.now(), 60000);
        return null;
      }

      return followTarget;
    }

    const nearbyTarget = findNearbyMonsterById(state.engagedTargetId);
    if (nearbyTarget) {
      return nearbyTarget;
    }

    clearEngagedTarget();
    return null;
  }

  function setCurrentTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof TargetPacket !== "function") {
      return false;
    }

    window.gameClient.player.setTarget(target);
    window.gameClient.send(new TargetPacket(target.id));
    state.engagedTargetId = target.id;
    return true;
  }

  function setCurrentFollowTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof FollowPacket !== "function") {
      return false;
    }

    if (isSameCreature(getCurrentFollowTarget(), target)) {
      return true;
    }

    window.gameClient.player.setFollowTarget(target);
    window.gameClient.send(new FollowPacket(target.id));
    return true;
  }

  function skipTarget(target, reason, now = Date.now(), skipMs = 4000) {
    if (!target?.id) {
      return false;
    }

    const until = now + Math.max(500, Number(skipMs) || 0);
    state.skippedTargetIds.set(target.id, until);

    const clearedTarget = isSameCreature(getCurrentTarget(), target) ? clearCurrentTarget() : false;
    const clearedFollow = isSameCreature(getCurrentFollowTarget(), target) ? clearCurrentFollowTarget() : false;

    if (state.engagedTargetId === target.id) {
      clearEngagedTarget();
    } else if (state.lastFollowTargetId === target.id) {
      resetFollowProgress();
    }

    bot.log("skipping auto attack target", {
      id: target.id,
      name: target.name || "Mob",
      reason,
      skippedForMs: Math.max(500, Number(skipMs) || 0),
      clearedTarget,
      clearedFollow,
    });
    return true;
  }

  function isTargetSkipped(target, now = Date.now()) {
    pruneSkippedTargets(now);
    return !!target?.id && (state.skippedTargetIds.get(target.id) || 0) > now;
  }

  function readCreatureHealth(creature) {
    const value = [
      creature?.state?.health,
      creature?.health,
      creature?.hp,
      creature?.currentHealth,
    ].find((entry) => Number.isFinite(Number(entry)));

    return value == null ? -1 : Math.trunc(Number(value));
  }

  function isReachableSkillTrainTarget(monster, playerPosition) {
    const targetPosition = normalizePosition(monster?.getPosition?.() || monster?.__position);
    if (!playerPosition || !targetPosition || playerPosition.z !== targetPosition.z) {
      return false;
    }

    return getTileDistance(playerPosition, targetPosition) <= 1;
  }

  function getMonsterCandidates(now = Date.now()) {
    pruneSkippedTargets(now);

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    return getNearbyMonsters()
      .filter((monster) => !isTargetSkipped(monster, now))
      .filter((monster) => !config.skillTrainOnMonster || isReachableSkillTrainTarget(monster, playerPosition))
      .sort((left, right) => {
        const leftDistance = getTileDistance(playerPosition, normalizePosition(left?.getPosition?.() || left?.__position));
        const rightDistance = getTileDistance(playerPosition, normalizePosition(right?.getPosition?.() || right?.__position));
        return leftDistance - rightDistance || Number(left?.id || 0) - Number(right?.id || 0);
      });
  }

  function pickSkillTrainTarget(candidates, playerPosition) {
    if (!candidates.length) {
      return null;
    }

    return candidates
      .slice()
      .sort((left, right) => {
        const healthDiff = readCreatureHealth(right) - readCreatureHealth(left);
        if (healthDiff !== 0) {
          return healthDiff;
        }

        const leftDistance = getTileDistance(
          playerPosition,
          normalizePosition(left?.getPosition?.() || left?.__position)
        );
        const rightDistance = getTileDistance(
          playerPosition,
          normalizePosition(right?.getPosition?.() || right?.__position)
        );
        return leftDistance - rightDistance || Number(left?.id || 0) - Number(right?.id || 0);
      })[0];
  }

  function shouldSwitchSkillTrainTarget(current, best) {
    if (!best) {
      return false;
    }

    if (!current) {
      return true;
    }

    if (isSameCreature(current, best)) {
      return false;
    }

    const currentHealth = readCreatureHealth(current);
    const bestHealth = readCreatureHealth(best);
    return bestHealth > currentHealth;
  }

  function syncSkillTrainTarget(now = Date.now()) {
    if (!config.skillTrainOnMonster) {
      return false;
    }

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const candidates = getMonsterCandidates(now);
    const bestTarget = pickSkillTrainTarget(candidates, playerPosition);
    if (!bestTarget) {
      return false;
    }

    const currentTarget = getCurrentTarget() || getEngagedTarget();
    if (!shouldSwitchSkillTrainTarget(currentTarget, bestTarget)) {
      return false;
    }

    const retargetCooldownMs = Math.max(250, Number(config.skillTrainRetargetMs) || 1500);
    if (currentTarget && now - state.lastSkillTrainSwitchAt < retargetCooldownMs) {
      return false;
    }

    if (setCurrentTarget(bestTarget)) {
      state.lastSkillTrainSwitchAt = now;
      markCombatActive(now);
      bot.log("skill train switched target", {
        id: bestTarget.id,
        name: bestTarget.name || "Mob",
        health: readCreatureHealth(bestTarget),
        previousHealth: currentTarget ? readCreatureHealth(currentTarget) : null,
      });
      return true;
    }

    return false;
  }

  function shouldGiveUpTarget(target) {
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target?.getPosition?.() || target?.__position);
    if (!playerPosition || !targetPosition) {
      return false;
    }

    if (config.skillTrainOnMonster) {
      return !isReachableSkillTrainTarget(target, playerPosition);
    }

    return getTileDistance(playerPosition, targetPosition) > getMaxTargetDistance();
  }

  function resetTargetIfTooFar() {
    const currentTarget = getCurrentTarget();
    if (currentTarget && shouldGiveUpTarget(currentTarget)) {
      skipTarget(currentTarget, "target too far", Date.now(), 2500);
      bot.log("gave up distant auto attack target", {
        id: currentTarget.id,
        name: currentTarget.name || "Mob",
        position: normalizePosition(currentTarget.getPosition?.() || currentTarget.__position),
        maxTargetDistance: getMaxTargetDistance(),
      });
      return true;
    }

    const engagedTarget = getEngagedTarget();
    if (engagedTarget && shouldGiveUpTarget(engagedTarget)) {
      skipTarget(engagedTarget, "engaged target too far", Date.now(), 2500);
      bot.log("gave up distant auto attack target", {
        id: engagedTarget.id,
        name: engagedTarget.name || "Mob",
        position: normalizePosition(engagedTarget.getPosition?.() || engagedTarget.__position),
        maxTargetDistance: getMaxTargetDistance(),
      });
      return true;
    }

    return false;
  }

  function getTileFromPosition(position) {
    if (!position || typeof Position !== "function") {
      return null;
    }

    return window.gameClient?.world?.getTileFromWorldPosition?.(
      new Position(position.x, position.y, position.z)
    ) || null;
  }

  function findReachableAdjacentPosition(targetPosition, playerPosition) {
    if (!targetPosition || !playerPosition) {
      return null;
    }

    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    offsets.sort((a, b) => {
      const da = Math.abs(targetPosition.x + a.x - playerPosition.x) +
        Math.abs(targetPosition.y + a.y - playerPosition.y);
      const db = Math.abs(targetPosition.x + b.x - playerPosition.x) +
        Math.abs(targetPosition.y + b.y - playerPosition.y);
      return da - db;
    });

    const pathfinder = window.gameClient?.world?.pathfinder;
    const startTile = getTileFromPosition(playerPosition);
    if (!pathfinder || !startTile || typeof pathfinder.search !== "function") {
      return null;
    }

    for (const offset of offsets) {
      const candidatePosition = {
        x: targetPosition.x + offset.x,
        y: targetPosition.y + offset.y,
        z: targetPosition.z,
      };
      const tile = getTileFromPosition(candidatePosition);
      if (!tile?.isWalkable?.()) {
        continue;
      }

      if (candidatePosition.x === playerPosition.x && candidatePosition.y === playerPosition.y) {
        return candidatePosition;
      }

      try {
        const path = pathfinder.search(startTile, tile);
        if (Array.isArray(path) && path.length > 0) {
          return candidatePosition;
        }
      } catch (error) {
        bot.log("auto attack reachability check failed", {
          ...candidatePosition,
          error: error?.message || error,
        });
        return null;
      }
    }

    return null;
  }

  function syncMeleeChase(now = Date.now()) {
    if (!config.meleeMode) {
      return false;
    }

    const target = getEngagedTarget();
    if (!target) {
      clearEngagedTarget();
      return false;
    }

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target.getPosition?.() || target.__position);
    if (!playerPosition || !targetPosition || playerPosition.z !== targetPosition.z) {
      return false;
    }

    const giveUpDelayMs = Math.max(5000, (Number(config.tickMs) || 0) * 10);

    if (isAdjacentTile(playerPosition, targetPosition)) {
      state.lastChaseDestinationKey = null;
      clearCurrentFollowTarget();
      resetFollowProgress();
      return false;
    }

    const adjacentPosition = findReachableAdjacentPosition(targetPosition, playerPosition);
    if (!adjacentPosition) {
      if (!state.lastFollowStallAt) {
        state.lastFollowStallAt = now;
        return false;
      }

      if (now - state.lastFollowStallAt > giveUpDelayMs) {
        return skipTarget(target, "no reachable adjacent tile", now);
      }

      return false;
    }

    const currentDistance = getTileDistance(playerPosition, targetPosition);
    if (state.lastFollowTargetId !== target.id) {
      state.lastFollowTargetId = target.id;
      state.lastFollowDistance = currentDistance;
      state.lastFollowProgressAt = now;
      state.lastFollowStallAt = 0;
    } else if (currentDistance < state.lastFollowDistance) {
      state.lastFollowDistance = currentDistance;
      state.lastFollowProgressAt = now;
      state.lastFollowStallAt = 0;
    }

    const followed = setCurrentFollowTarget(target);
    if (followed) {
      state.lastChaseAt = now;
      state.lastChaseDestinationKey = getPositionKey(adjacentPosition);
      bot.log("following auto attack target", {
        id: target.id,
        name: target.name || "Mob",
        followTargetId: target.id,
      });
    }

    if (state.lastFollowDistance <= currentDistance) {
      if (!state.lastFollowStallAt) {
        state.lastFollowStallAt = now;
      } else if (now - state.lastFollowStallAt > giveUpDelayMs) {
        return skipTarget(target, "follow made no progress", now);
      }
    }

    return followed;
  }

  function canAttack(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.targetHotbarSlot);
    if (!slot) {
      return false;
    }

    if (now - state.lastTargetHotkeyAt < Math.max(0, Number(config.targetCooldownMs) || 0)) {
      return false;
    }

    if (config.meleeMode) {
      return getMonsterCandidates(now).length > 0 && !getCurrentTarget();
    }

    return getNearbyMonsters().length > 0;
  }

  function triggerAttack(now = Date.now()) {
    if (!canAttack(now)) {
      return false;
    }

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const candidates = getMonsterCandidates(now);
    const engagedTarget = getEngagedTarget();
    const preferredTarget = config.skillTrainOnMonster
      ? pickSkillTrainTarget(candidates, playerPosition)
      : engagedTarget && !isTargetSkipped(engagedTarget, now)
        ? engagedTarget
        : (candidates[0] || null);
    if (preferredTarget && setCurrentTarget(preferredTarget)) {
      state.lastTargetHotkeyAt = now;
      markCombatActive(now);
      bot.log("selected auto attack target", {
        id: preferredTarget.id,
        name: preferredTarget.name || "Mob",
        reason: isSameCreature(preferredTarget, engagedTarget) ? "engaged target" : "nearest candidate",
      });
      return true;
    }

    if (config.meleeMode) {
      return false;
    }

    const slot = normalizeHotbarSlot(config.targetHotbarSlot);
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      const monsters = getNearbyMonsters();
      state.lastTargetHotkeyAt = now;
      markCombatActive(now);
      bot.log("used auto attack target hotkey", {
        slot,
        nearbyMonsters: monsters.map((creature) => creature.name || "Mob"),
      });
    }

    return clicked;
  }

  function canUseRune(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.runeHotbarSlot);
    if (!slot || !getCurrentTarget()) {
      return false;
    }

    if (now - state.lastRuneHotkeyAt < Math.max(0, Number(config.runeCooldownMs) || 0)) {
      return false;
    }

    return true;
  }

  function triggerRune(now = Date.now()) {
    if (!canUseRune(now)) {
      return false;
    }

    const slot = normalizeHotbarSlot(config.runeHotbarSlot);
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      state.lastRuneHotkeyAt = now;
      markCombatActive(now);
      bot.log("used auto attack rune hotkey", {
        slot,
        target: getCurrentTarget()?.name || "Mob",
      });
    }

    return clicked;
  }

  function tryAttack() {
    if (!config.enabled) {
      return false;
    }

    const now = Date.now();
    if (resetTargetIfTooFar()) {
      return true;
    }

    syncCombatState(now);

    if (config.skillTrainOnMonster) {
      syncSkillTrainTarget(now);
    }

    if (config.meleeMode) {
      const chased = syncMeleeChase(now);
      if (getCurrentTarget()) {
        return false;
      }

      if (chased) {
        return triggerAttack(now) || true;
      }
    }

    if (getCurrentTarget()) {
      return triggerRune(now);
    }

    return triggerAttack(now);
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      tryAttack();
    } catch (error) {
      bot.log("auto attack tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();

    if (state.running) {
      bot.log("auto attack already running");
      return false;
    }

    state.running = true;
    bot.log("auto attack started", { ...config });
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

    clearEngagedTarget();
    state.lastChaseAt = 0;
    clearCurrentFollowTarget();
    state.skippedTargetIds.clear();

    bot.log("auto attack stopped");
    return true;
  }

  function status() {
    const combatActive = syncCombatState(Date.now());
    return {
      running: state.running,
      config: { ...config },
      lastTargetHotkeyAt: state.lastTargetHotkeyAt,
      lastRuneHotkeyAt: state.lastRuneHotkeyAt,
      engagedTargetId: state.engagedTargetId,
      combatActive,
      combatStartedAt: state.combatStartedAt || 0,
      combatDurationMs: state.combatStartedAt ? Math.max(0, Date.now() - state.combatStartedAt) : 0,
      targetCount: getCombatTargetCount(),
      lastChaseAt: state.lastChaseAt,
      currentTarget: getCurrentTarget()
        ? {
            id: getCurrentTarget().id,
            name: getCurrentTarget().name,
            type: getCurrentTarget().type,
            position: getCurrentTarget().__position || null,
          }
        : null,
      nearbyMonsters: getNearbyMonsters().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "targetHotbarSlot")) {
      nextConfig.targetHotbarSlot = normalizeHotbarSlot(nextConfig.targetHotbarSlot) ?? config.targetHotbarSlot;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "runeHotbarSlot")) {
      nextConfig.runeHotbarSlot = normalizeHotbarSlot(nextConfig.runeHotbarSlot);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxTargetDistance")) {
      nextConfig.maxTargetDistance = Math.min(
        15,
        Math.max(1, Math.trunc(Number(nextConfig.maxTargetDistance) || config.maxTargetDistance || 6))
      );
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "targetNames")) {
      nextConfig.targetNames = normalizeTargetNames(nextConfig.targetNames);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "skillTrainRetargetMs")) {
      nextConfig.skillTrainRetargetMs = Math.max(
        250,
        Math.trunc(Number(nextConfig.skillTrainRetargetMs) || config.skillTrainRetargetMs || 1500)
      );
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "runeCooldownMs")) {
      nextConfig.runeCooldownMs = Math.max(0, Math.trunc(Number(nextConfig.runeCooldownMs) || 0));
    }

    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("auto attack config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }
  
  bot.addCleanup(() => {
    stop({ persistEnabled: false });
  });

  bot.attack = {
    start,
    stop,
    status,
    updateConfig,
    tryAttack,
    canAttack,
    triggerAttack,
    canUseRune,
    triggerRune,
    getNearbyMonsters,
    getCurrentTarget,
    getCurrentFollowTarget,
    isCombatActive,
    syncMeleeChase,
    normalizeHotbarSlot,
    config,
  };
};


window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaveModule = function installCaveModule(bot) {
  const configStorageKey = "minibiaBot.cave.config";
  const routeStorageKey = "minibiaBot.cave.route";
  const transitionStorageKey = "minibiaBot.cave.transitions";
  const presetStorageKey = "minibiaBot.cave.presets";
  const defaultPresetName = "Default";
  const minimapOverlayRootId = "minibia-bot-cave-minimap-overlay";
  const minimapOverlayStyleId = "minibia-bot-cave-minimap-overlay-style";
  const ladderItemIds = new Set([1948, 1968]);
  const ropeNamePattern = /\brope\b/i;
  const shovelNamePattern = /\bshovel\b/i;
  const shovelTargetNamePatterns = [
    /\bstone pile\b/i,
    /\bloose stone pile\b/i,
    /\bgravel pile\b/i,
    /\bdirt pile\b/i,
  ];
  const state = {
    running: false,
    timerId: null,
    observerTimerId: null,
    currentIndex: 0,
    direction: 1,
    lastPathAt: 0,
    lastPositionKey: null,
    lastProgressAt: 0,
    lastStairsUseAt: 0,
    lastObservedPosition: null,
    pendingTransitionSource: null,
    pausedForCombat: false,
    pausedForCreatures: false,
    pausedForSpawn: false,
    delayUntil: 0,
    delayWaypointIndex: null,
  };
  const minimapOverlayState = {
    timerId: null,
  };

  // ── VELOCIDADE: valores padrão mais agressivos ──────────────
  const config = Object.assign(
    {
      tickMs: 50,          // era 500 — 5x mais rápido
      repathMs: 50,        // era 1500 — recalcula caminho bem mais rápido
      observerMs: 50,       // era 200 — detecta mudança de posição bem mais rápido
      waypointTolerance: 5,  //  Se você aumentar esse número, ele vai marcar como "chegado" mais cedo 
      waypointLookahead: 12,
      pauseUntilClear: true,
      pauseUntilSpawn: true,
      strictOrder: false,   // true = ordem estrita sem pulos | false = lookahead (comportamento original)
      pauseUntilSpawnFloorOffset: 1,
      proximitySkipEnabled: true, // pula gravação se já existe WP próximo
      minProximitySkip: 3,         // distância mínima (sqm) entre WPs
      enabled: false,
      activePresetName: defaultPresetName,
    },
    bot.storage.get(configStorageKey, {})
  );

  // NÃO forçamos mais tickMs=500 — deixamos o valor do config valer

  function normalizePresetName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || null;
  }

  function cloneValue(value) {
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }

  function normalizePreset(value) {
    if (!value) return null;
    const name = normalizePresetName(value.name);
    if (!name) return null;
    return {
      name,
      route: normalizeRoute(value.route),
      transitions: normalizeTransitions(value.transitions),
    };
  }

  function normalizePresets(value) {
    const entries = Array.isArray(value) ? value : [];
    const deduped = new Map();
    entries.map(normalizePreset).filter(Boolean).forEach((preset) => {
      deduped.set(preset.name.toLowerCase(), preset);
    });
    return Array.from(deduped.values());
  }

  let route = normalizeRoute(bot.storage.get(routeStorageKey, []));
  let transitions = normalizeTransitions(bot.storage.get(transitionStorageKey, []));
  let presets = normalizePresets(bot.storage.get(presetStorageKey, []));

  if (!presets.length && (route.length || transitions.length)) {
    presets = [{
      name: defaultPresetName,
      route: route.map((waypoint) => cloneValue(waypoint)),
      transitions: transitions.map((transition) => cloneValue(transition)),
    }];
  }

  function getPresetNames() {
    return presets.map((preset) => preset.name);
  }

  function getPresetByName(name) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) return null;
    return presets.find((preset) => preset.name.toLowerCase() === normalizedName.toLowerCase()) || null;
  }

  function getActivePresetName() {
    const configuredName = normalizePresetName(config.activePresetName);
    if (configuredName && getPresetByName(configuredName)) {
      return getPresetByName(configuredName).name;
    }
    if (presets.length) return presets[0].name;
    return configuredName || defaultPresetName;
  }

  function persistPresets() {
    bot.storage.set(
      presetStorageKey,
      presets.map((preset) => ({
        name: preset.name,
        route: preset.route.map((waypoint) => ({ ...waypoint })),
        transitions: preset.transitions.map((transition) => cloneValue(transition)),
      }))
    );
  }

  function persistLegacyActivePreset() {
    bot.storage.set(routeStorageKey, route.map((waypoint) => ({ ...waypoint })));
    bot.storage.set(transitionStorageKey, transitions.map((transition) => cloneValue(transition)));
  }

  function setActivePresetName(name) {
    config.activePresetName = normalizePresetName(name) || defaultPresetName;
    persistConfig();
    return config.activePresetName;
  }

  function upsertPreset(name, nextRoute = route, nextTransitions = transitions) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) return null;
    const preset = {
      name: normalizedName,
      route: normalizeRoute(nextRoute).map((waypoint) => cloneValue(waypoint)),
      transitions: normalizeTransitions(nextTransitions).map((transition) => cloneValue(transition)),
    };
    const existingIndex = presets.findIndex((entry) => entry.name.toLowerCase() === normalizedName.toLowerCase());
    if (existingIndex >= 0) {
      presets[existingIndex] = preset;
    } else {
      presets.push(preset);
    }
    persistPresets();
    return preset;
  }

  function persistActivePreset() {
    upsertPreset(getActivePresetName(), route, transitions);
    persistLegacyActivePreset();
  }

  function loadPresetState(name) {
    const preset = getPresetByName(name);
    if (!preset) return null;
    route = normalizeRoute(preset.route);
    transitions = normalizeTransitions(preset.transitions);
    state.currentIndex = 0;
    state.direction = 1;
    state.pendingTransitionSource = null;
    setActivePresetName(preset.name);
    persistLegacyActivePreset();
    return preset;
  }

  const initialActivePreset = getActivePresetName();
  if (loadPresetState(initialActivePreset)) {
    config.activePresetName = initialActivePreset;
  } else {
    setActivePresetName(initialActivePreset);
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function persistRoute() {
    persistActivePreset();
  }

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function normalizeWaypoint(waypoint) {
    if (!waypoint) return null;
    const type = String(waypoint.type || "").trim().toLowerCase();
    if (type === "delay") {
      const seconds = Math.max(1, Math.trunc(Number(waypoint.seconds)));
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      return { type: "delay", seconds };
    }
    const position = normalizePosition(waypoint);
    if (!position) return null;
    return { type: "position", ...position };
  }

  function normalizeRoute(value) {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeWaypoint).filter(Boolean);
  }

  function normalizeTransition(transition) {
    if (!transition) return null;
    const from = normalizePosition(transition.from || transition);
    const to = normalizePosition(transition.to || {
      x: transition.targetX,
      y: transition.targetY,
      z: transition.targetZ,
    });
    if (!from || !to || from.z === to.z) return null;
    const count = Math.max(1, Math.trunc(Number(transition.count) || 1));
    const lastSeenAt = Math.max(0, Math.trunc(Number(transition.lastSeenAt) || Date.now()));
    return { from, to, count, lastSeenAt };
  }

  function normalizeTransitions(value) {
    if (!Array.isArray(value)) return [];
    const deduped = new Map();
    value.map(normalizeTransition).filter(Boolean).forEach((transition) => {
      deduped.set(getPositionKey(transition.from), transition);
    });
    return Array.from(deduped.values());
  }

  function getRoute() {
    return route.map((waypoint) => cloneValue(waypoint));
  }

  function getTransitions() {
    return transitions.map((transition) => cloneValue(transition));
  }

  function persistTransitions() {
    persistActivePreset();
  }

  function savePreset(name, options = {}) {
    const preset = upsertPreset(name, route, transitions);
    if (!preset) { bot.log("cave preset name is required"); return null; }
    if (options.activate !== false) {
      setActivePresetName(preset.name);
      persistLegacyActivePreset();
    }
    bot.log("cave preset saved", { name: preset.name, waypoints: preset.route.length, transitions: preset.transitions.length });
    return {
      name: preset.name,
      route: preset.route.map((waypoint) => cloneValue(waypoint)),
      transitions: preset.transitions.map((transition) => cloneValue(transition)),
    };
  }

  function createPreset(name) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) { bot.log("cave preset name is required"); return null; }
    if (getPresetByName(normalizedName)) { bot.log("cave preset already exists", { name: normalizedName }); return null; }
    if (state.running) stop();
    const preset = upsertPreset(normalizedName, [], []);
    if (!preset) return null;
    loadPresetState(preset.name);
    bot.log("cave preset created", { name: preset.name });
    return { name: preset.name, route: [], transitions: [] };
  }

  function loadPreset(name) {
    const preset = getPresetByName(name);
    if (!preset) { bot.log("cave preset not found", { name }); return null; }
    if (state.running) stop();
    loadPresetState(preset.name);
    bot.log("cave preset loaded", { name: preset.name, waypoints: route.length, transitions: transitions.length });
    return { name: preset.name, route: getRoute(), transitions: getTransitions() };
  }

  function deletePreset(name) {
    const preset = getPresetByName(name);
    if (!preset) { bot.log("cave preset not found", { name }); return false; }
    presets = presets.filter((entry) => entry.name.toLowerCase() !== preset.name.toLowerCase());
    persistPresets();
    if (preset.name.toLowerCase() === getActivePresetName().toLowerCase()) {
      const fallbackPreset = presets[0] || null;
      if (state.running) stop();
      if (fallbackPreset) {
        loadPresetState(fallbackPreset.name);
      } else {
        route = [];
        transitions = [];
        state.currentIndex = 0;
        state.direction = 1;
        state.pendingTransitionSource = null;
        setActivePresetName(defaultPresetName);
        persistLegacyActivePreset();
      }
    }
    bot.log("cave preset deleted", { name: preset.name });
    return true;
  }

  function exportPresets() {
    return {
      version: 1,
      activePresetName: getActivePresetName(),
      presets: presets.map((preset) => ({
        name: preset.name,
        route: preset.route.map((waypoint) => cloneValue(waypoint)),
        transitions: preset.transitions.map((transition) => cloneValue(transition)),
      })),
    };
  }

  function importPresets(value) {
    let parsed = value;
    if (typeof value === "string") {
      try { parsed = JSON.parse(value); }
      catch (error) { bot.log("cave preset import failed: invalid JSON", error?.message || error); return null; }
    }
    const payload = parsed && typeof parsed === "object" ? parsed : null;
    const importedPresets = normalizePresets(payload?.presets || payload);
    if (!importedPresets.length) { bot.log("cave preset import failed: no valid presets found"); return null; }
    if (state.running) stop();
    presets = importedPresets;
    persistPresets();
    const requestedActiveName = normalizePresetName(payload?.activePresetName);
    const targetActivePreset = getPresetByName(requestedActiveName) || presets[0];
    if (targetActivePreset) loadPresetState(targetActivePreset.name);
    bot.log("cave presets imported", { presets: presets.length, activePresetName: getActivePresetName() });
    return exportPresets();
  }

  function getCurrentWaypoint() {
    if (!route.length) return null;
    if (state.currentIndex < 0 || state.currentIndex >= route.length) state.currentIndex = 0;
    return route[state.currentIndex] || null;
  }

  function isDelayWaypoint(waypoint) {
    return !!waypoint && waypoint.type === "delay";
  }

  function getNearbyCreatures() {
    // Agora pausa pra QUALQUER monstro visível via bot.xray — não depende
    // mais da lista de "Monstros alvo" configurada na aba Attack.
    return bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
  }

  function hasNearbyCreatures() {
    return getNearbyCreatures().length > 0;
  }

  function shouldPauseForCreatures() {
    return !!config.pauseUntilClear && hasNearbyCreatures();
  }

  function getAttackTargetNames() {
    const targetNames = bot.attack?.config?.targetNames;
    if (!Array.isArray(targetNames)) return [];
    const deduped = new Map();
    targetNames.forEach((name) => {
      const normalized = String(name || "").trim();
      if (!normalized) return;
      deduped.set(normalized.toLowerCase(), normalized);
    });
    return Array.from(deduped.values());
  }

  function normalizeSpawnFloorOffset(value) {
    if (!Number.isFinite(Number(value))) return 0;
    return Math.trunc(Number(value));
  }

  function getSpawnWatchFloor(position = normalizePosition(bot.getPlayerPosition())) {
    if (!position) return null;
    return position.z - normalizeSpawnFloorOffset(config.pauseUntilSpawnFloorOffset);
  }

  function isTargetMonster(creature, targetNames) {
    const name = String(creature?.name || "").trim().toLowerCase();
    if (!name) return false;
    return targetNames.some((targetName) => targetName.toLowerCase() === name);
  }

  function getSpawnFloorMonsters(position = normalizePosition(bot.getPlayerPosition())) {
    const targetNames = getAttackTargetNames();
    const targetFloor = getSpawnWatchFloor(position);
    if (!targetNames.length || targetFloor == null) return [];
    return (bot.xray?.getVisibleMonsters?.() || []).filter((creature) => {
      const creatureFloor = Number(creature?.__position?.z ?? creature?.getPosition?.()?.z);
      if (!Number.isFinite(creatureFloor) || creatureFloor !== targetFloor) return false;
      return isTargetMonster(creature, targetNames);
    });
  }

  function hasSpawnFloorMonster(position = normalizePosition(bot.getPlayerPosition())) {
    return getSpawnFloorMonsters(position).length > 0;
  }

  function getSpawnWaitWaypointIndex() {
    const index = route.findIndex((entry) => !isDelayWaypoint(entry));
    return index >= 0 ? index : 0;
  }

  function isSpawnWaitWaypoint(waypoint, index = state.currentIndex) {
    return index === getSpawnWaitWaypointIndex() && !!waypoint && !isDelayWaypoint(waypoint);
  }

  function shouldPauseForSpawn(position, waypoint) {
    if (!config.pauseUntilSpawn || !getAttackTargetNames().length) return false;
    if (!isSpawnWaitWaypoint(waypoint)) return false;
    if (hasSpawnFloorMonster(position)) return false;
    return isAtWaypoint(position, waypoint);
  }

  function resetDelayState() {
    state.delayUntil = 0;
    state.delayWaypointIndex = null;
  }

  function getPositionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : null;
  }

  function getDistance(from, to) {
    if (!from || !to || isDelayWaypoint(from) || isDelayWaypoint(to) || Number(from.z) !== Number(to.z)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.abs(Number(from.x) - Number(to.x)) + Math.abs(Number(from.y) - Number(to.y));
  }

  function isBesideOrSameTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) return false;
    return Math.abs(Number(from.x) - Number(to.x)) <= 1 && Math.abs(Number(from.y) - Number(to.y)) <= 1;
  }

  function isAdjacentTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) return false;
    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));
    return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
  }

  function getDistanceToWaypoint(position, waypoint) {
    if (!position || !waypoint || isDelayWaypoint(waypoint)) return null;
    return getDistance(position, waypoint);
  }

  function isSameTile(a, b) {
    if (!a || !b) return false;
    return Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y) && Number(a.z) === Number(b.z);
  }

  function getWaypointLookahead() {
    const value = Number(config.waypointLookahead);
    if (!Number.isFinite(value) || value < 1) return 12;
    return Math.trunc(value);
  }

  function findClosestWaypointIndex(position) {
    if (!position || !route.length) return 0;
    const tolerance = getWaypointTolerance();
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    route.forEach((waypoint, index) => {
      if (isDelayWaypoint(waypoint)) return;
      const distance = getDistanceToWaypoint(position, waypoint);
      if (!Number.isFinite(distance)) return;
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; return; }
      if (distance <= bestDistance + tolerance && index < bestIndex) { bestIndex = index; bestDistance = distance; }
    });
    if (Number.isFinite(bestDistance)) return bestIndex;
    const firstPositionIndex = route.findIndex((waypoint) => !isDelayWaypoint(waypoint));
    return firstPositionIndex >= 0 ? firstPositionIndex : 0;
  }

  function findAheadWaypointIndex(position, fromIndex, direction) {
    const startIndex = Math.max(0, Math.min(route.length - 1, Math.trunc(Number(fromIndex) || 0)));
    const lookahead = getWaypointLookahead();
    let bestIndex = startIndex;
    let bestDistance = getDistanceToWaypoint(position, route[startIndex]);
    // Loop circular — sempre avança para frente
    const limit = Math.min(route.length - 1, startIndex + lookahead);
    for (let index = startIndex + 1; index <= limit; index += 1) {
      if (isDelayWaypoint(route[index])) continue;
      const distance = getDistanceToWaypoint(position, route[index]);
      if (!Number.isFinite(distance)) continue;
      if (!Number.isFinite(bestDistance) || distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
    return bestIndex;
  }

  function getTileAt(position) {
    if (!position) return null;
    return window.gameClient?.world?.getTileFromWorldPosition?.(
      new Position(position.x, position.y, position.z)
    ) || null;
  }

  function getTilePosition(tile) {
    return normalizePosition(tile?.__position);
  }

  function getThingDefinition(itemId) {
    if (!itemId) return null;
    return (
      window.gameClient?.itemDefinitionsByCid?.[itemId] ||
      window.gameClient?.itemDefinitionsBySid?.[itemId] ||
      window.gameClient?.itemDefinitions?.[itemId] ||
      null
    );
  }

  function getThingName(thing) {
    const definition = getThingDefinition(thing?.id);
    return String(definition?.properties?.name || thing?.name || "").trim().toLowerCase();
  }

  function isLadderThing(thing) {
    if (!thing?.id) return false;
    if (ladderItemIds.has(Number(thing.id))) return true;
    return getThingName(thing).includes("ladder");
  }

  function isFloorChangeThing(thing) {
    const definition = getThingDefinition(thing?.id);
    return !!definition?.properties?.floorchange || isLadderThing(thing);
  }

  function isFloorChangeTile(tile) {
    const tilePosition = getTilePosition(tile);
    if (!tilePosition) return false;
    if (isFloorChangeThing(tile)) return true;
    return Array.isArray(tile.items) && tile.items.some((item) => isFloorChangeThing(item));
  }

  function getTileThings(tile) {
    if (!tile) return [];
    const things = [];
    if (tile.id) things.push(tile);
    if (Array.isArray(tile.items)) tile.items.forEach((item) => { if (item) things.push(item); });
    return things;
  }

  function tileHasNamedThing(tile, needle) {
    const value = String(needle || "").trim().toLowerCase();
    if (!value) return false;
    return getTileThings(tile).some((thing) => getThingName(thing).includes(value));
  }

  function isLadderTile(tile) { return getTileThings(tile).some((thing) => isLadderThing(thing)); }
  function isStairsTile(tile) { return tileHasNamedThing(tile, "stairs"); }
  function isHoleTile(tile) { return tileHasNamedThing(tile, "hole"); }
  function isRopeSpotTile(tile) { return tileHasNamedThing(tile, "rope spot"); }
  function isRopeTargetTile(tile) { return isHoleTile(tile) || isRopeSpotTile(tile); }

  function isShovelTargetThing(thing) {
    const name = getThingName(thing);
    if (!name) return false;
    return shovelTargetNamePatterns.some((pattern) => pattern.test(name));
  }

  function isShovelTargetTile(tile) {
    return getTileThings(tile).some((thing) => isShovelTargetThing(thing));
  }

  function isTransitionCandidateTile(tile, waypoint, position) {
    if (!tile) return false;
    if (isFloorChangeTile(tile)) return true;
    const hasWaypointDelta = waypoint && position && Number.isFinite(waypoint.z) && Number.isFinite(position.z);
    if (!hasWaypointDelta) return false;
    if (waypoint.z > position.z) return isShovelTargetTile(tile);
    if (waypoint.z < position.z) return isRopeTargetTile(tile);
    return false;
  }

  function getFloorChangeTileBias(tile, position, waypoint) {
    if (!tile || !position || !waypoint || position.z === waypoint.z) return 0;
    const goingDown = waypoint.z > position.z;
    const goingUp = waypoint.z < position.z;
    if (goingDown) {
      if (isLadderTile(tile)) return -30;
      if (isHoleTile(tile)) return -20;
      if (isStairsTile(tile)) return 25;
    }
    if (goingUp) {
      if (isStairsTile(tile)) return -20;
      if (isHoleTile(tile)) return 20;
    }
    return 0;
  }

  function getLoadedTiles() {
    const chunks = window.gameClient?.world?.chunks || [];
    const tiles = [];
    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) {
        if (tile?.__position) tiles.push(tile);
      }
    }
    return tiles;
  }

  function ensureMinimapOverlayStyle() {
    if (document.getElementById(minimapOverlayStyleId)) return;
    const style = document.createElement("style");
    style.id = minimapOverlayStyleId;
    style.textContent = `
      #${minimapOverlayRootId} { position: fixed; inset: 0; pointer-events: none; z-index: 999997; }
      #${minimapOverlayRootId} canvas { position: fixed; pointer-events: none; }
    `;
    document.head.appendChild(style);
  }

  function ensureMinimapOverlayRoot() {
    let root = document.getElementById(minimapOverlayRootId);
    if (root) return root;
    root = document.createElement("div");
    root.id = minimapOverlayRootId;
    root.innerHTML = '<canvas></canvas>';
    document.body.appendChild(root);
    return root;
  }

  function destroyMinimapOverlayElements() {
    document.getElementById(minimapOverlayRootId)?.remove();
    document.getElementById(minimapOverlayStyleId)?.remove();
  }

  function getMinimapCanvas() {
    return window.gameClient?.renderer?.minimap?.minimap?.canvas || document.getElementById("minimap") || null;
  }

  function getMinimapViewport() {
    const canvas = getMinimapCanvas();
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { canvas, rect };
  }

  function getWaypointCanvasPoint(waypoint, viewport, playerPosition, minimap) {
    if (!waypoint || !viewport || !playerPosition || !minimap) return null;
    if (isDelayWaypoint(waypoint)) return null;
    if (waypoint.z !== minimap.__renderLayer) return null;
    const zoomScale = 1 << (Number(minimap.__zoomLevel) || 0);
    const center = minimap.center || { x: 0, y: 0 };
    const internalWidth = Number(viewport.canvas.width) || 160;
    const internalHeight = Number(viewport.canvas.height) || 160;
    const internalX = (internalWidth / 2) + (waypoint.x - playerPosition.x - Number(center.x || 0)) * zoomScale;
    const internalY = (internalHeight / 2) + (waypoint.y - playerPosition.y - Number(center.y || 0)) * zoomScale;
    return {
      x: internalX * (viewport.rect.width / internalWidth),
      y: internalY * (viewport.rect.height / internalHeight),
    };
  }

  function renderMinimapOverlay() {
    const viewport = getMinimapViewport();
    const minimap = window.gameClient?.renderer?.minimap;
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const root = ensureMinimapOverlayRoot();
    const canvas = root.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (!viewport || !minimap || !playerPosition || !route.length) {
      canvas.width = 0; canvas.height = 0; return;
    }
    const rect = viewport.rect;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth; canvas.height = pixelHeight;
    }
    canvas.style.left = `${Math.round(rect.left)}px`;
    canvas.style.top = `${Math.round(rect.top)}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const visibleWaypoints = route
      .map((waypoint, index) => ({ waypoint, index, point: getWaypointCanvasPoint(waypoint, viewport, playerPosition, minimap) }))
      .filter((entry) => entry.point);
    if (!visibleWaypoints.length) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    for (let index = 1; index < visibleWaypoints.length; index += 1) {
      const previous = visibleWaypoints[index - 1];
      const current = visibleWaypoints[index];
      if (current.index !== previous.index + 1) continue;
      context.strokeStyle = "rgba(92, 228, 196, 0.7)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(previous.point.x, previous.point.y);
      context.lineTo(current.point.x, current.point.y);
      context.stroke();
    }
    visibleWaypoints.forEach(({ point, index }) => {
      const isCurrent = state.running && index === state.currentIndex;
      const radius = isCurrent ? 7 : 5;
      context.fillStyle = isCurrent ? "#ffcf5a" : "#2bd1c4";
      context.strokeStyle = isCurrent ? "#6a2400" : "#083f49";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = "#ffffff";
      context.font = "bold 11px Verdana, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(index + 1), point.x, point.y);
    });
    context.restore();
  }

  function startMinimapOverlay() {
    if (minimapOverlayState.timerId != null) return;
    ensureMinimapOverlayStyle();
    renderMinimapOverlay();
    minimapOverlayState.timerId = window.setInterval(renderMinimapOverlay, 250);
  }

  function stopMinimapOverlay() {
    if (minimapOverlayState.timerId != null) {
      window.clearInterval(minimapOverlayState.timerId);
      minimapOverlayState.timerId = null;
    }
    destroyMinimapOverlayElements();
  }

  function getNearbyTransitionTiles(position, waypoint, radius = 8) {
    if (!position) return [];
    return getLoadedTiles()
      .map((tile) => ({ tile, position: getTilePosition(tile) }))
      .filter((entry) =>
        entry.position &&
        entry.position.z === position.z &&
        Math.abs(entry.position.x - position.x) <= radius &&
        Math.abs(entry.position.y - position.y) <= radius &&
        isTransitionCandidateTile(entry.tile, waypoint, position)
      );
  }

  function findTransitionTileNearPosition(position, waypoint, radius = 1) {
    if (!position) return null;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    getNearbyTransitionTiles(position, waypoint, radius).forEach((entry) => {
      const distance = getDistance(position, entry.position);
      if (!Number.isFinite(distance)) return;
      if (distance < bestDistance) { bestDistance = distance; best = entry; }
    });
    return best;
  }

  function findBestKnownTransition(position, waypoint) {
    if (!position || !waypoint) return null;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    transitions.forEach((transition) => {
      if (transition.from.z !== position.z || transition.to.z !== waypoint.z) return;
      const playerDistance = getDistance(position, transition.from);
      const landingDistance = getDistance(transition.to, waypoint);
      if (!Number.isFinite(playerDistance) || !Number.isFinite(landingDistance)) return;
      const score = playerDistance * 10 + landingDistance;
      if (score < bestScore) { bestScore = score; best = transition; }
    });
    return best;
  }

  function findNearbyTransitionTile(position, waypoint) {
    if (!position || !waypoint) return null;
    const waypointDistance = Math.abs(position.x - waypoint.x) + Math.abs(position.y - waypoint.y);
    const radius = Math.max(4, Math.min(20, waypointDistance + 2));
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    getNearbyTransitionTiles(position, waypoint, radius).forEach((entry) => {
      const playerDistance = getDistance(position, entry.position);
      const tileToWaypointDistance = Math.abs(entry.position.x - waypoint.x) + Math.abs(entry.position.y - waypoint.y);
      const score = playerDistance * 10 + tileToWaypointDistance + getFloorChangeTileBias(entry.tile, position, waypoint);
      if (score < bestScore) {
        bestScore = score;
        best = { tile: entry.tile, position: entry.position, playerDistance, waypointDistance: tileToWaypointDistance };
      }
    });
    return best;
  }

  function getWaypointTolerance() {
    const value = Number(config.waypointTolerance);
    if (!Number.isFinite(value) || value < 0) return 2;
    return Math.trunc(value);
  }

  function findNextPositionIndex(startIndex, direction = 1) {
    let index = Math.trunc(Number(startIndex) || 0);
    while (index >= 0 && index < route.length) {
      if (!isDelayWaypoint(route[index])) return index;
      index += direction;
    }
    return Math.max(0, Math.min(route.length - 1, Math.trunc(Number(startIndex) || 0)));
  }

  function syncWaypointProgress(position) {
    if (!position || !route.length) return false;
    const previousIndex = state.currentIndex;
    const direction = 1; // sempre para frente (loop circular)

    if (config.strictOrder) {
      // ── Modo ordem estrita: avança um por um, sem pulos ──────
      const waypoint = getCurrentWaypoint();
      if (!isDelayWaypoint(waypoint) && isAtWaypoint(position, waypoint)) {
        const nextIndex = state.currentIndex + 1;
        state.currentIndex = nextIndex >= route.length ? 0 : nextIndex;
        resetDelayState();
      }
    } else {
      // ── Modo lookahead: comportamento original ────────────────
      let index = state.currentIndex;
      while (index < route.length) {
        const waypoint = route[index];
        if (isDelayWaypoint(waypoint) || !isAtWaypoint(position, waypoint)) break;
        index += 1;
      }
      if (index !== state.currentIndex) {
        state.currentIndex = index >= route.length ? 0 : index;
      }

      const currentWaypoint = getCurrentWaypoint();
      const currentDistance = getDistanceToWaypoint(position, currentWaypoint);
      const aheadIndex = findAheadWaypointIndex(position, state.currentIndex, direction);
      if (Number.isFinite(currentDistance) && aheadIndex > state.currentIndex) {
        const aheadWaypoint = route[aheadIndex];
        const aheadDistance = getDistanceToWaypoint(position, aheadWaypoint);
        if (Number.isFinite(aheadDistance) && aheadDistance < currentDistance) {
          let nextIndex = findNextPositionIndex(aheadIndex, 1);
          if (!isDelayWaypoint(aheadWaypoint) && isAtWaypoint(position, aheadWaypoint)) {
            const afterAhead = aheadIndex + 1;
            if (afterAhead < route.length) nextIndex = findNextPositionIndex(afterAhead, 1);
          } else {
            const afterIndex = aheadIndex + 1;
            if (afterIndex < route.length) {
              const afterWaypoint = route[afterIndex];
              const afterDistance = getDistanceToWaypoint(position, afterWaypoint);
              if (Number.isFinite(afterDistance) && afterDistance < aheadDistance) nextIndex = findNextPositionIndex(afterIndex, 1);
            }
          }
          if (nextIndex > state.currentIndex) { state.currentIndex = nextIndex; resetDelayState(); }
        }
      }
    }

    if (previousIndex !== state.currentIndex) {
      bot.log("cave synced waypoint", { from: previousIndex + 1, to: state.currentIndex + 1, total: route.length, strictOrder: config.strictOrder });
      return true;
    }
    return false;
  }

  function isAtWaypoint(position, waypoint) {
    const distance = getDistanceToWaypoint(position, waypoint);
    if (!Number.isFinite(distance)) return false;
    return distance <= getWaypointTolerance();
  }

  function goToWaypoint(waypoint) {
    const from = bot.getPlayerPosition();
    if (!from || !waypoint || isDelayWaypoint(waypoint)) return false;
    const to = new Position(waypoint.x, waypoint.y, waypoint.z);
    try {
      window.gameClient?.world?.pathfinder?.findPath?.(from, to);
      state.lastPathAt = Date.now();
      bot.log("cave pathing to waypoint", { ...waypoint, index: state.currentIndex + 1, total: route.length });
      return true;
    } catch (error) {
      bot.log("cave pathing failed", { ...waypoint, error: error?.message || error });
      return false;
    }
  }

  function goToPosition(position) {
    if (!position) return false;
    return goToWaypoint(position);
  }

  function markPendingTransitionSource(source) {
    const normalized = normalizePosition(source);
    if (!normalized) return;
    state.pendingTransitionSource = { ...normalized, at: Date.now() };
  }

  function upsertTransition(from, to) {
    const normalizedFrom = normalizePosition(from);
    const normalizedTo = normalizePosition(to);
    if (!normalizedFrom || !normalizedTo || normalizedFrom.z === normalizedTo.z) return null;
    const key = getPositionKey(normalizedFrom);
    const index = transitions.findIndex((transition) => getPositionKey(transition.from) === key);
    const next = {
      from: normalizedFrom,
      to: normalizedTo,
      count: index >= 0 ? transitions[index].count + 1 : 1,
      lastSeenAt: Date.now(),
    };
    if (index >= 0) { transitions[index] = next; } else { transitions.push(next); }
    persistTransitions();
    bot.log("cave learned floor transition", next);
    return cloneValue(next);
  }

  function resolveObservedTransitionSource(previousPosition) {
    const pending = normalizePosition(state.pendingTransitionSource);
    if (pending && pending.z === previousPosition.z) return pending;
    const currentTile = getTileAt(previousPosition);
    if (currentTile && isFloorChangeTile(currentTile)) return previousPosition;
    const nearby = findTransitionTileNearPosition(previousPosition, null, 1);
    if (nearby?.position) return nearby.position;
    return null;
  }

  function observePosition() {
    const current = normalizePosition(bot.getPlayerPosition());
    if (!current) return;
    const previous = state.lastObservedPosition;
    if (previous && !isSameTile(previous, current) && previous.z !== current.z) {
      const source = resolveObservedTransitionSource(previous);
      if (source) upsertTransition(source, current);
      state.pendingTransitionSource = null;
    }
    state.lastObservedPosition = current;
  }

  function getEquipment() { return window.gameClient?.player?.equipment || null; }
  function getOpenContainers() { return Array.from(window.gameClient?.player?.__openedContainers || []); }

  function findAdjacentWalkablePosition(targetPosition, playerPosition) {
    if (!targetPosition || !playerPosition) return null;
    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];
    offsets.sort((a, b) => {
      const da = Math.abs(targetPosition.x + a.x - playerPosition.x) + Math.abs(targetPosition.y + a.y - playerPosition.y);
      const db = Math.abs(targetPosition.x + b.x - playerPosition.x) + Math.abs(targetPosition.y + b.y - playerPosition.y);
      return da - db;
    });
    for (const offset of offsets) {
      const position = new Position(targetPosition.x + offset.x, targetPosition.y + offset.y, targetPosition.z);
      const tile = window.gameClient?.world?.getTileFromWorldPosition?.(position);
      if (tile?.isWalkable?.()) return normalizePosition(position);
    }
    return null;
  }

  function isRopeItem(item) { const name = getThingName(item); return !!name && ropeNamePattern.test(name); }
  function isShovelItem(item) { const name = getThingName(item); return !!name && shovelNamePattern.test(name); }

  function findToolSource(predicate) {
    const equipment = getEquipment();
    if (equipment?.slots) {
      for (let slotIndex = 0; slotIndex < equipment.slots.length; slotIndex += 1) {
        const item = equipment.getSlotItem?.(slotIndex);
        if (predicate(item)) return { which: equipment, index: slotIndex, item, location: "equipment" };
      }
    }
    for (const container of getOpenContainers()) {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const item = container.getSlotItem?.(slotIndex);
        if (predicate(item)) return { which: container, index: slotIndex, item, location: "container" };
      }
    }
    return null;
  }

  function findRopeSource() { return findToolSource(isRopeItem); }
  function findShovelSource() { return findToolSource(isShovelItem); }

  function useToolOnTile(tool, targetTile, targetPosition, actionLabel, now = Date.now()) {
    if (!tool || !targetTile || !targetPosition) return false;
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    if (!playerPosition) return false;
    if (!isAdjacentTile(playerPosition, targetPosition)) {
      const adjacentPosition = findAdjacentWalkablePosition(targetPosition, playerPosition);
      if (adjacentPosition) return goToPosition(adjacentPosition);
    }
    window.gameClient?.mouse?.__handleItemUseWith?.(
      { which: tool.which, index: tool.index },
      { which: targetTile, index: 0xFF }
    );
    state.lastStairsUseAt = now;
    state.lastPathAt = now;
    markPendingTransitionSource(targetPosition);
    bot.log(actionLabel, { source: targetPosition, toolLocation: tool.location, toolSlot: tool.index, toolName: getThingName(tool.item) });
    return true;
  }

  function useRopeOnTile(targetTile, targetPosition, now = Date.now()) {
    return useToolOnTile(findRopeSource(), targetTile, targetPosition, "cave roped transition tile", now);
  }

  function useShovelOnTile(targetTile, targetPosition, now = Date.now()) {
    return useToolOnTile(findShovelSource(), targetTile, targetPosition, "cave shoveled transition tile", now);
  }

  function useFloorChangeTile(target, waypoint, now = Date.now()) {
    const position = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target?.position);
    const targetTile = target?.tile || (targetPosition ? getTileAt(targetPosition) : null);
    if (!position || !targetPosition || !targetTile) return false;
    if (now - state.lastStairsUseAt < 1200) return true;
    if (waypoint?.z < position.z && isRopeTargetTile(targetTile)) return useRopeOnTile(targetTile, targetPosition, now);
    if (!isFloorChangeTile(targetTile)) {
      if (waypoint?.z > position.z && isShovelTargetTile(targetTile)) return useShovelOnTile(targetTile, targetPosition, now);
      return false;
    }
    if (isLadderTile(targetTile)) {
      window.gameClient?.mouse?.use?.({ which: targetTile, index: 0xFF });
      state.lastStairsUseAt = now;
      state.lastPathAt = now;
      markPendingTransitionSource(targetPosition);
      bot.log("cave used ladder tile", { source: targetPosition, targetZ: waypoint?.z ?? null });
      return true;
    }
    if (!isSameTile(position, targetPosition)) return goToPosition(targetPosition);
    const currentTile = getTileAt(position);
    if (!currentTile || !isFloorChangeTile(currentTile)) return false;
    window.gameClient?.mouse?.use?.({ which: currentTile, index: 0xFF });
    state.lastStairsUseAt = now;
    state.lastPathAt = now;
    markPendingTransitionSource(position);
    bot.log("cave used floor-change tile", { source: position, targetZ: waypoint?.z ?? null });
    return true;
  }

  function handleFloorChange(waypoint, now = Date.now()) {
    const position = normalizePosition(bot.getPlayerPosition());
    if (!position || !waypoint || position.z === waypoint.z) return false;
    const visibleCandidate = findNearbyTransitionTile(position, waypoint);
    if (visibleCandidate) {
      const moved = useFloorChangeTile(visibleCandidate, waypoint, now);
      if (moved) {
        bot.log("cave probing visible floor-change tile", { tileX: visibleCandidate.position.x, tileY: visibleCandidate.position.y, tileZ: visibleCandidate.position.z, targetZ: waypoint.z });
        return true;
      }
    }
    const knownTransition = findBestKnownTransition(position, waypoint);
    if (knownTransition) {
      const target = { tile: getTileAt(knownTransition.from), position: knownTransition.from };
      const moved = useFloorChangeTile(target, waypoint, now);
      if (moved) {
        bot.log("cave using learned floor transition", { from: knownTransition.from, to: knownTransition.to, waypoint });
        return true;
      }
      bot.log("cave learned transition unavailable, falling back to live scan", { from: knownTransition.from, to: knownTransition.to, waypoint });
    }
    return false;
  }

  function advanceWaypoint() {
    if (!route.length) return null;
    if (route.length === 1) return route[0];
    // Loop circular: quando chega no último volta para o primeiro
    let nextIndex = state.currentIndex + 1;
    if (nextIndex >= route.length) { nextIndex = 0; }
    state.currentIndex = nextIndex;
    state.direction = 1; // sempre para frente
    const nextWaypoint = getCurrentWaypoint();
    resetDelayState();
    bot.log("cave advanced waypoint", { index: state.currentIndex + 1, total: route.length, waypoint: nextWaypoint });
    return nextWaypoint;
  }

  function scheduleNextTick() {
    if (!state.running) return;
    state.timerId = window.setTimeout(tick, config.tickMs);
  }

  function tick() {
    if (!state.running) return;
    try {
      observePosition();
      if (!route.length) { stop(); return; }
      const position = normalizePosition(bot.getPlayerPosition());
      const positionKey = getPositionKey(position);
      const now = Date.now();
      const attackStatus = bot.attack?.status?.() || null;
      const shouldPauseForCombat = !!attackStatus?.combatActive && Number(attackStatus?.combatDurationMs || 0) < 60000;
      if (shouldPauseForCombat) {
        if (!state.pausedForCombat) { state.pausedForCombat = true; bot.log("cave paused for auto attack", { combatDurationMs: Number(attackStatus?.combatDurationMs || 0), targetCount: Number(attackStatus?.targetCount || 0) }); }
        return;
      }
      if (state.pausedForCombat) { state.pausedForCombat = false; bot.log("cave resumed after auto attack", { combatDurationMs: Number(attackStatus?.combatDurationMs || 0), targetCount: Number(attackStatus?.targetCount || 0) }); }
      if (shouldPauseForCreatures()) {
        if (!state.pausedForCreatures) { state.pausedForCreatures = true; const nearby = getNearbyCreatures(); bot.log("cave paused until area clear", { creatureCount: nearby.length, creatures: nearby.map((c) => c.name || "Mob") }); }
        return;
      }
      if (state.pausedForCreatures) { state.pausedForCreatures = false; bot.log("cave resumed after area clear"); }
      let waypoint = getCurrentWaypoint();
      if (!waypoint) { stop(); return; }
      if (shouldPauseForSpawn(position, waypoint)) {
        if (!state.pausedForSpawn) { state.pausedForSpawn = true; bot.log("cave paused until target monster spawns", { floorOffset: normalizeSpawnFloorOffset(config.pauseUntilSpawnFloorOffset), watchFloor: getSpawnWatchFloor(position), targetNames: getAttackTargetNames() }); }
        return;
      }
      if (state.pausedForSpawn) {
        state.pausedForSpawn = false;
        if (hasSpawnFloorMonster(position)) { const spawned = getSpawnFloorMonsters(position); bot.log("cave resumed after target monster spawned", { floorOffset: normalizeSpawnFloorOffset(config.pauseUntilSpawnFloorOffset), watchFloor: getSpawnWatchFloor(position), creatures: spawned.map((c) => c.name || "Mob") }); }
      }
      syncWaypointProgress(position);
      waypoint = getCurrentWaypoint();
      if (!waypoint) { stop(); return; }
      if (positionKey && positionKey !== state.lastPositionKey) { state.lastPositionKey = positionKey; state.lastProgressAt = now; }
      if (isDelayWaypoint(waypoint)) {
        if (state.delayWaypointIndex !== state.currentIndex || !state.delayUntil) {
          state.delayWaypointIndex = state.currentIndex;
          state.delayUntil = now + (Math.max(1, Number(waypoint.seconds) || 1) * 1000);
          bot.log("cave delay started", { index: state.currentIndex + 1, total: route.length, seconds: Math.max(1, Number(waypoint.seconds) || 1) });
        }
        if (now < state.delayUntil) return;
        bot.log("cave delay completed", { index: state.currentIndex + 1, total: route.length });
        waypoint = advanceWaypoint();
        if (!waypoint) return;
      }
      if (isAtWaypoint(position, waypoint) && !isDelayWaypoint(waypoint)) { waypoint = advanceWaypoint(); }
      if (!waypoint) return;
      if (position && waypoint.z !== position.z) { handleFloorChange(waypoint, now); return; }

      // ── VELOCIDADE: repath mais agressivo ──────────────────
      const shouldRepath =
        now - state.lastPathAt >= config.repathMs ||
        !state.lastProgressAt ||
        now - state.lastProgressAt >= config.repathMs;

      if (shouldRepath) goToWaypoint(waypoint);

    } catch (error) {
      bot.log("cave tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function startObserver() {
    if (state.observerTimerId != null) return;
    // ── VELOCIDADE: observer a cada 50ms (era 200ms) ────────
    state.observerTimerId = window.setInterval(() => {
      try { observePosition(); }
      catch (error) { bot.log("cave observer failed", error?.message || error); }
    }, config.observerMs);
  }

  function stopObserver() {
    if (state.observerTimerId == null) return;
    window.clearInterval(state.observerTimerId);
    state.observerTimerId = null;
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    // ── NÃO forçamos tickMs=500 aqui ────────────────────────
    persistConfig();
    if (!route.length) { bot.log("cave bot cannot start without waypoints"); return false; }
    const hasPositionWaypoint = route.some((waypoint) => !isDelayWaypoint(waypoint));
    if (!hasPositionWaypoint) { bot.log("cave bot cannot start without position waypoints"); return false; }
    if (state.running) { bot.log("cave bot already running"); return false; }
    const position = normalizePosition(bot.getPlayerPosition());
    state.running = true;
    state.currentIndex = findClosestWaypointIndex(position);
    state.direction = 1; // sempre loop circular para frente
    state.lastPathAt = 0;
    state.lastPositionKey = getPositionKey(position);
    state.lastProgressAt = Date.now();
    state.pausedForCombat = false;
    state.pausedForCreatures = false;
    state.pausedForSpawn = false;
    resetDelayState();
    bot.log("cave bot started", { waypoints: route.length, currentIndex: state.currentIndex + 1, direction: state.direction, waypoint: getCurrentWaypoint(), tickMs: config.tickMs, repathMs: config.repathMs, observerMs: config.observerMs });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (shouldPersistEnabled) { config.enabled = false; persistConfig(); }
    state.pausedForCombat = false;
    state.pausedForCreatures = false;
    state.pausedForSpawn = false;
    resetDelayState();
    bot.log("cave bot stopped");
    return true;
  }

  function addWaypoint(waypoint) {
    const normalized = normalizeWaypoint(waypoint);
    if (!normalized) return null;
    route.push(normalized);
    persistRoute();
    bot.log("cave waypoint added", { ...normalized, total: route.length });
    return cloneValue(normalized);
  }

  function addWaypointCurrentSpot() {
    const position = normalizePosition(bot.getPlayerPosition());
    if (!position) { bot.log("could not read current position for cave waypoint"); return null; }

    // ── Proximity Skip: ativo quando config.proximitySkipEnabled === true ──
    if (config.proximitySkipEnabled) {
      const minDist = Math.max(1, Math.trunc(Number(config.minProximitySkip) || 3));
      for (const wp of route) {
        if (isDelayWaypoint(wp)) continue;
        if (wp.z !== position.z) continue; // só compara mesmo andar
        const dist = getDistance(position, wp);
        if (Number.isFinite(dist) && dist < minDist) {
          bot.log("cave waypoint skipped (proximity skip ativo)", {
            dist,
            minProximitySkip: minDist,
            current: position,
            nearestWp: { x: wp.x, y: wp.y, z: wp.z },
          });
          return null;
        }
      }
    }

    return addWaypoint(position);
  }

  function addDelay(seconds) {
    const normalizedSeconds = Math.max(1, Math.trunc(Number(seconds) || 0));
    if (!Number.isFinite(normalizedSeconds) || normalizedSeconds <= 0) { bot.log("invalid cave delay", { seconds }); return null; }
    const delayWaypoint = { type: "delay", seconds: normalizedSeconds };
    route.push(delayWaypoint);
    persistRoute();
    bot.log("cave delay added", { ...delayWaypoint, total: route.length });
    return cloneValue(delayWaypoint);
  }

  function clearWaypoints() {
    route = [];
    state.currentIndex = 0;
    state.direction = 1;
    resetDelayState();
    persistRoute();
    bot.log("cave route cleared");
    if (state.running) stop();
    return [];
  }

  function clearTransitions() {
    transitions = [];
    state.pendingTransitionSource = null;
    persistTransitions();
    bot.log("cave learned transitions cleared");
    return [];
  }

  function removeLastWaypoint() {
    if (!route.length) return null;
    const removed = route.pop();
    if (state.currentIndex >= route.length) { state.currentIndex = Math.max(0, route.length - 1); resetDelayState(); }
    if (route.length <= 1) state.direction = 1;
    persistRoute();
    bot.log("cave waypoint removed", removed);
    if (!route.length && state.running) stop();
    return removed;
  }

  function setCurrentIndex(index) {
    if (!route.length) { state.currentIndex = 0; state.direction = 1; return 0; }
    const nextIndex = Math.max(0, Math.min(route.length - 1, Math.trunc(Number(index) || 0)));
    state.currentIndex = nextIndex;
    resetDelayState();
    state.direction = 1; // sempre loop circular
    return state.currentIndex;
  }

  function status() {
    const position = normalizePosition(bot.getPlayerPosition());
    const waypoint = getCurrentWaypoint();
    return {
      running: state.running,
      config: { ...config },
      route: getRoute(),
      transitions: getTransitions(),
      presetNames: getPresetNames(),
      activePresetName: getActivePresetName(),
      currentIndex: state.currentIndex,
      direction: state.direction,
      currentWaypoint: cloneValue(waypoint),
      distanceToWaypoint: getDistanceToWaypoint(position, waypoint),
      lastPathAt: state.lastPathAt,
      lastProgressAt: state.lastProgressAt,
      pendingTransitionSource: cloneValue(state.pendingTransitionSource),
      pausedForCombat: state.pausedForCombat,
      pausedForCreatures: state.pausedForCreatures,
      pausedForSpawn: state.pausedForSpawn,
      nearbyCreatureCount: getNearbyCreatures().length,
      spawnFloorCreatureCount: getSpawnFloorMonsters(position).length,
      spawnWatchFloor: getSpawnWatchFloor(position),
      spawnFloorOffset: normalizeSpawnFloorOffset(config.pauseUntilSpawnFloorOffset),
    };
  }

  function updateConfig(nextConfig = {}) {
    if ("pauseUntilSpawnFloorOffset" in nextConfig) nextConfig.pauseUntilSpawnFloorOffset = normalizeSpawnFloorOffset(nextConfig.pauseUntilSpawnFloorOffset);
    if ("waypointTolerance" in nextConfig) nextConfig.waypointTolerance = Math.max(0, Math.trunc(Number(nextConfig.waypointTolerance) || 0));
    if ("waypointLookahead" in nextConfig) nextConfig.waypointLookahead = Math.max(1, Math.trunc(Number(nextConfig.waypointLookahead) || 12));
    // ── VELOCIDADE: valida tickMs e repathMs sem forçar 500 ─
    if ("tickMs"     in nextConfig) nextConfig.tickMs     = Math.max(50, Math.trunc(Number(nextConfig.tickMs)     || 100));
    if ("repathMs"   in nextConfig) nextConfig.repathMs   = Math.max(100, Math.trunc(Number(nextConfig.repathMs)  || 400));
    if ("observerMs" in nextConfig) nextConfig.observerMs = Math.max(50, Math.trunc(Number(nextConfig.observerMs) || 50));
    if ("minProximitySkip" in nextConfig) nextConfig.minProximitySkip = Math.max(1, Math.min(20, Math.trunc(Number(nextConfig.minProximitySkip) || 3)));
    if ("proximitySkipEnabled" in nextConfig) nextConfig.proximitySkipEnabled = !!nextConfig.proximitySkipEnabled;
    if ("strictOrder" in nextConfig) nextConfig.strictOrder = !!nextConfig.strictOrder;
    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("cave config updated", { ...config });
    return { ...config };
  }

  // ── HOTKEY ─────────────────────────────────────────────────
  const hotkeyConfigKey = "minibiaBot.caveHotkey.config";
  const hotkeyConfig = Object.assign(
    { stopKey: "Delete", startKey: "Insert", enabled: true },
    bot.storage.get(hotkeyConfigKey, {})
  );

  function persistHotkeyConfig() { bot.storage.set(hotkeyConfigKey, { ...hotkeyConfig }); }

  function showHotkeyToast(text) {
    const existing = document.getElementById("minibia-cave-hotkey-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "minibia-cave-hotkey-toast";
    toast.textContent = text;
    Object.assign(toast.style, {
      position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.82)", color: "#fff", padding: "8px 18px",
      borderRadius: "8px", fontSize: "14px", fontFamily: "monospace",
      zIndex: "999999", pointerEvents: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      transition: "opacity 0.3s",
    });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; }, 1800);
    setTimeout(() => { toast.remove(); }, 2200);
  }

  function onCaveHotkey(e) {
    if (!hotkeyConfig.enabled) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    if (e.key === hotkeyConfig.stopKey) {
      e.preventDefault();
      const caveEstavaRodando = state.running;
      if (caveEstavaRodando) stop();

      // Desliga o auto attack junto com o cave
      let attackParado = false;
      try {
        if (bot.attack?.status?.().running) {
          bot.attack.stop();
          attackParado = true;
        }
      } catch (erro) {
        bot.log("falha ao parar auto attack pela hotkey", erro?.message || erro);
      }

      if (caveEstavaRodando || attackParado) {
        bot.log("hotkey " + hotkeyConfig.stopKey + " — cave e attack parados", { cave: caveEstavaRodando, attack: attackParado });
        showHotkeyToast("🛑 CaveBot + Attack parados (" + hotkeyConfig.stopKey + ")");
      }
      return;
    }

    if (e.key === hotkeyConfig.startKey) {
      e.preventDefault();
      const started = state.running ? true : start();

      // Liga o auto attack junto com o cave
      let attackIniciado = false;
      try {
        if (!bot.attack?.status?.().running) {
          bot.attack?.start?.();
          attackIniciado = true;
        }
      } catch (erro) {
        bot.log("falha ao iniciar auto attack pela hotkey", erro?.message || erro);
      }

      if (started) {
        bot.log("hotkey " + hotkeyConfig.startKey + " — cave e attack iniciados", { attack: attackIniciado });
        showHotkeyToast("▶️ CaveBot + Attack iniciados (" + hotkeyConfig.startKey + ")");
      } else {
        showHotkeyToast("⚠️ CaveBot sem waypoints" + (attackIniciado ? " (attack ligado)" : ""));
      }
      return;
    }
  }

  function installHotkey() {
    if (window.__caveHotkeyListener) {
      document.removeEventListener("keydown", window.__caveHotkeyListener, true);
    }
    window.__caveHotkeyListener = onCaveHotkey;
    document.addEventListener("keydown", onCaveHotkey, true);
    bot.log("cave hotkey instalado — stop:" + hotkeyConfig.stopKey + " | start:" + hotkeyConfig.startKey);
  }

  function uninstallHotkey() {
    if (window.__caveHotkeyListener) {
      document.removeEventListener("keydown", window.__caveHotkeyListener, true);
      window.__caveHotkeyListener = null;
    }
  }

  function updateHotkeyConfig(next = {}) {
    Object.assign(hotkeyConfig, next);
    persistHotkeyConfig();
    installHotkey();
    bot.log("cave hotkey config atualizado", { ...hotkeyConfig });
    return { ...hotkeyConfig };
  }

  installHotkey();

  startObserver();
  bot.addCleanup(stopObserver);
  startMinimapOverlay();
  bot.addCleanup(stopMinimapOverlay);
  bot.addCleanup(uninstallHotkey);

  if (config.enabled && route.length) start();

  // ── VIGIA DE RECONEXÃO ───────────────────────────────────────
  // Em vez de tentar adivinhar pelo estado interno da conexão,
  // captura direto a mensagem que o jogo já escreve no console
  // quando reconecta de verdade ("Reconnected to the gameserver.").
  if (!window.__caveReconnectHookInstalled) {
    window.__caveReconnectHookInstalled = true;
    const originalConsoleLog = console.log.bind(console);

    console.log = function (...args) {
      originalConsoleLog(...args);
      try {
        const texto = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
        if (texto.includes("Reconnected to the gameserver")) {
          window.dispatchEvent(new CustomEvent("minibia:reconnected"));
        }
      } catch (e) {
        // silencioso — não deixa o hook quebrar o console original
      }
    };
  }

  window.addEventListener("minibia:reconnected", function () {
    bot.log("cave reconnect detected (via console hook)");
    window.setTimeout(() => {
      if (route.length) {
        stop({ persistEnabled: false });
        const iniciou = start();
        bot.log("cave bot desativado e reativado após reconexão", { sucesso: iniciou });
      }
    }, 2000);
  });

  // ── Auto Record de Waypoints ─────────────────────────────────
  // Em vez de clicar "Add Waypoint" toda hora, liga isso e anda —
  // ele grava a rota sozinho enquanto você caminha (reaproveitando
  // o proximity skip que já existe, então não duplica pontos perto
  // um do outro).
  const autoRecordState = {
    recording: false,
    timerId: null,
  };

  function startAutoRecord(intervalMs = 600) {
    if (autoRecordState.recording) {
      bot.log("cave auto record already running");
      return false;
    }
    autoRecordState.recording = true;
    autoRecordState.timerId = window.setInterval(() => {
      addWaypointCurrentSpot();
    }, intervalMs);
    bot.log("cave auto record started");
    return true;
  }

  function stopAutoRecord() {
    if (autoRecordState.timerId != null) {
      window.clearInterval(autoRecordState.timerId);
      autoRecordState.timerId = null;
    }
    autoRecordState.recording = false;
    bot.log("cave auto record stopped");
    return true;
  }

  bot.addCleanup(stopAutoRecord);

  bot.cave = {
    start, stop, status, updateConfig, config,
    startAutoRecord, stopAutoRecord,
    isAutoRecording: () => autoRecordState.recording,
    hotkey: {
      updateConfig: updateHotkeyConfig,
      enable()  { hotkeyConfig.enabled = true;  persistHotkeyConfig(); bot.log("cave hotkey habilitado"); },
      disable() { hotkeyConfig.enabled = false; persistHotkeyConfig(); bot.log("cave hotkey desabilitado"); },
      status()  { return { ...hotkeyConfig }; },
    },
    getRoute, getTransitions, getPresetNames, getActivePresetName, getCurrentWaypoint,
    createPreset, savePreset, loadPreset, deletePreset, exportPresets, importPresets,
    addWaypoint, addWaypointCurrentSpot, addDelay, clearWaypoints, clearTransitions,
    removeLastWaypoint, setCurrentIndex, goToWaypoint, goToPosition, handleFloorChange,
    findClosestWaypointIndex, syncWaypointProgress, findRopeSource, findShovelSource,
    inspectNearbyTiles: (radius = 1) => {
      const position = normalizePosition(bot.getPlayerPosition());
      if (!position) return [];
      return getLoadedTiles()
        .map((tile) => ({ tile, position: getTilePosition(tile) }))
        .filter((entry) =>
          entry.position &&
          entry.position.z === position.z &&
          Math.abs(entry.position.x - position.x) <= radius &&
          Math.abs(entry.position.y - position.y) <= radius
        )
        .map((entry) => ({
          position: entry.position,
          isFloorChange: isFloorChangeTile(entry.tile),
          isHole: isHoleTile(entry.tile),
          isRopeTarget: isRopeTargetTile(entry.tile),
          isShovelTarget: isShovelTargetTile(entry.tile),
          names: getTileThings(entry.tile).map((thing) => getThingName(thing)).filter(Boolean),
        }));
    },
    isAtWaypoint,
  };
};


window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPanicModule = function installPanicModule(bot) {
  const configStorageKey = "minibiaBot.panic.config";
  const state = {
    running: false,
    timerId: null,
    lastHealth: null,
    lastTriggerAt: 0,
    lastDamageEventKey: null,
    pendingReturnOrigin: null,
    pendingReturnModules: null,
    returnNotBeforeAt: 0,
    lastThreatAt: 0,
    lastReturnAttemptAt: 0,
  };

  const config = Object.assign(
    {
      tickMs: 200,
      triggerCooldownMs: 500,
      returnToOriginEnabled: false,
      returnDelayMs: 4500,
      returnDelayJitterMs: 4500,
      returnRetryCooldownMs: 100,
      unknownPlayerEnabled: false,
      healthLossEnabled: false,
      trustedNames: [],
      gameMasterNames: [],
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizeDelayMs(value, fallback = 0) {
    const next = Math.trunc(Number(value));
    return Number.isFinite(next) ? Math.max(0, next) : fallback;
  }

  function normalizePosition(position) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    const z = Number(position?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return { x, y, z };
  }

  function isSamePosition(left, right) {
    return !!left && !!right && left.x === right.x && left.y === right.y && left.z === right.z;
  }

  function getTrustedNames() {
    return Array.from(
      new Set(
        (config.trustedNames || [])
          .map((name) => normalizeName(name))
          .filter(Boolean)
      )
    );
  }

  function getGameMasterNames() {
    return Array.from(
      new Set(
        (config.gameMasterNames || [])
          .map((name) => normalizeName(name))
          .filter(Boolean)
      )
    );
  }

  function getVisiblePlayers() {
    const me = bot.getPlayerPosition();
    const players = bot.xray?.getVisiblePlayers?.() || [];
    if (!me) {
      return players;
    }

    return players.filter((creature) => {
      const z = Number(creature?.__position?.z);
      return Number.isFinite(z) && Math.abs(z - me.z) <= 1;
    });
  }

  function getUnknownVisiblePlayers() {
    const trusted = new Set(getTrustedNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && !trusted.has(name);
    });
  }

  function getTrustedVisiblePlayers() {
    const trusted = new Set(getTrustedNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && trusted.has(name);
    });
  }

  function getVisibleGameMasters() {
    const gameMasters = new Set(getGameMasterNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && gameMasters.has(name);
    });
  }

  function getRecentChannelMessages() {
    return (window.gameClient?.interface?.channelManager?.channels || []).flatMap((channel) =>
      (channel?.__contents || []).map((entry) => ({
        channelName: channel?.name || null,
        message: String(entry?.message || ""),
        time: entry?.__time || null,
      }))
    );
  }

  function parseDamageMessage(entry) {
    const match = entry.message.match(
      /^You lose\s+(\d+)\s+hitpoints\s+due to an attack by\s+(.+?)\.$/i
    );

    if (!match) {
      return null;
    }

    return {
      amount: Number(match[1]),
      attackerName: match[2].trim(),
      time: entry.time,
      channelName: entry.channelName,
      key: `${entry.time || "no-time"}|${entry.message}`,
      message: entry.message,
    };
  }

  function getLatestDamageEvent() {
    const messages = getRecentChannelMessages()
      .map(parseDamageMessage)
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = a.time ? Date.parse(a.time) : 0;
        const bTime = b.time ? Date.parse(b.time) : 0;
        return bTime - aTime;
      });

    return messages[0] || null;
  }

  function getReturnDelayMs() {
    const baseDelayMs = normalizeDelayMs(config.returnDelayMs, 0);
    const jitterMs = normalizeDelayMs(config.returnDelayJitterMs, 0);
    if (!jitterMs) {
      return baseDelayMs;
    }

    const randomOffset = Math.floor(Math.random() * ((jitterMs * 2) + 1)) - jitterMs;
    return Math.max(0, baseDelayMs + randomOffset);
  }

  function clearPendingReturn() {
    state.pendingReturnOrigin = null;
    state.pendingReturnModules = null;
    state.returnNotBeforeAt = 0;
    state.lastThreatAt = 0;
    state.lastReturnAttemptAt = 0;
  }

  function snapshotInterruptedModules() {
    return {
      caveRunning: !!bot.cave?.status?.().running,
      equipRingRunning: !!bot.equipRing?.status?.().running,
    };
  }

  function armPendingReturn(now = Date.now(), origin = normalizePosition(bot.getPlayerPosition())) {
    if (!config.returnToOriginEnabled) {
      clearPendingReturn();
      return;
    }

    if (!state.pendingReturnOrigin && origin) {
      state.pendingReturnOrigin = origin;
      state.pendingReturnModules = snapshotInterruptedModules();
    }

    if (!state.pendingReturnOrigin) {
      return;
    }

    state.lastThreatAt = now;
    state.returnNotBeforeAt = now + getReturnDelayMs();
  }

  function isReturnCoastClear() {
    return !getVisibleGameMasters().length && !getUnknownVisiblePlayers().length;
  }

  function restoreInterruptedModules() {
    if (state.pendingReturnModules?.caveRunning) {
      bot.cave?.start?.();
    }

    if (state.pendingReturnModules?.equipRingRunning) {
      bot.equipRing?.start?.();
      bot.ui?.refreshEquipRingStatus?.();
    }
  }

  function tryReturnToOrigin(now = Date.now()) {
    if (!config.returnToOriginEnabled || !state.pendingReturnOrigin || !state.returnNotBeforeAt) {
      return false;
    }

    if (now < state.returnNotBeforeAt) {
      return false;
    }

    if (!isReturnCoastClear()) {
      return false;
    }

    if (now - state.lastReturnAttemptAt < normalizeDelayMs(config.returnRetryCooldownMs, 2000)) {
      return false;
    }

    const currentPosition = normalizePosition(bot.getPlayerPosition());
    if (isSamePosition(currentPosition, state.pendingReturnOrigin)) {
      bot.log("panic return completed", {
        origin: state.pendingReturnOrigin,
        threatAgeMs: now - state.lastThreatAt,
      });
      restoreInterruptedModules();
      clearPendingReturn();
      return true;
    }

    state.lastReturnAttemptAt = now;
    const moved =
      !!bot.cave?.goToPosition?.(state.pendingReturnOrigin) ||
      !!bot.pz?.goToTile?.({ __position: state.pendingReturnOrigin });

    if (moved) {
      bot.log("panic returning to origin", {
        origin: state.pendingReturnOrigin,
        threatAgeMs: now - state.lastThreatAt,
      });
      return true;
    }

    bot.log("panic return pathing failed", { origin: state.pendingReturnOrigin });
    return false;
  }

  function triggerPanic(reason, details = {}) {
    const now = Date.now();
    armPendingReturn(now);

    if (now - state.lastTriggerAt < config.triggerCooldownMs) {
      return false;
    }

    state.lastTriggerAt = now;
    bot.playAlarm?.();
    bot.log("panic triggered", { reason, ...details });

    if (bot.cave?.stop) {
      bot.cave.stop({ persistEnabled: false });
    }

    if (bot.equipRing?.stop) {
      bot.equipRing.stop({ persistEnabled: false });
      bot.ui?.refreshEquipRingStatus?.();
    }

    return !!bot.pz?.goToHomePz?.();
  }

  function triggerGameMasterKillSwitch(players) {
    const detectedPlayers = (players || []).map((player) => player?.name).filter(Boolean);

    bot.playAlarm?.();
    bot.log("game master kill switch triggered", { players: detectedPlayers });

    if (bot.rune?.stop) {
      bot.rune.stop();
    }

    if (bot.eat?.stop) {
      bot.eat.stop();
    }

    if (bot.invisible?.stop) {
      bot.invisible.stop();
    }

    if (bot.magicShield?.stop) {
      bot.magicShield.stop();
    }

    if (bot.cave?.stop) {
      bot.cave.stop();
    }

    if (bot.attack?.stop) {
      bot.attack.stop();
    }

    if (bot.equipRing?.stop) {
      bot.equipRing.stop();
    }

    clearPendingReturn();
    config.unknownPlayerEnabled = false;
    config.healthLossEnabled = false;
    persistConfig();
    stop();

    bot.ui?.refreshPanicStatus?.();
    bot.ui?.refreshRuneStatus?.();
    bot.ui?.refreshAutoEatStatus?.();
    bot.ui?.refreshAutoInvisibleStatus?.();
    bot.ui?.refreshAutoMagicShieldStatus?.();
    bot.ui?.refreshAutoAttackStatus?.();
    bot.ui?.refreshCaveStatus?.();
    bot.ui?.refreshEquipRingStatus?.();
    return true;
  }

  function checkGameMasters() {
    if (!getGameMasterNames().length) {
      return false;
    }

    const visibleGameMasters = getVisibleGameMasters();
    if (!visibleGameMasters.length) {
      return false;
    }

    return triggerGameMasterKillSwitch(visibleGameMasters);
  }

  function checkUnknownPlayers() {
    if (!config.unknownPlayerEnabled) {
      return false;
    }

    const unknownPlayers = getUnknownVisiblePlayers();
    if (!unknownPlayers.length) {
      return false;
    }

    return triggerPanic("unknown-player", {
      players: unknownPlayers.map((player) => player.name),
    });
  }

  function checkHealthLoss() {
    if (!config.healthLossEnabled) {
      return false;
    }

    const playerState = bot.getPlayerState();
    const currentHealth = Number(playerState?.health ?? 0);

    if (state.lastHealth == null) {
      state.lastHealth = currentHealth;
      return false;
    }

    const lostHealth = currentHealth < state.lastHealth;
    state.lastHealth = currentHealth;

    if (!lostHealth) {
      return false;
    }

    const latestDamageEvent = getLatestDamageEvent();
    if (latestDamageEvent && latestDamageEvent.key !== state.lastDamageEventKey) {
      state.lastDamageEventKey = latestDamageEvent.key;

      const trustedNames = new Set(getTrustedNames());
      const attackerName = normalizeName(latestDamageEvent.attackerName);

      if (attackerName && trustedNames.has(attackerName)) {
        bot.log("ignored health-loss panic because attacker is trusted", {
          attacker: latestDamageEvent.attackerName,
          amount: latestDamageEvent.amount,
          currentHealth,
        });
        return false;
      }

      return triggerPanic("health-loss", {
        currentHealth,
        attacker: latestDamageEvent.attackerName,
        amount: latestDamageEvent.amount,
      });
    }

    const unknownPlayers = getUnknownVisiblePlayers();
    if (!unknownPlayers.length) {
      const trustedPlayers = getTrustedVisiblePlayers();
      if (trustedPlayers.length) {
        bot.log("ignored health-loss panic because only trusted players are nearby", {
          players: trustedPlayers.map((player) => player.name),
          currentHealth,
        });
        return false;
      }
    }

    return triggerPanic("health-loss", { currentHealth });
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      const triggered = checkGameMasters() || checkUnknownPlayers() || checkHealthLoss();
      if (!triggered) {
        tryReturnToOrigin();
      }
    } finally {
      scheduleNextTick();
    }
  }

  function shouldRun() {
    return !!(getGameMasterNames().length || config.unknownPlayerEnabled || config.healthLossEnabled);
  }

  function start() {
    if (state.running) {
      return false;
    }

    state.running = true;
    state.lastHealth = Number(bot.getPlayerState()?.health ?? 0);
    state.lastDamageEventKey = getLatestDamageEvent()?.key || null;
    bot.log("panic runner started", { ...config });
    tick();
    return true;
  }

  function stop() {
    if (!state.running && state.timerId == null) {
      state.lastHealth = null;
      return false;
    }

    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    state.lastHealth = null;
    state.lastDamageEventKey = null;
    clearPendingReturn();
    bot.log("panic runner stopped");
    return true;
  }

  function syncRunningState() {
    if (shouldRun()) {
      start();
    } else {
      stop();
    }
  }

  function updateConfig(nextConfig = {}) {
    const next = { ...nextConfig };

    if (Array.isArray(next.trustedNames)) {
      next.trustedNames = next.trustedNames
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    if (Array.isArray(next.gameMasterNames)) {
      next.gameMasterNames = next.gameMasterNames
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    if ("triggerCooldownMs" in next) {
      next.triggerCooldownMs = normalizeDelayMs(next.triggerCooldownMs, config.triggerCooldownMs);
    }

    if ("returnDelayMs" in next) {
      next.returnDelayMs = normalizeDelayMs(next.returnDelayMs, config.returnDelayMs);
    }

    if ("returnDelayJitterMs" in next) {
      next.returnDelayJitterMs = normalizeDelayMs(next.returnDelayJitterMs, config.returnDelayJitterMs);
    }

    if ("returnRetryCooldownMs" in next) {
      next.returnRetryCooldownMs = normalizeDelayMs(
        next.returnRetryCooldownMs,
        config.returnRetryCooldownMs
      );
    }

    Object.assign(config, next);
    if (!config.returnToOriginEnabled) {
      clearPendingReturn();
    }
    persistConfig();
    syncRunningState();
    bot.log("panic runner config updated", { ...config });
    return { ...config };
  }

  function status() {
    return {
      running: state.running,
      config: {
        ...config,
        trustedNames: [...config.trustedNames],
        gameMasterNames: [...config.gameMasterNames],
      },
      visiblePlayers: getVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      unknownVisiblePlayers: getUnknownVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      trustedVisiblePlayers: getTrustedVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visibleGameMasters: getVisibleGameMasters().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      latestDamageEvent: getLatestDamageEvent(),
      lastTriggerAt: state.lastTriggerAt,
      pendingReturn: state.pendingReturnOrigin
        ? {
            origin: { ...state.pendingReturnOrigin },
            modules: state.pendingReturnModules ? { ...state.pendingReturnModules } : null,
            returnNotBeforeAt: state.returnNotBeforeAt,
            lastThreatAt: state.lastThreatAt,
            lastReturnAttemptAt: state.lastReturnAttemptAt,
            coastClear: isReturnCoastClear(),
          }
        : null,
    };
  }

  if (shouldRun()) {
    start();
  }

  bot.panic = {
    start,
    stop,
    status,
    updateConfig,
    getVisiblePlayers,
    getUnknownVisiblePlayers,
    getTrustedVisiblePlayers,
    getVisibleGameMasters,
    getTrustedNames,
    getGameMasterNames,
    config,
  };
};


window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installDropModule = function installDropModule(bot) {
  const configStorageKey = "minibiaBot.drop.config";

  const state = {
    running: false,
    timerId: null,
    totalDropped: 0,
  };

  const config = Object.assign(
    {
      tickMs: 1000,
      items: [], // [{ sid, name }]
      fixedPosition: null, // { x, y, z } ou null (usa posição atual)
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );

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

  function matchesList(item) {
    if (!item) return false;
    return config.items.some((entry) => entry.sid != null && item.sid === entry.sid);
  }

  function getGroundTile() {
    const pos = config.fixedPosition || bot.getPlayerPosition();
    if (!pos) return null;
    return window.gameClient?.world?.getTileFromWorldPosition?.(pos) || null;
  }

  function dropItemOnGround(container, slotIndex, item) {
    const groundTile = getGroundTile();
    if (!groundTile) {
      bot.log("drop: não achei o tile do chão");
      return false;
    }

    const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;

    try {
      window.gameClient.mouse.sendItemMove(
        { which: container, index: slotIndex },
        { which: groundTile, index: 0 },
        count
      );
      state.totalDropped += 1;
      bot.log("drop: item jogado no chão", { name: getItemName(item), sid: item.sid, count });
      return true;
    } catch (error) {
      bot.log("drop: erro ao jogar item", error?.message || error);
      return false;
    }
  }

  function checkAndDropItems() {
    let dropped = 0;
    getOpenContainers().forEach((container) => {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const item = container.getSlotItem?.(slotIndex) || slots[slotIndex]?.item;
        if (!item?.id) continue;
        if (!matchesList(item)) continue;
        if (dropItemOnGround(container, slotIndex, item)) dropped++;
      }
    });
    return dropped;
  }

  function tick() {
    if (!state.running) return;
    try {
      if (config.items.length > 0) checkAndDropItems();
    } catch (error) {
      bot.log("drop tick error", error?.message || error);
    } finally {
      state.timerId = window.setTimeout(tick, config.tickMs);
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) {
      bot.log("drop already running");
      return false;
    }
    state.running = true;
    bot.log("drop started", { items: config.items.length });
    tick();
    return true;
  }

  function stop(opts = {}) {
    state.running = false;
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    if (opts.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("drop stopped");
    return true;
  }

  function addItem(sid, name) {
    const sidNum = Number(sid);
    if (!Number.isFinite(sidNum) || sidNum <= 0) {
      bot.log("drop: SID inválido", { sid });
      return false;
    }
    config.items.push({ sid: sidNum, name: name || "" });
    persistConfig();
    bot.log("drop: item adicionado à lista", { sid: sidNum, name });
    return true;
  }

  function removeItem(index) {
    if (index < 0 || index >= config.items.length) return false;
    const removed = config.items.splice(index, 1)[0];
    persistConfig();
    bot.log("drop: item removido da lista", removed);
    return true;
  }

  function setFixedPosition(position) {
    const pos = position || bot.getPlayerPosition();
    if (!pos) {
      bot.log("drop: não consegui ler a posição");
      return false;
    }
    config.fixedPosition = { x: pos.x, y: pos.y, z: pos.z };
    persistConfig();
    bot.log("drop: posição fixa definida", config.fixedPosition);
    return true;
  }

  function clearFixedPosition() {
    config.fixedPosition = null;
    persistConfig();
    bot.log("drop: voltou a usar a posição atual");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config, items: config.items.map((i) => ({ ...i })) },
      totalDropped: state.totalDropped,
    };
  }

  function updateConfig(next = {}) {
    if ("tickMs" in next) next.tickMs = Math.max(200, Number(next.tickMs) || 1000);
    Object.assign(config, next);
    persistConfig();
    bot.log("drop config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.drop = {
    start, stop, addItem, removeItem, setFixedPosition, clearFixedPosition,
    status, updateConfig, config,
  };
};


  // Roda de fato as instalações, populando bot.attack, bot.cave, bot.panic, bot.drop
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPzModule = function installPzModule(bot) {
  const homeStorageKey = "minibiaBot.pz.home";

  function getLoadedTiles() {
    const chunks = window.gameClient?.world?.chunks || [];
    const tiles = [];

    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;

      for (const tile of chunk.tiles) {
        if (tile?.__position) {
          tiles.push(tile);
        }
      }
    }

    return tiles;
  }

  function hasPzFlag(tile) {
    return !!tile && ((tile.flags || 0) & 1) !== 0;
  }

  function getPzCandidates() {
    const me = bot.getPlayerPosition();
    if (!me) return [];

    return getLoadedTiles()
      .filter((tile) => hasPzFlag(tile) && tile.__position?.z === me.z)
      .map((tile) => {
        const p = tile.__position;
        return {
          tile,
          x: p.x,
          y: p.y,
          z: p.z,
          flags: tile.flags || 0,
          dist: Math.abs(p.x - me.x) + Math.abs(p.y - me.y),
        };
      })
      .sort((a, b) => a.dist - b.dist);
  }

  function goToTile(tile) {
    if (!tile?.__position) return false;

    const from = bot.getPlayerPosition();
    if (!from) return false;

    const p = tile.__position;
    const to = new Position(p.x, p.y, p.z);

    try {
      window.gameClient?.world?.pathfinder?.findPath?.(from, to);
      bot.log("pathing to", { x: p.x, y: p.y, z: p.z, flags: tile.flags });
      return true;
    } catch (error) {
      bot.log("pathing failed", { x: p.x, y: p.y, z: p.z, error: error?.message });
      return false;
    }
  }

  function goToNearestPz(maxAttempts = 20) {
    const candidates = getPzCandidates().slice(0, maxAttempts);

    if (!candidates.length) {
      bot.log("No PZ candidates found");
      return false;
    }

    for (const candidate of candidates) {
      if (goToTile(candidate.tile)) {
        bot.log("selected PZ", {
          x: candidate.x,
          y: candidate.y,
          z: candidate.z,
          flags: candidate.flags,
          dist: candidate.dist,
        });
        return true;
      }
    }

    bot.log("No PZ candidate accepted by pathfinder");
    return false;
  }

  function setHomePz(x, y, z) {
    const home = { x, y, z };
    bot.storage.set(homeStorageKey, home);
    bot.log("home PZ set", home);
    return home;
  }

  function setHomePzCurrentSpot() {
    const pos = bot.getPlayerPosition();
    if (!pos) {
      bot.log("Could not read current position");
      return null;
    }

    return setHomePz(pos.x, pos.y, pos.z);
  }

  function getHomePz() {
    return bot.storage.get(homeStorageKey, null);
  }

  function clearHomePz() {
    bot.storage.remove(homeStorageKey);
    bot.log("home PZ cleared");
  }

  function getNearestPzTo(x, y, z) {
    const candidates = getLoadedTiles()
      .filter((tile) => hasPzFlag(tile) && tile.__position?.z === z)
      .map((tile) => {
        const p = tile.__position;
        return {
          tile,
          x: p.x,
          y: p.y,
          z: p.z,
          flags: tile.flags || 0,
          dist: Math.abs(p.x - x) + Math.abs(p.y - y),
        };
      })
      .sort((a, b) => a.dist - b.dist);

    return candidates[0] || null;
  }

  function goToHomePz() {
    const home = getHomePz();
    if (!home) {
      bot.log("No home PZ set");
      return false;
    }

    const candidate = getNearestPzTo(home.x, home.y, home.z);
    if (!candidate) {
      bot.log("No loaded PZ found near saved home", home);
      return false;
    }

    bot.log("home candidate", {
      x: candidate.x,
      y: candidate.y,
      z: candidate.z,
      flags: candidate.flags,
      distFromHome: candidate.dist,
    });

    return goToTile(candidate.tile);
  }

  function printPzCandidates(limit = 10) {
    const rows = getPzCandidates()
      .slice(0, limit)
      .map((candidate) => ({
        x: candidate.x,
        y: candidate.y,
        z: candidate.z,
        flags: candidate.flags,
        dist: candidate.dist,
      }));

    console.table(rows);
    return rows;
  }

  bot.pz = {
    getLoadedTiles,
    getPzCandidates,
    goToTile,
    goToNearestPz,
    setHomePz,
    setHomePzCurrentSpot,
    getHomePz,
    clearHomePz,
    getNearestPzTo,
    goToHomePz,
    printPzCandidates,
  };

  bot.goToNearestPz = goToNearestPz;
  bot.setHomePz = setHomePz;
  bot.setHomePzCurrentSpot = setHomePzCurrentSpot;
  bot.getHomePz = getHomePz;
  bot.clearHomePz = clearHomePz;
  bot.goToHomePz = goToHomePz;
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installUHPlayerModule = function installUHPlayerModule(bot) {
  const configStorageKey = "minibiaBot.uhPlayer.config";

  const state = {
    running: false,
    timerId: null,
    lastRuneAt: 0,
  };

  const config = Object.assign(
    {
      targetName: "",
      maxHpPercent: 70,               // usa a runa de cura quando a vida do alvo estiver <= esse valor
      runeNamePattern: "ultimate healing rune", // texto/regex pra achar a runa pelo nome
      runeSid: null,                  // opcional: SID exato da runa (mais preciso que o nome)
      runeCid: null,                  // opcional: CID exato da runa
      cooldownMs: 1500,
      maxDistance: 8,                 // alcance máximo pra considerar o alvo "visível"
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function getMyPosition() {
    return bot.getPlayerPosition();
  }

  function getDistance(from, to) {
    if (!from || !to || from.z !== to.z) return Infinity;
    return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
  }

  function findTargetPlayer() {
    const targetName = normalizeName(config.targetName);
    if (!targetName) return null;

    const myId = window.gameClient?.player?.id;
    const creature = Object.values(window.gameClient?.world?.activeCreatures || {}).find((c) => {
      return c && c.id !== myId && c.type === 0 && normalizeName(c.name) === targetName;
    });

    if (!creature) return null;

    const me = getMyPosition();
    const pos = creature.__position;
    if (me && pos && getDistance(me, pos) > Math.max(1, Number(config.maxDistance) || 8)) {
      return null; // achou, mas está fora do alcance configurado
    }

    return creature;
  }

  function readHpPercent(creature) {
    if (!creature) return null;
    const hp = Number(creature.health ?? creature.hp ?? creature.state?.health);
    const max = Number(creature.maxHealth ?? creature.maxHp ?? creature.state?.maxHealth);
    if (Number.isFinite(hp) && Number.isFinite(max) && max > 0) return (hp / max) * 100;
    const pct = Number(creature.healthPercent ?? creature.hpPercent ?? creature.state?.healthPercent);
    return Number.isFinite(pct) ? pct : null;
  }

  // ── Encontrar a runa de cura dentro da backpack ─────────────
  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDefinition(item) {
    if (!item) return null;
    return (
      window.gameClient?.itemDefinitionsByCid?.[item.cid ?? item.id] ||
      window.gameClient?.itemDefinitionsBySid?.[item.sid] ||
      window.gameClient?.itemDefinitions?.[item.id] ||
      null
    );
  }

  function getItemName(item) {
    return String(getItemDefinition(item)?.properties?.name || item?.name || "");
  }

  function isHealRuneItem(item) {
    if (!item) return false;

    if (config.runeSid != null && item.sid === config.runeSid) return true;
    if (config.runeCid != null && item.cid === config.runeCid) return true;
    if (config.runeSid != null || config.runeCid != null) return false; // se configurou SID/CID, não cai pro nome

    const pattern = config.runeNamePattern || "ultimate healing rune";
    try {
      const regex = new RegExp(pattern, "i");
      return regex.test(getItemName(item));
    } catch {
      return getItemName(item).toLowerCase().includes(pattern.toLowerCase());
    }
  }

  function findHealRuneSource() {
    let best = null;
    let bestCount = -1;

    const consider = (container, slotIndex, item) => {
      if (!isHealRuneItem(item)) return;
      const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
      if (count > bestCount) {
        bestCount = count;
        best = { container, slotIndex, item, count, name: getItemName(item) };
      }
    };

    getOpenContainers().forEach((container) => {
      (container?.slots || []).forEach((slot, slotIndex) => {
        consider(container, slotIndex, container.getSlotItem?.(slotIndex));
      });
    });

    return best;
  }

  // ── Usar a runa de cura direto no jogador ────────────────────
  function useHealRuneOnCreature(source, creature) {
    try {
      window.gameClient?.mouse?.__handleItemUseWith?.(
        { which: source.container, index: source.slotIndex },
        { which: creature, index: 0xFF }
      );
      state.lastRuneAt = Date.now();
      bot.log("UH Player: runa de cura usada", { target: creature.name, rune: source.name });
      return true;
    } catch (error) {
      bot.log("UH Player: erro ao usar runa de cura", error?.message || error);
      return false;
    }
  }

  function tryHeal() {
    if (!config.enabled) return false;

    const now = Date.now();
    const creature = findTargetPlayer();
    if (!creature) return false;

    const hpPercent = readHpPercent(creature);
    if (hpPercent == null || hpPercent > Math.max(0, Math.min(100, Number(config.maxHpPercent) || 70))) {
      return false;
    }

    if (now - state.lastRuneAt < Math.max(0, Number(config.cooldownMs) || 1500)) {
      return false;
    }

    const source = findHealRuneSource();
    if (!source) {
      return false; // sem runa de cura na bag no momento
    }

    return useHealRuneOnCreature(source, creature);
  }

  function tick() {
    if (!state.running) return;
    try {
      tryHeal();
    } catch (error) {
      bot.log("UH Player tick error", error?.message || error);
    } finally {
      state.timerId = window.setTimeout(tick, 200);
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) {
      bot.log("UH Player already running");
      return false;
    }
    state.running = true;
    bot.log("UH Player started", { ...config });
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
    bot.log("UH Player stopped");
    return true;
  }

  function status() {
    const creature = findTargetPlayer();
    const source = findHealRuneSource();
    return {
      running: state.running,
      config: { ...config },
      targetFound: !!creature,
      targetHpPercent: readHpPercent(creature),
      runeAvailable: !!source,
      runeName: source?.name || null,
      lastRuneAt: state.lastRuneAt,
    };
  }

  function updateConfig(next = {}) {
    if ("targetName" in next) next.targetName = String(next.targetName || "").trim();
    if ("maxHpPercent" in next) next.maxHpPercent = Math.min(100, Math.max(0, Number(next.maxHpPercent) || 70));
    if ("runeNamePattern" in next) next.runeNamePattern = String(next.runeNamePattern || "ultimate healing rune").trim() || "ultimate healing rune";
    if ("runeSid" in next) next.runeSid = next.runeSid === "" || next.runeSid == null ? null : Number(next.runeSid);
    if ("runeCid" in next) next.runeCid = next.runeCid === "" || next.runeCid == null ? null : Number(next.runeCid);
    if ("cooldownMs" in next) next.cooldownMs = Math.max(0, Number(next.cooldownMs) || 1500);
    if ("maxDistance" in next) next.maxDistance = Math.max(1, Number(next.maxDistance) || 8);
    Object.assign(config, next);
    persistConfig();
    bot.log("UH Player config updated", { ...config });
    return { ...config };
  }

  if (config.enabled && config.targetName) start();

  bot.addCleanup?.(() => stop({ persistEnabled: false }));

  bot.uhPlayer = {
    start, stop, status, updateConfig, tryHeal, findTargetPlayer, findHealRuneSource, config,
  };
};

  window.__minibiaBotBundle.installPzModule(bot);
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

  function ocultarMensagemNoDOM(remetente, mensagem) {
    try {
      const spans = document.querySelectorAll(".chat-message");
      for (const span of spans) {
        if (span.style.display === "none") continue;
        const spanMsg = span.getAttribute("data-message") || "";
        const spanName = (span.getAttribute("name") || "").trim();
        if (spanMsg === mensagem && spanName === remetente) {
          span.style.display = "none";
          break;
        }
      }
    } catch (erro) {
      bot.log("chatDetector erro ao esconder mensagem: " + erro?.message);
    }
  }

  function processarMensagem(msgObj, nomeCanal, ehHistorico) {
    const remetente = (msgObj.name || "Sistema").trim();
    const mensagem = msgObj.message || "";

    const souEuPreCheck = state.playerName ? remetente.toLowerCase() === state.playerName.toLowerCase() : false;
    const bateuVigiadoPreCheck = !souEuPreCheck && (config.termosVigiados || []).some((termo) =>
      mensagem.toLowerCase().includes(termo.toLowerCase())
    );

    // Termos vigiados têm prioridade sobre a lista de ignorados — se a
    // mensagem bater com um termo vigiado, ela nunca é bloqueada pelo
    // filtro de ignorados (ex: "human" deve passar mesmo numa mensagem
    // de combate que também contenha "attack").
    if (!bateuVigiadoPreCheck && deveIgnorar(mensagem, remetente)) {
      ocultarMensagemNoDOM(remetente, mensagem);
      return;
    }

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

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installTalkModule = function installTalkModule(bot) {
  const configStorageKey = "minibiaBot.talk.config";
  const legacyDefaultModels = ["gemini-3-pro-preview", "gemini-2.0-flash"];
  const defaultModel = "gemini-flash-latest";
  const defaultSystemPrompt =
    "You are a Tibia player in a live chat. Reply casually, lowercase, max 8 words. Always reply in the same language the other player used (Portuguese in, Portuguese out). Plain text only, no quotes. Never say you are a bot or AI.";
  const defaultGreetingPrompt =
    "Respond to greetings like a Tibia MMORPG player in chat. Be short, casual, friendly, and in-character for fast Tibia-style game chat. Use lowercase. One sentence only. Plain text only.";
  const defaultQuestionPrompt =
    "Respond to questions like a Tibia MMORPG player in chat, but stay vague and noncommittal. Keep it brief, casual, and a little evasive. Use lowercase and do not explain much. One short sentence only. Plain text only. If asked whether you are a bot, reply with no.";
  const defaultStatementPrompt =
    "Respond to statements like a Tibia MMORPG player in chat. Keep it short, casual, reactive, and natural for live Tibia-style game chat. Use lowercase. One sentence only. Plain text only.";
  const minPollMs = 1000;
  const maxMessageAgeMs = 2 * 60 * 1000;
  const state = {
    running: false,
    pending: false,
    timerId: null,
    lastReplyAt: 0,
    seenKeys: [],
    seenSignatures: [],
  };
  const greetingReplies = ["yo", "sup", "hey", "hiya", "yo lol"];
  const agreeReplies = ["true", "fr", "based", "ya", "real"];
  const vagueQuestionReplies = ["maybe", "not sure", "hard to say", "could be"];
  const denyBotReplies = ["no", "nope", "nah"];

  const configStoredKey = ""; // API Key vazia — carregue manualmente na aba Talk
  
  const defaultConfig = {
    enabled: false,
    apiKey: configStoredKey,
    model: defaultModel,
    pollMs: minPollMs,
    replyCooldownMs: 1500,
    systemPrompt: defaultSystemPrompt,
    greetingPrompt: defaultGreetingPrompt,
    questionPrompt: defaultQuestionPrompt,
    statementPrompt: defaultStatementPrompt,
  };
  
  // Merge: usa o que estiver salvo no localStorage; Talk sempre começa DESLIGADO
  const storedConfig = bot.storage.get(configStorageKey, {});
  const config = Object.assign(
    {},
    defaultConfig,
    storedConfig,
    { enabled: false }
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function sanitizeConfig() {
    config.apiKey = String(config.apiKey || "").trim();
    config.model = String(config.model || defaultModel).trim() || defaultModel;
    if (legacyDefaultModels.includes(config.model)) {
      config.model = defaultModel;
    }
    config.pollMs = Math.max(minPollMs, Number(config.pollMs) || minPollMs);
    config.replyCooldownMs = Math.max(0, Number(config.replyCooldownMs) || 1500);
    config.systemPrompt = String(config.systemPrompt || defaultSystemPrompt).trim() || defaultSystemPrompt;
    config.greetingPrompt = String(config.greetingPrompt || defaultGreetingPrompt).trim() || defaultGreetingPrompt;
    config.questionPrompt = String(config.questionPrompt || defaultQuestionPrompt).trim() || defaultQuestionPrompt;
    config.statementPrompt = String(config.statementPrompt || defaultStatementPrompt).trim() || defaultStatementPrompt;
  }

  function trimSeen() {
    const maxSeenEntries = 200;
    if (state.seenKeys.length > maxSeenEntries) {
      state.seenKeys = state.seenKeys.slice(-maxSeenEntries);
    }

    if (state.seenSignatures.length > maxSeenEntries) {
      state.seenSignatures = state.seenSignatures.slice(-maxSeenEntries);
    }
  }

  function getSelfNames() {
    return new Set(
      ["you", bot.getPlayerName?.(), window.gameClient?.player?.name, window.gameClient?.player?.state?.name]
        .map((name) => normalizeText(name))
        .filter(Boolean)
    );
  }

  function extractSenderFromMessage(message) {
    const text = String(message || "").trim();
    if (!text) {
      return { sender: null, body: "" };
    }

    const patterns = [
      /^\[[^\]]+\]\s*([^:\n]{2,40}):\s+(.+)$/i,
      /^([^:\n]{2,40}):\s+(.+)$/i,
      /^([^:\n]{2,40})\s+says:\s+(.+)$/i,
      /^From\s+([^:\n]{2,40}):\s+(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          sender: String(match[1] || "").trim() || null,
          body: String(match[2] || "").trim(),
        };
      }
    }

    return { sender: null, body: text };
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
    const parsed = extractSenderFromMessage(rawMessage);
    const sender =
      String(entry?.author || entry?.sender || entry?.name || parsed.sender || "").trim() || null;
    const body = String(entry?.text || parsed.body || rawMessage).trim();
    const time = entry?.__time || entry?.time || null;
    const senderType = entry?.type;
    const key = [
      rawEntry?.channelName || "",
      time || "",
      sender || "",
      rawMessage || "",
      rawEntry?.index || 0,
    ].join("|");

    return {
      key,
      channelName: rawEntry?.channelName || null,
      sender,
      body,
      rawMessage,
      time,
      senderType,
    };
  }

  function getChatMessages() {
    return getRawChatEntries().map(toChatMessage).filter((message) => message.body);
  }

  function getMessageTimestamp(message) {
    const rawTime = message?.time;
    if (typeof rawTime === "number" && Number.isFinite(rawTime)) {
      return rawTime < 1e12 ? rawTime * 1000 : rawTime;
    }

    if (rawTime instanceof Date) {
      return rawTime.getTime();
    }

    const parsed = Date.parse(String(rawTime || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getMessageSignature(message) {
    return [
      normalizeText(message?.channelName),
      normalizeText(message?.sender),
      normalizeText(message?.body || message?.rawMessage),
      String(getMessageTimestamp(message) || ""),
    ].join("|");
  }

  function hasSeenMessage(message) {
    return state.seenKeys.includes(message?.key) || state.seenSignatures.includes(getMessageSignature(message));
  }

  function rememberSeenMessage(message) {
    if (!message) {
      return;
    }

    if (message.key && !state.seenKeys.includes(message.key)) {
      state.seenKeys.push(message.key);
    }

    const signature = getMessageSignature(message);
    if (signature && !state.seenSignatures.includes(signature)) {
      state.seenSignatures.push(signature);
    }

    trimSeen();
  }

  function rememberSeenMessages(messages) {
    messages.forEach((message) => rememberSeenMessage(message));
  }

  function isSelfMessage(message) {
    if (getSelfNames().has(normalizeText(message?.sender))) {
      return true;
    }

    return [message?.body, message?.rawMessage].some((text) => bot.isRecentSentChat?.(text, 20000));
  }

  function isTrustedSender(message) {
    const senderName = normalizeText(message?.sender);
    if (!senderName) {
      return false;
    }

    const trustedNames = bot.panic?.getTrustedNames?.() || [];
    return trustedNames.includes(senderName);
  }

  function isNpcMessage(message) {
    const npcType = window.CONST?.TYPES?.NPC;
    return npcType != null && message?.senderType === npcType;
  }

  function isWithinVisibleRange(me, pos) {
    if (!me || !pos) {
      return false;
    }

    const dx = Math.abs(pos.x - me.x);
    const dy = Math.abs(pos.y - me.y);
    return dx <= 8 && dy <= 6;
  }

  function isSenderVisiblePlayer(message) {
    const me = bot.getPlayerPosition?.();
    const myId = window.gameClient?.player?.id;
    const senderName = normalizeText(message?.sender);
    const playerType = window.CONST?.TYPES?.PLAYER;

    if (!me || !senderName || playerType == null) {
      return false;
    }

    return Object.values(window.gameClient?.world?.activeCreatures || {}).some((creature) => {
      if (!creature) {
        return false;
      }

      if (creature.id === myId || creature.type !== playerType) {
        return false;
      }

      if (normalizeText(creature.name) !== senderName) {
        return false;
      }

      return isWithinVisibleRange(me, creature.__position);
    });
  }

  function getDefaultMessages() {
    return getChatMessages().filter((message) => message.channelName === "Default");
  }

  function getNewestPendingMessage() {
    const pendingMessages = getDefaultMessages().filter((message) => {
      if (!message?.body || !message?.key) {
        return false;
      }

      if (hasSeenMessage(message)) {
        return false;
      }

      if (!message.sender || isSelfMessage(message) || isNpcMessage(message) || isTrustedSender(message)) {
        rememberSeenMessage(message);
        return false;
      }

      const timestamp = getMessageTimestamp(message);
      if (timestamp && Date.now() - timestamp > maxMessageAgeMs) {
        rememberSeenMessage(message);
        return false;
      }

      return true;
    });

    if (!pendingMessages.length) {
      return null;
    }

    return {
      targetMessage: pendingMessages[pendingMessages.length - 1],
      pendingMessages,
    };
  }

  function buildClassifierPrompt(targetMessage, contextMessages) {
    const transcript = contextMessages
      .map((message) => `${message.sender || "player"}: ${message.body}`)
      .join("\n");

    return [
      "Channel: Default",
      "Recent chat:",
      transcript || "(none)",
      "",
      `Last message from ${targetMessage.sender}: ${targetMessage.body}`,
      "Classify the last message as exactly one label:",
      "greeting",
      "question",
      "statement",
      "Reply with the label only.",
    ].join("\n");
  }

  function getTypePrompt(messageType) {
    if (messageType === "greeting") {
      return config.greetingPrompt;
    }

    if (messageType === "question") {
      return config.questionPrompt;
    }

    return config.statementPrompt;
  }

  function buildReplyPrompt(targetMessage, contextMessages, messageType) {
    const transcript = contextMessages
      .map((message) => `${isSelfMessage(message) ? "you" : (message.sender || "player")}: ${message.body}`)
      .join("\n");

    return [
      config.systemPrompt,
      getTypePrompt(messageType),
      "",
      "Channel: Default",
      `Message type: ${messageType}`,
      "Recent chat (lines marked 'you:' are your own previous replies):",
      transcript || "(none)",
      "",
      `Last message from ${targetMessage.sender}: ${targetMessage.body}`,
      "Reply in the SAME language the other person used. If they wrote in Portuguese, reply in Portuguese.",
      "Continue the conversation naturally: react to what was actually said, and do not repeat any of your previous 'you:' lines.",
      "Reply with one short sentence only.",
      "Reply text only:",
    ].join("\n");
  }

  async function generateText(prompt, generationConfig = {}) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: Object.assign(
            {
              temperature: 0.9,
              topP: 0.95,
              maxOutputTokens: 800,
            },
            generationConfig
          ),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return (
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => String(part?.text || ""))
        .join(" ")
        .trim() || ""
    );
  }

  async function classifyMessageType(targetMessage, contextMessages) {
    const rawType = normalizeText(
      await generateText(buildClassifierPrompt(targetMessage, contextMessages), {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 500,
      })
    );

    if (rawType === "greeting" || rawType === "question" || rawType === "statement") {
      return rawType;
    }

    if (isGreeting(targetMessage?.body)) {
      return "greeting";
    }

    if (/\?/.test(String(targetMessage?.body || ""))) {
      return "question";
    }

    return "statement";
  }

  function sanitizeReply(text) {
    const singleLine = String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();

    if (!singleLine) {
      return "";
    }

    const firstSentence = singleLine.split(/(?<=[.!?])\s+/)[0] || singleLine;
    const trimmed = firstSentence.slice(0, 90).trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed === "?") {
      return bot.isRecentSentChat?.("?", 20000) ? "" : "?";
    }

    const styled = trimmed
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\bi am\b/g, "im")
      .replace(/\byou are\b/g, "youre")
      .replace(/\bdo not\b/g, "dont")
      .replace(/\bcannot\b/g, "cant")
      .replace(/\bgoing to\b/g, "gonna")
      .replace(/\bwant to\b/g, "wanna")
      .replace(/\s+([,.!?])/g, "$1")
      .replace(/([!?.,]){2,}/g, "$1")
      .trim();

    const normalized = normalizeText(styled);
    if (!normalized || /^[^a-z0-9]+$/i.test(styled)) {
      return "";
    }

    if (/\b(bot|ai|assistant|language model|automation|script)\b/i.test(styled)) {
      return "";
    }

    if (bot.isRecentSentChat?.(styled, 20000)) {
      return "";
    }

    return styled;
  }

  function pickUnusedReply(replies, withinMs = 30000, fallback = "?") {
    for (const reply of replies) {
      if (!bot.isRecentSentChat?.(reply, withinMs)) {
        return reply;
      }
    }

    return fallback;
  }

  function isGreeting(text) {
    return /^(hi|hey|yo|sup|howdy|hello|hiya)\b/i.test(String(text || "").trim());
  }

  function isBotQuestion(text) {
    return /\b(are you|u)\b.*\bbot\b|\bbot\b.*\?|\bare you a bot\b/i.test(String(text || ""));
  }

  function isSimpleReaction(text) {
    return /^(based|true|real|lol|lmao|xd|nice|ok|kk|k)\b[!.?]*$/i.test(String(text || "").trim());
  }

  function pickFallbackReply(targetMessage, messageType) {
    const messageText = String(targetMessage?.body || "").trim();

    if (isBotQuestion(messageText)) {
      return pickUnusedReply(denyBotReplies, 30000, "no");
    }

    if (messageType === "greeting" || isGreeting(messageText)) {
      return pickUnusedReply(greetingReplies, 15000, "yo");
    }

    if (isSimpleReaction(messageText)) {
      return pickUnusedReply(agreeReplies, 15000, "true");
    }

    if (messageType === "question" || /\?$/.test(messageText)) {
      return pickUnusedReply(vagueQuestionReplies, 20000, "maybe");
    }

    return pickUnusedReply(["lol", "maybe", "ya", "true", "kinda"], 30000, "lol");
  }

  async function maybeRespond() {
    if (!state.running || state.pending || !config.enabled || !config.apiKey) {
      return false;
    }

    if (Date.now() - state.lastReplyAt < config.replyCooldownMs) {
      return false;
    }

    const pending = getNewestPendingMessage();
    if (!pending?.targetMessage) {
      return false;
    }

    state.pending = true;

    try {
      const contextMessages = getDefaultMessages().slice(-12);
      if (!isSenderVisiblePlayer(pending.targetMessage)) {
        rememberSeenMessages(pending.pendingMessages);
        bot.log("talk skipped reply", {
          sender: pending.targetMessage.sender,
          message: pending.targetMessage.body,
          reason: "sender-not-visible",
        });
        return false;
      }

      const messageType = await classifyMessageType(pending.targetMessage, contextMessages);
      const rawReply = isBotQuestion(pending.targetMessage.body)
        ? "no"
        : await generateText(buildReplyPrompt(pending.targetMessage, contextMessages, messageType));
      const reply = sanitizeReply(rawReply) || pickFallbackReply(pending.targetMessage, messageType);

      rememberSeenMessages(pending.pendingMessages);

      if (!reply) {
        bot.log("talk skipped reply", {
          sender: pending.targetMessage.sender,
          message: pending.targetMessage.body,
          messageType,
          rawReply,
        });
        return false;
      }

      const sent = bot.sendChat(reply);
      if (sent) {
        state.lastReplyAt = Date.now();
        bot.log("talk replied", {
          sender: pending.targetMessage.sender,
          message: pending.targetMessage.body,
          messageType,
          reply,
        });
      }

      return sent;
    } finally {
      state.pending = false;
    }
  }

  function scheduleNextTick() {
    if (!state.running) {
      return;
    }

    state.timerId = window.setTimeout(async () => {
      try {
        await maybeRespond();
      } catch (error) {
        bot.log("talk request failed", error?.message || error);
      }

      scheduleNextTick();
    }, config.pollMs);
  }

  function seedSeenMessages() {
    rememberSeenMessages(getDefaultMessages());
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    sanitizeConfig();
    persistConfig();

    if (!config.apiKey) {
      bot.log("Talk: sem API Key — configure na aba Talk antes de iniciar");
      showHotkeyToast?.("⚠️ Configure a API Key na aba Talk");
      return false;
    }

    if (state.running) {
      return false;
    }

    state.running = true;
    seedSeenMessages();
    bot.log("talk module started", {
      model: config.model,
      channel: "Default",
    });
    scheduleNextTick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    return true;
  }

  function status() {
    return {
      running: state.running,
      pending: state.pending,
      lastReplyAt: state.lastReplyAt,
      config: {
        ...config,
        apiKey: config.apiKey ? "***configured***" : "",
      },
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    sanitizeConfig();
    persistConfig();
    return status().config;
  }

  sanitizeConfig();
  persistConfig(); // Força guardar a chave no localStorage
  
  // 🔧 Debug: Log se a chave foi carregada
  console.log("[Talk Module] API Key loaded:", config.apiKey ? "✅ YES" : "❌ NO");
  console.log("[Talk Module] API Key:", config.apiKey ? "✅ configurada" : "⚠ vazia — configure na aba Talk");

  if (config.enabled && config.apiKey) {
    start();
  }

  bot.talk = {
    start,
    stop,
    status,
    updateConfig,
    getChatMessages,
    maybeRespond,
    config,
  };
};
  window.__minibiaBotBundle.installUHPlayerModule(bot);
  window.__minibiaBotBundle.installChatdetectorModule(bot);
  window.__minibiaBotBundle.installAutoAttackModule(bot);
  window.__minibiaBotBundle.installCaveModule(bot);
  window.__minibiaBotBundle.installPanicModule(bot);
  window.__minibiaBotBundle.installDropModule(bot);
  
  // ✅ Força usar a API Key do script, limpa localStorage se vazio
  const talkStorageKey = "minibiaBot.talk.config";
  const savedTalk = bot.storage.get(talkStorageKey, {});
  if (!savedTalk.apiKey) {
    bot.storage.remove(talkStorageKey); // Remove entrada inválida
  }
  
  window.__minibiaBotBundle.installTalkModule(bot);

  // Aliases pra o panic.js conseguir integrar com os módulos já existentes no painel
  bot.rune = Rune;
  bot.eat = Eat;
  bot.invisible = Invisible;
  bot.magicShield = MagicShield;
  bot.equipRing = Ring;

  // ===== PAINEL ÚNICO COM ABAS =====
  // panelEl, bodyEl, tabsEl declarados no topo do arquivo (evita erro de
  // "acesso antes da inicialização" quando um módulo já vem com enabled:true
  // salvo e tenta chamar updatePanel() antes do painel existir de fato)
  const tabs = [
    { id: "heal", label: "Heal" },
    { id: "attack", label: "Attack" },
    { id: "cave", label: "Cave" },
    { id: "rune", label: "Rune" },
    { id: "ring", label: "Ring" },
    { id: "haste", label: "Haste" },
    { id: "eat", label: "Eat" },
    { id: "monk", label: "Monk" },
    { id: "stones", label: "Stones" },
    { id: "panic", label: "Panic" },
    { id: "invisible", label: "Invis" },
    { id: "magicshield", label: "MShield" },
    { id: "follow", label: "Follow" },
    { id: "friendheal", label: "FrHeal" },
    { id: "lasttarget", label: "LastTgt" },
    { id: "uhplayer", label: "UH Player" },
    { id: "gmpanic", label: "GM Panic" },
    { id: "drop", label: "Drop" },
    { id: "pz", label: "PZ" },
    { id: "talk", label: "Talk" },
    { id: "chat", label: "Chat" },
    { id: "fire", label: "Fire" },
    { id: "misc", label: "Misc" },
    { id: "profiles", label: "Profiles" },
  ];
  let activeTab = "talk";

  function el(tag, style, text) {
    const e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (text != null) e.textContent = text;
    return e;
  }

  function makeToggleButton(module, label) {
    const btn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff; margin-top:6px;");
    function refresh() {
      btn.textContent = module.running ? "Stop " + label : "Start " + label;
      btn.style.background = module.running ? "#a33" : "#2d7a2d";
    }
    btn.onclick = () => { module.running ? module.stop() : module.start(); refresh(); };
    refresh();
    btn.dataset.refreshable = "1";
    btn._refresh = refresh;
    return btn;
  }

  function makeField(labelText, value, onChange, type = "text") {
    const wrap = el("div", "margin-bottom:6px;");
    wrap.appendChild(el("div", "color:#999; font-size:10px; margin-bottom:2px;", labelText));
    const input = el("input", "width:100%; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee; box-sizing:border-box;");
    input.type = type;
    input.value = value ?? "";
    input.onchange = () => onChange(input.value);
    wrap.appendChild(input);
    return wrap;
  }

  function makeSelect(labelText, options, selectedValue, onChange) {
    const wrap = el("div", "margin-bottom:6px;");
    wrap.appendChild(el("div", "color:#999; font-size:10px; margin-bottom:2px;", labelText));
    const select = el("select", "width:100%; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee; box-sizing:border-box;");
    options.forEach((opt) => {
      const o = el("option", null, opt);
      o.value = opt;
      if (opt === selectedValue) o.selected = true;
      select.appendChild(o);
    });
    select.onchange = () => onChange(select.value);
    wrap.appendChild(select);
    return wrap;
  }

  function buildRuneTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Palavras da runa", Rune.config.runeSpellWords, (v) => { Rune.config.runeSpellWords = v.trim(); }));
    wrap.appendChild(makeField("Mana mín.", Rune.config.runeManaMin, (v) => { Rune.config.runeManaMin = Number(v) || 0; }, "number"));
    wrap.appendChild(makeField("Mana máx.", Rune.config.runeManaMax, (v) => { Rune.config.runeManaMax = Number(v) || 0; }, "number"));
    wrap.appendChild(makeField("HP mínimo (%)", Rune.config.minHpPercent, (v) => { Rune.config.minHpPercent = Number(v) || 0; }, "number"));
    wrap.appendChild(makeField("Cooldown (ms)", Rune.config.runeCooldownMs, (v) => { Rune.config.runeCooldownMs = Number(v) || 3500; }, "number"));
    wrap.appendChild(makeToggleButton(Rune, "Rune"));
    return wrap;
  }

  function buildHasteTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Palavras", Haste.config.spellwords, (v) => { Haste.config.spellwords = v.trim(); }));
    wrap.appendChild(makeToggleButton(Haste, "Haste"));
    return wrap;
  }

  function buildEatTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Slot da hotbar", Eat.config.eatHotbarSlot, (v) => { Eat.config.eatHotbarSlot = Number(v) || 10; }, "number"));
    wrap.appendChild(makeField("Cooldown (ms)", Eat.config.eatCooldownMs, (v) => { Eat.config.eatCooldownMs = Number(v) || 6000; }, "number"));
    wrap.appendChild(makeToggleButton(Eat, "Eat"));
    return wrap;
  }

  function buildRingTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Cooldown (ms)", Ring.config.equipCooldownMs, (v) => { Ring.config.equipCooldownMs = Number(v) || 1500; }, "number"));
    wrap.appendChild(makeToggleButton(Ring, "Ring"));
    return wrap;
  }

  function buildMonkTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Nome do monstro", Monk.config.monsterName, (v) => { Monk.config.monsterName = v.trim(); }));
    wrap.appendChild(makeField("Palavras da magia", Monk.config.spellWords, (v) => { Monk.config.spellWords = v.trim(); }));
    wrap.appendChild(makeField("Cooldown (ms)", Monk.config.cooldownMs, (v) => { Monk.config.cooldownMs = Number(v) || 4000; }, "number"));
    const countEl = el("div", "color:#9c9; font-size:11px; margin-bottom:6px;", "Conjurações: 0");
    countEl.dataset.monkCount = "1";
    wrap.appendChild(countEl);
    wrap.appendChild(makeToggleButton(Monk, "Monk"));
    return wrap;
  }

  function buildStonesTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Slot da mão", Stones.config.handSlot, (v) => { Stones.config.handSlot = Number(v) || 5; }, "number"));
    wrap.appendChild(makeField("SID da pedra", Stones.config.stoneSid, (v) => { Stones.config.stoneSid = Number(v) || 0; }, "number"));
    wrap.appendChild(makeField("CID da pedra", Stones.config.stoneCid, (v) => { Stones.config.stoneCid = Number(v) || 0; }, "number"));
    const countEl = el("div", "color:#9c9; font-size:11px; margin-bottom:6px;", "Pedras movidas: 0");
    countEl.dataset.stonesCount = "1";
    wrap.appendChild(countEl);
    wrap.appendChild(makeToggleButton(Stones, "Stones"));
    return wrap;
  }

  function buildPanicTab() {
    const wrap = el("div");
    const statusEl = el("div", "margin-bottom:8px; font-size:11px;", Panic.status);
    statusEl.dataset.panicStatus = "1";
    wrap.appendChild(statusEl);

    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin-bottom:3px;", "Amigos:"));
    const friendListEl = el("div", "max-height:70px; overflow-y:auto; margin-bottom:6px; background:#111; border-radius:4px; padding:4px;");
    wrap.appendChild(friendListEl);

    const friendRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const friendInput = el("input", "flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee;");
    friendInput.placeholder = "nome do jogador";
    friendInput.onkeydown = (e) => { if (e.key === "Enter") { Panic.addFriend(friendInput.value); friendInput.value = ""; renderFriendList(friendListEl); } };
    const addBtn = el("button", "padding:4px 8px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer;", "+");
    addBtn.onclick = () => { Panic.addFriend(friendInput.value); friendInput.value = ""; renderFriendList(friendListEl); };
    friendRow.appendChild(friendInput);
    friendRow.appendChild(addBtn);
    wrap.appendChild(friendRow);

    renderFriendList(friendListEl);

    wrap.appendChild(makeSelect("Direção pra fugir", Panic.DIRECTION_OPTIONS, Panic.config.runDirLabel, (v) => { Panic.config.runDirLabel = v; }));
    wrap.appendChild(makeSelect("Direção pra voltar", Panic.DIRECTION_OPTIONS, Panic.config.returnDirLabel, (v) => { Panic.config.returnDirLabel = v; }));
    wrap.appendChild(makeField("Esperar pra voltar (s)", Panic.config.returnDelaySec, (v) => { Panic.config.returnDelaySec = Number(v) || 5; }, "number"));
    wrap.appendChild(makeField("Passos pra voltar", Panic.config.returnPresses, (v) => { Panic.config.returnPresses = Math.max(1, Number(v) || 1); }, "number"));

    wrap.appendChild(makeToggleButton(Panic, "Panic"));
    return wrap;
  }

  function renderFriendList(container) {
    container.innerHTML = "";
    if (!Panic.config.friends.length) {
      container.appendChild(el("div", "color:#666; font-style:italic;", "(nenhum amigo adicionado)"));
      return;
    }
    Panic.config.friends.forEach((name) => {
      const row = el("div", "display:flex; justify-content:space-between; align-items:center; padding:2px 0;");
      row.appendChild(el("span", null, name));
      const removeBtn = el("span", "color:#e77; cursor:pointer; padding:0 4px;", "✕");
      removeBtn.onclick = () => { Panic.removeFriend(name); renderFriendList(container); };
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
  }

  function buildHealTab() {
    const wrap = el("div");
    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin:4px 0 2px;", "HP nível 2 (forte, prioridade alta):"));
    wrap.appendChild(makeField("Limite HP (%)", Heal.config.hpThreshold2, (v) => { Heal.config.hpThreshold2 = Math.min(100, Math.max(0, Number(v) || 60)); }, "number"));
    wrap.appendChild(makeField("Slot hotbar", Heal.config.hpHotbarSlot2, (v) => { Heal.config.hpHotbarSlot2 = Number(v) || 2; }, "number"));
    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin:4px 0 2px;", "HP nível 1 (fraco):"));
    wrap.appendChild(makeField("Limite HP (%)", Heal.config.hpThreshold1, (v) => { Heal.config.hpThreshold1 = Math.min(100, Math.max(0, Number(v) || 90)); }, "number"));
    wrap.appendChild(makeField("Slot hotbar", Heal.config.hpHotbarSlot1, (v) => { Heal.config.hpHotbarSlot1 = Number(v) || 1; }, "number"));
    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin:4px 0 2px;", "Mana:"));
    wrap.appendChild(makeField("Limite mana (%)", Heal.config.manaThreshold, (v) => { Heal.config.manaThreshold = Math.min(100, Math.max(0, Number(v) || 50)); }, "number"));
    wrap.appendChild(makeField("Slot hotbar", Heal.config.manaHotbarSlot, (v) => { Heal.config.manaHotbarSlot = Number(v) || 3; }, "number"));
    wrap.appendChild(makeToggleButton(Heal, "Heal"));
    return wrap;
  }

  function buildInvisibleTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Palavras da magia", Invisible.config.spellWords, (v) => { Invisible.config.spellWords = v.trim(); }));
    wrap.appendChild(makeField("Cooldown (ms)", Invisible.config.recastCooldownMs, (v) => { Invisible.config.recastCooldownMs = Number(v) || 2000; }, "number"));
    wrap.appendChild(makeToggleButton(Invisible, "Invisible"));
    return wrap;
  }

  function buildMagicShieldTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Palavras da magia", MagicShield.config.spellWords, (v) => { MagicShield.config.spellWords = v.trim(); }));
    wrap.appendChild(makeField("Cooldown (ms)", MagicShield.config.recastCooldownMs, (v) => { MagicShield.config.recastCooldownMs = Number(v) || 2000; }, "number"));
    wrap.appendChild(makeToggleButton(MagicShield, "Magic Shield"));
    return wrap;
  }

  function buildFollowTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Nome do jogador", Follow.config.targetPlayerName, (v) => { Follow.config.targetPlayerName = v.trim(); }));
    wrap.appendChild(makeField("Distância (tiles)", Follow.config.followDistance, (v) => { Follow.config.followDistance = Math.max(0, Number(v) || 2); }, "number"));
    wrap.appendChild(makeField("Cooldown movimento (ms)", Follow.config.moveCooldownMs, (v) => { Follow.config.moveCooldownMs = Math.max(100, Number(v) || 400); }, "number"));
    wrap.appendChild(makeField("Perde alvo após (ms)", Follow.config.lostTargetMs, (v) => { Follow.config.lostTargetMs = Math.max(500, Number(v) || 5000); }, "number"));
    wrap.appendChild(makeToggleButton(Follow, "Follow"));
    return wrap;
  }

  function buildFriendHealTab() {
    const wrap = el("div");
    wrap.appendChild(makeField("Nome do jogador a curar", FriendHeal.config.targetName, (v) => { FriendHeal.config.targetName = v.trim(); }));
    wrap.appendChild(makeField("Palavras da magia", FriendHeal.config.spellWords, (v) => { FriendHeal.config.spellWords = v.trim(); }));
    wrap.appendChild(makeField("HP mínimo (%)", FriendHeal.config.minHpPercent, (v) => { FriendHeal.config.minHpPercent = Math.min(100, Math.max(0, Number(v) || 70)); }, "number"));
    wrap.appendChild(makeField("Cooldown (ms)", FriendHeal.config.healCooldownMs, (v) => { FriendHeal.config.healCooldownMs = Math.max(0, Number(v) || 1500); }, "number"));
    wrap.appendChild(makeToggleButton(FriendHeal, "Friend Heal"));
    return wrap;
  }

  function buildLastTargetTab() {
    const wrap = el("div");
    wrap.appendChild(el("div", "color:#999; font-size:11px; margin-bottom:8px;", "Reencontra e re-seleciona o último alvo automaticamente se ele sumir de vista."));
    wrap.appendChild(makeField("Margem pra reencontrar (ms)", LastTarget.config.graceMs, (v) => { LastTarget.config.graceMs = Math.max(0, Number(v) || 60000); }, "number"));
    wrap.appendChild(makeToggleButton(LastTarget, "Last Target"));
    return wrap;
  }

  function buildProfilesTab() {
    const wrap = el("div");
    const activeEl = el("div", "margin-bottom:8px; color:#9c9; font-size:11px;", "Ativo: " + (Profiles.getActiveName() || "nenhum"));
    wrap.appendChild(activeEl);

    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin-bottom:3px;", "Perfis salvos:"));
    const listEl2 = el("select", "width:100%; padding:4px; margin-bottom:8px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee; box-sizing:border-box;");
    function refreshList() {
      listEl2.innerHTML = "";
      const names = Profiles.list();
      if (!names.length) {
        listEl2.appendChild(el("option", null, "(nenhum perfil)"));
        listEl2.disabled = true;
      } else {
        listEl2.disabled = false;
        names.forEach((n) => { const o = el("option", null, n); o.value = n; listEl2.appendChild(o); });
      }
    }
    refreshList();
    wrap.appendChild(listEl2);

    const updateBtn = el("button", "width:100%; padding:6px; margin-bottom:8px; border:none; border-radius:4px; cursor:pointer; background:#2c4fc7; color:#fff; font-weight:bold;", "💾 Salvar alterações no perfil ativo");
    updateBtn.onclick = () => {
      const activeName = Profiles.getActiveName();
      if (!activeName) {
        alert("Nenhum perfil ativo no momento. Carrega um perfil primeiro, ou usa 'Salvar como novo perfil' abaixo.");
        return;
      }
      Profiles.save(activeName);
      refreshList();
      activeEl.textContent = "Ativo: " + (Profiles.getActiveName() || "nenhum");
      log("perfil atualizado:", activeName);
    };
    wrap.appendChild(updateBtn);

    wrap.appendChild(el("div", "border-top:1px solid #333; margin:4px 0 8px;"));

    const nameInput = el("input", "width:100%; margin-bottom:6px; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee; box-sizing:border-box;");
    nameInput.placeholder = "nome do novo perfil";
    wrap.appendChild(nameInput);

    const saveBtn = el("button", "width:100%; padding:6px; margin-bottom:6px; border:none; border-radius:4px; cursor:pointer; background:#2d7a2d; color:#fff; font-weight:bold;", "Salvar como novo perfil");
    saveBtn.onclick = () => {
      if (!nameInput.value.trim()) { alert("Digite um nome pro perfil."); return; }
      Profiles.save(nameInput.value.trim());
      nameInput.value = "";
      refreshList();
      activeEl.textContent = "Ativo: " + (Profiles.getActiveName() || "nenhum");
    };
    wrap.appendChild(saveBtn);

    const loadBtn = el("button", "width:100%; padding:6px; margin-bottom:6px; border:none; border-radius:4px; cursor:pointer; background:#2c4fc7; color:#fff; font-weight:bold;", "Carregar selecionado");
    loadBtn.onclick = () => {
      if (!listEl2.value) return;
      Profiles.load(listEl2.value);
      activeEl.textContent = "Ativo: " + (Profiles.getActiveName() || "nenhum");
      renderBody(); // refaz a aba atual pra refletir os novos valores nos campos
    };
    wrap.appendChild(loadBtn);

    const deleteBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; background:#a33; color:#fff; font-weight:bold;", "Excluir selecionado");
    deleteBtn.onclick = () => {
      if (!listEl2.value) return;
      if (!confirm("Excluir perfil: " + listEl2.value + "?")) return;
      Profiles.delete(listEl2.value);
      refreshList();
      activeEl.textContent = "Ativo: " + (Profiles.getActiveName() || "nenhum");
    };
    wrap.appendChild(deleteBtn);

    return wrap;
  }

  // ===== ABA: ATTACK (sem hotkey — modo melee ataca sozinho) =====
  function buildAttackTab() {
    const wrap = el("div");

    const statusEl = el("div", "margin-bottom:8px; font-size:11px;", "");
    statusEl.dataset.attackStatus = "1";
    wrap.appendChild(statusEl);

    const meleeRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer; color:#ccc;");
    const meleeCheckbox = el("input");
    meleeCheckbox.type = "checkbox";
    meleeCheckbox.checked = !!bot.attack.config.meleeMode;
    meleeCheckbox.onchange = () => bot.attack.updateConfig({ meleeMode: meleeCheckbox.checked });
    meleeRow.appendChild(meleeCheckbox);
    meleeRow.appendChild(document.createTextNode("Modo melee (ataca sozinho, sem hotkey)"));
    wrap.appendChild(meleeRow);

    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin-bottom:3px;", "Monstros alvo (vazio = qualquer um):"));
    const namesListEl = el("div", "max-height:70px; overflow-y:auto; margin-bottom:6px; background:#111; border-radius:4px; padding:4px;");
    namesListEl.dataset.attackNamesList = "1";
    wrap.appendChild(namesListEl);

    const nameRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const nameInput = el("input", "flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee;");
    nameInput.placeholder = "nome do monstro";
    function addTargetName() {
      const name = nameInput.value.trim();
      if (!name) return;
      const current = bot.attack.config.targetNames || [];
      if (!current.some((n) => n.toLowerCase() === name.toLowerCase())) {
        bot.attack.updateConfig({ targetNames: [...current, name] });
      }
      nameInput.value = "";
      renderNamesList();
    }
    const addNameBtn = el("button", "padding:4px 10px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer;", "+");
    addNameBtn.onclick = addTargetName;
    nameInput.onkeydown = (e) => { if (e.key === "Enter") addTargetName(); };
    nameRow.appendChild(nameInput);
    nameRow.appendChild(addNameBtn);
    wrap.appendChild(nameRow);

    wrap.appendChild(makeField("Distância máxima (tiles)", bot.attack.config.maxTargetDistance ?? 6, (v) => { bot.attack.updateConfig({ maxTargetDistance: Number(v) || 6 }); }, "number"));

    const skillRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:6px; cursor:pointer; color:#ccc;");
    const skillCheckbox = el("input");
    skillCheckbox.type = "checkbox";
    skillCheckbox.checked = !!bot.attack.config.skillTrainOnMonster;
    skillCheckbox.onchange = () => bot.attack.updateConfig({ skillTrainOnMonster: skillCheckbox.checked });
    skillRow.appendChild(skillCheckbox);
    skillRow.appendChild(document.createTextNode("Skill training (prioriza monstro)"));
    wrap.appendChild(skillRow);

    function renderNamesList() {
      namesListEl.innerHTML = "";
      const names = bot.attack.config.targetNames || [];
      if (!names.length) {
        namesListEl.appendChild(el("div", "color:#666; font-style:italic; font-size:11px;", "(nenhum — ataca qualquer monstro)"));
        return;
      }
      names.forEach((name) => {
        const row = el("div", "display:flex; justify-content:space-between; align-items:center; padding:2px 0; font-size:11px;");
        row.appendChild(el("span", null, name));
        const removeBtn = el("span", "color:#e77; cursor:pointer; padding:0 4px;", "✕");
        removeBtn.onclick = () => {
          bot.attack.updateConfig({ targetNames: names.filter((n) => n !== name) });
          renderNamesList();
        };
        row.appendChild(removeBtn);
        namesListEl.appendChild(row);
      });
    }
    renderNamesList();

    // ── Hotkey enquanto ataca (com delay configurável) ─────────
    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin:10px 0 4px; border-top:1px solid #333; padding-top:8px;", "Apertar hotkey enquanto estiver atacando:"));

    const spellToggleRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:6px; cursor:pointer; color:#ccc;");
    const spellToggleCheckbox = el("input");
    spellToggleCheckbox.type = "checkbox";
    spellToggleCheckbox.checked = !!AttackSpellCaster.running;
    spellToggleCheckbox.onchange = () => {
      spellToggleCheckbox.checked ? AttackSpellCaster.start() : AttackSpellCaster.stop();
    };
    spellToggleRow.appendChild(spellToggleCheckbox);
    spellToggleRow.appendChild(document.createTextNode("Ativar"));
    wrap.appendChild(spellToggleRow);

    wrap.appendChild(makeField("Slot da hotkey de ataque", AttackSpellCaster.config.hotbarSlot, (v) => { AttackSpellCaster.config.hotbarSlot = Math.min(12, Math.max(1, Number(v) || 1)); }, "number"));
    wrap.appendChild(makeField("Delay entre usos (ms)", AttackSpellCaster.config.delayMs, (v) => { AttackSpellCaster.config.delayMs = Math.max(200, Number(v) || 2000); }, "number"));

    const toggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff; margin-top:6px;");
    function refreshToggle() {
      const running = bot.attack.status().running;
      toggleBtn.textContent = running ? "Stop Attack" : "Start Attack";
      toggleBtn.style.background = running ? "#a33" : "#2d7a2d";
    }
    toggleBtn.onclick = () => {
      bot.attack.status().running ? bot.attack.stop() : bot.attack.start();
      refreshToggle();
    };
    refreshToggle();
    toggleBtn.dataset.refreshable = "1";
    toggleBtn._refresh = refreshToggle;
    wrap.appendChild(toggleBtn);

    return wrap;
  }

  // ===== ABA: CAVE (waypoints, presets, hotkey) =====
  // ===== ABA: ATK RUNE (usa runa da backpack num jogador específico por %) =====
  function buildUhPlayerTab() {
    const wrap = el("div");

    const statusEl = el("div", "margin-bottom:8px; font-size:11px;");
    statusEl.dataset.uhplayerStatus = "1";
    wrap.appendChild(statusEl);

    wrap.appendChild(makeField("Nome do jogador alvo", bot.uhPlayer.config.targetName, (v) => { bot.uhPlayer.updateConfig({ targetName: v.trim() }); }));
    wrap.appendChild(makeField("Curar se vida <= (%)", bot.uhPlayer.config.maxHpPercent, (v) => { bot.uhPlayer.updateConfig({ maxHpPercent: Number(v) || 70 }); }, "number"));
    wrap.appendChild(makeField("Nome da runa de cura (regex/texto)", bot.uhPlayer.config.runeNamePattern, (v) => { bot.uhPlayer.updateConfig({ runeNamePattern: v.trim() || "ultimate healing rune" }); }));
    wrap.appendChild(makeField("SID da runa (opcional, mais preciso)", bot.uhPlayer.config.runeSid ?? "", (v) => { bot.uhPlayer.updateConfig({ runeSid: v.trim() === "" ? null : Number(v) }); }, "number"));
    wrap.appendChild(makeField("Cooldown (ms)", bot.uhPlayer.config.cooldownMs, (v) => { bot.uhPlayer.updateConfig({ cooldownMs: Number(v) || 1500 }); }, "number"));
    wrap.appendChild(makeField("Alcance máximo (tiles)", bot.uhPlayer.config.maxDistance, (v) => { bot.uhPlayer.updateConfig({ maxDistance: Number(v) || 8 }); }, "number"));

    const toggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshToggle() {
      const running = bot.uhPlayer.status().running;
      toggleBtn.textContent = running ? "Stop UH Player" : "Start UH Player";
      toggleBtn.style.background = running ? "#a33" : "#2d7a2d";
    }
    toggleBtn.onclick = () => {
      bot.uhPlayer.status().running ? bot.uhPlayer.stop() : bot.uhPlayer.start();
      refreshToggle();
    };
    refreshToggle();
    toggleBtn.dataset.refreshable = "1";
    toggleBtn._refresh = refreshToggle;
    wrap.appendChild(toggleBtn);

    return wrap;
  }

  function buildCaveTab() {
    const wrap = el("div");
    const s = bot.cave.status();

    const statusEl = el("div", "margin-bottom:8px; font-size:11px;");
    statusEl.dataset.caveStatus = "1";
    wrap.appendChild(statusEl);

    wrap.appendChild(el("div", "color:#999; font-size:11px; margin-bottom:6px;", "Preset ativo: " + s.activePresetName + " — " + s.route.length + " waypoints"));

    const presetSelect = el("select", "width:100%; margin-bottom:6px; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee; box-sizing:border-box;");
    function refreshPresetSelect() {
      presetSelect.innerHTML = "";
      bot.cave.getPresetNames().forEach((name) => {
        const o = el("option", null, name);
        o.value = name;
        if (name === bot.cave.getActivePresetName()) o.selected = true;
        presetSelect.appendChild(o);
      });
    }
    refreshPresetSelect();
    wrap.appendChild(presetSelect);

    const presetBtnRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const loadPresetBtn = el("button", "flex:1; padding:5px; border:none; border-radius:4px; background:#2c4fc7; color:#fff; cursor:pointer; font-size:11px;", "Carregar");
    loadPresetBtn.onclick = () => { if (presetSelect.value) { bot.cave.loadPreset(presetSelect.value); renderBody(); } };
    const savePresetBtn = el("button", "flex:1; padding:5px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer; font-size:11px;", "Salvar");
    savePresetBtn.onclick = () => { bot.cave.savePreset(bot.cave.getActivePresetName()); };
    presetBtnRow.appendChild(loadPresetBtn);
    presetBtnRow.appendChild(savePresetBtn);
    wrap.appendChild(presetBtnRow);

    const newPresetRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const newPresetInput = el("input", "flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee;");
    newPresetInput.placeholder = "nome do novo preset";
    const createPresetBtn = el("button", "padding:5px 8px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer; font-size:11px;", "Criar");
    createPresetBtn.onclick = () => {
      if (newPresetInput.value.trim()) {
        bot.cave.createPreset(newPresetInput.value.trim());
        newPresetInput.value = "";
        renderBody();
      }
    };
    newPresetRow.appendChild(newPresetInput);
    newPresetRow.appendChild(createPresetBtn);
    wrap.appendChild(newPresetRow);

    const wpBtnRow1 = el("div", "display:flex; gap:4px; margin-bottom:6px;");
    const addWpBtn = el("button", "flex:1; padding:5px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer; font-size:11px;", "+ Waypoint aqui");
    addWpBtn.onclick = () => { bot.cave.addWaypointCurrentSpot(); renderBody(); };
    const removeWpBtn = el("button", "flex:1; padding:5px; border:none; border-radius:4px; background:#a33; color:#fff; cursor:pointer; font-size:11px;", "Remover último");
    removeWpBtn.onclick = () => { bot.cave.removeLastWaypoint(); renderBody(); };
    wpBtnRow1.appendChild(addWpBtn);
    wpBtnRow1.appendChild(removeWpBtn);
    wrap.appendChild(wpBtnRow1);

    const wpBtnRow2 = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const clearWpBtn = el("button", "flex:1; padding:5px; border:none; border-radius:4px; background:#555; color:#fff; cursor:pointer; font-size:11px;", "Limpar rota");
    clearWpBtn.onclick = () => { if (confirm("Limpar todos os waypoints?")) { bot.cave.clearWaypoints(); renderBody(); } };
    const recordBtn = el("button", "flex:1; padding:5px; border:none; border-radius:4px; background:#2c4fc7; color:#fff; cursor:pointer; font-size:11px;");
    function refreshRecordBtn() {
      const recording = bot.cave.isAutoRecording();
      recordBtn.textContent = recording ? "⏺ Gravando..." : "Gravar rota (auto)";
      recordBtn.style.background = recording ? "#a33" : "#2c4fc7";
    }
    recordBtn.onclick = () => {
      bot.cave.isAutoRecording() ? bot.cave.stopAutoRecord() : bot.cave.startAutoRecord();
      refreshRecordBtn();
    };
    refreshRecordBtn();
    wpBtnRow2.appendChild(clearWpBtn);
    wpBtnRow2.appendChild(recordBtn);
    wrap.appendChild(wpBtnRow2);

    const pauseClearRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:4px; cursor:pointer; color:#ccc; font-size:11px;");
    const pauseClearCheckbox = el("input");
    pauseClearCheckbox.type = "checkbox";
    pauseClearCheckbox.checked = !!bot.cave.config.pauseUntilClear;
    pauseClearCheckbox.onchange = () => bot.cave.updateConfig({ pauseUntilClear: pauseClearCheckbox.checked });
    pauseClearRow.appendChild(pauseClearCheckbox);
    pauseClearRow.appendChild(document.createTextNode("Pausar se tiver monstro alvo por perto"));
    wrap.appendChild(pauseClearRow);

    const strictRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer; color:#ccc; font-size:11px;");
    const strictCheckbox = el("input");
    strictCheckbox.type = "checkbox";
    strictCheckbox.checked = !!bot.cave.config.strictOrder;
    strictCheckbox.onchange = () => bot.cave.updateConfig({ strictOrder: strictCheckbox.checked });
    strictRow.appendChild(strictCheckbox);
    strictRow.appendChild(document.createTextNode("Ordem estrita (sem pular waypoints)"));
    wrap.appendChild(strictRow);

    const toggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshToggle() {
      const running = bot.cave.status().running;
      toggleBtn.textContent = running ? "Stop Cave" : "Start Cave";
      toggleBtn.style.background = running ? "#a33" : "#2d7a2d";
    }
    toggleBtn.onclick = () => {
      bot.cave.status().running ? bot.cave.stop() : bot.cave.start();
      refreshToggle();
    };
    refreshToggle();
    toggleBtn.dataset.refreshable = "1";
    toggleBtn._refresh = refreshToggle;
    wrap.appendChild(toggleBtn);

    return wrap;
  }

  // ===== ABA: GM PANIC (versão completa: detecta GM/jogador desconhecido/perda de HP,
  //           para tudo e manda pra PZ de origem — trabalha junto com o Cave) =====
  function buildGmPanicTab() {
    const wrap = el("div");

    const statusEl = el("div", "margin-bottom:8px; font-size:11px;");
    statusEl.dataset.gmpanicStatus = "1";
    wrap.appendChild(statusEl);

    const unknownRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:6px; cursor:pointer; color:#ccc;");
    const unknownCheckbox = el("input");
    unknownCheckbox.type = "checkbox";
    unknownCheckbox.checked = !!bot.panic.config.unknownPlayerEnabled;
    unknownCheckbox.onchange = () => bot.panic.updateConfig({ unknownPlayerEnabled: unknownCheckbox.checked });
    unknownRow.appendChild(unknownCheckbox);
    unknownRow.appendChild(document.createTextNode("Alarme se aparecer jogador desconhecido"));
    wrap.appendChild(unknownRow);

    const healthRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:6px; cursor:pointer; color:#ccc;");
    const healthCheckbox = el("input");
    healthCheckbox.type = "checkbox";
    healthCheckbox.checked = !!bot.panic.config.healthLossEnabled;
    healthCheckbox.onchange = () => bot.panic.updateConfig({ healthLossEnabled: healthCheckbox.checked });
    healthRow.appendChild(healthCheckbox);
    healthRow.appendChild(document.createTextNode("Alarme se perder HP (ataque)"));
    wrap.appendChild(healthRow);

    const returnRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer; color:#ccc;");
    const returnCheckbox = el("input");
    returnCheckbox.type = "checkbox";
    returnCheckbox.checked = !!bot.panic.config.returnToOriginEnabled;
    returnCheckbox.onchange = () => bot.panic.updateConfig({ returnToOriginEnabled: returnCheckbox.checked });
    returnRow.appendChild(returnCheckbox);
    returnRow.appendChild(document.createTextNode("Voltar pro lugar de origem depois"));
    wrap.appendChild(returnRow);

    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin-bottom:3px;", "Nomes confiáveis (não disparam alarme):"));
    const trustedListEl = el("div", "max-height:60px; overflow-y:auto; margin-bottom:6px; background:#111; border-radius:4px; padding:4px;");
    wrap.appendChild(trustedListEl);
    const trustedRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const trustedInput = el("input", "flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee;");
    trustedInput.placeholder = "nome confiável";
    function addTrusted() {
      const name = trustedInput.value.trim();
      if (!name) return;
      const current = bot.panic.config.trustedNames || [];
      if (!current.some((n) => n.toLowerCase() === name.toLowerCase())) {
        bot.panic.updateConfig({ trustedNames: [...current, name] });
      }
      trustedInput.value = "";
      renderTrustedList();
    }
    const addTrustedBtn = el("button", "padding:4px 10px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer;", "+");
    addTrustedBtn.onclick = addTrusted;
    trustedInput.onkeydown = (e) => { if (e.key === "Enter") addTrusted(); };
    trustedRow.appendChild(trustedInput);
    trustedRow.appendChild(addTrustedBtn);
    wrap.appendChild(trustedRow);

    function renderTrustedList() {
      trustedListEl.innerHTML = "";
      const names = bot.panic.config.trustedNames || [];
      if (!names.length) {
        trustedListEl.appendChild(el("div", "color:#666; font-style:italic; font-size:11px;", "(nenhum)"));
        return;
      }
      names.forEach((name) => {
        const row = el("div", "display:flex; justify-content:space-between; align-items:center; padding:2px 0; font-size:11px;");
        row.appendChild(el("span", null, name));
        const removeBtn = el("span", "color:#e77; cursor:pointer; padding:0 4px;", "✕");
        removeBtn.onclick = () => {
          bot.panic.updateConfig({ trustedNames: names.filter((n) => n !== name) });
          renderTrustedList();
        };
        row.appendChild(removeBtn);
        trustedListEl.appendChild(row);
      });
    }
    renderTrustedList();

    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin-bottom:3px;", "Nomes de Game Master (kill switch total):"));
    const gmListEl = el("div", "max-height:60px; overflow-y:auto; margin-bottom:6px; background:#111; border-radius:4px; padding:4px;");
    wrap.appendChild(gmListEl);
    const gmRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const gmInput = el("input", "flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee;");
    gmInput.placeholder = "nome do GM";
    function addGm() {
      const name = gmInput.value.trim();
      if (!name) return;
      const current = bot.panic.config.gameMasterNames || [];
      if (!current.some((n) => n.toLowerCase() === name.toLowerCase())) {
        bot.panic.updateConfig({ gameMasterNames: [...current, name] });
      }
      gmInput.value = "";
      renderGmList();
    }
    const addGmBtn = el("button", "padding:4px 10px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer;", "+");
    addGmBtn.onclick = addGm;
    gmInput.onkeydown = (e) => { if (e.key === "Enter") addGm(); };
    gmRow.appendChild(gmInput);
    gmRow.appendChild(addGmBtn);
    wrap.appendChild(gmRow);

    function renderGmList() {
      gmListEl.innerHTML = "";
      const names = bot.panic.config.gameMasterNames || [];
      if (!names.length) {
        gmListEl.appendChild(el("div", "color:#666; font-style:italic; font-size:11px;", "(nenhum)"));
        return;
      }
      names.forEach((name) => {
        const row = el("div", "display:flex; justify-content:space-between; align-items:center; padding:2px 0; font-size:11px;");
        row.appendChild(el("span", null, name));
        const removeBtn = el("span", "color:#e77; cursor:pointer; padding:0 4px;", "✕");
        removeBtn.onclick = () => {
          bot.panic.updateConfig({ gameMasterNames: names.filter((n) => n !== name) });
          renderGmList();
        };
        row.appendChild(removeBtn);
        gmListEl.appendChild(row);
      });
    }
    renderGmList();

    return wrap;
  }

  // ===== ABA: DROP (jogar itens específicos no chão automaticamente) =====
  function buildDropTab() {
    const wrap = el("div");

    const statusEl = el("div", "margin-bottom:8px; font-size:11px;");
    statusEl.dataset.dropStatus = "1";
    wrap.appendChild(statusEl);

    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin-bottom:3px;", "Itens pra jogar no chão:"));
    const listEl3 = el("div", "max-height:80px; overflow-y:auto; margin-bottom:6px; background:#111; border-radius:4px; padding:4px;");
    wrap.appendChild(listEl3);

    const addRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const sidInput = el("input", "flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee;");
    sidInput.type = "number";
    sidInput.placeholder = "SID do item";
    const addBtn = el("button", "padding:4px 10px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer;", "+");
    addBtn.onclick = () => {
      if (bot.drop.addItem(sidInput.value)) { sidInput.value = ""; renderDropList(); }
    };
    sidInput.onkeydown = (e) => { if (e.key === "Enter") addBtn.click(); };
    addRow.appendChild(sidInput);
    addRow.appendChild(addBtn);
    wrap.appendChild(addRow);

    function renderDropList() {
      listEl3.innerHTML = "";
      const items = bot.drop.config.items || [];
      if (!items.length) {
        listEl3.appendChild(el("div", "color:#666; font-style:italic; font-size:11px;", "(nenhum item na lista)"));
        return;
      }
      items.forEach((item, index) => {
        const row = el("div", "display:flex; justify-content:space-between; align-items:center; padding:2px 0; font-size:11px;");
        row.appendChild(el("span", null, "SID " + item.sid));
        const removeBtn = el("span", "color:#e77; cursor:pointer; padding:0 4px;", "✕");
        removeBtn.onclick = () => { bot.drop.removeItem(index); renderDropList(); };
        row.appendChild(removeBtn);
        listEl3.appendChild(row);
      });
    }
    renderDropList();

    const posInfo = el("div", "font-size:11px; color:#999; margin-bottom:6px;");
    posInfo.dataset.dropPosInfo = "1";
    wrap.appendChild(posInfo);

    const posRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const fixBtn = el("button", "flex:1; padding:5px; border:none; border-radius:4px; background:#333; color:#ccc; cursor:pointer; font-size:11px;", "Fixar posição atual");
    fixBtn.onclick = () => { bot.drop.setFixedPosition(); updatePanel(); };
    const clearPosBtn = el("button", "flex:1; padding:5px; border:none; border-radius:4px; background:#333; color:#ccc; cursor:pointer; font-size:11px;", "Usar minha posição");
    clearPosBtn.onclick = () => { bot.drop.clearFixedPosition(); updatePanel(); };
    posRow.appendChild(fixBtn);
    posRow.appendChild(clearPosBtn);
    wrap.appendChild(posRow);

    const toggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshToggle() {
      const running = bot.drop.status().running;
      toggleBtn.textContent = running ? "Stop Drop" : "Start Drop";
      toggleBtn.style.background = running ? "#a33" : "#2d7a2d";
    }
    toggleBtn.onclick = () => {
      bot.drop.status().running ? bot.drop.stop() : bot.drop.start();
      refreshToggle();
    };
    refreshToggle();
    toggleBtn.dataset.refreshable = "1";
    toggleBtn._refresh = refreshToggle;
    wrap.appendChild(toggleBtn);

    return wrap;
  }

  // ===== ABA: PZ (define local seguro de origem, usado pelo GM Panic) =====
  function buildPzTab() {
    const wrap = el("div");

    wrap.appendChild(el("div", "color:#999; font-size:11px; margin-bottom:8px;", "Define um local seguro (PZ) — o GM Panic manda o personagem pra cá quando dispara o alarme."));

    const homeInfoEl = el("div", "margin-bottom:8px; font-size:11px; color:#9c9;");
    homeInfoEl.dataset.pzHomeInfo = "1";
    wrap.appendChild(homeInfoEl);

    const setBtn = el("button", "width:100%; padding:6px; margin-bottom:6px; border:none; border-radius:4px; cursor:pointer; background:#2d7a2d; color:#fff; font-weight:bold;", "Definir PZ na minha posição atual");
    setBtn.onclick = () => { bot.pz.setHomePzCurrentSpot(); renderBody(); };
    wrap.appendChild(setBtn);

    const clearBtn = el("button", "width:100%; padding:6px; margin-bottom:8px; border:none; border-radius:4px; cursor:pointer; background:#555; color:#fff;", "Limpar PZ salvo");
    clearBtn.onclick = () => { bot.pz.clearHomePz(); renderBody(); };
    wrap.appendChild(clearBtn);

    const goHomeStatusEl = el("div", "margin-bottom:4px; font-size:11px; color:#999;");
    goHomeStatusEl.dataset.pzReturnerStatus = "1";
    wrap.appendChild(goHomeStatusEl);

    const goHomeBtn = el("button", "width:100%; padding:6px; margin-bottom:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshGoHomeBtn() {
      goHomeBtn.textContent = PzReturner.running ? "Parar (insistindo até chegar)" : "Ir pro PZ salvo agora (insiste até chegar)";
      goHomeBtn.style.background = PzReturner.running ? "#a33" : "#2c4fc7";
    }
    goHomeBtn.onclick = () => {
      PzReturner.running ? PzReturner.stop() : PzReturner.start();
      refreshGoHomeBtn();
    };
    refreshGoHomeBtn();
    goHomeBtn.dataset.refreshable = "1";
    goHomeBtn._refresh = refreshGoHomeBtn;
    wrap.appendChild(goHomeBtn);

    const goNearestBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; background:#333; color:#ccc;", "Ir pro PZ mais próximo (qualquer um)");
    goNearestBtn.onclick = () => { bot.pz.goToNearestPz(); };
    wrap.appendChild(goNearestBtn);

    return wrap;
  }

  // ===== ABA: CHAT (detector de mensagens, alarme sonoro) =====
  function buildChatTab() {
    const wrap = el("div");

    const statusEl = el("div", "margin-bottom:8px; font-size:11px;");
    statusEl.dataset.chatStatus = "1";
    wrap.appendChild(statusEl);

    const anyRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:6px; cursor:pointer; color:#ccc;");
    const anyCheckbox = el("input");
    anyCheckbox.type = "checkbox";
    anyCheckbox.checked = !!bot.Chatdetector.status().config.alarmarQualquer;
    anyCheckbox.onchange = () => bot.Chatdetector.updateConfig({ alarmarQualquer: anyCheckbox.checked });
    anyRow.appendChild(anyCheckbox);
    anyRow.appendChild(document.createTextNode("Alarme em qualquer mensagem"));
    wrap.appendChild(anyRow);

    const mentionRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:6px; cursor:pointer; color:#ccc;");
    const mentionCheckbox = el("input");
    mentionCheckbox.type = "checkbox";
    mentionCheckbox.checked = !!bot.Chatdetector.status().config.alarmarMencao;
    mentionCheckbox.onchange = () => bot.Chatdetector.updateConfig({ alarmarMencao: mentionCheckbox.checked });
    mentionRow.appendChild(mentionCheckbox);
    mentionRow.appendChild(document.createTextNode("Alarme quando me mencionarem"));
    wrap.appendChild(mentionRow);

    const watchedRow = el("label", "display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer; color:#ccc;");
    const watchedCheckbox = el("input");
    watchedCheckbox.type = "checkbox";
    watchedCheckbox.checked = !!bot.Chatdetector.status().config.alarmarVigiados;
    watchedCheckbox.onchange = () => bot.Chatdetector.updateConfig({ alarmarVigiados: watchedCheckbox.checked });
    watchedRow.appendChild(watchedCheckbox);
    watchedRow.appendChild(document.createTextNode("Alarme em termos vigiados"));
    wrap.appendChild(watchedRow);

    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin-bottom:3px;", "Termos vigiados:"));
    const watchedListEl = el("div", "max-height:60px; overflow-y:auto; margin-bottom:6px; background:#111; border-radius:4px; padding:4px;");
    wrap.appendChild(watchedListEl);
    const watchedInputRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const watchedInput = el("input", "flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee;");
    watchedInput.placeholder = "termo pra vigiar";
    function addWatchedTerm() {
      if (bot.Chatdetector.addWatched(watchedInput.value.trim())) { watchedInput.value = ""; renderWatchedList(); }
    }
    const addWatchedBtn = el("button", "padding:4px 10px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer;", "+");
    addWatchedBtn.onclick = addWatchedTerm;
    watchedInput.onkeydown = (e) => { if (e.key === "Enter") addWatchedTerm(); };
    watchedInputRow.appendChild(watchedInput);
    watchedInputRow.appendChild(addWatchedBtn);
    wrap.appendChild(watchedInputRow);

    function renderWatchedList() {
      watchedListEl.innerHTML = "";
      const terms = bot.Chatdetector.status().config.termosVigiados || [];
      if (!terms.length) {
        watchedListEl.appendChild(el("div", "color:#666; font-style:italic; font-size:11px;", "(nenhum)"));
        return;
      }
      terms.forEach((term) => {
        const row = el("div", "display:flex; justify-content:space-between; align-items:center; padding:2px 0; font-size:11px;");
        row.appendChild(el("span", null, term));
        const removeBtn = el("span", "color:#e77; cursor:pointer; padding:0 4px;", "✕");
        removeBtn.onclick = () => { bot.Chatdetector.removeWatched(term); renderWatchedList(); };
        row.appendChild(removeBtn);
        watchedListEl.appendChild(row);
      });
    }
    renderWatchedList();

    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin-bottom:3px;", "Ignorar mensagens com:"));
    const ignoredListEl = el("div", "max-height:60px; overflow-y:auto; margin-bottom:6px; background:#111; border-radius:4px; padding:4px;");
    wrap.appendChild(ignoredListEl);
    const ignoredInputRow = el("div", "display:flex; gap:4px; margin-bottom:8px;");
    const ignoredInput = el("input", "flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a2a; color:#eee;");
    ignoredInput.placeholder = "palavra pra ignorar";
    function addIgnoredTerm() {
      if (bot.Chatdetector.addIgnored(ignoredInput.value.trim())) { ignoredInput.value = ""; renderIgnoredList(); }
    }
    const addIgnoredBtn = el("button", "padding:4px 10px; border:none; border-radius:4px; background:#2d7a2d; color:#fff; cursor:pointer;", "+");
    addIgnoredBtn.onclick = addIgnoredTerm;
    ignoredInput.onkeydown = (e) => { if (e.key === "Enter") addIgnoredTerm(); };
    ignoredInputRow.appendChild(ignoredInput);
    ignoredInputRow.appendChild(addIgnoredBtn);
    wrap.appendChild(ignoredInputRow);

    function renderIgnoredList() {
      ignoredListEl.innerHTML = "";
      const terms = bot.Chatdetector.status().config.ignorarSeContiver || [];
      if (!terms.length) {
        ignoredListEl.appendChild(el("div", "color:#666; font-style:italic; font-size:11px;", "(nenhum)"));
        return;
      }
      terms.forEach((term) => {
        const row = el("div", "display:flex; justify-content:space-between; align-items:center; padding:2px 0; font-size:11px;");
        row.appendChild(el("span", null, term));
        const removeBtn = el("span", "color:#e77; cursor:pointer; padding:0 4px;", "✕");
        removeBtn.onclick = () => { bot.Chatdetector.removeIgnored(term); renderIgnoredList(); };
        row.appendChild(removeBtn);
        ignoredListEl.appendChild(row);
      });
    }
    renderIgnoredList();

    const toggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshToggle() {
      const running = bot.Chatdetector.status().running;
      toggleBtn.textContent = running ? "Stop Chat Detector" : "Start Chat Detector";
      toggleBtn.style.background = running ? "#a33" : "#2d7a2d";
    }
    toggleBtn.onclick = () => {
      bot.Chatdetector.status().running ? bot.Chatdetector.stop() : bot.Chatdetector.start();
      refreshToggle();
    };
    refreshToggle();
    toggleBtn.dataset.refreshable = "1";
    toggleBtn._refresh = refreshToggle;
    wrap.appendChild(toggleBtn);

    return wrap;
  }

  // ===== ABA: FIRE (passo manual através de campo perigoso, junto com Cave) =====
  function buildFireTab() {
    const wrap = el("div");

    wrap.appendChild(el("div", "color:#999; font-size:11px; margin-bottom:8px;", "Quando o Cave (ou qualquer rota ativa) fica preso num campo perigoso (fogo, energia, veneno), dá um passo manual através dele — igual apertar a seta."));

    const statusEl = el("div", "margin-bottom:4px; font-size:11px;");
    statusEl.dataset.fireStatus = "1";
    wrap.appendChild(statusEl);

    const countEl = el("div", "margin-bottom:8px; color:#9c9; font-size:11px;");
    countEl.dataset.fireCount = "1";
    wrap.appendChild(countEl);

    const toggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshToggle() {
      toggleBtn.textContent = HazardStepper.running ? "Stop Fire Stepper" : "Start Fire Stepper";
      toggleBtn.style.background = HazardStepper.running ? "#a33" : "#2d7a2d";
    }
    toggleBtn.onclick = () => {
      HazardStepper.running ? HazardStepper.stop() : HazardStepper.start();
      refreshToggle();
    };
    refreshToggle();
    toggleBtn.dataset.refreshable = "1";
    toggleBtn._refresh = refreshToggle;
    wrap.appendChild(toggleBtn);

    return wrap;
  }

  // ===== ABA: TALK (auto-responder com IA — Talk Module) =====
  function buildTalkTab() {
    const wrap = el("div");

    const statusEl = el("div", "margin-bottom:8px; font-size:11px;");
    statusEl.dataset.talkStatus = "1";
    wrap.appendChild(statusEl);

    wrap.appendChild(el("div", "color:#ccc; font-size:11px; margin-bottom:6px;", "🔑 Configuração da API (Google Gemini):"));
    wrap.appendChild(makeField("API Key", bot.talk.config.apiKey ? "***configured***" : "", (v) => { 
      bot.talk.updateConfig({ apiKey: v.trim() }); 
    }));

    wrap.appendChild(el("div", "color:#999; font-size:11px; margin-bottom:6px;", "Obtenha sua chave em: https://ai.google.dev"));

    wrap.appendChild(makeField("Modelo", bot.talk.config.model || "gemini-flash-latest", (v) => { 
      bot.talk.updateConfig({ model: v.trim() }); 
    }));

    wrap.appendChild(makeField("Poll (ms)", bot.talk.config.pollMs || 1000, (v) => { 
      bot.talk.updateConfig({ pollMs: Math.max(1000, Number(v) || 1000) }); 
    }, "number"));

    wrap.appendChild(makeField("Cooldown resposta (ms)", bot.talk.config.replyCooldownMs || 1500, (v) => { 
      bot.talk.updateConfig({ replyCooldownMs: Math.max(0, Number(v) || 1500) }); 
    }, "number"));

    wrap.appendChild(el("div", "color:#ccc; font-size:12px; font-weight:bold; margin-top:8px; margin-bottom:4px;", "📝 Prompts Customizáveis:"));

    const expandBtn = el("button", "width:100%; padding:5px; margin-bottom:6px; border:none; border-radius:4px; background:#333; color:#ccc; cursor:pointer; font-size:11px;", "▼ Mostrar prompts customizáveis");
    const prompWrap = el("div", "display:none; background:#111; padding:6px; border-radius:4px; margin-bottom:6px;");
    expandBtn.onclick = () => {
      const isHidden = prompWrap.style.display === "none";
      prompWrap.style.display = isHidden ? "block" : "none";
      expandBtn.textContent = isHidden ? "▲ Ocultar prompts" : "▼ Mostrar prompts customizáveis";
    };
    wrap.appendChild(expandBtn);

    prompWrap.appendChild(el("div", "color:#999; font-size:10px; margin-bottom:4px;", "System prompt:"));
    prompWrap.appendChild(makeField("", bot.talk.config.systemPrompt || "", (v) => { 
      bot.talk.updateConfig({ systemPrompt: v }); 
    }));

    prompWrap.appendChild(el("div", "color:#999; font-size:10px; margin-top:6px; margin-bottom:4px;", "Greeting prompt:"));
    prompWrap.appendChild(makeField("", bot.talk.config.greetingPrompt || "", (v) => { 
      bot.talk.updateConfig({ greetingPrompt: v }); 
    }));

    prompWrap.appendChild(el("div", "color:#999; font-size:10px; margin-top:6px; margin-bottom:4px;", "Question prompt:"));
    prompWrap.appendChild(makeField("", bot.talk.config.questionPrompt || "", (v) => { 
      bot.talk.updateConfig({ questionPrompt: v }); 
    }));

    prompWrap.appendChild(el("div", "color:#999; font-size:10px; margin-top:6px; margin-bottom:4px;", "Statement prompt:"));
    prompWrap.appendChild(makeField("", bot.talk.config.statementPrompt || "", (v) => { 
      bot.talk.updateConfig({ statementPrompt: v }); 
    }));

    wrap.appendChild(prompWrap);

    const toggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshToggle() {
      const running = bot.talk.status().running;
      toggleBtn.textContent = running ? "Stop Talk" : "Start Talk";
      toggleBtn.style.background = running ? "#a33" : "#2d7a2d";
    }
    toggleBtn.onclick = () => {
      bot.talk.status().running ? bot.talk.stop() : bot.talk.start();
      refreshToggle();
    };
    refreshToggle();
    toggleBtn.dataset.refreshable = "1";
    toggleBtn._refresh = refreshToggle;
    wrap.appendChild(toggleBtn);

    return wrap;
  }

  // ===== ABA: MISC (funções diversas — zoom blocker, e mais quando você mandar) =====
  function buildMiscTab() {
    const wrap = el("div");

    wrap.appendChild(el("div", "color:#ccc; font-size:12px; font-weight:bold; margin-bottom:4px;", "🔍 Bloquear zoom do navegador"));
    wrap.appendChild(el("div", "color:#999; font-size:11px; margin-bottom:6px;", "Bloqueia Ctrl+scroll, Ctrl +/-/0, e gestos de pinça (touch/trackpad)."));

    const zoomToggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff; margin-bottom:4px;");
    function refreshZoomToggle() {
      zoomToggleBtn.textContent = ZoomBlocker.running ? "Desativar bloqueio de zoom" : "Ativar bloqueio de zoom";
      zoomToggleBtn.style.background = ZoomBlocker.running ? "#a33" : "#2d7a2d";
    }
    zoomToggleBtn.onclick = () => {
      ZoomBlocker.running ? ZoomBlocker.stop() : ZoomBlocker.start();
      refreshZoomToggle();
    };
    refreshZoomToggle();
    zoomToggleBtn.dataset.refreshable = "1";
    zoomToggleBtn._refresh = refreshZoomToggle;
    wrap.appendChild(zoomToggleBtn);

    wrap.appendChild(el("div", "border-top:1px solid #333; margin:10px 0 6px;"));

    wrap.appendChild(el("div", "color:#ccc; font-size:12px; font-weight:bold; margin-bottom:4px;", "👆 Bloquear swipe voltar/avançar"));
    wrap.appendChild(el("div", "color:#999; font-size:11px; margin-bottom:6px;", "Bloqueia o gesto lateral (touch/trackpad) que faz o navegador voltar/avançar de página."));

    const swipeToggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshSwipeToggle() {
      swipeToggleBtn.textContent = SwipeNavBlocker.running ? "Desativar bloqueio de swipe" : "Ativar bloqueio de swipe";
      swipeToggleBtn.style.background = SwipeNavBlocker.running ? "#a33" : "#2d7a2d";
    }
    swipeToggleBtn.onclick = () => {
      SwipeNavBlocker.running ? SwipeNavBlocker.stop() : SwipeNavBlocker.start();
      refreshSwipeToggle();
    };
    refreshSwipeToggle();
    swipeToggleBtn.dataset.refreshable = "1";
    swipeToggleBtn._refresh = refreshSwipeToggle;
    wrap.appendChild(swipeToggleBtn);

    wrap.appendChild(el("div", "border-top:1px solid #333; margin:10px 0 6px;"));

    wrap.appendChild(el("div", "color:#ccc; font-size:12px; font-weight:bold; margin-bottom:4px;", "⚡ Modo Performance"));
    wrap.appendChild(el("div", "color:#999; font-size:11px; margin-bottom:6px;", "Silencia os logs do console, desativa animações/transições CSS e desliga efeitos de clima (weather) — reduz consumo de CPU/GPU."));

    const perfToggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshPerfToggle() {
      perfToggleBtn.textContent = PerformanceMode.running ? "Desativar Performance Mode" : "Ativar Performance Mode";
      perfToggleBtn.style.background = PerformanceMode.running ? "#a33" : "#2d7a2d";
    }
    perfToggleBtn.onclick = () => {
      PerformanceMode.running ? PerformanceMode.stop() : PerformanceMode.start();
      refreshPerfToggle();
    };
    refreshPerfToggle();
    perfToggleBtn.dataset.refreshable = "1";
    perfToggleBtn._refresh = refreshPerfToggle;
    wrap.appendChild(perfToggleBtn);

    wrap.appendChild(el("div", "border-top:1px solid #333; margin:10px 0 6px;"));

    wrap.appendChild(el("div", "color:#ccc; font-size:12px; font-weight:bold; margin-bottom:4px;", "🪄 Esconder animação de magia"));
    wrap.appendChild(el("div", "color:#999; font-size:11px; margin-bottom:6px;", "Esconde o projétil e a área visual de magias (suas e de monstros/jogadores) — a magia continua funcionando normalmente, só o efeito visual some."));

    const spellAnimToggleBtn = el("button", "width:100%; padding:6px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff;");
    function refreshSpellAnimToggle() {
      spellAnimToggleBtn.textContent = HideSpellAnimations.running ? "Mostrar animação de magia" : "Esconder animação de magia";
      spellAnimToggleBtn.style.background = HideSpellAnimations.running ? "#a33" : "#2d7a2d";
    }
    spellAnimToggleBtn.onclick = () => {
      HideSpellAnimations.running ? HideSpellAnimations.stop() : HideSpellAnimations.start();
      refreshSpellAnimToggle();
    };
    refreshSpellAnimToggle();
    spellAnimToggleBtn.dataset.refreshable = "1";
    spellAnimToggleBtn._refresh = refreshSpellAnimToggle;
    wrap.appendChild(spellAnimToggleBtn);

    // (espaço reservado pra próxima função que você mandar)

    return wrap;
  }

  const tabBuilders = {
    rune: buildRuneTab, haste: buildHasteTab, eat: buildEatTab, ring: buildRingTab,
    monk: buildMonkTab, stones: buildStonesTab, panic: buildPanicTab, heal: buildHealTab,
    invisible: buildInvisibleTab, magicshield: buildMagicShieldTab, follow: buildFollowTab,
    friendheal: buildFriendHealTab, lasttarget: buildLastTargetTab, profiles: buildProfilesTab,
    attack: buildAttackTab, uhplayer: buildUhPlayerTab, cave: buildCaveTab, gmpanic: buildGmPanicTab, drop: buildDropTab,
    pz: buildPzTab, talk: buildTalkTab, chat: buildChatTab, fire: buildFireTab, misc: buildMiscTab,
  };

  function renderBody() {
    bodyEl.innerHTML = "";
    bodyEl.appendChild(tabBuilders[activeTab]());
  }

  function switchTab(id) {
    activeTab = id;
    Array.from(tabsEl.children).forEach((t) => {
      const active = t.dataset.tabId === id;
      t.style.background = active ? "#2c4fc7" : "#2a2a2a";
      t.style.color = active ? "#fff" : "#ccc";
    });
    renderBody();
  }

  function updatePanel() {
    if (!panelEl) return;
    bodyEl.querySelectorAll("button[data-refreshable]").forEach((btn) => btn._refresh?.());
    const monkCountEl = bodyEl.querySelector("[data-monk-count]");
    if (monkCountEl) monkCountEl.textContent = "Conjurações: " + Monk.castCount;
    const stonesCountEl = bodyEl.querySelector("[data-stones-count]");
    if (stonesCountEl) stonesCountEl.textContent = "Pedras movidas: " + Stones.movedCount;
    const panicStatusEl = bodyEl.querySelector("[data-panic-status]");
    if (panicStatusEl) {
      panicStatusEl.textContent = Panic.status;
      panicStatusEl.style.color = Panic.status.startsWith("⚠") ? "#e77" : "#999";
    }

    // ── Attack ──
    const attackStatusEl = bodyEl.querySelector("[data-attack-status]");
    if (attackStatusEl && bot.attack) {
      const s = bot.attack.status();
      attackStatusEl.textContent = s.running
        ? (s.combatActive ? "● Em combate: " + (s.currentTarget?.name || "?") : "● Rodando (sem alvo)")
        : "○ Parado";
      attackStatusEl.style.color = s.running ? (s.combatActive ? "#e77" : "#5c5") : "#999";
    }

    // ── Cave ──
    const caveStatusEl = bodyEl.querySelector("[data-cave-status]");
    if (caveStatusEl && bot.cave) {
      const s = bot.cave.status();
      caveStatusEl.textContent = s.running
        ? "● Rodando — waypoint " + (s.currentIndex + 1) + "/" + s.route.length
        : "○ Parado";
      caveStatusEl.style.color = s.running ? "#5c5" : "#999";
    }

    // ── GM Panic ──
    const gmpanicStatusEl = bodyEl.querySelector("[data-gmpanic-status]");
    if (gmpanicStatusEl && bot.panic) {
      const s = bot.panic.status();
      if (s.visibleGameMasters.length) {
        gmpanicStatusEl.textContent = "🚨 GM DETECTADO: " + s.visibleGameMasters.map((p) => p.name).join(", ");
        gmpanicStatusEl.style.color = "#f55";
      } else if (s.unknownVisiblePlayers.length && s.config.unknownPlayerEnabled) {
        gmpanicStatusEl.textContent = "⚠ Desconhecido: " + s.unknownVisiblePlayers.map((p) => p.name).join(", ");
        gmpanicStatusEl.style.color = "#e77";
      } else if (s.pendingReturn) {
        gmpanicStatusEl.textContent = "Voltando pra origem...";
        gmpanicStatusEl.style.color = "#fc5";
      } else {
        gmpanicStatusEl.textContent = s.running ? "● Monitorando" : "○ Parado";
        gmpanicStatusEl.style.color = s.running ? "#5c5" : "#999";
      }
    }

    // ── Drop ──
    const dropStatusEl = bodyEl.querySelector("[data-drop-status]");
    if (dropStatusEl && bot.drop) {
      const s = bot.drop.status();
      dropStatusEl.textContent = (s.running ? "● Rodando" : "○ Parado") + " — jogados: " + s.totalDropped;
      dropStatusEl.style.color = s.running ? "#5c5" : "#999";
    }
    const dropPosInfoEl = bodyEl.querySelector("[data-drop-pos-info]");
    if (dropPosInfoEl && bot.drop) {
      const s = bot.drop.status();
      dropPosInfoEl.textContent = s.config.fixedPosition
        ? "Posição fixa: (" + s.config.fixedPosition.x + ", " + s.config.fixedPosition.y + ", " + s.config.fixedPosition.z + ")"
        : "Posição: onde eu estiver";
    }

    // ── PZ ──
    const pzHomeInfoEl = bodyEl.querySelector("[data-pz-home-info]");
    if (pzHomeInfoEl && bot.pz) {
      const home = bot.pz.getHomePz();
      pzHomeInfoEl.textContent = home
        ? "PZ salvo: (" + home.x + ", " + home.y + ", " + home.z + ")"
        : "Nenhum PZ salvo ainda";
      pzHomeInfoEl.style.color = home ? "#9c9" : "#999";
    }
    const pzReturnerStatusEl = bodyEl.querySelector("[data-pz-returner-status]");
    if (pzReturnerStatusEl) {
      pzReturnerStatusEl.textContent = PzReturner.running ? "● " + PzReturner.status : "";
      pzReturnerStatusEl.style.color = "#fc5";
    }

    // ── UH Player ──
    const uhplayerStatusEl = bodyEl.querySelector("[data-uhplayer-status]");
    if (uhplayerStatusEl && bot.uhPlayer) {
      const s = bot.uhPlayer.status();
      if (!s.config.targetName) {
        uhplayerStatusEl.textContent = "Configure o nome do jogador alvo";
        uhplayerStatusEl.style.color = "#999";
      } else if (!s.targetFound) {
        uhplayerStatusEl.textContent = "○ Alvo fora de vista: " + s.config.targetName;
        uhplayerStatusEl.style.color = "#999";
      } else {
        uhplayerStatusEl.textContent = "● " + s.config.targetName + " — vida: " + (s.targetHpPercent != null ? s.targetHpPercent.toFixed(0) + "%" : "?") + (s.runeAvailable ? "" : " (sem runa de cura na bag)");
        uhplayerStatusEl.style.color = s.runeAvailable ? "#5c5" : "#e77";
      }
    }

    // ── Talk ──
    const talkStatusEl = bodyEl.querySelector("[data-talk-status]");
    if (talkStatusEl && bot.talk) {
      const s = bot.talk.status();
      const apiKey = s.config?.apiKey;
      talkStatusEl.textContent = !apiKey
        ? "⚠ Sem API Key configurada"
        : s.running
          ? "● Rodando (respondendo auto)"
          : "○ Parado";
      talkStatusEl.style.color = !apiKey ? "#e77" : s.running ? "#5c5" : "#999";
    }

    // ── Chat ──
    const chatStatusEl = bodyEl.querySelector("[data-chat-status]");
    if (chatStatusEl && bot.Chatdetector) {
      const s = bot.Chatdetector.status();
      chatStatusEl.textContent = s.running ? "● Monitorando chat (" + (s.playerName || "?") + ")" : "○ Parado";
      chatStatusEl.style.color = s.running ? "#5c5" : "#999";
    }

    // ── Fire ──
    const fireStatusEl = bodyEl.querySelector("[data-fire-status]");
    if (fireStatusEl) {
      fireStatusEl.textContent = HazardStepper.running ? "● Rodando (" + HazardStepper.status + ")" : "○ Parado";
      fireStatusEl.style.color = HazardStepper.running ? "#5c5" : "#999";
    }
    const fireCountEl = bodyEl.querySelector("[data-fire-count]");
    if (fireCountEl) fireCountEl.textContent = "Campos atravessados: " + HazardStepper.stepsCount;
  }

  // Arrasta o painel com mouse (desktop) e touch (celular/tablet)
  function makeDraggable(handle) {
    let offsetX = 0, offsetY = 0, dragging = false;

    function startDrag(clientX, clientY) {
      dragging = true;
      const rect = panelEl.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      // Trava o tamanho atual antes de mudar de right→left,
      // senão o painel estica ao largar o posicionamento original.
      panelEl.style.width = rect.width + "px";
      panelEl.style.left = rect.left + "px";
      panelEl.style.top = rect.top + "px";
      panelEl.style.right = "auto";
      panelEl.style.bottom = "auto";
      panelEl.style.transform = "none";
    }

    function moveDrag(clientX, clientY) {
      if (!dragging) return;
      let x = clientX - offsetX;
      let y = clientY - offsetY;
      // mantém o painel dentro da tela (permite valores negativos de topo
      // quando o painel é mais alto que a janela, ex.: menu aberto)
      const maxX = Math.max(0, window.innerWidth - panelEl.offsetWidth);
      const maxY = window.innerHeight - panelEl.offsetHeight;
      x = Math.max(0, Math.min(x, maxX));
      y = maxY >= 0 ? Math.max(0, Math.min(y, maxY)) : Math.min(0, Math.max(y, maxY));
      panelEl.style.left = x + "px";
      panelEl.style.top = y + "px";
      panelEl.style.right = "auto";
      panelEl.style.transform = "none";
    }

    function endDrag() { dragging = false; }

    // Mouse (desktop)
    handle.addEventListener("mousedown", (e) => startDrag(e.clientX, e.clientY));
    document.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener("mouseup", endDrag);

    // Touch (celular/tablet)
    handle.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      if (t) startDrag(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (t && dragging) {
        moveDrag(t.clientX, t.clientY);
        e.preventDefault();
      }
    }, { passive: false });
    document.addEventListener("touchend", endDrag);
    document.addEventListener("touchcancel", endDrag);
  }

  let minimized = false;

  function toggleMinimize(minimizeBtn) {
    minimized = !minimized;
    contentWrapEl.style.display = minimized ? "none" : "block";
    minimizeBtn.textContent = minimized ? "▢" : "—";
    panelEl.style.width = minimized ? "auto" : "";
  }

  function buildPanel() {
    panelEl = el("div", `
      position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:999999;
      background:#1e1e1e; color:#eee; font-family:sans-serif; font-size:12px;
      border:1px solid #444; border-radius:8px; padding:0;
      width:260px; max-width:92vw; max-height:85vh;
      box-shadow:0 4px 12px rgba(0,0,0,0.5); user-select:none;
      display:flex; flex-direction:column; touch-action:none;
    `);

    const header = el("div", "display:flex; align-items:center; justify-content:space-between; padding:10px; cursor:move; background:#2a2a2a; border-bottom:1px solid #444; font-size:13px; border-radius:8px 8px 0 0; flex-shrink:0;");
    const titleEl = el("div", "font-weight:bold;", "All-In-One Bot");
    const minimizeBtn = el("button", "background:#3a3a3a; color:#eee; border:none; border-radius:4px; width:22px; height:22px; cursor:pointer; font-size:13px; line-height:1; flex-shrink:0;", "—");
    minimizeBtn.onclick = (e) => { e.stopPropagation(); toggleMinimize(minimizeBtn); };
    header.appendChild(titleEl);
    header.appendChild(minimizeBtn);
    panelEl.appendChild(header);
    makeDraggable(header);

    // Tudo que fica abaixo do cabeçalho (abas + conteúdo) rola junto,
    // como um bloco só — assim, mesmo se o conteúdo for mais alto que a
    // tela (comum no celular em modo vertical), dá pra rolar até o
    // botão Start/Stop no final, sem nada ficar inacessível.
    contentWrapEl = el("div", "overflow-y:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;");
    panelEl.appendChild(contentWrapEl);

    tabsEl = el("div", "display:flex; flex-wrap:wrap; gap:3px; padding:6px; background:#181818; border-bottom:1px solid #444;");
    tabs.forEach((t) => {
      const tabBtn = el("div", "flex:1 1 auto; text-align:center; padding:5px 4px; border-radius:4px; cursor:pointer; font-size:11px; background:#2a2a2a; color:#ccc; min-width:62px;");
      tabBtn.textContent = t.label;
      tabBtn.dataset.tabId = t.id;
      tabBtn.onclick = () => switchTab(t.id);
      tabsEl.appendChild(tabBtn);
    });
    contentWrapEl.appendChild(tabsEl);

    bodyEl = el("div", "padding:10px;");
    contentWrapEl.appendChild(bodyEl);

    document.body.appendChild(panelEl);
    switchTab("heal");
  }

  buildPanel();

  // Retoma módulos que estavam ativos antes (persistidos)
  if (Rune.config.enabled) Rune.start();
  if (Haste.config.enabled) Haste.start();
  if (Eat.config.enabled) Eat.start();
  if (Ring.config.enabled) Ring.start();
  if (Monk.config.enabled) Monk.start();
  if (Stones.config.enabled) Stones.start();
  if (Panic.config.enabled) Panic.start();
  if (Heal.config.enabled) Heal.start();
  if (Invisible.config.enabled) Invisible.start();
  if (MagicShield.config.enabled) MagicShield.start();
  if (Follow.config.enabled) Follow.start();
  if (FriendHeal.config.enabled) FriendHeal.start();
  if (LastTarget.config.enabled) LastTarget.start();

  // Talk NÃO inicia sozinho — ative pelo botão "Start Talk" na aba Talk

  window.allInOne = {
    Rune, Haste, Eat, Ring, Monk, Stones, Panic,
    Heal, Invisible, MagicShield, Follow, FriendHeal, LastTarget, Profiles,
    Attack: bot.attack, Cave: bot.cave, GmPanic: bot.panic, Drop: bot.drop, Pz: bot.pz,
    UhPlayer: bot.uhPlayer, AttackSpellCaster,
    Chatdetector: bot.Chatdetector, HazardStepper, PzReturner,
    ZoomBlocker, SwipeNavBlocker, PerformanceMode, HideSpellAnimations,
  };
  
  log("carregado. Painel com 23 abas criado no canto da tela.");
  
  // ✅ Expõe bot GLOBALMENTE para usar no console
  window.bot = bot;
  console.log("[✅] Bot exposto globalmente - use bot.talk");
})();
