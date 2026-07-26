# Contributing to Outention

Outention is an early project. Small, reviewable changes with tests are easier to merge than large rewrites.

## Principles

- Preserve original voices: do not replace source posts with generated summaries.
- Keep retrieval bounded and cost-aware.
- Prefer deterministic filters and ranking where a model is unnecessary.
- Request the minimum connector permissions.
- Do not add telemetry, tracking or new persistent data without an explicit design discussion.
- Never include real credentials, private feed data or copied proprietary API responses in fixtures.
- Keep personal mode usable without an Outention account.

## Development setup

```bash
npm ci
npm run check
npm test
npm run smoke:personal
npm run smoke:first-feed
```

## Pull requests

Describe:

1. the user problem;
2. the trust boundary or connector permissions affected;
3. model and token-cost implications;
4. tests added or updated;
5. any platform terms or API documentation relied on.

Connector changes should include normalization tests using synthetic data. Model adapter tests must mock network calls and assert the structured request and response contract.

## Connector proposal

Before building a large connector, open an issue describing:

- official API availability;
- authenticated Home/personal feed availability;
- public discovery availability;
- OAuth method and scopes;
- publishing capability, if any;
- rate limits and redistribution restrictions;
- whether credentials can be held safely by a local public client.

Scraping private or authenticated pages is out of scope.
