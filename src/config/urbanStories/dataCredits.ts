/**
 * Data sources and credits shown above the Urban Stories list.
 *
 * Every entry comes from the GeoStories source registry (`geoStories/export/config/sources.yaml`) or from the
 * sources the stories load directly (HVV WFS, HamburgRiders). Names and attribution text are carried verbatim from
 * those records. Links are only set where the registry records an access URL or the publisher page was checked.
 * Licence and attribution wording is what the records say; it is not a legal assessment.
 */

export type CreditGroupKey = "hamburg" | "mobility" | "community" | "other";
export type CreditLicenseKey = "dlDeBy" | "dlDeZero" | "odbl" | "mit";

export interface CreditLicense {
    label: string
    url?: string
}

export const CREDIT_LICENSES: Record<CreditLicenseKey, CreditLicense> = {
    dlDeBy: { label: "DL-DE/BY-2.0", url: "https://www.govdata.de/dl-de/by-2-0" },
    dlDeZero: { label: "DL-DE/Zero-2.0", url: "https://www.govdata.de/dl-de/zero-2-0" },
    odbl: { label: "ODbL 1.0", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
    mit: { label: "MIT" },
};

export interface DataCredit {
    /** Key under `urbanStories.credits.items` for the short "used for" text. */
    id: string
    group: CreditGroupKey
    name: string
    /** Attribution / source note as given by the publisher record or the project registry. */
    attribution: string
    license?: CreditLicenseKey
    url?: string
}

export const DATA_CREDITS: readonly DataCredit[] = [
    {
        id: "alkis", group: "hamburg", name: "ALKIS Liegenschaftskarte Hamburg",
        attribution: "Freie und Hansestadt Hamburg, Landesbetrieb Geoinformation und Vermessung (LGV)", license: "dlDeBy",
    },
    {
        id: "admin", group: "hamburg", name: "Verwaltungsgrenzen & Statistische Gebiete Hamburg",
        attribution: "Freie und Hansestadt Hamburg, Landesbetrieb Geoinformation und Vermessung; Statistisches Amt für Hamburg und Schleswig-Holstein",
        license: "dlDeBy", url: "https://geodienste.hamburg.de/HH_WFS_Verwaltungsgrenzen",
    },
    {
        id: "dgp", group: "hamburg", name: "Digitaler Grünplan Hamburg (DGP)",
        attribution: "Freie und Hansestadt Hamburg, Behörde für Umwelt und Energie", license: "dlDeBy",
        url: "https://geodienste.hamburg.de/HH_WFS_Gruenplan",
    },
    {
        id: "feinkartierung", group: "hamburg", name: "Feinkartierung Grün Hamburg",
        attribution: "Freie und Hansestadt Hamburg, Behörde für Umwelt, Klima, Energie und Agrarwirtschaft", license: "dlDeZero",
        url: "https://api.hamburg.de/datasets/v1/feinkartierung_gruen",
    },
    {
        id: "trees", group: "hamburg", name: "Straßenbaumkataster Hamburg",
        attribution: "Freie und Hansestadt Hamburg, Landesbetrieb Geoinformation und Vermessung (LGV)", license: "dlDeBy",
        url: "https://api.hamburg.de/datasets/v1/strassenbaumkataster",
    },
    {
        id: "dgm1", group: "hamburg", name: "DGM1 Hamburg",
        attribution: "Freie und Hansestadt Hamburg, Landesbetrieb Geoinformation und Vermessung (LGV)",
    },
    {
        id: "hvvCatchments", group: "mobility", name: "Einzugsbereiche von HVV-Haltestellen Hamburg",
        attribution: "Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende", license: "dlDeBy",
        url: "https://geodienste.hamburg.de/HH_WFS_HVV_Einzugsbereiche",
    },
    {
        id: "hvvGtfs", group: "mobility", name: "HVV Fahrplandaten (GTFS)",
        attribution: "Hamburger Verkehrsverbund GmbH (hvv), via Transparenzportal Hamburg", license: "dlDeBy",
    },
    {
        id: "unfallatlas", group: "mobility", name: "Unfallatlas",
        attribution: "© Statistische Ämter des Bundes und der Länder", license: "dlDeBy",
    },
    {
        id: "osm", group: "community", name: "OpenStreetMap",
        attribution: "© OpenStreetMap contributors", license: "odbl", url: "https://www.openstreetmap.org/copyright",
    },
    { id: "carto", group: "community", name: "CARTO Dark Matter basemap (HamburgRiders)", attribution: "© CARTO, © OpenStreetMap contributors" },
    { id: "coloringCities", group: "other", name: "Coloring Cities building heights", attribution: "Derived from Hamburg LoD2 (LoD2-DE_HH)" },
    { id: "riders", group: "other", name: "hamburgriders", attribution: "© 2026 Bert Temme; lineage utrechtriders / londonriders", license: "mit" },
];

export const CREDIT_GROUPS: readonly CreditGroupKey[] = ["hamburg", "mobility", "community", "other"];
