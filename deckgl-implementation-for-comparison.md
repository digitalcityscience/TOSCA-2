# 🗺️ Feature: Deck.gl Overlay with MapLibre Synchronization (Pattern 2)

## Overview
We want to enable **advanced visualization and interaction using Deck.gl** while retaining our **MapLibre base map** as a contextual layer.  
In this setup, **Deck.gl will control camera and user interactions** (pan, zoom, rotate), and **MapLibre will follow Deck.gl’s view state** to keep both layers visually synchronized.

This pattern provides maximum flexibility for GPU-based visualizations (raster analysis, data filtering, simulation layers, etc.) while preserving our existing MapLibre map pipeline, sources, and controls.

---

## 🎯 Goals

- Render Deck.gl layers (e.g., raster, 3D tiles, scatterplots) on top of the existing MapLibre map.
- Allow Deck.gl to handle **user interaction** (`controller: true`).
- Synchronize MapLibre camera (center, zoom, bearing, pitch) based on Deck.gl’s view state.
- Support optional **deck-only swipe comparison** using CSS clipping (no second map instance).
- Keep implementation modular and easy to enable/disable.

---

## 📚 Background

Currently, our map implementation uses MapLibre as the single rendering and interaction engine.  
However, Deck.gl offers advanced GPU-accelerated rendering for:
- Large raster or point datasets
- Temporal visualizations
- Complex shaders and blending
- Custom analytical visualizations (e.g., elevation diff, heat maps)

**Pattern 2** allows Deck.gl to “own” the camera and render loop while MapLibre remains a passive basemap.  
This eliminates the need for multiple MapLibre instances and ensures smooth interaction when Deck.gl layers require WebGL context isolation.

---

## 🧩 Architecture

+—————————————————––+
| Map Container (relative / fixed)                      |
|                                                       |
|  ├── MapLibre Canvas (base map)                       |
|  │     └─ Raster A / Basemap / Labels (non-interactive)|
|  │                                                   |
|  └── Deck.gl Canvas (overlay, absolute, on top)       |
|        └─ Deck layers (e.g., rasterB, vector, etc.)   |
|                                                       |
|  Optional: Slider controlling Deck canvas clip-path   |
+—————————————————––+

---

## ⚙️ Implementation Steps

### 1. Initialize the MapLibre map
MapLibre serves as the static base. Disable user interaction so Deck.gl can control the view state.

```ts
const map = new maplibregl.Map({
  container: 'map',
  style: baseStyle,       // existing style JSON
  center: [lon, lat],
  zoom: 12,
  interactive: false      // MapLibre follows Deck camera
});
```

⸻

### 2. Create a Deck.gl overlay (example code)

⚠️ This code is an example. The final implementation must adapt paths, sources, and lifecycle management to our codebase structure.
```ts
import { Deck } from '@deck.gl/core';
import { TileLayer, BitmapLayer } from '@deck.gl/layers';

const deck = new Deck({
  parent: document.getElementById('map')!, // render over the MapLibre map
  controller: true, // deck handles pan/zoom/rotate
  initialViewState: { longitude: lon, latitude: lat, zoom: 12 },
  layers: [
    new TileLayer({
      id: 'rasterB',
      data: 'https://example.tileserver/{z}/{x}/{y}.png',
      minZoom: 0,
      maxZoom: 22,
      tileSize: 256,
      renderSubLayers: (props) =>
        new BitmapLayer(props, {
          image: props.data,
          bounds: props.tile.bbox,
          opacity: 1
        })
    })
  ],
  onViewStateChange: ({ viewState }) => {
    map.jumpTo({
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
      bearing: viewState.bearing || 0,
      pitch: viewState.pitch || 0
    });
  }
});
```

⸻

### 3. Manage overlay canvas

Ensure Deck.gl canvas is placed absolutely over MapLibre’s container.
```css
#map {
  position: relative;
}
.deckgl-canvas {
  position: absolute !important;
  inset: 0;
  pointer-events: auto;
}
```
Optionally, assign the class via:
```ts
(deck as any).canvas.classList.add('deckgl-canvas');
```

