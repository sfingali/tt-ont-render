/**
 * DESIGN — "Chronicle" (a landscape timeline, in the familiar convention).
 *
 * Built to the 2026-09-11 redesign review, which rejected both earlier charts: "the reading
 * chart is a synopsis spread across an oversized page; the topology chart is a relationship
 * graph dressed as a timeline. Neither gives time, history, and character movement
 * consistent visual meanings." Its model, implemented here:
 *
 *   horizontal  = calendar time (earlier left; spacing explicitly NOT to scale)
 *   vertical    = a different history
 *   a path between dated points = a character's journey
 *   a separate treatment = history changing
 *
 * THE RULE, ACCEPTED AND MADE MECHANICAL: a fork is a claim about the story's physics, so the
 * form of every world is computed from the DECLARED rule sets, never from the world's kind:
 *   branching physics or a branch-licensing mixin -> coexisting rails, both continuing;
 *   pure mutability  -> a revision: one continuation, the replaced one muted and labelled;
 *   fixed/predestination -> no fork at all.
 * Where a declared world kind is not supported by the declared physics the chart SAYS SO
 * instead of choosing, because both declarations are facts and the reader is entitled to both.
 *
 * Noise is removed by rule: no connector passes through a label; no arrowhead sits on an
 * ordinary bend; chronological succession gets no edge at all (the rail says it); every drawn
 * connector answers one question - who travelled, what changed, or which history changed.
 * Paragraph cards are gone: a marker and an unboxed two-line label. Sources, registries,
 * coverage and audit live in the Topology Atlas, named at the foot of this page.
 */

import type { FactEdge, FactEvent, FactWorld, SemanticScene } from '../engine/types.js';
import type { DesignProfile, DrawnSource, RenderDoc, ThemeSpec } from './registry.js';
import { declareDrawn, esc, textWidth, wrapText } from './registry.js';

const PT = 0.352778;
const pt = (n: number): number => n * PT;

interface Format { id: string; w: number; h: number }
// Landscape, per the review's 16:9 intent; the page grows horizontally if the material needs it.
const FORMATS: Format[] = [
  { id: 'A2 landscape', w: 594, h: 420 },
  { id: 'A1 landscape', w: 841, h: 594 },
];

const MARGIN = 14;
const RAIL_GAP = 46;                 // vertical distance between history rails (150-200px equivalent)
const AXIS_PAD_L = 46, AXIS_PAD_R = 26;
const C = {
  bg: '#FBFBFC', ink: '#1F2933', grey: '#9AA5B1', muted: '#CBD2D9',
  teal: '#0F766E', blue: '#2563EB', amber: '#C45514', rule: '#E4E7EB', pale: '#EEF2F7',
};
const T = {
  title: pt(30), subtitle: pt(12.5), railName: pt(11.5), node: pt(14), date: pt(12),
  axis: pt(11), key: pt(10), travel: pt(11), detail: pt(10),
};

const BRANCHY = ['branch', 'multiverse', 'tangent', 'fork', 'prune'];
const FIXED = ['fixed', 'predestination', 'novikov', 'closed_loop'];

