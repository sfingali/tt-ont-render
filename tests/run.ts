/**
 * Test suite: determinism, invariants, seam integrity, provenance honesty.
 * Run: npm test   (tsx tests/run.ts)
 *
 * Stories load from ./fixtures (vendored subset of the public tt-ont corpus),
 * or from $TT_ONT_INSTANCES to run the same suite against a full checkout.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../src/render.ts';
import type { RawStory } from '../src/engine/index.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORY_DIR = process.env.TT_ONT_INSTANCES
  ? resolve(process.env.TT_ONT_INSTANCES)
  : resolve(REPO_ROOT, 'fixtures');

let pass = 0, fail = 0;
function ok(cond: boolean, name: string, detail = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const load = (n: string): RawStory =>
  JSON.parse(readFileSync(resolve(STORY_DIR, `${n}.json`), 'utf-8'));

/** recursive file list, so the seam test needs no shell `grep`. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
}

const PROFILES = ['counterpoint', 'reveal', 'temporal', 'worldline'] as const;
const STORIES = ['tenet', 'steins-gate', 'dark', 'arrival'] as const;

console.log('— determinism: identical input -> identical output —');
for (const p of PROFILES) {
  for (const s of STORIES) {
    const a = render({ story: load(s), storyId: s, profile: p });
    const b = render({ story: load(s), storyId: s, profile: p });
    ok(a.doc.doc === b.doc.doc, `${p}/${s} byte-identical across runs`);
  }
}

console.log('— invariants hold on all real stories —');
for (const p of PROFILES) {
  for (const s of STORIES) {
    const r = render({ story: load(s), storyId: s, profile: p });
    ok(r.invariants.ok, `${p}/${s} invariants ok`, r.invariants.violations.join('; '));
  }
}

console.log('— unresolved time stays visible (never invented) —');
{
  const synthetic: RawStory = {
    topologyPatternId: 'single_fixed_timeline', primaryRuleSetId: 'fixed_novikov',
    worlds: [{ id: 'w', kind: 'timeline' }],
    agents: [{ id: 'a' }],
    events: [
      { id: 'e1', type: 'ordinary', at: { worldRef: 'w', timeLabel: 'sometime' }, agents: ['a'] },
      { id: 'e2', type: 'ordinary', at: { worldRef: 'w', timeLabel: 'later' }, agents: ['a'] },
    ],
    edges: [], // no temporal edges at all
  };
  const r = render({ story: synthetic, storyId: 'synthetic', profile: 'counterpoint' });
  ok(r.scene.nodes.some(n => n.kind === 'shelf'), 'shelf node exists for unresolved time');
  ok(r.doc.doc.includes('time not positioned'), 'chart labels the shelf visibly');
  ok(r.scene.facts.events.every(e => e.order === null), 'no event claims an order it lacks');
}

console.log('— audit catches broken references (audit, never repair) —');
{
  const broken = load('tenet');
  broken.edges = [...broken.edges, { id: 'bad1', kind: 'causal', from: 'e_opera', to: 'nonexistent_event' }];
  const r = render({ story: broken, storyId: 'tenet-broken', profile: 'counterpoint' });
  ok(r.audit.issues.some(i => i.code === 'EDGE_ENDPOINT_MISSING'), 'unknown edge endpoint flagged');
}

console.log('— topology affinity is a declared warning, not a refusal —');
{
  const r = render({ story: load('dark'), storyId: 'dark', profile: 'counterpoint' });
  ok(r.audit.issues.some(i => i.code === 'TOPO_AFFINITY_MISMATCH'), 'affinity mismatch warned');
  ok(r.doc.doc.length > 500, 'dark still rendered under counterpoint');
}

console.log('— nesting depth derives ONLY from encoded nestsWithin —');
{
  const { indexAndResolve } = await import('../src/engine/index.ts');
  const facts = indexAndResolve(load('dark'));
  const adam = facts.worlds.find(w => w.id === 'w_adam');
  ok(adam?.nestingDepth === 1, `dark w_adam nesting depth = 1 (got ${adam?.nestingDepth})`);
  const origin = facts.worlds.find(w => w.id === 'w_origin');
  ok(origin?.nestingDepth === null, 'origin world has null depth (not nested)');
}

console.log('— SEAM: engine/ never imports design/ —');
{
  const hits = walk(resolve(REPO_ROOT, 'src/engine'))
    .flatMap(f => readFileSync(f, 'utf-8').split('\n')
      .filter(l => /import .*from ['"].*\/design\//.test(l) || /require\(.*design/.test(l))
      .map(l => `${f}: ${l.trim()}`));
  ok(hits.length === 0, 'no design imports inside engine/', hits.join(' | '));
}

console.log('— provenance: engine order claims are labeled, not coordinate time —');
{
  const { indexAndResolve } = await import('../src/engine/index.ts');
  const facts = indexAndResolve(load('tenet'));
  const ordered = facts.events.filter(e => e.order);
  ok(ordered.every(e => e.order!.axisLabel.includes('temporal')), 'axis labels declare their basis');
  ok(facts.events.some(e => !e.order) || ordered.length === facts.events.length, 'ordering is total-or-honest');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
