# Stage 1: Build TypeScript backend
FROM node:20-alpine AS builder
WORKDIR /build
COPY backend/package*.json ./
RUN npm install
COPY backend/src ./src
COPY backend/tsconfig.json ./
RUN npm run build

# Stage 2: Nakama runtime with compiled JS
FROM registry.heroiclabs.com/heroiclabs/nakama:3.21.1
COPY --from=builder /build/build/index.js /nakama/data/modules/build/index.js
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