⸻

### 4. Implement an optional swipe comparison (CSS clip)

No extra map is needed—just clip the Deck.gl canvas.
```ts
<input id="swipe" type="range" min="0" max="100" value="50">

const deckCanvas = (deck as any).canvas as HTMLCanvasElement;
const slider = document.getElementById('swipe') as HTMLInputElement;

slider.addEventListener('input', () => {
  const pct = Number(slider.value);
  deckCanvas.style.clipPath = `inset(0 ${100 - pct}% 0 0)`; // left-right swipe
});
```

⸻

### 5. Integration into Vue 3 app

Create a composable or component wrapper:
	•	<DeckOverlay> handles Deck initialization and destruction.
	•	Watch for parent map readiness (onMounted after MapLibre emits 'load').
	•	Use onBeforeUnmount to call deck.finalize() for cleanup.
	•	Pass configuration (e.g., layers, tileset URLs) via props.

⸻

## 🧱 Folder / File Structure Proposal

src/
 ├─ components/
 │   ├─ map/
 │   │   ├─ DeckOverlay.vue        # Deck.gl overlay wrapper
 │   │   ├─ MapContainer.vue       # Existing MapLibre container
 │   │   └─ CompareSlider.vue      # Optional swipe control
 ├─ composables/
 │   └─ useDeckOverlay.ts          # Encapsulates Deck + sync logic
 ├─ styles/
 │   └─ deck-overlay.css
 └─ types/
     └─ deck.d.ts                  # Extend types if needed


⸻

## 🧠 Design Notes & Recommendations
	•	Performance: Two WebGL contexts (MapLibre + Deck). Use lightweight MapLibre style and disable terrain/layers that are not needed.
	•	Synchronization frequency: jumpTo() is fine for most use cases; use throttling if camera updates become too frequent.
	•	Attribution: Keep MapLibre attribution visible on top.
	•	Interactivity: All user input (drag, zoom, rotate) goes through Deck; MapLibre remains passive.
	•	Cleanup: Always call deck.finalize() when the overlay is destroyed to free GPU resources.

⸻

## 🚧 Tasks & Checklist

|Task|	Description	Status|
|----|----|
|🧩 Setup Deck.gl and dependencies	Add @deck.gl/core, @deck.gl/layers to the frontend project|	☐|
|⚙️ Implement base overlay	Create composable useDeckOverlay.ts with camera sync|	☐|
|🧱 Integrate with Vue Map component	Mount Deck canvas inside map container|	☐|
|🎚 Add optional swipe slider	CSS clip-path-based deck visibility|	☐|
|🧹 Cleanup lifecycle	Destroy Deck instance on unmount|	☐|
|🧪 Test synchronization	Ensure camera updates correctly follow Deck events|	☐|
|📈 Performance test	Validate FPS and GPU memory under load|	☐|
|🧭 Documentation	Add developer guide in /docs/map/DeckOverlay.md|	☐|


⸻

## 🧾 Acceptance Criteria
	•	Deck.gl overlay renders correctly above MapLibre without flicker.
	•	MapLibre basemap updates seamlessly with Deck interactions.
	•	No user interaction is lost (zoom, pan, rotate fully handled by Deck).
	•	Overlay can be toggled on/off dynamically.
	•	Optional swipe control works without re-rendering or new map instances.

⸻

## 🔍 References
	•	Deck.gl Core Docs
	•	TileLayer API
	•	MapLibre JS Docs
	•	Deck + Mapbox Integration Example

⸻

## 🧩 Example Demo Reference

You can check the deck.gl + MapLibre integration demo (Mapbox example also compatible):
https://deck.gl/examples/mapbox-layer/

⸻

Estimated Effort: 1–2 days initial integration + testing
Owner: [assign developer]
Priority: Medium
Depends on: Existing MapLibre map component readiness

⸻

⚠️ Note: All example code and configurations above are for demonstration.
Implementation should follow our existing component structure, state management, and TypeScript typing conventions.
