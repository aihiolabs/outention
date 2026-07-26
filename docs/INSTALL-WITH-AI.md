# Install Outention with an AI coding agent

This document is deliberately written so it can be handed to a local coding agent. The agent must have terminal access to the directory where you want Outention installed.

## Prompt for the agent

Copy the block below and replace `REPOSITORY_URL` after the public repository exists:

```text
Install Outention Personal from REPOSITORY_URL on this computer.

Requirements:
1. Inspect README.md, docs/INSTALL.md, .env.example, compose.yaml and SECURITY.md before running anything.
2. Do not print, request in chat, or commit API keys. Let me save the key through the local Settings UI after startup, or ask me to place it in the ignored local configuration file myself.
3. Prefer Docker Compose when available. Otherwise use Node.js 20 or newer.
4. Keep the service bound to 127.0.0.1. Do not expose it to the LAN or internet.
5. Do not alter unrelated Docker containers, reverse proxies, firewalls, DNS or system services.
6. Run npm run check and npm test before startup. Run npm run smoke:personal if local loopback binding is allowed.
7. Start Outention, verify /api/health returns {"ok":true}, and tell me only the local URL and verification results.
8. If any prerequisite is missing, explain the smallest safe action needed. Do not install system-wide software or use destructive cleanup commands without my explicit approval.
```

## What a successful agent installation should do

Docker path:

```bash
git clone REPOSITORY_URL outention
cd outention
docker compose config --quiet
docker compose up -d --build
curl -fsS http://127.0.0.1:4173/api/health
```

Node.js path:

```bash
git clone REPOSITORY_URL outention
cd outention
npm ci
npm run check
npm test
npm start
```

Settings saves the key persistently to the local configuration file with owner-only permissions. Node uses `.env.local`; Docker uses the host-side `.outention/.env.local`. Both must remain untracked.

## Safety boundary

An installation agent does not need to see a model key, Bluesky app password, Reddit or Threads app secret, or OAuth token. Secrets should be entered by the user through the local UI or directly into the ignored `.env.local` file.
