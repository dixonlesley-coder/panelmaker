# Licensing / Access Control (Google Workspace)

PanelMaker's **desktop** build can be gated so that only members of your
company's Google Workspace can run it. The gate is implemented entirely in the
Electron **main process** (`src/main/license/**`) — the renderer is untrusted and
never makes the access-control decision.

> The **web preview** (`npm run dev` / `npm run build`) has no main process and is
> therefore **never gated** — it keeps working unchanged.

---

## How it works

1. **Sign-in (OAuth 2.0 for Native Apps, RFC 8252).** When a packaged, configured
   app starts and has no valid session, it shows a small sign-in window with a
   single "Sign in with Google" button. Clicking it opens **your system browser**
   (via `shell.openExternal`) at Google's consent screen — Google's pages are
   **never** embedded in a webview. A loopback HTTP server on `127.0.0.1`
   (ephemeral port) catches the redirect, and the main process exchanges the
   authorization code (with **PKCE S256**) for an `id_token` and a
   `refresh_token`.

2. **Employee check.** The `id_token` is a JWT. The main process:
   - verifies its **RS256 signature** against Google's published keys (JWKS,
     `https://www.googleapis.com/oauth2/v3/certs`, via the `jose` library), then
   - checks the claims (`src/main/license/validate.ts`): `aud` == your client id,
     `iss` is a Google issuer, `exp` in the future, **`email_verified === true`**,
     and **`hd` (hosted domain) == your Workspace domain (`ALLOWED_HD`)**.

   Only a verified token from a verified `@your-domain` account passes. Personal
   Gmail accounts have no `hd` claim and are rejected.

3. **Per-employee.** Each person signs in with their own Google account; the
   signed-in email is shown in **Settings → Licensing**.

4. **7-day offline window.** After a successful online sign-in/refresh the app
   stores `lastVerifiedAtMs`. On each launch it tries a **silent** online
   re-verification (refresh token → fresh `id_token` → verify). If that succeeds,
   the timestamp is renewed. If the machine is **offline** (or refresh fails) but
   the last success was **within 7 days**, the app still runs (`offline-grace`).
   After 7 days with no successful verification, it **locks** to the sign-in
   screen. The window length is `OFFLINE_GRACE_MS = 7 * 24 * 3600 * 1000`.

   The window is anchored to a **monotonic clock high-water mark** persisted with
   the session: rolling the system clock **backwards** past it (the cheap way to
   fake one's way back inside the window) is detected and refuses grace, so an
   online re-verification is required. The id_token also carries an OIDC **nonce**
   bound to each sign-in (replay protection), and the session is keyed to the
   **machine** it was established on — a copied `license.json` is rejected.

5. **Revocation.** When you **offboard a user** in the Google Admin console (or
   they leave the Workspace), Google **invalidates their refresh token**. The
   silent refresh then fails, so no new verification happens, and the app **locks
   within ≤ 7 days** (immediately once they next go online past the grace window,
   or at the latest when the 7-day window lapses).

The session is stored in `license.json` in the app's `userData` directory. The
**entire record** (refresh token, email/hd, machine id, and the grace-window
anchor) is **encrypted with Electron `safeStorage`** (OS keychain: Keychain /
DPAPI / libsecret) as one blob, so the grace timestamp can't be hand-edited. If
the OS keychain is unavailable it falls back to plaintext with a console warning
(the machine-id check still catches plain file copies in that mode).

---

## Fail-open until configured

The gate is **off by default** and only turns on once you supply credentials.
`licensingEnforced()` (`src/main/license/config.ts`) returns **false** — so the
app launches exactly as before — whenever **any** of these hold:

- licensing is **not configured** (no `GOOGLE_CLIENT_ID` **or** no `ALLOWED_HD`),
- the dev bypass `PANELMAKER_DEV_BYPASS=1` is set, or
- the app is **not packaged** (`!app.isPackaged`) — i.e. development / CI.

So the gate is enforced **only** for a packaged, configured build with no dev
bypass — the production scenario. Development, CI, the web preview, and the
as-yet-unconfigured desktop app are all unaffected.

---

## Demo / test account

So you can exercise the **enforced** gate without a real Workspace account, the
sign-in window offers a password-based **demo login** beneath the Google button.
It is a deliberate gate bypass, so it is **opt-in — OFF by default** and never
ships in a release unless you turn it on for a *test* build.

- **Enable it for a test build** with `PANELMAKER_ENABLE_DEMO=1` (uses the
  built-in password **`panelmaker-demo`**, signed in as `demo@panelmaker.local`),
  or by setting a non-empty `DEMO_PASSWORD` of your own:

  ```bash
  # internal test build with the demo login enabled
  PANELMAKER_ENABLE_DEMO=1 GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… ALLOWED_HD=… \
    npx electron-vite build && npx electron-builder
  ```
- **Override** the credentials with `DEMO_PASSWORD` / `DEMO_EMAIL` (env at build,
  or in `license.config.json`); `PANELMAKER_DISABLE_DEMO=1` is a hard kill-switch.
- A demo session bypasses Google and stays valid until you sign out (or the demo
  account is disabled on the next launch).

> ✅ A normal **production release leaves it unset**, so no demo bypass is baked
> in. The release workflow additionally **refuses to publish** a tagged release
> when `PANELMAKER_ENABLE_DEMO=1`, as a backstop.

---

## Setup (one-time, by an admin)

### 1. Create a Google Cloud project + OAuth client

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → OAuth consent screen**: choose **User type = Internal**
   (this restricts sign-in to your Workspace and is what makes the `hd` check
   meaningful). Fill in the app name / support email and save. No special scopes
   are needed beyond `openid email profile`.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - **Application type: `Desktop app`** (this is the "installed app" client type;
     it works with a loopback redirect and PKCE).
   - Note the generated **Client ID** and **Client secret**. Under PKCE the
     secret is not truly secret (it ships inside the app), but Google's token
     endpoint still expects it for Desktop-app clients, so provide it.

### 2. Configure PanelMaker

You supply three values — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`ALLOWED_HD` (your Workspace primary domain, e.g. `company.example` — the bare
domain, **not** an email address). **No secret is ever committed to the repo.**

#### Option A — build-time injection (recommended for distribution)

`electron.vite.config.ts` bakes the three values **present in the build
environment** into the packaged main bundle (via Vite `define`). The packaged
binary then carries the credentials, so end-user machines need **no** config
file, and the values live only in your build/CI environment and the compiled
`out/` bundle — never in source or git history.

Set them for the build (and only the build):

```bash
GOOGLE_CLIENT_ID="1234567890-abc.apps.googleusercontent.com" \
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxx" \
ALLOWED_HD="company.example" \
  npx electron-vite build && npx electron-builder --publish always
```

In **GitHub Actions**, store them as repository/organization **secrets** and pass
them as `env:` on the build step — never in the workflow file:

```yaml
      - name: Build & publish
        env:
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
          ALLOWED_HD: ${{ secrets.ALLOWED_HD }}
        run: npx electron-vite build && npx electron-builder --publish always
```

When the variables are absent at build time the bundle bakes empty strings, so
the gate stays **fail-open**. Baked values are authoritative in a packaged build
(they cannot be overridden by a runtime env var, which is the point).

#### Option B — `license.config.json` per machine (no baked creds)

Ship the app **without** baked credentials and deploy a gitignored
`license.config.json` to each machine's `userData` directory (e.g. pushed via
Workspace MDM / group policy). This is the runtime fallback used when nothing was
baked at build time. The directory is OS-specific:

