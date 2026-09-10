#!/usr/bin/env node
/**
 * Build the browser GUI into web/dist/.
 *
 *   node web/build.mjs            # bundle + corpus + shell
 *   node web/build.mjs --no-corpus
 *
 * The renderer is the SAME code the CLI runs: esbuild bundles src/render.ts
 * (engine + design profiles) for the browser. Nothing in src/engine or
 * src/design imports a Node builtin, so the bundle is clean by construction —
 * if that ever stops being true this build fails loudly.
 */
import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = join(HERE, 'dist');
const WITH_CORPUS = !process.argv.includes('--no-corpus');

// corpus: the sibling ontology repo when present, else the vendored fixtures
const CORPUS_SRC = existsSync(join(ROOT, '..', 'tt-ont', 'instances'))
  ? join(ROOT, '..', 'tt-ont', 'instances')
  : join(ROOT, 'fixtures');

await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, 'corpus'), { recursive: true });

const result = await build({
  entryPoints: [join(ROOT, 'src', 'render.ts')],
  outfile: join(DIST, 'renderer.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: false,
  sourcemap: true,
  metafile: true,
  logLevel: 'warning',
});

const inputs = Object.keys(result.metafile.inputs);
const nodeOnly = inputs.filter(p => /node:/.test(p) || /(^|\/)cli\.ts$/.test(p));
if (nodeOnly.length) {
  console.error(`build: refusing to ship a browser bundle that pulls in Node-only modules:\n  ${nodeOnly.join('\n  ')}`);
  process.exit(1);
}

await cp(join(HERE, 'index.html'), join(DIST, 'index.html'));
await cp(join(HERE, 'app.js'), join(DIST, 'app.js'));
await cp(join(HERE, 'style.css'), join(DIST, 'style.css'));
await cp(join(HERE, 'favicon.svg'), join(DIST, 'favicon.svg'));

let manifest = [];
if (WITH_CORPUS) {
  const files = (await readdir(CORPUS_SRC)).filter(f => f.endsWith('.json') && f !== 'manifest.json');
  for (const f of files) {
    const raw = await readFile(join(CORPUS_SRC, f), 'utf-8');
    let story;
    try { story = JSON.parse(raw); } catch { continue; }
    const id = f.replace(/\.json$/, '');
    await writeFile(join(DIST, 'corpus', `${id}.json`), raw);
    manifest.push({
      id,
      title: story.meta?.title ?? id,
      topology: story.topologyPatternId ?? '',
      physics: story.primaryRuleSetId ?? '',
      worlds: story.worlds?.length ?? 0,
      events: story.events?.length ?? 0,
      described: (story.events ?? []).filter(e => e.description).length,
      bytes: raw.length,
    });
  }
  manifest.sort((a, b) => a.title.localeCompare(b.title));
  await writeFile(join(DIST, 'corpus', 'manifest.json'), JSON.stringify(manifest, null, 1));
}

const bytes = (await readdir(DIST, { withFileTypes: true })).length;
console.log(`built web/dist — renderer.js ${Object.keys(result.metafile.outputs).length ? '' : ''}from ${inputs.length} modules · ${manifest.length} corpus files · ${bytes} top-level entries`);
console.log(`  source: ${CORPUS_SRC}`);
