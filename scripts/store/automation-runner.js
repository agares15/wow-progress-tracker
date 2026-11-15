import { MODULE_ID } from "../models/tracker-model.js";

/**
 * Lightweight Automation Runner for Progress Trackers.
 * Handles both Input Triggers (Combat Round/Turn, Real-Time Timer, World Time)
 * and Output Automations (Macros, Sounds, Visibility, RollTables, Chat, Chained Trackers).
 */
export class AutomationRunner {
  static #timerElapsed = new Map();
  static #worldTimeAccum = new Map();
  static #intervalId = null;

  /**
   * Checks if the current user is the primary active GM responsible for running world automations.
   */
  static get isPrimaryGM() {
    if (!game.user?.isGM) return false;
    const activeGM = game.users?.activeGM;
    return !activeGM || activeGM.id === game.user.id;
  }

  /**
   * Registers Foundry hooks and lightweight interval for Input Triggers (Auto-Advance).
   * @param { typeof import("./tracker-store.js").TrackerStore } store
   */
  static registerInputHooks(store) {
    // 1. Combat Round & Combat Turn triggers
    Hooks.on("updateCombat", async (combat, changed) => {
      if (!this.isPrimaryGM || !combat?.started) return;

      const roundChanged = "round" in changed && changed.round > (combat.previous?.round ?? 0);
      const turnChanged = "turn" in changed || roundChanged;
      if (!roundChanged && !turnChanged) return;

      const trackers = store.getAll();
      for (const tracker of trackers) {
        if (tracker.autoAdvanceMode === "combatRound" && roundChanged) {
          await this.#stepByInputTrigger(tracker, store);
        } else if (tracker.autoAdvanceMode === "combatTurn" && turnChanged) {
          await this.#stepByInputTrigger(tracker, store);
        }
      }
    });

    // 2. In-Game World Time trigger (compatible with Simple Calendar / core time advancement)
    Hooks.on("updateWorldTime", async (worldTime, dt) => {
      if (!this.isPrimaryGM || !dt || dt <= 0) return;

      const trackers = store.getAll();
      for (const tracker of trackers) {
        if (tracker.autoAdvanceMode !== "worldTime") continue;
        const interval = Math.max(1, Number(tracker.autoAdvanceInterval) || 60);
        const prevAccum = this.#worldTimeAccum.get(tracker.id) || 0;
        const total = prevAccum + dt;
        const stepsToRun = Math.floor(total / interval);

        if (stepsToRun > 0) {
          this.#worldTimeAccum.set(tracker.id, total % interval);
          const dir = tracker.autoAdvanceDir < 0 ? -1 : 1;
          const delta = dir * (tracker.step || 1) * stepsToRun;
          await store.modifyProgress(tracker.id, delta);
        } else {
          this.#worldTimeAccum.set(tracker.id, total);
        }
      }
    });

    // 3. Real-Time Interval Timer (ticks once per second while game is unpaused)
    if (this.#intervalId) clearInterval(this.#intervalId);
    this.#intervalId = setInterval(async () => {
      if (!this.isPrimaryGM || game.paused) return;

      const trackers = store.getAll();
      for (const tracker of trackers) {
        if (tracker.autoAdvanceMode !== "timer") continue;
        // Skip if already at limit in the configured direction
        const dir = tracker.autoAdvanceDir < 0 ? -1 : 1;
        if ((dir > 0 && tracker.value >= tracker.max) || (dir < 0 && tracker.value <= 0)) {
          this.#timerElapsed.set(tracker.id, 0);
          continue;
        }

        const interval = Math.max(1, Number(tracker.autoAdvanceInterval) || 60);
        const elapsed = (this.#timerElapsed.get(tracker.id) || 0) + 1;
        if (elapsed >= interval) {
          this.#timerElapsed.set(tracker.id, 0);
          await this.#stepByInputTrigger(tracker, store);
        } else {
          this.#timerElapsed.set(tracker.id, elapsed);
        }
      }
    }, 1000);
  }

