# Walkability & Safety: data findings and map choices

## Sources checked

- `../SUMO-15/data/destatis_unfallatlas_deutschland_2016_bis_aktuell.parquet`: 2,371,026 German Unfallatlas records. Hamburg has 69,384 records for 2016–2025.
- `../SUMO-15/geoStories/export/hamburg_mobility/hamburg_mobility/hamburg_mobility.gpkg`: 802,570 walking-network segments. The export assigns an Unfallatlas point once to its nearest segment within 30 m.
- `../SUMO-15/geoStories/export/hamburg_administrative/hamburg_stadtteile/hamburg_stadtteile.gpkg`: used only to name the areas in the analysis.

The story uses the export's selected non-pandemic years: 2019 and 2022–2025. `n_accidents_vru_5y` is the safest headline count because an event involving both a person walking and a person cycling appears once, rather than twice.

## What the export shows

Among 356,027 segments inside Hamburg's accident-coverage area:

| Assigned crash records | Segments | Network length |
| --- | ---: | ---: |
| 0 | 343,240 (96.4%) | 12,238.8 km |
| 1 | 9,897 | 541.1 km |
| 2 | 1,926 | 117.3 km |
| 3 or more | 964 | 63.7 km |

This is a zero-heavy, discrete count. A continuous purple ramp makes almost the entire city look like a crash surface and hides the small share that actually has assigned records.

The largest one-kilometre grid cell, based on positive segment centroids, is centred at `10.00384, 53.55517` in Hamburg-Altstadt. It contains 341 unique records involving people walking or cycling. The next cells are Neustadt (288) and Eimsbüttel (277). These are concentrations of records; the analysis does not infer cause, exposure, or individual risk.

## Cartographic decision implemented

The raw-count views use exact classes:

| Class | Colour | Meaning |
| --- | --- | --- |
| Background network | muted slate | no assigned record in the selected years |
| 1 | amber | one recorded crash |
| 2 | orange | two recorded crashes |
| 3+ | red | three or more recorded crashes |

Only positive-count segments receive a thematic colour. The background network remains visible with low opacity so the user can orient themselves at zoom 9 without mistaking zero records for missing data. The continuous `accident_rate_smoothed` and derived `safety_index` remain optional analytical metrics, with their modelled status stated in the interface; they are not the story's headline map.

## Building metrics and 3D rendering

The building export (`../SUMO-15/geoStories/export/hamburg_buildings/hamburg_buildings/metadata.yaml`) defines two separate neighbourhood measures:

- `comfort_mean_400m`: length-weighted mean walking comfort on reachable street segments, excluding unscored segments. Higher means more comfort.
- `safety_index_400m`: length-weighted safety index on reachable street segments. Higher means lower modelled recorded-crash concentration.

Both use 400 m of network walking distance, including the origin connector; neither describes the building itself. Both thematic styles now use the 15-Minute City extrusion expression, opacity and fine white footprint outlines. Colour continues to encode the selected metric; height uses only `building_height_m`, the exported LoD2 height above ground in metres. Missing or invalid heights stay flat without an estimate (the export documents 6,036 missing heights). The building chapter opens with a pitched camera, and selecting a building highlights its extruded volume.

Redundant colour narration and the repeated “Grey means no data” legend sentence have been removed. The no-data swatch remains; the crash-count legend retains the distinct explanation that the background network has no assigned record.

## Separate street and building stories

`walkability-safety` now contains only street conditions and recorded-crash chapters. The new `building-walking` story contains two building-only chapters: surrounding walking comfort and recorded-crash concentration within 400 m. Both retain the height-based 3D rendering.

A persistent left-side building details panel supports both story playback and Explore. It reads the exported `gml_id` (ALKIS identity), `building_function_code` (original ALKIS use code), `is_residential` (residential or mixed use with housing), `building_height_m`, and `footprint_area_m2`, followed by the two walking-environment measures. Missing fields are shown as unavailable; no use-code labels or heights are invented. Changing the selection replaces all details; leaving the building story clears the selection and restores normal popups.

## Story colours and chapter count correction

A regression test reproduces a competing-layer bug: after starting 15-Minute City and then building walking, both independent render layers for the same building geometry remained visible. Changing the walking metric did not remove the previous story's extrusion. The store now hides competing tracked styles for the same catalog geometry when a visible story layer is added, activated in a chapter, or given a metric. Records remain available for reuse; unrelated datasets are not hidden. An explicit Explore metric selection also reveals its layer, including when the chosen style was already selected.

The panel distinguishes preview, map colours and hidden layers and uses the applied metric for the legend. The regression test checks both directions of story switching, the evaluated comfort/safety colours, and reactivation through Explore.

Both street and building stories now have five chapters. Street chapters cover comfort, crash counts, the city-centre cluster, sidewalk categories and grade. Building chapters cover comfort, safety, comfort-data coverage, the network length used for safety, and inspecting one building. The last chapter explicitly returns to comfort colouring.

| Building map measure | Export field | Palette | Meaning of increasing values |
| --- | --- | --- | --- |
| Mean walking comfort | `comfort_mean_400m` | red to teal | greater modelled comfort |
| Safety index | `safety_index_400m` | pink to blue | lower modelled crash concentration |
| Comfort-data coverage | `comfort_scored_share_400m` | light to dark purple | larger share with scores (0–1), not better comfort |
| Network length for safety | `safety_covered_len_400m_m` | yellow to dark orange | more scored street metres, not greater safety |

Height continues to use only `building_height_m`. Coverage and network-length attributes were already documented in the checked export metadata; no additional measurements are inferred.

## Unrelated overlays when changing stories

The building story does not use Stadtteile. A transition from the neighbourhood chapter of 15-Minute City left its administrative layers visible because the earlier fix only hid competing styles of the same geometry. Story selection and chapter-run startup now hide tracked story datasets that the destination story does not use. Layer records are retained for reuse, and layers added outside Urban Stories are not targeted. The regression test covers selection, playback and all five building chapters after the 15-Minute City neighbourhood chapter.
