# WoW Progress Tracker (Foundry VTT v14)

An **ultra-lightweight**, **highly customizable**, and **system-agnostic** progress tracker module for **Foundry VTT v14**, built natively on `ApplicationV2`, `HandlebarsApplicationMixin`, and `DataModel`.

## Key Features

- **6 Visual Bar Types**:
  1. **Continuous Bar (`continuous`)**: Smooth progress bar ideal for distances, journeys, or percentage goals. Supports custom background textures.
  2. **Milestone Bar (`milestones`)**: Continuous bar with up to **10 customizable milestones** placed at any value along the progress track, each with its own FontAwesome icon or custom image that lights up when reached.
  3. **Segmented (`segmented`)**: Discrete blocks ideal for skill checks, trials, or stages. Click directly on any segment to fill or clear it.
  4. **Icon-Pips (`icons`)**: Displays a row of FontAwesome icons or custom images that light up as progress advances (great for item collections, keys, or tokens).
  5. **Tug-of-War (`chase`)**: Dual-color contested bar with a moving marker icon for chases or opposing forces.
  6. **Radial Clock (`clock`)**: Crisp SVG pie-slice clock ideal for tension clocks or timed events.
- **Granular GM Control**:
  - **Show / Hide to Players**: Toggle player visibility with a single click from the GM HUD or configuration form.
  - **Hide Title from Players**: Show only the visual progress bar to players while keeping the title secret.
  - **GM-Only Step Counter**: Exact numeric counters (`1 / 10`) are visible exclusively to the GM.
  - **Optional Player Interaction**: Allow players to increment or decrement specific progress bars when enabled by the GM.
- **Clean Frameless Player Overlay**:
  - For players, visible progress bars automatically float in the top-right corner immediately next to the right sidebar—with transparent card backgrounds, no window frame, and no close button.
  - For the GM, a dedicated HUD window (with optional frameless lock mode) is accessible from the Scene Controls toolbar.

## Macro API (`WoWProgressTracker`)

The module exposes its public API globally at `WoWProgressTracker` (or `game.modules.get("wow-progress-tracker").api`):

```javascript
// Create a Milestone Bar visible to players
await WoWProgressTracker.createTracker({
  title: "Ritual of the Eclipse",
  description: "Stop the cultists before the final convergence",
  styleType: "milestones",
  value: 2,
  max: 10,
  step: 1,
  primaryColor: "#a855f7",
  secondaryColor: "#1e293b",
  icon: "fa-solid fa-moon",
  milestones: [
    { value: 5, icon: "fa-solid fa-bolt" },
    { value: 10, icon: "fa-solid fa-skull" }
  ],
  showToPlayers: true,
  hideTitle: false
});

// Increase or decrease progress by ID or Title
await WoWProgressTracker.modifyProgress("Ritual of the Eclipse", 1);

// Set an exact progress value
await WoWProgressTracker.setProgress("Ritual of the Eclipse", 6);

// Show or hide a tracker from players
await WoWProgressTracker.setVisibility("Ritual of the Eclipse", false);
```
