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
