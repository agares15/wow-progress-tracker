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
      width: 500,
      height: "auto"
    },
    form: {
      handler: TrackerConfigApp.#onSubmitForm,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      browseFile: TrackerConfigApp.#onBrowseFile,
      addMilestone: TrackerConfigApp.#onAddMilestone,
      removeMilestone: TrackerConfigApp.#onRemoveMilestone,
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

    context.tracker = data;
    context.isEdit = this.isEdit;
    context.isMilestonesStyle = data.styleType === "milestones";
    context.canAddMilestone = data.milestones.length < 10;

    context.styles = {
      continuous: "WOWPT.Config.Styles.continuous",
      milestones: "WOWPT.Config.Styles.milestones",
      segmented: "WOWPT.Config.Styles.segmented",
      icons: "WOWPT.Config.Styles.icons",
      chase: "WOWPT.Config.Styles.chase",
      clock: "WOWPT.Config.Styles.clock"
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
      hideNumbers: Boolean(form.querySelector('[name="hideNumbers"]')?.checked),
      allowPlayerEdit: Boolean(form.querySelector('[name="allowPlayerEdit"]')?.checked),
      milestones: milestones.length > 0 ? milestones : [{ value: maxVal / 2, icon: "fa-solid fa-flag" }]
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
      showToPlayers: Boolean(raw.showToPlayers),
      hideTitle: Boolean(raw.hideTitle),
      hideNumbers: Boolean(raw.hideNumbers),
      allowPlayerEdit: Boolean(raw.allowPlayerEdit)
    };

    await TrackerStore.upsert(payload);
  }
}
