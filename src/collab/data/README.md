# Collab building data

`buildings_all.geojson` is an unchanged copy of
`COUP-table-web-interface/buildings_all.geojson` (78 building footprints). It is copied here so
the Collab runtime owns its input and never reads data from the Vanilla application.

`marker-building-map.json` is the physical `marker_id` to `building_id` association. Edit this
file when a marker is re-taped to another building; do not hardcode that association in
TypeScript. The initial two associations come from the Vanilla working copy
`COUP-table-web-interface/js/startGeojson.js`.
