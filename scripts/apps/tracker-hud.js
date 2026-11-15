import { MODULE_ID } from "../models/tracker-model.js";
import { TrackerStore } from "../store/tracker-store.js";
import { TrackerConfigApp } from "./tracker-config.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * Shared action handlers for stepping or clicking segments.
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
 * ApplicationV2 HUD for both GM and Players.
 * Supports dragging/repositioning, resizing, and frameless mode with per-client position persistence.
 */
export class TrackerHUDApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;
  #savePosTimeout = null;
  #restoredInitialPos = false;

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
      width: 340,
      height: "auto",
      top: 70,
      left: 120
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

    context.isGM = isGM;
    context.isLocked = !isGM || game.settings.get(MODULE_ID, "hudLocked");
    context.trackers = trackers;
    context.hasTrackers = trackers.length > 0;
    return context;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    if (this.#restoredInitialPos) return;
    this.#restoredInitialPos = true;

    const saved = game.settings.get(MODULE_ID, "hudPosition") || {};
    const defaultLeft = game.user?.isGM
      ? 120
      : Math.max(80, (window.innerWidth || 1280) - 660);
    const defaultTop = game.user?.isGM ? 75 : 16;

    const nextPos = {
      left: typeof saved.left === "number" ? saved.left : defaultLeft,
      top: typeof saved.top === "number" ? saved.top : defaultTop,
      width: typeof saved.width === "number" ? Math.max(200, saved.width) : (game.user?.isGM ? 360 : 310)
    };
    if (typeof saved.height === "number" && saved.height > 60) {
      nextPos.height = saved.height;
    }
    this.setPosition(nextPos);
  }

  _onPosition(position) {
    super._onPosition?.(position);
    if (!this.#restoredInitialPos) return;

    clearTimeout(this.#savePosTimeout);
    this.#savePosTimeout = setTimeout(() => {
      const toSave = {
        left: Math.round(position.left ?? this.position.left ?? 100),
        top: Math.round(position.top ?? this.position.top ?? 70),
        width: Math.round(position.width ?? this.position.width ?? 340)
      };
      if (typeof position.height === "number") {
        toSave.height = Math.round(position.height);
      }
      game.settings.set(MODULE_ID, "hudPosition", toSave);
    }, 250);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const isGM = game.user?.isGM ?? false;
    const isLocked = !isGM || game.settings.get(MODULE_ID, "hudLocked");
    this.element.classList.toggle("is-frameless", Boolean(isLocked));
    this.element.classList.toggle("is-player", !isGM);

    // Allow dragging the HUD window directly from the mini-toolbar as well
    const dragBar = this.element.querySelector('[data-drag-handle="true"]');
    if (dragBar && !dragBar.dataset.dragBound) {
      dragBar.dataset.dragBound = "true";
      dragBar.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0 || ev.target.closest("button, a, input")) return;
        ev.preventDefault();
        const startX = ev.clientX;
        const startY = ev.clientY;
        const origLeft = this.position.left || 0;
        const origTop = this.position.top || 0;

        const onMove = (moveEv) => {
          const dx = moveEv.clientX - startX;
          const dy = moveEv.clientY - startY;
          this.setPosition({
            left: Math.max(0, origLeft + dx),
            top: Math.max(0, origTop + dy)
          });
        };

        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    }
  }

  /**
   * Toggles the HUD window.
   */
  static toggle() {
    const app = this.instance;
    if (app.rendered) {
      app.close();
    } else {
      app.render(true);
    }
  }

  /**
   * Refreshes the UI whenever trackers change.
   * Automatically opens for players when visible trackers exist, and closes if none remain.
   */
  static refresh() {
    const app = this.instance;
    const visible = TrackerStore.getVisibleForUser(game.user);

    if (!game.user?.isGM) {
      if (visible.length > 0) {
        app.render(true);
      } else if (app.rendered) {
        app.close();
      }
      return;
    }

    if (app.rendered) {
      app.render();
    } else if (game.settings.get(MODULE_ID, "autoOpenHUD") && visible.length > 0) {
      app.render(true);
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

    let whisper = [];
    if (!tracker.showToPlayers) {
      whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
    }

    const esc = foundry.utils.escapeHTML;
    const showHeaderTitle = !tracker.hideTitle || !tracker.showToPlayers;

    const badgeIconHtml = ctx.icon
      ? `<span class="wow-pt-badge-icon">${
          ctx.isImageIcon
            ? `<img src="${esc(ctx.icon)}" alt="" />`
            : `<i class="${esc(ctx.icon)}"></i>`
        }</span>`
      : "";

    const titleBlockHtml = showHeaderTitle
      ? `<div class="wow-pt-titles">
           <h4 class="wow-pt-title">${esc(tracker.title)}</h4>
           ${tracker.description ? `<p class="wow-pt-subtitle">${esc(tracker.description)}</p>` : ""}
         </div>`
      : "";

    const headerHtml = (badgeIconHtml || titleBlockHtml)
      ? `<header class="wow-pt-card-header">
           <div class="wow-pt-title-group">
             ${badgeIconHtml}
             ${titleBlockHtml}
           </div>
         </header>`
      : "";

    const bgStyle = ctx.bgImage ? `style="background-image: url('${esc(ctx.bgImage)}');"` : "";
    let visualHtml = "";

    if (ctx.isContinuous) {
      visualHtml = `
        <div class="wow-pt-track-continuous" ${bgStyle}>
          <div class="wow-pt-fill-continuous"></div>
        </div>`;
    } else if (ctx.isMilestones) {
      const msHtml = ctx.renderedMilestones
        .map((ms) => {
          const msIcon = ms.isImageIcon
            ? `<img src="${esc(ms.icon)}" alt="" />`
            : `<i class="${esc(ms.icon)}"></i>`;
          return `<div class="wow-pt-milestone-marker ${ms.reached ? "is-reached" : ""}" style="left: ${ms.percentage}%;">${msIcon}</div>`;
        })
        .join("");
      visualHtml = `
        <div class="wow-pt-track-milestones" ${bgStyle}>
          <div class="wow-pt-track-continuous">
            <div class="wow-pt-fill-continuous"></div>
          </div>
          ${msHtml}
        </div>`;
    } else if (ctx.isSegmented) {
      const segsHtml = ctx.segments
        .map((seg) => `<div class="wow-pt-segment ${seg.active ? "is-active" : ""}"></div>`)
        .join("");
      visualHtml = `
        <div class="wow-pt-track-segmented" style="--pt-segments: ${ctx.discreteCount};">
          ${segsHtml}
        </div>`;
    } else if (ctx.isIcons) {
      const pipIcon = ctx.isImageIcon
        ? `<img src="${esc(ctx.icon)}" alt="" />`
        : `<i class="${esc(ctx.icon || "fa-solid fa-circle")}"></i>`;
      const pipsHtml = ctx.segments
        .map((seg) => `<span class="wow-pt-pip ${seg.active ? "is-active" : ""}">${pipIcon}</span>`)
        .join("");
      visualHtml = `<div class="wow-pt-track-icons">${pipsHtml}</div>`;
    } else if (ctx.isChase) {
      const markerIcon = ctx.isImageIcon
        ? `<img src="${esc(ctx.icon)}" alt="" />`
        : `<i class="${esc(ctx.icon || "fa-solid fa-person-running")}"></i>`;
      visualHtml = `
        <div class="wow-pt-track-chase" ${bgStyle}>
          <div class="wow-pt-fill-chase"></div>
          <div class="wow-pt-chase-marker" style="left: ${ctx.percentage}%;">
            ${markerIcon}
          </div>
        </div>`;
    } else if (ctx.isClock) {
      const slicesHtml = ctx.segments
        .map((seg) => `<path class="wow-pt-clock-slice ${seg.active ? "is-active" : ""}" d="${seg.svgPath}" />`)
        .join("");
      visualHtml = `
        <div class="wow-pt-clock-wrap">
          <svg class="wow-pt-clock-svg" viewBox="0 0 100 100">
            ${slicesHtml}
            <circle class="wow-pt-clock-ring" cx="50" cy="50" r="46" />
            <circle class="wow-pt-clock-hub" cx="50" cy="50" r="9" />
          </svg>
        </div>`;
    }

    const content = `
      <div class="wow-pt-app wow-pt-chat-card style-${esc(ctx.styleType)}" style="--pt-primary: ${esc(tracker.primaryColor)}; --pt-secondary: ${esc(tracker.secondaryColor)}; --pt-pct: ${ctx.percentage}%;">
        ${headerHtml}
        <div class="wow-pt-bar-row ${ctx.isClock ? "is-clock-row" : ""}">
          <div class="wow-pt-visual-container">
            ${visualHtml}
          </div>
        </div>
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: { alias: showHeaderTitle ? tracker.title : game.i18n.localize("WOWPT.Title") },
      content,
      whisper
    });
  }
}
