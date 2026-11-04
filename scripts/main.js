import { MODULE_ID, ProgressTrackerModel } from "./models/tracker-model.js";
import { TrackerStore } from "./store/tracker-store.js";
import { TrackerHUDApp, PlayerOverlay } from "./apps/tracker-hud.js";
import { TrackerConfigApp } from "./apps/tracker-config.js";

/**
 * Public API for Macros and third-party modules.
 */
const PublicAPI = {
  openHUD: () => TrackerHUDApp.toggle(),
  closeHUD: () => {
    if (game.user?.isGM) TrackerHUDApp.instance.close();
  },
  toggleHUD: () => TrackerHUDApp.toggle(),
  openConfig: (trackerData = {}) => new TrackerConfigApp(trackerData).render(true),
  getAll: () => TrackerStore.getAll(),
  getVisible: () => TrackerStore.getVisibleForUser(game.user),
  get: (idOrTitle) => TrackerStore.get(idOrTitle),
  createTracker: (data) => TrackerStore.upsert(data),
  updateTracker: (idOrTitle, updates) => {
    const existing = TrackerStore.get(idOrTitle);
    if (!existing) return null;
    return TrackerStore.upsert({ ...updates, id: existing.id });
  },
  modifyProgress: (idOrTitle, delta = 1) => TrackerStore.modifyProgress(idOrTitle, delta),
  setProgress: (idOrTitle, value) => TrackerStore.setProgress(idOrTitle, value),
  setVisibility: (idOrTitle, showToPlayers = true) => {
    const existing = TrackerStore.get(idOrTitle);
    if (!existing) return null;
    return TrackerStore.upsert({ id: existing.id, showToPlayers: Boolean(showToPlayers) });
  },
  deleteTracker: (idOrTitle) => {
    const existing = TrackerStore.get(idOrTitle);
    if (!existing) return null;
    return TrackerStore.delete(existing.id);
  },
  Model: ProgressTrackerModel
};

Hooks.once("init", () => {
  TrackerStore.registerSettings(() => {
    TrackerHUDApp.refresh();
  });

  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = PublicAPI;
  }
  globalThis.WoWProgressTracker = PublicAPI;
});

Hooks.once("ready", () => {
  TrackerStore.registerSocket();

  if (!game.user.isGM) {
    // Players always see visible progress bar cards floating at top-right next to the right sidebar
    PlayerOverlay.render();
    return;
  }

  if (game.settings.get(MODULE_ID, "autoOpenHUD")) {
    const visible = TrackerStore.getVisibleForUser(game.user);
    if (visible.length > 0) {
      TrackerHUDApp.instance.render(true);
    }
  }
});

/**
 * Adds a quick-access button to the Scene Controls toolbar for the GM (compatible with Foundry v13 & v14).
 */
Hooks.on("getSceneControlButtons", (controls) => {
  const toolConfig = {
    name: "wowProgressTracker",
    title: "WOWPT.ControlBtn",
    icon: "fa-solid fa-bars-progress",
    visible: game.user?.isGM ?? true,
    button: true,
    onChange: () => TrackerHUDApp.toggle(),
    onClick: () => TrackerHUDApp.toggle()
  };

  // Foundry v13 / v14: `controls` is a Record<string, SceneControl> (`controls.tokens` or `controls.token`)
  if (!Array.isArray(controls) && typeof controls === "object" && controls !== null) {
    const tokenGroup = controls.tokens || controls.token || Object.values(controls)[0];
    if (!tokenGroup?.tools) return;

    if (Array.isArray(tokenGroup.tools)) {
      tokenGroup.tools.push(toolConfig);
    } else {
      tokenGroup.tools[toolConfig.name] = {
        ...toolConfig,
        order: Object.keys(tokenGroup.tools).length + 1
      };
    }
    return;
  }

  // Fallback if `controls` is an Array
  if (Array.isArray(controls)) {
    const tokenGroup = controls.find((c) => c.name === "token" || c.name === "tokens");
    if (tokenGroup && Array.isArray(tokenGroup.tools)) {
      tokenGroup.tools.push(toolConfig);
    }
  }
});
