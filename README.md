# Outention

**Tell your feeds what you want to hear today.**

Outention is an open-source, intention-driven social feed.

Outention asks what you want to hear today, retrieves original posts from your own sources and public discovery, and ranks them around that intention. The model is a courier, not a ghostwriter: Outention shows the original people and posts instead of replacing them with an AI answer.

> Early alpha. The core feed loop works, but connector availability and APIs still vary by platform.

## What works

- Natural-language intentions compiled into an explicit ranking program
- Visible controls for relevance, freshness, familiarity, popularity and author diversity
- Deterministic reranking and pagination without another model call
- OpenAI, Anthropic, Google Gemini and OpenRouter BYOK
- Bluesky Home timeline and public discovery
- Mastodon Home timeline, hashtag discovery and posting
- Threads public keyword discovery through the official Meta OAuth API
- Reddit Home and broad search when approved API credentials are available
- RSS, Atom, podcasts and public YouTube channel feeds
- OPML subscription import and trusted local connector modules
- Hacker News, Yle News and Locationews
- Original text, images, video, audio, link cards and quoted-post context
- Finnish and English UI
- No telemetry

## Quick start with Docker

Requirements: Docker with Compose v2.

```bash
git clone https://github.com/aihiolabs/outention.git
cd outention
docker compose up --build
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173), choose **Settings**, and enter a model provider, model name and API key. Personal Mode saves it to the host-side `./.outention/.env.local` file by default so it survives restarts.

To edit the Docker configuration manually instead of using Settings:

```bash
cp .env.example .outention/.env.local
```

Then edit `MODEL_PROVIDER`, `MODEL_API_KEY` and `MODEL_NAME` in `.outention/.env.local` and restart:

```bash
docker compose up -d --build
```

`.outention/.env.local` is ignored by Git. The Settings screen writes the same host-side file with owner-only permissions. Never commit real API keys.

## Run with Node.js

Requirements: Node.js 20 or newer.

```bash
npm ci
npm start
```

The first run opens `http://127.0.0.1:4173` and guides you through model and source setup. Configuration is stored under `.outention/`, which is ignored by Git. Outention binds to loopback by default.

Once the npm package has been published, the same local experience starts with:

```bash
npx outention@latest
```

See [Installation](docs/INSTALL.md) for provider and connector setup. If you want an AI coding agent to perform or verify the installation, give it [Install with an AI agent](docs/INSTALL-WITH-AI.md).

## Use on a phone

The server stays on your computer, NAS, or private host. Your phone opens that instance over HTTPS and installs the interface as a PWA—there is no terminal installation on iOS or Android.

The first-run wizard includes a guided Tailscale setup. You can reopen it later with the `?` button. See [Mobile access](docs/MOBILE.md) for the private Tailscale route and the more advanced self-hosted HTTPS route.

## Privacy model

Outention Personal does not require an Outention account and does not ship analytics or telemetry. Your intentions, ranking history, saved feeds and optional profile context stay in browser storage. Feed candidates are processed by the local Node.js server and kept in memory; source sessions use the encrypted local store described below. Content needed for curation is sent to the model provider you selected.

Personal mode persists source connections in `connections.enc.json` beside the local configuration. The data is encrypted with AES-256-GCM and the generated key is stored in the owner-only `.env.local` file. This prevents accidental plaintext disclosure of the connection file; the operating-system account and disk encryption remain the real security boundary. Native Keychain/Keystore integration is still on the roadmap.

Read [Privacy](docs/PRIVACY.md) before connecting private feeds.

## How curation works

1. A model compiles the current intention into a bounded `RankingProgram`.
2. Connectors retrieve a limited candidate set using source-native timelines, search and classifications.
3. Cheap deterministic filters remove duplicates and explicit constraints, then source-native metadata and lexical signals reduce the pool again.
4. The model returns semantic and tone signals for at most 36 remaining original posts (24 with a local model), in small batches; recent matching evaluations are reused locally.
5. The local ranker combines those signals with freshness, familiarity, source diversity and user controls.
6. The UI renders the original posts. It does not generate a replacement answer.

Loading the next page and adjusting existing weights are deterministic and make no new model request.

A plain request for general updates from followed people with no exclusions skips semantic content evaluation entirely: source membership, freshness and deterministic ranking are sufficient. The model is used once to compile the intention.

See [Architecture](docs/ARCHITECTURE.md) for trust boundaries and extension points, and [Onion architecture](docs/ONION-ARCHITECTURE.md) for the layered cost and quality design.

See [Model calls, cost and data](docs/COST-AND-DATA.md) for the exact bounded-call behavior, and [Connector reality check](docs/CONNECTORS.md) for what each platform actually exposes.

## Model providers

Set these in the local configuration file, or save them persistently from Settings:

```dotenv
MODEL_PROVIDER=openrouter
MODEL_API_KEY=your_key_here
MODEL_NAME=openai/gpt-5.6-luna
```

Supported provider identifiers:

| Provider | `MODEL_PROVIDER` | Example model |
|---|---|---|
| OpenAI | `openai` | `gpt-5.6-luna` |
| Anthropic | `anthropic` | `claude-haiku-4-5-20251001` |
| Google Gemini | `gemini` | `gemini-3.6-flash` |
| OpenRouter | `openrouter` | `openai/gpt-5.6-luna` |
| Local OpenAI-compatible | `local` | selected from models actually installed on your machine |

Model availability changes. Use a current model that supports structured output or tool use in your provider account.

OpenRouter is the easiest default and the model field also offers `google/gemini-3.6-flash` and `anthropic/claude-haiku-4.5`. Direct provider keys remain supported. For a fully local curation path, see [Local models](docs/LOCAL-MODELS.md).

## Development

```bash
npm ci
npm run check
npm test
npm run smoke:personal
npm run smoke:first-feed
```

The test suite uses mocked provider responses and never needs a real model key. The HTTP smoke tests bind only to `127.0.0.1`; the first-feed gate starts a fake structured-output model and a fixture connector, then verifies model setup and a complete clean first feed.

Run `npm run doctor` to check Node.js, the local data directory, the port, and optional Ollama availability. See [Release checklist](docs/RELEASE.md) before publishing a tag or npm package.

## Project layout

```text
server.mjs                 HTTP server and orchestration
src/curator/openai.js      Structured-output provider adapters
src/curator/ranker.js      Deterministic ranking and pagination
src/providers/             Source connectors and normalization
src/app.js                 Local-first feed UI
src/auth.js                Optional managed multi-user accounts
src/personal-store.js      Encrypted local source-session storage
tests/                     Unit and contract tests
compose.yaml               Single-user local installation
```

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Connector contributions should normalize source data into the existing candidate contract and must not silently expand permissions or data retention.

Security issues should be reported according to [SECURITY.md](SECURITY.md), not opened as public issues.

## License

[MIT](LICENSE). The Outention name and visual identity are not granted as trademarks by the software license.
