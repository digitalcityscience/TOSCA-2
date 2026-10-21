import { loadEnv } from "vite";

// Match Vite's production-mode resolution. process.env remains useful for CI
// and local overrides; the server-only .env.production supplies Docker builds.
const environment = { ...loadEnv("production", process.cwd(), ""), ...process.env };

const requiredVariables = [
  "VITE_BASE_URL",
  "VITE_KEYCLOAK_URL",
  "VITE_KEYCLOAK_REALM",
  "VITE_KEYCLOAK_CLIENT_ID",
  "VITE_BACKEND_ROOT_URL",
  "VITE_GEONODE_REST_URL",
  "VITE_MAPTILER_API_KEY",
  "VITE_MAP_START_LNG",
  "VITE_MAP_START_LAT",
  "VITE_MAP_START_ZOOM",
];

const optionalVariables = [
  "VITE_GEOSERVER_BASE_URL",
];

const inHouseMapVariables = [
  "VITE_INHOUSE_MAP_BASE_URL",
  "VITE_INHOUSE_MAP_API_KEY",
];
const inHouseMapConfigured = inHouseMapVariables.some((name) => {
  const value = environment[name];
  return value !== undefined && value.trim() !== "";
});
if (inHouseMapConfigured) requiredVariables.push(...inHouseMapVariables);

const missingVariables = requiredVariables.filter((name) => {
  const value = environment[name];
  return value === undefined || value.trim() === "";
});

if (missingVariables.length > 0) {
  console.error(
    `Missing required Vite build-time environment variable(s): ${missingVariables.join(", ")}`
  );
  process.exit(1);
}

for (const name of [
  "VITE_KEYCLOAK_URL",
  "VITE_BACKEND_ROOT_URL",
  "VITE_GEONODE_REST_URL",
  "VITE_INHOUSE_MAP_BASE_URL",
  ...optionalVariables,
]) {
  const value = environment[name]?.trim();
  if (value !== undefined && value !== "" && !/^https?:\/\//i.test(value)) {
    console.error(`${name} must be an absolute URL including protocol. Received: ${value}`);
    process.exit(1);
  }
}

for (const name of ["VITE_MAP_START_LNG", "VITE_MAP_START_LAT", "VITE_MAP_START_ZOOM"]) {
  const value = environment[name];
  if (!Number.isFinite(Number(value))) {
    console.error(`${name} must be a finite number. Received: ${value}`);
    process.exit(1);
  }
}
