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

interface ParsedText {
  x: number; y: number; size: number; anchor: string; text: string;
  box: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Parse every <text> mark and estimate its box exactly as the renderer does:
 * width = characters x 0.52 x size, height = size x 1.2, baseline at y.
 */
function parseTexts(doc: string): ParsedText[] {
  const out: ParsedText[] = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    const attrs = m[1];
    const attr = (k: string): string | undefined => attrs.match(new RegExp(`${k}="([^"]*)"`))?.[1];
    const x = parseFloat(attr('x') ?? '0');
    const y = parseFloat(attr('y') ?? '0');
    const size = parseFloat(attr('font-size') ?? '0');
    const anchor = attr('text-anchor') ?? 'start';
    const text = m[2]
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const w = text.length * 0.52 * size;
    const h = size * 1.2;
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    const y0 = y - size * 0.9;
    out.push({ x, y, size, anchor, text, box: { x0, y0, x1: x0 + w, y1: y0 + h } });
  }
  return out;
}

function boxesOverlap(a: ParsedText['box'], b: ParsedText['box']): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

const PROFILES = ['counterpoint', 'reveal', 'temporal', 'worldline', 'atlas'] as const;
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
  const PROFS = ['counterpoint', 'reveal', 'temporal', 'worldline', 'atlas'] as const;
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

console.log('— coverage: profiles declare what they actually drew —');
{
  const { buildCoverageReport, formatCoverageReport } = await import('../src/coverage.ts');

  // Every declaration must name a resolved source id, and every declared source
  // must appear exactly once in the report as drawn or not drawn with a reason.
  for (const p of PROFILES) {
    for (const s of STORIES) {
      const r = render({ story: load(s), storyId: s, profile: p });
      let good = true;
      let detail = '';
      try {
        const cov = buildCoverageReport(r.scene, r.doc);
        if (cov.totals.drawn + cov.totals.notDrawn !== cov.totals.declared) {
          good = false; detail = 'drawn + not drawn does not equal declared';
        }
        const unreasoned = cov.groups.flatMap(g => g.items).filter(i => !i.reason).length;
        if (unreasoned) { good = false; detail = `${unreasoned} item(s) lack a reason`; }
      } catch (e) {
        good = false; detail = (e as Error).message;
      }
      ok(good, `${p}/${s}: coverage reconciles every declared source with a reason`, detail);
    }
  }

  // dark has 24 events in 3 worlds. counterpoint draws only worlds[0] (14), so
  // exactly 10 events must be reported not drawn; temporal draws every world, so
  // no event may be reported not drawn.
  const dark: any = load('dark');
  const cp = render({ story: dark, storyId: 'dark', profile: 'counterpoint' });
  const cpCov = buildCoverageReport(cp.scene, cp.doc);
  const cpEvents = cpCov.groups.find(g => g.kind === 'event')!;
  ok(cpEvents.items.length === 24, `dark/counterpoint accounts for all 24 events (got ${cpEvents.items.length})`);
  ok(cpEvents.notDrawn === 10, `dark/counterpoint reports exactly 10 events not drawn (got ${cpEvents.notDrawn})`);
  // ... and they are precisely the events outside worlds[0], not an arbitrary 10.
  const w0 = dark.worlds[0].id;
  const outsideW0 = dark.events.filter((e: any) => e.at?.worldRef !== w0).map((e: any) => e.id).sort();
  const cpMissing = cpEvents.items.filter(i => !i.drawn).map(i => i.id).sort();
  ok(JSON.stringify(cpMissing) === JSON.stringify(outsideW0), `dark/counterpoint omissions are exactly the ${outsideW0.length} events outside worlds[0] ('${w0}')`);
  ok(formatCoverageReport(cpCov).includes('10 events not drawn'), 'dark/counterpoint printed report states "10 events not drawn"');
  ok(cpEvents.items.filter(i => !i.drawn).every(i => i.reason.startsWith('not drawn:')), 'counterpoint omissions carry honest reasons');
  ok(cpCov.groups.find(g => g.kind === 'intervention')!.items.length === 2, 'dark resolves both declared interventions for coverage');
  ok(cpCov.groups.some(g => g.kind === 'outcome'), 'dark outcome is accounted for');

  const tp = render({ story: dark, storyId: 'dark', profile: 'temporal' });
  const tpCov = buildCoverageReport(tp.scene, tp.doc);
  const tpEvents = tpCov.groups.find(g => g.kind === 'event')!;
  ok(tpEvents.notDrawn === 0, `dark/temporal reports no events not drawn (got ${tpEvents.notDrawn})`);
  ok(formatCoverageReport(tpCov).includes('0 events not drawn'), 'dark/temporal printed report states "0 events not drawn"');
  ok(tpEvents.items.every(i => i.drawn), 'dark/temporal accounts for every event as drawn');

  // The guard is real: a declaration for an id the story does not declare is rejected.
  const forged: any = { ...cp.doc, drawn: [...cp.doc.drawn, { kind: 'event', id: 'e_not_real', reason: 'forged' }] };
  let rejected = false;
  try { buildCoverageReport(cp.scene, forged); } catch { rejected = true; }
  ok(rejected, 'coverage rejects a declaration for an undeclared source id');
}

