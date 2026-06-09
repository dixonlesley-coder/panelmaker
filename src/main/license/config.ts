/**
 * Licensing configuration for the Google Workspace access-control gate.
 *
 * The gate is gated by *configuration*: until the deploying organisation
 * supplies a Google OAuth client id and an allowed Workspace domain, the app is
 * **fail-open** — it behaves exactly as it did before this feature existed. This
 * keeps development, CI, the web preview, and the as-yet-unconfigured desktop
 * app fully usable, and only starts enforcing once real credentials are present.
 *
 * Configuration is read from (in order of precedence):
 *   1. Environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
 *      `ALLOWED_HD`) — convenient for development.
 *   2. A gitignored `license.config.json` in the Electron `userData` directory
 *      (or the current working directory when not running under Electron).
 *
 * This module may use Node/Electron APIs (it runs only in the main process).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The offline grace window: after a successful online sign-in / token refresh,
 * the app keeps working offline for up to 7 days. Past that, with no successful
 * verification, it locks to the sign-in screen.
 */
export const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** The resolved licensing configuration. */
export interface LicensingConfig {
  /** Google OAuth 2.0 "Desktop app" client id. */
  clientId: string;
  /**
   * The installed-app client secret. Not truly secret under PKCE (it ships in
   * the binary), but Google's token endpoint requires it for "Desktop app"
   * client types, so we still carry it.
   */
  clientSecret: string;
  /** The company's Google Workspace hosted domain (the `hd` claim must match). */
  allowedHd: string;
}

/** Shape of the optional `license.config.json` file. */
interface LicenseConfigFile {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_HD?: string;
  DEMO_EMAIL?: string;
  DEMO_PASSWORD?: string;
}

/**
 * Resolve the directory that holds `license.config.json`. Uses Electron's
 * `userData` directory when available; otherwise the current working directory
 * (tests / type-checking / CLI tooling). Electron is required lazily so this
 * module imports cleanly in plain Node.
 */
function configDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron');
    const app = electron.app;
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // Not running under Electron — fall through to the cwd fallback.
  }
  return process.cwd();
}

/** Read `license.config.json` if present; returns an empty object otherwise. */
function readConfigFile(): LicenseConfigFile {
  try {
    const file = join(configDir(), 'license.config.json');
    if (!existsSync(file)) return {};
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf-8'));
    return (parsed && typeof parsed === 'object' ? parsed : {}) as LicenseConfigFile;
  } catch {
    // A malformed file should not crash startup — treat as unconfigured.
    return {};
  }
}

/** Trim a value to a non-empty string, or `undefined`. */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve the licensing configuration from environment variables first, then the
 * config file. Missing values come back as empty strings; use
 * {@link isLicensingConfigured} to decide whether the config is complete.
 */
export function getLicensingConfig(): LicensingConfig {
  const file = readConfigFile();
  return {
    clientId: clean(process.env.GOOGLE_CLIENT_ID) ?? clean(file.GOOGLE_CLIENT_ID) ?? '',
    clientSecret:
      clean(process.env.GOOGLE_CLIENT_SECRET) ?? clean(file.GOOGLE_CLIENT_SECRET) ?? '',
    allowedHd: clean(process.env.ALLOWED_HD) ?? clean(file.ALLOWED_HD) ?? '',
  };
}

/**
 * Whether licensing is *configured*: a client id and an allowed Workspace domain
 * are both present. The client secret is not strictly required for PKCE flows,
 * so it does not gate configuration. Configuration alone does not mean the gate
 * is active — see {@link licensingEnforced}.
 */
export function isLicensingConfigured(): boolean {
  const cfg = getLicensingConfig();
  return cfg.clientId.length > 0 && cfg.allowedHd.length > 0;
}

/**
 * Whether the gate should actually be *enforced* right now. This is the
 * fail-open escape hatch: enforcement is OFF (so the app launches normally)
 * when any of the following hold:
 *
 *   - licensing is not configured (no client id / allowed domain), or
 *   - the dev bypass `PANELMAKER_DEV_BYPASS=1` is set, or
 *   - the app is not packaged (`!app.isPackaged`) — i.e. development / CI.
 *
 * Enforcement is therefore ON only for a packaged, configured build with no dev
 * bypass — exactly the production scenario. Electron is required lazily so this
 * module stays importable in plain Node (where it always returns `false`).
 */
export function licensingEnforced(): boolean {
  if (!isLicensingConfigured()) return false;
  if (process.env.PANELMAKER_DEV_BYPASS === '1') return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron');
    const app = electron.app;
    // Outside a packaged app (dev / CI / plain Node), do not enforce.
    if (!app || app.isPackaged !== true) return false;
  } catch {
    return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Demo / test account                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Default credentials for the demo/test account. It lets you exercise the
 * *enforced* gate without a real Google Workspace account by signing in with a
 * password instead of OAuth. Enabled by default with this password; override via
 * DEMO_EMAIL / DEMO_PASSWORD, and DISABLE it for production with
 * `PANELMAKER_DISABLE_DEMO=1` (or by setting DEMO_PASSWORD to empty).
 *
 * NOTE: a built-in password is a deliberate gate bypass — disable it in real
 * production builds.
 */
export const DEFAULT_DEMO_EMAIL = 'demo@panelmaker.local';
export const DEFAULT_DEMO_PASSWORD = 'panelmaker-demo';

export interface DemoConfig {
  email: string;
  password: string;
  enabled: boolean;
}

/** Resolve the demo-account configuration (enabled by default). */
export function getDemoConfig(): DemoConfig {
  const file = readConfigFile();
  const email = clean(process.env.DEMO_EMAIL) ?? clean(file.DEMO_EMAIL) ?? DEFAULT_DEMO_EMAIL;
  // An explicitly-set empty DEMO_PASSWORD disables the account; unset -> default.
  const explicit = process.env.DEMO_PASSWORD ?? file.DEMO_PASSWORD;
  const password = explicit === undefined ? DEFAULT_DEMO_PASSWORD : explicit.trim();
  const disabled = process.env.PANELMAKER_DISABLE_DEMO === '1' || password.length === 0;
  return { email, password, enabled: !disabled };
}

/** Whether the demo / test account is available for sign-in. */
export function isDemoEnabled(): boolean {
  return getDemoConfig().enabled;
}

/** Check a supplied demo password against the configured one (length-safe compare). */
export function verifyDemoPassword(password: string): boolean {
  const cfg = getDemoConfig();
  if (!cfg.enabled) return false;
  if (password.length !== cfg.password.length) return false;
  let diff = 0;
  for (let i = 0; i < password.length; i++) {
    diff |= password.charCodeAt(i) ^ cfg.password.charCodeAt(i);
  }
  return diff === 0;
}
