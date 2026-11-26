#!/bin/sh
# Runs when the container starts (the nginx image executes the scripts in
# /docker-entrypoint.d/ before it starts nginx). Checks the VITE_* variables of
# the container and writes them to config.js, which the app loads before it
# starts. A failed check stops the container.
set -eu

CONFIG_FILE="${TOSCA_CONFIG_FILE:-/usr/share/nginx/html/config.js}"

value_of() {
    eval "printf '%s' \"\${$1:-}\""
}

is_set() {
    [ -n "$(value_of "$1" | tr -d '[:space:]')" ]
}

fail() {
    echo "tosca config: $1" >&2
    exit 1
}

required="VITE_BACKEND_ROOT_URL VITE_GEONODE_REST_URL VITE_MAPTILER_API_KEY VITE_MAP_START_LNG VITE_MAP_START_LAT VITE_MAP_START_ZOOM"

# All-or-nothing groups: unset turns the feature off (no Keycloak variables:
# the app runs without sign-in), a partial set is a configuration mistake.
for group in \
    "VITE_INHOUSE_MAP_BASE_URL VITE_INHOUSE_MAP_API_KEY" \
    "VITE_KEYCLOAK_URL VITE_KEYCLOAK_REALM VITE_KEYCLOAK_CLIENT_ID"
do
    for name in $group; do
        if is_set "$name"; then
            required="$required $group"
            break
        fi
    done
done

missing=""
for name in $required; do
    is_set "$name" || missing="$missing $name"
done
[ -z "$missing" ] || fail "missing required variable(s):$missing"

for name in VITE_KEYCLOAK_URL VITE_BACKEND_ROOT_URL VITE_GEONODE_REST_URL VITE_INHOUSE_MAP_BASE_URL VITE_GEOSERVER_BASE_URL; do
    if is_set "$name" && ! value_of "$name" | grep -Eqi '^[[:space:]]*https?://'; then
        fail "$name must be an absolute URL including protocol. Received: $(value_of "$name")"
    fi
done

for name in VITE_MAP_START_LNG VITE_MAP_START_LAT VITE_MAP_START_ZOOM; do
    if ! value_of "$name" | grep -Eq '^[[:space:]]*[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)[[:space:]]*$'; then
        fail "$name must be a number. Received: $(value_of "$name")"
    fi
done

# The app is served from the web root: the built asset URLs start with "/".
if is_set VITE_BASE_URL && [ "$(value_of VITE_BASE_URL)" != "/" ]; then
    fail "VITE_BASE_URL must be \"/\" or unset; this image serves the app from the web root. Received: $(value_of VITE_BASE_URL)"
fi

# jq writes the values as JSON, so quotes and backslashes in a value are safe.
{
    printf 'window.__TOSCA_CONFIG__ = '
    jq -n 'env | with_entries(select((.key | startswith("VITE_")) and .value != ""))'
    printf ';\n'
} > "$CONFIG_FILE.tmp"
mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"

echo "tosca config: wrote $CONFIG_FILE"
