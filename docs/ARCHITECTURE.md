# Architecture

## Product boundary

Outention is a personal feed client, not a social network. It retrieves content from existing sources, turns a momentary natural-language intention into an explicit ranking program, and renders original posts in ranked order.

The model does not produce a replacement summary or answer.

## Data flow

```text
intention
  -> structured intent compiler
  -> bounded source-native retrieval
  -> deterministic filtering and candidate selection
  -> structured semantic signal evaluation
  -> deterministic local ranking
  -> original posts in the feed UI
```

The expensive layers are bounded. A fresh search evaluates at most 60 candidates and sends at most 900 characters of each post under temporary IDs. Loading another buffered page and changing existing ranking weights do not call a model again. See [Model calls, cost and data](COST-AND-DATA.md).

The response also contains a local `pipeline` object with aggregate counts for retrieved, deduplicated, language-matched and evaluated candidates. It contains no post text or identifiers and is not transmitted to Outention. This makes cost and pruning behavior inspectable without product telemetry.

For the layered target architecture, quality gates and escalation policy, see [Onion architecture and algorithm control](ONION-ARCHITECTURE.md).

## Trust boundaries

### Browser

The browser stores the current intention, visible feed history, saved feed definitions and optional personal context in local storage. It never receives persisted account or connector secrets from the server.

### Local Node.js server

The local server retrieves candidates and sends compact candidate data to the selected model provider. Saved model credentials live in the owner-only local configuration. Source sessions live in an AES-256-GCM encrypted file beside it. Personal mode has no Outention account requirement.

### Model provider

The provider receives the current intention or a compact candidate representation required for curation. Provider adapters require structured output. Outention does not ask the model to rewrite source content.

### Source platforms

Each connector should request the minimum permissions needed. Public discovery and authenticated Home feeds remain distinct capabilities.

## Extension contracts

A source connector normalizes platform data into candidate objects containing stable IDs, original URLs, author attribution, text, timestamps, source type, language, media and limited social context.

The deterministic ranker must remain independent from any provider SDK. Model adapters should return provider-neutral intent programs and evaluation signals.

## Modes

- `OUTENTION_MODE=personal`: single-user, accountless local installation.
- Managed mode: optional PostgreSQL accounts and encrypted connector persistence for the hosted service.

Personal mode is the public open-source default. Managed infrastructure is not required to run the feed.

## Current limitations

- Local connection encryption does not replace operating-system account protection or disk encryption; native Keychain/Keystore integration is not implemented.
- Mobile-native secure storage and background refresh are not implemented.
- Some platforms require application approval or do not expose personal feeds.
- Provider model compatibility changes over time.
