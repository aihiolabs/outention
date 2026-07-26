# Local models

Outention Personal can keep intention compilation and candidate evaluation on the same machine. This mode does not send the intention or candidate text to OpenAI, Anthropic, Google, OpenRouter, or Outention.

## Requirements

- an OpenAI-compatible local HTTP endpoint;
- a model capable of following a strict JSON schema reliably;
- enough memory for the selected model and context.

Outention accepts local endpoints only on `localhost`, `127.0.0.1`, `[::1]`, or `host.docker.internal`. Local-model mode is unavailable in managed multi-user mode. These restrictions prevent a remotely exposed Outention instance from becoming an arbitrary internal-network proxy.

## Ollama

Install [Ollama](https://ollama.com/download), then fetch a model that reliably follows JSON schema for your runtime. Model names and availability change, so Outention does not guess one that is not installed:

```bash
ollama list
```

Run Outention directly with Node using:

```dotenv
MODEL_PROVIDER=local
MODEL_NAME=<exact-name-from-ollama-list>
MODEL_BASE_URL=http://127.0.0.1:11434/v1
MODEL_API_KEY=
```

For Docker, Ollama normally runs on the host machine:

```dotenv
MODEL_BASE_URL=http://host.docker.internal:11434/v1
```

The included Compose file maps `host.docker.internal` to the host gateway.

## Other runtimes

LM Studio and vLLM work when their OpenAI-compatible Chat Completions endpoint accepts `response_format` with a JSON schema. Use their local `/v1` base URL and exact model identifier.

Settings reads the installed model list from Ollama and tests an actual schema-constrained response before saving. Local inference quality varies: a model can produce fluent text while still failing the ranking schema, and a very large model can make the feed feel unresponsive. Outention therefore sends local models at most 24 candidates in 12-item batches and shows an explicit long-running state after eight seconds. Prefer the smallest installed model that passes the connection test and produces good feeds for your intentions.

## Privacy boundary

Source platforms still receive normal timeline or search requests. A local curator prevents feed text from being sent to an external model provider; it does not make Bluesky, Mastodon, Reddit, RSS, or other sources local.
