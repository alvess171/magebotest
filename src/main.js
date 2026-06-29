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
    ["autoStack",     "minibiaBot.autoStack.config"],
    ["autoRingByCap", "minibiaBot.autoRingByCap.config"],
    ["haste",     "minibiaBot.haste.config"],
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
    currentBundle.installAutoStackModule(bot);
    currentBundle.installAutoRingByCapModule(bot);
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
      version        : bot.version,
      pz             : { home: bot.pz.getHomePz() },
      xray           : bot.xray.status(),
      panic          : bot.panic.status(),
      rune           : bot.rune.status(),
      heal           : bot.heal.status(),
      invisible      : bot.invisible.status(),
      magicShield    : bot.magicShield.status(),
      attack         : bot.attack.status(),
      cave           : bot.cave.status(),
      equipRing      : bot.equipRing.status(),
      eat            : bot.eat.status(),
      talk           : bot.talk.status(),
      follow         : bot.follow.status(),
      autoStack      : bot.autoStack.status(),
      autoRingByCap  : bot.autoRingByCap.status(),
      haste      : bot.haste.status(),
      friendHeal     : bot.friendHeal.status(),
      autoSpell      : bot.autoSpell.status(),
      distanceAttack : bot.distanceAttack.status(),
      meleePosition  : bot.meleePosition.status(),
      profiles       : bot.profiles.status(),
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
