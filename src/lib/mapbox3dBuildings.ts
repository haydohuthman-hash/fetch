import type { Map } from 'mapbox-gl'

/**
 * Adds Mapbox standard `composite` building extrusions when available (3D city mesh).
 * Safe to call on `load` / `styledata`; no-op if layer exists or source missing.
 */
export function addMapbox3DBuildingsLayer(map: Map, layerId = 'fetch-3d-buildings'): void {
  if (map.getLayer(layerId)) return
  if (!map.getSource('composite')) return
  try {
    map.addLayer({
      id: layerId,
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', ['get', 'extrude'], true],
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          '#94a3b8',
          17,
          '#64748b',
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.62,
      },
    })
  } catch {
    /* Style may already extrude buildings */
  }
}
