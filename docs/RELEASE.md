# Release checklist

Outention is local-first. A release must be useful without an Outention account and must not contain developer credentials or private feed data.

## Before publishing

```bash
npm ci
npm run check
npm test
npm run smoke:personal
npm run smoke:first-feed
npm run doctor
npm pack --dry-run
```

Confirm that `.env`, `.env.local`, `.outention/`, `connections.enc.json`, deployment credentials, and real provider responses are absent from both Git and the npm file list.

Manually verify a clean first run in Finnish and English:

1. the wizard opens;
2. missing model configuration opens Settings;
3. a valid model connection saves, closes Settings, and resumes the wizard;
4. public sources appear without a social account;
5. Enter submits an intention;
6. the first feed contains multiple relevant original posts, or clearly reports that the result is sparse;
7. refine, load more, save, export, and import all provide visible feedback.

## GitHub release

Create a version tag only after CI is green. The release notes should include user-visible changes, connector limitations, privacy changes, and any migration step. Attach a screenshot or short recording that shows the same sources being ranked by two different intentions.

## npm release

Publishing requires an npm account with access to the `outention` package name:

```bash
npm login
npm publish
```

After publishing, test `npx outention@latest` from an empty temporary directory before announcing the release. Publishing and creating the public GitHub repository are deliberate maintainer actions; the test suite never performs them.
