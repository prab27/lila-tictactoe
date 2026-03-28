# LILA — Multiplayer Tic-Tac-Toe

A production-ready multiplayer Tic-Tac-Toe game with **server-authoritative architecture** built on [Nakama](https://heroiclabs.com/nakama/) game server.

## Features

| Feature | Status |
|---|---|
| Server-authoritative game logic | ✅ |
| Real-time move validation & broadcast | ✅ |
| Automatic matchmaking | ✅ |
| Classic & Timed game modes | ✅ |
| 30-second turn timer with auto-forfeit | ✅ |
| Global leaderboard (wins) | ✅ |
| Multiple concurrent game sessions | ✅ |
| Graceful disconnect handling | ✅ |
| Mobile-responsive dark UI | ✅ |
| Anonymous authentication | ✅ |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│   React + TypeScript + @heroiclabs/nakama-js │
│   Mobile-first responsive SPA                │
└──────────────┬──────────────────────────────┘
               │  WebSocket (real-time)
               │  HTTP REST (auth, RPC, leaderboard)
┌──────────────▼──────────────────────────────┐
│            Nakama Game Server                │
│   TypeScript Runtime (server-authoritative)  │
│   ┌──────────────────────────────────────┐  │
│   │  Match Handler (tictactoe)            │  │
│   │  • matchInit   • matchJoin            │  │
│   │  • matchLoop   • matchLeave           │  │
│   │  • Move validation & win detection    │  │
│   │  • Timer management (timed mode)      │  │
│   └──────────────────────────────────────┘  │
│   ┌──────────────────────────────────────┐  │
│   │  RPC Functions                        │  │
│   │  • find_match  • create_match         │  │
│   │  • get_leaderboard                    │  │
│   └──────────────────────────────────────┘  │
│   ┌──────────────────────────────────────┐  │
│   │  Leaderboard (global_wins)            │  │
│   └──────────────────────────────────────┘  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│             PostgreSQL 14                    │
│   Persistent storage for sessions,           │
│   users, leaderboards, match data            │
└─────────────────────────────────────────────┘
```

### Design Decisions

1. **Server-authoritative**: All game logic runs on Nakama. The client only sends moves; the server validates and broadcasts state.
2. **Match handler pattern**: Nakama's authoritative match handler provides the game loop, state isolation, and real-time broadcast.
3. **Anonymous authentication**: Players authenticate with a persistent device ID — no sign-up required.
4. **Op codes**: Binary messages with op codes (1–7) for efficient real-time communication.
5. **Graceful disconnection**: If a player leaves mid-game, the opponent wins automatically.

---

## Local Development

### Prerequisites
- [Docker](https://www.docker.com/) + Docker Compose
- Node.js 18+
- npm

### Step 1: Build the Nakama Backend

```bash
cd backend
npm install
npm run build
# This compiles TypeScript → build/index.js (loaded by Nakama)
```

### Step 2: Start Nakama + PostgreSQL

```bash
# From project root
docker compose up -d

# Watch logs
docker compose logs -f nakama
# Wait for: "TicTacToe module loaded successfully"
```

Nakama endpoints:
- **HTTP API**: http://localhost:7350
- **Console UI**: http://localhost:7351 (admin / password)

### Step 3: Start the Frontend

```bash
cd frontend
npm install
cp .env.example .env    # Uses localhost:7350 by default
npm start
# Opens http://localhost:3000
```

### Step 4: Test Multiplayer

Open two browser tabs at http://localhost:3000:
1. Tab 1: Enter nickname → click "Classic" → wait for match
2. Tab 2: Enter nickname → click "Classic" → match starts!
3. Play the game — moves are validated server-side and broadcast instantly.

---

## Project Structure

```
lila-tictactoe/
├── backend/
│   ├── src/
│   │   └── main.ts          # All Nakama server logic
│   ├── build/               # Compiled JS (generated, loaded by Nakama)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.tsx           # Main app + Nakama integration
│   │   ├── App.css           # Dark mobile-first styles
│   │   ├── components/
│   │   │   ├── Login.tsx     # Nickname entry screen
│   │   │   ├── Menu.tsx      # Mode selection screen
│   │   │   ├── Matchmaking.tsx # Waiting for opponent screen
│   │   │   ├── Game.tsx      # Game board + turn indicator
│   │   │   └── GameOver.tsx  # Result + leaderboard screen
│   │   ├── types/
│   │   │   └── game.ts       # Shared TypeScript types
│   │   └── hooks/
│   │       └── useNakama.ts  # Nakama client hook
│   ├── .env.example
│   └── package.json
├── deploy/
│   └── digitalocean.md      # Cloud deployment guide
├── docker-compose.yml        # Local dev: Nakama + PostgreSQL
├── .gitignore
└── README.md
```

---

## API / Server Configuration

### Environment Variables (Frontend)

| Variable | Default | Description |
|---|---|---|
| `REACT_APP_NAKAMA_HOST` | `localhost` | Nakama server hostname |
| `REACT_APP_NAKAMA_PORT` | `7350` | Nakama HTTP port |
| `REACT_APP_NAKAMA_SSL` | `false` | Use SSL/WSS |
| `REACT_APP_NAKAMA_KEY` | `defaultkey` | Nakama server key |

### RPC Endpoints

| RPC | Payload | Response |
|---|---|---|
| `find_match` | `{ mode: "classic" \| "timed" }` | `{ matchId, mode }` |
| `create_match` | `{ mode: "classic" \| "timed" }` | `{ matchId, mode }` |
| `get_leaderboard` | — | `{ records: [...] }` |

### WebSocket Op Codes

| Code | Name | Direction | Description |
|---|---|---|---|
| 1 | `MAKE_MOVE` | Client → Server | `{ position: 0-8 }` |
| 2 | `GAME_STATE` | Server → Client | Full board + turn state |
| 3 | `GAME_OVER` | Server → Client | Winner/draw result |
| 4 | `TIMER_UPDATE` | Server → Client | `{ timeRemaining }` |
| 5 | `ERROR` | Server → Client | Validation errors |
| 6 | `OPPONENT_LEFT` | Server → Client | Forfeit win |
| 7 | `MATCH_READY` | Server → Client | Match started |

---

## Deployment

See [deploy/digitalocean.md](deploy/digitalocean.md) for full cloud deployment guide.

**Quick summary:**
1. Spin up a DigitalOcean / AWS / GCP VM (2GB RAM min)
2. Install Docker, copy project, build backend (`npm run build`)
3. `docker compose up -d` → Nakama running on port 7350
4. Build frontend with production env pointing to your server IP
5. Deploy `frontend/build/` to Netlify / Vercel / any static host

---

## Testing Multiplayer

1. Open two separate browser windows (or devices on same network)
2. Both enter nicknames and click the same game mode
3. The `find_match` RPC auto-discovers open matches and pairs players
4. All moves are server-validated — no client-side cheating possible
5. Disconnect a tab mid-game → other player wins automatically
6. Win games → check leaderboard on game-over screen

---

## Tech Stack

| Layer | Technology |
|---|---|
| Game Backend | Nakama 3.21 (TypeScript runtime) |
| Database | PostgreSQL 14 |
| Frontend | React 18 + TypeScript |
| Client SDK | @heroiclabs/nakama-js |
| Containerization | Docker + Docker Compose |
| Styling | CSS (mobile-first dark theme) |
