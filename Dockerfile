# Nakama + bundled TypeScript runtime (same flags as docker-compose.yml).
# Build: docker build -t tic-tac-toe-nakama .
# Run:  docker run --rm -e NAKAMA_DATABASE_ADDRESS='user:pass@host:5432/db?sslmode=require' -p 7350:7350 ...

FROM node:22-alpine AS builder
RUN apk add --no-cache git

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY nakama ./nakama

RUN npx esbuild nakama/modules/main.ts \
  --bundle --platform=neutral --outfile=dist/index.js --format=esm

FROM heroiclabs/nakama:3.37.0

COPY --from=builder /app/dist /nakama/data/modules

RUN cat <<'SCRIPT' > /docker-entrypoint-nakama.sh && chmod +x /docker-entrypoint-nakama.sh
#!/bin/sh
set -e
/nakama/nakama migrate up --database.address "$NAKAMA_DATABASE_ADDRESS"
exec /nakama/nakama \
  --name nakama1 \
  --database.address "$NAKAMA_DATABASE_ADDRESS" \
  --logger.level INFO \
  --session.token_expiry_sec 7200 \
  --runtime.path /nakama/data/modules \
  --runtime.env "KEEPALIVE_ORIGIN=$KEEPALIVE_ORIGIN" \
  --runtime.env "KEEPALIVE_HTTP_KEY=$KEEPALIVE_HTTP_KEY" \
  --runtime.env "KEEPALIVE_INTERVAL_SEC=${KEEPALIVE_INTERVAL_SEC:-300}"
SCRIPT

EXPOSE 7350 7351

ENTRYPOINT ["/docker-entrypoint-nakama.sh"]
