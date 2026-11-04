import { MODULE_ID } from "../models/tracker-model.js";
import { TrackerStore } from "../store/tracker-store.js";
import { TrackerConfigApp } from "./tracker-config.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * Shared action handlers for both GM HUD and Player Floating Cards.
 */
async function handleStepProgress(event, target) {
  const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
  if (!id) return;
  const tracker = TrackerStore.get(id);
  if (!tracker || !tracker.canUserEdit(game.user)) return;

  const dir = Number(target.dataset.dir || 1);
  const multiplier = event.shiftKey ? 5 : 1;
  const delta = dir * tracker.step * multiplier;
  await TrackerStore.modifyProgress(id, delta);
}

async function handleSetSegment(event, target) {
  const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
  if (!id) return;
  const tracker = TrackerStore.get(id);
  if (!tracker || !tracker.canUserEdit(game.user)) return;

  const targetVal = Number(target.dataset.targetValue);
  if (Number.isNaN(targetVal)) return;

  const discreteCount = Math.min(Math.max(1, Math.round(tracker.max)), 30);
  const nextValue = Math.abs(tracker.value - targetVal) < 0.001
    ? Math.max(0, targetVal - tracker.max / discreteCount)
    : targetVal;

  await TrackerStore.setProgress(id, nextValue);
}

/**
 * Frameless, containerless floating cards in the top-right corner immediately next to #sidebar for Players.
 * Uses relative flex positioning adjacent to #sidebar so it moves naturally when the sidebar collapses/expands.
 */
export class PlayerOverlay {
  static #container = null;

  static ensureContainer() {
    if (this.#container && document.body.contains(this.#container)) {
      return this.#container;
    }

    const el = document.createElement("div");
    el.id = "wow-pt-player-overlay";
    el.className = "wow-pt-app wow-pt-player-overlay";

    // Delegate click events for interactive bars (when allowPlayerEdit is enabled)
    el.addEventListener("click", (event) => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === "stepProgress") {
        handleStepProgress(event, actionEl);
      } else if (action === "setSegment") {
        handleSetSegment(event, actionEl);
      }
    });

    // Insert inside #ui-right-column-1 (or right before #sidebar) so it stays flush against the right sidebar even when collapsed
    const rightCol = document.getElementById("ui-right-column-1");
    const sidebar = document.getElementById("sidebar");
    if (rightCol) {
      rightCol.prepend(el);
    } else if (sidebar && sidebar.parentElement) {
      sidebar.before(el);
    } else {
      const uiRight = document.getElementById("ui-right");
      if (uiRight) {
        uiRight.appendChild(el);
      } else {
        document.body.appendChild(el);
      }
    }

    this.#container = el;
    return el;
  }

  static async render() {
    if (game.user?.isGM) return;
    const container = this.ensureContainer();
    const trackers = TrackerStore.getVisibleForUser(game.user).map((t) =>
      t.toRenderContext(game.user)
    );

    if (trackers.length === 0) {
      container.innerHTML = "";
      return;
    }

    const renderTpl = foundry.applications?.handlebars?.renderTemplate || globalThis.renderTemplate;
    const html = await renderTpl(`modules/${MODULE_ID}/templates/tracker-hud.hbs`, {
      isPlayerOverlay: true,
      isGM: false,
      trackers
    });
    container.innerHTML = html;
  }
}

/**
 * ApplicationV2 HUD for the GM to create, manage, and control Progress Trackers.
 */
