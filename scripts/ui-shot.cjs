#!/usr/bin/env node
/**
 * Headless UI screenshot helper — gives a developer (or Claude) eyes on the
 * renderer without a display. The renderer is a plain Vite web app, and this
 * environment ships a Chromium under PLAYWRIGHT_BROWSERS_PATH plus a global
 * `playwright`, so the "GUI can't run headless" caveat only applies to a full
 * Electron window, NOT to screenshotting the web build.
 *
 * Usage (start the dev server first: `npm run dev`):
 *   NODE_PATH=$(npm root -g) node scripts/ui-shot.cjs <out.png> \
 *     [--url http://localhost:5173/] [--w 1440] [--h 900] \
 *     [--click "Service & Earthing"] ...     # repeatable: clicks by accessible name
 *
 * Each --click is an accessible-name (role=button) match performed in order,
 * with a short settle delay between, so multi-step states can be captured.
 */

'use strict';

// Resolve `playwright` from the local project or the global npm root.
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    const { execSync } = require('node:child_process');
    const root = execSync('npm root -g').toString().trim();
    return require(require('node:path').join(root, 'playwright'));
  }
}

function parseArgs(argv) {
  const out = { out: argv[2], url: 'http://localhost:5173/', w: 1440, h: 900, clicks: [] };
  for (let i = 3; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--w') out.w = Number(argv[++i]);
    else if (a === '--h') out.h = Number(argv[++i]);
    else if (a === '--click') out.clicks.push(argv[++i]);
  }
  return out;
}

(async () => {
  const { chromium } = loadPlaywright();
  const opts = parseArgs(process.argv);
  if (!opts.out) {
    console.error('usage: ui-shot.cjs <out.png> [--url URL] [--w N] [--h N] [--click "name"]...');
    process.exit(2);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: 2,
  });
  await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 30000 });
  // Wait past the hydration splash.
  await page.waitForSelector('text=PanelMaker', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
  for (const name of opts.clicks) {
    await page.getByRole('button', { name: new RegExp(name, 'i') }).first().click();
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: opts.out });
  console.log('screenshot ->', opts.out);
  await browser.close();
})().catch((e) => {
  console.error('ui-shot failed:', e.message);
  process.exit(1);
});
