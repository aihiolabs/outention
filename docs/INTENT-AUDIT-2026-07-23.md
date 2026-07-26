# Intent audit — 2026-07-23

This journal records feed-program and ranking behavior without post text, author names, credentials, or other personal content.

## Method

- Real requests are run against a separate local Personal Mode server using the configured sources and curator model.
- Each case is evaluated before moving to the next one.
- Logged evidence is limited to program controls, result count, source/layer mix, relevance range, and high-level failure class.
- A sparse but relevant feed is preferable to padding with unrelated content.

## Round 1 — 20 broad cases

Initial result: 12 cases without automated flags, 7 flagged cases, and 1 failed request.

Confirmed defects:

1. `broad_personal` removed the topical relevance floor but still admitted Hacker News, RSS, Yle, and Locationews.
2. The topical relevance floor admitted 25–35/100 filler.
3. Explicit source requests such as Yle and Hacker News were treated as keywords instead of hard source constraints.
4. A usable broad request could trigger an unnecessary clarification.
5. RSS, Hacker News, and Locationews items lacked an explicit discovery-layer marker.

## Round 2 — targeted retest

Confirmed improvements:

- Personal-update feeds contained only Bluesky Home items.
- Finnish politics improved from 2 weak items (average relevance 32.5) to 8 items (average 74.1).
- Yle and Hacker News became hard source constraints.
- Broad technology no longer triggered a clarification.
- Weak topical filler was removed.

New findings:

1. The model could output `English` instead of ISO code `en`.
2. Locationews municipality context was not included in the compact evaluator input, making an actually local article appear generic.
3. Bluesky queries were often written with unsupported search-engine-like boolean syntax.
4. Requests explicitly asking for real people needed a deterministic origin constraint.
5. Photography-video coverage is genuinely weak without connected YouTube channels or a YouTube search connector; this is a coverage gap, not a ranking problem.

## Round 3 — one-by-one themed cases

