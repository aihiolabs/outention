# Onion architecture and algorithm control

Outention's algorithm is a layered retrieval and ranking system. The natural-language model controls an explicit program; it is not the feed, the database or the final source of truth. Original posts remain outside the model output.

## Target layers

```text
0. source-native timelines, search, tags and classifications
1. normalization, safety checks, deduplication, seen-item and language filters
2. cheap local retrieval signals and cached content features
3. bounded small-model semantic and tone evaluation only where useful
4. deterministic relevance, recency, familiarity, engagement and diversity ranker
5. local quality gate: enough coverage, confidence and source diversity?
6. clarification or tightly bounded escalation; never an AI replacement feed
```

The `RankingProgram` is the control plane between natural language and internal tools. A model may propose search queries, weights, horizon, languages and diversity, but deterministic code validates ranges and executes them. Reranking an existing run therefore needs no model.

## Iteration 1: cost, latency and data movement

### Current implementation

A fresh feed uses one structured compiler call and retrieves at most 100 interleaved candidates. Local constraints and deduplication run first, the familiarity pool is capped at 60, and a deterministic priority layer uses source-native order, freshness, feed layer, retrieval context and cheap term matches to choose at most 36 candidates. Local models receive at most 24. Each candidate sends at most 900 text characters under a temporary ID.

Semantic evaluation runs in batches of 24 for cloud providers and 12 for local providers. Matching candidate/program evaluations are cached in the current local session for 30 minutes, with a 500-entry cap and no raw post text stored in the cache key or value. Final ranking, diversity, buffered pagination and weight changes remain local.

The priority layer reserves a strong item from each available source before filling by score. It is a bounded priority layer rather than a semantic hard filter: source diversity survives and the model still makes the final contextual relevance gate.

### Next safe optimization

Measure recall against full-pool evaluation and add adaptive expansion only when the first semantic tranche is too sparse. Optional local embeddings or compact content tags may later improve ordering, but must remain owner-controlled and disposable.

Recommended defaults:

- retrieve at most 100 normalized candidates;
- evaluate 24–36 candidates in the first semantic tranche;
- require enough candidates above the relevance floor for one page plus lookahead;
- expand toward 60 only when coverage is insufficient;
- cache content-derived features by a salted content hash, with a short retention period and an explicit clear action;
- never use private source content to train a shared model.

This change should be measured locally with aggregate pipeline counters before becoming default. False-negative rate matters more than the token saving: a cheap lexical filter must not silently remove the surprising post that semantic evaluation would have found.

## Iteration 2: quality, uncertainty and escalation

Quality is not the model's self-reported confidence. It is observable pipeline state:

- **coverage:** enough evaluated candidates exceed the relevance floor;
- **diversity:** more than one author and, when available, more than one source;
- **retrieval health:** enabled sources returned candidates and did not mostly fail;
- **program stability:** compiler output passes schema and range validation;
- **evaluation integrity:** every supplied temporary ID is returned exactly once;
- **language fit:** the requested languages survive retrieval in useful quantity.

The quality gate should choose among four deterministic outcomes:

1. Render the feed when coverage is sufficient.
2. Evaluate the next candidate tranche when retrieval is healthy but the first tranche is sparse.
3. Run one broader source-native retrieval when the candidate pool itself is sparse.
4. Ask the user one short clarification when retrieval direction is genuinely ambiguous.

A larger model is not a normal fifth layer. If later introduced, it should receive the intention, validated program and aggregate failure signals—not the full raw feed—and return a revised program or clarification question. It must not summarize posts or overrule hard privacy, source and exclusion constraints. The default path should continue to work with a small cloud model or a local model only.

## Iteration 3: solution architecture and control contract

### Decisions for the public alpha

- Keep one selected small structured-output model for compilation and evaluation.
- Keep final ranking deterministic and provider-independent.
- Expose aggregate pipeline counts only in the local API; collect no Outention telemetry.
- Treat source-native metadata as useful evidence, not universal truth.
- Do not add a large-model escalation until local traces demonstrate a concrete failure class.
- Do not build or fine-tune a general language model.

### Internal tools the compiler may control

The program can safely call or parameterize:

- source retrieval queries and source selection;
- time horizon and requested languages;
- personal-versus-discovery allocation;
- relevance, tone, freshness, familiarity and engagement weights;
- per-author and per-source diversity limits;
- optional local tag, classifier or embedding retrieval;
- semantic-evaluation budget and expansion threshold.

Each tool needs a typed input, hard limits, a timeout and an inspectable result count. The model never receives unrestricted network or database access.

### Data separation

There are three distinct data classes:

1. **Source content:** transient candidates and optional owner-controlled local cache.
2. **Personal control state:** intentions, profile context, saved programs and ranking adjustments.
3. **Derived product model:** generic ranking logic, schemas and non-content parameters.

The third class can improve without retaining the first. If a learned personal ranker is added, train it locally from explicit controls or abstract interaction signals, keep it user-specific and provide export/delete controls. Shared model training from private feed content is outside the architecture.

## Failure modes to preserve in tests

- A lexical prefilter must not become a hidden hard exclusion.
- Missing provider evaluations must not be treated as zero-confidence approvals.
- An empty source must not make another source dominate without a visible diversity consequence.
- Repeated expansion must remain bounded and rate-limited.
- A model-generated query must not bypass connector URL, permission or SSRF checks.
- Reranking must be reproducible from the same candidates, signals and program.
- The UI must always link or render the original source item, never generated replacement prose.

## Implementation sequence after 0.1

1. Record local stage counts, source failures and ranked coverage. **Aggregate counts and ranked coverage implemented; per-source failure counts remain next.**
2. Add evaluation integrity validation and a deterministic quality report. **Implemented.**
3. Introduce a non-discarding local priority layer and bounded cache. **Implemented; comparative recall benchmark remains next.**
4. Enable adaptive expansion only after recall is demonstrably acceptable.
5. Add optional local embeddings or tags with explicit retention controls.
6. Consider a program-only escalation model only if simpler clarification and retrieval expansion fail.

This order keeps the essential promise intact: natural language steers a sophisticated system, while bounded tools and deterministic ranking—not an all-knowing chatbot—decide how original voices are delivered.
