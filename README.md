# Multiplayer Tic-Tac-Toe (Nakama)

Real-time, server-authoritative tic-tac-toe built with [Nakama](https://heroiclabs.com/docs/nakama/) (TypeScript runtime), PostgreSQL, and a React + Vite web client. Ranked matchmaking, Elo-style ratings, leaderboards, classic and timed modes, and optional hosting keepalives for idle-sleeping platforms.

---

## Setup and installation

### Prerequisites

- **Node.js** (current LTS recommended) and npm  
- **Docker** and **Docker Compose**

### 1. Clone and install backend tooling

From the repository root:

```bash
npm install
```

This installs the Nakama runtime toolchain (`esbuild`, `typescript`, `jest`, `nakama-runtime` types) used to bundle server code.

### 2. Configure environment for Docker

Copy the root example env file and adjust if needed:

```bash
cp .env.example .env
```

`docker-compose` reads `.env` for Postgres credentials and the Nakama database connection string. Do not commit `.env`.

### 3. Build the Nakama JavaScript bundle

Nakama loads runtime code from `./dist` (mounted into the container as `/nakama/data/modules`). You must build before (or after) starting containers whenever you change server code:

```bash
npm run build
```

This runs `esbuild` on `nakama/modules/main.ts` and outputs `dist/index.js`.

### 4. Start Postgres and Nakama

```bash
docker compose up
```

(or `docker-compose up` on older installs)

- **API / client port:** `7350`  
- **Nakama console (if enabled in your image usage):** often `7351` — see [Nakama docs](https://heroiclabs.com/docs/nakama/getting-started/install/docker/) for your image version.

Wait until Postgres is healthy and Nakama finishes migrations; the bundled module logs something like `tic_tac_toe backend loaded`.

### 5. Web client

```bash
cd public
npm install
cp .env.example .env
```

Edit `public/.env` so the browser can reach Nakama (defaults assume local Docker):

- `VITE_NAKAMA_HOST` — e.g. `127.0.0.1` (use the machine’s LAN IP if testing from another device; Vite is configured with `host: true` for LAN access)
- `VITE_NAKAMA_PORT` — `7350` by default
- `VITE_NAKAMA_SERVER_KEY` / `VITE_NAKAMA_HTTP_KEY` — must match your Nakama server (Docker defaults: `defaultkey` / `defaulthttpkey`)
- `VITE_NAKAMA_USE_SSL` — `true` only when the client talks to Nakama over HTTPS

Run the dev server:

```bash
npm run dev
```

Production build of the SPA:

```bash
npm run build
npm run preview   # optional local preview
```

### 6. Typecheck and unit tests (root)

```bash
npm run typecheck
npm test
```

---

## Architecture and design decisions

### Server-authoritative gameplay

- **Single source of truth:** All board updates, win/draw, timeouts, and disconnect handling run in the Nakama **match handler** (`nakama/match/tictactoe.ts`).
- **Pure game logic:** Rules live in `nakama/match/gameLogic.ts` (validate moves, apply moves, winner/draw, timers, idempotency via `clientMoveId`) with **no** Nakama imports — fully unit tested under `tests/`.
- **Thin orchestration:** The match loop validates input, applies logic, broadcasts snapshots, and delegates finished-game persistence to `nakama/match/postGameCommit.ts` (Elo, stats, leaderboard).

### RPC-only HTTP surface (no extra REST app)

All custom HTTP entry points are **Nakama RPCs** registered in `nakama/modules/main.ts`. Each logical RPC is also registered under a **lowercase alias** for HTTP clients. There is no separate Express/Spring API.

### Real-time transport

- Clients use **Nakama’s WebSocket** (`@heroiclabs/nakama-js`) for match join, state sync, and sending moves.
- **Match data opcodes** (keep in sync with `public/src/constants/matchProtocol.ts` and `nakama/match/tictactoe.ts`):  
  - `1` — full state snapshot  
  - `2` — player move  
  - `3` — rejected move / error hint  

### Matchmaking vs manual rooms

- **Ranked:** Clients call `addMatchmaker` with query properties (`game: tictactoe`, `game_mode`, `rating`). `nakama/modules/matchmakerMatched.ts` creates an authoritative match when Nakama pairs players.
- **Casual / lobby:** `createMatch` RPC creates a match with `rated: false` from the client; a second player joins via `joinMatch` RPC ack + socket `joinMatch`. Open games are discoverable via `listOpenMatches` (matches expose a JSON **label** with `open`, `name`, `mode`).

### Data and persistence

- User-facing stats and ratings use **Nakama storage** helpers (`nakama/lib/*`).
- Leaderboard and some reads use **`nk.sqlQuery` / `nk.sqlExec`** against Nakama-managed tables (documented pattern in this project only for those cases).
- **No** second database connection or ORM beyond what Nakama provides.

### Client application

- React SPA under `public/`, single hook `useTicTacToeGame` for session, socket, lobby, and match flow.
- **Auth:** Email registration via `authenticateEmail`; sign-in with email uses the same; sign-in with **username** uses unauthenticated RPC `signInWithIdentifier` over HTTP with the **runtime HTTP key** (see configuration below).
- After first login, users may need **username onboarding** (`getProfileStatus` / `setUsernameAndOnboard`) before creating or joining matches.

---

## Deployment process documentation

### Typical production layout

1. **PostgreSQL** — managed or containerized; create DB and user matching `NAKAMA_DATABASE_ADDRESS`.
2. **Nakama** — official image (this repo pins `heroiclabs/nakama:3.37.0` in `docker-compose.yml`; align versions in production).
3. **Runtime bundle** — run `npm ci && npm run build` in CI/CD; deploy the resulting `dist/` (or bake into an image that copies `dist` to the path Nakama’s `--runtime.path` expects).
4. **Web client** — build `public/` (`npm run build`) and host the static output behind HTTPS; set `VITE_*` at **build time** (Vite inlines them).

### Docker Compose–style startup (reference)

The provided `docker-compose.yml`:

- Runs `nakama migrate up` before starting the server.
- Mounts `./dist:/nakama/data/modules`.
- Passes `--session.token_expiry_sec 7200` and debug logging (tune for production).

Replace default keys, restrict network exposure, and use TLS termination in front of Nakama for anything beyond local development.

### Idle hosting (e.g. free tiers that sleep)

**Server-side:** If `KEEPALIVE_ORIGIN` and `KEEPALIVE_HTTP_KEY` are set in the Nakama runtime environment, `nakama/modules/keepalive.ts` periodically POSTs to `POST {origin}/v2/rpc/ping?http_key=...&unwrap=` so the host sees traffic. Optional `KEEPALIVE_INTERVAL_SEC` (minimum 60 seconds enforced in code).

**Client-side:** If `VITE_HOSTING_KEEPALIVE=true` in `public/.env`, the SPA periodically pings the same `ping` RPC while the tab is open (`public/src/main.tsx` → `hostingKeepalive.ts`).

---

## API and server configuration

### Nakama ports (this project’s Compose)

| Port | Use |
|------|-----|
| **7350** | Client API (HTTP + realtime) |
| **7351** | Often used for console/metrics depending on deployment; verify for your image |

### Keys (local Docker defaults)

- **Server key** (client SDK): `defaultkey` — set as `VITE_NAKAMA_SERVER_KEY`.
- **HTTP key** (RPC over HTTP, e.g. `signInWithIdentifier`, `ping`): `defaulthttpkey` — set as `VITE_NAKAMA_HTTP_KEY`.

**Production:** Change these in Nakama configuration and mirror them in the client build env. Never commit real secrets.

### Root `.env` (Compose)

| Variable | Purpose |
|----------|---------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres container |
| `NAKAMA_DATABASE_ADDRESS` | Nakama DB DSN (e.g. `user:pass@postgres:5432/dbname`) |
| `KEEPALIVE_ORIGIN` | Optional public base URL for self-ping |
| `KEEPALIVE_HTTP_KEY` | Must match Nakama runtime HTTP key |
| `KEEPALIVE_INTERVAL_SEC` | Optional; default 300 |

### RPC summary

All require an authenticated session **except** `signInWithIdentifier` and `ping` (HTTP key for unauthenticated calls).

| RPC id (aliases) | Role |
|------------------|------|
| `createMatch` / `creatematch` | Body: `{ rated?, mode?, moveTimeLimitSec? }` → `{ matchId }` |
| `joinMatch` / `joinmatch` | Body: `{ matchId }` — ack before socket join |
| `getRating` / `getrating` | Current user rating snapshot |
| `listOpenMatches` / `listopenmatches` | Body: `{ mode?: "classic" \| "timed" }` — open casual matches |
| `getLeaderboard` / `getleaderboard` | Body: `{ limit?, offset? }` |
| `getMyStats` / `getmystats` | Career stats + rank |
| `signInWithIdentifier` / `signinwithidentifier` | Body: `{ identifier, password }` — HTTP key; returns session token JSON |
| `getProfileStatus` / `getprofilestatus` | Onboarding flag |
| `checkUsernameAvailable` / `checkusernameavailable` | Body: `{ username }` |
| `setUsernameAndOnboard` / `setusernameandonboard` | Body: `{ username }` |
| `changePassword` / `changepassword` | Body: `{ oldPassword, newPassword }` (email accounts) |
| `ping` | Health / keepalive; `POST /v2/rpc/ping?http_key=...&unwrap=` body `{}` |

Match module name: **`tic_tac_toe`** (`nakama/match/constants.ts`). Tick rate: **5 Hz** (`MATCH_TICK_RATE`).

---

## How to test the multiplayer functionality

### Automated tests (game logic)

From the repo root:

```bash
npm test
```

Covers `gameLogic`, rating/stats helpers, timers/modes, and match-related isolation — **no** live Nakama server required.

### Manual end-to-end (two clients)

1. Complete **Setup** so Nakama and one dev client are running.
2. **Register two accounts** (e.g. two different emails) — use a normal window and a **private/incognito** window, or two browsers, so sessions stay separate.
3. **Complete username onboarding** for both if prompted.
4. **Casual game:**  
   - Player A: create a game (lobby).  
   - Player B: refresh open matches or paste the **match id** Player A shares, then join.  
   - Play moves; confirm both see the same board and that illegal moves show a reject path (server opcode `OP_REJECT`).
5. **Ranked queue:**  
   - Both click ranked match for the same mode (classic or timed).  
   - When the matchmaker pairs them, both should land in the same match automatically.  
   - After the game ends, check rating/leaderboard updates if `rated` was true (ranked path).

### LAN or remote Nakama

Point `VITE_NAKAMA_HOST` at the host reachable from the device (not `localhost` on another machine). Ensure firewalls allow **7350** (and TLS/wss if using SSL). The Vite dev server listens on all interfaces (`host: true`) so phones on the same Wi‑Fi can load the UI.

### Troubleshooting quick checks

- Empty or stale **`dist/`** — run `npm run build` at the repo root.  
- Client **401 / connection errors** — server key, HTTP key, host, port, and SSL flag must match the running Nakama.  
- **`username_onboarding_required`** — finish profile setup via the UI RPCs before match actions.

---

## Project layout (high level)

```
nakama/modules/     # InitModule, RPCs, matchmaker hook, keepalive
nakama/match/       # Match handler, gameLogic, post-game commit, types
nakama/lib/         # Storage / SQL helpers for profile, stats, leaderboard
public/src/         # React app, Nakama client, hooks, RPC wrappers
tests/              # Jest tests for pure logic
dist/               # Generated Nakama bundle (gitignored — build output)
```
