# External catalog frontend flow

The Datastores sidebar combines the internal catalog with backend-curated external data.
External services and categories are configured by the backend; the frontend has no
environment-defined service list or production fallback.

## Catalog metadata

`WorkspaceListing.vue` starts these requests when the Datastores sidebar mounts:

- `GET /api/v1/catalog/external-services` loads service URLs, attribution, and capability
  switches. The backend service `slug` is the frontend source id.
- `GET /api/v1/catalog/external-categories` loads the ordered category summaries.
- `GET /api/v1/catalog/external-categories/<slug>` is requested only when that category
  body mounts. Details are cached by slug for the Pinia store lifetime.

Catalog requests use the shared backend request path. Requests to third-party OGC API and
SensorThings services use the configured public service URL and do not receive backend
credentials. An item is rendered only when its `service` slug exists in the services
response. Internal workspaces, external categories, capability-enabled source entries, and
the 3D demo remain separate accordion entries.

## OGC API Features

Each curated OGC item identifies one dataset and one `collection_id`; it always becomes one
map layer. The OGC layer store resolves the collection, applies initial properties and CQL2
filters, and chooses a full or viewport load from the reported count and service limit.
Large full loads stream into deck.gl, while viewport layers reload after map movement.

An OGC service appears in the workspace list only when `show_uncurated` is enabled. That
browser loads datasets and collections lazily and uses a different layer id from curated
category items, so both entry points can coexist.

## SensorThings

Curated SensorThings items identify a `service_name` and `layer_name`. Datastreams are loaded
with a property filter, paged without `$count`, and capped by `max_features` when configured.
The map layer id contains the source, service, and layer names.

The uncurated browser, when enabled, scans `Datastreams?$select=properties` in 1,000-row
pages once per source and caches the distinct `serviceName` / `layerName` catalogue. The UI
groups layers by service name and mounts cards only for expanded groups. Curated and
uncurated entries share the same layer-loading store action, so they also share map identity
and live-update behavior.

## Capabilities and failures

- `show_uncurated` controls whether a service gets a workspace-list entry.
- `full_load` controls the OGC deck.gl full-load action.
- `server_filters` controls OGC property selection and filter controls.
- `live_updates` controls SensorThings MQTT subscriptions.
- `max_features` caps OGC and SensorThings loads; `null` uses the frontend default.

Unavailable catalog metadata shows the standard retryable service alert without affecting
internal workspaces. Curated items marked `MISSING` or `ERROR` remain visible but cannot be
added to the map. Removing a SensorThings layer also removes its desired live subscriptions
through the existing map-layer watcher.

## Main implementation files

- `src/store/externalDataSources.ts`: backend metadata, external API parsing, paging, caches.
- `src/store/ogcLayers.ts`: OGC layer modes, queries, filters, and full loading.
- `src/store/sensorThingsLayers.ts`: shared curated/uncurated SensorThings layer creation.
- `src/store/sensorThingsLive.ts`: capability-gated MQTT subscriptions.
- `src/components/Data/Workspace/WorkspaceListing.vue`: sidebar ordering and capability gate.
- `src/components/Data/External/`: category and per-service browsers.
