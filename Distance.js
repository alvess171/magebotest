(function () {

  // -----------------------------------------------------------------------
  // 1. RECONNECT — toggle para ativar/desativar
  // -----------------------------------------------------------------------
  function patchReconnectToggle(bot) {
    const configStorageKey = "minibiaBot.reconnect.config";
    const config = Object.assign({ enabled: true }, bot.storage.get(configStorageKey, {}));

    function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }

    // Intercepta clickReconnect — só executa se habilitado
    const _originalClickReconnect = bot.clickReconnect.bind(bot);
    bot.clickReconnect = function () {
      if (!config.enabled) return false;
      return _originalClickReconnect();
    };

    bot.reconnectConfig = {
      enable() { config.enabled = true; persistConfig(); bot.log("auto reconnect ativado"); },
      disable() { config.enabled = false; persistConfig(); bot.log("auto reconnect desativado"); },
      status() { return { ...config }; },
      config,
    };

    bot.log("reconnect toggle patch aplicado — enabled:", config.enabled);
  }

  // -----------------------------------------------------------------------
  // 2. PAINEL: toggle reconnect
  // -----------------------------------------------------------------------
  function patchReconnectPanel(bot) {
    if (!bot.reconnectConfig) return;
    const body = window.document.querySelector("#minibia-bot-panel .mb-body");
    if (!body || window.document.getElementById("minibia-bot-reconnect-enabled")) return;

    // Injeta no accordion de Utilities (já existente)
    const utilitiesBody = window.document.querySelector('.mb-accordion[data-module="utilities"] .mb-accordion-body');
    if (!utilitiesBody) { bot.log("accordion utilities não encontrado"); return; }

    const row = window.document.createElement("div");
    row.className = "mb-row";
    row.innerHTML = `
      <label class="mb-toggle">
        <input type="checkbox" id="minibia-bot-reconnect-enabled" />
        <span>Auto Reconnect</span>
      </label>
      <div></div>
    `;

    // Insere no topo do accordion de utilities
    const stack = utilitiesBody.querySelector(".mb-actions") || utilitiesBody;
    stack.insertBefore(row, stack.firstChild);

    const input = row.querySelector("#minibia-bot-reconnect-enabled");
    input.checked = !!bot.reconnectConfig.config.enabled;
    input.addEventListener("change", () => {
      if (input.checked) bot.reconnectConfig.enable();
      else bot.reconnectConfig.disable();
    });

    bot.log("reconnect panel patch aplicado");
  }

  // -----------------------------------------------------------------------
  // 3. DISTANCE ATTACK
  // Mantém o player a X sqm do mob alvo usando o pathfinder
  // -----------------------------------------------------------------------
  function patchDistanceAttack(bot) {
    const configStorageKey = "minibiaBot.distanceAttack.config";
    const state = {
      running: false,
      timerId: null,
      lastCastAt: 0,
      lastMoveAt: 0,
    };

    const config = Object.assign(
      {
        tickMs: 300,
        keepDistance: 3,    // distância ideal em sqm
        runeHotbarSlot: 4,  // hotkey do ataque à distância
        runeCooldownMs: 1200,
        enabled: false,
      },
      bot.storage.get(configStorageKey, {})
    );

    function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }

    function normalizePos(p) {
      if (!p) return null;
      const x = Number(p.x), y = Number(p.y), z = Number(p.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
    }

    function getTileDistance(a, b) {
      if (!a || !b || a.z !== b.z) return Number.POSITIVE_INFINITY;
      return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }

    function getManhattanDistance(a, b) {
      if (!a || !b || a.z !== b.z) return Number.POSITIVE_INFINITY;
      return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    function getCurrentTarget() {
      return window.gameClient?.player?.__target || null;
    }

    function isCombatActive() {
      return !!bot.attack?.isCombatActive?.();
    }

    function getKeepDistance() {
      return Math.max(1, Math.trunc(Number(config.keepDistance) || 3));
    }

    // Encontra posição a X sqm do mob, na direção oposta ao mob
    function findKitePosition(playerPos, targetPos, desiredDistance) {
      if (!playerPos || !targetPos) return null;

      const dx = playerPos.x - targetPos.x;
      const dy = playerPos.y - targetPos.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;

      // Direção de fuga normalizada
      const nx = dx / len;
      const ny = dy / len;

      // Candidatos ao redor da posição ideal
      const idealX = Math.round(targetPos.x + nx * desiredDistance);
      const idealY = Math.round(targetPos.y + ny * desiredDistance);

      const offsets = [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 },
        { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 },
        { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 },
      ];

      for (const offset of offsets) {
        const candidate = { x: idealX + offset.x, y: idealY + offset.y, z: playerPos.z };
        if (candidate.x === playerPos.x && candidate.y === playerPos.y) continue;

        try {
          const tile = window.gameClient?.world?.getTileFromWorldPosition?.(
            new Position(candidate.x, candidate.y, candidate.z)
          );
          if (tile?.isWalkable?.()) return candidate;
        } catch (e) {}
      }

      return null;
    }

    function goToPosition(pos) {
      const from = bot.getPlayerPosition();
      if (!from || !pos) return false;
      try {
        window.gameClient?.world?.pathfinder?.findPath?.(from, new Position(pos.x, pos.y, pos.z));
        return true;
      } catch (e) { return false; }
    }

    function tryDistanceAttack() {
      if (!config.enabled) return false;
      if (!isCombatActive()) return false;

      const target = getCurrentTarget();
      if (!target) return false;

      const playerPos = normalizePos(bot.getPlayerPosition());
      const targetPos = normalizePos(target.__position || target.getPosition?.());
      if (!playerPos || !targetPos) return false;

      const distance = getTileDistance(playerPos, targetPos);
      const desiredDistance = getKeepDistance();
      const now = Date.now();

      // Se muito perto — kita para longe
      if (distance < desiredDistance) {
        if (now - state.lastMoveAt >= 400) {
          const kitePos = findKitePosition(playerPos, targetPos, desiredDistance);
          if (kitePos) {
            goToPosition(kitePos);
            state.lastMoveAt = now;
            bot.log("distance attack kiting", { from: distance, desired: desiredDistance, to: kitePos });
          }
        }
        return false;
      }

      // Se muito longe — aproxima um pouco
      if (distance > desiredDistance + 2) {
        if (now - state.lastMoveAt >= 400) {
          const approachPos = findKitePosition(targetPos, playerPos, desiredDistance);
          if (approachPos) {
            goToPosition(approachPos);
            state.lastMoveAt = now;
            bot.log("distance attack approaching", { from: distance, desired: desiredDistance });
          }
        }
        return false;
      }

      // Distância ok — atira
      const slot = Math.trunc(Number(config.runeHotbarSlot) || 4);
      if (slot < 1 || slot > 12) return false;
      if (now - state.lastCastAt < Math.max(0, Number(config.runeCooldownMs) || 1200)) return false;

      const clicked = bot.clickHotbar(slot - 1);
      if (clicked) {
        state.lastCastAt = now;
        bot.log("distance attack fired", { slot, distance });
      }
      return clicked;
    }

    function scheduleNextTick() { if (!state.running) return; state.timerId = window.setTimeout(() => tick(), config.tickMs); }
    function tick() { if (!state.running) return; try { tryDistanceAttack(); } catch (e) { bot.log("distance attack tick error", e?.message); } finally { scheduleNextTick(); } }

    function start(ov = {}) {
      Object.assign(config, ov, { enabled: true });
      persistConfig();
      if (state.running) return false;
      state.running = true;
      bot.log("distance attack started", { ...config });
      tick();
      return true;
    }

    function stop(opts = {}) {
      const p = opts.persistEnabled !== false;
      state.running = false;
      if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
      if (p) { config.enabled = false; persistConfig(); }
      bot.log("distance attack stopped");
      return true;
    }

    function status() {
      const target = getCurrentTarget();
      const playerPos = normalizePos(bot.getPlayerPosition());
      const targetPos = target ? normalizePos(target.__position || target.getPosition?.()) : null;
      return {
        running: state.running,
        config: { ...config },
        combatActive: isCombatActive(),
        currentTarget: target ? { id: target.id, name: target.name } : null,
        distanceToTarget: getTileDistance(playerPos, targetPos),
        keepDistance: getKeepDistance(),
        lastCastAt: state.lastCastAt,
      };
    }

    function updateConfig(next = {}) {
      if ("keepDistance" in next) next.keepDistance = Math.max(1, Math.min(10, Math.trunc(Number(next.keepDistance) || 3)));
      if ("runeHotbarSlot" in next) next.runeHotbarSlot = Math.max(1, Math.min(12, Math.trunc(Number(next.runeHotbarSlot) || 4)));
      if ("runeCooldownMs" in next) next.runeCooldownMs = Math.max(200, Number(next.runeCooldownMs) || 1200);
      Object.assign(config, next); persistConfig();
      bot.log("distance attack config updated", { ...config });
      return { ...config };
    }

    if (config.enabled) start();
    bot.distanceAttack = { start, stop, status, updateConfig, tryDistanceAttack, config };
  }

  // -----------------------------------------------------------------------
  // 4. PAINEL: Distance Attack
  // -----------------------------------------------------------------------
  function patchDistanceAttackPanel(bot) {
    if (!bot.distanceAttack) return;
    const body = window.document.querySelector("#minibia-bot-panel .mb-body");
    if (!body || window.document.getElementById("minibia-bot-distance-attack-enabled")) return;

    const accordion = window.document.createElement("div");
    accordion.className = "mb-accordion";
    accordion.dataset.module = "distanceAttack";
    accordion.innerHTML = `
      <div class="mb-accordion-header">
        <span class="mb-accordion-title">Distance Attack</span>
        <button type="button" class="mb-accordion-toggle mb-icon-button" aria-label="Expand section">+</button>
      </div>
      <div class="mb-accordion-body" hidden>
        <div class="mb-stack">
          <label class="mb-toggle">
            <input type="checkbox" id="minibia-bot-distance-attack-enabled" />
            <span>Enable Distance Attack</span>
          </label>
          <label class="mb-field" for="minibia-bot-distance-keep">
            <span class="mb-field-label">Manter distância (sqm)</span>
            <input type="number" id="minibia-bot-distance-keep" min="1" max="10" placeholder="3" />
          </label>
          <label class="mb-field" for="minibia-bot-distance-hotkey">
            <span class="mb-field-label">Hotkey de ataque (1-12)</span>
            <input type="number" id="minibia-bot-distance-hotkey" min="1" max="12" placeholder="4" />
          </label>
          <label class="mb-field" for="minibia-bot-distance-cooldown">
            <span class="mb-field-label">Cooldown de ataque (ms)</span>
            <input type="number" id="minibia-bot-distance-cooldown" min="200" placeholder="1200" />
          </label>
          <div class="mb-small-note" id="minibia-bot-distance-attack-status">Status: idle</div>
          <div class="mb-small-note">
            Mantém a distância configurada do mob alvo. Se o mob se aproximar, o player recua. Requer auto attack ativo com um target selecionado. Use junto com Melee Mode desativado no Auto Attack.
          </div>
        </div>
      </div>`;

    const attackAccordion = body.querySelector('.mb-accordion[data-module="attack"]');
    const caveAccordion = body.querySelector('.mb-accordion[data-module="cave"]');
    const insertBefore = caveAccordion || null;
    insertBefore ? body.insertBefore(accordion, insertBefore) : body.appendChild(accordion);

    // Insere após o accordion de attack se existir
    if (attackAccordion?.nextSibling) {
      body.insertBefore(accordion, attackAccordion.nextSibling);
    }

    const enabledInput   = accordion.querySelector("#minibia-bot-distance-attack-enabled");
    const keepInput      = accordion.querySelector("#minibia-bot-distance-keep");
    const hotkeyInput    = accordion.querySelector("#minibia-bot-distance-hotkey");
    const cooldownInput  = accordion.querySelector("#minibia-bot-distance-cooldown");
    const statusLabel    = accordion.querySelector("#minibia-bot-distance-attack-status");

    enabledInput.checked  = !!bot.distanceAttack.status().running;
    keepInput.value       = String(bot.distanceAttack.config.keepDistance ?? 3);
    hotkeyInput.value     = String(bot.distanceAttack.config.runeHotbarSlot ?? 4);
    cooldownInput.value   = String(bot.distanceAttack.config.runeCooldownMs ?? 1200);

    function refreshStatus() {
      const s = bot.distanceAttack.status();
      enabledInput.checked = s.running;
      if (s.running) {
        const dist = Number.isFinite(s.distanceToTarget) ? s.distanceToTarget : "?";
        statusLabel.textContent = `Status: ativo • distância: ${dist} sqm • alvo: ${s.currentTarget?.name || "nenhum"} • combat: ${s.combatActive ? "✓" : "✗"}`;
      } else {
        statusLabel.textContent = "Status: parado";
      }
    }

    keepInput.addEventListener("change", () => { const v = Math.max(1, Math.min(10, Number(keepInput.value) || 3)); keepInput.value = String(v); bot.distanceAttack.updateConfig({ keepDistance: v }); });
    hotkeyInput.addEventListener("change", () => { const v = Math.max(1, Math.min(12, Number(hotkeyInput.value) || 4)); hotkeyInput.value = String(v); bot.distanceAttack.updateConfig({ runeHotbarSlot: v }); });
    cooldownInput.addEventListener("change", () => { const v = Math.max(200, Number(cooldownInput.value) || 1200); cooldownInput.value = String(v); bot.distanceAttack.updateConfig({ runeCooldownMs: v }); });

    enabledInput.addEventListener("change", () => {
      if (enabledInput.checked) {
        bot.distanceAttack.updateConfig({
          keepDistance: Math.max(1, Math.min(10, Number(keepInput.value) || 3)),
          runeHotbarSlot: Math.max(1, Math.min(12, Number(hotkeyInput.value) || 4)),
          runeCooldownMs: Math.max(200, Number(cooldownInput.value) || 1200),
        });
        if (!bot.distanceAttack.start()) enabledInput.checked = false;
      } else {
        bot.distanceAttack.stop();
      }
      refreshStatus();
    });

    const toggle = accordion.querySelector(".mb-accordion-toggle");
    const abody  = accordion.querySelector(".mb-accordion-body");
    accordion.querySelector(".mb-accordion-header").addEventListener("click", (e) => { if (e.target.closest("button:not(.mb-accordion-toggle), input, select, textarea, a, label")) return; const exp = accordion.dataset.expanded === "true"; accordion.dataset.expanded = exp ? "false" : "true"; abody.hidden = exp; toggle.textContent = exp ? "+" : "−"; });
    toggle.addEventListener("click", (e) => { e.stopPropagation(); const exp = accordion.dataset.expanded === "true"; accordion.dataset.expanded = exp ? "false" : "true"; abody.hidden = exp; toggle.textContent = exp ? "+" : "−"; });

    const tid = window.setInterval(refreshStatus, 1000);
    bot.addCleanup(() => window.clearInterval(tid));
    bot.ui.refreshDistanceAttackStatus = refreshStatus;
    refreshStatus();
  }

  // -----------------------------------------------------------------------
  // APPLY ALL
  // -----------------------------------------------------------------------
  function applyAll(bot) {
    patchReconnectToggle(bot);
    patchReconnectPanel(bot);
    patchDistanceAttack(bot);
    patchDistanceAttackPanel(bot);
    console.log("[minibia-bot] ✓ reconnect toggle + distance attack aplicados");
  }

  applyAll(minibiaBot);

  const _originalReload = window.minibiaBotReload;
  window.minibiaBotReload = function () {
    _originalReload();
    setTimeout(() => applyAll(minibiaBot), 600);
  };

  console.log("[minibia-bot] ✓ patch v2.1 instalado — persiste em minibiaBotReload()");

})();