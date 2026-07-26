# Mobile access

Outention Personal uses a client–server layout on mobile:

- the Outention server runs on one computer, NAS, or private server;
- the phone opens that same instance over HTTPS;
- the browser installs the interface as a Progressive Web App (PWA).

The phone never needs Node.js, Docker, or a terminal.

The in-app first-run guide walks through these steps and generates the server-side command. You can reopen it at any time with the `?` button.

## Recommended: private access with Tailscale

This keeps Outention off the public internet. Both the server machine and phone must belong to the same Tailscale network, or tailnet.

1. Keep Outention listening on `127.0.0.1:4173`.
2. [Install Tailscale](https://tailscale.com/download) on the machine running Outention and sign in.
3. On that machine, run:

   ```bash
   tailscale serve --bg 4173
   ```

4. Tailscale prints a private HTTPS address similar to `https://my-device.example.ts.net`.
5. Put that exact origin in the local configuration file. Node uses `.env.local`; Docker uses `.outention/.env.local`:

   ```dotenv
   PUBLIC_BASE_URL=https://my-device.example.ts.net
   ```

6. Restart Outention. `tailscale serve --bg` persists across restarts until explicitly disabled.
7. Install Tailscale on [iOS](https://tailscale.com/download/ios) or [Android](https://tailscale.com/download/android), and sign in to the same tailnet.
8. Open the HTTPS address on the phone.
9. On iOS choose **Share → Add to Home Screen**. On Android choose **browser menu → Install app**.

Tailscale Serve applies tailnet access controls and terminates HTTPS. Do not use Tailscale Funnel for a personal instance: Funnel makes the service public.

To inspect or remove the Serve configuration:

```bash
tailscale serve status
tailscale serve reset
```

## Public server and your own domain

Use this route only on an always-on server that you administer.

1. Point a dedicated domain to the server.
2. Put Outention behind an HTTPS reverse proxy.
3. Set `PUBLIC_BASE_URL` to the final HTTPS origin.
4. Set a long, random `BETA_ACCESS_CODE` before exposing Personal Mode.
5. Keep the Outention application port private; expose only the HTTPS reverse proxy.
6. Open the domain on the phone and install the PWA from the browser menu.

The current access-code session is an alpha-grade single-user gate, not a replacement for hardened identity-aware access on a broadly shared server. Tailscale remains the recommended Personal Mode route.

## What the PWA does and does not do

The installed PWA provides a full-screen icon and caches the application shell. Feed retrieval, model calls, and source connections still require the Outention server and internet access. Installing the PWA does not copy the server or API keys to the phone.