| # | Case | Result | Finding / action |
|---:|---|---|---|
| 1 | Finnish friend updates, no news | Pass: 11 items, all Bluesky Home/personal, 8 authors, relevance avg 71.1 | Correct broad-personal + people-only behavior. No language was inferred; 10 FI and 1 EN item is valid because the intent did not request Finnish-only content. |
| 2 | Followed people updates, no news links | Pass: 15 items, all Bluesky Home/personal, 11 authors, relevance avg 67.7 | English wording did not become an English-only constraint. This is correct: UI/input language and requested content language remain separate. |
| 3 | Finnish-only discussion of current Finnish politics | Sparse but strong: 4 items, all FI, relevance avg 87 | Language normalization and filtering work. Coverage is limited to Bluesky/Mastodon because Reddit is unavailable and current connected publisher feeds did not yield sufficiently relevant discussion. Do not lower quality to pad the feed. |
| 4 | English reporting and thoughtful discussion on current US politics | Defect found: 15 items, correct EN constraint, avg relevance 70.2, but 2 accepted reasons said “partisan inflammatory framing” while `partisan outrage` was excluded | Evaluator recognized an excluded trait but failed to set `hard_excluded`. Strengthened the evaluator contract: every explicit exclusion is a veto and cannot appear as an acceptance reason. |
| 5 | Easy vegetarian weeknight recipes with clear instructions | Defect found: 6 items, but accepted reasons included “vegetarian status unclear”, “recipe details absent”, and “cooking video promotion”; relevance minimum 45 | The ranker admitted below-useful results. Raised the absolute topical floor from 40 to 50, matching the evaluator scale where useful begins at 50. |
| 6 | Finnish-only easy weekday recipes | Mostly good but sparse: 3 FI items, avg relevance 80.3; 2 were complete recipes, 1 was a recipe-book review | Subject match was overruling requested form. Added a general rule: if an explicitly requested recipe/tutorial/how-to lacks usable instructions, semantic relevance is capped at 40. |
| 7 | Today’s local news from Rautalampi | Investigation: empty exact feed | Added source-level evaluation diagnostics before classifying this as a defect: candidate/evaluation counts, hard exclusions, useful count, and max semantic score per source, without storing content. Same case is rerun below. |
| 7b | Rautalampi diagnostic rerun | Defect confirmed: 9 Locationews candidates reached evaluation, but max semantic score was only 18 | Municipality filtering happened inside Locationews but the retrieval context was lost before evaluation. Added `retrievalContext` so source-side classification (“Locationews · Rautalampi”) survives the onion pipeline. |
| 7c | Rautalampi after source-context fix | Pass but sparse: 1 Locationews article, relevance 85; Locationews max rose from 18 to 85 | The source-side municipality signal now survives evaluation. Only one current item passed the explicit exclusions, so the feed reports sparse coverage instead of adding unrelated local-looking filler. |
| 8 | Kuopio local news and events | Pass: 6 Finnish items from Locationews (3) and Mastodon (3), relevance avg 78.2, range 58–95 | Municipality context generalizes beyond the original test place. Results cover traffic, city development, policy, infrastructure, and practical warnings without unrelated national filler. |
| 9 | Brooklyn local news and community updates | Defect found: 4 Mastodon items scored 52–92, but the reasons established only general NYC relevance (subway, health, Open Streets), not a Brooklyn connection | The evaluator was treating the broader city as sufficient. Added a locality rule: broader-city/region content is capped at 40 unless the item or authoritative source metadata establishes a direct connection or practical effect on the named locality. |
| 9b | Brooklyn after locality and subject-time fixes | Improved but not fully verifiable from metadata: 3 Mastodon items, avg 72; historical items disappeared, remaining reasons cite current NYC transit/health | Temporal mismatch is fixed. The compact audit cannot prove whether the transit/health items explicitly affect Brooklyn without retaining post text. Marked as a coverage/observability limit; a future US local-news connector is preferable to weakening relevance. |
| 10 | Current Ukraine situation, English only | Pass: 5 English Mastodon items, relevance avg 77.6, range 68–90 | Correct language constraint and current-subject handling. Reasons cover diplomatic, civilian, military, and policy developments; no old explainer or generic opinion was selected. Source diversity remains limited while Reddit is unavailable. |
| 11 | Current Ukraine situation, Finnish only | Pass but sparse: 1 Finnish Mastodon item, relevance 85 | The model produced one Mastodon tag with a leading `#` despite its contract. Added deterministic tag normalization at the compiler boundary. Finnish-only coverage is honestly sparse; the system does not pad it with English content. |
| 12 | Practical MTB cornering and descending technique | Correctly empty: 60 candidates evaluated, best topical score 40, no actionable tutorial passed | The recipe/tutorial form guard works. Current Bluesky/Mastodon/RSS coverage does not supply usable MTB instruction; YouTube search or Reddit is needed. Returning empty is preferable to product reviews and bare ride mentions. |
| 13 | Recent MTB trail rides and trip reports | Mostly good: 7 Mastodon items, avg 66.4, 7 authors; one threshold item was explicitly described as “Gravel rather than MTB” | Added a general semantic-boundary rule: an explicitly different but adjacent activity/product/place/medium is capped at 40 instead of passing at the useful threshold. |
| 14 | Practical Tokyo tips from actual visitors | Defect found: 3 people-origin Mastodon items passed, but reasons said “Limited practical guidance” or “No practical travel guidance” | People/publisher filtering worked, but a broad form such as personal post/video overrode the request's core practical value. Added a general rule that an explicitly missing central requested property caps relevance at 40. |
| 15 | Calm, non-luxury Finland weekend travel tips | Correctly empty: best semantic score 35 across RSS/Mastodon; no item met geography, practical guide/report form, calm tone, and non-luxury constraint together | Honest coverage gap. Current connectors are weak for evergreen travel planning; Reddit or purpose-built travel sources would materially improve this intent. |
| 16 | Recent TV comedy recommendations from real viewers | Correctly empty: people-origin filter reduced the pool to 40; no eligible recommendation remained | The origin filter successfully rejected professional/marketing sources. Mastodon contained some topical candidates (max 65) but all useful-scoring ones violated exclusions or other hard constraints. Reddit is the obvious missing source for this use case. |
| 17 | Thoughtful discussion of classic sitcoms | Mixed: 6 Mastodon items, strongest relevance 90, but the 55-point tail was described as “limited analytical depth” and “primarily episode trivia” | Across multiple audits, 50–55 consistently behaves as adjacent filler rather than feed-worthy content. Raised the deterministic topical floor from 50 to 60 (up to 75 when relevance weight is very high), favoring precision and honest sparsity. |
| 18 | Light, warm TV comedies without cringe humor | Pass: 3 English Mastodon items, relevance avg 74, range 62–88, 3 authors | The 60-point floor removed weak tail content. Reasons consistently reflect comfort viewing, warmhearted recommendations, gentle entertainment, and sitcom enjoyment; excluded humor styles did not appear. |
| 19 | Good-faith different viewpoints on current US politics, English | Pass: 7 English items from Mastodon (6) and Bluesky (1), 7 authors, relevance avg 72 | Correct language and current-topic constraints, with policy disagreement, comparative critique, defense, social policy, and immigration represented. One item is one-sided, but feed-level viewpoint diversity does not require every individual argument to be balanced. |
| 20 | Home cooks sharing meals with usable recipes | Defect found: 11 people-origin Mastodon items, but some passed above 60 while reasons explicitly said “No recipe details provided” or “No preparation guidance” | Numeric semantic score alone is not a reliable contract with a small evaluator model. Added a required structured `core_match` boolean and a deterministic ranker gate; a high score can no longer override a missing central subject, form, or property. |
| 20b | Home-cook recipes after `core_match` gate | Correctly empty: 9 candidates still scored useful by topic, but none independently satisfied usable-recipe core requirements | The new structural gate works and prevents score/reason contradictions from entering ranking. Current posts contain meal discussion, photos, or recipe links without enough locally evaluated recipe evidence; empty is safer than claiming they are usable recipes. |
| R1 | Regression: Finnish friend updates after `core_match` | Pass: 12 Bluesky Home/personal items, 8 authors, healthy quality | The gate does not impose topical semantics on `broad_personal`; genuine followed-person updates continue to pass even when semantic scores are below the topical floor. |