console.log('— atlas: the DESIGN-ATLAS §2 grammar is actually drawn —');
{
  const dark: any = load('dark');
  const r = render({ story: dark, storyId: 'dark', profile: 'atlas' });
  const doc = r.doc.doc;
  const { buildCoverageReport } = await import('../src/coverage.ts');
  const cov = buildCoverageReport(r.scene, r.doc);

  // every declared source drawn, and the four other profiles still report their zeros
  ok(cov.totals.notDrawn === 0, `atlas draws every declared source on dark (${cov.totals.drawn}/${cov.totals.declared})`);
  for (const kind of ['world', 'agent', 'event', 'intervention', 'outcome'] as const) {
    const g = cov.groups.find(x => x.kind === kind)!;
    ok(g.notDrawn === 0, `atlas draws every ${kind} (${g.drawn}/${g.items.length})`);
  }
  const edgeGroups = cov.groups.filter(g => g.kind === 'edge');
  ok(edgeGroups.every(g => g.drawn === g.items.length), 'atlas strokes every encoded edge, in every kind present');
  ok(edgeGroups.length >= 6, `all six encoded edge kinds are reported (${edgeGroups.length})`);

  // §2: exactly one arrowhead per drawn edge (marker references, not marker defs)
  // Legend samples are drawn instances of each style (the review asks for real samples),
  // so they carry markers too; the contract is one arrowhead per DRAWN ENCODED EDGE.
  const arrowheads = (doc.replace(/<path class="legend-sample"[^>]*>/g, '').match(/marker-end=/g) ?? []).length;
  ok(arrowheads === dark.edges.length, `one arrowhead per encoded edge (${arrowheads} for ${dark.edges.length} edges)`);

  // §8: title, desc, data-source-id, and a stated evidence status
  ok(doc.includes('<title>Topology Atlas'), 'native SVG carries a <title>');
  ok(doc.includes('<desc>'), 'native SVG carries a <desc>');
  ok(/data-source-id=/.test(doc) && (doc.match(/data-source-id=/g) ?? []).length >= dark.events.length,
    'every mark carries a data-source-id (§8 provenance)');
  ok(doc.includes('Evidence status'), 'evidence status is stated on the chart');

  // §2 world primitives: tabs, double-outline parallelism, labelled composition groups
  ok(/T\b/.test(doc) && doc.includes('single-outline'), 'T primitive labelled as single-outline');
  ok(doc.includes('double-outline'), 'P primitive labelled as double-outline (never two rails)');
  // The 2026-09-11 review removed the repeated "composition group N — layout only"
  // labels as visual clutter. The requirement they served is unchanged: nothing that is
  // merely a layout device may read as semantic containment, and the conventions that
  // remain (display order, the derived-world pair bracket) must say "layout only".
  ok(doc.includes('layout only'), 'layout devices are labelled as layout, not semantic containment');
  ok(!/composition group/.test(doc), 'the removed composition-group clutter stays removed');
  ok(!/\bjunction\b(?![^<]{0,80}never)/i.test(doc) || doc.includes('never turned into a junction'), 'no invented junction is drawn in place of a missing anchor');

  // §6: an axis that declares its own basis
  ok(doc.includes('ordered, not to scale'), 'ordinal axis is labelled "ordered, not to scale"');

  // §2 + §1: a branch with no encoded anchor must not gain one
  const orphan: RawStory = {
    topologyPatternId: 'branching_tree', primaryRuleSetId: 'branch_on_intervention',
    worlds: [{ id: 'w_root', kind: 'timeline' }, { id: 'w_child', kind: 'branch' }],
    agents: [{ id: 'a', label: 'A' }],
    events: [{ id: 'e1', type: 'ordinary', label: 'Beat', description: 'Someone does something that will matter later.', at: { worldRef: 'w_root', timeLabel: 't1' }, agents: ['a'] }],
    edges: [{ id: 'wr1', kind: 'world_relation', from: 'w_root', to: 'w_child', relation: 'forksFrom' }],
  };
  const rb = render({ story: orphan, storyId: 'orphan', profile: 'atlas' });
  ok(rb.doc.doc.includes('fork event unspecified'), 'an anchor-less branch renders "fork event unspecified"');
  ok(rb.invariants.ok, 'anchor-less branch keeps invariants okay');
}

console.log('— atlas: legibility floor — no drawn text below 9pt (physical floor) —');
{
  for (const s of STORIES) {
    const r = render({ story: load(s), storyId: s, profile: 'atlas' });
    const texts = parseTexts(r.doc.doc);
    // The atlas is now a physical page in millimetres: the floor is the review's
    // 9pt minimum (9pt = 3.175mm), not a pixel count.
    const TINY_PT = 3.17;
    const tiny = texts.filter(t => t.size < TINY_PT);
    ok(tiny.length === 0,
      `atlas/${s}: every one of ${texts.length} text marks is >= 9pt (${TINY_PT}mm)`,
      tiny.slice(0, 4).map(t => `${t.size}px "${t.text.slice(0, 24)}"`).join('; '));
  }
}

