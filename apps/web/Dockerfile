FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
ARG SOURCE_REVISION=local
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @fieldtwin/web --include-workspace-root=false
COPY apps/web apps/web
COPY scripts/prepare-assets.mjs scripts/prepare-assets.mjs
RUN npm run build --workspace @fieldtwin/web \
    && printf '{"revision":"%s"}\n' "$SOURCE_REVISION" > /app/apps/web/dist/release.json
FROM nginxinc/nginx-unprivileged:stable-alpine
ARG SOURCE_REVISION=local
LABEL org.opencontainers.image.source="https://github.com/kwakhyun/bangi-map" org.opencontainers.image.revision=$SOURCE_REVISION
COPY infra/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
