# Open-source launch benchmark

Assessment updated: 2026-07-26

This document compares the current Outention product and repository package with open-source products that turned a clear new capability into substantial GitHub adoption. Star counts are snapshots, not product-quality scores.

## The relevant reference set

### OpenClaw

- Promise: a personal AI assistant running on the user's own devices and answering in channels the user already uses.
- Adoption strengths: an immediately understandable character and category, one guided onboarding command, many channels, a skills ecosystem, visible examples, and a product that becomes more useful when the community adds integrations.
- Current public repository: <https://github.com/openclaw/openclaw>

### Ollama

- Promise: start building with open models.
- Adoption strengths: one installation command, one memorable run command, an immediate result, a stable local API, a model library, and usefulness as both an end-user product and infrastructure for other projects.
- Current public repository: <https://github.com/ollama/ollama>

### Open WebUI

- Promise: a familiar, user-friendly, self-hosted interface for local and remote models.
- Adoption strengths: recognizable UI, broad compatibility, multiple simple installation routes, strong screenshots, offline operation, and an extension surface.
- Current public repository: <https://github.com/open-webui/open-webui>

### Browser Use

- Promise: make websites accessible to AI agents.
- Adoption strengths: the capability is visible in short videos, the first useful program is tiny, concrete tasks are shown instead of abstract architecture, and an open benchmark provides proof beyond marketing.
- Current public repository: <https://github.com/browser-use/browser-use>

### Folo

- Promise: organize noisy information sources into one modern AI-assisted reader.
- Adoption strengths: highly polished product visuals, browser and native clients, immediate ways to try the product, dynamic media support, and an existing RSSHub ecosystem.
- Snapshot: about 38,700 GitHub stars.
- Current public repository: <https://github.com/RSSNext/Folo>

### RSSHub

- Promise: “Everything is RSSible.”
- Adoption strengths: a one-line idea, thousands of community-maintained routes, composability with any reader, public instances, a browser extension, and an architecture in which every contribution makes the whole project more useful.
- Snapshot: about 44,300 GitHub stars.
- Current public repository: <https://github.com/DIYgod/RSSHub>

### Karakeep

- Promise: self-host one place for every bookmark, note and image.
- Adoption strengths: starts from a familiar personal pain, has a seeded public demo, works from browser extensions and mobile apps, supports imports, and explains why the maintainer personally needed it.
- Current public repository: <https://github.com/karakeep-app/karakeep>

## What repeats across successful projects

1. **The value is demonstrable before the architecture is explained.**
2. **The first successful result takes one command or one click.**
3. **The project has a sentence people can repeat accurately.**
4. **Screenshots and short videos show the capability without requiring trust.**
5. **It works with tools, accounts or habits people already have.**
6. **The open-source version is the real product, not a restricted lead generator.**
7. **An extension point turns users into contributors.**
8. **The repository is useful to both users and builders.**
9. **There is a shareable artifact: a model, skill, route, workflow, recipe or integration.**
10. **The first-run path avoids approval queues and optional infrastructure.**

OpenClaw's exceptional growth also involved timing, spectacle and a recognizable identity. Those cannot be reproduced by repository hygiene alone. The transferable part is that the product's capability, extensibility and cultural story were all visible at once.

## Where Outention is genuinely stronger

### A distinct product thesis

“Tell your feeds what you want to hear today” is not another chat UI, RSS reader or summarizer. The model does not replace the source with an answer. It compiles an intention and returns original people and content.

### A credible technical reason to exist

The onion architecture is not decorative AI. It limits retrieval, reuses source-native structure, makes later pages and weight changes deterministic, and escalates semantic processing only when needed.

### User ownership is structural

BYOK, local source sessions, no required Outention account, no telemetry and an optional local model are coherent with the product rather than privacy copy added afterward.

### The feed already behaves like a product

The current implementation includes original media, ranking controls, pagination, source diversity, personal and discovery modes, explicit exclusions, multilingual intent handling and a first-run wizard.

### There is real verification

The current suite has more than 60 unit and contract tests. The personal HTTP smoke test verifies accountless mode, persistent local BYOK, encrypted source sessions and the PWA surface. A second clean-install gate starts a fake schema-capable model and external local connector, verifies the connection, and requires a complete multi-item first feed.

## Resolved launch blockers

### 1. Repository and package shape

The project is now a Git repository and `package.json` exposes an `outention` executable with Node 20+ support. A public clone URL, tag, npm publication and GitHub release remain deliberate maintainer actions.

### 2. One-command local start

The package is publishable and the CLI starts the server, opens the browser, chooses a local data directory and includes `doctor` plus a local connector generator. After npm publication, the intended path is:

```bash
npx outention
```

The unpublished-package limitation must remain explicit until that external publication happens.

### 3. The first feed is now gated

The wizard opens Settings when needed, provider configuration performs a real structured-output probe, installed Ollama models are discovered instead of guessed, and public sources work without a social account. CI now proves a clean first feed. Real-world relevance across varied public-source intentions remains a product-quality benchmark rather than an installation blocker.

## Remaining launch gaps

### 1. The repository still needs visual proof

