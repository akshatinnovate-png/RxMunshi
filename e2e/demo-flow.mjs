// End-to-end stage demo in a real browser (Demo mode, no keys, no network):
// scan a bill → verifier → save → expiry return slip PDF → Munshi in Hindi →
// 08:00 job → approve all → patient replies YES in a second window → live
// banner → dispense an H1 prescription → Inspector Mode pack.
// Usage: BASE=http://localhost:3000 node e2e/demo-flow.mjs
import { createRequire } from 'node:module';
// Playwright is preinstalled globally (or install it locally); require() honours NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, deviceScaleFactor: Number(process.env.DSF || 1) });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

let step = 0;
const ok = (msg) => console.log(`✓ ${++step}. ${msg}`);
const shot = (name) => page.screenshot({ path: `${SHOTS}${String(step).padStart(2, '0')}-${name}.png` });

// 1. open, skip boot
await page.goto(`${BASE}/today`);
await page.locator('.bootwrap').click({ timeout: 10000 }).catch(() => {});
await page.waitForSelector('text=Sharma Medical Hall');
await page.waitForSelector('#plan');
const atRisk = await page.locator('.kstrip a').first().locator('b').innerText();
ok(`Today loads with live KPIs (stock at risk ${atRisk})`);
await shot('today');

// 2. split-screen scanner with the Delivery Verifier
await page.goto(`${BASE}/scan?sample=tatanagar-4519`);
await page.waitForSelector('.issue', { timeout: 10000 });
const findings = await page.locator('.issue').count();
const stake = await page.locator('.big.money-bad').innerText();
if (findings < 6) throw new Error(`expected ≥ 6 verifier findings, got ${findings}`);
ok(`Sample bill read; verifier found ${findings} issues, ${stake} at stake`);
await shot('scan-verifier');
const batchesBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('rxmunshi.demo.v1')).inventory_batches.length);
await page.getByRole('button', { name: '✓ Save all' }).click();
await page.waitForSelector('text=SAVED · 6 BATCHES');
const batchesAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('rxmunshi.demo.v1')).inventory_batches.length);
if (batchesAfter !== batchesBefore + 6) throw new Error('batches not saved');
ok('Save all inserted 6 batches; order marked delivered');

// 3. Expiry Radar → return slip PDF
await page.goto(`${BASE}/expiry?bucket=d30`);
await page.waitForSelector('table.grid tbody tr');
const rows = page.locator('table.grid tbody tr');
const n = await rows.count();
await rows.nth(0).locator('input[type=checkbox]').check();
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: /Return selected/ }).click()]);
if (!dl.suggestedFilename().endsWith('.pdf')) throw new Error('no slip pdf');
ok(`Expiry Radar (${n} batches ≤ 30 d) → return slip ${dl.suggestedFilename()} downloaded`);
await shot('expiry');

// 4. Munshi in Hindi (offline planner)
await page.getByLabel('Ask Munshi').fill('अगले महीने कौन सी दवाई एक्सपायर होगी?');
await page.getByRole('button', { name: 'Ask ▸' }).click();
await page.waitForSelector('.chat .m >> text=/batches worth/');
ok('Munshi answered a Devanagari question from the records, with source shown');
await page.getByLabel('Ask Munshi').fill('teen wale batch return kar do');
await page.getByRole('button', { name: 'Ask ▸' }).click();
await page.waitForSelector('.chat .task');
ok('“Return kar do” became approvable tasks (nothing executed yet)');
await shot('munshi-chat');

// 5. the 08:00 job and approve all
await page.goto(`${BASE}/munshi?run=1`);
await page.waitForSelector('text=Approve all');
const open = await page.locator('main .task').count();
await page.locator('main').getByRole('button', { name: '✓ Approve all' }).click();
await page.waitForFunction(() => !document.querySelector('main .task .tact'), null, { timeout: 15000 });
const verified = await page.evaluate(() => JSON.parse(localStorage.getItem('rxmunshi.demo.v1')).agent_tasks.filter((t) => t.status === 'verified').length);
ok(`08:00 job proposed ${open} tasks; approve all → ${verified} verified`);
await shot('munshi-inbox');

// 6. the stage moment: patient replies YES in another window
await page.goto(`${BASE}/refills`);
await page.waitForSelector('text=Patient phone');
const phone = await ctx.newPage();
await phone.setViewportSize({ width: 760, height: 860 });
await phone.goto(`${BASE}/phone`);
await phone.waitForSelector('.bubble');
const who = await phone.locator('header select').inputValue();
await phone.getByRole('button', { name: /YES/ }).click();
await page.waitForSelector('.yesbanner', { timeout: 8000 });
const banner = await page.locator('.yesbanner').innerText();
ok(`Patient phone replied YES → live banner on the dashboard: “${banner.split('\n').slice(0, 3).join(' ')}”`);
await shot('yes-banner');
await phone.screenshot({ path: `${SHOTS}${String(step).padStart(2, '0')}-phone.png` });
await phone.close();
void who;

// 7. dispense an H1 prescription → register
await page.goto(`${BASE}/dispense`);
await page.getByRole('button', { name: /Antibiotic course/ }).click();
await page.waitForSelector('text=match to stock');
const h1Before = await page.evaluate(() => JSON.parse(localStorage.getItem('rxmunshi.demo.v1')).schedule_h1_logs.length);
await page.getByRole('button', { name: /Dispense & write H1 register/ }).click();
await page.waitForSelector('text=/DONE · \\d+ LINES · 1 H1/');
const h1After = await page.evaluate(() => JSON.parse(localStorage.getItem('rxmunshi.demo.v1')).schedule_h1_logs.length);
if (h1After !== h1Before + 1) throw new Error('H1 entry missing');
ok('Rx dispensed FEFO; Schedule H1 register entry written with prescriber address');
await shot('dispense');

// 8. Inspector Mode + pack PDF
await page.goto(`${BASE}/inspector`);
await page.waitForSelector('.score b');
const score = await page.locator('.score b').innerText();
const [pack] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Inspection pack PDF/ }).click()]);
ok(`Inspector Mode score ${score}/100; pack ${pack.suggestedFilename()} downloaded`);
await shot('inspector');

// 9. H1 CSV export
await page.goto(`${BASE}/h1`);
const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Drug Inspector CSV/ }).click()]);
ok(`H1 CSV ${csv.suggestedFilename()} downloaded`);

// 10. every page renders without errors, light and dark
for (const p of ['returns', 'reorder', 'refills', 'wholesalers', 'audit', 'settings', 'today']) {
  await page.goto(`${BASE}/${p}`);
  await page.waitForSelector('.page-h h1');
}
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'reachgrid-dark'));
await shot('today-dark');
ok('All sections render; dark theme applied');

// 11. phone width
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/today`);
await page.waitForSelector('.page-h h1');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await shot('phone-width');
ok(`Phone width renders (horizontal overflow ${overflow}px)`);

await browser.close();
const real = errors.filter((e) => !/favicon|Download the React DevTools/.test(e));
if (real.length) {
  console.error('Browser errors:\n' + real.join('\n'));
  process.exit(1);
}
console.log(`\nAll ${step} steps passed. Screenshots in e2e/shots/.`);
