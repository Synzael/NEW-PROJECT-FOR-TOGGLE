# ---- Stage 1: Install dependencies and build client ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY client/package.json client/package-lock.json* client/
RUN npm ci --prefix client

COPY server/package.json server/package-lock.json* server/
RUN npm ci --prefix server --omit=dev

COPY client/ client/
COPY server/ server/

RUN npm run build --prefix client

# ---- Stage 2: Production runtime ----
FROM node:20-alpine

RUN apk add --no-cache wget \
  && addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app/server

COPY --from=builder --chown=appuser:appgroup /app/server/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/server/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/server/index.js ./index.js
COPY --from=builder --chown=appuser:appgroup /app/client/dist ./public

USER appuser

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/api/health || exit 1

CMD ["node", "index.js"]