export class TrackerHUDApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static get instance() {
    if (!this.#instance) {
      this.#instance = new TrackerHUDApp();
    }
    return this.#instance;
  }

  static DEFAULT_OPTIONS = {
    id: "wow-progress-tracker-hud",
    classes: ["wow-pt-app", "wow-pt-hud"],
    tag: "section",
    window: {
      title: "WOWPT.Title",
      icon: "fa-solid fa-bars-progress",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 370,
      height: "auto",
      top: 85,
      left: 115
    },
    actions: {
      createTracker: TrackerHUDApp.#onCreateTracker,
      toggleLock: TrackerHUDApp.#onToggleLock,
      stepProgress: TrackerHUDApp.#onStepProgress,
      setSegment: TrackerHUDApp.#onSetSegment,
      cycleVisibility: TrackerHUDApp.#onCycleVisibility,
      sendToChat: TrackerHUDApp.#onSendToChat,
      editTracker: TrackerHUDApp.#onEditTracker,
      deleteTracker: TrackerHUDApp.#onDeleteTracker
    }
  };

  static PARTS = {
    hud: {
      template: `modules/${MODULE_ID}/templates/tracker-hud.hbs`
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const isGM = game.user?.isGM ?? false;
    const trackers = TrackerStore.getVisibleForUser(game.user).map((t) =>
      t.toRenderContext(game.user)
    );

    context.isPlayerOverlay = false;
    context.isGM = isGM;
    context.isLocked = game.settings.get(MODULE_ID, "hudLocked");
    context.trackers = trackers;
    context.hasTrackers = trackers.length > 0;
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const isLocked = game.settings.get(MODULE_ID, "hudLocked");
    this.element.classList.toggle("is-frameless", Boolean(isLocked));
  }

  /**
   * Toggles the GM HUD window (for GMs) or refreshes the Player Overlay (for Players).
   */
  static toggle() {
    if (!game.user?.isGM) {
      PlayerOverlay.render();
      return;
    }
    const app = this.instance;
    if (app.rendered) {
      app.close();
    } else {
      app.render(true);
    }
  }

  /**
   * Refreshes the UI whenever trackers change.
   */
  static refresh() {
    if (!game.user?.isGM) {
      PlayerOverlay.render();
      return;
    }

    const app = this.instance;
    if (app.rendered) {
      app.render();
    } else if (game.settings.get(MODULE_ID, "autoOpenHUD")) {
      const visible = TrackerStore.getVisibleForUser(game.user);
      if (visible.length > 0) {
        app.render(true);
      }
    }
  }

  static async #onCreateTracker(event, target) {
    if (!game.user.isGM) return;
    new TrackerConfigApp().render(true);
  }

  static async #onToggleLock(event, target) {
    const current = game.settings.get(MODULE_ID, "hudLocked");
    await game.settings.set(MODULE_ID, "hudLocked", !current);
    this.render();
  }

  static async #onStepProgress(event, target) {
    return handleStepProgress(event, target);
  }

  static async #onSetSegment(event, target) {
    return handleSetSegment(event, target);
  }

  static async #onCycleVisibility(event, target) {
    if (!game.user.isGM) return;
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    if (id) await TrackerStore.cycleVisibility(id);
  }

  static async #onEditTracker(event, target) {
    if (!game.user.isGM) return;
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    const tracker = TrackerStore.get(id);
    if (tracker) {
      new TrackerConfigApp(tracker.toObject()).render(true);
    }
  }

  static async #onDeleteTracker(event, target) {
    if (!game.user.isGM) return;
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    const tracker = TrackerStore.get(id);
    if (!tracker) return;

    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("WOWPT.HUD.ConfirmDeleteTitle") },
      content: `<p>${game.i18n.format("WOWPT.HUD.ConfirmDeleteContent", { title: foundry.utils.escapeHTML(tracker.title) })}</p>`,
      rejectClose: false,
      modal: true
    });

    if (confirmed) {
      await TrackerStore.delete(id);
    }
  }

  static async #onSendToChat(event, target) {
    if (!game.user.isGM) return;
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    const tracker = TrackerStore.get(id);
    if (!tracker) return;

    const ctx = tracker.toRenderContext(game.user);
    const valueDisplay = tracker.hideNumbers
      ? `${ctx.percentage}%`
      : ctx.formattedValue;

    let whisper = [];
    if (!tracker.showToPlayers) {
      whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
    }

    const titleHtml = (!tracker.hideTitle || !tracker.showToPlayers)
      ? `<strong>${foundry.utils.escapeHTML(tracker.title)}</strong>`
      : `<strong>${foundry.utils.escapeHTML(game.i18n.localize("WOWPT.Title"))}</strong>`;

    const content = `
      <div class="wow-pt-chat-card" style="--pt-primary: ${tracker.primaryColor}; --pt-secondary: ${tracker.secondaryColor}; --pt-pct: ${ctx.percentage}%;">
        <div class="wow-pt-chat-header">
          ${titleHtml}
          <span class="wow-pt-chat-val">${foundry.utils.escapeHTML(valueDisplay)}</span>
        </div>
        ${tracker.description && !tracker.hideTitle ? `<p class="wow-pt-chat-desc">${foundry.utils.escapeHTML(tracker.description)}</p>` : ""}
        <div class="wow-pt-chat-bar">
          <div class="wow-pt-chat-fill"></div>
        </div>
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: { alias: game.i18n.localize("WOWPT.Title") },
      content,
      whisper
    });
  }
}
