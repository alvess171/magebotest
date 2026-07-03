window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.createBot = function createBot() {
  const cleanups = [];
  const defaultAlarmAudioSrc = "https://upload.wikimedia.org/wikipedia/commons/7/78/Cell_Broadcast_Alert_Tone.oga";
  const alarmAudioSrcStorageKey = "minibiaBot.audio.alarmSrc";
  const recentSentChats = [];
  const reconnectButtonSelectors = [
    "button",
    "[role=\"button\"]",
    "input[type=\"button\"]",
    "input[type=\"submit\"]",
    "a",
    ".button",
    ".btn",
  ];
  let alarmAudio = null;
  let reconnectObserver = null;
  let reconnectPollTimerId = null;
  let lastReconnectClickAt = 0;

  function addCleanup(fn) {
    if (typeof fn === "function") {
      cleanups.push(fn);
    }
  }

  function runCleanups() {
    while (cleanups.length) {
      const fn = cleanups.pop();
      try {
        fn();
      } catch (error) {
        console.error("[minibia-bot] cleanup failed", error);
      }
    }
  }

  function getStoredAlarmAudioSrc() {
    try {
      const value = window.localStorage.getItem(alarmAudioSrcStorageKey);
      return value == null ? defaultAlarmAudioSrc : JSON.parse(value);
    } catch (error) {
      return defaultAlarmAudioSrc;
    }
  }

  function setStoredAlarmAudioSrc(src) {
    window.localStorage.setItem(alarmAudioSrcStorageKey, JSON.stringify(src));
    return src;
  }

  function destroyAlarmAudio() {
    if (!alarmAudio) {
      return;
    }

    try {
      alarmAudio.pause();
      alarmAudio.removeAttribute("src");
      alarmAudio.load();
    } catch (error) {
      console.error("[minibia-bot] audio cleanup failed", error);
    }

    alarmAudio = null;
  }

  function getAlarmAudio() {
    const src = getStoredAlarmAudioSrc();
    if (!src) {
      return null;
    }

    if (!alarmAudio) {
      alarmAudio = new Audio(src);
      alarmAudio.preload = "auto";
    } else if (alarmAudio.src !== src) {
      alarmAudio.pause();
      alarmAudio = new Audio(src);
      alarmAudio.preload = "auto";
    }

    return alarmAudio;
  }

  function normalizeChatText(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function rememberSentChat(text) {
    const normalized = normalizeChatText(text);
    if (!normalized) {
      return;
    }

    recentSentChats.push({
      text: normalized,
      at: Date.now(),
    });

    const maxEntries = 20;
    if (recentSentChats.length > maxEntries) {
      recentSentChats.splice(0, recentSentChats.length - maxEntries);
    }
  }

  function isRecentSentChat(text, withinMs = 45000) {
    const normalized = normalizeChatText(text);
    if (!normalized) {
      return false;
    }

    const cutoff = Date.now() - withinMs;
    for (let index = recentSentChats.length - 1; index >= 0; index -= 1) {
      const entry = recentSentChats[index];
      if (entry.at < cutoff) {
        continue;
      }

      if (entry.text === normalized) {
        return true;
      }
    }

    return false;
  }

  function normalizeUiText(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function getSkillWindowValue(skillNames = []) {
    for (const skillName of skillNames) {
      const value =
        document.querySelector(`#skill-window div[skill="${skillName}"] .skill`)?.textContent?.trim() ||
        null;
      if (value) {
        return value;
      }
    }

    return null;
  }

  function parseNumberText(value) {
    if (value == null) {
      return null;
    }

    const normalized = String(value).replace(/[^\d.-]/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function getElementUiText(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    return normalizeUiText(
      element.textContent ||
      element.innerText ||
      element.getAttribute("value") ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    );
  }

  function findReconnectElement() {
    for (const selector of reconnectButtonSelectors) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (!isVisibleElement(candidate)) {
          continue;
        }

        if (getElementUiText(candidate) === "reconnect") {
          return candidate;
        }
      }
    }

    return null;
  }

  function tryClickReconnect() {
    const now = Date.now();
    if (now - lastReconnectClickAt < 3000) {
      return false;
    }

    const reconnectElement = findReconnectElement();
    if (!reconnectElement) {
      return false;
    }

    reconnectElement.click();
    lastReconnectClickAt = now;
    console.log("[minibia-bot] clicked reconnect");
    return true;
  }

  function startReconnectWatcher() {
    if (reconnectObserver || reconnectPollTimerId) {
      return;
    }

    const runCheck = () => {
      try {
        tryClickReconnect();
      } catch (error) {
        console.error("[minibia-bot] reconnect watcher failed", error);
      }
    };

    reconnectObserver = new MutationObserver(runCheck);
    reconnectObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "value"],
    });

    reconnectPollTimerId = window.setInterval(runCheck, 2000);
    runCheck();
  }

  function stopReconnectWatcher() {
    if (reconnectObserver) {
      reconnectObserver.disconnect();
      reconnectObserver = null;
    }

    if (reconnectPollTimerId) {
      window.clearInterval(reconnectPollTimerId);
      reconnectPollTimerId = null;
    }
  }

  startReconnectWatcher();

  return {
    version: "0.3.0",
    addCleanup,
    destroy() {
      if (this.panic?.stop) {
        this.panic.stop();
      }

      if (this.rune?.stop) {
        this.rune.stop({ persistEnabled: false });
      }

      if (this.heal?.stop) {
        this.heal.stop({ persistEnabled: false });
      }

      if (this.invisible?.stop) {
        this.invisible.stop({ persistEnabled: false });
      }

      if (this.attack?.stop) {
        this.attack.stop({ persistEnabled: false });
      }

      if (this.cave?.stop) {
        this.cave.stop({ persistEnabled: false });
      }

      if (this.equipRing?.stop) {
        this.equipRing.stop({ persistEnabled: false });
      }

      if (this.eat?.stop) {
        this.eat.stop({ persistEnabled: false });
      }

      if (this.talk?.stop) {
        this.talk.stop({ persistEnabled: false });
      }

      if (this.ui?.destroy) {
        this.ui.destroy();
      }

      stopReconnectWatcher();
      destroyAlarmAudio();
      runCleanups();
    },
    log(...args) {
      console.log("[minibia-bot]", ...args);
    },
    storage: {
      get(key, fallback = null) {
        try {
          const value = window.localStorage.getItem(key);
          return value == null ? fallback : JSON.parse(value);
        } catch (error) {
          return fallback;
        }
      },
      set(key, value) {
        window.localStorage.setItem(key, JSON.stringify(value));
        return value;
      },
      remove(key) {
        window.localStorage.removeItem(key);
      },
    },
    getPlayerPosition() {
      return window.gameClient?.player?.getPosition?.() || null;
    },
    getPlayerState() {
      return window.gameClient?.player?.state || null;
    },
    getPlayerName() {
      return (
        String(
          this.getPlayerState()?.name ||
          window.gameClient?.player?.name ||
          window.gameClient?.player?.state?.name ||
          ""
        ).trim() || null
      );
    },
    getPlayerSnapshot() {
      const playerState = this.getPlayerState() || {};
      const levelText = getSkillWindowValue(["level"]);
      const magicLevelText = getSkillWindowValue(["magic", "magic-level", "mlvl"]);
      const experienceText = getSkillWindowValue(["experience", "exp"]);
      const capacityText = getSkillWindowValue(["capacity", "cap"]);

      return {
        name: this.getPlayerName(),
        level: parseNumberText(playerState.level) ?? parseNumberText(levelText),
        magicLevel: parseNumberText(playerState.magicLevel ?? playerState.magic_level) ?? parseNumberText(magicLevelText),
        health: parseNumberText(playerState.health),
        maxHealth: parseNumberText(playerState.maxHealth),
        mana: parseNumberText(playerState.mana),
        maxMana: parseNumberText(playerState.maxMana),
        experience: parseNumberText(playerState.experience ?? playerState.exp) ?? parseNumberText(experienceText),
        capacity: parseNumberText(playerState.capacity ?? playerState.cap) ?? parseNumberText(capacityText),
        food: getSkillWindowValue(["food"]),
      };
    },
    sendChat(text) {
      const channelManager = window.gameClient?.interface?.channelManager;
      if (!channelManager || !text) {
        return false;
      }

      channelManager.sendMessageText(text);
      rememberSentChat(text);
      this.log("sent chat:", text);
      return true;
    },
    isRecentSentChat(text, withinMs) {
      return isRecentSentChat(text, withinMs);
    },
    clickReconnect() {
      return tryClickReconnect();
    },
    clickHotbar(index) {
      const button = window.gameClient?.interface?.hotbarManager?.slots?.[index]?.canvas?.canvas;
      if (!button) {
        return false;
      }

      button.click();
      return true;
    },
    getAlarmAudioSrc() {
      return getStoredAlarmAudioSrc();
    },
    setAlarmAudioSrc(src) {
      const nextSrc = String(src || "").trim();
      if (!nextSrc) {
        return false;
      }

      setStoredAlarmAudioSrc(nextSrc);
      destroyAlarmAudio();
      this.log("alarm audio updated", nextSrc);
      return true;
    },
    unlockAudio() {
      try {
        const audio = getAlarmAudio();
        if (!audio) {
          return false;
        }

        audio.muted = true;
        const playResult = audio.play();

        if (playResult && typeof playResult.then === "function") {
          playResult
            .then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = false;
            })
            .catch((error) => {
              audio.muted = false;
              this.log("audio unlock failed", error?.message || error);
            });
        } else {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }

        return true;
      } catch (error) {
        console.error("[minibia-bot] audio unlock failed", error);
        return false;
      }
    },
    playAlarm() {
      try {
        const audio = getAlarmAudio();
        if (!audio) {
          return false;
        }

        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        const playResult = audio.play();

        if (playResult && typeof playResult.catch === "function") {
          playResult.catch((error) => {
            this.log("alarm playback failed", error?.message || error);
          });
        }

        return true;
      } catch (error) {
        console.error("[minibia-bot] alarm failed", error);
        return false;
      }
    },
  };
};

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