  static async #stepByInputTrigger(tracker, store) {
    const dir = tracker.autoAdvanceDir < 0 ? -1 : 1;
    if ((dir > 0 && tracker.value >= tracker.max) || (dir < 0 && tracker.value <= 0)) {
      return;
    }
    const delta = dir * (tracker.step || 1);
    await store.modifyProgress(tracker.id, delta);
  }
  /**
   * Evaluates and executes any triggered automations between prevTracker and nextTracker.
   * Runs only on the GM client.
   * @param {ProgressTrackerModel} prevTracker
   * @param {ProgressTrackerModel} nextTracker
   * @param { typeof import("./tracker-store.js").TrackerStore } store
   */
  static async evaluate(prevTracker, nextTracker, store) {
    if (!game.user?.isGM || !prevTracker || !nextTracker) return;

    const prevVal = prevTracker.clampedValue;
    const nextVal = nextTracker.clampedValue;
    if (Math.abs(prevVal - nextVal) < 0.0001) return;

    const automations = nextTracker.automations || [];
    if (automations.length === 0) return;

    const max = nextTracker.max;
    const reachedMax = prevVal < max && nextVal >= max;
    const reachedZero = prevVal > 0 && nextVal <= 0;
    const stepped = prevVal !== nextVal;

    // Check if any milestone was crossed upward on this change
    const crossedMilestones = (nextTracker.milestones || []).filter(
      (ms) => prevVal < ms.value && nextVal >= ms.value
    );
    const reachedMilestone = crossedMilestones.length > 0;

    for (const rule of automations) {
      let triggered = false;
      switch (rule.trigger) {
        case "onComplete":
          triggered = reachedMax;
          break;
        case "onZero":
          triggered = reachedZero;
          break;
        case "onMilestone":
          triggered = reachedMilestone;
          break;
        case "onStep":
          triggered = stepped;
          break;
      }

      if (triggered) {
        try {
          await this.executeAction(rule, {
            tracker: nextTracker,
            prevValue: prevVal,
            value: nextVal,
            max,
            crossedMilestones,
            store
          });
        } catch (err) {
          console.error(`${MODULE_ID} | Automation error (${rule.action}):`, err);
        }
      }
    }
  }

  /**
   * Executes a single automation rule action.
   */
  static async executeAction(rule, context) {
    const target = (rule.target || "").trim();
    const { tracker, prevValue, value, max, crossedMilestones, store } = context;

    switch (rule.action) {
      case "macro": {
        if (!target) return;
        let macro =
          game.macros?.get(target) ||
          game.macros?.getName(target) ||
          (target.includes(".") ? await fromUuid(target) : null);

        if (macro && typeof macro.execute === "function") {
          await macro.execute({
            tracker: tracker.toObject(),
            prevValue,
            value,
            max,
            trigger: rule.trigger,
            milestones: crossedMilestones
          });
        } else {
          ui.notifications?.warn(`${MODULE_ID}: Macro "${target}" not found.`);
        }
        break;
      }

      case "sound": {
        if (!target) return;
        const AudioHelperCls = foundry.audio?.AudioHelper || globalThis.AudioHelper;
        if (AudioHelperCls?.play) {
          await AudioHelperCls.play(
            { src: target, volume: 0.8, autoplay: true, loop: false },
            true
          );
        }
        break;
      }

      case "visibility": {
        if (!target || !canvas?.scene) return;
        // Support comma-separated IDs or UUIDs of Tokens, Tiles, or AmbientLights
        const refs = target.split(",").map((s) => s.trim()).filter(Boolean);
        for (const ref of refs) {
          let doc = null;
          if (ref.includes(".")) {
            doc = await fromUuid(ref);
          } else {
            doc =
              canvas.scene.tokens?.get(ref) ||
              canvas.scene.tiles?.get(ref) ||
              canvas.scene.lights?.get(ref) ||
              canvas.scene.tokens?.find((t) => t.name.toLowerCase() === ref.toLowerCase());
          }
          if (doc && "hidden" in doc) {
            await doc.update({ hidden: !doc.hidden });
          }
        }
        break;
      }

      case "pause": {
        if (!game.paused) {
          game.togglePause(true, { broadcast: true });
        }
        break;
      }

      case "rollTable": {
        if (!target) return;
        const table =
          game.tables?.get(target) ||
          game.tables?.getName(target) ||
          (target.includes(".") ? await fromUuid(target) : null);
        if (table && typeof table.draw === "function") {
          await table.draw();
        } else {
          ui.notifications?.warn(`${MODULE_ID}: RollTable "${target}" not found.`);
        }
        break;
      }

      case "chat": {
        if (!target) return;
        await ChatMessage.create({
          user: game.user.id,
          speaker: { alias: tracker.title },
          content: `<div class="wow-pt-chat-card" style="--pt-primary: ${tracker.primaryColor};">
            <p style="margin:0;">${foundry.utils.escapeHTML(target)}</p>
          </div>`
        });
        break;
      }

      case "chainTracker": {
        if (!target || !store) return;
        const linked = store.get(target);
        if (!linked || linked.id === tracker.id) return;
        await store.upsert({ id: linked.id, showToPlayers: true });
        break;
      }

      case "advanceTracker": {
        if (!target || !store) return;
        const linked = store.get(target);
        if (!linked || linked.id === tracker.id) return;
        await store.modifyProgress(linked.id, linked.step || 1);
        break;
      }
    }
  }
}
