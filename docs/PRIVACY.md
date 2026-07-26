# Privacy

Outention Personal is designed to minimize custody of personal feed data.

## No telemetry

The open-source application contains no analytics SDK and sends no usage telemetry to Outention. There is no Outention account in personal mode.

## Local data

The browser stores feed workspace state in its own local storage. The local Node.js process keeps fetched candidate and active feed data in memory.

Personal source connections are persisted in `connections.enc.json` beside the local configuration and encrypted with AES-256-GCM. The generated encryption key is stored in the owner-only `.env.local` file. Keeping the key and ciphertext on the same machine protects against accidental disclosure of the connection file, not against someone who controls your operating-system account. Use device login protection and disk encryption.

If you save `MODEL_API_KEY`, the key is stored as plain configuration on your own filesystem with owner-only file permissions. A Node installation uses `.env.local`; Docker uses the host-side `.outention/.env.local`. Both paths and the encrypted connection file are excluded from Git by default.

Local-model mode can keep intention compilation and candidate evaluation on the same machine. Source-platform requests still leave the machine as normal; local curation only removes the external model-provider transfer.

## External data transfers

Outention necessarily contacts the source platforms you enable. For model-assisted curation, the selected provider receives:

- the current intention and optional context during intent compilation;
- at most 900 characters of text plus limited metadata for at most 60 preselected candidates during evaluation. Author handles and platform-stable post IDs are replaced with temporary per-call IDs.

Review the privacy and data-use terms of the model provider and source platforms you choose. BYOK changes who pays for inference; it does not make an external model call local.

## Not collected by an Outention service

In personal mode there is no Outention-operated collection of intentions, reading history, social handles, source content, model keys or usage analytics.

## Reporting

If you submit a bug report, remove API keys, tokens, handles, private post text and `.env.local` contents from logs and screenshots.
