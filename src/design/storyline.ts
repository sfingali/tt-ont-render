/**
 * DESIGN — "Storyline" (a READING chart, not a technical one).
 *
 * Built to the image-only redesign review of 2026-09-11, which rejected the premise of
 * repairing a technical drawing: "this is a relationship database rendered as a poster,
 * rather than a timeline designed for a reader". Its instructions, implemented here:
 *
 *  - follow the PROTAGONIST'S experience, not every relationship in the model;
 *  - one vertical spine; chapters as labelled sections; time jumps labelled as jumps;
 *  - what happens on the spine, what CHANGES in a local callout beside the event;
 *  - three connector conventions only - sequence, time travel, consequence;
 *  - identity written in plain words, never traced through an identity route;
 *  - a deliberate ending: a "what changed" comparison and a one-sentence takeaway;
 *  - the machinery (source ids, registries, registers, coverage audit) is NOT on this
 *    page. The Topology Atlas is the technical view, and this page says so.
 *
 * Nothing narrative is invented: chapters, spine order, jumps, consequences, the
 * comparison and the takeaway are all derived from declared facts, and anything the
 * encoding does not establish is shown as unestablished rather than filled in.
 */

import type { FactEdge, FactEvent, FactWorld, SemanticScene } from '../engine/types.js';
import type { DesignProfile, DrawnSource, RenderDoc, ThemeSpec } from './registry.js';
import { declareDrawn, esc, textWidth, wrapText } from './registry.js';

const PT = 0.352778;
const pt = (n: number): number => n * PT;

interface Format { id: string; w: number; h: number }
const FORMATS: Format[] = [
  { id: 'A2 portrait', w: 420, h: 594 },
  { id: 'A1 portrait', w: 594, h: 841 },
  { id: 'A0 portrait', w: 841, h: 1189 },
];

const MARGIN = 16;
const GUTTER = 34;          // the numeral spine lives in this gutter
const TEXT_W = 210;         // the reading column
const PANEL_W = 196;        // consequence panels sit inside the reading column

// The review's palette. Colour carries meaning; no hue is assigned per person or relation.
const C = {
  bg: '#F7F8FA', ink: '#172033', slate: '#64748B', panel: '#EEF2F7',
  travel: '#2563EB', risk: '#C45514', restored: '#0F766E', rule: '#D7DEE8',
};

// Sizes, in the review's proportions, expressed in points for a physical page.
const T = {
  film: pt(34), sub: pt(13), chapter: pt(20), jump: pt(10.5), event: pt(12.5),
  desc: pt(10.5), meta: pt(9), year: pt(30), panel: pt(10), takeaway: pt(14),
};

const esc2 = (s: string): string => esc(s);
const text = (x: number, y: number, s: string, size: number, fill: string, weight?: string, anchor?: string): string =>
  `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${size.toFixed(3)}" fill="${fill}"${weight ? ` font-weight="${weight}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}>${esc2(s)}</text>`;