The README has no screenshot, animated demonstration or short video. Outention is primarily an interaction and ranking experience; prose cannot prove “feed feel.”

At minimum the repository needs:

- one clean hero screenshot with non-private content;
- one 20–40 second recording: use the same candidate sources with two very different intentions and show two visibly different feeds, then refine one without replacement prose;
- one diagram showing local trust boundaries and the bounded model calls.

The side-by-side transformation is Outention's equivalent of an agent visibly operating a browser or a local model answering its first prompt. A static “nice feed” can be mistaken for another reader; the same sources becoming different feeds proves the new capability.

### 2. The repeatable sentence

The README now leads with “Tell your feeds what you want to hear today” and follows with the technical explanation. Launch assets should use the same sentence consistently.

### 3. Extension proof, not extension plumbing

Outention now has a versioned connector contract, contribution scaffold, trusted local connector directory, runtime discovery, status reporting and candidate validation. OPML and generic RSS/RSSHub URLs cover many sources without code. The remaining requirement is one compelling third-party connector built solely from the public contract.

The ideal community contribution is:

```text
one adapter + one normalization fixture + one contract test
```

The UI product must remain primary, but the connector contract is what makes the repository compound.

### 4. Shareable native artifact

Outention's natural shareable unit is an **intent lens**: the text intention plus transparent ranking controls and source requirements, never the user's private feed or interaction history.

Examples:

- “People I follow, personal updates, no news”
- “US technology policy from primary sources and practitioners”
- “Local reporting within 30 km, no national rewrites”

An intent lens should be exportable as a small human-readable file or URL fragment and importable without exposing source credentials. This creates a community loop without turning Outention into a library of fixed feeds.

### 5. Keep the launch story narrow

The repository currently mentions managed accounts, production deployment, numerous providers, publishing and connectors with materially different availability. They are useful, but the launch story should stay:

1. local personal installation;
2. connect model;
3. connect or use sources;
4. ask for today's feed;
5. see originals.

Hosted multi-user operation, billing and an Outention account are not part of the first open-source promise.

### 6. Connector availability must stay candid

Reddit support requires credentials and potentially platform approval. YouTube support currently means public channel Atom feeds rather than a full personalized YouTube connection. The README should visually separate:

- works immediately;
- connect with OAuth/app password;
- bring an approved developer credential;
- experimental or planned.

This protects the first user's trust.

### 7. Public feedback loop

Issue forms and contribution/security documents exist, which is good. Missing launch surfaces include:

- GitHub Discussions with a Show your lens/source category;
- connector requests tied to the stable adapter contract;
- a redacted diagnostic export;
- releases and a public roadmap limited to near-term product outcomes.

## Scorecard before public launch

| Dimension | Current | Launch-worthy target |
|---|---:|---:|
| Distinct product idea | 4.5 / 5 | 4.5 / 5 |
| Immediate comprehension | 4 / 5 | 4.5 / 5 |
| First successful run | 4 / 5 | 4 / 5 |
| Visible proof | 1 / 5 | 4.5 / 5 |
| Feed/product depth | 3.5 / 5 | 4 / 5 |
| Technical trust | 4 / 5 | 4 / 5 |
| Contributor leverage | 3.5 / 5 | 4 / 5 |
| Shareability | 3 / 5 | 3.5 / 5 |
| Repository readiness | 4 / 5 | 4.5 / 5 |

## Recommended release sequence

### Gate 1: prove the loop

- Make a clean installation start with one command.
- Open the browser automatically.
- Detect a local compatible model where possible.
- Let the user save a BYOK key entirely through the wizard.
- Enable useful credential-free public sources.
- Run one strong example intention immediately.
- Show at least 10 credible selections or a precise explanation of why the source pool is sparse.

### Gate 2: make the repository starable

- Initialize the clean public repository without any local secrets or personal content.
- Replace placeholder clone instructions.
- Add a screenshot and short demonstration.
- Put the user promise above architecture.
- Publish a tagged `v0.1.0-alpha` release.
- Add a one-command doctor and redacted diagnostic output.

### Gate 3: make it compound

- Freeze and document a minimal connector contract.
- Add a connector scaffold command and fixture-driven contract test.
- Make intent lenses importable and exportable.
- Add Discussions and a short contributor roadmap.
- Publish three example community-sized issues that do not require understanding the entire server.

### Gate 4: earn the broader browser story

Only after the feed loop is repeatably good:

- add a local browser companion for sources without adequate APIs;
- keep adapters separate from the ranking core;
- use the same candidate contract and intent lenses;
- demonstrate that the browser layer materially improves the feed rather than broadening the story for its own sake.

## The launch criterion

Outention is ready for a serious public GitHub launch when a new technical user can:

1. understand the product from the first screen of the README;
2. install it without improvising;
3. see a real multi-source intent-ranked feed within five minutes;
4. understand what stayed local and what was sent to the chosen model;
5. add or request a source without reverse-engineering the application;
6. show the result to another person without exposing private content.

The current product is closer to this threshold than the current repository package suggests. The next work should expose and compress the value already built, not add more unrelated features.
