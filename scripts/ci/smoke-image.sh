#!/usr/bin/env bash
# Starts a built tosca-frontend image the way the TOSCA platform does and
# checks what the browser gets: the app, the runtime config.js written from the
# container's VITE_* variables, and /version.json. Also checks that the
# container refuses to start with an incomplete configuration.
# Used by the PR and release workflows; runs locally too:
#
#   scripts/ci/smoke-image.sh tosca-frontend:dev
set -Eeuo pipefail

image=${1:?usage: smoke-image.sh IMAGE}
name=tosca-frontend-smoke-$$
port=${SMOKE_PORT:-18080}
failed=0

# shellcheck disable=SC2317 # called by the EXIT trap
cleanup() {
  if [[ $failed != 0 ]]; then docker logs --tail 50 "$name" 2>&1 || true; fi
  docker rm -f "$name" "$name-bad" >/dev/null 2>&1 || true
}
trap cleanup EXIT

ok()   { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n        %s\n' "$1" "${2:-}"; failed=1; }
check() { if [[ $3 == *"$2"* ]]; then ok "$1"; else fail "$1" "expected '$2', got '${3:0:200}'"; fi; }

config=(
  -e VITE_BACKEND_ROOT_URL=http://api.example:8000
  -e VITE_GEONODE_REST_URL=http://geoserver.example:8585/geoserver
  -e VITE_GEOSERVER_BASE_URL=http://geoserver.example:8585/geoserver
  -e VITE_MAPTILER_API_KEY=smoke-test-key
  -e VITE_MAP_START_LNG=10.0 -e VITE_MAP_START_LAT=53.55 -e VITE_MAP_START_ZOOM=11
)

docker run -d --name "$name" -p "127.0.0.1:$port:80" "${config[@]}" "$image" >/dev/null
base=http://127.0.0.1:$port
for _ in $(seq 1 30); do
  [[ $(curl -s -o /dev/null -w '%{http_code}' "$base/healthz" || true) == 200 ]] && break
  sleep 1
done

check "health endpoint"                   200 "$(curl -s -o /dev/null -w '%{http_code}' "$base/healthz")"
check "serves the app"                    '<div id="app"' "$(curl -s "$base/")"
check "client-side routes fall back to the app" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$base/some/client/route")"
cfg=$(curl -s "$base/config.js")
check "config.js carries the API address" "http://api.example:8000" "$cfg"
check "config.js carries the map key"     "smoke-test-key" "$cfg"
if grep -qi 'keycloak.*https\?://' <<<"$cfg"; then
  fail "no sign-in configured without Keycloak settings" "$cfg"
else ok "no sign-in configured without Keycloak settings"; fi
check "config.js is not cached"           no-cache "$(curl -s -D - -o /dev/null "$base/config.js" | tr -d '\r' | grep -i '^cache-control:')"
label=$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')
check "version.json names the build"      "\"version\":\"$label\"" "$(curl -s "$base/version.json")"
check "version.json is not cached"        no-cache "$(curl -s -D - -o /dev/null "$base/version.json" | tr -d '\r' | grep -i '^cache-control:')"

# Incomplete configuration: the container must stop instead of serving an app
# that cannot work.
docker run -d --name "$name-bad" -e VITE_BACKEND_ROOT_URL=http://api.example:8000 "$image" >/dev/null
for _ in $(seq 1 15); do
  [[ $(docker inspect -f '{{.State.Running}}' "$name-bad") == false ]] && break
  sleep 1
done
check "refuses to start without the required settings" "false 1" \
  "$(docker inspect -f '{{.State.Running}} {{.State.ExitCode}}' "$name-bad")"
check "and says which ones are missing"   VITE_MAPTILER_API_KEY "$(docker logs "$name-bad" 2>&1)"

docker rm -f "$name-bad" >/dev/null
docker run -d --name "$name-bad" "${config[@]}" -e VITE_KEYCLOAK_URL=https://keycloak.example "$image" >/dev/null
for _ in $(seq 1 15); do
  [[ $(docker inspect -f '{{.State.Running}}' "$name-bad") == false ]] && break
  sleep 1
done
check "refuses a half-configured Keycloak" "false 1" \
  "$(docker inspect -f '{{.State.Running}} {{.State.ExitCode}}' "$name-bad")"

echo
if [[ $failed == 0 ]]; then echo "All checks passed."; else echo "Some checks FAILED."; fi
exit $failed
