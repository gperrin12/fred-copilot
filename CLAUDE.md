# CLAUDE.md

Context for AI agents working in this repo. Read this before making changes.

## What this is

**FRED Copilot** — a Next.js (App Router) + TypeScript web app. An LLM chatbot
that answers questions about U.S. economic data by calling the
[FRED API](https://fred.stlouisfed.org/docs/api/fred/) through a tool-using
Claude agent loop.

The flow: user asks a question → Claude agent searches/fetches FRED data via
tools → agent returns a natural-language answer.

## Architecture

```
components/Chat.tsx ──► POST /api/chat ──► runFredAgent() ──► Claude + FRED tools
                                                │
                                          lib/fred/fred-tools.ts (FRED API client)
```

- **`lib/fred/fred-agent.ts`** — the agent. Tool definitions (JSON Schema),
  system prompt, `runTool` dispatcher, and the `runFredAgent` loop. This is the
  core; most agent/tool changes happen here.
- **`lib/fred/fred-tools.ts`** — typed wrappers around four FRED endpoints
  (`searchSeries`, `getSeriesInfo`, `getSeriesData`, `getRelease`) plus the
  request/response types.
- **`app/api/chat/route.ts`** — `POST /api/chat`, the route the UI calls.
- **`app/api/test-fred/route.ts`** — `POST /api/test-fred`, for testing the agent
  without the UI (`{ "question": "..." }`).
- **`components/Chat.tsx`** / **`MessageBubble.tsx`** — the chat UI.
- **`lib/chat-types.ts`** — shared UI types.

## How the agent loop works

`runFredAgent(question)` in `fred-agent.ts`:

1. Calls Claude with the tool definitions and message history.
2. `stop_reason === "tool_use"` → run the requested tools, then append **two**
   messages: the assistant's `tool_use` content, then a user message with the
   `tool_result` blocks. Loop.
3. `stop_reason === "end_turn"` → extract text blocks, return the answer +
   accumulated `toolCalls`.
4. Caps at `MAX_TURNS` (10) to prevent runaway loops.

## Critical conventions & gotchas

- **Message ordering (Anthropic):** a `tool_result` user message MUST be
  immediately preceded by the assistant message containing the matching
  `tool_use` blocks. Pushing tool results without the assistant message first is
  a 400 error. Both pushes happen together in the loop — keep them together.
- **`response.content` is an array of blocks**, not a string. Filter by
  `block.type` (`"text"` vs `"tool_use"`). Never `.toString()` it.
- **FRED quirks:**
  - The search/series response field is `seriess` (double-s). Not a typo.
  - Missing values come back as the string `"."` — convert to `null`.
  - `realtime_start`/`realtime_end` are revision-vintage metadata; we strip them.
    Use `observation_start`/`observation_end` for the time range instead.
  - FRED returns `200` with an `error_message` body for invalid params, and
    `400` (with a JSON `error_message`) for things like a bad/missing API key.
    Tools surface that message, not just the status code.
- **Tool schemas must match `runTool`:** schema uses `snake_case`
  (`series_id`, `observation_start`); the TS functions use `camelCase`. The
  mapping lives in `runTool`'s switch. Required vs optional in the schema must
  match the function signature (e.g. `observation_end` is optional).
- **Disambiguation rule:** the agent must never guess a `series_id` — it searches
  first. This is enforced in both the system prompt and the `search_series` tool
  description. Preserve it when editing prompts.

## Environment

Required in `.env` (project root):

```
ANTHROPIC_API_KEY=...
FRED_API_KEY=...            # 32-char lowercase alphanumeric
CLAUDE_MODEL=claude-sonnet-4-6   # optional; this is the default
```

Next.js loads `.env` only at startup — restart `npm run dev` after changes.
On Vercel, set these in project env vars (local `.env` does not deploy).

## Commands

```bash
npm run dev      # local dev server (localhost:3000)
npm run build    # production build / type-check
npm run lint     # eslint
npx tsc --noEmit # type-check only
```

## Conventions for changes

- TypeScript strict mode is on; keep it type-clean (`npx tsc --noEmit`).
- Tool functions return plain typed objects; `runTool` is responsible for
  `JSON.stringify`-ing results (tool results must be strings).
- Don't send revision metadata or other noise back to the model — keep tool
  outputs lean to save tokens.
- Keep the API routes thin: parse request → call `runFredAgent` → return JSON.
  Agent/tool logic belongs in `lib/fred/`.

## Known limitations / roadmap

See README.md "Future improvements". Two active items:

1. **Multi-turn conversation** — `runFredAgent` currently starts fresh each call
   (no memory). Needs to accept and persist prior message history.
2. **Token usage / cost tracking** — `response.usage` is currently discarded.
   Accumulate it across the loop, map to cost, and surface per-conversation +
   in an eval dashboard.
