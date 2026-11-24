# Site Summariser

Paste a link to any public article and get a short AI summary: a headline, a TL;DR and the key points. Built with Angular 22 (SSR) and a small Express API in the same app, using Gemini in the cloud or Gemma 4 running locally through Ollama.

- **Live demo:** [Demo URL](https://site-summariser.vercel.app/)
- **Demo video:** _add link here_

<!-- Screenshot: add docs/screenshot.png and uncomment
![Site Summariser](docs/screenshot.png)
-->

## Features

- Summarise any public web page in three styles: **TL;DR**, **Bullets** or **Detailed**
- Choose the AI model: **Gemini** (cloud) or **Gemma 4** (local, through Ollama). Models that aren't set up are greyed out, with the reason
- Clean summary card: site and favicon, headline, TL;DR, key points, reading time, which model answered and how long it took, link to the original
- **Long pages** are summarised in parts (up to 4 for Gemini, 3 for Gemma), then combined
- Clear loading state with an elapsed-time counter, and a specific message for every kind of failure
- Copy the summary as plain text or Markdown
- History of your last 10 summaries (stored in your browser), click to reopen
- Dark mode (follows your system), keyboard-friendly, screen-reader announcements for results and errors
- Server-side protection against fetching internal addresses (SSRF)

## How it works

```text
Browser (Angular 22: signals, httpResource, Signal Forms)
   │  GET  /api/providers                       which models can be used right now
   │  POST /api/summarise { url, mode, provider }
   ▼
Express API inside the Angular SSR server (src/server.ts)
   1. validate the request                      → 400 INVALID_URL / INVALID_REQUEST
   2. SSRF guard: scheme, port, DNS lookup      → 403 BLOCKED_URL
   3. fetch the page (10 s, HTML only, ≤ 2 MB)  → 502 FETCH_FAILED / 504 TIMEOUT
   4. extract the article (Readability + jsdom) → 422 NO_CONTENT
   5. long page? split at sentence boundaries → notes per part (map, in parallel for Gemini)
   6. Genkit → Gemini or Gemma (structured JSON; long page: summary of the notes)
                                                → 503 AI_UNAVAILABLE / PROVIDER_UNAVAILABLE
                                                   422 NOT_SUMMARISABLE
   7. add reading time + metadata, return JSON
```

**Why there is a backend at all:**

- **CORS:** browsers don't allow a page to read other websites, so the page can't be fetched from the browser.
- **Secrets:** an API key in frontend code is public. The key stays on the server.
- **Safety:** the server checks every URL and every redirect so it can't be used to reach internal addresses such as cloud metadata at `169.254.169.254`.

**Why one app instead of separate client and server:** Angular SSR already runs an Express server, so the API lives there. That means one install, one deploy, and no CORS setup, and the browser bundle never includes server code.

## Tech stack

| Layer      | Choice                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Frontend   | Angular 22: standalone components, signals, `httpResource`, Signal Forms, zoneless, OnPush (the default), SSR with prerendering |
| Styling    | Tailwind CSS 4 with design tokens for light and dark mode                                                                       |
| Backend    | Express 5 inside the Angular SSR server, TypeScript                                                                             |
| Extraction | `@mozilla/readability` + `jsdom`                                                                                                |
| AI         | [Genkit](https://genkit.dev) with the Google GenAI plugin (Gemini) and a small custom Genkit model for Ollama (Gemma 4)         |
| Validation | `zod` for requests, Genkit schemas for model output                                                                             |
| Tests      | Vitest: `ng test` for the Angular app, plain Vitest for the server                                                              |
| Deploy     | Vercel (static files on the CDN, everything else in one Vercel Function)                                                        |

## Getting started

**Requirements:** Node.js 22.12 or newer (developed on Node 24), npm.

```bash
npm install
cp .env.example .env      # then fill in the values below
npm start                 # http://localhost:4200 (dev server, includes the API)
```

#### .env

| Variable                                          | What it does                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                                  | Gemini key, free from [Google AI Studio](https://aistudio.google.com/apikey). Without it, Gemini is greyed out          |
| `GEMINI_MODEL`                                    | Default `gemini-flash-lite-latest` (fast)                                                                               |
| `GEMINI_FALLBACK_MODEL`                           | Default `gemini-3.6-flash`: tried on the retry if the main model fails, is overloaded or times out. `none` turns it off |
| `DEFAULT_PROVIDER`                                | `gemini` or `ollama`: which model the UI selects first                                                                  |
| `OLLAMA_SERVER`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX` | Local model settings (defaults: `http://127.0.0.1:11434`, `gemma4:e2b`, `8192`)                                         |

#### Optional: local model with Ollama

```bash
# install Ollama from https://ollama.com, then:
ollama pull gemma4:e2b
```

The app checks whether Ollama is running and has the model, and greys out the option with the exact fix if not. Without Ollama, everything works with Gemini.

#### Other commands

```bash
npm run build          # production build (browser + server)
npm run start:prod     # run the production build on http://localhost:4000
npm run test:server    # server tests (Node)
npm test               # Angular tests
npm run test:all       # both
```

## How AI was used

### In the product

- **Genkit as the AI layer.** One `ai.generate()` call serves both models; the request's `provider` only changes which model is called. Everything that differs per model (timeout, input size, temperature) is in one table: `src/server/ai/providers.ts`.
- **Structured output.** The model must return JSON matching a schema (`title`, `tldr`, `keyPoints`). Gemini enforces the schema; for Ollama the schema is passed as Ollama's `format`, which constrains the output. Counts that the schema can't express (for example "3 key points") are checked in code.
- **One retry, on a fallback model.** If the answer is missing, invalid or has too few points, or the model is overloaded (Gemini sometimes returns 503 "high demand") or times out, the server asks once more with a stricter instruction. For Gemini the retry goes to a fallback model (`gemini-3.6-flash`, a pinned older model with less demand than the `-latest` aliases); the card shows which model answered. Then it returns `AI_UNAVAILABLE`.
- **Prompt** (`src/server/ai/summary.prompt.ts`): use only facts from the page, don't invent names, numbers or quotes, and treat the page text as data, not instructions. The text goes between `<page>` delimiters (and any `</page>` inside it is removed) to reduce prompt injection. Non-articles (login or error pages) return `NOT_SUMMARISABLE`.
- **Modes:** TL;DR (2–3 sentences, 3 points), Bullets (1 sentence, 5–7 points), Detailed (a paragraph, up to 8 points).
- **Long pages (map-reduce).** Text is split at sentence boundaries into parts of the model's input size (~12,000 characters for Gemini, ~8,000 for Gemma). Each part is turned into short notes (in parallel for Gemini, one by one for the local model), then the notes are summarised in the chosen mode. A part that fails is skipped; the card says when a page was summarised in parts, or when some of it isn't covered (more than 4 / 3 parts, or a skipped part). One deadline per request keeps Gemini under Vercel's 60 s limit.
- **Reading time** is calculated on the server from the word count (about 200 words a minute), not guessed by the model.
- **Why a custom Ollama model instead of the `genkitx-ollama` plugin:** the plugin can't send Ollama's `think` and `format` options. With thinking left on, a summary took 70–90 s on CPU; with `think: false` it takes 15–25 s, and `format` made every answer valid JSON in testing.

### In development

_Describe honestly which AI tools you used while building this and for what (for example planning, research, code, tests), and what you wrote, checked or changed yourself._

## API

`POST /api/summarise`

```json
{ "url": "https://example.com/article", "mode": "tldr", "provider": "gemini" }
```

`mode` is `tldr`, `bullets` or `detailed`. `provider` is optional (`gemini` or `ollama`).

Success:

```json
{
  "source": { "url": "...", "siteName": "...", "title": "...", "favicon": "..." },
  "summary": { "title": "...", "tldr": "...", "keyPoints": ["..."], "readingTimeMin": 5 },
  "meta": {
    "provider": "gemini",
    "model": "gemini-flash-lite-latest",
    "truncated": false,
    "ms": 4174
  }
}
```

Errors always look like `{ "error": { "code": "...", "message": "..." } }`:

| HTTP | Code                              | When                                                             |
| ---- | --------------------------------- | ---------------------------------------------------------------- |
| 400  | `INVALID_URL` / `INVALID_REQUEST` | Not an http(s) address, or bad request body                      |
| 403  | `BLOCKED_URL`                     | Localhost, private or link-local address, non-default port       |
| 422  | `NO_CONTENT`                      | Under ~200 words of readable text (often a JavaScript-only site) |
| 422  | `NOT_SUMMARISABLE`                | The model found no article (login page, error page)              |
| 502  | `FETCH_FAILED`                    | Site refused, returned an error, or isn't an HTML page           |
| 503  | `AI_UNAVAILABLE`                  | Model error, rate limit or unusable answer after one retry       |
| 503  | `PROVIDER_UNAVAILABLE`            | The chosen model isn't set up (no key / Ollama not running)      |
| 504  | `TIMEOUT`                         | The page took more than 10 s                                     |

`GET /api/providers` returns which models are available and, if not, why. `GET /api/health` returns `{ "ok": true }`.

## Edge cases handled

| Case                                                                                                                                 | What happens                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Missing `https://`                                                                                                                   | Added automatically                                                                          |
| Malformed address                                                                                                                    | Inline message, submit disabled                                                              |
| Localhost, private IPs, decimal/hex IPs, IPv6 loopback, a public name that resolves to a private IP, redirects to internal addresses | Blocked by the SSRF guard (each redirect hop is checked)                                     |
| IPv6-only networks (NAT64)                                                                                                           | Public sites still work: the IPv4 address inside `64:ff9b::/96` is checked                   |
| Site blocks bots (403/429)                                                                                                           | Retried once with a different User-Agent, then "This site blocks automated access"           |
| JavaScript-only page                                                                                                                 | "This page has too little readable text"                                                     |
| PDF, image or other file                                                                                                             | "Only web pages are supported for now"                                                       |
| Very large page                                                                                                                      | HTML read up to 2 MB; long text summarised in parts; the card says if anything isn't covered |
| Slow site                                                                                                                            | 10 s timeout                                                                                 |
| Model busy, rate-limited, slow or bad JSON                                                                                           | One retry on the fallback model (Gemini), then a message suggesting the other model          |
| Model not set up                                                                                                                     | Option greyed out with the fix; API answers `PROVIDER_UNAVAILABLE` instantly                 |
| Submitting a new URL mid-request                                                                                                     | The old request is cancelled in the browser and on the server                                |

## Project structure

```text
src/
├── server.ts                    Express: /api router → static files → Angular SSR
├── server/                      server-only code (never bundled into the browser)
│   ├── api/                     routes: summarise, providers, router
│   ├── ai/                      Genkit setup, providers table, Ollama model, schema, prompt
│   ├── services/                scraper (fetch + Readability), summarise pipeline
│   ├── utils/                   SSRF guard, truncation, API errors
│   └── config.ts                environment variables
├── shared/api.types.ts          API contract shared by client and server (types only)
└── app/
    ├── core/                    API service (httpResource), error mapping, history store
    ├── features/summariser/     page + url-form, summary-card, loading-skeleton, error-state, history-list
    └── shared/pipes/            readingTime, duration, relativeTime
api/index.mjs                    Vercel Function entry
vercel.json                      Vercel build and routing
```