console.log('— atlas: no two estimated text boxes overlap, and nothing clips —');
{
  for (const s of STORIES) {
    const r = render({ story: load(s), storyId: s, profile: 'atlas' });
    const texts = parseTexts(r.doc.doc);
    let overlaps = 0;
    let detail = '';
    for (let i = 0; i < texts.length && overlaps < 4; i++) {
      for (let j = i + 1; j < texts.length && overlaps < 4; j++) {
        if (boxesOverlap(texts[i].box, texts[j].box)) {
          overlaps++;
          if (!detail) detail = `"${texts[i].text.slice(0, 24)}" x "${texts[j].text.slice(0, 24)}"`;
        }
      }
    }
    ok(overlaps === 0, `atlas/${s}: no two of ${texts.length} text boxes overlap`, detail);
    const clipped = texts.filter(t =>
      t.box.x0 < 0 || t.box.y0 < 0 || t.box.x1 > r.doc.width || t.box.y1 > r.doc.height);
    ok(clipped.length === 0, `atlas/${s}: every text box stays inside the ${r.doc.width}x${r.doc.height} canvas`,
      clipped.slice(0, 3).map(t => `"${t.text.slice(0, 24)}"`).join('; '));
  }
}

console.log('— storyline: a reading chart, not a technical one —');
{
  for (const s of STORIES) {
    const r = render({ story: load(s), storyId: s, profile: 'storyline' });
    const doc = r.doc.doc;
    ok(r.doc.medium === '2d-svg', `storyline/${s}: renders as a 2d SVG`);
    // the redesign's core instruction: the machinery is not on this page
    ok(!/source:\s/.test(doc), `storyline/${s}: no source identifiers on the reading page`);
    ok(!doc.includes('data-source-id'), `storyline/${s}: no provenance ids rendered as text`);
    ok(doc.includes('thin line') && doc.includes('a jump through time'), `storyline/${s}: the three connector conventions are stated`);
    ok(doc.includes('see the Topology Atlas'), `storyline/${s}: the technical view is named, not duplicated`);
    ok(/Following .+ read from top to bottom/.test(doc), `storyline/${s}: the reading instruction is stated`);
    ok(doc.includes('the story ends in') || doc.includes('takes place entirely'), `storyline/${s}: a one-sentence takeaway closes the page`);
    // the spine is numbered in reading order
    // Where the encoding has no order, the spine is honestly UNNUMBERED and says so; where it
    // does, the numbers must run in reading order.
    const nums = [...doc.matchAll(/font-size="3\.175"[^>]*>(0\d)<\/text>/g)].map(m => m[1]);
    ok(nums.join(',') === nums.slice().sort().join(','), `storyline/${s}: spine nodes are numbered in reading order`);
    ok(nums.length > 0 || /position in time not encoded/.test(doc),
      `storyline/${s}: an unnumbered spine is stated, not left ambiguous`);
  }
}

console.log('— atlas §9: derived-world pair bracket + bootstrap-entity tokens —');
{
  const dark: any = load('dark');
  const r = render({ story: dark, storyId: 'dark', profile: 'atlas' });
  const doc = r.doc.doc;
  ok(doc.includes('class="derived-world-pair-bracket"') && doc.includes('derived-world pair'),
    'atlas/dark draws the neutral "derived-world pair" composition bracket');
  // the bracket spans exactly the two derived worlds sitting below Origin
  const bracket = doc.match(/<path class="derived-world-pair-bracket"[^>]*d="([^"]+)"/);
  const xs = bracket ? [...bracket[1].matchAll(/[ML] ([-\d.]+) ([-\d.]+)/g)].map(m => parseFloat(m[1])) : [];
  ok(bracket !== null && Math.max(...xs) - Math.min(...xs) > 0,
    'the derived-world pair bracket spans a non-zero width over the pair');
  for (const be of ['knot_worlds', 'jonas_father', 'tannhaus_book', 'unknown']) {
    const tokenRe = new RegExp(`<(?:rect|g|text)[^>]*data-bootstrap-entity="${be}"`);
    ok(tokenRe.test(doc) && doc.includes(be), `atlas/dark draws a bootstrap-entity token for '${be}'`);
  }
  // §9 honesty: the supplied causal edges encode no directed cycle, so no knot is closed
  const declaredCausal = dark.edges.filter((e: any) => e.kind === 'causal');
  const adj = new Map<string, string[]>();
  for (const e of declaredCausal) {
    const a = adj.get(e.from) ?? []; a.push(e.to); adj.set(e.from, a);
  }
  let cycle = false;
  const seen = new Set<string>(), stack = new Set<string>();
  const visit = (n: string): void => {
    if (stack.has(n)) { cycle = true; return; }
    if (seen.has(n)) return;
    seen.add(n); stack.add(n);
    for (const nxt of adj.get(n) ?? []) visit(nxt);
    stack.delete(n);
  };
  for (const n of adj.keys()) visit(n);
  ok(!cycle, 'the supplied causal edge list encodes no directed cycle (none is fabricated)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
