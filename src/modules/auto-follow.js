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
      tickMs: 50,
      targetPlayerName: "",   // nome do player a seguir
      followDistance: 2,      // distância desejada em sqm (Chebyshev)
      moveCooldownMs: 50,    // mínimo entre pathfinds consecutivos
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
