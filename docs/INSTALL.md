# Installation

Outention Personal is a single-user application intended to run on your own computer. It requires a network connection to fetch source content and call the model provider you choose, but it does not require an Outention account.

## Option A: Docker

Install Docker Desktop or Docker Engine with Compose v2, then run:

```bash
docker compose up --build
```

Open `http://127.0.0.1:4173`. The port is published only on the host loopback interface.

Open **Settings** and save a model key. It is written to `./.outention/.env.local` on the host and remains available after container restarts. To create or edit the same file manually:

```bash
cp .env.example .outention/.env.local
```

Edit the three model variables and recreate the container:

```bash
docker compose up -d --build
```

Useful commands:

```bash
docker compose ps
docker compose logs -f outention
docker compose stop
```

`docker compose stop` preserves the image and configuration. Do not run broad Docker cleanup commands on machines hosting unrelated projects.

## Option B: Node.js

Install Node.js 20 or newer:

```bash
cp .env.example .env.local
npm ci
npm start
```

For development:

```bash
npm run dev
```

## Model setup

Outention needs a model only for compiling intentions and evaluating a bounded candidate set. Choose one provider:

```dotenv
MODEL_PROVIDER=openai
MODEL_API_KEY=...
MODEL_NAME=gpt-5.6-luna
```

```dotenv
MODEL_PROVIDER=anthropic
MODEL_API_KEY=...
MODEL_NAME=claude-haiku-4-5-20251001
```

```dotenv
MODEL_PROVIDER=gemini
MODEL_API_KEY=...
MODEL_NAME=gemini-3.6-flash
```

```dotenv
MODEL_PROVIDER=openrouter
MODEL_API_KEY=...
MODEL_NAME=openai/gpt-5.6-luna
```

Or keep curation on the same machine with an OpenAI-compatible local runtime:

```dotenv
MODEL_PROVIDER=local
MODEL_API_KEY=
MODEL_NAME=gemma4:e4b
MODEL_BASE_URL=http://127.0.0.1:11434/v1
```

See [Local models](LOCAL-MODELS.md).

Examples are not guarantees of account availability. The selected model must support strict structured output or forced tool use.

## Sources

### Bluesky

Use a Bluesky app password rather than your main password. Create one under **Settings → Advanced → App Passwords**, then connect with your handle and the app password. Outention exchanges it for a session and does not retain the password itself.

### Mastodon

Enter your instance URL. Outention dynamically registers an OAuth application with that instance and opens the authorization page in your browser.

### RSS, Atom, podcasts and YouTube

Add a public feed URL in Connections. A YouTube channel feed has this form:

```text
https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
```

### Reddit

Reddit access may require an approved application. If you have credentials, set the `REDDIT_*` variables in `.env.local`. Broad search uses application authorization; importing a personal Home feed additionally uses user OAuth.

### Threads

Threads uses Meta's official OAuth API for public keyword discovery. Create a Meta app with the Threads use case, request `threads_basic` and `threads_keyword_search`, register `http://127.0.0.1:4173/api/oauth/threads/callback` (or your actual `PUBLIC_BASE_URL` callback), and set `THREADS_APP_ID`, `THREADS_APP_SECRET`, and `THREADS_REDIRECT_URI` in `.env.local`. Then connect Threads from **Connections**. Outention stores the resulting token in the encrypted source store. Threads does not expose the user's Following/Home feed through this API.

### Public built-ins

Hacker News, Yle News and Locationews do not require personal credentials. Locationews can infer a Finnish municipality from natural-language context.

## Local security

- Keep the default `HOST=127.0.0.1` when running directly with Node.
- The Docker port mapping is limited to `127.0.0.1` even though the process binds inside the container.
- Do not expose personal mode directly to the public internet.
- Do not commit `.env.local`.
- Personal source connections survive restarts in an encrypted `connections.enc.json` file. Its generated key is kept in the owner-only local configuration file; protect the machine account and disk.
- Content selected for semantic evaluation is sent to your chosen model provider under that provider's terms.

## Verification

```bash
npm run check
npm test
npm run smoke:personal
```

Expected final smoke line:

```text
personal-http-smoke=ok accountless=true environmentByok=true persistentLocalByok=true encryptedSources=true pwa=true
```

## Mobile clients

Do not install the server on a phone. Run it on one computer or server and install the web interface as a PWA from its secure HTTPS address. Follow the interactive first-run guide or [Mobile access](MOBILE.md).
