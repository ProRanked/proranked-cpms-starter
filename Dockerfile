# ── Stage 1: build the SPA ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY . .
# Build-time fallbacks (a deployment can instead overwrite /config.js at runtime — see public/config.js).
ARG VITE_OIDC_AUTHORITY=https://id-lab.phevnix.cloud
ARG VITE_OIDC_CLIENT_ID=proranked-cpms-spa
ARG VITE_CPMS_API_BASE=https://cpo.phevnix.cloud
ARG VITE_OIDC_RESOURCE=https://api.proranked.cloud/cpms/v1
ENV VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY \
    VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID \
    VITE_CPMS_API_BASE=$VITE_CPMS_API_BASE \
    VITE_OIDC_RESOURCE=$VITE_OIDC_RESOURCE
RUN npm run build

# ── Stage 2: serve via nginx ──────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
# config.js is a normal static asset — a k8s ConfigMap can mount over /usr/share/nginx/html/config.js
# to re-point identity/API per deployment without rebuilding.
CMD ["nginx", "-g", "daemon off;"]
