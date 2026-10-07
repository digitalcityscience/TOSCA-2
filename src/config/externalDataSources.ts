export type ExternalDataSourceType = "ogc-api" | "sensorthings";

export interface ExternalDataSourceCapabilities {
    show_uncurated: boolean;
    full_load: boolean;
    live_updates: boolean;
    server_filters: boolean;
    max_features: number;
}

/** A public third-party data service published by the backend catalog. */
export interface ExternalDataSourceConfig {
    id: string;
    type: ExternalDataSourceType;
    title: string;
    url: string;
    mqttUrl?: string;
    capabilities: ExternalDataSourceCapabilities;
}
