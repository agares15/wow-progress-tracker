import { MODULE_ID, ProgressTrackerModel } from "../models/tracker-model.js";

const SETTING_TRACKERS = "trackers";

/**
 * Lightweight store managing progress trackers via Foundry VTT world settings.
 */
export class TrackerStore {
  /**
   * Registers world & client settings for the module.
   * @param {Function} onTrackersUpdated Callback invoked when trackers change
   */
  static registerSettings(onTrackersUpdated) {
    game.settings.register(MODULE_ID, SETTING_TRACKERS, {
      name: "Progress Trackers Data",
      scope: "world",
      config: false,
      type: Array,
      default: [],
      onChange: () => {
        if (typeof onTrackersUpdated === "function") onTrackersUpdated();
      }
    });

    game.settings.register(MODULE_ID, "autoOpenHUD", {
      name: "WOWPT.Settings.AutoOpen.Name",
      hint: "WOWPT.Settings.AutoOpen.Hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "hudLocked", {
      scope: "client",
      config: false,
      type: Boolean,
      default: false
    });

    game.settings.register(MODULE_ID, "hudPosition", {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });
  }

  /**
   * Registers socket listener so players with `allowPlayerEdit` can request progress changes.
   */
  static registerSocket() {
    game.socket?.on(`module.${MODULE_ID}`, async (payload) => {
      if (!game.user.isGM) return;
      // Only the primary active GM processes socket requests to prevent duplicate writes
      const activeGM = game.users.activeGM;
      if (activeGM && activeGM.id !== game.user.id) return;

      if (payload?.action === "modifyProgress") {
        const { trackerId, delta, exactValue, userId } = payload;
        const user = game.users.get(userId);
        const tracker = this.get(trackerId);
        if (!tracker || !user || !tracker.canUserEdit(user)) return;

        if (typeof exactValue === "number") {
          await this.setProgress(trackerId, exactValue);
        } else if (typeof delta === "number") {
          await this.modifyProgress(trackerId, delta);
        }
      }
    });
  }

  /**
   * Returns all trackers as validated ProgressTrackerModel instances.
   * @returns {ProgressTrackerModel[]}
   */
  static getAll() {
    const raw = game.settings.get(MODULE_ID, SETTING_TRACKERS) || [];
    return raw.map((item) => {
      try {
        return new ProgressTrackerModel(item);
      } catch (err) {
        console.warn(`${MODULE_ID} | Invalid tracker entry skipped:`, err);
        return null;
      }
    }).filter(Boolean);
  }

  /**
   * Returns trackers visible to the given user.
   * @param {User} user
   * @returns {ProgressTrackerModel[]}
   */
  static getVisibleForUser(user = game.user) {
    return this.getAll().filter((t) => t.canUserView(user));
  }

  /**
   * Finds a tracker by ID or title.
   * @param {string} idOrTitle
   * @returns {ProgressTrackerModel|null}
   */
  static get(idOrTitle) {
    if (!idOrTitle) return null;
    const trackers = this.getAll();
    return (
      trackers.find((t) => t.id === idOrTitle) ||
      trackers.find((t) => t.title.toLowerCase() === String(idOrTitle).toLowerCase()) ||
      null
    );
  }

  /**
   * Persists the list of trackers to world settings.
   * @param {Array<ProgressTrackerModel|object>} trackers
   */
  static async saveAll(trackers) {
    if (!game.user.isGM) return;
    const serialized = trackers.map((t) =>
      t instanceof ProgressTrackerModel ? t.toObject() : new ProgressTrackerModel(t).toObject()
    );
    await game.settings.set(MODULE_ID, SETTING_TRACKERS, serialized);
  }

  /**
   * Creates or updates a single tracker.
   * @param {object} data
   * @returns {Promise<ProgressTrackerModel>}
   */
  static async upsert(data) {
    const all = this.getAll();
    const index = data.id ? all.findIndex((t) => t.id === data.id) : -1;

    let model;
    if (index >= 0) {
      const merged = foundry.utils.mergeObject(all[index].toObject(), data, { inplace: false });
      model = new ProgressTrackerModel(merged);
      all[index] = model;
    } else {
      model = new ProgressTrackerModel(data);
      all.push(model);
    }

    await this.saveAll(all);
    return model;
  }

  /**
   * Deletes a tracker by ID.
   * @param {string} id
   */
  static async delete(id) {
    if (!game.user.isGM) return;
    const filtered = this.getAll().filter((t) => t.id !== id);
    await this.saveAll(filtered);
  }

  /**
   * Modifies a tracker's progress by a delta (+/-).
   * Supports both GM direct update and permitted player socket emission.
   * @param {string} idOrTitle
   * @param {number} delta
   */
  static async modifyProgress(idOrTitle, delta) {
    const tracker = this.get(idOrTitle);
    if (!tracker) return null;

    if (!game.user.isGM) {
      if (tracker.canUserEdit(game.user)) {
        game.socket?.emit(`module.${MODULE_ID}`, {
          action: "modifyProgress",
          trackerId: tracker.id,
          delta: Number(delta),
          userId: game.user.id
        });
      }
      return null;
    }

    const nextValue = Math.min(Math.max(0, tracker.value + Number(delta)), tracker.max);
    return this.upsert({ id: tracker.id, value: Math.round(nextValue * 100) / 100 });
  }

  /**
   * Sets a tracker's progress to an exact value.
   * @param {string} idOrTitle
   * @param {number} value
   */
  static async setProgress(idOrTitle, value) {
    const tracker = this.get(idOrTitle);
    if (!tracker) return null;

    if (!game.user.isGM) {
      if (tracker.canUserEdit(game.user)) {
        game.socket?.emit(`module.${MODULE_ID}`, {
          action: "modifyProgress",
          trackerId: tracker.id,
          exactValue: Number(value),
          userId: game.user.id
        });
      }
      return null;
    }

    const clamped = Math.min(Math.max(0, Number(value)), tracker.max);
    return this.upsert({ id: tracker.id, value: Math.round(clamped * 100) / 100 });
  }

  /**
   * Toggles visibility for players (showToPlayers true/false).
   * @param {string} id
   */
  static async cycleVisibility(id) {
    if (!game.user.isGM) return null;
    const tracker = this.get(id);
    if (!tracker) return null;

    return this.upsert({ id: tracker.id, showToPlayers: !tracker.showToPlayers });
  }
}