const inkLine = (x1: number, y1: number, x2: number, y2: number, stroke: string, width: number, dash = ''): string =>
  `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

export const storyline: DesignProfile = {
  id: 'storyline',
  label: 'Storyline',
  medium: '2d-svg',
  topoAffinity: [],

  render(scene: SemanticScene, theme: ThemeSpec): RenderDoc {
    void theme;
    const facts = scene.facts;
    const drawn: DrawnSource[] = [];
    const shapes: string[] = [];
    let declareOn = false;

    // ---------------------------------------------------------------- the protagonist
    const countOf = (agentId: string): number => facts.events.filter(e => e.agents.includes(agentId)).length;
    const protagonists = [...facts.agents].sort((a, b) => {
      const pa = a.continuityRole === 'primary' ? 1 : 0, pb = b.continuityRole === 'primary' ? 1 : 0;
      return pb - pa || countOf(b.id) - countOf(a.id) || (a.id < b.id ? -1 : 1);
    });
    // A story whose events name no characters cannot be told through a protagonist. The
    // reading then follows the encoded event order and SAYS SO, instead of rendering a blank
    // page or inventing a lead the encoding does not have.
    const lead = protagonists.find(a => countOf(a.id) > 0);
    const followsACharacter = !!lead;
    const protagonist = lead
      ? { id: lead.id, name: lead.label ?? lead.id }
      : { id: '', name: 'the encoded order of events' };
    const mine = (e: FactEvent, worldId: string): boolean =>
      e.worldRef === worldId && (!followsACharacter || e.agents.includes(protagonist.id));

    const eventsByWorld = new Map<string, FactEvent[]>();
    for (const w of facts.worlds) eventsByWorld.set(w.id, []);
    for (const e of facts.events) (eventsByWorld.get(e.worldRef) ?? []).push(e);
    const ev = (id: string): FactEvent | undefined => facts.events.find(e => e.id === id);

    // ---------------------------------------------------------------- chapters
    // A chapter is a world the protagonist is actually present in. Declared order, with the
    // declared end-state world last, so the reading ends where the story ends.
    const visited = facts.worlds.filter(w => (eventsByWorld.get(w.id) ?? []).some(e => mine(e, w.id)));
    const endWorlds = facts.outcome?.endWorldRefs ?? [];
    const chapters: FactWorld[] = [
      ...visited.filter(w => !endWorlds.includes(w.id)),
      ...visited.filter(w => endWorlds.includes(w.id)),
    ];
    // a world nobody in the story's lead cast visits is not a chapter: its events can only
    // reach the page through a consequence of something the protagonist does.
    const offSpine = new Set(
      facts.worlds.filter(w => !visited.some(v => v.id === w.id)).map(w => w.id),
    );

    const spineOf = (w: FactWorld): { ordered: FactEvent[]; unresolved: FactEvent[] } => {
      const list = (eventsByWorld.get(w.id) ?? []).filter(e => mine(e, w.id));
      return {
        ordered: list.filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal),
        unresolved: list.filter(e => !e.order),
      };
    };

    // ---------------------------------------------------------------- consequences
    /** Local callouts: what an event changes. Derived only from encoded edges and interventions. */
    interface Consequence { kind: 'risk' | 'restored' | 'note'; text: string }
    const consequencesFor = (e: FactEvent): Consequence[] => {
      const out: Consequence[] = [];
      for (const iv of facts.interventions) {
        if (iv.eventId !== e.id) continue;
        const effects = iv.ruleEffects;
        const body = Array.isArray(effects)
          ? effects.map((x) => (x && typeof x === 'object'
              ? String((x as Record<string, unknown>)['effect'] ?? (x as Record<string, unknown>)['ruleSetId'] ?? '')
              : String(x))).filter(Boolean).join('; ')
          : effects === undefined ? '' : String(effects);
        out.push({
          kind: endWorlds.includes(e.worldRef) ? 'restored' : 'risk',
          text: body ? `Intervention — ${body}` : 'Intervention recorded at this event',
        });
      }
      for (const edge of facts.edges) {
        if (edge.from !== e.id) continue;
        const target = ev(edge.to);
        if (!target) continue;
        const leavesChapter = target.worldRef !== e.worldRef;
        const relation = edge.relation ?? (edge.kind === 'causal' ? 'leads to' : edge.kind);
        const where = target.worldRef !== e.worldRef
          ? `${facts.worlds.find(w => w.id === target.worldRef)?.label ?? target.worldRef}: ${target.label ?? target.id}`
          : target.label ?? target.id;
        out.push({
          kind: endWorlds.includes(target.worldRef) ? 'restored' : (leavesChapter ? 'risk' : 'note'),
          text: `${relation} — ${where}`,
        });
      }
      return out.slice(0, 3);
    };

    // ---------------------------------------------------------------- comparison + takeaway
    const origin = chapters[0];
    const endWorld = chapters[chapters.length - 1];
    const compareRows: { left: string; right: string }[] = [];
    if (origin && endWorld && origin.id !== endWorld.id) {
      const left = (eventsByWorld.get(origin.id) ?? []).filter(e => mine(e, origin.id));
      const right = (eventsByWorld.get(endWorld.id) ?? []).filter(e => mine(e, endWorld.id));
      const usedRight = new Set<string>();
      for (const l of left) {
        const match = right.find(r => !usedRight.has(r.id) && r.timeLabel && r.timeLabel === l.timeLabel)
          ?? right.find(r => !usedRight.has(r.id) && r.agents.some(a => l.agents.includes(a)));
        if (match) usedRight.add(match.id);
        compareRows.push({ left: l.label ?? l.id, right: match ? (match.label ?? match.id) : 'unchanged in the encoded record' });
      }
      for (const r of right) if (!usedRight.has(r.id)) compareRows.push({ left: '—', right: r.label ?? r.id });
    }
    const open = origin?.spanLabel ?? origin?.label ?? origin?.id ?? 'the opening world';
    const close = endWorld?.spanLabel ?? endWorld?.label ?? endWorld?.id ?? 'its final world';
    const middle = chapters.slice(1, -1).map(w => w.spanLabel ?? w.label ?? w.id).join(' then ');
    const takeaway = !chapters.length
      ? 'No world has encoded events for the leading character.'
      : chapters.length === 1
        ? `The encoded story takes place entirely in ${open}.`
        : followsACharacter
          ? `${protagonist.name} begins in ${open}${chapters.length > 2 ? `, moves through ${middle}` : ''}, and the story ends in ${close}.`
          : `The encoded story begins in ${open}${chapters.length > 2 ? `, moves through ${middle}` : ''}, and ends in ${close}.`;

    // ---------------------------------------------------------------- layout
    const layoutFor = (fmt: Format) => {
      const pageW = fmt.w, pageH = fmt.h;
      const contentW = pageW - 2 * MARGIN;
      const spineX = MARGIN + GUTTER - 10;
      const textX = spineX + 10;
      const colW = Math.min(TEXT_W, contentW - (spineX - MARGIN) - 6);
      const panelW = Math.min(PANEL_W, colW);
      const body: string[] = [];
      let y = MARGIN;
      /** Text and geometry share ONE cursor: the spine can never drift from its labels. */
      const push = (s: string, size: number, fill: string, indent: number, weight?: string): void => {
        body.push(text(MARGIN + indent, y, s, size, fill, weight));
        y += size * 1.45;
      };
      const wrapInto = (s: string, size: number, fill: string, indent: number, width: number, weight?: string): void => {
        for (const line of wrapText(s, Math.max(12, Math.floor(width / (textWidth('n', size)))))) push(line, size, fill, indent, weight);
      };

      // header
      const film = (facts.storyId || 'untitled').split(/[-_]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      push(film, T.film, C.ink, 0, '700');
      wrapInto(followsACharacter
        ? `Following ${protagonist.name} — read from top to bottom. Dates jump when ${protagonist.name} travels through time.`
        : `These events name no character, so this reading follows ${protagonist.name}. Dates jump where the encoding moves through time.`, T.sub, C.slate, 0, colW);
      y += 6;
      const headerEnd = y;
      body.push(inkLine(MARGIN, headerEnd - 3, MARGIN + contentW, headerEnd - 3, C.rule, 0.4));

      let nodeIndex = 0;
      chapters.forEach((w, ci) => {
        const { ordered, unresolved } = spineOf(w);
        const rawLabel = w.spanLabel ?? w.label ?? w.id;
        const yearMatch = rawLabel.match(/\b(1[89]\d{2}|20\d{2})\b/);
        const yearLabel = yearMatch ? yearMatch[0] : rawLabel;
        // time jump between chapters: one blue arrow, directly labelled, never routed around
        if (ci > 0) {
          const jumpTop = y;
          body.push(`<path d="M ${spineX.toFixed(2)} ${jumpTop.toFixed(2)} L ${spineX.toFixed(2)} ${(jumpTop + 10).toFixed(2)}" stroke="${C.travel}" stroke-width="1.3" fill="none" marker-end="url(#storyline-arrow)"/>`);
          push(`TIME JUMP — ${chapters[ci - 1].spanLabel ?? chapters[ci - 1].label ?? chapters[ci - 1].id} → ${yearLabel}`, T.jump, C.travel, textX, '600');
          y += 4;
        }
        // chapter heading
        push(yearLabel, T.year, C.ink, textX, '700');
        push(`${String(ci + 1).padStart(2, '0')} · ${w.kind === 'timeline' ? 'the present as first shown' : w.kind === 'branch' ? 'a changed history' : 'a parallel world'}${yearMatch && rawLabel !== yearLabel ? ` · ${rawLabel}` : ''}`, T.meta, C.slate, textX);
        body.push(inkLine(MARGIN, y + T.year * 0.5, MARGIN + contentW, y + T.year * 0.5, C.rule, 0.4));
        y += T.year + 8;

        const block = (e: FactEvent, numbered: boolean): void => {
          const top = y;
          if (numbered) {
            nodeIndex += 1;
            body.push(`<circle cx="${spineX.toFixed(2)}" cy="${(top + T.event * 0.45).toFixed(2)}" r="2.4" fill="${C.bg}" stroke="${C.ink}" stroke-width="0.7"/>`);
            body.push(inkLine(spineX + 1.2, top + T.event * 0.45, textX - 1.4, top + T.event * 0.45, C.slate, 0.5));
            body.push(text(MARGIN + 2, top + T.event * 0.45 + T.meta * 0.35, String(nodeIndex).padStart(2, '0'), T.meta, C.slate, '600'));
          }
          push(e.label ?? e.id, T.event, C.ink, textX, '600');
          if (e.description) wrapInto(e.description, T.desc, C.ink, textX, colW);
          if (e.timeLabel) push(e.timeLabel, T.meta, C.slate, textX);
          for (const c of consequencesFor(e)) {
            const colour = c.kind === 'risk' ? C.risk : c.kind === 'restored' ? C.restored : C.slate;
            const label = c.kind === 'risk' ? 'HISTORY AT RISK' : c.kind === 'restored' ? 'RESTORED' : 'CONSEQUENCE';
            const lines = wrapText(c.text, Math.max(12, Math.floor((panelW - 6) / textWidth('n', T.panel))));
            const boxH = T.meta * 1.5 + lines.length * T.panel * 1.45 + 3;
            body.push(`<rect x="${(textX - 3).toFixed(2)}" y="${(y - T.meta * 0.9).toFixed(2)}" width="${(panelW + 4).toFixed(2)}" height="${boxH.toFixed(2)}" rx="1.2" fill="${C.panel}"/>`);
            push(label, T.meta, colour, textX, '700');
            for (const l of lines) push(l, T.panel, C.ink, textX);
            y += 3.4;
          }
          y += 6;
          if (declareOn) declareDrawn(drawn, 'event', e.id, `storyline node ${numbered ? nodeIndex : '(unordered)'}: headline, one-sentence description, encoded date and any local consequence`);
        };

        for (const e of ordered) block(e, true);
        if (unresolved.length) {
          push(`position in time not encoded (${unresolved.length})`, T.meta, C.slate, textX, '600');
          y += 4;
          for (const e of unresolved) block(e, false);
        }
        y += 6;
        if (declareOn) declareDrawn(drawn, 'world', w.id, `chapter: ${yearLabel} — the protagonist is present here, so it is a chapter of the reading`);
      });

      // deliberate ending: the comparison, then the takeaway. No empty tail.
      if (compareRows.length) {
        y += 4;
        push('What changed', T.chapter, C.ink, textX, '700');
        y += T.chapter * 0.6;
        const half = (colW - 8) / 2;
        push(`original present`, T.meta, C.slate, textX, '600');
        push(`rewritten present`, T.meta, C.slate, textX + half + 8, '600');
        y += T.meta * 1.6;
        for (const row of compareRows.slice(0, 10)) {
          const lLines = wrapText(row.left, Math.max(10, Math.floor(half / textWidth('n', T.panel))));
          const rLines = wrapText(row.right, Math.max(10, Math.floor(half / textWidth('n', T.panel))));
          lLines.forEach((l, i) => push(l, T.panel, C.ink, textX, i === 0 ? '600' : undefined));
          rLines.forEach((l, i) => push(l, T.panel, C.restored, textX + half + 8, i === 0 ? '600' : undefined));
          y += Math.max(lLines.length, rLines.length) * T.panel * 1.4 + 2.4;
        }
      }
      if (chapters.length) {
        y += 6;
        body.push(inkLine(MARGIN, y - 3, MARGIN + contentW, y - 3, C.rule, 0.4));
        wrapInto(takeaway, T.takeaway, C.ink, MARGIN, contentW, '600');
        y += T.takeaway * 1.3;
      }
      // the key: three conventions, and where the machinery lives
      y += 8;
      push('How to read this', T.meta, C.ink, MARGIN, '700');
      y += T.meta * 1.5;
      push('thin line — the next thing that happens · blue arrow — a jump through time · orange — history at risk · teal — restored', T.meta, C.slate, MARGIN);
      y += T.meta * 1.6;
      push('Sources, every encoded relationship, coverage and audit: see the Topology Atlas rendering.', T.meta, C.slate, MARGIN);
      y += T.meta * 1.6;

      const contentBottom = y + MARGIN * 0.5;
      return { body, contentBottom, pageW, pageH, spineX, textX };
    };

    // choose the smallest declared format that holds the composed reading
    let L = layoutFor(FORMATS[0]);
    let fmt = FORMATS[0];
    for (const f of FORMATS) {
      const cand = layoutFor(f);
      if (cand.contentBottom <= f.h) { L = cand; fmt = f; break; }
      L = cand; fmt = f;
    }
    declareOn = true;
    L = layoutFor(fmt);

    const docH = Math.max(fmt.h, L.contentBottom);
    shapes.push(`<defs><marker id="storyline-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0 L 9 5 L 0 10 Z" fill="${C.travel}"/></marker></defs>`);
    shapes.unshift(`<rect width="${fmt.w}" height="${docH.toFixed(2)}" fill="${C.bg}"/>`);
    if (declareOn && !drawn.some(d => d.kind === 'outcome') && facts.outcome) {
      declareDrawn(drawn, 'outcome', 'outcome', 'the closing comparison and takeaway state how the story ends, in reading order');
    }
    const title = `Storyline — ${(facts.storyId || 'untitled')}`;
    const desc = `A reading chart: ${protagonist.name}'s experience in ${chapters.length} chapter(s), consequences local to their events. Technical detail is deliberately absent; see the Topology Atlas.`;
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt.w}mm" height="${docH.toFixed(0)}mm" viewBox="0 0 ${fmt.w} ${docH.toFixed(0)}">`
      + `<title>${esc2(title)}</title><desc>${esc2(desc)}</desc>${shapes.join('')}${L.body.join('')}</svg>`;
    return { doc, medium: '2d-svg', width: fmt.w, height: docH, profileId: 'storyline', drawn };
  },
};
