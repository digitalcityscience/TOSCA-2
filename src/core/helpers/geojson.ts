export type GeoJsonProperties = GeoJSON.GeoJsonProperties;
export type Feature<G extends GeoJSON.Geometry = GeoJSON.Geometry, P = GeoJsonProperties> = GeoJSON.Feature<G, P>;
export type FeatureCollection<G extends GeoJSON.Geometry = GeoJSON.Geometry, P = GeoJsonProperties> = GeoJSON.FeatureCollection<G, P>;
export type Point = GeoJSON.Point;
export type Polygon = GeoJSON.Polygon;
export type MultiPolygon = GeoJSON.MultiPolygon;
