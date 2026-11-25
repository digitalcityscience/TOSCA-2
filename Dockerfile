# The build output is static files, the same for every CPU, so this stage runs
# once on the build machine's own architecture even for a multi-platform image.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# No VITE_* values are needed here: the container sets them when it starts.
RUN npm run build

FROM nginx:1.27-alpine AS production

RUN apk add --no-cache jq

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/40-write-config.sh /docker-entrypoint.d/40-write-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
