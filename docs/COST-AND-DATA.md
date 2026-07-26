# Model calls, cost and data

Outention is intentionally a bounded retrieval-and-ranking pipeline, not a chatbot loop.

## Calls made by one fresh feed

One fresh intention makes one compiler call plus one or more bounded evaluator calls:

1. The compiler turns the intention and optional profile context into a small `RankingProgram` and source-native search terms.
2. The evaluator assigns semantic and tone signals to at most 36 preselected candidates (24 with a local model), in batches of 24 or 12. It may be a separately configured cheaper model under the same provider account.

Before the evaluator runs, Outention has already deduplicated results, applied explicit language constraints, balanced personal and discovery layers, capped the pool at 100, and used cheap local signals to prioritize the smaller semantic tranche. Each candidate contributes at most 900 characters of post text. Author handles and platform-stable post IDs are not sent to the model; candidates use temporary IDs such as `c1` during evaluation.

The current session reuses a matching semantic evaluation for 30 minutes. The cache is capped at 500 entries and stores the compact evaluation under hashes of the program and candidate representation, not a second raw-content archive.

For a general `broad_personal` request with no exclusions, semantic evaluation is unnecessary: all candidates already come from authenticated personal-feed layers. Outention assigns neutral deterministic signals and makes only the compiler call. If the request adds exclusions or becomes topical, normal bounded semantic evaluation resumes.

The original untruncated post remains in the local feed UI. The model is not asked to reproduce, summarize or answer with that content.

## Calls that cost nothing

These actions do not call a model:

- changing relevance, freshness, familiarity, popularity or author diversity while the active run remains available;
- undoing or restoring a feed version from the current run;
- loading another already-ranked page from the current candidate buffer;
- reading, opening media or opening the original post.

When the ranked buffer is exhausted, **Expand search** starts a new bounded retrieval. The compiler runs again, but unchanged candidates can reuse cached evaluations while the session is alive. A feed restored after a server restart must be refreshed before it can be reranked.

## Provider choice

The default examples use relatively small cloud models through OpenRouter. Outention asks OpenRouter to route only to providers that support every requested structured-output parameter and sets `data_collection: deny`. Direct OpenAI, Anthropic and Gemini adapters are also available. Local mode uses an OpenAI-compatible endpoint such as Ollama, LM Studio or vLLM and can keep both model calls on the same machine.

`MODEL_NAME` runs the compact intention compiler. Optional `MODEL_EVALUATOR_NAME` runs only bounded content evaluation and can be a cheaper small model available through the same configured provider and API key. Broad personal timelines do not invoke it at all.

BYOK determines which account pays for model use. It does not change the selected provider's data-processing terms. Model availability and pricing change, so Outention does not hard-code a currency estimate.

## What still leaves the machine

- Requests to enabled source platforms, as required to retrieve posts.
- The intention, optional relevant profile context and previous ranking program during compilation when using a cloud model.
- The bounded candidate representation described above during evaluation when using a cloud model.

Outention Personal sends no product telemetry to an Outention service.

Each feed response includes local aggregate pipeline counts so the owner can inspect how many candidates reached each stage. These counters contain no post text, author identifiers or platform IDs and are not uploaded to Outention.
