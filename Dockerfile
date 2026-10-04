# Production image: builds the Vite app, then runs the Express/OCPP server.
# Used by deploy/docker-compose.yml for a self-hosted server (e.g. a VPS in
# Uzbekistan, which the personal data law requires for citizens' data).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall would build before the sources are copied; build explicitly below.
RUN npm ci --ignore-scripts
COPY . .
ARG VITE_PLAUSIBLE_DOMAIN
ARG VITE_PLAUSIBLE_SRC
ARG VITE_UMAMI_WEBSITE_ID
ARG VITE_UMAMI_SRC
RUN npx vite build && npm prune --omit=dev --ignore-scripts

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json server.js ./
COPY server ./server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
