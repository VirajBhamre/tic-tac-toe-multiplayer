#!/bin/sh
set -e
/nakama/nakama migrate up --database.address "$NAKAMA_DATABASE_ADDRESS"
/nakama/nakama \
  --name nakama1 \
  --database.address "$NAKAMA_DATABASE_ADDRESS" \
  --logger.level INFO \
  --session.token_expiry_sec 7200 \
  --runtime.path /nakama/data/modules \
  -socket.port 7349 \
  --runtime.env "KEEPALIVE_ORIGIN=$KEEPALIVE_ORIGIN" \
  --runtime.env "KEEPALIVE_HTTP_KEY=$KEEPALIVE_HTTP_KEY" \
  --runtime.env "KEEPALIVE_INTERVAL_SEC=${KEEPALIVE_INTERVAL_SEC:-300}" &
exec nginx -g "daemon off;"
