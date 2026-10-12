FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @fieldtwin/web --include-workspace-root=false
COPY apps/web apps/web
COPY scripts/prepare-assets.mjs scripts/prepare-assets.mjs
RUN npm run build --workspace @fieldtwin/web
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY infra/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
