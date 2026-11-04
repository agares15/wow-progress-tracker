/**
 * DataModel for an individual Progress Tracker in Foundry VTT v14.
 * Provides strict schema validation, default values, and lightweight rendering helpers.
 */
export const MODULE_ID = "wow-progress-tracker";

function isImagePath(str) {
  if (!str) return false;
  const trimmed = String(str).trim();
  return (
    trimmed.includes("/") ||
    /\.(svg|png|webp|jpg|jpeg|gif|avif)$/i.test(trimmed)
  );
}

/**
 * Generates an SVG pie slice path centered at (50, 50) with radius 46.
 * @param {number} index 0-based slice index
 * @param {number} total Total number of slices
 * @returns {string} SVG path `d` attribute
 */
function buildClockSlicePath(index, total) {
  const cx = 50;
  const cy = 50;
  const r = 46;
  if (total <= 1) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const startAngle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const endAngle = ((index + 1) / total) * 2 * Math.PI - Math.PI / 2;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

export class ProgressTrackerModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      id: new fields.StringField({
        required: true,
        blank: false,
        initial: () => foundry.utils.randomID()
      }),
      title: new fields.StringField({
        required: true,
        blank: false,
        initial: "New Progress Tracker"
      }),
      description: new fields.StringField({
        required: false,
        blank: true,
        initial: ""
      }),
      styleType: new fields.StringField({
        required: true,
        choices: ["continuous", "milestones", "segmented", "icons", "chase", "clock"],
        initial: "continuous"
      }),
      value: new fields.NumberField({
        required: true,
        nullable: false,
        initial: 0
      }),
      max: new fields.NumberField({
        required: true,
        nullable: false,
        positive: true,
        initial: 10
      }),
      step: new fields.NumberField({
        required: true,
        nullable: false,
        positive: true,
        initial: 1
      }),
      primaryColor: new fields.ColorField({
        required: true,
        nullable: false,
        initial: "#3b82f6"
      }),
      secondaryColor: new fields.ColorField({
        required: true,
        nullable: false,
        initial: "#1e293b"
      }),
      icon: new fields.StringField({
        required: false,
        blank: true,
        initial: "fa-solid fa-bars-progress"
      }),
      bgImage: new fields.FilePathField({
        required: false,
        blank: true,
        categories: ["IMAGE"],
        initial: ""
      }),
      milestones: new fields.ArrayField(
        new fields.SchemaField({
          value: new fields.NumberField({ required: true, nullable: false, initial: 5 }),
          icon: new fields.StringField({ required: true, blank: false, initial: "fa-solid fa-flag" })
        }),
        {
          required: true,
          initial: () => [{ value: 5, icon: "fa-solid fa-flag" }]
        }
      ),
      showToPlayers: new fields.BooleanField({
        required: true,
        initial: false
      }),
      hideTitle: new fields.BooleanField({
        required: true,
        initial: false
      }),
      hideNumbers: new fields.BooleanField({
        required: true,
        initial: false
      }),
      allowPlayerEdit: new fields.BooleanField({
        required: true,
        initial: false
      })
    };
  }

  static migrateData(source) {
    if (source && typeof source === "object") {
      if (source.showToPlayers === undefined && source.visibility !== undefined) {
        source.showToPlayers = source.visibility === "all" || source.visibility === "custom";
      }
      if (!Array.isArray(source.milestones) || source.milestones.length === 0) {
        const half = Math.round(((Number(source.max) || 10) / 2) * 100) / 100;
        source.milestones = [{ value: half, icon: "fa-solid fa-flag" }];
      }
    }
    return super.migrateData(source);
  }

  /**
   * Clamps value between 0 and max.
   */
  get clampedValue() {
    const max = Math.max(0.01, this.max || 1);
    return Math.min(Math.max(0, this.value ?? 0), max);
  }

  /**
   * Percentage completion (0 - 100).
   */
  get percentage() {
    const max = Math.max(0.01, this.max || 1);
    return Math.round((this.clampedValue / max) * 1000) / 10;
  }

  /**
   * Determines whether the icon string is an image file path/URL or a FontAwesome class.
   */
  get isImageIcon() {
    return isImagePath(this.icon);
  }

  /**
   * Checks if a given Foundry User is permitted to view this tracker.
   * @param {User} user
   * @returns {boolean}
   */
  canUserView(user = game.user) {
    if (!user) return false;
    if (user.isGM) return true;
    return Boolean(this.showToPlayers);
  }

  /**
   * Checks if a given Foundry User can increment/decrement this tracker.
   * @param {User} user
   * @returns {boolean}
   */
  canUserEdit(user = game.user) {
    if (!user) return false;
    if (user.isGM) return true;
    return this.allowPlayerEdit && this.canUserView(user);
  }

  /**
   * Builds rendering context for Handlebars templates.
   * @param {User} user
   * @returns {object}
   */
  toRenderContext(user = game.user) {
    const isGM = user?.isGM ?? false;
    const pct = this.percentage;
    const max = Math.max(0.01, this.max || 1);
    const discreteCount = Math.min(Math.max(1, Math.round(this.max)), 30);
    const filledDiscrete = Math.round((pct / 100) * discreteCount);

    const segments = [];
    if (["segmented", "icons", "clock"].includes(this.styleType)) {
      for (let i = 1; i <= discreteCount; i++) {
        segments.push({
          index: i,
          targetValue: Math.round((i / discreteCount) * this.max * 100) / 100,
          active: i <= filledDiscrete,
          svgPath: this.styleType === "clock" ? buildClockSlicePath(i - 1, discreteCount) : ""
        });
      }
    }

    const renderedMilestones = (this.milestones || []).slice(0, 10).map((ms, idx) => {
      const msVal = Math.min(Math.max(0, Number(ms.value ?? 0)), max);
      const msPct = Math.round((msVal / max) * 1000) / 10;
      const iconStr = ms.icon || "fa-solid fa-flag";
      return {
        index: idx,
        value: msVal,
        percentage: msPct,
        icon: iconStr,
        isImageIcon: isImagePath(iconStr),
        reached: this.clampedValue >= msVal
      };
    });

    const showTitle = isGM || !this.hideTitle;
    const showNumbers = isGM || !this.hideNumbers;
    const formattedValue = showNumbers
      ? `${this.clampedValue} / ${this.max}`
      : game.i18n.localize("WOWPT.HUD.HiddenValue");

    return {
      ...this.toObject(),
      clampedValue: this.clampedValue,
      percentage: pct,
      discreteCount,
      segments,
      renderedMilestones,
      isImageIcon: this.isImageIcon,
      formattedValue,
      showTitle,
      showNumbers,
      canEdit: this.canUserEdit(user),
      isContinuous: this.styleType === "continuous",
      isMilestones: this.styleType === "milestones",
      isSegmented: this.styleType === "segmented",
      isIcons: this.styleType === "icons",
      isChase: this.styleType === "chase",
      isClock: this.styleType === "clock",
      visIcon: this.showToPlayers ? "fa-solid fa-eye" : "fa-solid fa-eye-slash",
      visLabel: game.i18n.localize(
        this.showToPlayers ? "WOWPT.HUD.Visibility.shown" : "WOWPT.HUD.Visibility.hidden"
      )
    };
  }
}
