# Changelog

All notable changes to **WoW Progress Tracker** are documented in this file.

## [1.1.0] - 2026-11-15

### Added
- **Draggable & Resizable Player HUD**:
  - Players can now freely reposition (drag via the hover toolbar) and resize the simplified frameless tracker HUD, with their custom position and dimensions automatically saved per client (`hudPosition`).
  - Removed window blur and enforced `overflow: visible` on the simplified HUD so bar glows and markers are never clipped.
- **Output Automations / Triggers (`AutomationRunner`)**:
  - Added support for triggering automated actions when a tracker reaches **Max (`onComplete`)**, drops to **Zero (`onZero`)**, crosses a **Milestone (`onMilestone`)**, or changes **On Every Step (`onStep`)**.
  - Added 8 built-in automation actions:
    - **Run Macro**: Executes a selected World Macro and passes `{ tracker, prevValue, value, max, trigger, milestones }` in scope.
    - **Play Sound**: Plays an audio file across all connected clients.
    - **Toggle Token / Tile Visibility**: Reveals or hides selected Tokens, Tiles, or AmbientLights on the active scene, with a one-click canvas picker (<i class="fa-solid fa-crosshairs"></i>).
    - **Pause Game**: Automatically pauses Foundry VTT when triggered.
    - **Roll on RollTable**: Automatically draws a result from a selected `RollTable`.
    - **Post Custom Chat Message**: Sends a custom formatted message to the Chat.
    - **Reveal Tracker to Players**: Makes another hidden Progress Tracker visible to players (ideal for multi-phase events).
    - **Advance Another Tracker (+1 Step)**: Increments another Progress Tracker by its configured step.
  - Added context-aware UI selectors and dynamic help hints for every automation action in the configuration dialog.
- **Input Triggers / Auto-Advance**:
  - Added automatic progress advancement or reduction (`+ Step` / `- Step`) driven by game events:
    - **On Every Combat Round (`combatRound`)**: Advances at the start of each new round in an active Combat encounter.
    - **On Every Combat Turn (`combatTurn`)**: Advances on every turn change in an active Combat encounter.
    - **Real-Time Timer (`timer`)**: Advances every $X$ real-time seconds while the game is unpaused.
    - **In-Game World Time (`worldTime`)**: Advances every $X$ seconds of in-game World Time (compatible with *Simple Calendar*).
- **Enhanced Chat Cards & Compatibility**:
  - Chat cards now render the exact visual style of each tracker (Continuous, Milestones, Segmented, Icon-Pips, Tug-of-War, and SVG Radial Clock) along with its custom icon and title.
  - Extended minimum compatibility to Foundry VTT v12 (`v12` – `v14`).

---

## [1.0.0] - 2026-11-04

### Added
- Initial release of **WoW Progress Tracker** (for Foundry VTT v13 and v14).
- **6 Visual Bar Types**: Continuous Bar, Milestone Bar (up to 10 customizable icon/image milestones), Segmented, Icon-Pips, Tug-of-War, and SVG Radial Clock.
- **GM HUD & Frameless Player Overlay**: Dedicated GM management HUD and floating top-right player display.
- **Granular Visibility**: Toggle player visibility, hide tracker titles from players, and optionally allow player progress adjustments.
- **Macro API**: Exposed `WoWProgressTracker` global API for scripting and macros.
