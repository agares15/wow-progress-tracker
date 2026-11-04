# WoW Progress Tracker (Foundry VTT v14)

Un módulo **ultraligero**, **altamente personalizable** y **system-agnostic** (compatible con cualquier sistema de rol) para **Foundry VTT v14**, construido nativamente sobre `ApplicationV2`, `HandlebarsApplicationMixin` y `DataModel`.

## Características Principales

- **5 Estilos Visuales de Progreso**:
  1. **Barra Continua (`continuous`)**: Ideal para distancias (`km`, `ft`), viajes o metas porcentuales.
  2. **Bloques Segmentados (`segmented`)**: Ideal para *Skill Checks*, rituales o fases discretas. Permite hacer clic directamente en un bloque para llenarlo o vaciarlo.
  3. **Iconos / Pips (`icons`)**: Muestra una fila de iconos de FontAwesome o imágenes personalizadas que se iluminan conforme avanza la meta (ideal para recolectar objetos o llaves).
  4. **Persecución / Tug-of-War (`chase`)**: Barra enfrentada a dos colores con marcador móvil para persecuciones o disputas.
  5. **Reloj Circular (`clock`)**: Reloj radial estilo *Blades in the Dark* junto con segmentos interactivos.
- **Control Total de Visibilidad por el GM**:
  - **Oculto (Solo GM)**: Solo visible para el Director de Juego.
  - **Público (Todos)**: Visible en tiempo real para todos los jugadores.
  - **Jugadores Específicos**: Selecciona individualmente qué jugadores pueden ver cada barra.
  - **Ocultar Números (`???`)**: Muestra el avance visual de la barra sin revelar las cifras exactas a los jugadores.
  - **Edición Opcional por Jugadores**: Permite que los jugadores autorizados también incrementen o disminuyan una barra específica.
- **Modo Sin Bordes (Frameless HUD)**: Bloquea el HUD con el icono del candado para ocultar el marco de ventana de Foundry y dejar las barras flotando limpiamente sobre el lienzo.

## Uso con Macros (API Pública)

El módulo expone su API globalmente en `WoWProgressTracker` (o `game.modules.get("wow-progress-tracker").api`):

```javascript
// Crear una barra de persecución visible para todos
await WoWProgressTracker.createTracker({
  title: "Huida por los Tejados",
  description: "Escapar antes de que lleguen los guardias",
  category: "chase",
  styleType: "chase",
  value: 5,
  max: 10,
  step: 1,
  primaryColor: "#ef4444",
  secondaryColor: "#3b82f6",
  icon: "fa-solid fa-person-running",
  visibility: "all"
});

// Incrementar o disminuir una barra por nombre o ID
await WoWProgressTracker.modifyProgress("Huida por los Tejados", 1);

// Definir un valor exacto
await WoWProgressTracker.setProgress("Huida por los Tejados", 8);

// Cambiar visibilidad a jugadores específicos
await WoWProgressTracker.setVisibility("Huida por los Tejados", "custom", ["USER_ID_1"]);
```

