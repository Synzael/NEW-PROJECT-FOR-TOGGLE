# Human Voice Risk Editor

A writing tool that analyzes your text for patterns commonly flagged by AI-detection systems and offers stylistic, meaning-preserving edits to reduce false positives. This is designed for editing your **own original writing** — not for disguising AI-generated text.

## How It Works

1. **Paste your draft** into the editor (up to 10,000 words)
2. **Optionally provide a style sample** of your natural writing so suggestions match your voice
3. **Click Analyze** — the server runs heuristic analysis across five risk dimensions
4. **Review suggestions** — accept or reject each one inline; risk scores update in real time
5. **Compare before/after** using the side-by-side diff view

### Risk Metrics

| Metric | What It Measures |
|---|---|
| **Perplexity Risk** | Word repetition and predictability (entropy-based) |
| **Burstiness Risk** | Sentence length variation — uniform length looks synthetic |
| **Sentence Pattern Diversity** | How often sentences start the same way |
| **Vocabulary Predictability** | Overuse of common words and hedge words |
| **Overall Detection Risk** | Weighted combination of all four metrics (0-100) |

### Suggestion Types

- **Vary sentence length** — splits overly uniform sentence runs
- **Swap predictable phrasing** — replaces templated phrases ("in conclusion", "furthermore")
- **Add stylistic texture** — inserts parentheticals for a human-sounding aside
- **Diversify openers** — rewrites repetitive sentence starts
- **Reduce hedging uniformity** — trims excessive hedge words (may, might, perhaps)

## Tech Stack

- **Frontend:** React 19, Vite 7, Tailwind CSS 3
- **Backend:** Express 5, Compromise NLP
- **Diffing:** `diff` library for side-by-side comparison

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Local Development

```bash
npm install
npm install --prefix client
npm install --prefix server
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:8787

The Vite dev server proxies `/api` requests to the Express backend automatically.

### Production Build

```bash
npm run build
npm start
```

Builds the client to `client/dist/` and starts the Express server on port 8787, which serves both the API and the static frontend.

## Docker

### Production (recommended for Windows)

```bash
docker compose --profile prod up --build
```

Opens at http://localhost:8787. Double-click `start.bat` on Windows as a shortcut.

### Development (with hot reload)

```bash
docker compose --profile dev up
```

- Client: http://localhost:5173 (HMR enabled)
- Server: http://localhost:8787 (nodemon auto-restart)

## Project Structure

```
.
├── package.json            # Root orchestrator (concurrently)
├── Dockerfile              # Multi-stage production build
├── docker-compose.yml      # Dev and prod profiles
├── start.bat               # Windows double-click launcher
├── client/
│   ├── src/
│   │   ├── App.jsx         # Main UI — editor, metrics, suggestions, diff
│   │   ├── main.jsx        # React entry point
│   │   └── index.css       # Tailwind + custom theme variables
│   ├── vite.config.js      # Dev server, proxy, Docker settings
│   └── tailwind.config.js  # Custom colors, fonts
└── server/
    └── index.js            # Express API — /api/health, /api/analyze
```

## API

### `GET /api/health`

Returns `{ ok: true, message: "Analyzer API is running" }`.

### `POST /api/analyze`

**Body:**
```json
{
  "text": "Your draft text here...",
  "styleSample": "Optional sample of your natural writing style"
}
```

**Response:** Risk metrics (0-100 per dimension), risk bands (low/moderate/high), text insights, up to 20 actionable suggestions with inline replacement coordinates, and an optional style profile.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8787` | Server port |
| `NODE_ENV` | — | Set to `production` to serve static files and disable CORS |
| `VITE_API_TARGET` | `http://localhost:8787` | API proxy target for Vite dev server (used in Docker) |