export const chronicle: DesignProfile = {
  id: 'chronicle',
  label: 'Chronicle',
  medium: '2d-svg',
  topoAffinity: [],

  render(scene: SemanticScene, theme: ThemeSpec): RenderDoc {
    void theme;
    const facts = scene.facts;
    const drawn: DrawnSource[] = [];
    const shapes: string[] = [];
    const texts: string[] = [];
    let declareOn = false;

    const year = (s: string | undefined): number | null => {
      const m = (s ?? '').match(/\b(1[89]\d{2}|20\d{2})\b/);
      return m ? parseInt(m[1], 10) : null;
    };
    const byId = (id: string): FactEvent | undefined => facts.events.find(e => e.id === id);

    // ---------------------------------------------------------------- the rule, computed
    const physics = [facts.primaryRuleSetId, ...facts.mixinRuleSetIds].join(' ').toLowerCase();
    const branching = BRANCHY.some(k => physics.includes(k));
    const fixed = !branching && FIXED.some(k => physics.includes(k));
    const mode: 'branching' | 'revision' | 'fixed' = branching ? 'branching' : fixed ? 'fixed' : 'revision';

    // ---------------------------------------------------------------- cast and worlds
    const countOf = (aid: string): number => facts.events.filter(e => e.agents.includes(aid)).length;
    const lead = [...facts.agents].sort((a, b) => (b.continuityRole === 'primary' ? 1 : 0) - (a.continuityRole === 'primary' ? 1 : 0)
      || countOf(b.id) - countOf(a.id))[0];
    const follows = !!lead && countOf(lead.id) > 0;
    const hero = { id: follows ? lead!.id : '', name: lead?.label ?? 'the encoded order' };
    const eventsOf = (w: FactWorld): FactEvent[] => facts.events.filter(e => e.worldRef === w.id && (!follows || e.agents.includes(hero.id)));

    const endWorlds = facts.outcome?.endWorldRefs ?? [];
    const visited = facts.worlds.filter(w => eventsOf(w).length > 0);
    const chapters = [...visited.filter(w => !endWorlds.includes(w.id)), ...visited.filter(w => endWorlds.includes(w.id))];

    // a world the encoding itself marks as unrealised is a threatened state, not a history:
    // it is drawn as a dashed consequence band, and this is the encoding's own wording.
    const isThreat = (w: FactWorld): boolean => /threat|alternate/i.test(`${w.label ?? ''} ${w.spanLabel ?? ''}`) && !endWorlds.includes(w.id);
    const rails = chapters.filter(w => !isThreat(w));
    const threats = chapters.filter(isThreat);
    const offSpine = facts.worlds.filter(w => !chapters.some(c => c.id === w.id));

    // physics vs kind: report, never silently resolve
    const mismatches: string[] = [];
    for (const w of facts.worlds) {
      const kindBranchy = w.kind === 'branch' || w.kind === 'parallel_world';
      if (kindBranchy && mode === 'fixed') mismatches.push(`${w.id} is declared a ${w.kind}, but the declared physics (${facts.primaryRuleSetId}) supports no branch`);
      if (w.kind === 'parallel_world' && mode === 'revision') mismatches.push(`${w.id} is declared a parallel_world, but the declared physics (${facts.primaryRuleSetId}) describes one mutable history`);
      if (w.kind === 'timeline' && mode === 'branching' && w.forkEventRef) mismatches.push(`${w.id} is declared a timeline though it forks`);
    }

    // spine numbering, shared with the reading chart so a number means the same event in both
    const spine: { ev: FactEvent; world: FactWorld; n: number }[] = [];
    let n = 0;
    for (const w of chapters) {
      const list = eventsOf(w).filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal);
      for (const e of list) { n += 1; spine.push({ ev: e, world: w, n }); }
      for (const e of eventsOf(w).filter(e2 => !e2.order)) { spine.push({ ev: e, world: w, n: 0 }); }
    }
    const numOf = new Map(spine.filter(s => s.n).map(s => [s.ev.id, s.n]));

    // journeys: encoded temporal edges are movement through time; causal edges are ripples
    const journeys = facts.edges.filter(e => e.kind === 'temporal' && byId(e.from) && byId(e.to));
    const ripples = facts.edges.filter(e => e.kind === 'causal' && byId(e.from) && byId(e.to));
    const forks = facts.worldRelations.filter(e => /fork/i.test(`${e.relation ?? ''}`));

    // ---------------------------------------------------------------- layout
    const layoutFor = (fmt: Format) => {
      const pageW = fmt.w, pageH = fmt.h;
      const axisX0 = MARGIN + AXIS_PAD_L, axisX1 = pageW - MARGIN - AXIS_PAD_R;
      const axisW = axisX1 - axisX0;
      const years = spine.map(s => year(s.ev.timeLabel ?? s.world.spanLabel)).filter((v): v is number => v !== null);
      const yMin = years.length ? Math.min(...years) : 0;
      const yMax = years.length ? Math.max(...years) : Math.max(1, spine.length - 1);
      const useYears = years.length >= 2 && yMax > yMin;
      const axisLabel = useYears
        ? 'Calendar order; spacing not to scale'
        : 'Encoded order along this axis; calendar spacing not established';
      const xOf = (e: FactEvent, w: FactWorld): number => {
        if (useYears) {
          const t = year(e.timeLabel ?? w.spanLabel) ?? yMin;
          return axisX0 + ((t - yMin) / (yMax - yMin)) * axisW;
        }
        const idx = spine.findIndex(s => s.ev.id === e.id);
        return axisX0 + (spine.length > 1 ? (idx / (spine.length - 1)) : 0.5) * axisW;
      };

      const body: string[] = [];
      const title = (facts.storyId || 'untitled').split(/[-_]+/).filter(Boolean).map(x => x[0].toUpperCase() + x.slice(1)).join(' ');
      body.push(`<text x="${MARGIN}" y="${(MARGIN + T.title * 0.85).toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.title}" font-weight="700" fill="${C.ink}">${esc(title)}</text>`);
      const modeLine = mode === 'branching'
        ? `Declared physics: ${facts.primaryRuleSetId} — interventions create branches, so both histories continue.`
        : mode === 'fixed'
          ? `Declared physics: ${facts.primaryRuleSetId} — time is fixed, so no fork is drawn; a declared branch is shown as a consequence.`
          : `Declared physics: ${facts.primaryRuleSetId} — one mutable history: the replaced continuation is muted, not a second universe.`;
      body.push(`<text x="${MARGIN}" y="${(MARGIN + T.title * 0.85 + T.subtitle * 1.6).toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.subtitle}" fill="${C.grey}">${esc(modeLine)}</text>`);

      const railTop = MARGIN + T.title + T.subtitle * 1.8 + 26;
      const outboundY = railTop - 16;                    // dedicated travel corridor ABOVE the rails
      const railYOf = new Map<string, number>();
      rails.forEach((w, i) => railYOf.set(w.id, railTop + i * RAIL_GAP));
      const inboundY = railTop + Math.max(0, rails.length - 1) * RAIL_GAP + 22;   // corridor BELOW
      const axisY = railTop + Math.max(0, rails.length - 1) * RAIL_GAP + 8;

      // rails and their names
      rails.forEach((w, i) => {
        const y = railYOf.get(w.id)!;
        const isEnd = endWorlds.includes(w.id);
        const colour = i === 0 ? C.grey : isEnd ? C.teal : C.grey;
        body.push(`<line x1="${axisX0}" y1="${y.toFixed(2)}" x2="${axisX1}" y2="${y.toFixed(2)}" stroke="${colour}" stroke-width="0.8"/>`);
        // under a revision, the original rail continues only as a muted, labelled trace
        if (i === 0 && mode === 'revision') {
          const cut = Math.max(axisX0 + axisW * 0.25, axisX0);
          body.push(`<line x1="${cut.toFixed(2)}" y1="${(y + 3.2).toFixed(2)}" x2="${axisX1}" y2="${(y + 3.2).toFixed(2)}" stroke="${C.muted}" stroke-width="0.7" stroke-dasharray="2.4 2"/>`);
          body.push(`<text x="${(axisX1).toFixed(2)}" y="${(y + 6.4).toFixed(2)}" text-anchor="end" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.key}" fill="${C.grey}">replaced continuation — not a second universe</text>`);
        }
        const name = w.spanLabel ?? w.label ?? w.id;
        body.push(`<text x="${MARGIN}" y="${(y + 1.4).toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.railName}" font-weight="600" fill="${C.ink}">${esc(name.slice(0, 26))}</text>`);
        body.push(`<text x="${MARGIN}" y="${(y + 5.4).toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.key}" fill="${C.grey}">${esc(i === 0 ? 'history as first shown' : isEnd ? 'history as it ends' : 'history in between')}</text>`);
      });

      // axis
      body.push(`<line x1="${axisX0}" y1="${axisY.toFixed(2)}" x2="${axisX1}" y2="${axisY.toFixed(2)}" stroke="${C.rule}" stroke-width="0.5"/>`);
      body.push(`<text x="${axisX0}" y="${(axisY + 5).toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.axis}" fill="${C.grey}">${esc(axisLabel)}</text>`);
      if (useYears) {
        for (const t of [yMin, yMax]) {
          const x = axisX0 + ((t - yMin) / (yMax - yMin)) * axisW;
          body.push(`<text x="${x.toFixed(2)}" y="${(axisY + 5).toFixed(2)}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.axis}" font-weight="600" fill="${C.ink}">${t}</text>`);
        }
        if (yMax - yMin >= 10) {
          const xm = (axisX0 + axisX1) / 2;
          body.push(`<text x="${xm.toFixed(2)}" y="${(axisY - 1.6).toFixed(2)}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.axis}" fill="${C.grey}">//</text>`);
        }
      }

      // event markers with unboxed two-line labels, alternating above and below the rail
      let alt = 0;
      for (const s of spine) {
        const y = railYOf.get(s.world.id);
        if (y === undefined) continue;
        const x = xOf(s.ev, s.world);
        const above = (alt++ % 2) === 0;
        body.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="${C.bg}" stroke="${C.ink}" stroke-width="0.7"/>`);
        if (s.n) body.push(`<text x="${x.toFixed(2)}" y="${(y + 1.1).toFixed(2)}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.key}" font-weight="700" fill="${C.ink}">${s.n}</text>`);
        const stem = above ? -2.2 : 2.2;
        body.push(`<line x1="${x.toFixed(2)}" y1="${(y + stem).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(y + stem * 2.4).toFixed(2)}" stroke="${C.grey}" stroke-width="0.5"/>`);
        const labelY = above ? y - 8.4 : y + 8.4;
        const head = (s.ev.label ?? s.ev.id).slice(0, 30);
        body.push(`<text x="${x.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.node}" font-weight="600" fill="${C.ink}">${esc(head)}</text>`);
        if (s.ev.timeLabel) body.push(`<text x="${x.toFixed(2)}" y="${(labelY + (above ? -4.4 : 4.4)).toFixed(2)}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.date}" fill="${C.grey}">${esc(s.ev.timeLabel.slice(0, 26))}</text>`);
        if (declareOn) declareDrawn(drawn, 'event', s.ev.id, `chronicle marker ${s.n || '(unordered)'}: numbered marker on its history rail with an unboxed headline and date, positioned by calendar time`);
      }

      // interventions as diamonds at the event they act on (they start the ripples)
      for (const iv of facts.interventions) {
        const target = iv.eventId ? byId(iv.eventId) : undefined;
        const world = target ? facts.worlds.find(w => w.id === target.worldRef) : undefined;
        const y = world ? railYOf.get(world.id) : undefined;
        if (!target || y === undefined) continue;
        const x = xOf(target, world!);
        body.push(`<path d="M ${x.toFixed(2)} ${(y - 3.2).toFixed(2)} L ${(x + 3.2).toFixed(2)} ${y.toFixed(2)} L ${x.toFixed(2)} ${(y + 3.2).toFixed(2)} L ${(x - 3.2).toFixed(2)} ${y.toFixed(2)} Z" fill="none" stroke="${C.amber}" stroke-width="0.8"/>`);
        if (declareOn) declareDrawn(drawn, 'intervention', iv.id, 'an intervention diamond at the exact event it acts on, from which the amber ripples are drawn');
      }

      // journeys: dedicated corridors above and below, direct labels, one arrow per movement
      // every journey uses the corridor ABOVE the rails going back in time and the one BELOW
      // returning forward, so the two defining movements never share a channel with ripples
      const corridorFor = (from: FactEvent, to: FactEvent): number =>
        (year(to.timeLabel) ?? yMin) < (year(from.timeLabel) ?? yMin) ? outboundY : inboundY;
      journeys.forEach((e, i) => {
        const a = byId(e.from)!, b = byId(e.to)!;
        const ya = railYOf.get(a.worldRef), yb = railYOf.get(b.worldRef);
        if (ya === undefined || yb === undefined) return;
        const xa = xOf(a, facts.worlds.find(w => w.id === a.worldRef)!), xb = xOf(b, facts.worlds.find(w => w.id === b.worldRef)!);
        const corridor = corridorFor(a, b);
        const dir = xb < xa ? -1 : 1;
        body.push(`<path d="M ${xa.toFixed(2)} ${ya.toFixed(2)} L ${xa.toFixed(2)} ${corridor.toFixed(2)} L ${xb.toFixed(2)} ${corridor.toFixed(2)} L ${xb.toFixed(2)} ${yb.toFixed(2)}" fill="none" stroke="${C.blue}" stroke-width="1.1" marker-end="url(#chronicle-head)"/>`);
        const mid = (xa + xb) / 2;
        const who = (a.agents.map(id => facts.agents.find(g => g.id === id)?.label ?? id).filter(Boolean)[0]) ?? hero.name;
        body.push(`<text x="${mid.toFixed(2)}" y="${(corridor + (corridor < railTop ? -3 : 5)).toFixed(2)}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.travel}" font-weight="600" fill="${C.blue}">${esc(`${who} · ${a.timeLabel ?? ''} → ${b.timeLabel ?? ''}`.replace(/\s+/g, ' ').trim())}</text>`);
        if (declareOn) declareDrawn(drawn, 'edge', e.id, 'a journey: the character\'s movement through time, drawn as one directed path in a dedicated corridor above or below the rails');
      });

      // ripples: amber dashed causal chains inside the inter-rail corridors, never through labels
      const interventionEvents = new Set(facts.interventions.map(iv => iv.eventId).filter(Boolean) as string[]);
      const ranked = [...ripples].sort((a, b) => {
        const sa = (interventionEvents.has(a.from) ? 0 : 1), sb = (interventionEvents.has(b.from) ? 0 : 1);
        return sa - sb || (a.id < b.id ? -1 : 1);
      });
      const CHAINS = 6;
      ranked.slice(CHAINS).forEach((e) => {
        // a reference, not a connector: the number of the event this one affects
        const a = byId(e.from)!;
        const wa = facts.worlds.find(w => w.id === a.worldRef)!;
        const y = railYOf.get(wa.id);
        if (y === undefined) return;
        const xn = numOf.get(e.to);
        const x = xOf(a, wa);
        body.push(`<text x="${(x + 2.4).toFixed(2)}" y="${(y + 3.6).toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.key}" fill="${C.amber}">${esc(`${e.relation ?? e.label ?? 'affects'}${xn ? ` → ${xn}` : ''}`.slice(0, 26))}</text>`);
        if (declareOn) declareDrawn(drawn, 'edge', e.id, 'a ripple represented as a numbered reference rather than a full chain, so the page keeps a handful of consequences and every encoded edge is still accounted for');
      });
      ranked.slice(0, CHAINS).forEach((e) => {
        const a = byId(e.from)!, b = byId(e.to)!;
        const wa = facts.worlds.find(w => w.id === a.worldRef)!, wb = facts.worlds.find(w => w.id === b.worldRef)!;
        const ya = railYOf.get(wa.id), yb = railYOf.get(wb.id);
        if (ya === undefined || yb === undefined) return;
        const xa = xOf(a, wa), xb = xOf(b, wb);
        const y0 = ya > yb ? ya - 4 : ya + 4;
        const y1 = ya > yb ? yb + 4 : yb - 4;
        const xn = numOf.get(b.id);
        const verb = e.relation ?? e.label ?? 'leads to';
        body.push(`<path d="M ${xa.toFixed(2)} ${y0.toFixed(2)} L ${xa.toFixed(2)} ${((y0 + y1) / 2).toFixed(2)} L ${xb.toFixed(2)} ${((y0 + y1) / 2).toFixed(2)} L ${xb.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${C.amber}" stroke-width="0.55" stroke-dasharray="1.6 1.6"/>`);
        body.push(`<text x="${((xa + xb) / 2).toFixed(2)}" y="${(((y0 + y1) / 2) + ((ya > yb) ? -1.4 : 4)).toFixed(2)}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.key}" fill="${C.amber}">${esc(`${verb}${xn ? ` → ${xn}` : ''}`.slice(0, 32))}</text>`);
        if (declareOn) declareDrawn(drawn, 'edge', e.id, 'a ripple: an encoded causal consequence drawn as a thin amber dashed chain, labelled with its verb and the number of the event it affects');
      });

      // threatened states and demoted worlds keep a FULL-FIDELITY home, not just a dashed line
      const detail: string[] = [];
      for (const w of threats) {
        const n2 = facts.events.filter(e => e.worldRef === w.id).length;
        detail.push(`${w.spanLabel ?? w.label ?? w.id} — threatened state, drawn as a consequence band: ${n2} encoded event(s), retained in full in the Topology Atlas`);
        if (declareOn) declareDrawn(drawn, 'world', w.id, `threatened state: the encoding itself labels this ${w.kind} as unrealised, so it is a dashed consequence band rather than a history rail (its ${n2} event(s) remain in the atlas)`);
      }
      for (const w of offSpine) {
        const n2 = facts.events.filter(e => e.worldRef === w.id).length;
        if (!n2) continue;
        detail.push(`${w.spanLabel ?? w.label ?? w.id} — not on ${hero.name}'s journey: ${n2} encoded event(s), retained in full in the Topology Atlas`);
      }
      for (const m of mismatches) detail.push(`declaration conflict — ${m}`);

      const detailTop = axisY + 12;
      body.push(`<text x="${MARGIN}" y="${(detailTop + T.key).toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.key}" font-weight="600" fill="${C.ink}">How to read this</text>`);
      body.push(`<text x="${MARGIN}" y="${(detailTop + T.key * 2.4).toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.key}" fill="${C.grey}">grey rail — a history · teal rail — the history as it ends · blue path — a journey through time · amber dashed — a consequence · diamond — an intervention · numbered markers match the reading chart</text>`);
      let dy = detailTop + T.key * 4;
      for (const line of detail.slice(0, 6)) {
        for (const l of wrapText(line, Math.floor((pageW - 2 * MARGIN) / textWidth('n', T.detail)))) {
          body.push(`<text x="${MARGIN}" y="${dy.toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.detail}" fill="${C.ink}">${esc(l)}</text>`);
          dy += T.detail * 1.45;
        }
      }
      body.push(`<text x="${MARGIN}" y="${(dy + T.key).toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${T.key}" fill="${C.grey}">Sources, every encoded relationship, coverage and audit: see the Topology Atlas rendering.</text>`);
      const contentBottom = dy + T.key * 2 + MARGIN;
      return { body, contentBottom, pageW, pageH, mode, rails: rails.length, journeys: journeys.length, ripples: ripples.length, mismatches: mismatches.length, threats: threats.length };
    };

    let L = layoutFor(FORMATS[0]);
    let fmt = FORMATS[0];
    for (const f of FORMATS) { const cand = layoutFor(f); L = cand; fmt = f; if (cand.contentBottom <= f.h) break; }
    declareOn = true;
    L = layoutFor(fmt);

    const docH = Math.max(fmt.h, L.contentBottom);
    if (facts.outcome && declareOn) declareDrawn(drawn, 'outcome', 'outcome', 'the ending is stated by the final history rail and the closing detail strip');
    shapes.push(`<defs><marker id="chronicle-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0 L 9 5 L 0 10 Z" fill="${C.blue}"/></marker></defs>`);
    shapes.unshift(`<rect width="${fmt.w}" height="${docH.toFixed(2)}" fill="${C.bg}"/>`);
    shapes.push(`<g id="chronicle-facts" data-mode="${L.mode}" data-rails="${L.rails}" data-journeys="${L.journeys}" data-ripples="${L.ripples}" data-mismatches="${L.mismatches}" data-threats="${L.threats}"></g>`);
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt.w}mm" height="${docH.toFixed(0)}mm" viewBox="0 0 ${fmt.w} ${docH.toFixed(0)}">`
      + `<title>${esc(`Chronicle — ${facts.storyId || 'untitled'}`)}</title>`
      + `<desc>${esc(`Landscape timeline: horizontal is calendar time, vertical is a different history, a blue path is a journey, amber dashed chains are consequences. Form is computed from the declared physics (${L.mode}).`)}</desc>`
      + shapes.join('') + L.body.join('') + texts.join('') + '</svg>';
    return { doc, medium: '2d-svg', width: fmt.w, height: docH, profileId: 'chronicle', drawn };
  },
};