window.__minibiaBotBundle.installXrayModule = function installXrayModule(bot) {
  const configStorageKey = "minibiaBot.xray.config";
  const overlayRootId = "minibia-bot-xray-overlay";
  const overlayStyleId = "minibia-bot-xray-overlay-style";
  const overlayState = {
    running: false,
    timerId: null,
  };
  const config = Object.assign(
    {
      overlayEnabled: false,
      selectedFloor: null,
    },
    bot.storage.get(configStorageKey, {})
  );

  config.selectedFloor = normalizeSelectedFloor(config.selectedFloor);

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizeSelectedFloor(value) {
    if (value == null || value === "" || value === "all") {
      return null;
    }

    const floor = Number(value);
    if (!Number.isFinite(floor)) {
      return null;
    }

    return Math.trunc(floor);
  }

  function isWithinVisibleRange(me, pos) {
    if (!me || !pos) {
      return false;
    }

    const dx = Math.abs(pos.x - me.x);
    const dy = Math.abs(pos.y - me.y);
    return dx <= 8 && dy <= 6;
  }

  function getTrackedCreatures() {
    const myState = bot.getPlayerState();
    const myId = window.gameClient?.player?.id;
    const myName = normalizeName(myState?.name);

    return Object.values(window.gameClient?.world?.activeCreatures || {}).filter((creature) => {
      if (!creature) return false;
      if (creature.id === myId) return false;

      const name = normalizeName(creature.name);
      if (name && name === myName) return false;

      return true;
    });
  }

  function getVisibleCreatures() {
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    // Keep the visible query strict; panic logic relies on this staying screen-limited.
    return getTrackedCreatures().filter((creature) => isWithinVisibleRange(me, creature.__position));
  }

  function getVisiblePlayers(options = {}) {
    const { sameFloorOnly = false } = options;
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getVisibleCreatures().filter((creature) => {
      if (creature?.type !== 0) {
        return false;
      }

      if (!sameFloorOnly) {
        return true;
      }

      return creature.__position?.z === me.z;
    });
  }

  function getVisibleMonsters(options = {}) {
    const { sameFloorOnly = false } = options;
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getVisibleCreatures().filter((creature) => {
      if (creature?.type === 0) {
        return false;
      }

      if (!sameFloorOnly) {
        return true;
      }

      return creature.__position?.z === me.z;
    });
  }

  function readCreatureHealth(creature) {
    if (!creature) {
      return null;
    }

    const current = [
      creature.health,
      creature.hp,
      creature.currentHealth,
      creature.state?.health,
    ].find((value) => Number.isFinite(Number(value)));

    const max = [
      creature.maxHealth,
      creature.maxHp,
      creature.maximumHealth,
      creature.state?.maxHealth,
    ].find((value) => Number.isFinite(Number(value)));

    const percent = [
      creature.healthPercent,
      creature.hpPercent,
      creature.healthpercentage,
      creature.state?.healthPercent,
    ].find((value) => Number.isFinite(Number(value)));

    if (current != null && max != null) {
      return `${Number(current)}/${Number(max)} HP`;
    }

    if (percent != null) {
      return `${Math.round(Number(percent))}% HP`;
    }

    if (current != null) {
      return `${Number(current)} HP`;
    }

    return null;
  }

  function getCreatureLabel(creature) {
    if (creature?.name) {
      return creature.name;
    }

    return creature?.type === 0 ? "Player" : "Mob";
  }

  function getOverlayCreatures() {
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getTrackedCreatures().filter((creature) => {
      const pos = creature?.__position;
      if (!pos || pos.z == null) {
        return false;
      }

      if (config.selectedFloor != null && pos.z !== config.selectedFloor) {
        return false;
      }

      if (pos.z !== me.z) {
        return isWithinVisibleRange(me, pos);
      }

      return !isWithinVisibleRange(me, pos);
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getSameFloorOffscreenMarkerText(creature, healthLabel) {
    return healthLabel
      ? `${getCreatureLabel(creature)} ${healthLabel}`
      : `${getCreatureLabel(creature)}`;
  }

  function ensureOverlayStyle() {
    if (document.getElementById(overlayStyleId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = overlayStyleId;
    style.textContent = `
      #${overlayRootId} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 999998;
      }

      #${overlayRootId} .mb-xray-marker {
        position: fixed;
        transform: translate(-50%, -50%);
        padding: 2px 6px;
        border: 1px solid rgba(255, 211, 128, 0.85);
        border-radius: 999px;
        background: rgba(65, 24, 12, 0.72);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
        color: #ffe7ae;
        font: 11px/1.2 Verdana, sans-serif;
        white-space: nowrap;
      }

      #${overlayRootId} .mb-xray-marker.mb-xray-marker-offscreen {
        border-color: rgba(123, 235, 178, 0.92);
        background: rgba(11, 61, 43, 0.8);
        color: #d8ffea;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlayRoot() {
    let root = document.getElementById(overlayRootId);
    if (root) {
      return root;
    }

    root = document.createElement("div");
    root.id = overlayRootId;
    document.body.appendChild(root);
    return root;
  }

  function destroyOverlayElements() {
    document.getElementById(overlayRootId)?.remove();
    document.getElementById(overlayStyleId)?.remove();
  }

  function getViewportRect() {
    const canvases = Array.from(document.querySelectorAll("canvas"))
      .map((canvas) => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 200 && rect.height >= 150)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));

    return canvases[0]?.rect || null;
  }

  function renderOverlay() {
    if (!overlayState.running) {
      return;
    }

    const root = ensureOverlayRoot();
    const me = bot.getPlayerPosition();
    const viewportRect = getViewportRect();
    const creatures = getOverlayCreatures();
    root.innerHTML = "";

    if (!me || !viewportRect || !creatures.length) {
      return;
    }

    const tileWidth = viewportRect.width / 17;
    const tileHeight = viewportRect.height / 13;
    const edgePadding = 48;

    creatures.forEach((creature) => {
      const pos = creature?.__position;
      if (!pos) return;

      const dx = pos.x - me.x;
      const dy = pos.y - me.y;
      const healthLabel = readCreatureHealth(creature);
      const marker = document.createElement("div");
      marker.className = "mb-xray-marker";

      if (pos.z === me.z) {
        marker.classList.add("mb-xray-marker-offscreen");
        marker.textContent = getSameFloorOffscreenMarkerText(creature, healthLabel);
        marker.style.left = `${clamp(
          viewportRect.left + ((dx + 8.5) * tileWidth),
          viewportRect.left + edgePadding,
          viewportRect.right - edgePadding
        )}px`;
        marker.style.top = `${clamp(
          viewportRect.top + ((dy + 6.5) * tileHeight),
          viewportRect.top + edgePadding,
          viewportRect.bottom - edgePadding
        )}px`;
      } else {
        const floorOffset = me.z - pos.z;
        const floorLabel = floorOffset === 0 ? "0" : floorOffset > 0 ? `+${floorOffset}` : `${floorOffset}`;
        marker.textContent = healthLabel
          ? `${getCreatureLabel(creature)} (${floorLabel}) ${healthLabel}`
          : `${getCreatureLabel(creature)} (${floorLabel})`;
        marker.style.left = `${viewportRect.left + ((dx + 8.5) * tileWidth)}px`;
        marker.style.top = `${viewportRect.top + ((dy + 6.5) * tileHeight)}px`;
      }

      root.appendChild(marker);
    });
  }

  function startOverlay() {
    config.overlayEnabled = true;
    persistConfig();

    if (overlayState.running) {
      return false;
    }

    overlayState.running = true;
    ensureOverlayStyle();
    renderOverlay();
    overlayState.timerId = window.setInterval(renderOverlay, 250);
    return true;
  }

  function stopOverlay() {
    config.overlayEnabled = false;
    persistConfig();

    if (!overlayState.running && overlayState.timerId == null) {
      return false;
    }

    overlayState.running = false;
    if (overlayState.timerId != null) {
      window.clearInterval(overlayState.timerId);
      overlayState.timerId = null;
    }

    destroyOverlayElements();
    return true;
  }

  function setOverlayEnabled(enabled) {
    const nextEnabled = !!enabled;

    if (nextEnabled) {
      if (overlayState.running) {
        config.overlayEnabled = true;
        persistConfig();
        return true;
      }

      return startOverlay();
    }

    if (!overlayState.running) {
      config.overlayEnabled = false;
      persistConfig();
      destroyOverlayElements();
      return true;
    }

    return stopOverlay();
  }

  function setSelectedFloor(floor) {
    config.selectedFloor = normalizeSelectedFloor(floor);
    persistConfig();

    if (overlayState.running) {
      renderOverlay();
    }

    return config.selectedFloor;
  }

  function status() {
    return {
      visibleCreatures: getVisibleCreatures().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      visiblePlayers: getVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visiblePlayersCurrentFloor: getVisiblePlayers({ sameFloorOnly: true }).map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visibleMonsters: getVisibleMonsters().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      visibleMonstersCurrentFloor: getVisibleMonsters({ sameFloorOnly: true }).map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      overlayCreatures: getOverlayCreatures().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      config: { ...config },
      overlayRunning: overlayState.running,
    };
  }

  bot.xray = {
    getVisibleCreatures,
    getVisiblePlayers,
    getVisibleMonsters,
    getOverlayCreatures,
    startOverlay,
    stopOverlay,
    setOverlayEnabled,
    setSelectedFloor,
    status,
    config,
  };

  if (config.overlayEnabled) {
    startOverlay();
  } else {
    destroyOverlayElements();
  }
  bot.addCleanup(stopOverlay);
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

window.__minibiaBotBundle.installRuneModule = function installRuneModule(bot) {
  const configStorageKey = "minibiaBot.rune.config";
  const state = {
    running: false,
    timerId: null,
    lastRuneAt: 0,
    nextRuneManaThreshold: null,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 250,
      minHpPercent: 50,
      minFoodSeconds: 30,
      runeSpellWords: "adori vita vis",
      runeManaMin: 600,
      runeManaMax: 600,
      runeCooldownMs: 3500,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 250;

  const legacyManaCost = Math.max(0, Math.trunc(Number(config.runeManaCost) || 0));
  if (legacyManaCost > 0 && config.runeManaMin == null && config.runeManaMax == null) {
    config.runeManaMin = legacyManaCost;
    config.runeManaMax = legacyManaCost;
  }

  function normalizeManaRange(minValue, maxValue) {
    let min = Math.max(0, Math.trunc(Number(minValue) || 0));
    let max = Math.max(0, Math.trunc(Number(maxValue) || 0));

    if (max < min) {
      const swap = min;
      min = max;
      max = swap;
    }

    return { min, max };
  }

  function applyManaRange(minValue, maxValue) {
    const range = normalizeManaRange(minValue, maxValue);
    config.runeManaMin = range.min;
    config.runeManaMax = range.max;
    return range;
  }

  applyManaRange(config.runeManaMin, config.runeManaMax);

  function rollNextManaThreshold() {
    const { min, max } = normalizeManaRange(config.runeManaMin, config.runeManaMax);
    if (min === max) {
      state.nextRuneManaThreshold = min;
      return min;
    }

    state.nextRuneManaThreshold = Math.floor(Math.random() * (max - min + 1)) + min;
    return state.nextRuneManaThreshold;
  }

  function getCurrentManaThreshold() {
    if (!Number.isFinite(state.nextRuneManaThreshold)) {
      return rollNextManaThreshold();
    }

    return state.nextRuneManaThreshold;
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function readStats() {
    const playerState = bot.getPlayerState();

    const hp = playerState
      ? { current: playerState.health ?? 0, max: playerState.maxHealth ?? 0 }
      : null;

    const mana = playerState
      ? { current: playerState.mana ?? 0, max: playerState.maxMana ?? 0 }
      : null;

    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    let food = null;
    if (foodText) {
      const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
      food = match
        ? {
            text: foodText,
            seconds: Number(match[1]) * 60 + Number(match[2]),
          }
        : { text: foodText, seconds: null };
    }

    return { hp, mana, food };
  }

  function getGateStatus(now = Date.now()) {
    const { hp, mana, food } = readStats();
    if (!hp || !mana) {
      return {
        hasStats: false,
        enoughHp: false,
        enoughMana: false,
        enoughFood: false,
        cooldownReady: false,
        cooldownRemainingMs: config.runeCooldownMs,
        canMakeRune: false,
      };
    }

    const hpPercent = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    const enoughHp = hpPercent >= config.minHpPercent;
    const manaThreshold = getCurrentManaThreshold();
    const enoughMana = mana.current >= manaThreshold;
    const enoughFood = food?.seconds == null || food.seconds >= config.minFoodSeconds;
    const cooldownElapsedMs = now - state.lastRuneAt;
    const cooldownRemainingMs = Math.max(0, config.runeCooldownMs - cooldownElapsedMs);
    const cooldownReady = cooldownRemainingMs === 0;

    return {
      hasStats: true,
      enoughHp,
      enoughMana,
      enoughFood,
      cooldownReady,
      cooldownRemainingMs,
      manaThreshold,
      canMakeRune: enoughHp && enoughMana && enoughFood && cooldownReady,
    };
  }

  function canMakeRune(now = Date.now()) {
    return getGateStatus(now).canMakeRune;
  }

  function tryMakeRune() {
    if (!canMakeRune()) {
      return false;
    }

    const manaThreshold = getCurrentManaThreshold();
    const sent = bot.sendChat(config.runeSpellWords);
    if (sent) {
      state.lastRuneAt = Date.now();
      const nextThreshold = rollNextManaThreshold();
      bot.log("rune spell cast", {
        spell: config.runeSpellWords,
        manaThreshold,
        nextManaThreshold: nextThreshold,
      });
    }

    return sent;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      tryMakeRune();
    } catch (error) {
      bot.log("rune tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 250;
    persistConfig();

    if (state.running) {
      bot.log("rune maker already running");
      return false;
    }

    state.running = true;
    rollNextManaThreshold();
    attachResumeListeners();
    bot.log("rune maker started", {
      ...config,
      nextManaThreshold: state.nextRuneManaThreshold,
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

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("rune maker stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
        config: { ...config },
        stats: readStats(),
        gates: getGateStatus(),
        lastRuneAt: state.lastRuneAt,
      };
  }

  function updateConfig(nextConfig = {}) {
    if (
      Object.prototype.hasOwnProperty.call(nextConfig, "runeManaMin") ||
      Object.prototype.hasOwnProperty.call(nextConfig, "runeManaMax") ||
      Object.prototype.hasOwnProperty.call(nextConfig, "runeManaCost")
    ) {
      const range = applyManaRange(
        nextConfig.runeManaMin ?? nextConfig.runeManaCost ?? config.runeManaMin,
        nextConfig.runeManaMax ?? nextConfig.runeManaCost ?? config.runeManaMax
      );
      nextConfig.runeManaMin = range.min;
      nextConfig.runeManaMax = range.max;
      delete nextConfig.runeManaCost;
    }

    Object.assign(config, nextConfig);
    config.tickMs = 250;
    rollNextManaThreshold();
    persistConfig();
    bot.log("rune config updated", {
      ...config,
      nextManaThreshold: state.nextRuneManaThreshold,
    });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.rune = {
    start,
    stop,
    status,
    readStats,
    getGateStatus,
    canMakeRune,
    tryMakeRune,
    config,
    updateConfig,
  };

  bot.startRuneLoop = start;
  bot.stopRuneLoop = stop;
};

// ============================================================
//  src/modules/heal.js
//  Auto-Heal module — segue o padrão installHealModule do bot
//
//  Dois canais independentes com prioridade própria:
//
//  Canal HP:
//    priority "safe"     → usa poção quando HP cai abaixo de minHpSafe     (ex: 70%)
//    priority "critical" → usa poção quando HP cai abaixo de minHpCritical (ex: 30%)
//
//  Canal Mana:
//    priority "safe"     → usa poção quando mana cai abaixo de minManaSafe
//    priority "critical" → usa poção quando mana cai abaixo de minManaCritical
//
//  A prioridade define qual threshold é usado no tick.
//  Ambos os thresholds ficam salvos no config para trocar sem redigitar.
//
//  API:
//    minibiaBot.heal.start()
//    minibiaBot.heal.stop()
//    minibiaBot.heal.status()
//    minibiaBot.heal.updateConfig({ hpPriority: "safe", manaPriority: "critical", ... })
//
//  Exemplos rápidos no console:
//    minibiaBot.heal.start({ hpPriority: "safe", manaPriority: "critical" })
//    minibiaBot.heal.updateConfig({ hpPriority: "critical" })
//    minibiaBot.heal.updateConfig({ minHpSafe: 300, minHpCritical: 100 })
// ============================================================

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

// ============================================================
//  src/modules/heal.js
//
//  HP — dois níveis de cura com prioridade:
//    Nível 1 (fraco):  HP% < threshold1 → hotkey 1
//    Nível 2 (forte):  HP% < threshold2 → hotkey 2 (prioridade maior)
//    O nível 2 é verificado primeiro — se HP estiver muito baixo
//    usa a cura forte, senão usa a fraca.
//
//  Mana — um único nível:
//    Mana < minMana → hotkey mana
// ============================================================

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

// ============================================================
//  src/modules/heal.js
//
//  HP — dois níveis de cura com prioridade:
//    Nível 1 (fraco):  HP% < threshold1 → hotkey 1
//    Nível 2 (forte):  HP% < threshold2 → hotkey 2 (prioridade maior)
//    O nível 2 é verificado primeiro — se HP estiver muito baixo
//    usa a cura forte, senão usa a fraca.
//
//  Mana — um único nível:
//    Mana < minMana → hotkey mana
// ============================================================

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installHealModule = function installHealModule(bot) {

  const CONFIG_KEY = "minibiaBot.heal.config";

  const config = Object.assign(
    {
      tickMs           : 1,
      healCooldownMs   : 100,
      healRetryMs      : 100,
      healConfirmMs    : 100,
      enabled          : false,

      // HP nível 1 — cura fraca (prioridade baixa)
      hpThreshold1     : 90,   // % do HP máximo
      hpHotbarSlot1    : 1,

      // HP nível 2 — cura forte (prioridade alta)
      hpThreshold2     : 60,   // % do HP máximo
      hpHotbarSlot2    : 2,

      // Mana
      manaThreshold    : 50,   // % da mana máxima
      manaHotbarSlot   : 3,
    },
    bot.storage.get(CONFIG_KEY, {})
  );

  const state = {
    running             : false,
    timerId             : null,
    lastHpHeal1At       : 0,
    lastHpHeal2At       : 0,
    lastManaHealAt      : 0,
    lastHpAttempt1At    : 0,
    lastHpAttempt2At    : 0,
    lastManaAttemptAt   : 0,
    pendingHpAttempt1   : null,
    pendingHpAttempt2   : null,
    pendingManaAttempt  : null,
  };

  function persistConfig() { bot.storage.set(CONFIG_KEY, { ...config }); }

  function readStats() {
    const snap = bot.getPlayerSnapshot?.();
    return snap
      ? {
          hp   : { current: Number(snap.health ?? 0), max: Number(snap.maxHealth ?? 0) },
          mana : { current: Number(snap.mana   ?? 0), max: Number(snap.maxMana   ?? 0) },
        }
      : { hp: null, mana: null };
  }

  function normalizeSlot(slot) {
    const n = Math.trunc(Number(slot));
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
  }

  function getHpPct(stats) {
    if (!stats?.hp || stats.hp.max <= 0) return null;
    return (stats.hp.current / stats.hp.max) * 100;
  }

  function getManaPct(stats) {
    if (!stats?.mana || stats.mana.max <= 0) return null;
    return (stats.mana.current / stats.mana.max) * 100;
  }

  // ── Confirmação ─────────────────────────────────────────────

  function didHpHeal(stats, attempt) {
    if (!stats?.hp || !attempt) return false;
    return stats.hp.current > attempt.hpBefore;
  }

  function didManaHeal(stats, attempt) {
    if (!stats?.mana || !attempt) return false;
    return stats.mana.current > attempt.manaBefore;
  }

  function resolvePending(stats, now) {
    const cw = Math.max(50, Number(config.healConfirmMs) || 0);

    if (state.pendingHpAttempt2) {
      if (didHpHeal(stats, state.pendingHpAttempt2)) { state.lastHpHeal2At = state.pendingHpAttempt2.attemptedAt; bot.log("confirmed hp heal 2"); state.pendingHpAttempt2 = null; }
      else if (now - state.pendingHpAttempt2.attemptedAt >= cw) { bot.log("hp heal 2 did not register"); state.pendingHpAttempt2 = null; }
    }

    if (state.pendingHpAttempt1) {
      if (didHpHeal(stats, state.pendingHpAttempt1)) { state.lastHpHeal1At = state.pendingHpAttempt1.attemptedAt; bot.log("confirmed hp heal 1"); state.pendingHpAttempt1 = null; }
      else if (now - state.pendingHpAttempt1.attemptedAt >= cw) { bot.log("hp heal 1 did not register"); state.pendingHpAttempt1 = null; }
    }

    if (state.pendingManaAttempt) {
      if (didManaHeal(stats, state.pendingManaAttempt)) { state.lastManaHealAt = state.pendingManaAttempt.attemptedAt; bot.log("confirmed mana heal"); state.pendingManaAttempt = null; }
      else if (now - state.pendingManaAttempt.attemptedAt >= cw) { bot.log("mana heal did not register"); state.pendingManaAttempt = null; }
    }
  }

  // ── Disparo ──────────────────────────────────────────────────

  function triggerHeal(slot, now, stats, pendingKey, lastHealKey, lastAttemptKey, label) {
    const s = normalizeSlot(slot);
    if (!s) return false;
    if (state[pendingKey]) return false;
    if (now - state[lastHealKey]    < config.healCooldownMs) return false;
    if (now - state[lastAttemptKey] < Math.max(50, Number(config.healRetryMs) || 0)) return false;

    const clicked = bot.clickHotbar(s - 1);
    if (clicked) {
      state[lastAttemptKey] = now;
      state[pendingKey] = {
        attemptedAt : now,
        slot        : s,
        hpBefore    : Number(stats.hp?.current   ?? 0),
        manaBefore  : Number(stats.mana?.current ?? 0),
      };
      bot.log("pressed " + label, { slot: s });
    }
    return clicked;
  }

  function tryHeal() {
    if (!config.enabled) return false;
    const now   = Date.now();
    const stats = readStats();
    resolvePending(stats, now);

    // Não dispara se há cura pendente
    if (state.pendingHpAttempt1 || state.pendingHpAttempt2 || state.pendingManaAttempt) return false;

    const hpPct   = getHpPct(stats);
    const manaPct = getManaPct(stats);

    // ── HP nível 2 (forte) — prioridade alta ─────────────────
    if (hpPct != null && hpPct < Number(config.hpThreshold2)) {
      if (triggerHeal(config.hpHotbarSlot2, now, stats, "pendingHpAttempt2", "lastHpHeal2At", "lastHpAttempt2At", "hp heal 2 (forte)")) return true;
    }

    // ── HP nível 1 (fraco) — prioridade normal ───────────────
    if (hpPct != null && hpPct < Number(config.hpThreshold1)) {
      if (triggerHeal(config.hpHotbarSlot1, now, stats, "pendingHpAttempt1", "lastHpHeal1At", "lastHpAttempt1At", "hp heal 1 (fraco)")) return true;
    }

    // ── Mana ─────────────────────────────────────────────────
    if (manaPct != null && manaPct < Number(config.manaThreshold)) {
      if (triggerHeal(config.manaHotbarSlot, now, stats, "pendingManaAttempt", "lastManaHealAt", "lastManaAttemptAt", "mana heal")) return true;
    }

    return false;
  }

  function tick() {
    if (!state.running) return;
    try { tryHeal(); } catch (e) { bot.log("heal tick error", e?.message); }
    finally { state.timerId = window.setTimeout(tick, config.tickMs); }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) return false;
    state.running = true;
    bot.log("heal started", { ...config });
    tick();
    return true;
  }

  function stop(opts = {}) {
    state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (opts.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    bot.log("heal stopped");
    return true;
  }

  function status() {
    const stats = readStats();
    return {
      running  : state.running,
      config   : { ...config },
      stats,
      hpPct    : getHpPct(stats),
      manaPct  : getManaPct(stats),
    };
  }

  function updateConfig(next = {}) {
    if ("hpHotbarSlot1"  in next) next.hpHotbarSlot1  = normalizeSlot(next.hpHotbarSlot1)  ?? config.hpHotbarSlot1;
    if ("hpHotbarSlot2"  in next) next.hpHotbarSlot2  = normalizeSlot(next.hpHotbarSlot2)  ?? config.hpHotbarSlot2;
    if ("manaHotbarSlot" in next) next.manaHotbarSlot = normalizeSlot(next.manaHotbarSlot) ?? config.manaHotbarSlot;
    if ("hpThreshold1"   in next) next.hpThreshold1   = Math.min(100, Math.max(0, Number(next.hpThreshold1)   || 90));
    if ("hpThreshold2"   in next) next.hpThreshold2   = Math.min(100, Math.max(0, Number(next.hpThreshold2)   || 60));
    if ("manaThreshold"  in next) next.manaThreshold  = Math.min(100, Math.max(0, Number(next.manaThreshold)  || 50));
    ["healRetryMs","healConfirmMs","healCooldownMs"].forEach(k => { if (k in next) next[k] = Math.max(50, Number(next[k]) || 50); });
    Object.assign(config, next);
    persistConfig();
    bot.log("heal config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.heal = { start, stop, status, updateConfig, readStats, tryHeal, normalizeSlot, config };
};

window.__minibiaBotBundle.installAutoInvisibleModule = function installAutoInvisibleModule(bot) {
  const configStorageKey = "minibiaBot.invisible.config";
  const INVISIBLE_CONDITION_ID = 4;
  const state = {
    running: false,
    timerId: null,
    lastCastAt: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 500,
      spellWords: "utana vid",
      recastCooldownMs: 2000,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 500;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getInvisibleConditionId() {
    return window.ConditionManager?.prototype?.INVISIBLE ?? INVISIBLE_CONDITION_ID;
  }

  function isInvisibleActive() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;
    const invisibleConditionId = getInvisibleConditionId();

    if (conditions?.has) {
      return conditions.has(invisibleConditionId);
    }

    if (player?.hasCondition) {
      return player.hasCondition(invisibleConditionId);
    }

    return false;
  }

  function getGateStatus(now = Date.now()) {
    const cooldownRemainingMs = Math.max(0, config.recastCooldownMs - (now - state.lastCastAt));
    const cooldownReady = cooldownRemainingMs === 0;
    const invisibleActive = isInvisibleActive();

    return {
      invisibleActive,
      cooldownReady,
      cooldownRemainingMs,
      canCast: !invisibleActive && cooldownReady,
    };
  }

  function canCastInvisible(now = Date.now()) {
    return getGateStatus(now).canCast;
  }

  function tryCastInvisible(now = Date.now()) {
    if (!config.enabled || !canCastInvisible(now)) {
      return false;
    }

    const sent = bot.sendChat(config.spellWords);
    if (sent) {
      state.lastCastAt = now;
      bot.log("cast invisible spell", { spellWords: config.spellWords });
    }

    return sent;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      tryCastInvisible();
    } catch (error) {
      bot.log("auto invisible tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 500;
    persistConfig();

    if (state.running) {
      bot.log("auto invisible already running");
      return false;
    }

    state.running = true;
    attachResumeListeners();
    bot.log("auto invisible started", { ...config });
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

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("auto invisible stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      lastCastAt: state.lastCastAt,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "spellWords")) {
      nextConfig.spellWords = String(nextConfig.spellWords || "").trim() || config.spellWords;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "recastCooldownMs")) {
      nextConfig.recastCooldownMs = Math.max(0, Number(nextConfig.recastCooldownMs) || 0);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 500;
    persistConfig();
    bot.log("auto invisible config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.invisible = {
    start,
    stop,
    status,
    updateConfig,
    isInvisibleActive,
    canCastInvisible,
    tryCastInvisible,
    config,
  };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoMagicShieldModule = function installAutoMagicShieldModule(bot) {
  const configStorageKey = "minibiaBot.magicShield.config";
  const MAGIC_SHIELD_FALLBACK_DURATION_MS = 180000;
  const state = {
    running: false,
    timerId: null,
    lastCastAt: 0,
    assumedActiveUntil: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 500,
      spellWords: "utamo vita",
      recastCooldownMs: 2000,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 500;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getMagicShieldConditionId() {
    const conditionManagerPrototype = window.ConditionManager?.prototype;
    const playerConditions = window.gameClient?.player?.conditions;
    const candidateKeys = [
      "MAGIC_SHIELD",
      "MANA_SHIELD",
      "MAGICSHIELD",
      "MANASHIELD",
      "UTAMO_VITA",
    ];

    for (const key of candidateKeys) {
      const value = conditionManagerPrototype?.[key] ?? playerConditions?.[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  function isMagicShieldActive(now = Date.now()) {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;
    const magicShieldConditionId = getMagicShieldConditionId();

    if (magicShieldConditionId != null) {
      if (conditions?.has) {
        return conditions.has(magicShieldConditionId);
      }

      if (player?.hasCondition) {
        return player.hasCondition(magicShieldConditionId);
      }
    }

    return now < state.assumedActiveUntil;
  }

  function getGateStatus(now = Date.now()) {
    const cooldownRemainingMs = Math.max(0, config.recastCooldownMs - (now - state.lastCastAt));
    const cooldownReady = cooldownRemainingMs === 0;
    const magicShieldActive = isMagicShieldActive(now);

    return {
      magicShieldActive,
      cooldownReady,
      cooldownRemainingMs,
      canCast: !magicShieldActive && cooldownReady,
    };
  }

  function canCastMagicShield(now = Date.now()) {
    return getGateStatus(now).canCast;
  }

  function tryCastMagicShield(now = Date.now()) {
    if (!config.enabled || !canCastMagicShield(now)) {
      return false;
    }

    const sent = bot.sendChat(config.spellWords);
    if (sent) {
      state.lastCastAt = now;
      state.assumedActiveUntil = now + MAGIC_SHIELD_FALLBACK_DURATION_MS;
      bot.log("cast magic shield spell", { spellWords: config.spellWords });
    }

    return sent;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      tryCastMagicShield();
    } catch (error) {
      bot.log("auto magic shield tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 500;
    persistConfig();

    if (state.running) {
      bot.log("auto magic shield already running");
      return false;
    }

    state.running = true;
    attachResumeListeners();
    bot.log("auto magic shield started", { ...config });
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

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("auto magic shield stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      lastCastAt: state.lastCastAt,
      assumedActiveUntil: state.assumedActiveUntil,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "spellWords")) {
      nextConfig.spellWords = String(nextConfig.spellWords || "").trim() || config.spellWords;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "recastCooldownMs")) {
      nextConfig.recastCooldownMs = Math.max(0, Number(nextConfig.recastCooldownMs) || 0);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 500;
    persistConfig();
    bot.log("auto magic shield config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.magicShield = {
    start,
    stop,
    status,
    updateConfig,
    isMagicShieldActive,
    canCastMagicShield,
    tryCastMagicShield,
    config,
  };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

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
      tickMs: 50,           // tick ultra rápido
      repathMs: 50,        // recalcula caminho bem mais rápido
      observerMs: 50,       // detecta mudança de posição bem mais rápido
      waypointTolerance: 5, // considera chegou com 1 tile de tolerância (mais preciso e rápido)
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
    const targetNames = bot.attack?.config?.targetNames;
    const hasTargetFilter = Array.isArray(targetNames) && targetNames.length > 0;
    if (!hasTargetFilter) return [];
    return bot.attack?.getNearbyMonsters?.() || [];
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
      if (state.running) {
        stop();
        bot.log("cavebot parado pela hotkey " + hotkeyConfig.stopKey);
        showHotkeyToast("🛑 CaveBot parado (" + hotkeyConfig.stopKey + ")");
      }
      return;
    }

    if (e.key === hotkeyConfig.startKey) {
      e.preventDefault();
      if (!state.running) {
        const started = start();
        if (started) {
          bot.log("cavebot iniciado pela hotkey " + hotkeyConfig.startKey);
          showHotkeyToast("▶️ CaveBot iniciado (" + hotkeyConfig.startKey + ")");
        } else {
          showHotkeyToast("⚠️ CaveBot sem waypoints");
        }
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

  bot.cave = {
    start, stop, status, updateConfig, config,
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

window.__minibiaBotBundle.installEquipRingModule = function installEquipRingModule(bot) {
  const configStorageKey = "minibiaBot.equipRing.config";
  const RING_SLOT = 8;
  const state = {
    running: false,
    timerId: null,
    lastEquipAt: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 1000,
      equipCooldownMs: 1500,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 1000;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getEquipment() {
    return window.gameClient?.player?.equipment || null;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDefinition(item) {
    if (!item) return null;

    return (
      window.gameClient?.itemDefinitionsBySid?.[item.sid] ||
      window.gameClient?.itemDefinitions?.[item.id] ||
      null
    );
  }

  function getItemName(item) {
    const definition = getItemDefinition(item);
    return definition?.properties?.name || item?.name || "";
  }

  function isRingItem(item) {
    if (!item) {
      return false;
    }

    const definition = getItemDefinition(item);
    const slotType = String(
      definition?.properties?.slotType ||
      definition?.properties?.slot ||
      ""
    ).trim().toLowerCase();

    if (slotType === "ring") {
      return true;
    }

    return /\bring\b/i.test(getItemName(item));
  }

  function getEquippedRing() {
    const equipment = getEquipment();
    return equipment?.getSlotItem?.(RING_SLOT) || null;
  }

  function hasEquippedRing() {
    return !!getEquippedRing();
  }

  function findBestRingSource() {
    const equipment = getEquipment();
    if (!equipment) {
      return null;
    }

    let best = null;
    let bestCount = -1;

    const consider = (container, slotIndex, item) => {
      if (!isRingItem(item)) {
        return;
      }

      const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
      if (count > bestCount) {
        bestCount = count;
        best = { container, slotIndex, item, count, name: getItemName(item) };
      }
    };

    for (let slotIndex = 0; slotIndex < equipment.slots.length; slotIndex += 1) {
      if (slotIndex === RING_SLOT) continue;
      consider(equipment, slotIndex, equipment.getSlotItem(slotIndex));
    }

    getOpenContainers().forEach((container) => {
      (container?.slots || []).forEach((slot, slotIndex) => {
        consider(container, slotIndex, container.getSlotItem(slotIndex));
      });
    });

    return best;
  }

  function getGateStatus(now = Date.now()) {
    const equipment = getEquipment();
    const source = findBestRingSource();
    const cooldownRemainingMs = Math.max(0, config.equipCooldownMs - (now - state.lastEquipAt));

    return {
      hasEquipment: !!equipment,
      hasRingEquipped: hasEquippedRing(),
      hasRingAvailable: !!source,
      cooldownReady: cooldownRemainingMs === 0,
      cooldownRemainingMs,
      source,
      canEquip: !!equipment && !hasEquippedRing() && !!source && cooldownRemainingMs === 0,
    };
  }

  function canEquipRing(now = Date.now()) {
    return getGateStatus(now).canEquip;
  }

  function tryEquipRing(now = Date.now()) {
    if (!config.enabled || !canEquipRing(now)) {
      return false;
    }

    const equipment = getEquipment();
    const source = findBestRingSource();
    if (!equipment || !source) {
      return false;
    }

    const from = {
      which: source.container,
      index: source.slotIndex,
    };
    const to = {
      which: equipment,
      index: RING_SLOT,
    };
    const count = source.count || 1;

    window.gameClient.send(new ItemMovePacket(from, to, count));
    state.lastEquipAt = now;
    bot.log("equipped ring", {
      name: source.name,
      fromContainerId: source.container?.__containerId ?? null,
      fromSlot: source.slotIndex,
    });
    return true;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      tryEquipRing();
    } catch (error) {
      bot.log("equip ring tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 1000;
    persistConfig();

    if (state.running) {
      bot.log("equip ring already running");
      return false;
    }

    state.running = true;
    attachResumeListeners();
    bot.log("equip ring started", { ...config });
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

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("equip ring stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      equippedRing: getEquippedRing(),
      lastEquipAt: state.lastEquipAt,
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    config.tickMs = 1000;
    persistConfig();
    bot.log("equip ring config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.equipRing = {
    start,
    stop,
    status,
    updateConfig,
    config,
    getEquippedRing,
    hasEquippedRing,
    findBestRingSource,
    getGateStatus,
    canEquipRing,
    tryEquipRing,
  };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoEatModule = function installAutoEatModule(bot) {
  const configStorageKey = "minibiaBot.eat.config";
  const state = {
    running: false,
    timerId: null,
    lastFoodAt: 0,
  };

  const config = Object.assign(
    {
      tickMs: 1000,
      eatCooldownMs: 6000,
      eatHotbarSlot: 10,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 1000;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
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

  function readFoodTimer() {
    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    if (!foodText) return null;

    const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
    return match
      ? {
          text: foodText,
          seconds: Number(match[1]) * 60 + Number(match[2]),
        }
      : { text: foodText, seconds: null };
  }

  function isSated() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;

    if (conditions?.has && conditions.SATED != null) {
      return conditions.has(conditions.SATED);
    }

    const food = readFoodTimer();
    if (food?.seconds != null) {
      return food.seconds > 0;
    }

    return true;
  }

  function tryEat() {
    if (!config.enabled) {
      return false;
    }

    if (isSated()) {
      return false;
    }

    if (Date.now() - state.lastFoodAt < config.eatCooldownMs) {
      return false;
    }

    const slot = normalizeHotbarSlot(config.eatHotbarSlot);
    if (!slot) {
      return false;
    }

    const slotIndex = slot - 1;
    const clicked = bot.clickHotbar(slotIndex);

    if (clicked) {
      state.lastFoodAt = Date.now();
      bot.log("used eat hotkey", { slot });
    }

    return clicked;
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
      tryEat();
    } catch (error) {
      bot.log("auto eat tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 1000;
    persistConfig();

    if (state.running) {
      bot.log("auto eat already running");
      return false;
    }

    state.running = true;
    bot.log("auto eat started", { eatCooldownMs: config.eatCooldownMs, eatHotbarSlot: config.eatHotbarSlot });
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
    bot.log("auto eat stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      lastFoodAt: state.lastFoodAt,
      isSated: isSated(),
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "eatHotbarSlot")) {
      nextConfig.eatHotbarSlot = normalizeHotbarSlot(nextConfig.eatHotbarSlot) ?? config.eatHotbarSlot;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "eatCooldownMs")) {
      nextConfig.eatCooldownMs = Math.max(0, Number(nextConfig.eatCooldownMs) || 0);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 1000;
    persistConfig();
    bot.log("auto eat config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.eat = {
    start,
    stop,
    status,
    updateConfig,
    isSated,
    tryEat,
    normalizeHotbarSlot,
    config,
  };

  bot.startAutoEat = start;
  bot.stopAutoEat = stop;

  if (bot.rune) {
    bot.rune.startAutoEat = start;
    bot.rune.stopAutoEat = stop;
    bot.rune.tryEat = tryEat;
    bot.rune.isSated = isSated;
  }
};

window.__minibiaBotBundle.installTalkModule = function installTalkModule(bot) {
  const configStorageKey = "minibiaBot.talk.config";
  const legacyDefaultModels = ["gemini-3-pro-preview", "gemini-2.0-flash"];
  const defaultModel = "gemini-2.5-flash-lite";
  const defaultSystemPrompt =
    "You are a normal Tibia MMORPG player chatting in Minibia in live in-game chat. Every reply must sound like Tibia player chat: casual, brief, informal, fully lowercase, and natural for a real player typing quickly. Use plain text only. Keep it under 90 characters and under 12 words. Prefer short Tibia-style phrasing, light slang, abbreviations, and simple punctuation when natural. Avoid polished grammar, title case, or assistant-like wording. Write like someone typing mid-hunt or while afk for a sec. Never say you are a bot or AI.";
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

  const config = Object.assign(
    {
      enabled: false,
      apiKey: "",
      model: defaultModel,
      pollMs: minPollMs,
      replyCooldownMs: 1500,
      systemPrompt: defaultSystemPrompt,
      greetingPrompt: defaultGreetingPrompt,
      questionPrompt: defaultQuestionPrompt,
      statementPrompt: defaultStatementPrompt,
    },
    bot.storage.get(configStorageKey, {})
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
      .map((message) => `${message.sender || "player"}: ${message.body}`)
      .join("\n");

    return [
      config.systemPrompt,
      getTypePrompt(messageType),
      "",
      "Channel: Default",
      `Message type: ${messageType}`,
      "Recent chat:",
      transcript || "(none)",
      "",
      `Last message from ${targetMessage.sender}: ${targetMessage.body}`,
      "Reply with one short sentence only.",
      "Avoid repeating the same wording again and again.",
      "Reply text only:",
    ].join("\n");
  }

  async function generateText(prompt, generationConfig = {}) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
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
              maxOutputTokens: 40,
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
        maxOutputTokens: 8,
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
      const contextMessages = getDefaultMessages().slice(-6);
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
      bot.log("talk module requires a Gemini API key");
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

  if (config.enabled && config.apiKey) {
    start();
  }

  bot.talk = {
    start,
    stop,
    status,
    updateConfig,
    getChatMessages,
    config,
  };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoFollowModule = function installAutoFollowModule(bot) {
  const configStorageKey = "minibiaBot.follow.config";

  const state = {
    running: false,
    timerId: null,
    targetName: null,         // nome normalizado do player sendo seguido
    lastMoveAt: 0,            // timestamp do último pathfind
    lastTargetSeenAt: 0,      // última vez que o target estava visível
    lastTargetPosition: null, // última posição conhecida do target
  };

  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 250,
      targetPlayerName: "",   // nome do player a seguir
      followDistance: 2,      // distância desejada em sqm (Chebyshev)
      moveCooldownMs: 400,    // mínimo entre pathfinds consecutivos
      lostTargetMs: 5000,     // ms sem ver o target antes de parar de mover
      maxFollowDistance: 10,  // distância máxima para considerar target visível
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 250;

  // ── helpers ──────────────────────────────────────────────────────────────

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  // Distância de Chebyshev (mesma usada em Tibia-like: max(|dx|,|dy|))
  function getDistance(from, to) {
    if (!from || !to || from.z !== to.z) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
  }

  function getPositionKey(pos) {
    return pos ? `${pos.x},${pos.y},${pos.z}` : null;
  }

  // ── encontrar o target na tela ────────────────────────────────────────────

  function findTargetPlayer() {
    const targetName = normalizeName(config.targetPlayerName);
    if (!targetName) return null;

    const players = bot.xray?.getVisiblePlayers?.({ sameFloorOnly: true }) || [];
    return players.find((p) => normalizeName(p.name) === targetName) || null;
  }

  // ── lógica de movimento ───────────────────────────────────────────────────

  function getTileFromPosition(pos) {
    if (!pos || typeof Position !== "function") return null;
    return (
      window.gameClient?.world?.getTileFromWorldPosition?.(
        new Position(pos.x, pos.y, pos.z)
      ) || null
    );
  }

  // Escolhe a posição para onde mover de modo a ficar a followDistance sqm
  function getDesiredPosition(myPos, targetPos, desiredDist) {
    if (!myPos || !targetPos) return null;

    const dx = targetPos.x - myPos.x;
    const dy = targetPos.y - myPos.y;
    const currentDist = getDistance(myPos, targetPos);

    // Já estamos na distância correta
    if (currentDist === desiredDist) return null;

    // Precisamos nos aproximar ou afastar
    // Calculamos um ponto entre nós e o target, a `desiredDist` sqm do target
    const steps = currentDist - desiredDist;
    if (steps === 0) return null;

    const signX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
    const signY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);

    // Move passo a passo na direção do target (ou de afastamento)
    const moveSteps = Math.min(Math.abs(steps), 3); // máx 3 sqm por pathfind
    const direction = steps > 0 ? 1 : -1; // 1 = aproximar, -1 = afastar

    return {
      x: myPos.x + signX * moveSteps * direction,
      y: myPos.y + signY * moveSteps * direction,
      z: myPos.z,
    };
  }

  function pathTo(pos) {
    if (!pos || typeof Position !== "function") return false;

    const from = bot.getPlayerPosition();
    if (!from) return false;

    const pathfinder = window.gameClient?.world?.pathfinder;
    if (!pathfinder) return false;

    const destTile = getTileFromPosition(pos);
    if (destTile && typeof destTile.isWalkable === "function" && !destTile.isWalkable()) {
      return false;
    }

    try {
      if (typeof pathfinder.findPath === "function") {
        pathfinder.findPath(from, new Position(pos.x, pos.y, pos.z));
      } else if (typeof pathfinder.search === "function") {
        const fromTile = getTileFromPosition(from);
        if (fromTile && destTile) {
          const path = pathfinder.search(fromTile, destTile);
          if (!Array.isArray(path) || path.length === 0) return false;
        }
      } else {
        return false;
      }
      return true;
    } catch (err) {
      bot.log("auto follow pathfind failed", err?.message || err);
      return false;
    }
  }

  // ── tick principal ────────────────────────────────────────────────────────

  function tryFollow() {
    if (!config.enabled) return false;
    if (!config.targetPlayerName) return false;

    const now = Date.now();
    const myPos = normalizePosition(bot.getPlayerPosition());
    if (!myPos) return false;

    const target = findTargetPlayer();

    if (target) {
      const targetPos = normalizePosition(target.__position || target.position);
      if (targetPos) {
        state.lastTargetSeenAt = now;
        state.lastTargetPosition = targetPos;
      }
    }

    const targetPos = state.lastTargetPosition;
    if (!targetPos) return false;

    // Se faz muito tempo sem ver o target, não move
    if (now - state.lastTargetSeenAt > config.lostTargetMs) return false;

    const currentDist = getDistance(myPos, targetPos);
    const desiredDist = Math.max(0, Number(config.followDistance) || 0);

    // Já está na distância certa
    if (currentDist === desiredDist) return false;

    // Cooldown entre movimentos
    if (now - state.lastMoveAt < config.moveCooldownMs) return false;

    // Calcula destino
    const dest = getDesiredPosition(myPos, targetPos, desiredDist);
    if (!dest) return false;

    const moved = pathTo(dest);
    if (moved) {
      state.lastMoveAt = now;
      bot.log("auto follow moving", {
        target: config.targetPlayerName,
        currentDist,
        desiredDist,
        dest,
      });
    }

    return moved;
  }

  function scheduleNextTick() {
    if (!state.running) return;
    state.timerId = window.setTimeout(() => tick(), config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    tick();
  }

  function tick() {
    if (!state.running) return;
    try {
      tryFollow();
    } catch (error) {
      bot.log("auto follow tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  // ── resume listeners ──────────────────────────────────────────────────────

  function handleResume() {
    if (document.hidden) return;
    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) return;
    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) return;
    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  // ── API pública ───────────────────────────────────────────────────────────

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 250;
    persistConfig();

    if (state.running) {
      bot.log("auto follow already running");
      return false;
    }

    state.running = true;
    state.lastTargetPosition = null;
    state.lastTargetSeenAt = 0;
    state.lastMoveAt = 0;
    attachResumeListeners();
    bot.log("auto follow started", {
      target: config.targetPlayerName,
      distance: config.followDistance,
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

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("auto follow stopped");
    return true;
  }

  function status() {
    const myPos = normalizePosition(bot.getPlayerPosition());
    const targetPos = state.lastTargetPosition;
    return {
      running: state.running,
      config: { ...config },
      targetName: config.targetPlayerName || null,
      targetVisible: !!findTargetPlayer(),
      lastTargetSeenAt: state.lastTargetSeenAt,
      lastTargetPosition: targetPos ? { ...targetPos } : null,
      currentDistance: myPos && targetPos ? getDistance(myPos, targetPos) : null,
      desiredDistance: config.followDistance,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "followDistance")) {
      nextConfig.followDistance = Math.max(0, Math.trunc(Number(nextConfig.followDistance) || 0));
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "moveCooldownMs")) {
      nextConfig.moveCooldownMs = Math.max(100, Number(nextConfig.moveCooldownMs) || 400);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "lostTargetMs")) {
      nextConfig.lostTargetMs = Math.max(500, Number(nextConfig.lostTargetMs) || 5000);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "targetPlayerName")) {
      nextConfig.targetPlayerName = String(nextConfig.targetPlayerName || "").trim();
      // Reseta posição cacheada se mudou o target
      if (normalizeName(nextConfig.targetPlayerName) !== normalizeName(config.targetPlayerName)) {
        state.lastTargetPosition = null;
        state.lastTargetSeenAt = 0;
      }
    }

    Object.assign(config, nextConfig);
    config.tickMs = 250;
    persistConfig();
    bot.log("auto follow config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.follow = {
    start,
    stop,
    status,
    updateConfig,
    findTargetPlayer,
    tryFollow,
    config,
  };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installautostackModule = function installautostackModule(bot) {

  const configStorageKey = "minibiaBot.autostack.config";

  const config = Object.assign(
    {
      tickMs   : 2000,
      maxStack : 100,
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

  function getFirstContainer() {
    return getOpenContainers()[0] || null;
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
    const first = getFirstContainer();
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
    Object.assign(config, next);
    persistConfig();
    bot.log("autostack config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.autostack = { start, stop, runOnce, status, updateConfig, config };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installautoringbycapModule = function installautoringbycapModule(bot) {

  const configStorageKey = "minibiaBot.autoringbycap.config";
  const originStorageKey = "minibiaBot.autoringbycap.origin";
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
      bot.log("autoringbycap sendMove error", e?.message || e);
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
      if (!empty) { bot.log("autoringbycap: sem slot vazio para devolver anel"); return false; }
      destContainer = empty.container;
      destSlot      = empty.slotIndex;
    }

    const ok = sendMove(
      { which: eq,            index: RING_SLOT },
      { which: destContainer, index: destSlot  }
    );

    if (ok) {
      state.lastActionAt = now;
      bot.log("autoringbycap: anel removido (cap baixa)", {
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
    if (!src) { bot.log("autoringbycap: nenhum anel encontrado nos containers"); return false; }

    // Salva a origem antes de mover
    state.ringOrigin = { containerId: src.containerId, slotIndex: src.slotIndex };
    persistOrigin();

    const ok = sendMove(
      { which: src.container, index: src.slotIndex },
      { which: eq,            index: RING_SLOT      }
    );

    if (ok) {
      state.lastActionAt = now;
      bot.log("autoringbycap: anel equipado (cap ok)", {
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
      bot.log("autoringbycap tick error", e?.message || e);
    } finally {
      if (state.running) state.timerId = window.setTimeout(tick, config.tickMs);
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) { bot.log("autoringbycap already running"); return false; }
    state.running = true;
    bot.log("autoringbycap started", { ...config });
    tick();
    return true;
  }

  function stop(opts = {}) {
    state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (opts.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    bot.log("autoringbycap stopped");
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
    bot.log("autoringbycap config updated", { ...config });
    return { ...config };
  }

  function clearOrigin() {
    state.ringOrigin = null;
    bot.storage.remove(originStorageKey);
    bot.log("autoringbycap: origem do anel limpa");
  }

  if (config.enabled) start();

  bot.autoringbycap = { start, stop, status, updateConfig, clearOrigin, tryManageRing, config };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

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


window.__minibiaBotBundle.installProfilesModule = function installProfilesModule(bot) {
  const profilesStorageKey = "minibiaBot.profiles.list";
  const activeProfileStorageKey = "minibiaBot.profiles.active";

  // ── Lista de todos os módulos e suas storage keys ─────────────────────────
  const MODULE_CONFIGS = [
    { name: "rune",        key: "minibiaBot.rune.config" },
    { name: "heal",        key: "minibiaBot.heal.config" },
    { name: "invisible",   key: "minibiaBot.invisible.config" },
    { name: "magicShield", key: "minibiaBot.magicShield.config" },
    { name: "attack",      key: "minibiaBot.attack.config" },
    { name: "cave",        key: "minibiaBot.cave.config" },
    { name: "equipRing",   key: "minibiaBot.equipRing.config" },
    { name: "eat",         key: "minibiaBot.eat.config" },
    { name: "talk",        key: "minibiaBot.talk.config" },
    { name: "follow",      key: "minibiaBot.follow.config" },
    { name: "runeCheck",   key: "minibiaBot.runeCheck.config" },
    { name: "pz",          key: "minibiaBot.pz.home" },
    { name: "xray",        key: "minibiaBot.xray.config" },
    { name: "panic",       key: "minibiaBot.panic.config" },
  ];

  // ── storage helpers ───────────────────────────────────────────────────────

  function loadProfiles() {
    return bot.storage.get(profilesStorageKey, {}) || {};
  }

  function saveProfiles(profiles) {
    bot.storage.set(profilesStorageKey, profiles);
  }

  function getActiveProfileName() {
    return bot.storage.get(activeProfileStorageKey, null);
  }

  function setActiveProfileName(name) {
    if (name) {
      bot.storage.set(activeProfileStorageKey, name);
    } else {
      bot.storage.remove(activeProfileStorageKey);
    }
  }

  // ── captura snapshot de todas as configs atuais ───────────────────────────

  function captureSnapshot() {
    const snapshot = {};
    for (const { name, key } of MODULE_CONFIGS) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw != null) {
          snapshot[name] = JSON.parse(raw);
        }
      } catch (err) {
        bot.log(`profiles: failed to read ${name} config`, err?.message || err);
      }
    }
    return snapshot;
  }

  // ── aplica snapshot restaurando cada config no localStorage ──────────────

  function applySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;

    for (const { name, key } of MODULE_CONFIGS) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, name)) continue;

      try {
        window.localStorage.setItem(key, JSON.stringify(snapshot[name]));
      } catch (err) {
        bot.log(`profiles: failed to restore ${name} config`, err?.message || err);
      }
    }

    return true;
  }

  // ── API pública ───────────────────────────────────────────────────────────

  function listProfiles() {
    return Object.keys(loadProfiles()).sort();
  }

  function saveProfile(profileName) {
    const name = String(profileName || "").trim();
    if (!name) {
      bot.log("profiles: profile name cannot be empty");
      return false;
    }

    const profiles = loadProfiles();
    profiles[name] = {
      savedAt: Date.now(),
      configs: captureSnapshot(),
    };
    saveProfiles(profiles);
    setActiveProfileName(name);
    bot.log(`profiles: saved "${name}"`, { modules: Object.keys(profiles[name].configs) });
    return true;
  }

  function loadProfile(profileName) {
    const name = String(profileName || "").trim();
    if (!name) {
      bot.log("profiles: profile name cannot be empty");
      return false;
    }

    const profiles = loadProfiles();
    const profile = profiles[name];
    if (!profile) {
      bot.log(`profiles: profile "${name}" not found`, { available: Object.keys(profiles) });
      return false;
    }

    const applied = applySnapshot(profile.configs);
    if (!applied) {
      bot.log(`profiles: failed to apply "${name}"`);
      return false;
    }

    setActiveProfileName(name);
    bot.log(`profiles: loaded "${name}" — reloading bot...`);

    // Recarrega o bot para aplicar as novas configs
    window.setTimeout(() => {
      window.minibiaBotReload?.();
    }, 100);

    return true;
  }

  function deleteProfile(profileName) {
    const name = String(profileName || "").trim();
    if (!name) return false;

    const profiles = loadProfiles();
    if (!Object.prototype.hasOwnProperty.call(profiles, name)) {
      bot.log(`profiles: profile "${name}" not found`);
      return false;
    }

    delete profiles[name];
    saveProfiles(profiles);

    if (getActiveProfileName() === name) {
      setActiveProfileName(null);
    }

    bot.log(`profiles: deleted "${name}"`);
    return true;
  }

  function renameProfile(oldName, newName) {
    const from = String(oldName || "").trim();
    const to = String(newName || "").trim();
    if (!from || !to || from === to) return false;

    const profiles = loadProfiles();
    if (!profiles[from]) {
      bot.log(`profiles: profile "${from}" not found`);
      return false;
    }

    if (profiles[to]) {
      bot.log(`profiles: profile "${to}" already exists`);
      return false;
    }

    profiles[to] = profiles[from];
    delete profiles[from];
    saveProfiles(profiles);

    if (getActiveProfileName() === from) {
      setActiveProfileName(to);
    }

    bot.log(`profiles: renamed "${from}" → "${to}"`);
    return true;
  }

  function exportProfile(profileName) {
    const name = String(profileName || "").trim();
    const profiles = loadProfiles();
    const profile = name ? profiles[name] : null;
    const data = name
      ? (profile ? { [name]: profile } : null)
      : profiles;

    if (!data) {
      bot.log(`profiles: profile "${name}" not found`);
      return null;
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name ? `minibia-profile-${name}.json` : "minibia-profiles.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    bot.log(`profiles: exported "${name || "all profiles"}"`);
    return json;
  }

  function importProfiles(jsonString, overwrite = false) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (err) {
      bot.log("profiles: import failed — invalid JSON", err?.message || err);
      return false;
    }

    if (typeof data !== "object" || !data) {
      bot.log("profiles: import failed — expected an object");
      return false;
    }

    const profiles = loadProfiles();
    let imported = 0;

    for (const [name, profile] of Object.entries(data)) {
      if (!name || typeof profile !== "object") continue;
      if (!overwrite && profiles[name]) {
        bot.log(`profiles: skipped "${name}" (already exists, use overwrite=true)`);
        continue;
      }
      profiles[name] = profile;
      imported++;
    }

    saveProfiles(profiles);
    bot.log(`profiles: imported ${imported} profile(s)`);
    return imported > 0;
  }

  function status() {
    const names = listProfiles();
    const active = getActiveProfileName();
    return {
      profiles: names,
      activeProfile: active,
      count: names.length,
    };
  }

  bot.profiles = {
    list: listProfiles,
    save: saveProfile,
    load: loadProfile,
    delete: deleteProfile,
    rename: renameProfile,
    export: exportProfile,
    import: importProfiles,
    status,
    getActiveProfileName,
  };

  bot.log("profiles module ready", {
    profiles: listProfiles(),
    active: getActiveProfileName(),
  });
};
 
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installFriendHealModule = function installFriendHealModule(bot) {
  const configStorageKey = "minibiaBot.friendHeal.config";
  const state = { running: false, timerId: null, lastHealAt: 0, lastAttemptAt: 0, pendingAttempt: null };
  const config = Object.assign({ tickMs: 100, healCooldownMs: 1500, healRetryMs: 300, healConfirmMs: 400, minHpPercent: 70, spellWords: "exura sio", targetName: "", enabled: false }, bot.storage.get(configStorageKey, {}));
  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
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
    const pct = Number(c.healthPercent ?? c.hpPercent ?? c.healthpercentage ?? c.state?.healthPercent);
    return Number.isFinite(pct) ? pct : null;
  }
  function readHpAbs(c) {
    if (!c) return null;
    const hp = Number(c.health ?? c.hp ?? c.currentHealth ?? c.state?.health);
    return Number.isFinite(hp) ? hp : null;
  }
  function buildCmd() {
    const n = String(config.targetName || "").trim();
    const s = String(config.spellWords || "exura sio").trim();
    return n ? `${s} "${n}"` : null;
  }
  function didSucceed(c, a) {
    if (!c || !a) return false;
    const hp = readHpAbs(c); if (hp != null && hp > a.hpBefore) return true;
    const pct = readHpPct(c); return pct != null && pct > a.pctBefore;
  }
  function resolvePending(c, now) {
    if (!state.pendingAttempt) return;
    if (didSucceed(c, state.pendingAttempt)) { state.lastHealAt = state.pendingAttempt.attemptedAt; bot.log("friend heal confirmed", { target: config.targetName }); state.pendingAttempt = null; return; }
    if (now - state.pendingAttempt.attemptedAt >= Math.max(50, Number(config.healConfirmMs) || 400)) { bot.log("friend heal no HP change"); state.pendingAttempt = null; }
  }
  function canHeal(now, c) {
    if (!c || state.pendingAttempt) return false;
    if (now - state.lastHealAt < Math.max(0, Number(config.healCooldownMs) || 1500)) return false;
    if (now - state.lastAttemptAt < Math.max(50, Number(config.healRetryMs) || 300)) return false;
    const pct = readHpPct(c); return pct != null && pct <= Math.max(0, Number(config.minHpPercent) || 70);
  }
  function tryHeal() {
    if (!config.enabled) return false;
    const now = Date.now(), c = findTargetCreature();
    resolvePending(c, now);
    if (!canHeal(now, c)) return false;
    const cmd = buildCmd(); if (!cmd) return false;
    const sent = bot.sendChat(cmd);
    if (sent) { state.lastAttemptAt = now; state.pendingAttempt = { attemptedAt: now, spell: cmd, hpBefore: readHpAbs(c) ?? 0, pctBefore: readHpPct(c) ?? 0 }; bot.log("friend heal cast", { target: config.targetName, hp: state.pendingAttempt.pctBefore.toFixed(1) + "%" }); }
    return sent;
  }
  function tick() { if (!state.running) return; try { tryHeal(); } catch (e) { bot.log("friend heal tick error", e?.message); } finally { if (state.running) state.timerId = window.setTimeout(tick, config.tickMs); } }
  function start(ov = {}) { Object.assign(config, ov, { enabled: true }); persistConfig(); if (state.running) return false; state.running = true; bot.log("friend heal started", { ...config }); tick(); return true; }
  function stop(opts = {}) { const p = opts.persistEnabled !== false; state.running = false; if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; } if (p) { config.enabled = false; persistConfig(); } state.pendingAttempt = null; bot.log("friend heal stopped"); return true; }
  function status() { const c = findTargetCreature(); return { running: state.running, config: { ...config }, targetFound: !!c, targetHpPercent: readHpPct(c), lastHealAt: state.lastHealAt }; }
  function updateConfig(next = {}) {
    if ("minHpPercent" in next) next.minHpPercent = Math.min(100, Math.max(0, Number(next.minHpPercent) || 70));
    if ("targetName" in next) next.targetName = String(next.targetName || "").trim();
    if ("spellWords" in next) next.spellWords = String(next.spellWords || "exura sio").trim() || "exura sio";
    if ("healCooldownMs" in next) next.healCooldownMs = Math.max(0, Number(next.healCooldownMs) || 1500);
    Object.assign(config, next); persistConfig(); return { ...config };
  }
  if (config.enabled && config.targetName) start();
  bot.friendHeal = { start, stop, status, updateConfig, tryHeal, config };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoSpellModule = function installAutoSpellModule(bot) {
  const configStorageKey = "minibiaBot.autoSpell.config";
  const state = { running: false, timerId: null, lastCastAt: 0 };
  const config = Object.assign({ tickMs: 200, spellWords: "exori", minMobCount: 2, cooldownMs: 2000, enabled: false }, bot.storage.get(configStorageKey, {}));
  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function getAdjacentMobs() {
    const playerPos = bot.getPlayerPosition();
    if (!playerPos) return [];
    return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []).filter((creature) => {
      const pos = creature?.__position || creature?.getPosition?.();
      if (!pos || pos.z !== playerPos.z) return false;
      return Math.abs(pos.x - playerPos.x) <= 1 && Math.abs(pos.y - playerPos.y) <= 1;
    });
  }
  function isCombatActive() { return !!bot.attack?.isCombatActive?.(); }
  function canCast(now) {
    if (!config.enabled || !isCombatActive()) return false;
    if (now - state.lastCastAt < Math.max(0, Number(config.cooldownMs) || 2000)) return false;
    return getAdjacentMobs().length >= Math.max(1, Number(config.minMobCount) || 2);
  }
  function tryCast() {
    const now = Date.now();
    if (!canCast(now)) return false;
    const sent = bot.sendChat(config.spellWords);
    if (sent) { state.lastCastAt = now; bot.log("auto spell cast", { spell: config.spellWords, mobs: getAdjacentMobs().length }); }
    return sent;
  }
  function tick() { if (!state.running) return; try { tryCast(); } catch (e) { bot.log("auto spell tick error", e?.message); } finally { if (state.running) state.timerId = window.setTimeout(tick, config.tickMs); } }
  function start(ov = {}) { Object.assign(config, ov, { enabled: true }); persistConfig(); if (state.running) return false; state.running = true; bot.log("auto spell started", { ...config }); tick(); return true; }
  function stop(opts = {}) { const p = opts.persistEnabled !== false; state.running = false; if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; } if (p) { config.enabled = false; persistConfig(); } bot.log("auto spell stopped"); return true; }
  function status() { return { running: state.running, config: { ...config }, adjacentMobs: getAdjacentMobs().length, combatActive: isCombatActive(), lastCastAt: state.lastCastAt }; }
  function updateConfig(next = {}) {
    if ("spellWords" in next) next.spellWords = String(next.spellWords || "").trim() || config.spellWords;
    if ("minMobCount" in next) next.minMobCount = Math.max(1, Math.trunc(Number(next.minMobCount) || 2));
    if ("cooldownMs" in next) next.cooldownMs = Math.max(500, Number(next.cooldownMs) || 2000);
    Object.assign(config, next); persistConfig(); return { ...config };
  }
  if (config.enabled) start();
  bot.autoSpell = { start, stop, status, updateConfig, getAdjacentMobs, tryCast, config };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installDistanceAttackModule = function installDistanceAttackModule(bot) {
  const configStorageKey = "minibiaBot.distanceAttack.config";
  const state = { running: false, timerId: null, lastCastAt: 0, lastMoveAt: 0, stuckCount: 0, lastPlayerPos: null, lastStuckAngle: null };
  const config = Object.assign({ tickMs: 300, keepDistance: 3, runeHotbarSlot: 4, runeCooldownMs: 1200, enabled: false }, bot.storage.get(configStorageKey, {}));
  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function normalizePos(p) { if (!p) return null; const x = Number(p.x), y = Number(p.y), z = Number(p.z); if (!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)) return null; return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }; }
  function getTileDistance(a, b) { if (!a||!b||a.z!==b.z) return Number.POSITIVE_INFINITY; return Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y)); }
  function isTileWalkable(x, y, z) { try { const t = window.gameClient?.world?.getTileFromWorldPosition?.(new Position(x,y,z)); return !!t?.isWalkable?.(); } catch(e) { return false; } }
  function getCurrentTarget() { return window.gameClient?.player?.__target || null; }
  function isCombatActive() { return !!bot.attack?.isCombatActive?.(); }
  function getKeepDistance() { return Math.max(1, Math.trunc(Number(config.keepDistance)||3)); }
  function findEscapePosition(playerPos, targetPos, desiredDistance, startAngleDeg) {
    if (!playerPos||!targetPos) return null;
    const dx = playerPos.x-targetPos.x, dy = playerPos.y-targetPos.y;
    const baseAngle = Math.atan2(dy, dx);
    const startRad = startAngleDeg != null ? (startAngleDeg * Math.PI / 180) : baseAngle;
    const arcSteps = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180];
    for (const stepDeg of arcSteps) {
      const angle = startRad + (stepDeg * Math.PI / 180);
      const nx = Math.cos(angle), ny = Math.sin(angle);
      for (let dist = desiredDistance; dist >= 1; dist--) {
        const cx = Math.round(targetPos.x + nx * dist), cy = Math.round(targetPos.y + ny * dist);
        if (cx === playerPos.x && cy === playerPos.y) continue;
        if (!isTileWalkable(cx, cy, playerPos.z)) continue;
        return { position: { x: cx, y: cy, z: playerPos.z }, angleDeg: (angle * 180 / Math.PI) };
      }
    }
    for (let radius = 1; radius <= 5; radius++) {
      const candidates = [];
      for (let dx2 = -radius; dx2 <= radius; dx2++) for (let dy2 = -radius; dy2 <= radius; dy2++) { if (Math.abs(dx2)!==radius && Math.abs(dy2)!==radius) continue; candidates.push({ x: playerPos.x+dx2, y: playerPos.y+dy2 }); }
      candidates.sort((a,b) => getTileDistance(b,targetPos)-getTileDistance(a,targetPos));
      for (const c of candidates) { if (!isTileWalkable(c.x, c.y, playerPos.z)) continue; return { position: { x: c.x, y: c.y, z: playerPos.z }, angleDeg: null }; }
    }
    return null;
  }
  function goToPosition(pos) { const from = bot.getPlayerPosition(); if (!from||!pos) return false; try { window.gameClient?.world?.pathfinder?.findPath?.(from, new Position(pos.x,pos.y,pos.z)); return true; } catch(e) { return false; } }
  function tryDistanceAttack() {
    if (!config.enabled||!isCombatActive()) return false;
    const target = getCurrentTarget(); if (!target) return false;
    const playerPos = normalizePos(bot.getPlayerPosition());
    const targetPos = normalizePos(target.__position || target.getPosition?.());
    if (!playerPos||!targetPos) return false;
    const distance = getTileDistance(playerPos, targetPos);
    const desiredDist = getKeepDistance();
    const now = Date.now();
    const moved = !state.lastPlayerPos || state.lastPlayerPos.x!==playerPos.x || state.lastPlayerPos.y!==playerPos.y;
    if (!moved && state.lastMoveAt > 0 && now-state.lastMoveAt >= 800) { state.stuckCount++; } else if (moved) { state.stuckCount = 0; state.lastStuckAngle = null; }
    state.lastPlayerPos = { ...playerPos };
    if (distance < desiredDist) {
      if (now - state.lastMoveAt >= 300) {
        const result = findEscapePosition(playerPos, targetPos, desiredDist, state.stuckCount > 0 ? state.lastStuckAngle : null);
        if (result) { goToPosition(result.position); state.lastMoveAt = now; if (result.angleDeg != null) state.lastStuckAngle = result.angleDeg + (state.stuckCount > 1 ? 45 : 0); bot.log("distance attack kiting", { from: distance, desired: desiredDist, stuck: state.stuckCount }); }
      }
      return false;
    }
    if (distance > desiredDist + 2) {
      if (now - state.lastMoveAt >= 400) { const result = findEscapePosition(targetPos, playerPos, desiredDist, null); if (result) { goToPosition(result.position); state.lastMoveAt = now; } }
      return false;
    }
    const slot = Math.trunc(Number(config.runeHotbarSlot)||4);
    if (slot < 1||slot > 12) return false;
    if (now - state.lastCastAt < Math.max(0, Number(config.runeCooldownMs)||1200)) return false;
    const clicked = bot.clickHotbar(slot-1);
    if (clicked) { state.lastCastAt = now; state.stuckCount = 0; bot.log("distance attack fired", { slot, distance }); }
    return clicked;
  }
  function tick() { if (!state.running) return; try { tryDistanceAttack(); } catch(e) { bot.log("distance attack tick error", e?.message); } finally { if (state.running) state.timerId = window.setTimeout(tick, config.tickMs); } }
  function start(ov = {}) { Object.assign(config, ov, { enabled: true }); persistConfig(); if (state.running) return false; state.running = true; state.stuckCount = 0; state.lastStuckAngle = null; state.lastPlayerPos = null; bot.log("distance attack started", { ...config }); tick(); return true; }
  function stop(opts = {}) { const p = opts.persistEnabled !== false; state.running = false; if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; } if (p) { config.enabled = false; persistConfig(); } bot.log("distance attack stopped"); return true; }
  function status() { const target = getCurrentTarget(); const playerPos = normalizePos(bot.getPlayerPosition()); const targetPos = target ? normalizePos(target.__position||target.getPosition?.()) : null; return { running: state.running, config: { ...config }, combatActive: isCombatActive(), currentTarget: target ? { id: target.id, name: target.name } : null, distanceToTarget: getTileDistance(playerPos, targetPos), keepDistance: getKeepDistance(), lastCastAt: state.lastCastAt, stuckCount: state.stuckCount }; }
  function updateConfig(next = {}) {
    if ("keepDistance" in next) next.keepDistance = Math.max(1, Math.min(10, Math.trunc(Number(next.keepDistance)||3)));
    if ("runeHotbarSlot" in next) next.runeHotbarSlot = Math.max(1, Math.min(12, Math.trunc(Number(next.runeHotbarSlot)||4)));
    if ("runeCooldownMs" in next) next.runeCooldownMs = Math.max(200, Number(next.runeCooldownMs)||1200);
    Object.assign(config, next); persistConfig(); return { ...config };
  }
  if (config.enabled) start();
  bot.distanceAttack = { start, stop, status, updateConfig, tryDistanceAttack, config };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installMeleePositionModule = function installMeleePositionModule(bot) {

  // ============================================================
  //  melee-position.js
  //
  //  Movimenta o player para ficar adjacente ao target antes
  //  de disparar a spell de ataque melee/AoE.
  //
  //  Direções (getLookDirection):
  //    0 = Norte  → player deve ficar ao Sul  do mob (y+1)
  //    1 = Leste  → player deve ficar ao Oeste do mob (x-1)
  //    2 = Sul    → player deve ficar ao Norte do mob (y-1)
  //    3 = Oeste  → player deve ficar ao Leste do mob (x+1)
  //
  //  Modo "frente": tenta ficar na frente do mob (onde ele olha)
  //  Modo "any":    qualquer tile adjacente walkable serve
  //
  //  Só dispara a spell quando estiver adjacente ao target.
  // ============================================================

  const CONFIG_KEY = "minibiaBot.meleePosition.config";

  const config = Object.assign(
    {
      enabled       : false,
      tickMs        : 200,
      spellHotbarSlot: 5,
      spellCooldownMs: 2000,
      mode          : "any",
      requireAdjacent: true,
    },
    bot.storage.get(CONFIG_KEY, {})
  );

  // Normaliza requireAdjacent — pode vir como string do localStorage
  config.requireAdjacent = config.requireAdjacent === true || config.requireAdjacent === "true";

  const state = {
    running      : false,
    timerId      : null,
    lastCastAt   : 0,
    lastMoveAt   : 0,
    stuckCount   : 0,       // quantas vezes seguidas não conseguiu chegar
    lastPlayerPos: null,    // posição anterior para detectar stuck
    lastTargetId : null,    // id do target atual
  };

  function persistConfig() { bot.storage.set(CONFIG_KEY, { ...config }); }

  function normalizePos(p) {
    if (!p) return null;
    const x = Number(p.x), y = Number(p.y), z = Number(p.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function isTileWalkable(x, y, z) {
    try {
      const tile = window.gameClient?.world?.getTileFromWorldPosition?.(new Position(x, y, z));
      return !!tile?.isWalkable?.();
    } catch (e) { return false; }
  }

  function isSameTile(a, b) {
    return a && b && a.x === b.x && a.y === b.y && a.z === b.z;
  }

  function isAdjacent(a, b) {
    if (!a || !b || a.z !== b.z) return false;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (config.mode === "diagonal") {
      // Adjacente diagonal: exatamente 1 em cada eixo
      return dx === 1 && dy === 1;
    }
    // Ortogonal: exatamente 1 tile em apenas um eixo (N/S/L/O)
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }

  function getCurrentTarget() {
    return window.gameClient?.player?.__target || null;
  }

  function isCombatActive() {
    return !!bot.attack?.isCombatActive?.();
  }

  // Retorna a posição "frente" do mob baseado na direção que ele olha
  function getFrontPosition(targetPos, direction) {
    // Mob olha para direção X → frente dele é oposta
    // 0=Norte(olha pra cima)  → frente é y-1
    // 1=Leste(olha pra dir)   → frente é x+1
    // 2=Sul(olha pra baixo)   → frente é y+1
    // 3=Oeste(olha pra esq)   → frente é x-1
    const fronts = {
      0: { x: targetPos.x,   y: targetPos.y - 1, z: targetPos.z }, // Norte → frente ao Norte
      1: { x: targetPos.x + 1, y: targetPos.y,   z: targetPos.z }, // Leste → frente ao Leste
      2: { x: targetPos.x,   y: targetPos.y + 1, z: targetPos.z }, // Sul → frente ao Sul
      3: { x: targetPos.x - 1, y: targetPos.y,   z: targetPos.z }, // Oeste → frente ao Oeste
    };
    return fronts[direction] || null;
  }

  // Retorna todos os tiles adjacentes ao target (ortogonais + diagonais)
  function getAdjacentPositions(targetPos, includeDiagonal = true) {
    const ortogonais = [
      { x: targetPos.x,     y: targetPos.y - 1, z: targetPos.z }, // Norte
      { x: targetPos.x + 1, y: targetPos.y,     z: targetPos.z }, // Leste
      { x: targetPos.x,     y: targetPos.y + 1, z: targetPos.z }, // Sul
      { x: targetPos.x - 1, y: targetPos.y,     z: targetPos.z }, // Oeste
    ];
    const diagonais = [
      { x: targetPos.x + 1, y: targetPos.y - 1, z: targetPos.z }, // Nordeste
      { x: targetPos.x + 1, y: targetPos.y + 1, z: targetPos.z }, // Sudeste
      { x: targetPos.x - 1, y: targetPos.y + 1, z: targetPos.z }, // Sudoeste
      { x: targetPos.x - 1, y: targetPos.y - 1, z: targetPos.z }, // Noroeste
    ];
    return includeDiagonal ? [...ortogonais, ...diagonais] : ortogonais;
  }

  // Retorna o tile adjacente walkable mais próximo do player
  function getBestAdjacentPosition(playerPos, targetPos) {
    // Posições ortogonais (N, S, L, O) — sempre preferidas
    const ortogonais = [
      { x: targetPos.x,     y: targetPos.y - 1, z: targetPos.z }, // Norte
      { x: targetPos.x + 1, y: targetPos.y,     z: targetPos.z }, // Leste
      { x: targetPos.x,     y: targetPos.y + 1, z: targetPos.z }, // Sul
      { x: targetPos.x - 1, y: targetPos.y,     z: targetPos.z }, // Oeste
    ];

    // Posições diagonais — fallback se todas ortogonais estiverem bloqueadas
    const diagonais = [
      { x: targetPos.x + 1, y: targetPos.y - 1, z: targetPos.z }, // Nordeste
      { x: targetPos.x + 1, y: targetPos.y + 1, z: targetPos.z }, // Sudeste
      { x: targetPos.x - 1, y: targetPos.y + 1, z: targetPos.z }, // Sudoeste
      { x: targetPos.x - 1, y: targetPos.y - 1, z: targetPos.z }, // Noroeste
    ];

    const sortByDist = (list) => list
      .filter(p => isTileWalkable(p.x, p.y, p.z))
      .sort((a, b) => {
        const da = Math.abs(a.x - playerPos.x) + Math.abs(a.y - playerPos.y);
        const db = Math.abs(b.x - playerPos.x) + Math.abs(b.y - playerPos.y);
        return da - db;
      });

    if (config.mode === "diagonal") {
      // Preferência para diagonal, fallback para ortogonal
      return sortByDist(diagonais)[0] || sortByDist(ortogonais)[0] || null;
    }

    // "any" ou "ortogonal" — preferência para ortogonal, fallback para diagonal
    return sortByDist(ortogonais)[0] || sortByDist(diagonais)[0] || null;
  }

  function goToPosition(pos) {
    const from = bot.getPlayerPosition();
    if (!from || !pos) return false;
    try {
      window.gameClient?.world?.pathfinder?.findPath?.(from, new Position(pos.x, pos.y, pos.z));
      return true;
    } catch (e) { return false; }
  }

  function tryMeleePosition() {
    if (!config.enabled) return false;
    if (!isCombatActive()) return false;

    const target = getCurrentTarget();
    if (!target) return false;

    const playerPos = normalizePos(bot.getPlayerPosition());
    const targetPos = normalizePos(target.__position || target.getPosition?.());
    if (!playerPos || !targetPos) return false;

    const now = Date.now();

    // Verifica se já está adjacente
    const alreadyAdjacent = isAdjacent(playerPos, targetPos);

    if (!alreadyAdjacent) {
      // Move para posição adjacente
      if (now - state.lastMoveAt >= 300) {
        const dest = getBestAdjacentPosition(playerPos, targetPos);
        if (dest && !isSameTile(dest, playerPos)) {
          goToPosition(dest);
          state.lastMoveAt = now;
          bot.log("melee position moving", { dest, mode: config.mode });
        }
      }

      // Se requireAdjacent, não dispara enquanto não estiver no lugar
      if (config.requireAdjacent) return false;
    }

    // Está adjacente — dispara a spell
    const slot = Math.trunc(Number(config.spellHotbarSlot) || 5);
    if (slot < 1 || slot > 12) return false;
    if (now - state.lastCastAt < Math.max(0, Number(config.spellCooldownMs) || 2000)) return false;

    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      state.lastCastAt = now;
      bot.log("melee position spell fired", {
        slot,
        playerPos,
        targetPos,
        direction,
        adjacent: alreadyAdjacent,
      });
    }
    return clicked;
  }

  function tick() {
    if (!state.running) return;
    try { tryMeleePosition(); }
    catch (e) { bot.log("melee position tick error", e?.message); }
    finally { if (state.running) state.timerId = window.setTimeout(tick, config.tickMs); }
  }

  function start(ov = {}) {
    Object.assign(config, ov, { enabled: true });
    persistConfig();
    if (state.running) return false;
    state.running = true;
    bot.log("melee position started", { ...config });
    tick();
    return true;
  }

  function stop(opts = {}) {
    const p = opts.persistEnabled !== false;
    state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (p) { config.enabled = false; persistConfig(); }
    bot.log("melee position stopped");
    return true;
  }

  function status() {
    const target = getCurrentTarget();
    const playerPos = normalizePos(bot.getPlayerPosition());
    const targetPos = target ? normalizePos(target.__position || target.getPosition?.()) : null;
    const direction = target?.getLookDirection?.() ?? null;
    const dirNames = { 0: "Norte", 1: "Leste", 2: "Sul", 3: "Oeste" };
    return {
      running        : state.running,
      config         : { ...config },
      combatActive   : isCombatActive(),
      currentTarget  : target ? { name: target.name, direction: dirNames[direction] ?? direction } : null,
      isAdjacent     : isAdjacent(playerPos, targetPos),
      playerPos,
      targetPos,
    };
  }

  function updateConfig(next = {}) {
    if ("spellHotbarSlot"  in next) next.spellHotbarSlot  = Math.max(1, Math.min(12, Math.trunc(Number(next.spellHotbarSlot)  || 5)));
    if ("spellCooldownMs"  in next) next.spellCooldownMs  = Math.max(200, Number(next.spellCooldownMs) || 2000);
    if ("mode"             in next && !["ortogonal","diagonal","any"].includes(next.mode)) delete next.mode;
    if ("requireAdjacent"  in next) next.requireAdjacent  = next.requireAdjacent === true || next.requireAdjacent === "true";
    if ("tickMs"           in next) next.tickMs           = Math.max(100, Number(next.tickMs) || 200);
    Object.assign(config, next);
    persistConfig();
    bot.log("melee position config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.meleePosition = { start, stop, status, updateConfig, config };
};

window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPanel = function installPanel(bot) {
  const panelPositionKey  = "minibiaBot.ui.panelPosition";
  const panelCollapsedKey = "minibiaBot.ui.panelCollapsed";
  const expandedModulesKey = "minibiaBot.ui.expandedModules";

  function getExpandedModules() { return bot.storage.get(expandedModulesKey, {}) || {}; }
  function saveExpandedModule(moduleId, expanded) { bot.storage.set(expandedModulesKey, { ...getExpandedModules(), [moduleId]: !!expanded }); }

  function initAccordions(panel) {
    const expanded = getExpandedModules();
    panel.querySelectorAll(".mb-accordion").forEach((accordion) => {
      const moduleId = accordion.dataset.module;
      if (!moduleId) return;
      const toggle = accordion.querySelector(".mb-accordion-toggle");
      const body   = accordion.querySelector(".mb-accordion-body");
      const setExpanded = (next) => {
        accordion.dataset.expanded = next ? "true" : "false";
        if (body)   body.hidden = !next;
        if (toggle) { toggle.textContent = next ? "−" : "+"; toggle.setAttribute("aria-label", next ? "Collapse section" : "Expand section"); }
        saveExpandedModule(moduleId, next);
      };
      setExpanded(expanded[moduleId] === true);
      accordion.querySelector(".mb-accordion-header")?.addEventListener("click", (e) => { if (e.target.closest("button, input, select, textarea, a, label")) return; setExpanded(accordion.dataset.expanded !== "true"); });
      toggle?.addEventListener("click", (e) => { e.stopPropagation(); setExpanded(accordion.dataset.expanded !== "true"); });
    });
  }

  function destroy() { document.getElementById("minibia-bot-panel")?.remove(); document.getElementById("minibia-bot-style")?.remove(); }
  function savePanelPosition(pos, key = panelPositionKey) { bot.storage.set(key, pos); }
  function getSavedPanelPosition(key = panelPositionKey) { return bot.storage.get(key, null); }
  function savePanelCollapsed(c) { bot.storage.set(panelCollapsedKey, !!c); }
  function getSavedPanelCollapsed() { return !!bot.storage.get(panelCollapsedKey, false); }

  // ── Export / Import de config ─────────────────────────────
  const ALL_CONFIG_KEYS = [
    "minibiaBot.heal.config", "minibiaBot.rune.config", "minibiaBot.cave.config",
    "minibiaBot.attack.config", "minibiaBot.eat.config", "minibiaBot.invisible.config",
    "minibiaBot.magicShield.config", "minibiaBot.equipRing.config", "minibiaBot.follow.config",
    "minibiaBot.talk.config", "minibiaBot.autostack.config", "minibiaBot.autoringbycap.config", "minibiaBot.haste.config", "minibiaBot.friendHeal.config",
    "minibiaBot.autoSpell.config", "minibiaBot.distanceAttack.config",
    "minibiaBot.pz.home", "minibiaBot.panic.config",
    "minibiaBot.cave.route", "minibiaBot.cave.transitions", "minibiaBot.cave.presets",
    "minibiaBot.cave.config",
  ];

  function exportConfig() {
    const data = {};
    ALL_CONFIG_KEYS.forEach((key) => {
      const v = bot.storage.get(key, null);
      if (v !== null) data[key] = v;
    });
    return JSON.stringify(data, null, 2);
  }

  function importConfig(json) {
    try {
      const data = JSON.parse(json);
      if (typeof data !== "object" || !data) return false;
      Object.entries(data).forEach(([key, value]) => bot.storage.set(key, value));
      return true;
    } catch (e) { return false; }
  }

  // ── Refresh functions ─────────────────────────────────────
  function refreshHomeLabel() { const el = document.getElementById("minibia-bot-home"); if (!el) return; const h = bot.pz?.getHomePz?.(); el.textContent = h ? `Home PZ: ${h.x}, ${h.y}, ${h.z}` : "Home PZ: not set"; }
  function refreshPanicStatus() {
    const s = bot.panic?.status?.()?.config;
    const u = document.getElementById("minibia-bot-panic-unknown"); if (u) u.checked = !!s?.unknownPlayerEnabled;
    const h = document.getElementById("minibia-bot-panic-health");  if (h) h.checked = !!s?.healthLossEnabled;
    const r = document.getElementById("minibia-bot-panic-return");  if (r) r.checked = !!s?.returnToOriginEnabled;
  }
  function refreshXrayStatus() {
    const status = bot.xray?.status?.(); const me = bot.getPlayerPosition?.();
    const ob = document.getElementById("minibia-bot-xray-overlay-toggle"); if (ob) ob.textContent = status?.config?.overlayEnabled ? "Disable Overlay" : "Enable Overlay";
    const ol = document.getElementById("minibia-bot-xray-overlay-status");
    if (ol) { const fl = status?.config?.selectedFloor == null ? "all floors" : String(me ? me.z - status.config.selectedFloor : status.config.selectedFloor); ol.textContent = `${status?.config?.overlayEnabled ? "Overlay: on" : "Overlay: off"} • ${fl}`; }
    const fs = document.getElementById("minibia-bot-xray-floor-select");
    if (fs) {
      const floors = Array.from(new Set((status?.visibleCreatures||[]).map(c=>c?.position?.z).filter(f=>f!=null))).sort((a,b)=>a-b);
      const sel = status?.config?.selectedFloor;
      if (sel != null && !floors.includes(sel)) { floors.push(sel); floors.sort((a,b)=>a-b); }
      fs.innerHTML = ""; const ao = document.createElement("option"); ao.value="all"; ao.textContent="All floors"; fs.appendChild(ao);
      floors.forEach(f=>{ const o=document.createElement("option"); o.value=String(f); o.textContent = me ? String(me.z-f) : String(f); fs.appendChild(o); });
      fs.value = sel==null?"all":String(sel);
    }
  }
  function renderList(listId, names, onRemove) {
    const list = document.getElementById(listId); if (!list) return;
    list.innerHTML = "";
    if (!names.length) { const e=document.createElement("div"); e.className="mb-small-note"; e.textContent="Vazio."; list.appendChild(e); return; }
    names.forEach((name,index) => {
      const row=document.createElement("div"); row.className="mb-list-row";
      const label=document.createElement("span"); label.textContent=name;
      const btn=document.createElement("button"); btn.type="button"; btn.className="mb-small-button"; btn.textContent="Remove";
      btn.addEventListener("click",()=>onRemove(index));
      row.appendChild(label); row.appendChild(btn); list.appendChild(row);
    });
  }
  function renderTrustedNames() { renderList("minibia-bot-panic-trusted-list", bot.panic?.config?.trustedNames||[], (i)=>{ bot.panic.updateConfig({trustedNames:(bot.panic.config.trustedNames||[]).filter((_,j)=>j!==i)}); renderTrustedNames(); }); }
  function renderGameMasterNames() { renderList("minibia-bot-panic-gm-list", bot.panic?.config?.gameMasterNames||[], (i)=>{ bot.panic.updateConfig({gameMasterNames:(bot.panic.config.gameMasterNames||[]).filter((_,j)=>j!==i)}); renderGameMasterNames(); }); }
  function renderAttackTargetNames() { renderList("minibia-bot-auto-attack-target-list", bot.attack?.config?.targetNames||[], (i)=>{ bot.attack.updateConfig({targetNames:(bot.attack.config.targetNames||[]).filter((_,j)=>j!==i)}); renderAttackTargetNames(); }); }
  function refreshRuneStatus() { const t=document.getElementById("minibia-bot-rune-enabled"); if(t) t.checked=!!bot.rune?.status?.().running; }
  function refreshAutoEatStatus() { const t=document.getElementById("minibia-bot-auto-eat-enabled"); if(t) t.checked=!!bot.eat?.status?.().running; }
  function refreshAutoHealStatus() { const t=document.getElementById("minibia-bot-auto-heal-enabled"); if(t) t.checked=!!bot.heal?.status?.().running; }
  function refreshAutoInvisibleStatus() { const t=document.getElementById("minibia-bot-auto-invisible-enabled"); if(t) t.checked=!!bot.invisible?.status?.().running; }
  function refreshAutoMagicShieldStatus() { const t=document.getElementById("minibia-bot-auto-magic-shield-enabled"); if(t) t.checked=!!bot.magicShield?.status?.().running; }
  function refreshAutoAttackStatus() { const t=document.getElementById("minibia-bot-auto-attack-enabled"); if(t) t.checked=!!bot.attack?.status?.().running; }
  function refreshEquipRingStatus() { const t=document.getElementById("minibia-bot-equip-ring-enabled"); if(t) t.checked=!!bot.equipRing?.status?.().running; }
  function refreshautostackStatus() { const t=document.getElementById("minibia-bot-auto-stack-enabled"); const l=document.getElementById("minibia-bot-auto-stack-status"); const s=bot.autostack?.status?.(); if(t) t.checked=!!s?.running; if(l) l.textContent=s?.running?`Status: ativo • merges: ${s.merged}`:"Status: parado"; }
  function refreshHasteStatus() { const t=document.getElementById("mb-haste-enabled"); const l=document.getElementById("mb-haste-status"); const s=bot.haste?.status?.(); if(t) t.checked=!!s?.running; if(!l||!s) return; if(!s.running){l.textContent="Status: parado";return;} const g=s.gates; l.textContent=`Status: ativo - speed:${g.hasteactive?"sim":"nao"} - target:${g.targetonscreen?"sim":"nao"}`; }
  function refreshCapRingStatus() { const t=document.getElementById("mb-capring-enabled"); const l=document.getElementById("mb-capring-status"); const s=bot.autoringbycap?.status?.(); if(t) t.checked=!!s?.running; if(!l||!s) return; if(!s.running){l.textContent="Status: parado";return;} const cap=s.currentCap!=null?s.currentCap:"?"; const anel=s.ringEquipped?"anel equipado":"sem anel"; const origem=s.ringOrigin?`origem: container ${s.ringOrigin.containerId??"?"} slot ${s.ringOrigin.slotIndex??"?"}`:"sem origem salva"; l.textContent=`Status: ativo - cap ${cap} - ${anel} - ${origem}`; }
  function refreshFollowStatus() {
    const t=document.getElementById("minibia-bot-follow-enabled"); const l=document.getElementById("minibia-bot-follow-status"); const s=bot.follow?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) { if(!s?.targetName) l.textContent="Status: no player set"; else if(s?.running) { const d=s.currentDistance!=null?`, dist ${s.currentDistance}/${s.desiredDistance} sqm`:""; l.textContent=`Status: following ${s.targetName}${d}${s.targetVisible?" (visible)":" (lost)"}`; } else l.textContent=`Status: idle (${s.targetName||"no player"})`; }
  }
  function refreshTalkStatus() {
    const t=document.getElementById("minibia-bot-talk-enabled"); const l=document.getElementById("minibia-bot-talk-status"); const s=bot.talk?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) { if(!s?.config?.apiKey) l.textContent="Status: API key missing"; else if(s?.pending) l.textContent="Status: generating"; else if(s?.running) l.textContent="Status: listening"; else l.textContent="Status: idle"; }
  }
  function refreshCaveStatus() {
    const sl=document.getElementById("minibia-bot-cave-status"); const sb=document.getElementById("minibia-bot-cave-start"); const st=document.getElementById("minibia-bot-cave-stop");
    const route=bot.cave?.getRoute?.()||[]; const status=bot.cave?.status?.();
    if(sl) { if(!route.length) sl.textContent="Status: no waypoints"; else if(status?.running) { const wp=(status.currentIndex??0)+1; const dist=Number.isFinite(status?.distanceToWaypoint)&&status.distanceToWaypoint>=0?`, dist ${status.distanceToWaypoint}`:""; const pause=status?.pausedForSpawn?", waiting spawn":status?.pausedForCreatures?`, waiting (${status.nearbyCreatureCount||0})`:status?.pausedForCombat?", paused combat":""; sl.textContent=`Status: running (${wp}/${route.length}${dist}${pause})`; } else sl.textContent=`Status: idle (${route.length} waypoints)`; }
    if(sb) sb.disabled=!route.length||!!status?.running;
    if(st) st.disabled=!status?.running;
  }
  function refreshCavePresetControls() {
    const sel=document.getElementById("minibia-bot-cave-preset-select"); const lbl=document.getElementById("minibia-bot-cave-preset-status"); const del=document.getElementById("minibia-bot-cave-preset-delete");
    const status=bot.cave?.status?.(); const names=status?.presetNames||bot.cave?.getPresetNames?.()||[]; const active=status?.activePresetName||bot.cave?.getActivePresetName?.()||"Default";
    if(sel) { const prev=sel.value; sel.innerHTML=""; if(!names.length){const o=document.createElement("option");o.value="";o.textContent="No saved presets";sel.appendChild(o);sel.disabled=true;}else{names.forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;sel.appendChild(o)});sel.disabled=false;const nv=names.includes(active)?active:prev;if(nv)sel.value=nv;} }
    if(lbl) lbl.textContent=names.length?`Preset: ${active} (${names.length} saved)`:`Preset: ${active}`;
    if(del) del.disabled=!names.length||!sel?.value;
  }
  function refreshCaveClosestStatus() { const l=document.getElementById("minibia-bot-cave-closest"); if(!l) return; const pos=bot.getPlayerPosition?.(); const route=bot.cave?.getRoute?.()||[]; if(!pos){l.textContent="Closest: no position";return;} if(!route.filter(w=>w?.type!=="delay").length){l.textContent="Closest: no waypoints";return;} const idx=bot.cave?.findClosestWaypointIndex?.(pos)??0; const w=route[idx]; l.textContent=w?`Closest: ${idx+1}. ${w.x},${w.y},${w.z}`:"Closest: unavailable"; }
  function refreshCaveTransitionStatus() { const l=document.getElementById("minibia-bot-cave-transition-status"); if(!l) return; const t=bot.cave?.getTransitions?.()||[]; if(!t.length){l.textContent="Transitions: none";return;} const lt=t.slice().sort((a,b)=>Number(b?.lastSeenAt||0)-Number(a?.lastSeenAt||0))[0]; if(!lt?.from||!lt?.to){l.textContent=`Transitions: ${t.length}`;return;} const ex=t.length>1?` (+${t.length-1})`:""; l.textContent=`Transitions: ${lt.from.x},${lt.from.y},${lt.from.z} → ${lt.to.x},${lt.to.y},${lt.to.z}${ex}`; }
  function refreshProfilesPanel() {
    const al=document.getElementById("minibia-bot-profiles-active"); const sel=document.getElementById("minibia-bot-profiles-select"); const ni=document.getElementById("minibia-bot-profiles-name-input");
    const s=bot.profiles?.status?.(); const profiles=s?.profiles||[]; const active=s?.activeProfile||null;
    if(al) al.textContent=active?`Active: ${active}`:"Active: none";
    if(sel) { const prev=sel.value; sel.innerHTML=""; if(!profiles.length){const o=document.createElement("option");o.value="";o.textContent="No profiles";sel.appendChild(o);sel.disabled=true;}else{sel.disabled=false;profiles.forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;sel.appendChild(o)});const ts=profiles.includes(active)?active:profiles.includes(prev)?prev:profiles[0];if(ts){sel.value=ts;if(ni&&!ni.value)ni.value=ts;}} }
  }
  function refreshFriendHealStatus() {
    const t=document.getElementById("minibia-bot-friend-heal-enabled"); const l=document.getElementById("minibia-bot-friend-heal-status"); const s=bot.friendHeal?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) { if(!s?.config?.targetName) l.textContent="Status: configure o target"; else l.textContent=s?.running?`Status: ativo • ${s.targetFound?"✓ visível":"✗ não encontrado"}${s.targetHpPercent!=null?" • HP: "+s.targetHpPercent.toFixed(1)+"%":""}`:"Status: parado"; }
  }
  function refreshAutoSpellStatus() {
    const t=document.getElementById("minibia-bot-auto-spell-enabled"); const l=document.getElementById("minibia-bot-auto-spell-status"); const s=bot.autoSpell?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) l.textContent=s?.running?`Status: ativo • mobs: ${s.adjacentMobs} • combat: ${s.combatActive?"✓":"✗"}`:"Status: parado";
  }
  function refreshDistanceAttackStatus() {
    const t=document.getElementById("minibia-bot-distance-attack-enabled"); const l=document.getElementById("minibia-bot-distance-attack-status"); const s=bot.distanceAttack?.status?.();
    if(t) t.checked=!!s?.running;
    if(l) { if(s?.running) { const dist=Number.isFinite(s.distanceToTarget)?s.distanceToTarget:"?"; const stuck=s.stuckCount>0?` • stuck:${s.stuckCount}`:""; l.textContent=`Status: ativo • dist: ${dist} sqm • alvo: ${s.currentTarget?.name||"nenhum"}${stuck}`; } else l.textContent="Status: parado"; }
  }
  function refreshVisibleCreatures() {
    const list=document.getElementById("minibia-bot-visible-creatures-list"); if(!list) return;
    const me=bot.getPlayerPosition?.(); const status=bot.xray?.status?.(); const creatures=status?.visibleCreatures||[]; const sel=status?.config?.selectedFloor;
    list.innerHTML="";
    if(!me){const e=document.createElement("div");e.className="mb-small-note";e.textContent="Position unavailable.";list.appendChild(e);return;}
    const visible=creatures.filter(c=>{const f=c?.position?.z;if(f==null)return false;if(sel!=null)return f===sel;return f!==me.z;}).sort((a,b)=>{const fa=Math.abs((a.position?.z||0)-me.z),fb=Math.abs((b.position?.z||0)-me.z);if(fa!==fb)return fa-fb;const da=Math.abs((a.position?.x||0)-me.x)+Math.abs((a.position?.y||0)-me.y),db=Math.abs((b.position?.x||0)-me.x)+Math.abs((b.position?.y||0)-me.y);return da-db;});
    if(!visible.length){const e=document.createElement("div");e.className="mb-small-note";e.textContent="No off-floor creatures.";list.appendChild(e);return;}
    let curFloor=null;
    visible.forEach(c=>{
      const f=c.position?.z;
      if(f!==curFloor){curFloor=f;const fo=me.z-f;const fol=fo===0?"0":fo>0?`+${fo}`:`${fo}`;const fl=document.createElement("div");fl.className="mb-floor-label";fl.textContent=fol;list.appendChild(fl);}
      const row=document.createElement("div");row.className="mb-creature-row";
      const name=document.createElement("div");name.className="mb-creature-name";name.textContent=c.name||(c.type===0?"Player":"Mob");
      const meta=document.createElement("div");meta.className="mb-small-note";meta.textContent=`${c.type===0?"Player":"Mob"} at ${c.position.x},${c.position.y},${c.position.z}`;
      row.appendChild(name);row.appendChild(meta);list.appendChild(row);
    });
  }

  function setPanelCollapsed(panel, collapsed) {
    if(!panel) return;
    const body=panel.querySelector(".mb-body"); const toggle=panel.querySelector("#minibia-bot-collapse");
    panel.dataset.collapsed=collapsed?"true":"false";
    if(body) body.hidden=collapsed;
    if(toggle){toggle.textContent=collapsed?"+":"−";toggle.setAttribute("aria-label",collapsed?"Maximize":"Minimize");toggle.setAttribute("title",collapsed?"Maximize":"Minimize");}
    savePanelCollapsed(collapsed);
  }

  function applySavedPanelPosition(panel, key=panelPositionKey) {
    const p=getSavedPanelPosition(key); if(!p) return;
    if(typeof p.top==="number") panel.style.top=`${p.top}px`;
    if(typeof p.left==="number"){panel.style.left=`${p.left}px`;panel.style.right="auto";}
  }

  function enableDrag(panel, key=panelPositionKey) {
    const handle=panel.querySelector(".mb-titlebar"); if(!handle) return;
    let drag=null;
    const onMove=(e)=>{ if(!drag) return; const maxL=Math.max(0,window.innerWidth-panel.offsetWidth),maxT=Math.max(0,window.innerHeight-panel.offsetHeight); panel.style.left=`${Math.min(Math.max(0,e.clientX-drag.ox),maxL)}px`; panel.style.top=`${Math.min(Math.max(0,e.clientY-drag.oy),maxT)}px`; panel.style.right="auto"; };
    const onUp=()=>{ if(!drag) return; drag=null; const r=panel.getBoundingClientRect(); savePanelPosition({left:r.left,top:r.top},key); };
    handle.addEventListener("mousedown",(e)=>{ if(e.button!==0) return; const r=panel.getBoundingClientRect(); drag={ox:e.clientX-r.left,oy:e.clientY-r.top}; e.preventDefault(); });
    window.addEventListener("mousemove",onMove); window.addEventListener("mouseup",onUp);
    bot.addCleanup(()=>{ window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); });
  }

  function inject() {
    destroy();

    const style=document.createElement("style"); style.id="minibia-bot-style";
    style.textContent=`
      #minibia-bot-panel{position:fixed;top:10px;right:10px;z-index:999999;width:460px;max-width:calc(100vw - 20px);background:#d4d0c8;border:2px solid;border-color:#ffffff #808080 #808080 #ffffff;font:13px/1.4 Segoe UI,Arial,sans-serif;color:#000;user-select:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;font-weight:normal}
      #minibia-bot-panel *{box-sizing:border-box}
      #minibia-bot-panel .mb-titlebar{background:linear-gradient(to right,#0a246a 0%,#a6caf0 100%);color:#fff;font-size:13px;padding:3px 4px 3px 6px;display:flex;align-items:center;justify-content:space-between;gap:4px;cursor:move}
      #minibia-bot-panel .mb-title{flex:1;white-space:nowrap}
      #minibia-bot-panel .mb-titlebar-btns{display:flex;gap:2px}
      #minibia-bot-panel .mb-icon-button{width:16px;height:14px;min-width:16px;padding:0;background:#d4d0c8;border:1px solid;border-color:#ffffff #808080 #808080 #ffffff;color:#000;font:normal 11px Segoe UI,Arial,sans-serif;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
      #minibia-bot-panel .mb-icon-button:active{border-color:#808080 #ffffff #ffffff #808080}
      #minibia-bot-panel .mb-tabs{display:flex;flex-wrap:wrap;padding:3px 4px 0;gap:2px;background:#d4d0c8;border-bottom:1px solid #808080}
      #minibia-bot-panel .mb-tab{padding:2px 8px 3px;border:1px solid;border-color:#ffffff #808080 #d4d0c8 #ffffff;background:#bbb8b0;font:13px Segoe UI,Arial,sans-serif;cursor:pointer;border-bottom:none;position:relative;top:1px;color:#000;white-space:nowrap}
      #minibia-bot-panel .mb-tab.mb-tab-active{background:#d4d0c8;z-index:2;padding-bottom:4px}
      #minibia-bot-panel .mb-tab:hover:not(.mb-tab-active){background:#c8c5be}
      #minibia-bot-panel .mb-tab-content{display:none}
      #minibia-bot-panel .mb-tab-content.mb-tab-active{display:block}
      #minibia-bot-panel .mb-body{padding:6px;max-height:min(70vh,520px);overflow-y:auto;scrollbar-width:thin;background:#d4d0c8}
      #minibia-bot-panel .mb-group{border:1px solid #808080;border-top:none;padding:10px 8px 8px;position:relative;margin-top:10px;background:#d4d0c8}
      #minibia-bot-panel .mb-group-title{position:absolute;top:-7px;left:8px;background:#d4d0c8;padding:0 3px;font-size:13px}
      #minibia-bot-panel .mb-stack{display:flex;flex-direction:column;gap:5px}
      #minibia-bot-panel .mb-row{display:flex;align-items:center;gap:6px}
      #minibia-bot-panel .mb-toggle{display:flex;align-items:center;gap:5px;font-size:13px;color:#000;cursor:pointer}
      #minibia-bot-panel .mb-toggle input[type="checkbox"]{width:13px;height:13px;margin:0;cursor:pointer}
      #minibia-bot-panel button{height:21px;min-width:60px;padding:0 8px;border:1px solid;border-color:#ffffff #808080 #808080 #ffffff;background:#d4d0c8;font:13px Segoe UI,Arial,sans-serif;cursor:pointer;color:#000;white-space:nowrap}
      #minibia-bot-panel button:hover{background:#e0ddd5}
      #minibia-bot-panel button:active{border-color:#808080 #ffffff #ffffff #808080}
      #minibia-bot-panel button:disabled{color:#808080;cursor:default}
      #minibia-bot-panel button.mb-btn-full{width:100%}
      #minibia-bot-panel .mb-small-button{height:18px;min-width:40px;padding:0 6px;font-size:13px}
      #minibia-bot-panel input:not([type="checkbox"]),#minibia-bot-panel select,#minibia-bot-panel textarea{height:19px;border:1px solid;border-color:#808080 #ffffff #ffffff #808080;background:#fff;padding:0 3px;font:13px Segoe UI,Arial,sans-serif;color:#000;width:100%}
      #minibia-bot-panel textarea{height:auto;min-height:48px;padding:3px;resize:vertical}
      #minibia-bot-panel input[type="number"]{width:60px}
      #minibia-bot-panel .mb-inline{display:grid;grid-template-columns:1fr auto;gap:4px;align-items:center}
      #minibia-bot-panel .mb-field{display:flex;flex-direction:column;gap:2px}
      #minibia-bot-panel .mb-field-label{font-size:13px;color:#000}
      #minibia-bot-panel .mb-field input{width:100%}
      #minibia-bot-panel .mb-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
      #minibia-bot-panel .mb-small-note{font-size:13px;color:#444}
      #minibia-bot-panel .mb-label{font-size:13px;color:#000}
      #minibia-bot-panel .mb-note{font-size:12px;color:#666;margin-top:4px}
      #minibia-bot-panel .mb-list{display:flex;flex-direction:column;gap:3px}
      #minibia-bot-panel .mb-list-row{display:grid;grid-template-columns:1fr auto;gap:4px;align-items:center;border-bottom:1px solid #c0bdb5;padding-bottom:3px}
      #minibia-bot-panel .mb-creature-row{border-bottom:1px solid #c0bdb5;padding:2px 0;font-size:13px}
      #minibia-bot-panel .mb-creature-name{font-weight:normal}
      #minibia-bot-panel .mb-floor-label{font-size:13px;color:#0a246a;margin-top:4px;margin-bottom:2px}
      #minibia-bot-panel .mb-actions-inline-two{display:grid;grid-template-columns:1fr 1fr;gap:4px}
      #minibia-bot-panel .mb-actions-inline-three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}
      #minibia-bot-panel .mb-statusbar{background:#d4d0c8;border-top:1px solid #808080;padding:3px 6px;display:flex;gap:6px;font-size:13px}
      #minibia-bot-panel .mb-statuspanel{border:1px solid;border-color:#808080 #ffffff #ffffff #808080;padding:1px 6px;font-size:13px;color:#000;white-space:nowrap}
      #minibia-bot-panel .mb-row-three{display:grid;grid-template-columns:auto minmax(80px,1fr) 56px;align-items:center;gap:6px}
      #minibia-bot-panel .mb-row-three input{min-width:0}
      #minibia-bot-panel #minibia-bot-visible-creatures-list{max-height:100px;overflow-y:auto}
      #minibia-bot-panel #minibia-bot-panic-trusted-list{max-height:80px;overflow-y:auto}
      #minibia-bot-panel .mb-accordion{display:contents}
      #minibia-bot-panel .mb-accordion-header{display:none}
      #minibia-bot-panel .mb-accordion-body{display:block!important}
      #minibia-bot-panel .mb-accordion-body[hidden]{display:none!important}
      #minibia-bot-panel[data-collapsed="true"]{width:26px;min-width:26px}
      #minibia-bot-panel[data-collapsed="true"] .mb-tabs,
      #minibia-bot-panel[data-collapsed="true"] .mb-statusbar{display:none}
      #minibia-bot-panel[data-collapsed="true"] .mb-titlebar{padding:2px;justify-content:center}
      #minibia-bot-panel[data-collapsed="true"] .mb-title{display:none}
    `;
    document.head.appendChild(style);

    const panel=document.createElement("div"); panel.id="minibia-bot-panel";
    panel.innerHTML=`
      <div class="mb-titlebar">
        <span class="mb-title">Minibia Bot v0.3</span>
        <div class="mb-titlebar-btns"><button type="button" class="mb-icon-button" id="minibia-bot-collapse" title="Minimize">_</button></div>
      </div>
      <div class="mb-tabs" id="minibia-bot-tabs">
        <div class="mb-tab mb-tab-active" data-tab="heal">Heal</div>
        <div class="mb-tab" data-tab="rune">Rune</div>
        <div class="mb-tab" data-tab="attack">Attack</div>
        <div class="mb-tab" data-tab="cave">Cave</div>
        <div class="mb-tab" data-tab="panic">Panic</div>
        <div class="mb-tab" data-tab="extra">Extra</div>
        <div class="mb-tab" data-tab="tools">Tools</div>
        <div class="mb-tab" data-tab="config">Config</div>
      </div>
      <div class="mb-body">

        <!-- ABA: Heal -->
        <div class="mb-tab-content mb-tab-active" data-tab="heal">
          <div class="mb-group"><span class="mb-group-title">Auto Heal</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-heal-enabled" /><span>Enable Auto Heal</span></label>
              <span class="mb-small-note">HP: Nível 2 tem prioridade sobre Nível 1</span>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">HP% Nível 1 (fraco)</span><input type="number" id="minibia-bot-hp-threshold1" min="1" max="100" placeholder="90" /></div>
                <div class="mb-field"><span class="mb-field-label">Hotkey Nível 1</span><input type="number" id="minibia-bot-hp-hotkey1" min="1" max="12" placeholder="1" /></div>
                <div class="mb-field"><span class="mb-field-label">HP% Nível 2 (forte)</span><input type="number" id="minibia-bot-hp-threshold2" min="1" max="100" placeholder="60" /></div>
                <div class="mb-field"><span class="mb-field-label">Hotkey Nível 2</span><input type="number" id="minibia-bot-hp-hotkey2" min="1" max="12" placeholder="2" /></div>
                <div class="mb-field"><span class="mb-field-label">Mana% threshold</span><input type="number" id="minibia-bot-mana-threshold" min="1" max="100" placeholder="50" /></div>
                <div class="mb-field"><span class="mb-field-label">Mana Hotkey</span><input type="number" id="minibia-bot-mana-hotkey" min="1" max="12" placeholder="3" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown HP (ms)</span><input type="number" id="minibia-bot-heal-cooldown" min="50" placeholder="100" /></div>
                <div class="mb-field"><span class="mb-field-label">Retry HP (ms)</span><input type="number" id="minibia-bot-heal-retry" min="50" placeholder="100" /></div>
              </div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Utilities</span>
            <div class="mb-stack">
              <div class="mb-row"><label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-eat-enabled" /><span>Auto Eat</span></label><span class="mb-field-label" style="margin-left:auto">Slot</span><input type="number" id="minibia-bot-auto-eat-hotkey" min="1" max="12" placeholder="10" style="width:44px" /></div>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-invisible-enabled" /><span>Auto Invisible (utana vid)</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-magic-shield-enabled" /><span>Auto Utamo Vita</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-equip-ring-enabled" /><span>Auto Equip Ring</span></label>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Stack (Runas)</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-stack-enabled" /><span>Enable Auto Stack</span></label>
              <div class="mb-row"><span class="mb-field-label">Intervalo (ms)</span><input type="number" id="minibia-bot-auto-stack-tick" min="500" placeholder="2000" style="width:70px" /><button type="button" class="mb-small-button" id="minibia-bot-auto-stack-now">Agrupar agora</button></div>
              <span class="mb-small-note" id="minibia-bot-auto-stack-status">Status: parado</span>
              <span class="mb-note">Agrupa apenas runas na primeira bag aberta.</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Ring por Cap</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="mb-capring-enabled" /><span>Enable Auto Ring por Cap</span></label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Tirar anel (cap &lt;)</span><input type="number" id="mb-capring-min" min="0" placeholder="200" /></div>
                <div class="mb-field"><span class="mb-field-label">Colocar anel (cap &ge;)</span><input type="number" id="mb-capring-put" min="0" placeholder="300" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown (ms)</span><input type="number" id="mb-capring-cd" min="500" placeholder="1500" /></div>
              </div>
              <button type="button" class="mb-small-button mb-btn-full" id="mb-capring-clear-origin">Limpar origem salva do anel</button>
              <span class="mb-small-note" id="mb-capring-status">Status: parado</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Haste</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="mb-haste-enabled" /><span>Enable Haste</span></label>
              <div class="mb-field"><span class="mb-field-label">Spell</span><input type="text" id="mb-haste-spell" placeholder="utani hur" style="width:100%" /></div>
              <span class="mb-small-note" id="mb-haste-status">Status: parado</span>
              <span class="mb-note">Detecta IDs 14 e 17. Nao lanca com target na tela.</span>
            </div>
          </div>
        </div>

        <!-- ABA: Rune -->
        <div class="mb-tab-content" data-tab="rune">
          <div class="mb-group"><span class="mb-group-title">Magic Level Trainer</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-rune-enabled" /><span>Enable</span></label>
              <div class="mb-field"><span class="mb-field-label">Spell words</span><input type="text" id="minibia-bot-rune-spell" placeholder="adori vita vis" style="width:100%" /></div>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Min Mana</span><input type="number" id="minibia-bot-rune-mana-min" min="0" placeholder="600" /></div>
                <div class="mb-field"><span class="mb-field-label">Max Mana</span><input type="number" id="minibia-bot-rune-mana-max" min="0" placeholder="600" /></div>
              </div>
            </div>
          </div>
        </div>

        <!-- ABA: Attack -->
        <div class="mb-tab-content" data-tab="attack">
          <div class="mb-group"><span class="mb-group-title">Auto Attack</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-enabled" /><span>Enable Auto Attack</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-melee" /><span>Melee Mode</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-skill-train" /><span>Skill Train on Monster</span></label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Range (sqm)</span><input type="number" id="minibia-bot-auto-attack-max-distance" min="1" max="15" placeholder="6" /></div>
                <div class="mb-field"><span class="mb-field-label">Target Hotkey</span><input type="number" id="minibia-bot-auto-attack-hotkey" min="1" max="12" placeholder="3" /></div>
                <div class="mb-field"><span class="mb-field-label">Rune Hotkey</span><input type="number" id="minibia-bot-auto-attack-rune-hotkey" min="1" max="12" placeholder="4" /></div>
                <div class="mb-field"><span class="mb-field-label">Rune Cooldown (ms)</span><input type="number" id="minibia-bot-auto-attack-rune-cooldown" min="200" placeholder="1200" /></div>
              </div>
              <div class="mb-inline"><input type="text" id="minibia-bot-auto-attack-target-input" placeholder="e.g. Rotworm" style="width:100%" /><button type="button" class="mb-small-button" id="minibia-bot-auto-attack-target-add">Add</button></div>
              <div class="mb-list" id="minibia-bot-auto-attack-target-list"></div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Distance Attack</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-distance-attack-enabled" /><span>Enable Distance Attack</span></label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Manter distância (sqm)</span><input type="number" id="minibia-bot-distance-keep" min="1" max="10" placeholder="3" /></div>
                <div class="mb-field"><span class="mb-field-label">Hotkey de ataque (1-12)</span><input type="number" id="minibia-bot-distance-hotkey" min="1" max="12" placeholder="4" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown (ms)</span><input type="number" id="minibia-bot-distance-cooldown" min="200" placeholder="1200" /></div>
              </div>
              <span class="mb-small-note" id="minibia-bot-distance-attack-status">Status: parado</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Melee Position</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="mb-melee-enabled"/><span>Enable Melee Position</span></label>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Spell Hotkey (1-12)</span><input type="number" id="mb-melee-slot" min="1" max="12" placeholder="5"/></div>
                <div class="mb-field"><span class="mb-field-label">Spell Cooldown (ms)</span><input type="number" id="mb-melee-cd" min="200" placeholder="2000"/></div>
                <div class="mb-field"><span class="mb-field-label">Modo</span><select id="mb-melee-mode"><option value="ortogonal">N/S/L/O (ortogonal)</option><option value="diagonal">Diagonal</option><option value="any">Qualquer lado</option></select></div>
                <div class="mb-field"><span class="mb-field-label">Só atira se adjacente</span><select id="mb-melee-require"><option value="true">Sim</option><option value="false">Não</option></select></div>
              </div>
              <span class="mb-small-note" id="mb-melee-status">Status: parado</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Follow</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-follow-enabled" /><span>Enable Auto Follow</span></label>
              <div class="mb-field"><span class="mb-field-label">Player Name</span><input type="text" id="minibia-bot-follow-target" placeholder="Name of player to follow" style="width:100%" /></div>
              <div class="mb-row"><span class="mb-field-label">Distance (sqm)</span><input type="number" id="minibia-bot-follow-distance" min="0" max="10" placeholder="2" style="width:50px" /></div>
              <span class="mb-small-note" id="minibia-bot-follow-status">Status: idle</span>
            </div>
          </div>
        </div>

        <!-- ABA: Cave -->
        <div class="mb-tab-content" data-tab="cave">
          <div class="mb-group"><span class="mb-group-title">Cave Bot</span>
            <div class="mb-stack">
              <div class="mb-field"><span class="mb-field-label">Preset</span><select id="minibia-bot-cave-preset-select"></select></div>
              <div class="mb-actions-inline-two"><button type="button" class="mb-small-button" id="minibia-bot-cave-preset-new">New</button><button type="button" class="mb-small-button" id="minibia-bot-cave-preset-delete">Delete</button></div>
              <div class="mb-actions-inline-two"><button type="button" class="mb-small-button" id="minibia-bot-cave-preset-export">Export</button><button type="button" class="mb-small-button" id="minibia-bot-cave-preset-import">Import</button></div>
              <div class="mb-actions-inline-two"><button type="button" class="mb-small-button" id="minibia-bot-cave-record">Record Spot</button><button type="button" class="mb-small-button" id="minibia-bot-cave-add-delay">Add Delay</button></div>
              <button type="button" class="mb-small-button mb-btn-full" id="minibia-bot-cave-remove-last">Remove Last Waypoint</button>
              <span class="mb-small-note" id="minibia-bot-cave-closest">Closest: no waypoints</span>
              <span class="mb-small-note" id="minibia-bot-cave-transition-status">Transitions: none</span>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-cave-pause-until-clear" /><span>Pause Until Clear</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-cave-strict-order" /><span>Ordem Estrita (sem pular waypoints)</span></label>
              <div class="mb-row-three"><label class="mb-toggle"><input type="checkbox" id="minibia-bot-cave-pause-until-spawn" /><span>Pause Until Monster on Floor</span></label><span></span><input type="number" id="minibia-bot-cave-spawn-floor-offset" placeholder="+1" style="width:50px" /></div>
              <div class="mb-actions-inline-two"><button type="button" id="minibia-bot-cave-start">Start</button><button type="button" id="minibia-bot-cave-stop">Stop</button></div>
              <span class="mb-small-note" id="minibia-bot-cave-status">Status: no waypoints</span>
              <span class="mb-small-note">Hotkey: Insert iniciar • Delete parar</span>
            </div>
          </div>
        </div>

        <!-- ABA: Panic -->
        <div class="mb-tab-content" data-tab="panic">
          <div class="mb-group"><span class="mb-group-title">Panic Runner</span>
            <div class="mb-stack">
              <span class="mb-label" id="minibia-bot-home">Home PZ: not set</span>
              <button type="button" id="minibia-bot-set-home">Set Home (current spot)</button>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-unknown" /><span>Flee on unknown player</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-health" /><span>Flee on health loss</span></label>
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-return" /><span>Auto return after flee</span></label>
              <div class="mb-inline"><input type="text" id="minibia-bot-panic-trusted-input" placeholder="Trusted player name" style="width:100%" /><button type="button" class="mb-small-button" id="minibia-bot-panic-trusted-add">Add</button></div>
              <div class="mb-list" id="minibia-bot-panic-trusted-list"></div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">GM Kill Switch</span>
            <div class="mb-stack">
              <div class="mb-inline"><input type="text" id="minibia-bot-panic-gm-input" placeholder="Game master name" style="width:100%" /><button type="button" class="mb-small-button" id="minibia-bot-panic-gm-add">Add</button></div>
              <div class="mb-list" id="minibia-bot-panic-gm-list"></div>
            </div>
          </div>
        </div>

        <!-- ABA: Extra (Friend Heal + Auto Spell) -->
        <div class="mb-tab-content" data-tab="extra">
          <div class="mb-group"><span class="mb-group-title">Friend Heal</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-friend-heal-enabled" /><span>Enable Friend Heal</span></label>
              <div class="mb-field"><span class="mb-field-label">Nome do player a curar</span><input type="text" id="minibia-bot-friend-heal-target" placeholder="ex: Xanathos" style="width:100%" /></div>
              <div class="mb-field"><span class="mb-field-label">Feitiço</span><input type="text" id="minibia-bot-friend-heal-spell" placeholder="exura sio" style="width:100%" /></div>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Curar quando HP% ≤</span><input type="number" id="minibia-bot-friend-heal-hp" min="1" max="100" placeholder="70" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown (ms)</span><input type="number" id="minibia-bot-friend-heal-cooldown" min="500" placeholder="1500" /></div>
              </div>
              <span class="mb-small-note" id="minibia-bot-friend-heal-status">Status: parado</span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Spell (AoE)</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-spell-enabled" /><span>Enable Auto Spell</span></label>
              <div class="mb-field"><span class="mb-field-label">Feitiço</span><input type="text" id="minibia-bot-auto-spell-words" placeholder="exori" style="width:100%" /></div>
              <div class="mb-field-grid">
                <div class="mb-field"><span class="mb-field-label">Mínimo de mobs</span><input type="number" id="minibia-bot-auto-spell-min-mobs" min="1" placeholder="2" /></div>
                <div class="mb-field"><span class="mb-field-label">Cooldown (ms)</span><input type="number" id="minibia-bot-auto-spell-cooldown" min="500" placeholder="2000" /></div>
              </div>
              <span class="mb-small-note" id="minibia-bot-auto-spell-status">Status: parado</span>
            </div>
          </div>
        </div>

        <!-- ABA: Tools -->
        <div class="mb-tab-content" data-tab="tools">
          <div class="mb-group"><span class="mb-group-title">Xray</span>
            <div class="mb-stack">
              <div class="mb-actions-inline-two"><button type="button" id="minibia-bot-xray-overlay-toggle">Enable Overlay</button><select id="minibia-bot-xray-floor-select"><option value="all">All floors</option></select></div>
              <span class="mb-small-note" id="minibia-bot-xray-overlay-status">Overlay: off</span>
              <div class="mb-list" id="minibia-bot-visible-creatures-list"></div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Auto Talk (Gemini)</span>
            <div class="mb-stack">
              <label class="mb-toggle"><input type="checkbox" id="minibia-bot-talk-enabled" /><span>Enable Auto Reply</span></label>
              <div class="mb-field"><span class="mb-field-label">Gemini API Key</span><input type="password" id="minibia-bot-talk-api-key" placeholder="API key" style="width:100%" /></div>
              <div class="mb-field"><span class="mb-field-label">Reply Prompt</span><textarea id="minibia-bot-talk-prompt" placeholder="Reply style prompt" style="width:100%"></textarea></div>
              <span class="mb-small-note" id="minibia-bot-talk-status">Status: idle</span>
            </div>
          </div>
        </div>

        <!-- ABA: Config -->
        <div class="mb-tab-content" data-tab="config">
          <div class="mb-group"><span class="mb-group-title">Profiles</span>
            <div class="mb-stack">
              <span class="mb-small-note" id="minibia-bot-profiles-active">Active: none</span>
              <div class="mb-field"><span class="mb-field-label">Profile Name</span><input type="text" id="minibia-bot-profiles-name-input" placeholder="e.g. Mage lvl 100" style="width:100%" /></div>
              <div class="mb-actions-inline-two"><button type="button" id="minibia-bot-profiles-save">Save Current</button><button type="button" id="minibia-bot-profiles-load">Load</button></div>
              <div class="mb-field"><span class="mb-field-label">Saved Profiles</span><select id="minibia-bot-profiles-select" style="width:100%"></select></div>
              <div class="mb-actions-inline-two"><button type="button" id="minibia-bot-profiles-delete">Delete</button><button type="button" id="minibia-bot-profiles-export">Export JSON</button></div>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Export / Import Config</span>
            <div class="mb-stack">
              <span class="mb-small-note">Exporta/importa todas as configurações do bot (heal, cave, attack, etc). Útil para fazer backup ou migrar para outro PC.</span>
              <div class="mb-actions-inline-two">
                <button type="button" id="minibia-bot-export-config">Exportar Config</button>
                <button type="button" id="minibia-bot-import-config">Importar Config</button>
              </div>
              <span class="mb-small-note" id="minibia-bot-config-status"></span>
            </div>
          </div>
          <div class="mb-group"><span class="mb-group-title">Bot</span>
            <div class="mb-stack"><button type="button" id="minibia-bot-reload">Reload Bot</button></div>
          </div>
        </div>

      </div>
      <div class="mb-statusbar">
        <div class="mb-statuspanel" id="minibia-bot-status-hp">HP: --</div>
        <div class="mb-statuspanel" id="minibia-bot-status-mana">MP: --</div>
        <div class="mb-statuspanel" id="minibia-bot-status-run">Idle</div>
      </div>
    `;
    document.body.appendChild(panel);

    const unlockAudio=()=>bot.unlockAudio?.();
    panel.addEventListener("pointerdown",unlockAudio,{passive:true});
    panel.addEventListener("keydown",unlockAudio);
    bot.addCleanup(()=>{panel.removeEventListener("pointerdown",unlockAudio);panel.removeEventListener("keydown",unlockAudio);});

    applySavedPanelPosition(panel);
    enableDrag(panel);
    setPanelCollapsed(panel, getSavedPanelCollapsed());
    initAccordions(panel);

    const activeTabKey="minibiaBot.ui.activeTab";
    function switchTab(tabId){panel.querySelectorAll(".mb-tab").forEach(t=>t.classList.toggle("mb-tab-active",t.dataset.tab===tabId));panel.querySelectorAll(".mb-tab-content").forEach(c=>c.classList.toggle("mb-tab-active",c.dataset.tab===tabId));bot.storage.set(activeTabKey,tabId);}
    panel.querySelectorAll(".mb-tab").forEach(tab=>tab.addEventListener("click",()=>switchTab(tab.dataset.tab)));
    switchTab(bot.storage.get(activeTabKey,"heal"));

    // Status bar
    const sbt=window.setInterval(()=>{const snap=bot.getPlayerSnapshot?.();const hpEl=document.getElementById("minibia-bot-status-hp");const mpEl=document.getElementById("minibia-bot-status-mana");const runEl=document.getElementById("minibia-bot-status-run");if(hpEl&&snap?.health!=null)hpEl.textContent="HP: "+snap.health+"/"+(snap.maxHealth||"?");if(mpEl&&snap?.mana!=null)mpEl.textContent="MP: "+snap.mana+"/"+(snap.maxMana||"?");if(runEl){const r=bot.rune?.status?.().running||bot.heal?.status?.().running||bot.attack?.status?.().running||bot.cave?.status?.().running||bot.autostack?.status?.().running;runEl.textContent=r?"Running":"Idle";runEl.style.color=r?"#006400":"#000";}},1000);
    bot.addCleanup(()=>window.clearInterval(sbt));

    // ── Collapse ──────────────────────────────────────────────
    panel.querySelector("#minibia-bot-collapse")?.addEventListener("click",()=>setPanelCollapsed(panel,panel.dataset.collapsed!=="true"));
    panel.querySelector("#minibia-bot-reload")?.addEventListener("click",()=>window.minibiaBotReload?.());
    panel.querySelector("#minibia-bot-set-home")?.addEventListener("click",()=>{bot.pz.setHomePzCurrentSpot();refreshHomeLabel();});

    // ── Export/Import Config ──────────────────────────────────
    panel.querySelector("#minibia-bot-export-config")?.addEventListener("click",async()=>{
      const json=exportConfig(); let copied=false;
      try{if(navigator?.clipboard?.writeText){await navigator.clipboard.writeText(json);copied=true;}}catch(e){}
      const lbl=document.getElementById("minibia-bot-config-status");
      if(copied){if(lbl)lbl.textContent="✓ Config copiada para o clipboard!";}
      else{window.prompt("Copie o JSON abaixo:",json);}
    });
    panel.querySelector("#minibia-bot-import-config")?.addEventListener("click",()=>{
      const json=window.prompt("Cole o JSON de config aqui:");
      if(!json) return;
      const lbl=document.getElementById("minibia-bot-config-status");
      if(importConfig(json)){if(lbl)lbl.textContent="✓ Config importada! Recarregue o bot.";setTimeout(()=>window.minibiaBotReload?.(),1000);}
      else{if(lbl)lbl.textContent="✗ JSON inválido.";}
    });

    // ── Heal ──────────────────────────────────────────────────
    const hpThreshold1I=panel.querySelector("#minibia-bot-hp-threshold1");
    const hpHotkey1I=panel.querySelector("#minibia-bot-hp-hotkey1");
    const hpThreshold2I=panel.querySelector("#minibia-bot-hp-threshold2");
    const hpHotkey2I=panel.querySelector("#minibia-bot-hp-hotkey2");
    const manaThresholdI=panel.querySelector("#minibia-bot-mana-threshold");
    const manaHotkeyI=panel.querySelector("#minibia-bot-mana-hotkey");
    const healEnabledI=panel.querySelector("#minibia-bot-auto-heal-enabled");
    if(hpThreshold1I){hpThreshold1I.value=String(bot.heal?.config?.hpThreshold1??90);hpThreshold1I.addEventListener("change",()=>{const v=Math.min(100,Math.max(1,Number(hpThreshold1I.value)||90));hpThreshold1I.value=String(v);bot.heal.updateConfig({hpThreshold1:v});});}
    if(hpHotkey1I){hpHotkey1I.value=String(bot.heal?.config?.hpHotbarSlot1??1);hpHotkey1I.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(hpHotkey1I.value)||1));hpHotkey1I.value=String(v);bot.heal.updateConfig({hpHotbarSlot1:v});});}
    if(hpThreshold2I){hpThreshold2I.value=String(bot.heal?.config?.hpThreshold2??60);hpThreshold2I.addEventListener("change",()=>{const v=Math.min(100,Math.max(1,Number(hpThreshold2I.value)||60));hpThreshold2I.value=String(v);bot.heal.updateConfig({hpThreshold2:v});});}
    if(hpHotkey2I){hpHotkey2I.value=String(bot.heal?.config?.hpHotbarSlot2??2);hpHotkey2I.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(hpHotkey2I.value)||2));hpHotkey2I.value=String(v);bot.heal.updateConfig({hpHotbarSlot2:v});});}
    if(manaThresholdI){manaThresholdI.value=String(bot.heal?.config?.manaThreshold??50);manaThresholdI.addEventListener("change",()=>{const v=Math.min(100,Math.max(1,Number(manaThresholdI.value)||50));manaThresholdI.value=String(v);bot.heal.updateConfig({manaThreshold:v});});}
    if(manaHotkeyI){manaHotkeyI.value=String(bot.heal?.config?.manaHotbarSlot??3);manaHotkeyI.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(manaHotkeyI.value)||3));manaHotkeyI.value=String(v);bot.heal.updateConfig({manaHotbarSlot:v});});}
    const healCooldownI=panel.querySelector("#minibia-bot-heal-cooldown");
    const healRetryI=panel.querySelector("#minibia-bot-heal-retry");
    if(healCooldownI){healCooldownI.value=String(bot.heal?.config?.healCooldownMs??100);healCooldownI.addEventListener("change",()=>{const v=Math.max(50,Number(healCooldownI.value)||100);healCooldownI.value=String(v);bot.heal.updateConfig({healCooldownMs:v});});}
    if(healRetryI){healRetryI.value=String(bot.heal?.config?.healRetryMs??100);healRetryI.addEventListener("change",()=>{const v=Math.max(50,Number(healRetryI.value)||100);healRetryI.value=String(v);bot.heal.updateConfig({healRetryMs:v});});}
    if(healEnabledI){
      healEnabledI.checked=!!bot.heal?.status?.().running;
      healEnabledI.addEventListener("change",()=>{
        if(healEnabledI.checked){
          bot.heal.start({
            hpThreshold1  : Math.min(100,Math.max(1,Number(hpThreshold1I?.value)||90)),
            hpHotbarSlot1 : Math.min(12,Math.max(1,Number(hpHotkey1I?.value)||1)),
            hpThreshold2  : Math.min(100,Math.max(1,Number(hpThreshold2I?.value)||60)),
            hpHotbarSlot2 : Math.min(12,Math.max(1,Number(hpHotkey2I?.value)||2)),
            manaThreshold : Math.min(100,Math.max(1,Number(manaThresholdI?.value)||50)),
            manaHotbarSlot: Math.min(12,Math.max(1,Number(manaHotkeyI?.value)||3)),
            healCooldownMs: Math.max(50,Number(healCooldownI?.value)||100),
            healRetryMs   : Math.max(50,Number(healRetryI?.value)||100),
          });
        } else { bot.heal.stop(); }
        refreshAutoHealStatus();
      });
    }

    // ── Eat ───────────────────────────────────────────────────
    const eatHotkeyI=panel.querySelector("#minibia-bot-auto-eat-hotkey");
    const eatEnabledI=panel.querySelector("#minibia-bot-auto-eat-enabled");
    if(eatHotkeyI){eatHotkeyI.value=String(bot.eat?.config?.eatHotbarSlot??10);eatHotkeyI.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(eatHotkeyI.value)||1));eatHotkeyI.value=String(v);bot.eat.updateConfig({eatHotbarSlot:v});});}
    if(eatEnabledI){eatEnabledI.checked=!!bot.eat?.status?.().running;eatEnabledI.addEventListener("change",()=>{const s=Math.min(12,Math.max(1,Number(eatHotkeyI?.value)||bot.eat.config.eatHotbarSlot||1));if(eatEnabledI.checked)bot.eat.start({eatHotbarSlot:s});else bot.eat.stop();refreshAutoEatStatus();});}

    // ── Invisible / MagicShield / EquipRing ───────────────────
    const invI=panel.querySelector("#minibia-bot-auto-invisible-enabled");
    if(invI){invI.checked=!!bot.invisible?.status?.().running;invI.addEventListener("change",()=>{if(invI.checked)bot.invisible.start();else bot.invisible.stop();refreshAutoInvisibleStatus();});}
    const msI=panel.querySelector("#minibia-bot-auto-magic-shield-enabled");
    if(msI){msI.checked=!!bot.magicShield?.status?.().running;msI.addEventListener("change",()=>{if(msI.checked)bot.magicShield.start();else bot.magicShield.stop();refreshAutoMagicShieldStatus();});}
    const erI=panel.querySelector("#minibia-bot-equip-ring-enabled");
    if(erI){erI.checked=!!bot.equipRing?.status?.().running;erI.addEventListener("change",()=>{if(erI.checked)bot.equipRing.start();else bot.equipRing.stop();refreshEquipRingStatus();});}

    // ── Auto Stack ────────────────────────────────────────────
    const asTickI=panel.querySelector("#minibia-bot-auto-stack-tick");
    const asNowB=panel.querySelector("#minibia-bot-auto-stack-now");
    const asEnabledI=panel.querySelector("#minibia-bot-auto-stack-enabled");
    if(asTickI){asTickI.value=String(bot.autostack?.config?.tickMs??2000);asTickI.addEventListener("change",()=>{const v=Math.max(500,Number(asTickI.value)||2000);asTickI.value=String(v);bot.autostack?.updateConfig?.({tickMs:v});});}
    if(asNowB){asNowB.addEventListener("click",()=>{const m=bot.autostack?.runOnce?.();const l=document.getElementById("minibia-bot-auto-stack-status");if(l)l.textContent=`Agrupados: ${m??0} merge(s)`;});}
    if(asEnabledI){asEnabledI.checked=!!bot.autostack?.status?.().running;asEnabledI.addEventListener("change",()=>{const t=Math.max(500,Number(asTickI?.value)||2000);if(asEnabledI.checked)bot.autostack?.start?.({tickMs:t});else bot.autostack?.stop?.();refreshautostackStatus();});}

    // ── Auto Ring por Cap ─────────────────────────────────────────────
    const capMinI=panel.querySelector("#mb-capring-min");
    const capPutI=panel.querySelector("#mb-capring-put");
    const capCdI=panel.querySelector("#mb-capring-cd");
    const capEnI=panel.querySelector("#mb-capring-enabled");
    const capClrB=panel.querySelector("#mb-capring-clear-origin");
    if(capMinI){capMinI.value=String(bot.autoringbycap?.config?.capMin??200);capMinI.addEventListener("change",()=>{const v=Math.max(0,Number(capMinI.value)||0);capMinI.value=String(v);bot.autoringbycap?.updateConfig?.({capMin:v});refreshCapRingStatus();});}
    if(capPutI){capPutI.value=String(bot.autoringbycap?.config?.capPut??300);capPutI.addEventListener("change",()=>{const v=Math.max(0,Number(capPutI.value)||0);capPutI.value=String(v);bot.autoringbycap?.updateConfig?.({capPut:v});refreshCapRingStatus();});}
    if(capCdI){capCdI.value=String(bot.autoringbycap?.config?.equipCooldownMs??1500);capCdI.addEventListener("change",()=>{const v=Math.max(500,Number(capCdI.value)||1500);capCdI.value=String(v);bot.autoringbycap?.updateConfig?.({equipCooldownMs:v});});}
    if(capClrB){capClrB.addEventListener("click",()=>{bot.autoringbycap?.clearOrigin?.();refreshCapRingStatus();});}
    if(capEnI){capEnI.checked=!!bot.autoringbycap?.status?.().running;capEnI.addEventListener("change",()=>{if(capEnI.checked)bot.autoringbycap?.start?.({capMin:Math.max(0,Number(capMinI?.value)||200),capPut:Math.max(0,Number(capPutI?.value)||300),equipCooldownMs:Math.max(500,Number(capCdI?.value)||1500)});else bot.autoringbycap?.stop?.();refreshCapRingStatus();});}

    // ── Haste ──────────────────────────────────────────────────
    const hasteSpellI=panel.querySelector("#mb-haste-spell");
    const hasteEnI=panel.querySelector("#mb-haste-enabled");
    if(hasteSpellI){hasteSpellI.value=bot.haste?.config?.spellwords??"utani hur";hasteSpellI.addEventListener("change",()=>{bot.haste?.updateconfig?.({spellwords:hasteSpellI.value.trim()});});}
    if(hasteEnI){hasteEnI.checked=!!bot.haste?.status?.().running;hasteEnI.addEventListener("change",()=>{if(hasteEnI.checked)bot.haste?.start?.({spellwords:hasteSpellI?.value?.trim()||"utani hur"});else bot.haste?.stop?.();refreshHasteStatus();});}

    // ── Rune ──────────────────────────────────────────────────
    const spellI=panel.querySelector("#minibia-bot-rune-spell");
    const manaMinI=panel.querySelector("#minibia-bot-rune-mana-min");
    const manaMaxI=panel.querySelector("#minibia-bot-rune-mana-max");
    const runeI=panel.querySelector("#minibia-bot-rune-enabled");
    if(spellI){spellI.value=bot.rune?.config?.runeSpellWords||"";spellI.addEventListener("change",()=>bot.rune.updateConfig({runeSpellWords:spellI.value.trim()}));}
    function syncRuneMana(r=bot.rune?.config){if(!r)return;const mn=Math.max(0,Number(r.runeManaMin??r.runeManaCost)||0);const mx=Math.max(0,Number(r.runeManaMax??r.runeManaCost)||0);if(manaMinI)manaMinI.value=String(Math.min(mn,mx));if(manaMaxI)manaMaxI.value=String(Math.max(mn,mx));}
    syncRuneMana();
    manaMinI?.addEventListener("change",()=>{bot.rune.updateConfig({runeManaMin:Math.max(0,Number(manaMinI.value)||0),runeManaMax:Math.max(0,Number(manaMaxI?.value)||0)});syncRuneMana(bot.rune.config);});
    manaMaxI?.addEventListener("change",()=>{bot.rune.updateConfig({runeManaMin:Math.max(0,Number(manaMinI?.value)||0),runeManaMax:Math.max(0,Number(manaMaxI.value)||0)});syncRuneMana(bot.rune.config);});
    if(runeI){runeI.checked=!!bot.rune?.status?.().running;runeI.addEventListener("change",()=>{if(runeI.checked)bot.rune.start({runeSpellWords:spellI?.value?.trim()||bot.rune.config.runeSpellWords,runeManaMin:Math.max(0,Number(manaMinI?.value)||0),runeManaMax:Math.max(0,Number(manaMaxI?.value)||0)});else bot.rune.stop();refreshRuneStatus();});}

    // ── Attack ────────────────────────────────────────────────
    const atkDistI=panel.querySelector("#minibia-bot-auto-attack-max-distance");
    const atkHkI=panel.querySelector("#minibia-bot-auto-attack-hotkey");
    const atkRuneHkI=panel.querySelector("#minibia-bot-auto-attack-rune-hotkey");
    const atkMeleeI=panel.querySelector("#minibia-bot-auto-attack-melee");
    const atkSkillI=panel.querySelector("#minibia-bot-auto-attack-skill-train");
    const atkTargetI=panel.querySelector("#minibia-bot-auto-attack-target-input");
    const atkTargetAddB=panel.querySelector("#minibia-bot-auto-attack-target-add");
    const atkEnabledI=panel.querySelector("#minibia-bot-auto-attack-enabled");
    if(atkDistI){atkDistI.value=String(bot.attack?.config?.maxTargetDistance??6);atkDistI.addEventListener("change",()=>{const v=Math.min(15,Math.max(1,Math.trunc(Number(atkDistI.value)||6)));atkDistI.value=String(v);bot.attack.updateConfig({maxTargetDistance:v});});}
    if(atkHkI){atkHkI.value=String(bot.attack?.config?.targetHotbarSlot??3);atkHkI.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(atkHkI.value)||1));atkHkI.value=String(v);bot.attack.updateConfig({targetHotbarSlot:v});});}
    if(atkRuneHkI){atkRuneHkI.value=bot.attack?.config?.runeHotbarSlot?String(bot.attack.config.runeHotbarSlot):"";atkRuneHkI.addEventListener("change",()=>{const r=Number(atkRuneHkI.value);const v=Number.isFinite(r)&&r>=1&&r<=12?Math.trunc(r):null;atkRuneHkI.value=v?String(v):"";bot.attack.updateConfig({runeHotbarSlot:v});});}
    if(atkMeleeI){atkMeleeI.checked=bot.attack?.config?.meleeMode!==false;atkMeleeI.addEventListener("change",()=>bot.attack.updateConfig({meleeMode:atkMeleeI.checked}));}
    if(atkSkillI){atkSkillI.checked=!!bot.attack?.config?.skillTrainOnMonster;atkSkillI.addEventListener("change",()=>bot.attack.updateConfig({skillTrainOnMonster:atkSkillI.checked}));}
    function addAttackTarget(){const raw=atkTargetI?.value?.trim()||"";if(!raw)return;const cur=bot.attack?.config?.targetNames||[];if(!cur.some(n=>n.trim().toLowerCase()===raw.toLowerCase()))bot.attack.updateConfig({targetNames:[...cur,raw]});if(atkTargetI)atkTargetI.value="";renderAttackTargetNames();}
    atkTargetAddB?.addEventListener("click",addAttackTarget);
    atkTargetI?.addEventListener("keydown",(e)=>{if(e.key==="Enter"){e.preventDefault();addAttackTarget();}});
    const atkRuneCdI=panel.querySelector("#minibia-bot-auto-attack-rune-cooldown");
    if(atkRuneCdI){atkRuneCdI.value=String(bot.attack?.config?.runeCooldownMs??1200);atkRuneCdI.addEventListener("change",()=>{const v=Math.max(200,Number(atkRuneCdI.value)||1200);atkRuneCdI.value=String(v);bot.attack.updateConfig({runeCooldownMs:v});});}
    if(atkEnabledI){atkEnabledI.checked=!!bot.attack?.status?.().running;atkEnabledI.addEventListener("change",()=>{const th=Math.min(12,Math.max(1,Number(atkHkI?.value)||bot.attack.config.targetHotbarSlot||1));const rh=(()=>{const r=Number(atkRuneHkI?.value);return Number.isFinite(r)&&r>=1&&r<=12?Math.trunc(r):bot.attack.config.runeHotbarSlot??null;})();const ml=!!atkMeleeI?.checked;const st=!!atkSkillI?.checked;const md=Math.min(15,Math.max(1,Math.trunc(Number(atkDistI?.value)||bot.attack.config.maxTargetDistance||6)));const rc=Math.max(200,Number(atkRuneCdI?.value)||bot.attack.config.runeCooldownMs||1200);if(atkEnabledI.checked)bot.attack.start({targetHotbarSlot:th,runeHotbarSlot:rh,meleeMode:ml,skillTrainOnMonster:st,maxTargetDistance:md,runeCooldownMs:rc});else bot.attack.stop();refreshAutoAttackStatus();});}

    // ── Distance Attack ───────────────────────────────────────
    const daKeepI=panel.querySelector("#minibia-bot-distance-keep");
    const daHkI=panel.querySelector("#minibia-bot-distance-hotkey");
    const daCdI=panel.querySelector("#minibia-bot-distance-cooldown");
    const daEnabledI=panel.querySelector("#minibia-bot-distance-attack-enabled");
    if(daKeepI){daKeepI.value=String(bot.distanceAttack?.config?.keepDistance??3);daKeepI.addEventListener("change",()=>{const v=Math.max(1,Math.min(10,Number(daKeepI.value)||3));daKeepI.value=String(v);bot.distanceAttack?.updateConfig?.({keepDistance:v});});}
    if(daHkI){daHkI.value=String(bot.distanceAttack?.config?.runeHotbarSlot??4);daHkI.addEventListener("change",()=>{const v=Math.max(1,Math.min(12,Number(daHkI.value)||4));daHkI.value=String(v);bot.distanceAttack?.updateConfig?.({runeHotbarSlot:v});});}
    if(daCdI){daCdI.value=String(bot.distanceAttack?.config?.runeCooldownMs??1200);daCdI.addEventListener("change",()=>{const v=Math.max(200,Number(daCdI.value)||1200);daCdI.value=String(v);bot.distanceAttack?.updateConfig?.({runeCooldownMs:v});});}
    if(daEnabledI){daEnabledI.checked=!!bot.distanceAttack?.status?.().running;daEnabledI.addEventListener("change",()=>{if(daEnabledI.checked)bot.distanceAttack?.start?.({keepDistance:Math.max(1,Math.min(10,Number(daKeepI?.value)||3)),runeHotbarSlot:Math.max(1,Math.min(12,Number(daHkI?.value)||4)),runeCooldownMs:Math.max(200,Number(daCdI?.value)||1200)});else bot.distanceAttack?.stop?.();refreshDistanceAttackStatus();});}

    // ── Melee Position ───────────────────────────────────────
    const meleeEI   = panel.querySelector("#mb-melee-enabled");
    const meleeSlotI= panel.querySelector("#mb-melee-slot");
    const meleeCdI  = panel.querySelector("#mb-melee-cd");
    const meleeModeI= panel.querySelector("#mb-melee-mode");
    const meleeReqI = panel.querySelector("#mb-melee-require");
    function refreshMeleePosition() {
      const s = bot.meleePosition?.status?.();
      if(meleeEI) meleeEI.checked = !!s?.running;
      const l = document.getElementById("mb-melee-status");
      if(l) {
        if(s?.running) {
          const adj = s.isAdjacent ? "✓ adjacente" : "✗ movendo...";
          const tgt = s.currentTarget ? `${s.currentTarget.name} (${s.currentTarget.direction})` : "nenhum";
          l.textContent = `Status: ativo • ${adj} • alvo: ${tgt}`;
        } else { l.textContent = "Status: parado"; }
      }
    }
    if(meleeSlotI){meleeSlotI.value=String(bot.meleePosition?.config?.spellHotbarSlot??5);meleeSlotI.addEventListener("change",()=>{const v=Math.max(1,Math.min(12,Number(meleeSlotI.value)||5));meleeSlotI.value=String(v);bot.meleePosition?.updateConfig?.({spellHotbarSlot:v});});}
    if(meleeCdI){meleeCdI.value=String(bot.meleePosition?.config?.spellCooldownMs??2000);meleeCdI.addEventListener("change",()=>{const v=Math.max(200,Number(meleeCdI.value)||2000);meleeCdI.value=String(v);bot.meleePosition?.updateConfig?.({spellCooldownMs:v});});}
    if(meleeModeI){meleeModeI.value=bot.meleePosition?.config?.mode||"any";meleeModeI.addEventListener("change",()=>bot.meleePosition?.updateConfig?.({mode:meleeModeI.value}));}
    if(meleeReqI){meleeReqI.value=String(bot.meleePosition?.config?.requireAdjacent!==false);meleeReqI.addEventListener("change",()=>bot.meleePosition?.updateConfig?.({requireAdjacent:meleeReqI.value==="true"}));}
    if(meleeEI){meleeEI.checked=!!bot.meleePosition?.status?.().running;meleeEI.addEventListener("change",()=>{if(meleeEI.checked)bot.meleePosition?.start?.({spellHotbarSlot:Math.max(1,Math.min(12,Number(meleeSlotI?.value)||5)),spellCooldownMs:Math.max(200,Number(meleeCdI?.value)||2000),mode:meleeModeI?.value||"any",requireAdjacent:meleeReqI?.value!=="false"});else bot.meleePosition?.stop?.();refreshMeleePosition();});}
    const meleeTid=window.setInterval(refreshMeleePosition,1000); bot.addCleanup(()=>window.clearInterval(meleeTid));
    refreshMeleePosition();

    // ── Follow ────────────────────────────────────────────────
    const followEI=panel.querySelector("#minibia-bot-follow-enabled");
    const followTI=panel.querySelector("#minibia-bot-follow-target");
    const followDI=panel.querySelector("#minibia-bot-follow-distance");
    if(followTI){followTI.value=bot.follow?.config?.targetPlayerName||"";followTI.addEventListener("change",()=>{bot.follow?.updateConfig?.({targetPlayerName:followTI.value.trim()});refreshFollowStatus();});}
    if(followDI){followDI.value=String(bot.follow?.config?.followDistance??2);followDI.addEventListener("change",()=>{const d=Math.max(0,Math.min(10,Math.trunc(Number(followDI.value)||0)));followDI.value=String(d);bot.follow?.updateConfig?.({followDistance:d});refreshFollowStatus();});}
    if(followEI){followEI.checked=!!bot.follow?.status?.().running;followEI.addEventListener("change",()=>{const n=followTI?.value?.trim()||bot.follow?.config?.targetPlayerName||"";const d=Math.max(0,Math.min(10,Math.trunc(Number(followDI?.value)||2)));if(followEI.checked)bot.follow?.start?.({targetPlayerName:n,followDistance:d});else bot.follow?.stop?.();refreshFollowStatus();});}

    // ── Cave ──────────────────────────────────────────────────
    panel.querySelector("#minibia-bot-cave-record")?.addEventListener("click",()=>{bot.cave.addWaypointCurrentSpot();refreshCavePresetControls();refreshCaveClosestStatus();refreshCaveTransitionStatus();});
    panel.querySelector("#minibia-bot-cave-add-delay")?.addEventListener("click",()=>{const r=window.prompt("Delay in seconds:","90");if(r==null)return;const s=Math.max(1,Math.trunc(Number(r)||0));if(!Number.isFinite(s)||s<=0){window.alert("Invalid number.");return;}bot.cave.addDelay(s);refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    panel.querySelector("#minibia-bot-cave-remove-last")?.addEventListener("click",()=>{bot.cave.removeLastWaypoint();refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    const cpucI=panel.querySelector("#minibia-bot-cave-pause-until-clear");
    if(cpucI){cpucI.checked=bot.cave?.config?.pauseUntilClear!==false;cpucI.addEventListener("change",()=>{bot.cave.updateConfig({pauseUntilClear:cpucI.checked});refreshCaveStatus();});}
    const caveStrictOrderI=panel.querySelector("#minibia-bot-cave-strict-order");
    if(caveStrictOrderI){caveStrictOrderI.checked=!!bot.cave?.config?.strictOrder;caveStrictOrderI.addEventListener("change",()=>{bot.cave.updateConfig({strictOrder:caveStrictOrderI.checked});refreshCaveStatus();});}
    const csoI=panel.querySelector("#minibia-bot-cave-spawn-floor-offset");
    if(csoI){csoI.value=String(bot.cave?.config?.pauseUntilSpawnFloorOffset??1);csoI.addEventListener("change",()=>{const v=Math.trunc(Number(csoI.value)||0);csoI.value=String(v);bot.cave.updateConfig({pauseUntilSpawnFloorOffset:v});refreshCaveStatus();});}
    const cpusI=panel.querySelector("#minibia-bot-cave-pause-until-spawn");
    if(cpusI){cpusI.checked=!!bot.cave?.config?.pauseUntilSpawn;cpusI.addEventListener("change",()=>{bot.cave.updateConfig({pauseUntilSpawn:cpusI.checked,pauseUntilSpawnFloorOffset:Math.trunc(Number(csoI?.value)||bot.cave?.config?.pauseUntilSpawnFloorOffset||0)});refreshCaveStatus();});}
    panel.querySelector("#minibia-bot-cave-start")?.addEventListener("click",()=>{bot.cave.start();refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    panel.querySelector("#minibia-bot-cave-stop")?.addEventListener("click",()=>{bot.cave.stop();refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    const cpsI=panel.querySelector("#minibia-bot-cave-preset-select");
    cpsI?.addEventListener("change",()=>{const n=cpsI.value||"";if(!n||n===bot.cave?.getActivePresetName?.())return;bot.cave.loadPreset(n);refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();refreshCaveTransitionStatus();});
    panel.querySelector("#minibia-bot-cave-preset-new")?.addEventListener("click",()=>{const n=window.prompt("Name the new cave preset:");if(n==null)return;if(!bot.cave.createPreset(n))return;refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();});
    panel.querySelector("#minibia-bot-cave-preset-delete")?.addEventListener("click",()=>{const n=cpsI?.value||"";if(!n)return;if(!bot.cave.deletePreset(n))return;refreshCavePresetControls();refreshCaveStatus();});
    panel.querySelector("#minibia-bot-cave-preset-export")?.addEventListener("click",async()=>{const p=bot.cave?.exportPresets?.();if(!p){window.alert("Could not export.");return;}const s=JSON.stringify(p,null,2);let c=false;try{if(navigator?.clipboard?.writeText){await navigator.clipboard.writeText(s);c=true;}}catch(e){}if(c){window.alert("Cave presets copied to clipboard.");}else{window.prompt("Copy your cave presets JSON:",s);}});
    panel.querySelector("#minibia-bot-cave-preset-import")?.addEventListener("click",()=>{const i=window.prompt("Paste cave presets JSON:");if(i==null)return;const im=bot.cave?.importPresets?.(i);if(!im){window.alert("Import failed.");return;}refreshCavePresetControls();refreshCaveStatus();refreshCaveClosestStatus();refreshCaveTransitionStatus();window.alert("Imported "+(im.presets?.length||0)+" preset(s).");});

    // ── Panic ─────────────────────────────────────────────────
    const puI=panel.querySelector("#minibia-bot-panic-unknown");
    const phI=panel.querySelector("#minibia-bot-panic-health");
    const prI=panel.querySelector("#minibia-bot-panic-return");
    const ptI=panel.querySelector("#minibia-bot-panic-trusted-input");
    const ptAB=panel.querySelector("#minibia-bot-panic-trusted-add");
    const pgI=panel.querySelector("#minibia-bot-panic-gm-input");
    const pgAB=panel.querySelector("#minibia-bot-panic-gm-add");
    if(puI){puI.checked=!!bot.panic?.status?.().config?.unknownPlayerEnabled;puI.addEventListener("change",()=>{bot.panic.updateConfig({unknownPlayerEnabled:puI.checked});refreshPanicStatus();});}
    if(phI){phI.checked=!!bot.panic?.status?.().config?.healthLossEnabled;phI.addEventListener("change",()=>{bot.panic.updateConfig({healthLossEnabled:phI.checked});refreshPanicStatus();});}
    if(prI){prI.checked=!!bot.panic?.status?.().config?.returnToOriginEnabled;prI.addEventListener("change",()=>{bot.panic.updateConfig({returnToOriginEnabled:prI.checked});refreshPanicStatus();});}
    function addTrusted(){const raw=ptI?.value?.trim()||"";if(!raw)return;const cur=bot.panic?.config?.trustedNames||[];if(!cur.some(n=>n.trim().toLowerCase()===raw.toLowerCase()))bot.panic.updateConfig({trustedNames:[...cur,raw]});if(ptI)ptI.value="";renderTrustedNames();}
    ptAB?.addEventListener("click",addTrusted);
    ptI?.addEventListener("keydown",(e)=>{if(e.key==="Enter"){e.preventDefault();addTrusted();}});
    function addGM(){const raw=pgI?.value?.trim()||"";if(!raw)return;const cur=bot.panic?.config?.gameMasterNames||[];if(!cur.some(n=>n.trim().toLowerCase()===raw.toLowerCase()))bot.panic.updateConfig({gameMasterNames:[...cur,raw]});if(pgI)pgI.value="";renderGameMasterNames();}
    pgAB?.addEventListener("click",addGM);
    pgI?.addEventListener("keydown",(e)=>{if(e.key==="Enter"){e.preventDefault();addGM();}});

    // ── Friend Heal ───────────────────────────────────────────
    const fhEI=panel.querySelector("#minibia-bot-friend-heal-enabled");
    const fhTI=panel.querySelector("#minibia-bot-friend-heal-target");
    const fhSI=panel.querySelector("#minibia-bot-friend-heal-spell");
    const fhHpI=panel.querySelector("#minibia-bot-friend-heal-hp");
    const fhCdI=panel.querySelector("#minibia-bot-friend-heal-cooldown");
    if(fhTI){fhTI.value=bot.friendHeal?.config?.targetName||"";fhTI.addEventListener("change",()=>{bot.friendHeal?.updateConfig?.({targetName:fhTI.value.trim()});refreshFriendHealStatus();});}
    if(fhSI){fhSI.value=bot.friendHeal?.config?.spellWords||"exura sio";fhSI.addEventListener("change",()=>bot.friendHeal?.updateConfig?.({spellWords:fhSI.value.trim()}));}
    if(fhHpI){fhHpI.value=String(bot.friendHeal?.config?.minHpPercent??70);fhHpI.addEventListener("change",()=>{const v=Math.min(100,Math.max(1,Number(fhHpI.value)||70));fhHpI.value=String(v);bot.friendHeal?.updateConfig?.({minHpPercent:v});});}
    if(fhCdI){fhCdI.value=String(bot.friendHeal?.config?.healCooldownMs??1500);fhCdI.addEventListener("change",()=>{const v=Math.max(500,Number(fhCdI.value)||1500);fhCdI.value=String(v);bot.friendHeal?.updateConfig?.({healCooldownMs:v});});}
    if(fhEI){fhEI.checked=!!bot.friendHeal?.status?.().running;fhEI.addEventListener("change",()=>{if(fhEI.checked){bot.friendHeal?.updateConfig?.({targetName:fhTI?.value?.trim()||"",spellWords:fhSI?.value?.trim()||"exura sio",minHpPercent:Math.min(100,Math.max(1,Number(fhHpI?.value)||70)),healCooldownMs:Math.max(500,Number(fhCdI?.value)||1500)});if(!bot.friendHeal?.start?.())fhEI.checked=false;}else bot.friendHeal?.stop?.();refreshFriendHealStatus();});}

    // ── Auto Spell ────────────────────────────────────────────
    const asSpellI=panel.querySelector("#minibia-bot-auto-spell-words");
    const asMinMobsI=panel.querySelector("#minibia-bot-auto-spell-min-mobs");
    const asSpellCdI=panel.querySelector("#minibia-bot-auto-spell-cooldown");
    const asSpellEI=panel.querySelector("#minibia-bot-auto-spell-enabled");
    if(asSpellI){asSpellI.value=bot.autoSpell?.config?.spellWords||"exori";asSpellI.addEventListener("change",()=>bot.autoSpell?.updateConfig?.({spellWords:asSpellI.value.trim()}));}
    if(asMinMobsI){asMinMobsI.value=String(bot.autoSpell?.config?.minMobCount??2);asMinMobsI.addEventListener("change",()=>{const v=Math.max(1,Number(asMinMobsI.value)||2);asMinMobsI.value=String(v);bot.autoSpell?.updateConfig?.({minMobCount:v});});}
    if(asSpellCdI){asSpellCdI.value=String(bot.autoSpell?.config?.cooldownMs??2000);asSpellCdI.addEventListener("change",()=>{const v=Math.max(500,Number(asSpellCdI.value)||2000);asSpellCdI.value=String(v);bot.autoSpell?.updateConfig?.({cooldownMs:v});});}
    if(asSpellEI){asSpellEI.checked=!!bot.autoSpell?.status?.().running;asSpellEI.addEventListener("change",()=>{if(asSpellEI.checked)bot.autoSpell?.start?.({spellWords:asSpellI?.value?.trim()||"exori",minMobCount:Math.max(1,Number(asMinMobsI?.value)||2),cooldownMs:Math.max(500,Number(asSpellCdI?.value)||2000)});else bot.autoSpell?.stop?.();refreshAutoSpellStatus();});}

    // ── Xray ─────────────────────────────────────────────────
    const xrayOvB=panel.querySelector("#minibia-bot-xray-overlay-toggle");
    const xrayFsI=panel.querySelector("#minibia-bot-xray-floor-select");
    xrayOvB?.addEventListener("click",()=>{bot.xray?.setOverlayEnabled?.(!bot.xray?.status?.().config?.overlayEnabled);refreshXrayStatus();});
    xrayFsI?.addEventListener("change",()=>{const v=xrayFsI.value;bot.xray?.setSelectedFloor?.(v==="all"?null:Number(v));refreshXrayStatus();refreshVisibleCreatures();});

    // ── Talk ──────────────────────────────────────────────────
    const talkAkI=panel.querySelector("#minibia-bot-talk-api-key");
    const talkPrI=panel.querySelector("#minibia-bot-talk-prompt");
    const talkEI=panel.querySelector("#minibia-bot-talk-enabled");
    if(talkAkI){talkAkI.value=bot.talk?.config?.apiKey||"";talkAkI.addEventListener("change",()=>{bot.talk.updateConfig({apiKey:talkAkI.value.trim()});refreshTalkStatus();});}
    if(talkPrI){talkPrI.value=bot.talk?.config?.systemPrompt||"";talkPrI.addEventListener("change",()=>bot.talk.updateConfig({systemPrompt:talkPrI.value.trim()}));}
    if(talkEI){talkEI.checked=!!bot.talk?.status?.().running;talkEI.addEventListener("change",()=>{if(talkEI.checked){bot.talk.updateConfig({apiKey:talkAkI?.value?.trim()||"",systemPrompt:talkPrI?.value?.trim()||bot.talk.config.systemPrompt||""});if(!bot.talk.start())talkEI.checked=false;}else bot.talk.stop();refreshTalkStatus();});}

    // ── Profiles ──────────────────────────────────────────────
    const prNameI=panel.querySelector("#minibia-bot-profiles-name-input");
    const prSelI=panel.querySelector("#minibia-bot-profiles-select");
    const prSaveB=panel.querySelector("#minibia-bot-profiles-save");
    const prLoadB=panel.querySelector("#minibia-bot-profiles-load");
    const prDelB=panel.querySelector("#minibia-bot-profiles-delete");
    const prExpB=panel.querySelector("#minibia-bot-profiles-export");
    prSelI?.addEventListener("change",()=>{if(prNameI&&prSelI.value)prNameI.value=prSelI.value;});
    prSaveB?.addEventListener("click",()=>{const n=prNameI?.value?.trim()||"";if(!n){alert("Enter a profile name.");return;}bot.profiles?.save?.(n);refreshProfilesPanel();});
    prLoadB?.addEventListener("click",()=>{const n=prSelI?.value||prNameI?.value?.trim()||"";if(!n){alert("Select a profile to load.");return;}bot.profiles?.load?.(n);});
    prDelB?.addEventListener("click",()=>{const n=prSelI?.value||"";if(!n)return;if(!confirm("Delete profile: "+n+"?"))return;bot.profiles?.delete?.(n);if(prNameI)prNameI.value="";refreshProfilesPanel();});
    prExpB?.addEventListener("click",()=>{const n=prSelI?.value||"";bot.profiles?.export?.(n||null);});

    // ── Refresh inicial ───────────────────────────────────────
    refreshHomeLabel();refreshPanicStatus();refreshXrayStatus();
    renderGameMasterNames();renderTrustedNames();renderAttackTargetNames();
    refreshRuneStatus();refreshAutoHealStatus();refreshAutoInvisibleStatus();
    refreshAutoMagicShieldStatus();refreshAutoAttackStatus();refreshAutoEatStatus();
    refreshCaveStatus();refreshEquipRingStatus();refreshTalkStatus();
    refreshProfilesPanel();refreshFollowStatus();refreshVisibleCreatures();
    refreshCavePresetControls();refreshCaveClosestStatus();refreshCaveTransitionStatus();
    refreshautostackStatus();refreshCapRingStatus();refreshHasteStatus();refreshFriendHealStatus();refreshAutoSpellStatus();
    refreshDistanceAttackStatus();

    // ── Timers ────────────────────────────────────────────────
    const t1=window.setInterval(refreshVisibleCreatures,1000); bot.addCleanup(()=>window.clearInterval(t1));
    const t2=window.setInterval(()=>{refreshTalkStatus();refreshFollowStatus();refreshProfilesPanel();refreshautostackStatus();refreshCapRingStatus();refreshHasteStatus();refreshFriendHealStatus();refreshAutoSpellStatus();refreshDistanceAttackStatus();},1000); bot.addCleanup(()=>window.clearInterval(t2));
    const t3=window.setInterval(()=>{refreshCaveStatus();refreshCavePresetControls();refreshCaveClosestStatus();refreshCaveTransitionStatus();},1000); bot.addCleanup(()=>window.clearInterval(t3));
  }

  bot.ui = {
    inject, destroy,
    refreshHomeLabel, refreshPanicStatus, refreshXrayStatus,
    refreshRuneStatus, refreshAutoHealStatus, refreshAutoInvisibleStatus,
    refreshAutoMagicShieldStatus, refreshAutoAttackStatus, renderAttackTargetNames,
    refreshAutoEatStatus, refreshCaveStatus, refreshCavePresetControls,
    refreshEquipRingStatus, refreshTalkStatus, refreshProfilesPanel,
    refreshFollowStatus, refreshVisibleCreatures, refreshCaveClosestStatus,
    refreshCaveTransitionStatus, refreshautostackStatus, refreshCapRingStatus, refreshHasteStatus,
    refreshFriendHealStatus, refreshAutoSpellStatus, refreshDistanceAttackStatus,
    getSavedPanelPosition, getSavedPanelCollapsed,
    setPanelCollapsed:(collapsed)=>{const p=document.getElementById("minibia-bot-panel");setPanelCollapsed(p,collapsed);},
  };
};

(() => {
  const bundle = window.__minibiaBotBundle || window.__minibiaBotReloadBundle || {};
  const persistedEnabledModules = [
    ["rune",          "minibiaBot.rune.config"],
    ["heal",          "minibiaBot.heal.config"],
    ["invisible",     "minibiaBot.invisible.config"],
    ["magicShield",   "minibiaBot.magicShield.config"],
    ["attack",        "minibiaBot.attack.config"],
    ["cave",          "minibiaBot.cave.config"],
    ["equipRing",     "minibiaBot.equipRing.config"],
    ["eat",           "minibiaBot.eat.config"],
    ["talk",          "minibiaBot.talk.config"],
    ["follow",        "minibiaBot.follow.config"],
    ["autostack",     "minibiaBot.autostack.config"],
    ["autoringbycap", "minibiaBot.autoringbycap.config"],
    ["haste",          "minibiaBot.haste.config"],
    ["friendHeal",    "minibiaBot.friendHeal.config"],
    ["autoSpell",     "minibiaBot.autoSpell.config"],
    ["distanceAttack","minibiaBot.distanceAttack.config"],
  ];

  function getPersistedEnabledSnapshot(bot) {
    const snapshot = {};
    const status = typeof bot?.status === "function" ? bot.status() : null;
    persistedEnabledModules.forEach(([moduleName]) => {
      const enabled = status?.[moduleName]?.config?.enabled;
      if (typeof enabled === "boolean") snapshot[moduleName] = enabled;
    });
    return snapshot;
  }

  function restorePersistedEnabledSnapshot(snapshot) {
    persistedEnabledModules.forEach(([moduleName, storageKey]) => {
      if (typeof snapshot?.[moduleName] !== "boolean") return;
      try {
        const rawValue = window.localStorage.getItem(storageKey);
        const config = rawValue ? JSON.parse(rawValue) : {};
        config.enabled = snapshot[moduleName];
        window.localStorage.setItem(storageKey, JSON.stringify(config));
      } catch (error) {
        console.error("[minibia-bot] failed to restore persisted enabled state", { module: moduleName, error });
      }
    });
  }

  function boot(currentBundle = bundle) {
    const previousEnabledSnapshot = getPersistedEnabledSnapshot(window.minibiaBot);
    if (window.minibiaBot?.destroy) window.minibiaBot.destroy();
    restorePersistedEnabledSnapshot(previousEnabledSnapshot);

    const bot = currentBundle.createBot();

    currentBundle.installPzModule(bot);
    currentBundle.installXrayModule(bot);
    currentBundle.installPanicModule(bot);
    currentBundle.installRuneModule(bot);
    currentBundle.installHealModule(bot);
    currentBundle.installAutoInvisibleModule(bot);
    currentBundle.installAutoMagicShieldModule(bot);
    currentBundle.installAutoAttackModule(bot);
    currentBundle.installCaveModule(bot);
    currentBundle.installEquipRingModule(bot);
    currentBundle.installAutoEatModule(bot);
    currentBundle.installTalkModule(bot);
    currentBundle.installAutoFollowModule(bot);
    currentBundle.installautostackModule(bot);
    currentBundle.installautoringbycapModule(bot);
    currentBundle.installastemodule(bot);
    currentBundle.installFriendHealModule(bot);
    currentBundle.installAutoSpellModule(bot);
    currentBundle.installDistanceAttackModule(bot);
    currentBundle.installMeleePositionModule(bot);
    currentBundle.installProfilesModule(bot);
    currentBundle.installPanel(bot);

    bot.ui.inject();

    bot.start  = (...args) => bot.rune.start(...args);
    bot.stop   = (...args) => bot.rune.stop(...args);
    bot.reload = () => window.minibiaBotReload?.();
    bot.status = () => ({
      version:        bot.version,
      pz:             { home: bot.pz.getHomePz() },
      xray:           bot.xray.status(),
      panic:          bot.panic.status(),
      rune:           bot.rune.status(),
      heal:           bot.heal.status(),
      invisible:      bot.invisible.status(),
      magicShield:    bot.magicShield.status(),
      attack:         bot.attack.status(),
      cave:           bot.cave.status(),
      equipRing:      bot.equipRing.status(),
      eat:            bot.eat.status(),
      talk:           bot.talk.status(),
      follow:         bot.follow.status(),
      autostack:      bot.autostack.status(),
      autoringbycap:  bot.autoringbycap.status(),
      haste:          bot.haste.status(),
      friendHeal:     bot.friendHeal.status(),
      autoSpell:      bot.autoSpell.status(),
      distanceAttack:  bot.distanceAttack.status(),
      meleePosition:   bot.meleePosition.status(),
      profiles:        bot.profiles.status(),
    });

    window.minibiaBot = bot;
    window.pzBot = bot.pz;

    console.log("[minibia-bot] ready", { version: bot.version });
    return bot;
  }

  window.__minibiaBotReloadBundle = bundle;
  window.minibiaBotReload = () => boot(window.__minibiaBotReloadBundle || bundle);
  delete window.__minibiaBotBundle;
  boot(bundle);
})();
// ============================================================
// Minibia — Detector de Mensagens de Chat (via API interna)
// ============================================================
// Lê as mensagens direto da memória do jogo
// (window.gameClient.interface.channelManager), sem precisar
// clicar em abas nem observar o DOM. Muito mais confiável.
//
// Como usar: cole isso no console (F12) enquanto estiver no jogo.
// ============================================================

(function () {

  // ---------- CONFIGURAÇÃO ----------

  const VOLUME = 0.3;                  // volume do alarme (0 a 1)
  const TOM_HZ = 880;                  // tom do alarme
  const QTD_BIPS = 3;                  // quantos bips por menção
  const POLL_INTERVAL_MS = 500;        // com que frequência verificar novas mensagens

  // Quando tocar o alarme:
  //   "mencao"   -> só quando alguém (que não seja você) mencionar seu nome
  //   "qualquer" -> em qualquer mensagem nova de qualquer pessoa
  const ALARME_EM = "qualquer";

  // Mensagens que contenham qualquer um desses textos são ignoradas
  // (não aparecem no console do detector, não tocam alarme).
  const IGNORAR_SE_CONTIVER = [
    "hitpoints",
    "attack"
  ];

  // Atalho de teclado pra ligar/desligar o detector.
  const HOTKEY_CTRL = true;
  const HOTKEY_SHIFT = true;
  const HOTKEY_TECLA = "m";

  // Só processa mensagens desses canais (nome exato, como aparece no jogo).
  // Deixe [] (vazio) pra processar todos os canais.
  const CANAIS_PERMITIDOS = ["Default", "Console"];

  // Se a detecção automática do nome falhar, defina aqui manualmente
  // (ex: "Hessin"). Deixe null pra continuar tentando detectar sozinho.
  const PLAYER_NAME_OVERRIDE = null;


  // ---------- ESTADO ----------

  let detectorAtivo = true;
  let playerName = null;
  const ultimaContagemPorCanal = new Map(); // índice do canal -> qtd de mensagens já vistas

  const CHAVE_STORAGE_IGNORAR = "minibiaChatDetector.ignorar";

  function carregarIgnoradosSalvos() {
    try {
      const salvos = JSON.parse(localStorage.getItem(CHAVE_STORAGE_IGNORAR) || "[]");
      return Array.isArray(salvos) ? salvos : [];
    } catch (e) {
      return [];
    }
  }

  function salvarIgnorados() {
    localStorage.setItem(CHAVE_STORAGE_IGNORAR, JSON.stringify(listaIgnorados));
  }

  // Lista final = palavras fixas do código + palavras adicionadas
  // manualmente pelo botão (persistidas entre sessões).
  const listaIgnorados = IGNORAR_SE_CONTIVER.concat(carregarIgnoradosSalvos());

  function adicionarIgnorado(termo) {
    const termoLimpo = termo.trim();
    if (!termoLimpo) return;

    if (listaIgnorados.some(function (t) { return t.toLowerCase() === termoLimpo.toLowerCase(); })) {
      console.log("%c[Chat] \"" + termoLimpo + "\" já estava na lista de ignorados.", "color: gray;");
      return;
    }

    listaIgnorados.push(termoLimpo);
    salvarIgnorados();
    console.log("%c[Chat] Passou a ignorar mensagens contendo: \"" + termoLimpo + "\"", "color: lightblue; font-weight: bold;");
  }


  // ---------- ALARME SONORO ----------

  function tocarAlarme() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();

      for (let i = 0; i < QTD_BIPS; i++) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.type = "square";
        oscillator.frequency.value = TOM_HZ;
        gain.gain.value = VOLUME;

        const inicio = ctx.currentTime + i * 0.3;
        oscillator.start(inicio);
        oscillator.stop(inicio + 0.2);
      }
    } catch (erro) {
      console.error("[Chat] Erro ao tocar alarme:", erro.message);
    }
  }


  // ---------- PROCESSAMENTO DE CADA MENSAGEM ----------

  function deveIgnorar(mensagem) {
    const texto = (mensagem || "").toLowerCase();
    return listaIgnorados.some(function (padrao) {
      return texto.includes(padrao.toLowerCase());
    });
  }

  function processarMensagem(msgObj, nomeCanal, ehHistorico) {
    const remetente = (msgObj.name || "Sistema").trim();
    const mensagem = msgObj.message || "";

    if (deveIgnorar(mensagem)) return;

    const souEu = playerName ? remetente.toLowerCase() === playerName.toLowerCase() : false;
    const fuiMencionado = playerName && !souEu && mensagem.toLowerCase().includes(playerName.toLowerCase());

    const deveAlarmar =
      !ehHistorico && detectorAtivo && (
        ALARME_EM === "qualquer" ? !souEu :
        ALARME_EM === "mencao" ? fuiMencionado :
        false
      );

    const prefixo = "[" + nomeCanal + "]";

    if (fuiMencionado) {
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


  // ---------- VERIFICAÇÃO PERIÓDICA DOS CANAIS ----------

  function verificarCanais(ehVerificacaoInicial) {
    const channelManager = window.gameClient?.interface?.channelManager;
    if (!channelManager || !Array.isArray(channelManager.channels)) {
      return;
    }

    channelManager.channels.forEach(function (channel, indice) {
      const nomeCanal = channel.name || ("Canal " + indice);

      if (CANAIS_PERMITIDOS.length > 0 && !CANAIS_PERMITIDOS.includes(nomeCanal)) {
        return; // ignora canais fora da lista
      }

      const contents = channel.__contents || [];
      const contagemAnterior = ultimaContagemPorCanal.get(indice) || 0;

      if (contents.length > contagemAnterior) {
        for (let i = contagemAnterior; i < contents.length; i++) {
          processarMensagem(contents[i], nomeCanal, ehVerificacaoInicial);
        }
      }

      ultimaContagemPorCanal.set(indice, contents.length);
    });
  }


  // ---------- ALTERNAR LIGADO/DESLIGADO ----------

  let botaoFlutuante = null;
  let botaoIgnorar = null;

  function atualizarBotao() {
    if (!botaoFlutuante) return;
    botaoFlutuante.textContent = detectorAtivo ? "🔔 Chat ON" : "🔕 Chat OFF";
    botaoFlutuante.style.background = detectorAtivo ? "#2ecc71" : "#e74c3c";
  }

  function alternarDetector() {
    detectorAtivo = !detectorAtivo;
    console.log(
      "%c[Chat] Detector " + (detectorAtivo ? "LIGADO ✅" : "DESLIGADO ⛔"),
      "color: " + (detectorAtivo ? "lightgreen" : "red") + "; font-weight: bold; font-size: 14px;"
    );
    atualizarBotao();
  }

  function criarBotaoFlutuante() {
    botaoFlutuante = document.createElement("button");
    botaoFlutuante.style.position = "fixed";
    botaoFlutuante.style.bottom = "16px";
    botaoFlutuante.style.right = "16px";
    botaoFlutuante.style.zIndex = "999999";
    botaoFlutuante.style.padding = "10px 14px";
    botaoFlutuante.style.borderRadius = "20px";
    botaoFlutuante.style.border = "none";
    botaoFlutuante.style.color = "white";
    botaoFlutuante.style.fontWeight = "bold";
    botaoFlutuante.style.fontSize = "13px";
    botaoFlutuante.style.cursor = "grab";
    botaoFlutuante.style.boxShadow = "0 2px 8px rgba(0,0,0,0.4)";
    botaoFlutuante.style.touchAction = "none"; // evita rolar a página ao arrastar no celular
    botaoFlutuante.style.userSelect = "none";

    document.body.appendChild(botaoFlutuante);
    atualizarBotao();
    tornarArrastavel(botaoFlutuante);

    criarBotaoIgnorar();
  }

  function criarBotaoIgnorar() {
    botaoIgnorar = document.createElement("button");
    botaoIgnorar.textContent = "🚫 + Ignorar";
    botaoIgnorar.style.position = "fixed";
    botaoIgnorar.style.bottom = "60px";
    botaoIgnorar.style.right = "16px";
    botaoIgnorar.style.zIndex = "999999";
    botaoIgnorar.style.padding = "10px 14px";
    botaoIgnorar.style.borderRadius = "20px";
    botaoIgnorar.style.border = "none";
    botaoIgnorar.style.color = "white";
    botaoIgnorar.style.fontWeight = "bold";
    botaoIgnorar.style.fontSize = "13px";
    botaoIgnorar.style.cursor = "grab";
    botaoIgnorar.style.background = "#7f8c8d";
    botaoIgnorar.style.boxShadow = "0 2px 8px rgba(0,0,0,0.4)";
    botaoIgnorar.style.touchAction = "none";
    botaoIgnorar.style.userSelect = "none";

    document.body.appendChild(botaoIgnorar);
    tornarArrastavel(botaoIgnorar, function () {
      const termo = window.prompt("Ignorar mensagens que contenham:");
      if (termo) adicionarIgnorado(termo);
    });
  }

  // Deixa o elemento arrastável tanto com mouse (PC) quanto touch (celular).
  // Só conta como "clique" (alterna o detector) se o dedo/mouse não
  // tiver se movido quase nada — senão, foi um arraste de verdade.
  function tornarArrastavel(elemento, aoClicar) {
    const acaoClique = aoClicar || alternarDetector;
    let arrastando = false;
    let moveu = false;
    let offsetX = 0;
    let offsetY = 0;

    function posicaoInicial(clientX, clientY) {
      const rect = elemento.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      arrastando = true;
      moveu = false;
      elemento.style.cursor = "grabbing";
    }

    function mover(clientX, clientY) {
      if (!arrastando) return;
      moveu = true;

      let novoLeft = clientX - offsetX;
      let novoTop = clientY - offsetY;

      const largura = elemento.offsetWidth;
      const altura = elemento.offsetHeight;
      novoLeft = Math.max(0, Math.min(window.innerWidth - largura, novoLeft));
      novoTop = Math.max(0, Math.min(window.innerHeight - altura, novoTop));

      elemento.style.left = novoLeft + "px";
      elemento.style.top = novoTop + "px";
      elemento.style.right = "auto";
      elemento.style.bottom = "auto";
    }

    function soltar() {
      arrastando = false;
      elemento.style.cursor = "grab";

      if (!moveu) {
        acaoClique();
      }
    }

    elemento.addEventListener("mousedown", function (e) {
      e.preventDefault();
      posicaoInicial(e.clientX, e.clientY);
    });
    document.addEventListener("mousemove", function (e) {
      mover(e.clientX, e.clientY);
    });
    document.addEventListener("mouseup", function () {
      if (arrastando) soltar();
    });

    elemento.addEventListener("touchstart", function (e) {
      const toque = e.touches[0];
      posicaoInicial(toque.clientX, toque.clientY);
    }, { passive: true });
    document.addEventListener("touchmove", function (e) {
      const toque = e.touches[0];
      mover(toque.clientX, toque.clientY);
    }, { passive: true });
    document.addEventListener("touchend", function () {
      if (arrastando) soltar();
    });
  }

  function configurarHotkey() {
    document.addEventListener("keydown", function (evento) {
      const teclaBate = evento.key.toLowerCase() === HOTKEY_TECLA.toLowerCase();
      const ctrlBate = evento.ctrlKey === HOTKEY_CTRL;
      const shiftBate = evento.shiftKey === HOTKEY_SHIFT;

      if (teclaBate && ctrlBate && shiftBate) {
        alternarDetector();
      }
    });
  }


  // ---------- INICIALIZAÇÃO ----------

  function iniciar() {
    playerName = PLAYER_NAME_OVERRIDE || (window.gameClient?.player?.name || "").trim() || null;

    criarBotaoFlutuante();
    configurarHotkey();

    // Primeira passada: registra tudo que já existe como "histórico"
    // (não dispara alarme), só pra estabelecer o ponto de partida.
    verificarCanais(true);

    // A partir daqui, verifica periodicamente por mensagens novas.
    setInterval(function () {
      verificarCanais(false);
    }, POLL_INTERVAL_MS);

    console.log(
      "%c[Chat] Detector ativo via API interna. Jogador: " + (playerName || "não detectado"),
      "color: lightgreen; font-weight: bold;"
    );
  }

  if (window.gameClient) {
    iniciar();
  } else {
    console.error("[Chat] window.gameClient não encontrado. O jogo já carregou completamente?");
  }

})();