- macOS: `~/Library/Application Support/PanelMaker/license.config.json`
- Windows: `%APPDATA%\PanelMaker\license.config.json`
- Linux: `~/.config/PanelMaker/license.config.json`

See **`license.config.example.json`** in the repo root for the shape. For local
development you can also `export` the three env vars before `electron-vite dev`.

Both `license.config.json` and the generated `license.json` / `machine.id` are
gitignored.

### 3. Build & ship

Package as usual. With **Option A** set the three build env vars (above) so the
gate activates automatically on the packaged build. With Option B, ship
unconfigured and deploy the config file to machines. Either way, **no secret
belongs in the git repo** — the client id + secret live in your build secrets
and/or the per-machine config, and the compiled `out/` bundle is gitignored.

---

## Verifying the behaviour

- **Unconfigured build** → app launches normally (fail-open).
- **Configured, packaged build** → shows the sign-in window; a verified
  `@ALLOWED_HD` account unlocks the app; a personal Gmail or other-domain account
  is rejected.
- **Offline for < 7 days after a sign-in** → app still runs.
- **Offline for > 7 days, or user offboarded** → app locks to sign-in.
- **Settings → Licensing** shows the signed-in email, status, last-verified time,
  and a **Sign out** button (which clears the session and forces sign-in on next
  launch).

To temporarily disable enforcement on a packaged build for support/debugging,
launch with `PANELMAKER_DEV_BYPASS=1`.

---

## Known limitations & hardening

This is **client-side** gating. It **deters casual misuse and enforces your
Workspace boundary for ordinary users**, but it **cannot stop a determined
attacker** with local access — the checks live in code that runs on the user's
machine and can, with effort, be patched out. Treat it as access control for
honest employees, not DRM.

Already mitigated (not just "hardening to do"): id_token **signature + `aud`/
`iss`/`exp`/`email_verified`/`hd`/`nonce`** are all verified; the session is
**fully encrypted** and **machine-bound** (copied files are rejected); and the
offline grace window resists **clock rollback** via a monotonic high-water mark.
The remaining residual is binary patching (below).

Recommended hardening:

- **Code-sign** the application (Windows Authenticode, macOS notarization) so
  tampered binaries are detectable and SmartScreen/Gatekeeper warnings disappear.
  The release workflow (`.github/workflows/release.yml`) wires this up and, for a
  **published (tagged)** release, now **refuses to ship an unsigned Windows/macOS
  installer** — because that artifact also feeds silent auto-update, where an
  unverifiable binary would be applied to clients. Add the repo secrets to sign:
  - Windows: `WINDOWS_CSC_LINK` (base64 of your `.pfx`) + `WINDOWS_CSC_KEY_PASSWORD`.
  - macOS signing: `MAC_CSC_LINK` (base64 of your Developer ID `.p12`) + `MAC_CSC_KEY_PASSWORD`.
  - macOS notarization: `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`.
  Base64-encode a cert with `base64 -w0 cert.pfx` (Linux) / `base64 -i cert.p12` (macOS).
  EV / HSM-backed Windows certs can't be exported as a `.pfx`; those need a
  cloud-signing service (e.g. Azure Trusted Signing) instead of `CSC_LINK`.
- Enable **Electron Fuses** (e.g. disable `runAsNode`, `nodeCliInspect`,
  enable ASAR integrity) to make patching the main bundle harder.
- If you need **seat metering / true revocation guarantees / audit logs**,
  move the policy decision to a small **serverless endpoint**: have the app send
  the `id_token` to your server, which performs the `hd`/JWKS check and returns a
  short-lived signed entitlement. That removes the trust-the-client weakness for
  the verification step (at the cost of requiring network for first/periodic
  checks). The current design intentionally avoids any custom server.
