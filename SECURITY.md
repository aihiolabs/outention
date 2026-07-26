# Security policy

## Supported version

Only the latest commit on the default branch is supported during the early alpha.

## Report a vulnerability

Do not open a public issue for vulnerabilities involving authentication, credential exposure, SSRF, OAuth state, cross-site request forgery or private feed disclosure.

Until a dedicated security address is published, contact the repository owner privately through the contact method listed on their GitHub profile. Include reproduction steps with synthetic credentials and redact all real tokens and private content.

## Local deployment boundary

Outention Personal is designed to bind to `127.0.0.1`. It is not hardened as a public multi-user service. Do not expose the local Compose service directly to the internet or change the port mapping to `0.0.0.0` without adding authentication, TLS and an appropriate reverse proxy.

## Secret handling

- Never commit `.env.local`.
- Use Bluesky app passwords, not main account passwords.
- Review OAuth scopes before approving a connector.
- Treat local configuration files and process memory as sensitive.
- Rotate any credential that appears in logs, screenshots, issues or commits.
