window.__minibiaBotBundle = window.__minibiaBotBundle || {};

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
