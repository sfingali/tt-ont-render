#!/usr/bin/env node
/**
 * Smoke test the built GUI in a real browser: load the page, pick a corpus story,
 * switch profiles, and report what actually rendered.
 *
 *   node web/smoke.mjs <baseUrl> [outDir]
 *
 * Needs playwright-core and a Chrome path (env CHROME=/path/to/chrome), which are
 * deliberately NOT dependencies of this package — this is a one-off check, not CI.
 */
// playwright-core is not a dependency of this package; point PLAYWRIGHT at it
// (PLAYWRIGHT=/path/to/playwright-core/index.js) or have it resolvable normally.
const pw = await import(process.env.PLAYWRIGHT ?? 'playwright-core');
const chromium = pw.chromium ?? pw.default?.chromium;   // playwright-core is CJS

const base = process.argv[2] ?? 'http://127.0.0.1:8099';
const outDir = process.argv[3] ?? '/tmp';
const EXEC = process.env.CHROME;
if (!EXEC) { console.error('set CHROME=/path/to/chrome'); process.exit(1); }

const browser = await chromium.launch({ executablePath: EXEC, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`page: ${e.message}`));

await page.goto(base, { waitUntil: 'load' });
await page.waitForSelector('#stories li', { timeout: 15000 });
const count = await page.locator('#stories li').count();

const names = ['Tenet', 'Arrival', 'Dark'];
for (const name of names) {
  await page.locator('#stories li', { hasText: name }).first().click();
  await page.waitForTimeout(500);
}
const facts = await page.locator('#facts').innerText();
const audit = await page.locator('#audit').innerText();
const auditBox = await page.locator('#audit').boundingBox();
const factsBox = await page.locator('#facts').boundingBox();
if (!auditBox || auditBox.width < 320) problems.push(`audit column squeezed: ${auditBox?.width}px`);
if (!factsBox || factsBox.width > 900) problems.push(`facts column hogging the strip: ${factsBox?.width}px`);
const svg = await page.locator('#canvas svg').first();
const dims = { w: await svg.getAttribute('width'), h: await svg.getAttribute('height') };
await page.screenshot({ path: `${outDir}/gui-counterpoint.png` });

// 2.5D
await page.locator('.prof', { hasText: 'Temporal Section' }).click();
await page.waitForTimeout(600);
const dims2 = { w: await page.locator('#canvas svg').first().getAttribute('width'), h: await page.locator('#canvas svg').first().getAttribute('height') };
await page.screenshot({ path: `${outDir}/gui-temporal.png` });

// 3D (iframe)
await page.locator('.prof', { hasText: 'Worldline Loom' }).click();
await page.waitForTimeout(6000);
const frameVisible = await page.locator('#frame').isVisible();
await page.screenshot({ path: `${outDir}/gui-worldline.png` });

// dropped local file
await page.setInputFiles('#file', { name: 'tenet.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ topologyPatternId: 'single_fixed_timeline', primaryRuleSetId: 'fixed_novikov', worlds: [{ id: 'w', kind: 'timeline' }], agents: [{ id: 'a', label: 'A' }], events: [{ id: 'e1', type: 'ordinary', label: 'Hand-rolled beat', description: 'A local file renders like any other scheme, straight off the disk.', at: { worldRef: 'w', timeLabel: 't1' }, agents: ['a'] }], edges: [] })) });
await page.locator('.prof', { hasText: 'Counterpoint' }).click();
await page.waitForTimeout(700);
const localFacts = await page.locator('#facts').innerText();
const localHasText = (await page.locator('#canvas').innerText().catch(() => '')) || (await page.content()).includes('local file renders like any other scheme');
await page.screenshot({ path: `${outDir}/gui-local-file.png` });

console.log(JSON.stringify({ corpusItems: count, auditWidth: auditBox?.width, factsWidth: factsBox?.width, tenetDims: dims, dark2dDims: dims2, frameVisible, facts, audit: audit.split('\n').slice(0, 4), localFacts: localFacts.split('\n').slice(0, 6), localHasText, problems }, null, 1));
await browser.close();
process.exit(problems.length ? 1 : 0);
