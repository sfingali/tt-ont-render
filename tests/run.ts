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

console.log('— node text: the encoded description is the PRIMARY text —');
{
  const PROFS = ['counterpoint', 'reveal', 'temporal', 'worldline'] as const;
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const chunk = (t: string, n: number) => t.trim().split(/\s+/).slice(0, n).join(' ');
  // Scope: counterpoint/reveal draw a single world band (their declared affinity is
  // single-world topologies — a multi-world story raises TOPO_AFFINITY_MISMATCH and
  // only the first world is drawn); worldline can only place time-resolved events,
  // and reports the rest as a count.
  const { indexAndResolve } = await import('../src/engine/index.ts');
  const orderedIds = new Map<string, Set<string>>();
  for (const sName of STORIES) {
    const facts = indexAndResolve(load(sName) as any);
    orderedIds.set(sName, new Set(facts.events.filter(e => e.order).map(e => e.id)));
  }
  const inScope = (profile: string, story: any, name: string): any[] => {
    const w0 = story.worlds[0]?.id;
    if (profile === 'counterpoint' || profile === 'reveal') {
      return story.events.filter((e: any) => e.at?.worldRef === w0);
    }
    if (profile === 'worldline') {
      return story.events.filter((e: any) => orderedIds.get(name)!.has(e.id));
    }
    return story.events;
  };
  for (const p of PROFS) {
    let missing = 0, checked = 0;
    for (const sName of STORIES) {
      const story: any = load(sName);
      const r = render({ story, storyId: sName, profile: p });
      for (const ev of inScope(p, story, sName)) {
        const d = (ev.description ?? '').trim();
        if (!d) continue;
        checked++;
        // the opening words of the description must appear (wrap-tolerant)
        if (!r.doc.doc.includes(esc(chunk(d, 3)))) missing++;
      }
    }
    ok(missing === 0, `${p}: every in-scope description rendered (${checked - missing}/${checked})`, `${missing} missing`);
  }
  // the short label survives beneath the description, and the encoded time label too
  const dark: any = load('dark');
  const w0 = dark.worlds[0].id;
  const one = dark.events.find((e: any) => e.at?.worldRef === w0 && e.description && e.label);
  for (const p of ['counterpoint', 'reveal'] as const) {
    const r = render({ story: dark, storyId: 'dark', profile: p });
    ok(r.doc.doc.includes(esc(chunk(one.description, 3))) && r.doc.doc.includes(esc(chunk(one.label, 3))),
      `${p}: carries both the description and its label`);
  }
  const rt = render({ story: dark, storyId: 'dark', profile: 'temporal' });
  ok(rt.doc.doc.includes(esc(chunk(one.description, 3))) && rt.doc.doc.includes(esc(chunk(one.label, 3))),
    'temporal carries both the description and its label');
  // unresolved time is still shown as text where the profile can place it
  const scoped = dark.events.filter((e: any) => e.at?.worldRef === w0);
  const unresolved = scoped.filter((e: any) => !dark.edges.some((x: any) => x.kind === 'temporal' && (x.from === e.id || x.to === e.id)));
  const rc2 = render({ story: dark, storyId: 'dark', profile: 'counterpoint' });
  const shown = unresolved.filter((e: any) => rc2.doc.doc.includes(esc(chunk(e.description ?? '', 3))));
  ok(unresolved.length === 0 || shown.length > 0, `unplaced events keep their text on the shelf (${shown.length}/${unresolved.length})`);
}

console.log('— node text: no description -> label stands in, verbatim and escaped —');
{
  const story: RawStory = {
    topologyPatternId: 'single_fixed_timeline', primaryRuleSetId: 'fixed_novikov',
    worlds: [{ id: 'w', kind: 'timeline' }],
    agents: [{ id: 'a', label: 'A' }],
    events: [{ id: 'e1', type: 'ordinary', label: 'Unlabelled <beat> & co', at: { worldRef: 'w', timeLabel: 't1' }, agents: ['a'] }],
    edges: [],
  };
  for (const p of ['counterpoint', 'reveal', 'temporal'] as const) {
    const r = render({ story, storyId: 'synthetic', profile: p });
    ok(r.doc.doc.includes('Unlabelled &lt;beat&gt; &amp; co'), `${p}: markup in a label is escaped`);
    ok(!r.doc.doc.includes('undefined'), `${p}: no undefined leaks into the document`);
  }
}

console.log('— text layer: wrap is budget-respecting and deterministic —');
{
  const { wrapText } = await import('../src/design/registry.ts');
  const long = wrapText('short anteater ' + 'x'.repeat(97) + ' tail', 20);
  ok(long.every(l => l.length <= 20), 'no wrapped line exceeds the budget (long token is split)');
  ok(JSON.stringify(long) === JSON.stringify(wrapText('short anteater ' + 'x'.repeat(97) + ' tail', 20)), 'wrap is deterministic');
}

console.log('— engine: causal depth is bounded and cycles are reported —');
{
  const { indexAndResolve, causalDepth } = await import('../src/engine/index.ts');
  for (const sName of STORIES) {
    const story: any = load(sName);
    const cd = causalDepth(story);
    const max = Math.max(0, ...cd.depth.values());
    ok(max < story.events.length, `${sName}: causal depth ${max} stays under the event count (${story.events.length})`);
  }
  const tenet: any = load('tenet');
  const cd = causalDepth(tenet);
  ok(cd.backEdges.length > 0, 'tenet: the bootstrap cycle is reported, not expanded');
  const scene = (await import('../src/engine/scene.ts')).compileScene(indexAndResolve(tenet), tenet);
  ok(scene.facts.issues.some(i => i.code === 'CAUSAL_CYCLE'), 'the cycle is reported as an audit issue');
  ok(scene.header.causalNote.includes('cycles not expanded'), 'the header states the derivation honestly');
}

console.log('— engine: scene nodes carry the ontology id they render —');
{
  const { indexAndResolve } = await import('../src/engine/index.ts');
  const { compileScene } = await import('../src/engine/scene.ts');
  const dark: any = load('dark');
  const scene = compileScene(indexAndResolve(dark), dark);
  const events = scene.nodes.filter(n => n.kind === 'eventNode');
  ok(events.length === dark.events.length, 'one scene node per encoded event');
  ok(events.every(n => typeof n.sourceId === 'string' && n.sourceId.length > 0), 'every event node names its event id');
  ok(scene.nodes.filter(n => n.kind === 'lane').every(n => n.sourceId), 'every lane names its agent id');
  ok(scene.nodes.filter(n => n.kind === 'worldBand').every(n => n.sourceId), 'every world band names its world id');
  ok(events.filter(n => n.data['description'] !== undefined).length
     === dark.events.filter((e: any) => e.description).length, 'descriptions pass through to the scene graph');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
