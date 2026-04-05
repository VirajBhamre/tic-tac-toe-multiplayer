# Nakama + bundled TypeScript runtime. nginx on 7350 proxies to Nakama on 7349 and adds CORS
# (fixes browser preflight when Origin is missing or edge strips upstream CORS headers).
# Build: docker build -t tic-tac-toe-nakama .
# Run:  docker run --rm -e NAKAMA_DATABASE_ADDRESS='...' -p 7350:7350 -p 7351:7351 ...

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

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist /nakama/data/modules
COPY deploy/nakama-proxy.conf /etc/nginx/nginx.conf
COPY deploy/nakama-entrypoint.sh /nakama-entrypoint.sh
RUN chmod +x /nakama-entrypoint.sh

EXPOSE 7350 7351

ENTRYPOINT ["/nakama-entrypoint.sh"]
