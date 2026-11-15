import { MODULE_ID, ProgressTrackerModel } from "../models/tracker-model.js";
import { TrackerStore } from "../store/tracker-store.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * ApplicationV2 Form for creating or editing a Progress Tracker.
 */
export class TrackerConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} trackerData Existing tracker object or initial defaults
   * @param {object} options ApplicationV2 options
   */
  constructor(trackerData = {}, options = {}) {
    super(options);
    this.isEdit = Boolean(trackerData?.id);
    this.trackerModel = new ProgressTrackerModel(trackerData);
  }

  static DEFAULT_OPTIONS = {
    id: "wow-progress-tracker-config",
    classes: ["wow-pt-app", "wow-pt-config-window"],
    tag: "form",
    window: {
      icon: "fa-solid fa-bars-progress",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 540,
      height: "auto"
    },
    form: {
      handler: TrackerConfigApp.#onSubmitForm,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      browseFile: TrackerConfigApp.#onBrowseFile,
      browseAudio: TrackerConfigApp.#onBrowseAudio,
      pickCanvasTarget: TrackerConfigApp.#onPickCanvasTarget,
      addMilestone: TrackerConfigApp.#onAddMilestone,
      removeMilestone: TrackerConfigApp.#onRemoveMilestone,
      addAutomation: TrackerConfigApp.#onAddAutomation,
      removeAutomation: TrackerConfigApp.#onRemoveAutomation,
      cancel: TrackerConfigApp.#onCancel
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/tracker-config.hbs`
    }
  };

  get title() {
    return this.isEdit
      ? game.i18n.format("WOWPT.Config.EditTitle", { title: this.trackerModel.title })
      : game.i18n.localize("WOWPT.Config.CreateTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const data = this.trackerModel.toObject();

    if (!Array.isArray(data.milestones) || data.milestones.length === 0) {
      const half = Math.round(((Number(data.max) || 10) / 2) * 100) / 100;
      data.milestones = [{ value: half, icon: "fa-solid fa-flag" }];
    }

    // Build enriched automation rows so each action displays its exact UI control
    data.automations = (data.automations || []).map((auto) => ({
      ...auto,
      hintKey: `WOWPT.Config.ActionHints.${auto.action || "macro"}`,
      isMacro: auto.action === "macro",
      isSound: auto.action === "sound",
      isVisibility: auto.action === "visibility",
      isPause: auto.action === "pause",
      isRollTable: auto.action === "rollTable",
      isChat: auto.action === "chat",
      isTrackerTarget: auto.action === "chainTracker" || auto.action === "advanceTracker"
    }));

    context.tracker = data;
    context.isEdit = this.isEdit;
    context.isMilestonesStyle = data.styleType === "milestones";
    context.canAddMilestone = data.milestones.length < 10;

    // Input Trigger (Auto-Advance) context
    const advMode = data.autoAdvanceMode || "none";
    context.hasAutoAdvance = advMode !== "none";
    context.needsAdvanceInterval = advMode === "timer" || advMode === "worldTime";
    context.autoAdvanceHintKey = `WOWPT.Config.InputTriggers.Hints.${advMode}`;
    context.autoAdvanceDirStr = String(data.autoAdvanceDir ?? 1);

    context.inputTriggerModes = {
      none: "WOWPT.Config.InputTriggers.Modes.none",
      combatRound: "WOWPT.Config.InputTriggers.Modes.combatRound",
      combatTurn: "WOWPT.Config.InputTriggers.Modes.combatTurn",
      timer: "WOWPT.Config.InputTriggers.Modes.timer",
      worldTime: "WOWPT.Config.InputTriggers.Modes.worldTime"
    };

    context.inputTriggerDirs = {
      "1": "WOWPT.Config.InputTriggers.Directions.1",
      "-1": "WOWPT.Config.InputTriggers.Directions.-1"
    };

    // Dropdown choices for Macros, RollTables, and other Trackers
    context.macroOptions = {
      "": game.i18n.localize("WOWPT.Config.Fields.selectMacro"),
      ...Object.fromEntries((game.macros?.contents || []).map((m) => [m.id, m.name]))
    };

    context.tableOptions = {
      "": game.i18n.localize("WOWPT.Config.Fields.selectTable"),
      ...Object.fromEntries((game.tables?.contents || []).map((t) => [t.id, t.name]))
    };

    context.trackerOptions = {
      "": game.i18n.localize("WOWPT.Config.Fields.selectTracker"),
      ...Object.fromEntries(
        TrackerStore.getAll()
          .filter((t) => t.id !== data.id)
          .map((t) => [t.id, t.title])
      )
    };

    context.styles = {
      continuous: "WOWPT.Config.Styles.continuous",
      milestones: "WOWPT.Config.Styles.milestones",
      segmented: "WOWPT.Config.Styles.segmented",
      icons: "WOWPT.Config.Styles.icons",
      chase: "WOWPT.Config.Styles.chase",
      clock: "WOWPT.Config.Styles.clock"
    };

    context.triggerChoices = {
      onComplete: "WOWPT.Config.Triggers.onComplete",
      onZero: "WOWPT.Config.Triggers.onZero",
      onMilestone: "WOWPT.Config.Triggers.onMilestone",
      onStep: "WOWPT.Config.Triggers.onStep"
    };

    context.actionChoices = {
      macro: "WOWPT.Config.Actions.macro",
      sound: "WOWPT.Config.Actions.sound",
      visibility: "WOWPT.Config.Actions.visibility",
      pause: "WOWPT.Config.Actions.pause",
      rollTable: "WOWPT.Config.Actions.rollTable",
      chat: "WOWPT.Config.Actions.chat",
      chainTracker: "WOWPT.Config.Actions.chainTracker",
      advanceTracker: "WOWPT.Config.Actions.advanceTracker"
    };

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Toggle milestones section dynamically when changing Visual Bar Type
    const styleSelect = this.element.querySelector('select[name="styleType"]');
    const milestonesGroup = this.element.querySelector(".wow-pt-milestones-group");
    if (styleSelect && milestonesGroup) {
      styleSelect.addEventListener("change", (ev) => {
        milestonesGroup.classList.toggle("is-hidden", ev.target.value !== "milestones");
      });
    }

    // Re-render when changing Input Trigger (Auto-Advance) mode
    const advModeSelect = this.element.querySelector('select[name="autoAdvanceMode"]');
    if (advModeSelect) {
      advModeSelect.addEventListener("change", () => {
        this.#syncFormToModel();
        this.render();
      });
    }

    // Re-render automation row controls when changing Action type
    this.element.querySelectorAll('select[name="autoAction"]').forEach((selectEl) => {
      selectEl.addEventListener("change", (ev) => {
        const row = ev.target.closest(".wow-pt-automation-row");
        const targetInput = row?.querySelector('[name="autoTarget"]');
        if (targetInput) targetInput.value = "";
        this.#syncFormToModel();
        this.render();
      });
    });

    // Sync color pickers with their text inputs
    this.element.querySelectorAll('input[type="color"][data-color-target]').forEach((picker) => {
      picker.addEventListener("input", (ev) => {
        const targetName = picker.dataset.colorTarget;
        const textInput = this.element.querySelector(`input[name="${targetName}"]`);
        if (textInput) textInput.value = ev.target.value;
      });
    });
  }

  /**
   * Captures current unsaved form values into `this.trackerModel` before re-rendering.
   */
  #syncFormToModel() {
    const form = this.element;
    if (!form) return;

    const maxVal = Math.max(1, Number(form.querySelector('[name="max"]')?.value ?? this.trackerModel.max));
    const milestoneRows = Array.from(form.querySelectorAll(".wow-pt-milestone-row"));
    const milestones = milestoneRows.map((row) => ({
      value: Math.min(Math.max(0, Number(row.querySelector('[name="milestoneValue"]')?.value ?? 0)), maxVal),
      icon: row.querySelector('[name="milestoneIcon"]')?.value?.trim() || "fa-solid fa-flag"
    }));

    const autoRows = Array.from(form.querySelectorAll(".wow-pt-automation-row"));
    const automations = autoRows.map((row) => ({
      trigger: row.querySelector('[name="autoTrigger"]')?.value || "onComplete",
      action: row.querySelector('[name="autoAction"]')?.value || "macro",
      target: row.querySelector('[name="autoTarget"]')?.value?.trim() ?? ""
    }));

    this.trackerModel.updateSource({
      title: form.querySelector('[name="title"]')?.value || this.trackerModel.title,
      description: form.querySelector('[name="description"]')?.value ?? "",
      styleType: form.querySelector('[name="styleType"]')?.value || this.trackerModel.styleType,
      value: Number(form.querySelector('[name="value"]')?.value ?? this.trackerModel.value),
      max: maxVal,
      step: Math.max(0.1, Number(form.querySelector('[name="step"]')?.value ?? this.trackerModel.step)),
      primaryColor: form.querySelector('[name="primaryColor"]')?.value || this.trackerModel.primaryColor,
      secondaryColor: form.querySelector('[name="secondaryColor"]')?.value || this.trackerModel.secondaryColor,
      icon: form.querySelector('[name="icon"]')?.value ?? "",
      bgImage: form.querySelector('[name="bgImage"]')?.value ?? "",
      showToPlayers: Boolean(form.querySelector('[name="showToPlayers"]')?.checked),
      hideTitle: Boolean(form.querySelector('[name="hideTitle"]')?.checked),
      allowPlayerEdit: Boolean(form.querySelector('[name="allowPlayerEdit"]')?.checked),
      autoAdvanceMode: form.querySelector('[name="autoAdvanceMode"]')?.value || "none",
      autoAdvanceDir: Number(form.querySelector('[name="autoAdvanceDir"]')?.value ?? this.trackerModel.autoAdvanceDir ?? 1),
      autoAdvanceInterval: Math.max(1, Number(form.querySelector('[name="autoAdvanceInterval"]')?.value ?? this.trackerModel.autoAdvanceInterval ?? 60)),
      milestones: milestones.length > 0 ? milestones : [{ value: maxVal / 2, icon: "fa-solid fa-flag" }],
      automations
    });
  }

  static async #onAddMilestone(event, target) {
    this.#syncFormToModel();
    const current = [...(this.trackerModel.milestones || [])];
    if (current.length >= 10) return;

    const max = this.trackerModel.max || 10;
    const defaultVal = Math.round((max / 2) * 100) / 100;
    current.push({ value: defaultVal, icon: "fa-solid fa-flag" });
    this.trackerModel.updateSource({ milestones: current });
    this.render();
  }

  static async #onRemoveMilestone(event, target) {
    this.#syncFormToModel();
    const idx = Number(target.dataset.index);
    const current = [...(this.trackerModel.milestones || [])];
    if (current.length <= 1 || Number.isNaN(idx)) return;

    current.splice(idx, 1);
    this.trackerModel.updateSource({ milestones: current });
    this.render();
  }

  static async #onAddAutomation(event, target) {
    this.#syncFormToModel();
    const current = [...(this.trackerModel.automations || [])];
    current.push({
      trigger: "onComplete",
      action: "macro",
      target: ""
    });
    this.trackerModel.updateSource({ automations: current });
    this.render();
  }

  static async #onRemoveAutomation(event, target) {
    this.#syncFormToModel();
    const idx = Number(target.dataset.index);
    const current = [...(this.trackerModel.automations || [])];
    if (Number.isNaN(idx)) return;

    current.splice(idx, 1);
    this.trackerModel.updateSource({ automations: current });
    this.render();
  }

  /**
   * Opens Foundry's FilePicker to choose an image/icon or bar texture.
   */
  static async #onBrowseFile(event, target) {
    const targetField = target.dataset.target;
    const rowInput = target.closest(".wow-pt-file-row")?.querySelector('input[type="text"]');
    const input = rowInput || (targetField ? this.element.querySelector(`input[name="${targetField}"]`) : null);
    if (!input) return;

    const current = input.value || "";
    const PickerClass = foundry.applications?.ux?.FilePicker?.implementation || globalThis.FilePicker;
    const fp = new PickerClass({
      type: "image",
      current: current.includes("/") ? current : "",
      callback: (path) => {
        input.value = path;
      }
    });
    return fp.browse();
  }

  /**
   * Opens Foundry's FilePicker to choose an audio file for a Sound automation.
   */
  static async #onBrowseAudio(event, target) {
    const input = target.closest(".wow-pt-auto-target-row")?.querySelector('input[name="autoTarget"]');
    if (!input) return;

    const current = input.value || "";
    const PickerClass = foundry.applications?.ux?.FilePicker?.implementation || globalThis.FilePicker;
    const fp = new PickerClass({
      type: "audio",
      current: current.includes("/") ? current : "",
      callback: (path) => {
        input.value = path;
      }
    });
    return fp.browse();
  }

  /**
   * Populates the automation target input with the UUIDs of currently selected Canvas Tokens or Tiles.
   */
  static async #onPickCanvasTarget(event, target) {
    const input = target.closest(".wow-pt-auto-target-row")?.querySelector('input[name="autoTarget"]');
    if (!input) return;

    const controlledTokens = canvas?.tokens?.controlled || [];
    const controlledTiles = canvas?.tiles?.controlled || [];
    const docs = [
      ...controlledTokens.map((t) => t.document?.uuid || t.id),
      ...controlledTiles.map((t) => t.document?.uuid || t.id)
    ].filter(Boolean);

    if (docs.length === 0) {
      ui.notifications?.info("Select one or more Tokens or Tiles on the canvas first.");
      return;
    }

    input.value = docs.join(", ");
  }

  static async #onCancel(event, target) {
    await this.close();
  }

  static async #onSubmitForm(event, form, formData) {
    const raw = foundry.utils.expandObject(formData.object);
    const maxVal = Math.max(1, Number(raw.max ?? 10));

    // Collect milestones from DOM rows (up to 10)
    const milestoneRows = Array.from(form.querySelectorAll(".wow-pt-milestone-row")).slice(0, 10);
    const milestones = milestoneRows.map((row) => ({
      value: Math.min(Math.max(0, Number(row.querySelector('[name="milestoneValue"]')?.value ?? maxVal / 2)), maxVal),
      icon: row.querySelector('[name="milestoneIcon"]')?.value?.trim() || "fa-solid fa-flag"
    }));

    // Collect automations from DOM rows
    const autoRows = Array.from(form.querySelectorAll(".wow-pt-automation-row"));
    const automations = autoRows.map((row) => ({
      trigger: row.querySelector('[name="autoTrigger"]')?.value || "onComplete",
      action: row.querySelector('[name="autoAction"]')?.value || "macro",
      target: row.querySelector('[name="autoTarget"]')?.value?.trim() ?? ""
    }));

    const payload = {
      ...this.trackerModel.toObject(),
      title: raw.title,
      description: raw.description ?? "",
      styleType: raw.styleType,
      value: Number(raw.value ?? 0),
      max: maxVal,
      step: Math.max(0.1, Number(raw.step ?? 1)),
      primaryColor: raw.primaryColor,
      secondaryColor: raw.secondaryColor,
      icon: raw.icon ?? "",
      bgImage: raw.bgImage ?? "",
      milestones: milestones.length > 0 ? milestones : [{ value: maxVal / 2, icon: "fa-solid fa-flag" }],
      automations,
      autoAdvanceMode: raw.autoAdvanceMode || "none",
      autoAdvanceDir: Number(raw.autoAdvanceDir ?? 1),
      autoAdvanceInterval: Math.max(1, Number(raw.autoAdvanceInterval ?? 60)),
      showToPlayers: Boolean(raw.showToPlayers),
      hideTitle: Boolean(raw.hideTitle),
      allowPlayerEdit: Boolean(raw.allowPlayerEdit)
    };

    await TrackerStore.upsert(payload);
  }
}
