# FRED Copilot

An LLM-powered chatbot that answers questions about U.S. economic data. Ask a
question in plain English ("What has happened to the federal funds rate since
2020?") and the agent looks up the right series in the [FRED API](https://fred.stlouisfed.org/docs/api/fred/),
fetches the data, and explains it.

Built with Next.js (App Router) + TypeScript and the Anthropic Claude API using
a tool-using agent loop.

## What's been built

- **Chat web UI** — a single-page chat interface (`components/Chat.tsx`) with
  starter prompts, loading state, error handling, and Enter-to-send.
- **Tool-using agent** (`lib/fred/fred-agent.ts`) — a Claude agent loop that:
  - exposes four FRED tools to the model
  - executes tool calls, feeds results back, and iterates until the model
    produces a final answer (capped at `MAX_TURNS`)
  - returns the answer plus a log of every tool call made
- **FRED API client** (`lib/fred/fred-tools.ts`) — four typed wrappers around the
  FRED REST API:
  | Tool | FRED endpoint | Purpose |
  |------|---------------|---------|
  | `searchSeries` | `/series/search` | Find candidate series by keyword (disambiguation) |
  | `getSeriesInfo` | `/series` | Fetch metadata (units, frequency, date range) for a known series |
  | `getSeriesData` | `/series/observations` | Fetch the actual time-series observations |
  | `getRelease` | `/release/series` | List series grouped in a FRED data release |
- **Chat API route** (`app/api/chat/route.ts`) — `POST /api/chat` accepts a
  user message, runs the agent, and returns the answer + tool calls. This is what
  the web UI talks to.
- **Test API route** (`app/api/test-fred/route.ts`) — `POST /api/test-fred` for
  exercising the agent directly without the UI.

### Notable implementation details

- **Disambiguation rule** — the agent is instructed (in both the system prompt
  and the `search_series` tool description) to never guess a `series_id` and to
  search first when uncertain.
- **Missing-data handling** — FRED uses `"."` for missing values; `getSeriesData`
  converts these to `null` so the model doesn't parse them as numbers.
- **Revision metadata stripped** — `realtime_start`/`realtime_end` are dropped
  from observations to reduce token noise (we always use the latest vintage).
- **Error surfacing** — FRED returns `400` with a JSON `error_message`; the tools
  parse and surface that instead of an opaque status code.

## Project structure

```
fred-copilot/
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # POST /api/chat — UI talks to this
│   │   └── test-fred/route.ts   # POST /api/test-fred — direct agent testing
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                 # Home page, renders <Chat />
├── components/
│   ├── Chat.tsx                 # Chat UI (state, input, message list)
│   └── MessageBubble.tsx        # Single message rendering
├── lib/
│   ├── chat-types.ts            # Shared UI message/response types
│   └── fred/
│       ├── fred-agent.ts        # Claude agent loop + tool definitions
│       └── fred-tools.ts        # FRED API wrappers + types
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

## Getting started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- A [FRED API key](https://fred.stlouisfed.org/docs/api/api_key.html) (free)

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=your_anthropic_key
FRED_API_KEY=your_32_char_fred_key
CLAUDE_MODEL=claude-sonnet-4-6   # optional; overrides the default
```

3. Run the dev server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) and ask a question.

> Note: Next.js only loads `.env` at startup. Restart the dev server after
> changing environment variables.

## How it works

```
User question
   │
   ▼
POST /api/chat ──► runFredAgent()
                       │
                       ▼
              ┌─── Claude (with tools) ───┐
              │                           │
       stop_reason = tool_use      stop_reason = end_turn
              │                           │
              ▼                           ▼
       run FRED tool(s)            return final answer
       append results              + tool-call log
              │                           │
              └──────── loop ─────────────┘
```

## Future improvements

### 1. Multi-turn conversation support

Today `runFredAgent(question: string)` starts a fresh message history on every
call — there's no memory across user messages. To make the chat conversational:

- Change the agent signature to accept prior history, e.g.
  `runFredAgent(messages: Anthropic.MessageParam[])`.
- Persist the conversation (client state and/or server-side store) and pass it
  back on each request.
- Append the assistant's final answer to history so follow-ups like "and how
  does that compare to 2008?" work without re-stating context.

### 2. Token usage & cost tracking + eval dashboard

The Anthropic API returns `usage` (input/output tokens) on every response, but
we currently discard it. To track cost:

- Accumulate `response.usage.input_tokens` / `output_tokens` across the agent
  loop and return them from `runFredAgent` (alongside `turns` and `toolCalls`).
- Map tokens → dollar cost using per-model pricing.
- Surface per-conversation usage/cost in the UI, and feed it into an **eval
  dashboard** that tracks cost, latency, turn count, and answer quality across
  runs.

### Other ideas

- **Streaming responses** — stream tokens to the UI instead of waiting for the
  full answer.
- **Charts** — render fetched time series as line charts rather than text only.
- **Caching** — cache FRED responses to cut latency and API calls.
- **Series-data truncation** — long daily series can blow up the context window;
  downsample or summarize before feeding back to the model.
```
