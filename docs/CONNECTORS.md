# Connector reality check

## Add a connector

For a connector contributed to Outention itself, create the smallest valid provider and contract test:

```bash
npm run connector:create -- example-source
```

An Outention connector is deliberately small: a versioned manifest, bounded retrieval, normalization into original-content candidates, fixtures, and a contract test. The stable helpers live in `src/providers/contract.ts`, with shared types in `src/types.ts`.

Every candidate must include a stable `id`, source identity, original text, author, publication time and an HTTPS canonical URL when one exists. A connector must not return model-written replacement content. Capabilities are declared explicitly as `personal-feed`, `discovery`, and/or `publishing`; request only the permissions needed for those capabilities.

For a private connector in an installed Personal Mode instance, create a module in the local data directory:

```bash
outention connector create example-source
```

This writes `~/.outention/connectors/example-source.mjs` (or the selected `--data-dir`). Restart Outention and the connector is discovered, contract-validated, shown under Connections, and included in bounded retrieval. These modules are **trusted local code**: review them before running because they have the same operating-system permissions as Outention. A broken module is isolated and reported in `/api/status` instead of preventing startup.

The minimal module exports `connector` with `apiVersion`, `id`, `name`, `capabilities`, and `fetchCandidates({ intent, program, limit })`. Returned candidates are validated by the same contract as built-in sources. RSSHub routes can normally be added directly as RSS URLs; an exported subscription library can be imported as OPML from Connections without writing a connector.

Outention separates a user's own timeline from public discovery. Those are different API capabilities and should never be presented as interchangeable.

| Source | Own feed | Public discovery | Publish | Current implementation and constraint |
|---|---:|---:|---:|---|
| Bluesky / AT Protocol | Yes | Yes | Yes | Home timeline uses an authenticated session; public post search does not require the user's account. Personal mode currently uses an app password and exchanges it for access/refresh tokens. OAuth is the preferred future login path. |
| Mastodon / fediverse | Yes | Partial | Yes | OAuth Home timeline and status publishing work. Discovery uses hashtag timelines on one selected instance, so it cannot be a complete search of the entire fediverse. |
| Reddit | Yes | Yes | No | Both modes require an approved Reddit application. Broad search can use application authorization; Home/Best needs user OAuth. Reddit approval and commercial terms are external launch risks. |
| RSS / Atom / podcasts | Subscription list | URL-dependent | No | Public feeds work without an account. Discovery is only as broad as the feeds the user adds. |
| YouTube | Added channels | No | No | The alpha uses public channel Atom feeds and inline privacy-enhanced players. It does not import the user's YouTube Home recommendations or subscription list. A future Google OAuth connector could enumerate subscriptions, but that is a separate reviewed integration. |
| Yle News | N/A | Recent feed | No | Public RSS; no login and no promise of the full Yle app experience. |
| Locationews | N/A | National/local news | No | Public API; municipality context can be inferred from a natural-language intention or optional profile context. |
| Hacker News | N/A | Best stories | No | Public API; no account or personal Home feed. |
| Threads | No | Yes | No | The official Meta OAuth API supports bounded public keyword search. Set `THREADS_APP_ID`, `THREADS_APP_SECRET`, and the registered callback URL, then connect from the source library. It does not expose the user's Following/Home feed. |
| Facebook / Instagram | No | No | No | Not offered. Consumer Home feeds are not available as general-purpose third-party feed APIs. |
| Eulesia | Not yet | Not yet | Not yet | Reserved as a future native/connected source after its authorization and API boundary is defined. |

## Official capability references

- Bluesky documents both [public and authenticated API hosts](https://docs.bsky.app/docs/advanced-guides/api-directory) and an [OAuth client flow](https://docs.bsky.app/docs/advanced-guides/oauth-client).
- Mastodon documents the distinction between [public/hashtag and authenticated Home timelines](https://docs.joinmastodon.org/methods/timelines/) and recommends the narrowest practical [OAuth scopes](https://docs.joinmastodon.org/api/oauth-scopes/).
- Reddit's [Data API Terms](https://redditinc.com/policies/data-api-terms) make access revocable and require separate approval for commercial use; Outention must not treat credentials as guaranteed.
- YouTube documents authenticated [subscription resources](https://developers.google.com/youtube/v3/docs/subscriptions); the current Outention connector deliberately remains a credential-free channel-feed connector.
- Meta's official [Threads API collection](https://www.postman.com/meta/threads/overview) documents OAuth and `keyword_search`; federation still does not expose the proprietary Threads Home feed.

Connector availability is a moving external dependency. A connector should be enabled only when its permissions, retention rules and platform terms are understood.
