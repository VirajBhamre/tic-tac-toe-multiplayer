# Multiplayer Tic-Tac-Toe (Nakama)

## Setup (local)

1. Build the runtime module: `npm install && npm run build` (outputs `dist/index.js`).
2. Start Postgres + Nakama: `docker compose up` from the repo root.
3. After changing `dist/index.js`, **restart the Nakama container** so it reloads RPCs and match handlers: `docker compose restart nakama` (or `docker compose up --force-recreate nakama`). If you skip this, new RPCs return **404** until Nakama restarts.
4. Frontend: `cd public && npm install && npm run dev` — configure `public/.env` with your Nakama host, port, and server key.

## Architecture

- **Server-authoritative** match handler (`nakama/match/tictactoe.ts`) validates moves via pure rules in `nakama/match/gameLogic.ts`.
- **Concurrent games**: each match is a separate authoritative Nakama match with isolated in-memory state; there is no shared board between rooms. See `tests/matchIsolation.test.ts`.
- **Ratings**: Elo stored per user in Nakama storage (`nakama/lib/ratingStorage.ts`).
- **Career stats**: wins / losses / draws / streak in Nakama storage (`nakama/lib/statsStorage.ts`), synced to a **Nakama leaderboard** (`tic_tac_toe_wins`) for global ranking.
- **Open rooms**: `listOpenMatches` RPC wraps `nk.matchList` and filters matches whose label marks them open.

## Testing

- `npm test` — Jest unit tests for game logic, Elo, stats, timers, and isolation.

## Deployment

- Run Nakama + Postgres on your host or cloud VM; mount the built `dist/index.js` module as in `docker-compose.yml`.
- Point the frontend `VITE_*` env vars at the public HTTP/WS endpoints for your Nakama instance.
