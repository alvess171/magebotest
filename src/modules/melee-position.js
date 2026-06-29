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
