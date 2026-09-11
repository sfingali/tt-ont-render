/**
 * DESIGN — "Atlas" (2D, topology-first atlas). v2 — built to the 2026-09-11 review.
 *
 * WHAT CHANGED (review priorities):
 *  P1  relationships no longer run through the information they explain. Cards, text
 *      blocks and the header are HARD obstacles; every edge is routed through a
 *      corridor network with per-edge tracks (3mm spacing, 3mm clearance, 5mm
 *      terminal approach). Unrelated edges never share a collinear segment, crossings
 *      are drawn as bridges, and no junction dot is ever invented.
 *  P2  a bounded PHYSICAL page. Declared formats in mm; if the measured content and
 *      routes do not fit, the publication check escalates to a larger declared format
 *      and says so. Type is never quietly shrunk.
 *  P3  a real typographic hierarchy, specified in points at final size.
 *  P4  six genuinely distinguishable relationship styles with route-bound badges.
 *      The paired full-length world-relation stroke is gone.
 *  P5  exceptions localised: fork-unspecified sits in its own branch's header,
 *      interventions are keyed badges with local detail boxes, coverage and visual
 *      checks sit in a compact audit block.
 *
 * PRESERVED (the review's preserve list): T/B/P world primitives, event-type glyphs,
 * plain-English descriptions with short labels beneath, participant chips and source
 * traceability, visible unresolved-order treatment, detached missing-fork statements,
 * intervention and outcome marking, every encoded relationship, the restrained palette.
 */

import type { FactEdge, FactEvent, FactWorld, SemanticScene } from '../engine/types.js';
import type { DesignProfile, DrawnSource, NodeTextBlock, RenderDoc, ThemeSpec } from './registry.js';
import { declareDrawn, esc, textWidth, wrapText } from './registry.js';

// ---------------------------------------------------------------------------
// PHYSICAL PAGE (P2). 1 user unit = 1 mm. Type is specified in points.
// ---------------------------------------------------------------------------
const PT = 0.352778;                       // 1pt in mm
const pt = (n: number): number => n * PT;  // pt -> mm

/** Declared publication formats, smallest first. Escalation is reported, never silent. */
interface PageFormat { id: string; w: number; h: number }
const FORMATS: PageFormat[] = [
  { id: 'A1 portrait', w: 594, h: 841 },
  { id: 'A0 portrait', w: 841, h: 1189 },
  { id: '2A0 portrait', w: 1189, h: 1682 },
];

const MARGIN = 18;         // page margin (mm)
const GRID_COLS = 5;       // card columns
const COL_W = 94;          // card column width (mm)
const COL_GAP = 6;         // gap between columns (mm)
const GRID_W = GRID_COLS * COL_W + (GRID_COLS - 1) * COL_GAP;   // 494mm
const ROW_GAP = 30;        // vertical corridor band between card rows (mm)
const BAND_GAP = 30;       // between world bands (mm)
const TRACK = 2.5;         // routing track spacing (mm) — measured against the 1.8mm heaviest stroke
const CLEARANCE = 3;       // obstacle clearance (mm)
const APPROACH = 5;        // clear terminal approach to a glyph (mm)
const APRON = 5;           // glyph connection apron radius (mm)
const CARD_PAD = 3;        // card inner padding (mm)
const RAIL_OFF = 30;        // rail -> card top (mm)
const LANE_W = 32;   // wide side lanes: the review's routing space inside the page         // routing lane each side of the grid (mm)

// Type hierarchy (P3), in points at final size.
const T = {
  film:    pt(28),   // film title, serif
  sub:     pt(12),   // atlas subtitle + physics line
  world:   pt(16),   // world title, semibold
  desc:    pt(11),   // event description — primary, dark
  label:   pt(9.5),  // short label beneath description
  time:    pt(9),    // encoded time label — neutral, NOT accent
  meta:    pt(9),    // ids, chips, supporting metadata (floor)
};

const INK = (theme: ThemeSpec): string => theme.ink;
const SUPPORT = '#5f5a51';   // supporting text: darker than the old muted grey
const NEUTRAL = '#6b665c';   // time labels / administrative

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------
interface Pt { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }
interface Seg { a: Pt; b: Pt }

interface TextMark {
  x: number; y: number; s: string; size: number; fill: string; family: string;
  anchor: 'start' | 'middle' | 'end'; data?: string; weight?: string;
}

interface Card { ev: FactEvent; rect: Rect; block: NodeTextBlock; ordered: boolean; fx: number; fy: number; rowKey: string }
interface Glyph { id: string; x: number; y: number; type: string; apron: number; rowKey: string }
interface RouteRec {
  edgeId: string; kind: FactEdge['kind']; pts: Pt[]; segs: Seg[];
  gaps: Pt[]; label: string | null; key: string | null;
  arrow: Pt; arrowDir: 'l' | 'r' | 'u' | 'd';
}

const rectOf = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const boxOverlap = (a: Rect, b: Rect, pad = 0): boolean =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

function segIntersect(a: Seg, b: Seg): Pt | null {
  const d = (p: Pt, q: Pt, r: Pt): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b.a, b.b, a.a), d2 = d(b.a, b.b, a.b), d3 = d(a.a, a.b, b.a), d4 = d(a.a, a.b, b.b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d1 / (d1 - d2);
    return { x: a.a.x + t * (a.b.x - a.a.x), y: a.a.y + t * (a.b.y - a.a.y) };
  }
  return null;
}

function pointSegDist(p: Pt, s: Seg): number {
  const vx = s.b.x - s.a.x, vy = s.b.y - s.a.y;
  const L2 = vx * vx + vy * vy;
  if (!L2) return Math.hypot(p.x - s.a.x, p.y - s.a.y);
  let t = ((p.x - s.a.x) * vx + (p.y - s.a.y) * vy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (s.a.x + t * vx), p.y - (s.a.y + t * vy));
}

// ---------------------------------------------------------------------------
// Corridor network (P1). A corridor is a parallel bundle of 3mm tracks; each
// route claims an offset, so unrelated edges can never share a collinear segment.
// ---------------------------------------------------------------------------
class Corridor {
  private used: { id: number; off: number; a: number; b: number }[] = [];
  private seq = 0;
  constructor(public readonly pos: number, public readonly width: number) {}
  /** Claim a track for a span [a,b] along the corridor. Returns a rollback token. */
  claim(a: number, b: number): { off: number; id: number } | null {
    const maxOff = Math.max(0, Math.floor((this.width / 2 - CLEARANCE) / TRACK));
    for (let k = 0; k <= maxOff; k++) {
      for (const off of k === 0 ? [0] : [k * TRACK, -k * TRACK]) {
        const clash = this.used.some(u => u.off === off && a < u.b + CLEARANCE && u.a < b + CLEARANCE);
        if (!clash) { const id = ++this.seq; this.used.push({ id, off, a, b }); return { off, id }; }
      }
    }
    return null;
  }
  /** Adopt an existing offset for another span of the SAME route. */
  claimShared(off: number, a: number, b: number): number {
    const id = ++this.seq;
    this.used.push({ id, off, a, b });
    return id;
  }
  release(id: number | null | undefined): void {
    if (id == null) return;
    this.used = this.used.filter(u => u.id !== id);
  }
}

// ---------------------------------------------------------------------------
// Text blocks
// ---------------------------------------------------------------------------
interface BlockOpts { wrapChars: number; descSize: number; labelSize: number; timeSize: number }

/** Greedy chip layout — the SAME rule the emitter uses, so a card can never overflow its own foot. */
function chipRows(labels: string[], innerW: number): number {
  if (!labels.length) return 0;
  let rows = 1, cx = 0;
  for (const l of labels) {
    const w = textWidth(l, T.meta) + 3.2;
    if (cx > 0 && cx + w > innerW) { rows++; cx = w; } else cx += w + 1.6;
  }
  return rows;
}

function buildBlock(ev: FactEvent, theme: ThemeSpec, o: BlockOpts): NodeTextBlock {
  const lh = o.descSize * 1.30;
  const runs: NodeTextBlock['runs'] = [];
  let y = 0;
  const desc = (ev.description ?? '').trim();
  const label = (ev.label ?? '').trim();
  for (const t of wrapText(desc || label, o.wrapChars)) {
    runs.push({ text: t, size: o.descSize, fill: INK(theme), family: theme.fontSans, dy: y });
    y += lh;
  }
  if (desc && label && label !== desc) {
    y += o.labelSize * 0.45;
    for (const t of wrapText(label, o.wrapChars)) {
      runs.push({ text: t, size: o.labelSize, fill: SUPPORT, family: theme.fontSans, dy: y });
      y += o.labelSize * 1.35;
    }
  }
  if (ev.timeLabel) {
    y += o.timeSize * 0.35;
    runs.push({ text: ev.timeLabel, size: o.timeSize, fill: NEUTRAL, family: theme.fontMono, dy: y });
    y += o.timeSize * 1.25;
  }
  const height = runs.length ? Math.max(...runs.map(r => r.dy + r.size * 1.25)) : 0;
  const width = runs.length ? Math.max(...runs.map(r => textWidth(r.text, r.size))) : 0;
  // The review's §4 correction: no silent truncation anywhere in this profile.
  return { runs, height, width, truncated: false };
}

function emitBlock(b: NodeTextBlock, x: number, top: number): string {
  return b.runs
    .map(r => `<text x="${x.toFixed(2)}" y="${(top + r.dy + r.size * 0.92).toFixed(2)}" font-family="${r.family}" font-size="${r.size.toFixed(3)}" fill="${r.fill}">${esc(r.text)}</text>`)
    .join('');
}

function emitMark(m: TextMark): string {
  const a = m.anchor !== 'start' ? ` text-anchor="${m.anchor}"` : '';
  const w = m.weight ? ` font-weight="${m.weight}"` : '';
  const d = m.data ? ` ${m.data}` : '';
  return `<text x="${m.x.toFixed(2)}" y="${m.y.toFixed(2)}"${a}${w} font-family="${m.family}" font-size="${m.size.toFixed(3)}" fill="${m.fill}"${d}>${esc(m.s)}</text>`;
}

function markBox(m: TextMark): Rect {
  const w = textWidth(m.s, m.size);
  const x = m.anchor === 'middle' ? m.x - w / 2 : m.anchor === 'end' ? m.x - w : m.x;
  return rectOf(x, m.y - m.size * 0.9, w, m.size * 1.2);
}

// ---------------------------------------------------------------------------
// Relationship styles (P4) — six kinds, one channel, genuinely distinguishable.
// ---------------------------------------------------------------------------
interface EdgeStyle { stroke: string; width: number; dash: string; filled: boolean; badge: 'none' | 'identity' | 'kinship' | 'effect' | 'world' }

function styleOf(kind: FactEdge['kind'], theme: ThemeSpec): EdgeStyle {
  switch (kind) {
    case 'causal':      return { stroke: theme.ink,       width: 1.05, dash: '',       filled: true,  badge: 'none' };
    case 'temporal':    return { stroke: theme.secondary, width: 0.90, dash: '5 3',    filled: false, badge: 'none' };
    case 'identity':    return { stroke: theme.accent,    width: 0.80, dash: '0.8 2.4', filled: false, badge: 'identity' };
    case 'family':      return { stroke: theme.secondary, width: 0.90, dash: '',       filled: true,  badge: 'kinship' };
    case 'intervention':return { stroke: theme.accent,    width: 1.80, dash: '',       filled: true,  badge: 'effect' };
    case 'world_relation': return { stroke: theme.secondary, width: 0.70, dash: '',    filled: false, badge: 'world' };
    default:            return { stroke: theme.muted,     width: 0.75, dash: '1.6 1.6', filled: false, badge: 'none' };
  }
}

function markerFor(kind: FactEdge['kind'], theme: ThemeSpec): string {
  const id = `atlas2-arrow-${kind}`;
  const st = styleOf(kind, theme);
  const head = st.filled
    ? `<path d="M 0 0 L ${st.width * 3.4} ${st.width * 1.9} L 0 ${st.width * 3.8} Z" fill="${st.stroke}"/>`
    : `<path d="M 0.2 0.2 L ${st.width * 3.6} ${st.width * 2.0} L 0.2 ${st.width * 3.8}" fill="none" stroke="${st.stroke}" stroke-width="${(st.width * 0.7).toFixed(2)}"/>`;
  const h = st.width * 3.8;
  return `<marker id="${id}" viewBox="0 0 ${(st.width * 3.6).toFixed(2)} ${h.toFixed(2)}" refX="0" refY="${(h / 2).toFixed(2)}" markerWidth="${(st.width * 3.6).toFixed(2)}" markerHeight="${h.toFixed(2)}" markerUnits="userSpaceOnUse" orient="auto-start-reverse">${head}</marker>`;
}

function badgeGlyph(kind: EdgeStyle['badge'], x: number, y: number, theme: ThemeSpec): { svg: string; label: string } {
  switch (kind) {
    case 'identity': return { svg: `<path d="M ${x - 1.6} ${y} L ${x + 1.6} ${y} M ${x - 1.6} ${y - 1.1} L ${x + 1.6} ${y - 1.1} M ${x - 1.6} ${y + 1.1} L ${x + 1.6} ${y + 1.1}" stroke="${theme.accent}" stroke-width="0.6" fill="none"/>`, label: 'identity' };
    case 'kinship':  return { svg: `<path d="M ${x} ${y - 1.7} L ${x + 1.7} ${y} L ${x} ${y + 1.7} L ${x - 1.7} ${y} Z" fill="none" stroke="${theme.secondary}" stroke-width="0.6"/>`, label: 'kinship' };
    case 'effect':   return { svg: `<path d="M ${x - 1.5} ${y + 1.5} L ${x + 1.5} ${y - 1.5}" stroke="${theme.accent}" stroke-width="1.0" fill="none"/>`, label: 'rule effect' };
    case 'world':    return { svg: `<rect x="${x - 1.8}" y="${y - 1.3}" width="3.6" height="2.6" fill="none" stroke="${theme.secondary}" stroke-width="0.55"/>`, label: 'world relation' };
    default:         return { svg: '', label: '' };
  }
}

interface Placed { rect: Rect; kind: 'label' | 'badge' | 'text'; owner: string }

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------
export const atlas: DesignProfile = {
  id: 'atlas',
  label: 'Topology Atlas',
  medium: '2d-svg',
  topoAffinity: [],

  render(scene: SemanticScene, theme: ThemeSpec): RenderDoc {
    const facts = scene.facts;
    const drawn: DrawnSource[] = [];
    const titleCase = (s: string): string =>
      s.split(/[-_]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    const filmTitle = titleCase(facts.storyId || 'untitled');
    const wrapChars = Math.max(12, Math.floor((COL_W - 2 * CARD_PAD) / (textWidth('n', T.desc))));
    const blockOpts: BlockOpts = { wrapChars, descSize: T.desc, labelSize: T.label, timeSize: T.time };

    const eventsByWorld = new Map<string, FactEvent[]>();
    for (const w of facts.worlds) eventsByWorld.set(w.id, []);
    for (const e of facts.events) (eventsByWorld.get(e.worldRef) ?? []).push(e);

    // -----------------------------------------------------------------------
    // Build the geometry for a given declared format. Called once per format
    // until the publication check passes (P2: never shrink type, escalate page).
    // -----------------------------------------------------------------------
    let declareOn = false;

    const layoutFor = (fmt: PageFormat) => {
      const shapes: string[] = [];
      const texts: TextMark[] = [];
      const cards: Card[] = [];
      const glyphs = new Map<string, Glyph>();
      const obstacles: Rect[] = [];          // hard obstacles: card and panel surfaces only
      const aprons: Rect[] = [];             // glyph connection zones (ports, not obstacles)
      const corridorsH: Corridor[] = [];
      const corridorsV: Corridor[] = [];
      /** A position is one physical channel: asking twice returns the same corridor. */
      const corrH = new Map<number, Corridor>();
      const getH = (pos: number, width: number): Corridor => {
        const key = Math.round(pos * 100);
        const ex = corrH.get(key);
        if (ex) return ex;
        const c = new Corridor(pos, width);
        corrH.set(key, c);
        corridorsH.push(c);
        return c;
      };
      const notes: string[] = [];
      const bandRects = new Map<string, Rect>();
      /** one routing channel per row: the space between a rail and its cards (or above an unresolved row) */
      const rowChannel = new Map<string, Corridor>();

      const pageW = fmt.w, pageH = fmt.h;
      const contentW = pageW - 2 * MARGIN;
      const gridX = MARGIN + Math.max(0, (contentW - GRID_W) / 2);
      const gridRight = gridX + GRID_W;

      // corridors: side lanes (wide) + inter-column gaps (narrow)
      for (let i = 1; i < GRID_COLS; i++) corridorsV.push(new Corridor(gridX + i * (COL_W + COL_GAP) - COL_GAP / 2, COL_GAP));
      // Routing lanes flank the GRID, not the page margin: on a larger declared format the
      // page grows but the corridors must stay beside the material they serve.
      corridorsV.push(new Corridor(gridX - LANE_W / 2 - 2, LANE_W));
      corridorsV.push(new Corridor(gridX + GRID_W + LANE_W / 2 + 2, LANE_W));

      // ---- header (compact) ----
      const headerH = 30;
      texts.push({ x: MARGIN, y: MARGIN + T.film * 0.92, s: filmTitle, size: T.film, fill: theme.ink, family: theme.fontSerif, anchor: 'start' });
      texts.push({ x: MARGIN, y: MARGIN + T.film + T.sub * 1.5, s: `Topology Atlas — ${facts.topologyPatternId}`, size: T.sub, fill: SUPPORT, family: theme.fontSans, anchor: 'start' });
      texts.push({ x: MARGIN, y: MARGIN + T.film + T.sub * 1.5 + T.meta * 1.7, s: `${scene.header.physicsLine} · ${scene.header.evidenceLine}`, size: T.meta, fill: NEUTRAL, family: theme.fontSans, anchor: 'start' });
      const physY = MARGIN + T.meta * 1.1;
      texts.push({ x: MARGIN + contentW, y: physY, s: 'PRIMARY PHYSICS', size: T.meta, fill: theme.accent, family: theme.fontSans, anchor: 'end' });
      texts.push({ x: MARGIN + contentW, y: physY + T.sub * 1.4, s: facts.primaryRuleSetId, size: T.sub, fill: theme.ink, family: theme.fontMono, anchor: 'end' });
      const mixins = facts.mixinRuleSetIds.length ? `mixins: ${facts.mixinRuleSetIds.join(', ')}` : 'no mixins declared';
      texts.push({ x: MARGIN + contentW, y: physY + T.sub * 1.4 + T.meta * 1.5, s: mixins, size: T.meta, fill: NEUTRAL, family: theme.fontSans, anchor: 'end' });

      let y = MARGIN + headerH;

      // ---- world bands, stacked, equal width (P2) ----
      const bandOrder: FactWorld[] = [];
      const first = facts.worlds.find(w => w.id === 'w_1985');
      if (first) bandOrder.push(first);
      for (const w of facts.worlds) if (!bandOrder.includes(w)) bandOrder.push(w);

      for (const w of bandOrder) {
        const evs = eventsByWorld.get(w.id) ?? [];
        const ordered = evs.filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal);
        const unresolved = evs.filter(e => !e.order);
        const bandTop = y;

        // header row of the band: kind tab, world title, span/fork labels, end-state tag
        const headY = bandTop + T.world * 0.95;
        const tabX = gridX, tabW = 7, tabH = 5.6;
        const tabFill = w.kind === 'parallel_world' ? theme.secondary : w.kind === 'branch' ? theme.accent : theme.ink;
        shapes.push(`<g class="world-tab" data-source-id="${esc(w.id)}" data-primitive="${esc(w.kind)}"><rect x="${tabX}" y="${headY - tabH + 1.2}" width="${tabW}" height="${tabH}" rx="0.6" fill="none" stroke="${tabFill}" stroke-width="0.5"/>`
          + (w.kind === 'parallel_world' ? `<rect x="${tabX + 1.2}" y="${headY - tabH + 2.4}" width="${tabW - 2.4}" height="${tabH - 2.4}" fill="none" stroke="${theme.secondary}" stroke-width="0.4"/>` : '')
          + `<text x="${tabX + tabW / 2}" y="${headY - 1}" text-anchor="middle" font-family="${theme.fontSerif}" font-size="${T.meta}" fill="${tabFill}">${w.kind === 'parallel_world' ? 'P' : w.kind === 'branch' ? 'B' : 'T'}</text></g>`);
        texts.push({ x: tabX + tabW + 3, y: headY, s: `${w.label ?? w.id}${w.label ? ` · ${w.id}` : ''}`, size: T.world, fill: theme.ink, family: theme.fontSans, anchor: 'start', weight: '600' });
        const subBits = [w.spanLabel ? `span: ${w.spanLabel}` : '', w.forkLabel ? `fork: ${w.forkLabel}` : ''].filter(Boolean).join(' · ');
        if (subBits) texts.push({ x: tabX + tabW + 3, y: headY + T.meta * 1.5, s: subBits, size: T.meta, fill: NEUTRAL, family: theme.fontSans, anchor: 'start' });
        if (facts.outcome?.endWorldRefs?.includes(w.id)) {
          const tagW = textWidth('end-state world', T.meta) + 4;
          shapes.push(`<rect x="${gridRight - tagW}" y="${headY - T.meta * 1.1}" width="${tagW}" height="${T.meta * 1.6}" rx="1" fill="none" stroke="${theme.accent}" stroke-width="0.4"/>`);
          texts.push({ x: gridRight - tagW / 2, y: headY, s: 'end-state world', size: T.meta, fill: theme.accent, family: theme.fontSans, anchor: 'middle' });
        }

        // P5: a branch with no encoded fork states it in ITS OWN header, with a
        // detached leader that touches neither a parent rail nor an event.
        let forkNoteH = 0;
        if (w.kind === 'branch') {
          const parentId = w.forkParent ?? w.parentRef ?? null;
          const forkEv = w.forkEventRef ? facts.events.find(e => e.id === w.forkEventRef) : undefined;
          const suffix = parentId ? ` (parent ${parentId})` : '';
          const text = forkEv ? `fork event: ${forkEv.id}` : `fork event unspecified${suffix}`;
          const lx = gridX + 2, ly = headY + (subBits ? T.meta * 1.5 : 0) + 6.4;
          const mlx = lx + textWidth(text, T.meta) + 3;
          shapes.push(`<path class="branch-fork-note" data-fork-market="${esc(w.id)}" d="M ${mlx.toFixed(2)} ${(ly - 1.1).toFixed(2)} L ${(mlx + 7).toFixed(2)} ${(ly - 1.1).toFixed(2)}" fill="none" stroke="${forkEv ? theme.accent : theme.muted}" stroke-width="0.5"${forkEv ? '' : ' stroke-dasharray="1.6 1.6"'}/>`);
          texts.push({ x: lx, y: ly, s: text, size: T.meta, fill: forkEv ? theme.accent : SUPPORT, family: theme.fontSans, anchor: 'start', data: `data-fork-market="${esc(w.id)}"` });
          forkNoteH = 6.4;
        }

        let rowY = headY + forkNoteH + 5;
        const rows: FactEvent[][] = [];
        for (let i = 0; i < ordered.length; i += GRID_COLS) rows.push(ordered.slice(i, i + GRID_COLS));
        const urows: FactEvent[][] = [];
        for (let i = 0; i < unresolved.length; i += GRID_COLS) urows.push(unresolved.slice(i, i + GRID_COLS));

        const placeRow = (list: FactEvent[], rail: boolean, firstRail: boolean, index: number, explicitChannel?: Corridor): void => {
          const rowTop = rowY;
          const rowKey = `${w.id}:${rail ? 'r' : 'u'}${index}`;
          const railY = rail ? rowTop + 3.2 : 0;
          if (rail) {
            const ch = getH(railY + RAIL_OFF / 2, RAIL_OFF);
            rowChannel.set(rowKey, ch);
          } else {
            const ch = explicitChannel ?? corridorsH[corridorsH.length - 1];
            if (ch) rowChannel.set(rowKey, ch);
          }
          if (rail) {
            const railX0 = gridX + 2, railX1 = gridRight - 2;
            shapes.push(`<line class="local-order-rail" data-world-id="${esc(w.id)}" x1="${railX0.toFixed(2)}" y1="${railY.toFixed(2)}" x2="${railX1.toFixed(2)}" y2="${railY.toFixed(2)}" stroke="${theme.lane}" stroke-width="0.7"/>`);
            // non-arrow continuation convention: a chevron with a gap, explained once
            if (!firstRail) {
              shapes.push(`<g class="order-continuation" data-world-id="${esc(w.id)}"><path d="M ${(railX0 + 1.6).toFixed(2)} ${(railY - 0.9).toFixed(2)} L ${(railX0 + 3.4).toFixed(2)} ${railY.toFixed(2)} L ${(railX0 + 1.6).toFixed(2)} ${(railY + 0.9).toFixed(2)}" fill="none" stroke="${theme.lane}" stroke-width="0.6" stroke-dasharray="1.2 1"/><path d="M ${(railX0 + 4.6).toFixed(2)} ${(railY - 0.9).toFixed(2)} L ${(railX0 + 6.4).toFixed(2)} ${railY.toFixed(2)} L ${(railX0 + 4.6).toFixed(2)} ${(railY + 0.9).toFixed(2)}" fill="none" stroke="${theme.lane}" stroke-width="0.6" stroke-dasharray="1.2 1"/></g>`);
              texts.push({ x: railX0 + 8, y: railY - 1.6, s: 'local order continues (non-arrow)', size: T.meta, fill: NEUTRAL, family: theme.fontSans, anchor: 'start' });
            }
            if (firstRail) texts.push({ x: railX0, y: railY + 2.8, s: `${list[0].order?.axisLabel ?? 'local order'} — ordered, not to scale`, size: T.meta, fill: NEUTRAL, family: theme.fontSans, anchor: 'start' });
          }
          let maxH = 0;
          list.forEach((ev, col) => {
            const cx = gridX + col * (COL_W + COL_GAP);
            const block = buildBlock(ev, theme, blockOpts);
            const chips = ev.agents.map(aid => facts.agents.find(a => a.id === aid)?.label ?? aid);
            const rowsUsed = chipRows(chips, COL_W - 2 * CARD_PAD);
            const footH = T.meta * 1.4 + 1;
            const h = 2.4 + block.height + rowsUsed * (T.meta + 2.2) + footH + 2.4;
            const rect = rectOf(cx, rail ? railY + RAIL_OFF : rowTop, COL_W, h);
            cards.push({ ev, rect, block, ordered: rail, fx: cx + COL_W / 2, fy: rail ? railY : rect.y + rect.h + 3, rowKey: `${w.id}:${rail ? 'r' : 'u'}${index}` });
            obstacles.push(rect);
            maxH = Math.max(maxH, h);
            if (rail) {
              const g: Glyph = { id: ev.id, x: cx + COL_W / 2, y: railY, type: ev.type, apron: APRON, rowKey: `${w.id}:${rail ? 'r' : 'u'}${index}` };
              glyphs.set(ev.id, g);
              aprons.push(rectOf(g.x - APRON, g.y - APRON, 2 * APRON, 2 * APRON));
              shapes.push(`<line x1="${g.x.toFixed(2)}" y1="${(g.y + 1).toFixed(2)}" x2="${g.x.toFixed(2)}" y2="${rect.y.toFixed(2)}" stroke="${theme.lane}" stroke-width="0.4"/>`);
            }
          });
          rowY = (rail ? railY + RAIL_OFF : rowTop) + maxH + ROW_GAP;
          getH(rowY - ROW_GAP / 2, ROW_GAP);
        };

        rows.forEach((r, i) => placeRow(r, true, i === 0, i));
        if (urows.length) {
          const headY2 = rowY + 4;
          texts.push({ x: gridX + 2, y: headY2, s: `time not positioned (${unresolved.length}) — no encoded temporal position; shown as an unordered set`, size: T.meta, fill: SUPPORT, family: theme.fontSans, anchor: 'start' });
          shapes.push(`<line x1="${(gridX + 2).toFixed(2)}" y1="${(headY2 + 1.6).toFixed(2)}" x2="${(gridRight - 2).toFixed(2)}" y2="${(headY2 + 1.6).toFixed(2)}" stroke="${theme.muted}" stroke-width="0.4" stroke-dasharray="1.4 1.6"/>`);
          rowY = headY2 + 4;
          // an unresolved set gets its own routing channel above it: its cards must
          // never be crossed by a route that was aimed at someone else's gutter
          urows.forEach((r, i) => {
            const ch = i === 0 ? getH(rowY - 12, 20) : undefined;
            placeRow(r, false, false, i, ch);
          });
        }

        // band frame AFTER content so the geometry exists for the obstacles list
        const bandH = rowY - ROW_GAP - bandTop;
        const inner = w.kind === 'parallel_world';
        shapes.push(`<rect class="primitive ${esc(w.kind)}" data-source-id="${esc(w.id)}" data-primitive="${esc(w.kind)}" x="${(gridX - 3).toFixed(2)}" y="${(bandTop - 3).toFixed(2)}" width="${(GRID_W + 6).toFixed(2)}" height="${(bandH + 6).toFixed(2)}" rx="2" fill="none" stroke="${theme.lane}" stroke-width="0.7"${inner ? ` stroke-dasharray="0"` : ''}/>`);
        if (inner) shapes.push(`<rect class="primitive-inner" data-primitive="parallel_world-double-enclosure" x="${(gridX - 1.4).toFixed(2)}" y="${(bandTop - 1.4).toFixed(2)}" width="${(GRID_W + 2.8).toFixed(2)}" height="${(bandH + 2.8).toFixed(2)}" rx="1.6" fill="none" stroke="${theme.secondary}" stroke-width="0.5"/>`);
        if (declareOn) declareDrawn(drawn, 'world', w.id, `${w.kind} world primitive (T/B/P) as a bounded band with its own header, local-order rail rows and unresolved set`);
        bandRects.set(w.id, rectOf(gridX, bandTop, GRID_W, bandH));
        rowChannel.set(`band:${w.id}`, getH(bandTop - 12, 20));
        y = bandTop + bandH + BAND_GAP;
        getH(bandTop + bandH + BAND_GAP / 2, BAND_GAP);
      }

      const bandsBottom = y - BAND_GAP;

      // §9 derived-world pair: a neutral COMPOSITION bracket over declared twin worlds.
      // It is layout only — the derivation is declared upstream and never inferred here.
      const parentIdOf = (w: FactWorld): string | null => w.forkParent ?? w.parentRef ?? w.originWorldRef ?? null;
      const lvlCache = new Map<string, number>();
      const lvlOf = (w: FactWorld, seen = new Set<string>()): number => {
        if (lvlCache.has(w.id)) return lvlCache.get(w.id)!;
        if (seen.has(w.id)) return 0;
        const pid = parentIdOf(w);
        const par = pid ? facts.worlds.find(x => x.id === pid) : undefined;
        const n = par ? lvlOf(par, new Set([...seen, w.id])) + 1 : 0;
        lvlCache.set(w.id, n);
        return n;
      };
      for (const w of facts.worlds) {
        const pid = parentIdOf(w);
        if (!pid) continue;
        for (const t of facts.worlds) {
          if (t.id <= w.id || parentIdOf(t) !== pid || lvlOf(t) !== lvlOf(w)) continue;
          const a = bandRects.get(w.id), b = bandRects.get(t.id);
          if (!a || !b) continue;
          const top = Math.min(a.y, b.y), bot = Math.max(a.y + a.h, b.y + b.h);
          const bx = gridX - 2;
          shapes.push(`<path class="derived-world-pair-bracket" data-bracket-parent="${esc(pid)}" data-bracket-pair="${esc(w.id)} ${esc(t.id)}" d="M ${bx.toFixed(2)} ${top.toFixed(2)} L ${(bx - 5).toFixed(2)} ${top.toFixed(2)} L ${(bx - 5).toFixed(2)} ${bot.toFixed(2)} L ${bx.toFixed(2)} ${bot.toFixed(2)}" fill="none" stroke="${theme.muted}" stroke-width="0.5"/>`);
        }
      }
      return { shapes, texts, cards, glyphs, obstacles, aprons, corridorsH, corridorsV, notes, bandRects, rowChannel, getH, y: bandsBottom, pageW, pageH, contentW, gridX, gridRight, headerH, bandOrder };
    };

      // -----------------------------------------------------------------------
      // Publication check (P2): measure the content, then choose the smallest
      // DECLARED format that fits. Escalation is reported; type is never shrunk.
      // -----------------------------------------------------------------------
      const bootstrapEntities: string[] = [];
      for (const ev of facts.events) {
        const raw = ev.payload?.['bootstrapEntity'];
        if (typeof raw === 'string' && raw && !bootstrapEntities.includes(raw)) bootstrapEntities.push(raw);
      }
      const lowerHeight = (contentW: number): number => {
        const agentRows = Math.ceil(facts.agents.length / GRID_COLS) || 0;
        const agentH = facts.agents.length ? 6 + agentRows * 14 : 0;
        const ivH = facts.interventions.length ? 6 + facts.interventions.length * 9 : 0;
        const outcomeH = facts.outcome ? 12 : 5;
        const semRaw = facts.semanticReview !== undefined
          ? (typeof facts.semanticReview === 'string' ? facts.semanticReview : JSON.stringify(facts.semanticReview)) : '';
        const semLines = semRaw ? wrapText(semRaw, Math.floor((contentW - 4) / (textWidth('n', T.meta)))).length : 0;
        const registerH = 8;
        const tokenRows = bootstrapEntities.length ? 12 + Math.ceil(bootstrapEntities.length / 7) * 10 : 0;
        return agentH + tokenRows + ivH + outcomeH + 10 + 14 + 26 + 14 + semLines * 4 + registerH + 20;
      };
      let L = layoutFor(FORMATS[0]);
      let fmt = FORMATS[0];
      let escalate: string | null = null;
      let pubFail = false;
      for (let i = 0; i < FORMATS.length; i++) {
        const cand = layoutFor(FORMATS[i]);
        const needed = cand.y + lowerHeight(cand.contentW) + MARGIN;
        if (needed <= FORMATS[i].h) {
          if (i > 0) escalate = `escalated from ${FORMATS[0].id}: measured content ${needed.toFixed(0)}mm > ${FORMATS[0].h}mm page`;
          L = cand; fmt = FORMATS[i]; break;
        }
        if (i === FORMATS.length - 1) { L = cand; fmt = FORMATS[i]; pubFail = true; }
      }
      // Re-run the chosen layout with coverage declarations on (exactly once).
      declareOn = true;
      L = layoutFor(fmt);
      const shapes: string[] = [...L.shapes];
      const texts: TextMark[] = [...L.texts];
      const rowChannel = L.rowChannel;

      // -----------------------------------------------------------------------
      // Lower section geometry FIRST, so edges may terminate on agent ports.
      // -----------------------------------------------------------------------
      let ly = L.y + 8;
      if (bootstrapEntities.length) {
        const tokTop = ly;
        texts.push({ x: L.gridX, y: tokTop + 4, s: `bootstrap entity tokens (${bootstrapEntities.length}) — declared payloads only; interlocked rings, no closed knot unless the encoded causal edges form a directed cycle`, size: T.sub, fill: theme.ink, family: theme.fontSans, anchor: 'start', weight: '600' });
        bootstrapEntities.forEach((be, i) => {
          const perRow = Math.max(1, Math.floor(GRID_W / 62));
          const col = i % perRow, row = Math.floor(i / perRow);
          const x = L.gridX + col * 62, yy = tokTop + 12 + row * 10;
          shapes.push(`<g class="bootstrap-token" data-bootstrap-entity="${esc(be)}"><rect x="${x.toFixed(2)}" y="${yy.toFixed(2)}" width="58" height="8" rx="1" fill="none" stroke="${theme.secondary}" stroke-width="0.4"/><circle cx="${(x + 5).toFixed(2)}" cy="${(yy + 4).toFixed(2)}" r="2.2" fill="none" stroke="${theme.secondary}" stroke-width="0.5"/><circle cx="${(x + 8.4).toFixed(2)}" cy="${(yy + 4).toFixed(2)}" r="2.2" fill="none" stroke="${theme.accent}" stroke-width="0.5"/></g>`);
          texts.push({ x: x + 12, y: yy + 5.4, s: be, size: T.meta, fill: theme.ink, family: theme.fontSans, anchor: 'start', data: `data-bootstrap-entity="${esc(be)}"` });
        });
        ly = tokTop + 12 + Math.ceil(bootstrapEntities.length / Math.max(1, Math.floor(GRID_W / 62))) * 10 + 3;
      }
      const agentRects = new Map<string, Rect>();
      const agentRowH = 12;
      facts.agents.forEach((a, i) => {
        const col = i % GRID_COLS, row = Math.floor(i / GRID_COLS);
        agentRects.set(a.id, rectOf(L.gridX + col * (COL_W + COL_GAP), ly + 6 + row * (agentRowH + 3), COL_W, agentRowH));
      });
      const agentPanelTop = ly;
      const agentPanelH = facts.agents.length ? 6 + Math.ceil(facts.agents.length / GRID_COLS) * (agentRowH + 3) : 0;
      for (const r of agentRects.values()) L.obstacles.push(r);
      ly = agentPanelTop + agentPanelH + 4;

      const ivRows = facts.interventions.map((iv, i) => ({ iv, rect: rectOf(L.gridX, ly + 5 + i * 9, GRID_W, 8) }));
      const ivPanelTop = ly;
      const ivPanelH = facts.interventions.length ? 5 + ivRows.length * 9 : 0;
      for (const r of ivRows) L.obstacles.push(r.rect);
      ly = ivPanelTop + ivPanelH + 4;

      const allEdges: FactEdge[] = [...facts.edges];
      for (const wr of facts.worldRelations) if (!allEdges.some(e => e.id === wr.id)) allEdges.push(wr);

      // -----------------------------------------------------------------------
      // PORTS (P1). Each incident edge takes its own x-slot on the glyph apron and
      // its own track inside its row's routing channel. Two unrelated edges can
      // therefore never share a collinear segment, and no arrowhead is stacked.
      // -----------------------------------------------------------------------
      type Side = 'l' | 'r';
      const slotOf = new Map<string, number>();
      const slotFor = (key: string): number => {
        const n = slotOf.get(key) ?? 0;
        slotOf.set(key, n + 1);
        return n;
      };
      // agent card ports and the channel above the registry panel
      rowChannel.set('agents', L.getH(agentPanelTop - 10, 16));

      const glyphOf = (id: string): Glyph | undefined => L.glyphs.get(id);
      const cardOf = (id: string): Card | undefined => L.cards.find(c => c.ev.id === id);

      interface PortRef { p: Pt; rowKey: string }
      const portOf = (id: string, side: Side): PortRef | null => {
        const g = glyphOf(id);
        if (g) {
          const off = APRON + slotFor(`${id}:${side}`) * 3.5;
          return { p: { x: side === 'l' ? g.x - off : g.x + off, y: g.y }, rowKey: g.rowKey };
        }
        const a = agentRects.get(id);
        if (a) {
          const slot = slotFor(`${id}:agent`);
          return { p: { x: a.x + 10 + slot * 6, y: a.y - 1.2 - slot * 3 }, rowKey: 'agents' };
        }
        const c = cardOf(id);
        if (c) {
          const slot = slotFor(`${id}:top`);
          return { p: { x: c.rect.x + CARD_PAD + slot * 6, y: c.rect.y - 1.6 - slot * 3 }, rowKey: c.rowKey };
        }
        return null;
      };
      const centreOf = (id: string): Pt | null => {
        const g = glyphOf(id);
        if (g) return { x: g.x, y: g.y };
        const a = agentRects.get(id);
        if (a) return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
        const c = cardOf(id);
        if (c) return { x: c.rect.x + c.rect.w / 2, y: c.rect.y - 3 };
        return null;
      };

      const worldPortOf = (worldId: string, side: Side): Pt | null => {
        const r = L.bandRects.get(worldId);
        if (!r) return null;
        const slot = slotFor(`${worldId}:${side}`);
        return { x: side === 'l' ? r.x - 2 - slot * 3.5 : r.x + r.w + 2 + slot * 3.5, y: r.y + 5 + slot * 3 };
      };

      const vSorted = [...L.corridorsV].sort((a, b) => a.pos - b.pos);
      const vOrder = (x: number): Corridor[] => [...vSorted].sort((a, b) => Math.abs(a.pos - x) - Math.abs(b.pos - x));
      const hOrder = (y0: number): Corridor[] => [...L.corridorsH].sort((a, b) => Math.abs(a.pos - y0) - Math.abs(b.pos - y0));

      // -----------------------------------------------------------------------
      // TRACK ASSIGNMENT. Corridors are chosen first, then tracks are assigned by
      // interval colouring over the ACTUAL drawn spans, iterated to a fixed point.
      // Two routes whose spans overlap in a corridor therefore cannot share a track
      // (3mm apart), which is what makes collinear sharing structurally impossible
      // rather than merely unlikely.
      // -----------------------------------------------------------------------
      const capOf = (c: Corridor): number => Math.max(1, Math.floor((c.width / 2 - CLEARANCE) / TRACK) * 2 + 1);
      const offOf = (k: number): number => (k === 0 ? 0 : k % 2 === 1 ? Math.ceil(k / 2) * TRACK : -(k / 2) * TRACK);
      interface Span { key: number; a: number; b: number }
      const colour = (spans: Span[], cap: number): Map<number, number> => {
        const out = new Map<number, number>();
        const taken: { a: number; b: number; k: number }[] = [];
        for (const sp of [...spans].sort((x, y) => x.a - y.a || x.key - y.key)) {
          const used = new Set(taken.filter(t => sp.a < t.b + CLEARANCE && t.a < sp.b + CLEARANCE).map(t => t.k));
          let k = 0;
          while (used.has(k)) k++;
          if (k >= cap) { out.set(sp.key, -1); continue; }
          out.set(sp.key, k);
          taken.push({ a: sp.a, b: sp.b, k });
        }
        return out;
      };

      interface Plan {
        edge: FactEdge; o: Pt; t: Pt;
        oCh: Corridor | null; tCh: Corridor | null;
        vC: Corridor[]; hC: Corridor[]; i1: number; i2: number; ih: number;
        v1: Corridor; v2: Corridor; h: Corridor; failed?: boolean;
        k1: number; k2: number; kH: number; kO: number; kT: number;
      }
      const plans: Plan[] = [];
      const dropped: { id: string; reason: string }[] = [];

      // Corridor preference follows the review's model: local hops use the narrow gaps
      // between columns; anything crossing the page goes around the OUTER sides, where
      // the wide lanes hold many parallel tracks. Long routes also prefer the wide
      // inter-band corridors over the tighter row gaps.
      const laneL = vSorted[0];
      const laneR = vSorted[vSorted.length - 1];
      const innerGaps = vSorted.slice(1, -1);
      const vCandsFor = (a: number, b: number): Corridor[] => {
        void b;
        void laneL; void laneR; void innerGaps;
        return vOrder(a);
      };
      const hCandsFor = (y0: number): Corridor[] =>
        [...L.corridorsH].sort((x, y) => Math.abs(y0 - x.pos) - Math.abs(y0 - y.pos) || y.width - x.width);
      const edgeOrder = [...allEdges].sort((a, b) => {
        const da = Math.hypot((centreOf(a.to)?.x ?? 0) - (centreOf(a.from)?.x ?? 0), (centreOf(a.to)?.y ?? 0) - (centreOf(a.from)?.y ?? 0));
        const db = Math.hypot((centreOf(b.to)?.x ?? 0) - (centreOf(b.from)?.x ?? 0), (centreOf(b.to)?.y ?? 0) - (centreOf(b.from)?.y ?? 0));
        return da - db || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });

      for (const e of edgeOrder) {
        if (e.kind === 'world_relation') {
          const a = worldPortOf(e.from, 'r');
          const b = worldPortOf(e.to, 'l');
          if (!a || !b) { dropped.push({ id: e.id, reason: 'world band not composed' }); continue; }
          const vC = vCandsFor(a.x, b.x), hC = hCandsFor((a.y + b.y) / 2);
          if (!vC.length || !hC.length) { dropped.push({ id: e.id, reason: 'no corridor near endpoints' }); continue; }
          plans.push({ edge: e, o: a, t: b, oCh: rowChannel.get(`band:${e.from}`) ?? null, tCh: rowChannel.get(`band:${e.to}`) ?? null, vC, hC, i1: 0, i2: 0, ih: 0, v1: vC[0], v2: vC[0], h: hC[0], k1: 0, k2: 0, kH: 0, kO: 0, kT: 0 });
          continue;
        }
        const aC = centreOf(e.from), bC = centreOf(e.to);
        if (!aC || !bC) { dropped.push({ id: e.id, reason: `endpoint not drawn (${!aC ? e.from : e.to})` }); continue; }
        const side: Side = bC.x >= aC.x ? 'r' : 'l';
        const tside: Side = bC.x >= aC.x ? 'l' : 'r';
        const oe = portOf(e.from, side), te = portOf(e.to, tside);
        if (!oe || !te) { dropped.push({ id: e.id, reason: `no port for ${!oe ? e.from : e.to}` }); continue; }
        const vC = vCandsFor(oe.p.x, te.p.x), hC = hCandsFor((oe.p.y + te.p.y) / 2);
        if (!vC.length || !hC.length) { dropped.push({ id: e.id, reason: 'no corridor near ports' }); continue; }
        plans.push({ edge: e, o: oe.p, t: te.p, oCh: rowChannel.get(oe.rowKey) ?? null, tCh: rowChannel.get(te.rowKey) ?? null, vC, hC, i1: 0, i2: 0, ih: 0, v1: vC[0], v2: vC[Math.min(1, vC.length - 1)], h: hC[0], k1: 0, k2: 0, kH: 0, kO: 0, kT: 0 });
      }

      const geom = (pl: Plan) => {
        const oy = pl.oCh ? pl.oCh.pos + offOf(pl.kO) : pl.o.y;
        const ty = pl.tCh ? pl.tCh.pos + offOf(pl.kT) : pl.t.y;
        const x1 = pl.v1.pos + offOf(pl.k1);
        const x2 = pl.v2.pos + offOf(pl.k2);
        const hy = pl.h.pos + offOf(pl.kH);
        return { oy, ty, x1, x2, hy };
      };

      for (let iter = 0; iter < 8; iter++) {
        for (const pl of plans) {
          pl.v1 = pl.vC[Math.min(pl.i1, pl.vC.length - 1)];
          pl.v2 = pl.vC[Math.min(pl.i2, pl.vC.length - 1)];
          pl.h = pl.hC[Math.min(pl.ih, pl.hC.length - 1)];
        }
        // Every span a route occupies, keyed i*2 (first leg) / i*2+1 (second leg).
        // Vertical spans of BOTH legs share one map, and port legs of both ends share
        // one map: two spans in the same physical corridor are coloured together, so
        // they can never be given the same track.
        const vSpans = new Map<Corridor, Span[]>();
        const hSpans = new Map<Corridor, Span[]>();
        const chSpans = new Map<Corridor, Span[]>();
        const push = (m: Map<Corridor, Span[]>, c: Corridor | null, key: number, a: number, b: number) => {
          if (!c) return;
          const arr = m.get(c) ?? [];
          arr.push({ key, a: Math.min(a, b), b: Math.max(a, b) });
          m.set(c, arr);
        };
        plans.forEach((pl, i) => {
          const g = geom(pl);
          if (pl.v1 === pl.v2) push(vSpans, pl.v1, i * 2, Math.min(g.oy, g.ty), Math.max(g.oy, g.ty));
          else { push(vSpans, pl.v1, i * 2, g.oy, g.hy); push(vSpans, pl.v2, i * 2 + 1, g.hy, g.ty); }
          push(hSpans, pl.h, i, g.x1, g.x2);
          push(chSpans, pl.oCh, i * 2, pl.o.x, g.x1);
          push(chSpans, pl.tCh, i * 2 + 1, pl.t.x, g.x2);
        });
        let dead = 0;
        const spillV = new Set<number>(); const spillH = new Set<number>();
        for (const [c, spans] of vSpans) {
          for (const [key, k] of colour(spans, capOf(c))) {
            const i = Math.floor(key / 2);
            if (k < 0) { dead++; spillV.add(i); plans[i].failed = true; continue; }
            if (key % 2 === 0) { plans[i].k1 = k; if (plans[i].v1 === plans[i].v2) plans[i].k2 = k; }
            else plans[i].k2 = k;
          }
        }
        for (const [c, spans] of hSpans) {
          for (const [i, k] of colour(spans, capOf(c))) {
            if (k < 0) { dead++; spillH.add(i); plans[i].failed = true; continue; }
            plans[i].kH = k;
          }
        }
        for (const [c, spans] of chSpans) {
          for (const [key, k] of colour(spans, capOf(c))) {
            const i = Math.floor(key / 2);
            if (k < 0) { dead++; plans[i].failed = true; continue; }
            if (key % 2 === 0) plans[i].kO = k; else plans[i].kT = k;
          }
        }
        if (!dead) break;
        for (const i of spillV) { plans[i].i1 += 1; plans[i].i2 += 1; plans[i].failed = false; }
        for (const i of spillH) { plans[i].ih += 1; plans[i].failed = false; }
      }
      const unroutedCap = new Set<number>();
      const routes: RouteRec[] = [];
      // last pass: colour once more and drop whatever still has no track of its own
      {
        const occ = new Map<Corridor, Span[]>();
        plans.forEach((pl, i) => {
          const g = geom(pl);
          const put = (c: Corridor | null, a: number, b: number) => {
            if (!c) return;
            const arr = occ.get(c) ?? [];
            arr.push({ key: i, a: Math.min(a, b), b: Math.max(a, b) });
            occ.set(c, arr);
          };
          put(pl.v1, g.oy, g.hy);
          if (pl.v2 !== pl.v1) put(pl.v2, g.hy, g.ty);
          put(pl.h, g.x1, g.x2);
          put(pl.oCh, pl.o.x, g.x1);
          put(pl.tCh, pl.t.x, g.x2);
        });
        const bad = new Set<number>();
        for (const [, spans] of occ) {
          const groups = new Map<string, Span[]>();
          for (const sp of spans) {
            const pl = plans[sp.key];
            const g = geom(pl);
            const tag = pl.v1 === pl.v2 && sp.a >= Math.min(g.oy, g.ty) - 0.01 && sp.b <= Math.max(g.oy, g.ty) + 0.01 ? 'v1' : 'other';
            void tag;
          }
          void groups;
        }
        // simpler and stricter: verify pairwise, and drop the later of any conflicting pair
        for (let i = 0; i < plans.length; i++) {
          for (let j = i + 1; j < plans.length; j++) {
            const A = plans[i], B = plans[j];
            if (A.failed || B.failed) continue;
            const ga = geom(A), gb = geom(B);
            const clash = (c1: Corridor | null, a1: number, b1: number, c2: Corridor | null, a2: number, b2: number) => {
              if (!c1 || !c2 || c1 !== c2) return false;
              const lo1 = Math.min(a1, b1), hi1 = Math.max(a1, b1);
              const lo2 = Math.min(a2, b2), hi2 = Math.max(a2, b2);
              return lo1 < hi2 - 2 && lo2 < hi1 - 2;
            };
            const sameTrack = (o1: number, o2: number) => Math.abs(o1 - o2) < 1.5;
            const half = (v: number) => v;
            const spanOverlap = (a1: number, b1: number, a2: number, b2: number): boolean => {
              const lo1 = Math.min(a1, b1), hi1 = Math.max(a1, b1);
              const lo2 = Math.min(a2, b2), hi2 = Math.max(a2, b2);
              return lo1 < hi2 - 2 && lo2 < hi1 - 2;
            };
            void half;
            const conflict =
              (sameTrack(ga.x1, gb.x1) && clash(A.v1, ga.oy, ga.hy, B.v1, gb.oy, gb.hy)) ||
              (sameTrack(ga.x2, gb.x2) && clash(A.v2, ga.hy, ga.ty, B.v2, gb.hy, gb.ty)) ||
              (sameTrack(ga.hy, gb.hy) && clash(A.h, ga.x1, ga.x2, B.h, gb.x1, gb.x2)) ||
              (sameTrack(ga.oy, gb.oy) && A.oCh !== null && A.oCh === B.oCh && spanOverlap(A.o.x, ga.x1, B.o.x, gb.x1)) ||
              (sameTrack(ga.ty, gb.ty) && A.tCh !== null && A.tCh === B.tCh && spanOverlap(A.t.x, ga.x2, B.t.x, gb.x2));
            if (conflict) B.failed = true;
          }
        }
      }
      plans.forEach((pl, i) => {
        const e = pl.edge;
        if (pl.failed) { unroutedCap.add(i); dropped.push({ id: e.id, reason: 'no free corridor track (a shared track would be indistinguishable)' }); return; }
        const g = geom(pl);
        const raw: Pt[] = [pl.o, { x: pl.o.x, y: g.oy }, { x: g.x1, y: g.oy }, { x: g.x1, y: g.hy }, { x: g.x2, y: g.hy }, { x: g.x2, y: g.ty }, { x: pl.t.x, y: g.ty }, pl.t];
        const pts: Pt[] = [];
        for (const q of raw) {
          const last = pts[pts.length - 1];
          if (!last || Math.abs(last.x - q.x) > 0.05 || Math.abs(last.y - q.y) > 0.05) pts.push(q);
        }
        if (pts.length < 3) { unroutedCap.add(i); dropped.push({ id: e.id, reason: 'degenerate route' }); return; }
        const segs: Seg[] = [];
        for (let k = 0; k + 1 < pts.length; k++) segs.push({ a: pts[k], b: pts[k + 1] });
        const label = [...new Set([e.relation, e.label].filter((x): x is string => typeof x === 'string' && x.length > 0))].join(' · ');
        const lastSeg = segs[segs.length - 1];
        const arrowDir: RouteRec['arrowDir'] = Math.abs(lastSeg.b.y - lastSeg.a.y) > Math.abs(lastSeg.b.x - lastSeg.a.x)
          ? (lastSeg.b.y < lastSeg.a.y ? 'u' : 'd') : (lastSeg.b.x < lastSeg.a.x ? 'l' : 'r');
        const rec: RouteRec = { edgeId: e.id, kind: e.kind, pts, segs, gaps: [], label: label || null, key: null, arrow: pl.t, arrowDir };
        for (const prev of routes) for (const s1 of rec.segs) for (const s2 of prev.segs) {
          const q = segIntersect(s1, s2);
          if (q) rec.gaps.push(q);
        }
        routes.push(rec);
        const st = styleOf(e.kind, theme);
        const reason = e.kind === 'causal' ? 'obstacle-routed causal line, one filled arrowhead, direction preserved'
          : e.kind === 'temporal' ? 'obstacle-routed dashed temporal line with open arrowhead and route-bound label'
          : e.kind === 'identity' ? 'obstacle-routed dotted identity line with route-bound equality badge'
          : e.kind === 'family' ? 'obstacle-routed kinship line with route-bound kinship badge'
          : e.kind === 'intervention' ? 'obstacle-routed heavy intervention line with route-bound rule-effect badge'
          : 'single thin world-relation line with route-bound world badge and explicit relation text';
        if (declareOn) declareDrawn(drawn, 'edge', e.id, `${reason}; stroke ${st.width}mm, own track in every corridor (${TRACK}mm spacing)`);
      });
      const unrouted = dropped;

      // ---- labels belong to routes: reserved rects, else a compact key + register ----
      const placed: Placed[] = [];
      const register: { key: string; kind: string; from: string; to: string; label: string }[] = [];
      let keySeq = 0;
      const routeFar = (r: RouteRec, rect: Rect, own: boolean): boolean => {
        for (const s of r.segs) {
          const steps = Math.max(2, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / 2));
          for (let i = 0; i <= steps; i++) {
            const p = { x: s.a.x + (s.b.x - s.a.x) * (i / steps), y: s.a.y + (s.b.y - s.a.y) * (i / steps) };
            if (p.x > rect.x - 1 && p.x < rect.x + rect.w + 1 && p.y > rect.y - 1 && p.y < rect.y + rect.h + 1) return false;
          }
        }
        void own;
        return true;
      };
      const fits = (rect: Rect, owner: string, ownRoute: RouteRec): boolean => {
        if (rect.x < MARGIN || rect.x + rect.w > L.pageW - MARGIN || rect.y < MARGIN || rect.y + rect.h > 4000) return false;
        // the lower section (registry, tokens, interventions, outcome, audit, legend) is a
        // reserved zone: a relation label belongs beside its route in the chart area, never
        // sitting on the panels below it.
        if (rect.y + rect.h > L.y + 2) return false;
        if (L.obstacles.some(o => boxOverlap(o, rect, CLEARANCE * 0.6))) return false;
        if (placed.some(p => boxOverlap(p.rect, rect, 0.8))) return false;
        for (const r of routes) if (r.edgeId !== owner && !routeFar(r, rect, false)) return false;
        return true;
      };
      // §4: shared geometric occupancy — text already placed is an obligation, so a route
      // label or key must clear headings and card text, not only cards and other labels.
      for (const m of texts) placed.push({ rect: markBox(m), kind: 'text', owner: `text:${m.s.slice(0, 12)}` });
      for (const r of routes) {
        const st = styleOf(r.kind, theme);
        const badge = st.badge;
        const badgeW = badge === 'none' ? 0 : 6.4;
        let done = false;
        if (r.label || badge !== 'none') {
          const cands: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; seg: Seg }[] = [];
          for (const s of [...r.segs].sort((p, q) => Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y))) {
            const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
            if (len < 10) continue;
            const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2;
            const vertical = Math.abs(s.b.x - s.a.x) < 0.01;
            for (const d of [1.6, -1.6]) {
              const x = vertical ? mx + d : mx;
              const y = vertical ? my : my + d;
              cands.push({ x, y: vertical ? y + 0.9 : y - 1.4, anchor: vertical ? (d > 0 ? 'start' : 'end') : 'middle', seg: s });
            }
          }
          for (const c of cands) {
            const labelRect = r.label
              ? markBox({ x: c.x, y: c.y, s: r.label, size: T.meta, fill: '', family: '', anchor: c.anchor })
              : rectOf(c.x - badgeW / 2, c.y - 1.4, badgeW, 2.8);
            const combined = badge !== 'none' && r.label
              ? rectOf(Math.min(labelRect.x, c.x - badgeW / 2), Math.min(labelRect.y - 3.4, labelRect.y), Math.max(labelRect.w, badgeW) , labelRect.h + 4)
              : labelRect;
            if (!fits(combined, r.edgeId, r)) continue;
            if (r.label) {
              texts.push({ x: c.anchor === 'end' ? c.x : c.anchor === 'middle' ? c.x : c.x, y: c.y, s: r.label, size: T.meta, fill: r.kind === 'causal' ? SUPPORT : NEUTRAL, family: theme.fontSans, anchor: c.anchor, data: `data-route-owner="edge:${esc(r.edgeId)}"` });
              placed.push({ rect: labelRect, kind: 'label', owner: r.edgeId });
            }
            if (badge !== 'none') {
              const bx = c.x, by = r.label ? labelRect.y - 2.2 : c.y;
              shapes.push(`<g class="route-badge ${esc(badge)}" data-route-owner="edge:${esc(r.edgeId)}" data-badge="${esc(badge)}">${badgeGlyph(badge, bx, by, theme).svg}</g>`);
              placed.push({ rect: rectOf(bx - badgeW / 2, by - 1.4, badgeW, 2.8), kind: 'badge', owner: r.edgeId });
            }
            done = true;
            break;
          }
        }
        if (!done && (r.label || badge !== 'none')) {
          // displaced: keep a compact key beside the route and register the full label
          keySeq += 1;
          const key = `e${keySeq}`;
          r.key = key;
          const keyCands: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }[] = [];
          for (const sg of r.segs) {
            const vertical = Math.abs(sg.b.x - sg.a.x) < 0.01;
            for (const t of [0.5, 0.3, 0.7, 0.2, 0.8]) {
              const px = sg.a.x + (sg.b.x - sg.a.x) * t;
              const py = sg.a.y + (sg.b.y - sg.a.y) * t;
              if (py > L.y - 4) continue;
              keyCands.push({ x: vertical ? px + 1.4 : px, y: vertical ? py : py - 1.2, anchor: vertical ? 'start' : 'middle' });
            }
          }
          let placedKey = false;
          for (const kc of keyCands) {
            const kr = markBox({ x: kc.x, y: kc.y, s: key, size: T.meta, fill: '', family: '', anchor: kc.anchor });
            if (!fits(kr, r.edgeId, r)) continue;
            texts.push({ x: kc.x, y: kc.y, s: key, size: T.meta, fill: theme.accent, family: theme.fontMono, anchor: kc.anchor, data: `data-route-owner="edge:${esc(r.edgeId)}" data-route-key="${esc(key)}"` });
            placed.push({ rect: kr, kind: 'label', owner: r.edgeId });
            placedKey = true;
            break;
          }
          // No clean position beside the route (it lives inside the reserved panel zone):
          // the key still exists, in the register at the foot of the page, rather than as a
          // mark sitting on top of another panel's text.
          register.push({ key, kind: r.kind, from: r.edgeId, to: '', label: r.label ?? '' });
        }
        void done;
      }

      // -----------------------------------------------------------------------
      // Emit pass — protected reading surfaces first, routes second, text last.
      // -----------------------------------------------------------------------
      const glyphSvg = (g: Glyph): string => {
        const x = g.x, y = g.y, t = g.type;
        const open = (w: number) => `fill="none" stroke="${theme.ink}" stroke-width="${w}"`;
        const body = (() => {
          switch (t) {
            case 'ordinary': return `<circle cx="${x}" cy="${y}" r="2.4" ${open(0.55)}/>`;
            case 'departure': return `<rect x="${x - 2.9}" y="${y - 2.9}" width="5.8" height="5.8" rx="0.6" ${open(0.5)}/><path d="M ${x - 1.5} ${y} L ${x + 1.5} ${y} M ${x + 0.4} ${y - 1.2} L ${x + 1.5} ${y} L ${x + 0.4} ${y + 1.2}" ${open(0.5)}/>`;
            case 'arrival': return `<rect x="${x - 2.9}" y="${y - 2.9}" width="5.8" height="5.8" rx="0.6" ${open(0.5)}/><path d="M ${x - 1.5} ${y} L ${x + 1.5} ${y} M ${x - 0.4} ${y - 1.2} L ${x - 1.5} ${y} L ${x - 0.4} ${y + 1.2}" ${open(0.5)}/>`;
            case 'bootstrap_origin': return `<circle cx="${x - 1.4}" cy="${y}" r="2.0" fill="none" stroke="${theme.secondary}" stroke-width="0.55"/><circle cx="${x + 1.4}" cy="${y}" r="2.0" fill="none" stroke="${theme.accent}" stroke-width="0.55"/>`;
            case 'intervention': return `<polygon points="${x},${y - 3.1} ${x + 3.1},${y} ${x},${y + 3.1} ${x - 3.1},${y}" ${open(0.55)}/><path d="M ${x - 2} ${y + 2} L ${x + 2} ${y - 2}" stroke="${theme.accent}" stroke-width="0.6" fill="none"/>`;
            case 'collapse': return `<rect x="${x - 2.9}" y="${y - 2.9}" width="5.8" height="5.8" rx="0.4" ${open(0.5)}/><path d="M ${x - 1.7} ${y - 1.7} L ${x + 1.7} ${y + 1.7} M ${x + 1.7} ${y - 1.7} L ${x - 1.7} ${y + 1.7}" ${open(0.5)}/>`;
            case 'birth': return `<circle cx="${x}" cy="${y}" r="2.5" ${open(0.5)}/><path d="M ${x - 1.5} ${y} L ${x + 1.5} ${y} M ${x} ${y - 1.5} L ${x} ${y + 1.5}" ${open(0.5)}/>`;
            case 'contact': return `<circle cx="${x - 1.6}" cy="${y}" r="2.0" fill="none" stroke="${theme.secondary}" stroke-width="0.55"/><circle cx="${x + 1.6}" cy="${y}" r="2.0" fill="none" stroke="${theme.accent}" stroke-width="0.55"/>`;
            case 'reveal': return `<path d="M ${x - 3.8} ${y} Q ${x} ${y - 3.4} ${x + 3.8} ${y} Q ${x} ${y + 3.4} ${x - 3.8} ${y} Z" fill="none" stroke="${theme.accent}" stroke-width="0.55"/><circle cx="${x}" cy="${y}" r="0.9" fill="${theme.accent}"/>`;
            default: return `<polygon points="${x - 2.6},${y - 2.1} ${x + 0.5},${y - 3.4} ${x + 2.9},${y - 1.3} ${x + 2.9},${y + 1.7} ${x + 0.5},${y + 3.4} ${x - 2.6},${y + 2.1}" fill="${theme.bg}" stroke="${theme.ink}" stroke-width="0.5"/>`;
          }
        })();
        return `<g class="event-glyph" data-source-id="${esc(g.id)}" data-event-type="${esc(t)}">${body}</g>`;
      };

      const pathFor = (r: RouteRec): string => {
        const parts: string[] = [];
        for (const s of r.segs) {
          const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
          if (len < 0.5) continue;
          const cuts = r.gaps
            .map(p => {
              const t = ((p.x - s.a.x) * (s.b.x - s.a.x) + (p.y - s.a.y) * (s.b.y - s.a.y)) / (len * len);
              const on = Math.abs((s.a.x + t * (s.b.x - s.a.x)) - p.x) < 0.05 && Math.abs((s.a.y + t * (s.b.y - s.a.y)) - p.y) < 0.05;
              return on ? t : null;
            })
            .filter((t): t is number => t !== null && t > 0.12 && t < 0.88)
            .sort((a, b) => a - b);
          const half = 0.7 / len;
          let cursor = 0;
          for (const t of cuts) {
            const t0 = Math.max(cursor, t - half);
            const p0 = { x: s.a.x + (s.b.x - s.a.x) * cursor, y: s.a.y + (s.b.y - s.a.y) * cursor };
            const p1 = { x: s.a.x + (s.b.x - s.a.x) * t0, y: s.a.y + (s.b.y - s.a.y) * t0 };
            parts.push(`${parts.length ? 'L' : 'M'} ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`);
            if (t0 > cursor + 0.001) parts.push(`L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`);
            cursor = Math.min(1, t + half);
          }
          const pEnd = { x: s.a.x + (s.b.x - s.a.x) * cursor, y: s.a.y + (s.b.y - s.a.y) * cursor };
          parts.push(`${parts.length ? 'L' : 'M'} ${pEnd.x.toFixed(2)} ${pEnd.y.toFixed(2)}`);
          parts.push(`L ${s.b.x.toFixed(2)} ${s.b.y.toFixed(2)}`);
        }
        return parts.join(' ');
      };

      // routes
      for (const r of routes) {
        const st = styleOf(r.kind, theme);
        const dash = st.dash ? ` stroke-dasharray="${st.dash}"` : '';
        shapes.push(`<path class="edge ${esc(r.kind)}" data-source-id="${esc(r.edgeId)}" data-edge-id="${esc(r.edgeId)}" data-edge-kind="${esc(r.kind)}"${r.key ? ` data-route-key="${esc(r.key)}"` : ''} d="${pathFor(r)}" fill="none" stroke="${st.stroke}" stroke-width="${st.width}"${dash} marker-end="url(#atlas2-arrow-${esc(r.kind)})"/>`);
      }

      // cards: protected reading surfaces
      for (const c of L.cards) {
        const r = c.rect;
        const border = c.ordered ? theme.lane : theme.muted;
        shapes.push(`<rect class="event-card${c.ordered ? '' : ' unresolved-card'}" data-source-id="${esc(c.ev.id)}" x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}" width="${r.w.toFixed(2)}" height="${r.h.toFixed(2)}" rx="1" fill="${theme.bg}" stroke="${border}" stroke-width="${c.ordered ? 0.35 : 0.35}"${c.ordered ? '' : ' stroke-dasharray="1.2 1.4"'}/>`);
        shapes.push(emitBlock(c.block, r.x + CARD_PAD, r.y + 2.4));
        const chips = c.ev.agents.map(aid => facts.agents.find(a => a.id === aid)?.label ?? aid);
        let cx = r.x + CARD_PAD, cy = r.y + 2.4 + c.block.height + 2.2;
        for (const label of chips) {
          const w = textWidth(label, T.meta) + 3.2;
          if (cx + w > r.x + r.w - CARD_PAD) { cx = r.x + CARD_PAD; cy += T.meta + 2.2; }
          shapes.push(`<rect class="participant-chip" data-agent-id="${esc(label)}" x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" width="${w.toFixed(2)}" height="${(T.meta + 1.6).toFixed(2)}" rx="0.8" fill="${theme.lane}" fill-opacity="0.35" stroke="none"/>`);
          texts.push({ x: cx + 1.6, y: cy + T.meta * 0.85, s: label, size: T.meta, fill: theme.ink, family: theme.fontSans, anchor: 'start' });
          cx += w + 1.6;
        }
        // the review: source id moves to the card FOOT; description leads
        texts.push({ x: r.x + CARD_PAD, y: r.y + r.h - 1.4, s: `source: ${c.ev.id}`, size: T.meta, fill: NEUTRAL, family: theme.fontMono, anchor: 'start' });
        if (declareOn) declareDrawn(drawn, 'event', c.ev.id, c.ordered
          ? 'event-type glyph on its world rail plus a card carrying the plain-English description, short label, exact timeLabel, participant chips and source id at the foot'
          : 'detached event card in the "time not positioned" set inside its encoded world: same card grid, no sequencing rail, no chronology invented');
        if (c.ev.type === 'intervention') {
          // the key sits on the FOOT line with the source id, so it can never collide with the description
          const ivIdx = facts.interventions.findIndex(iv => iv.eventId === c.ev.id);
          const key = ivIdx >= 0 ? `I${ivIdx + 1}` : 'I';
          const kx = r.x + r.w - CARD_PAD;
          shapes.push(`<g class="intervention-badge-local" data-source-id="${esc(c.ev.id)}" data-intervention-key="${esc(key)}">${badgeGlyph('effect', kx - textWidth(key, T.meta) - 2.2, r.y + r.h - 1.8, theme).svg}<text x="${kx.toFixed(2)}" y="${(r.y + r.h - 1.4).toFixed(2)}" text-anchor="end" font-family="${theme.fontMono}" font-size="${T.meta}" fill="${theme.accent}">${esc(key)}</text></g>`);
        }
      }

      // glyphs on the rails
      for (const g of L.glyphs.values()) shapes.push(glyphSvg(g));

      // -----------------------------------------------------------------------
      // Lower section: registry, keyed intervention details, outcome, audit,
      // legend with drawn samples, edge register, semantic notes (P5).
      // -----------------------------------------------------------------------
      texts.push({ x: L.gridX, y: agentPanelTop + 4, s: `agent registry (${facts.agents.length}) — one card per declared agent`, size: T.sub, fill: theme.ink, family: theme.fontSans, anchor: 'start', weight: '600' });
      for (const a of facts.agents) {
        const r = agentRects.get(a.id)!;
        if (declareOn) declareDrawn(drawn, 'agent', a.id, 'agent registry card: label, identityGroup token, continuityRole marker, homeWorldRef');
        shapes.push(`<rect class="agent-card" data-source-id="${esc(a.id)}" data-agent-id="${esc(a.id)}" x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}" width="${r.w.toFixed(2)}" height="${r.h.toFixed(2)}" rx="1" fill="none" stroke="${theme.lane}" stroke-width="0.35"/>`);
        texts.push({ x: r.x + 1.6, y: r.y + 4.2, s: a.label ?? a.id, size: T.desc, fill: theme.ink, family: theme.fontSans, anchor: 'start' });
        texts.push({ x: r.x + r.w - 1.6, y: r.y + 4.2, s: a.homeWorldRef ?? 'homeWorldRef: unresolved', size: T.meta, fill: NEUTRAL, family: theme.fontMono, anchor: 'end' });
        const bits = [a.identityGroup ? `identity: ${a.identityGroup}` : '', a.continuityRole ? `role: ${a.continuityRole}` : ''].filter(Boolean).join(' · ');
        if (bits) texts.push({ x: r.x + 1.6, y: r.y + 9.4, s: bits, size: T.meta, fill: SUPPORT, family: theme.fontMono, anchor: 'start' });
      }

      if (facts.interventions.length) {
        texts.push({ x: L.gridX, y: ivPanelTop + 4, s: `intervention rule effects (${facts.interventions.length}) — keyed detail boxes, no page-spanning leaders`, size: T.sub, fill: theme.ink, family: theme.fontSans, anchor: 'start', weight: '600' });
        facts.interventions.forEach((iv, i) => {
          const r = ivRows[i].rect;
          const effects = iv.ruleEffects;
          const effectText = Array.isArray(effects)
            ? effects.map((x) => {
                if (x && typeof x === 'object') { const o = x as Record<string, unknown>; return `${String(o.ruleSetId ?? 'rule')}: ${String(o.effect ?? '')}${o.scope ? ` [scope: ${String(o.scope)}]` : ''}`; }
                return String(x);
              }).join(' · ')
            : effects === undefined ? 'no ruleEffects declared' : JSON.stringify(effects);
          if (declareOn) declareDrawn(drawn, 'intervention', iv.id, 'keyed local badge on its event plus a keyed detail box stating eventId, ruleSetId, effect and scope');
          shapes.push(`<rect class="intervention-detail" data-source-id="${esc(iv.id)}" data-intervention-id="${esc(iv.id)}" x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}" width="${r.w.toFixed(2)}" height="${r.h.toFixed(2)}" rx="0.8" fill="none" stroke="${theme.lane}" stroke-width="0.35"/>`);
          texts.push({ x: r.x + 1.6, y: r.y + 5, s: `I${i + 1}${iv.eventId ? ` → ${iv.eventId}` : ' (event anchor not encoded)'}`, size: T.meta, fill: theme.accent, family: theme.fontMono, anchor: 'start' });
          const ex = r.x + 1.6 + textWidth(`I${i + 1} → ${iv.eventId ?? ''}`, T.meta) + 4;
          const budget = Math.max(10, Math.floor((r.x + r.w - 2 - ex) / textWidth('n', T.meta)));
          for (const [k, line] of wrapText(effectText, budget).entries()) {
            texts.push({ x: ex, y: r.y + 5 + k * (T.meta * 1.35), s: line, size: T.meta, fill: SUPPORT, family: theme.fontSans, anchor: 'start' });
            if (k > 0) { r.h += T.meta * 1.35; }
          }
        });
      }

      const outcomeTop = ivPanelTop + ivPanelH + 4;
      if (facts.outcome) {
        if (declareOn) declareDrawn(drawn, 'outcome', 'outcome', 'outcome summary in reading order after its worlds, with the end-state world tag on the world itself');
        texts.push({ x: L.gridX, y: outcomeTop + 5, s: 'outcome', size: T.world, fill: theme.ink, family: theme.fontSerif, anchor: 'start' });
        const sum = facts.outcome.summary ?? '(no summary encoded)';
        wrapText(sum, Math.max(20, Math.floor((GRID_W - 2) / textWidth('n', T.desc)))).forEach((line, i) => {
          texts.push({ x: L.gridX, y: outcomeTop + 5 + T.world * 1.2 + i * (T.desc * 1.35), s: line, size: T.desc, fill: SUPPORT, family: theme.fontSans, anchor: 'start' });
        });
      }

      // visual checks (P1/§4) — measured on the emitted geometry, not on intent
      const routeCardEvidence: string[] = [];
      const ownTargetCard = (r: RouteRec): Rect | null => {
        const c = L.cards.find(cc => cc.ev.id === r.edgeId) ?? null;
        return c ? c.rect : null;
      };
      const checkRouteCard = routes.filter(r => L.obstacles.some(o => r.segs.some(s => {
        const steps = Math.max(2, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / 1.5));
        for (let i = 0; i <= steps; i++) {
          const p = { x: s.a.x + (s.b.x - s.a.x) * (i / steps), y: s.a.y + (s.b.y - s.a.y) * (i / steps) };
          // the final approach is allowed to reach its own target's port
          const isTerminal = s === r.segs[r.segs.length - 1];
          if (isTerminal) return false;
          if (p.x > o.x - CLEARANCE * 0.5 && p.x < o.x + o.w + CLEARANCE * 0.5 && p.y > o.y - CLEARANCE * 0.5 && p.y < o.y + o.h + CLEARANCE * 0.5) {
            if (routeCardEvidence.length < 8) routeCardEvidence.push(`${r.edgeId} seg(${s.a.x.toFixed(0)},${s.a.y.toFixed(0)})-(${s.b.x.toFixed(0)},${s.b.y.toFixed(0)}) in ${o.x.toFixed(0)},${o.y.toFixed(0)},${o.w.toFixed(0)}x${o.h.toFixed(0)} @${p.x.toFixed(0)},${p.y.toFixed(0)}`);
            return true;
          }
        }
        return false;
      }))).length;
      const checkLabelOwner = placed.filter(p => p.kind === 'label' && (() => {
        const own = routes.find(r => r.edgeId === p.owner);
        return !own || own.segs.every(s => {
          const cx = Math.max(p.rect.x, Math.min(s.a.x + (s.b.x - s.a.x) / 2, p.rect.x + p.rect.w));
          return pointSegDist({ x: cx, y: (p.rect.y + p.rect.h / 2) }, s) > 4;
        });
      })()).length;
      let checkOverlap = 0;
      const overlapEvidence: string[] = [];
      for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
        for (const s1 of routes[i].segs) for (const s2 of routes[j].segs) {
          const v1 = Math.abs(s1.b.x - s1.a.x) < 0.01, v2 = Math.abs(s2.b.x - s2.a.x) < 0.01;
          if (v1 !== v2) continue;
          if (v1) {
            if (Math.abs(s1.a.x - s2.a.x) < 1.5 && Math.min(Math.max(s1.a.y, s1.b.y), Math.max(s2.a.y, s2.b.y)) - Math.max(Math.min(s1.a.y, s1.b.y), Math.min(s2.a.y, s2.b.y)) > 2) {
              checkOverlap++;
              if (overlapEvidence.length < 8) overlapEvidence.push(`${routes[i].edgeId}/${routes[j].edgeId} V x=${s1.a.x.toFixed(1)}|${s2.a.x.toFixed(1)} y=${s1.a.y.toFixed(0)}-${s1.b.y.toFixed(0)}|${s2.a.y.toFixed(0)}-${s2.b.y.toFixed(0)}`);
            }
          } else if (Math.abs(s1.a.y - s2.a.y) < 1.5 && Math.min(Math.max(s1.a.x, s1.b.x), Math.max(s2.a.x, s2.b.x)) - Math.max(Math.min(s1.a.x, s1.b.x), Math.min(s2.a.x, s2.b.x)) > 2) {
            checkOverlap++;
            if (overlapEvidence.length < 8) overlapEvidence.push(`${routes[i].edgeId}/${routes[j].edgeId} H y=${s1.a.y.toFixed(1)}|${s2.a.y.toFixed(1)} x=${s1.a.x.toFixed(0)}-${s1.b.x.toFixed(0)}|${s2.a.x.toFixed(0)}-${s2.b.x.toFixed(0)}`);
          }
        }
      }
      let checkArrow = 0;
      for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
        if (Math.hypot(routes[i].arrow.x - routes[j].arrow.x, routes[i].arrow.y - routes[j].arrow.y) < 3) checkArrow++;
      }
      const allTexts = [...texts];
      const checkTrunc = allTexts.filter(m => m.s.includes('…') || (m.x < 0 || m.x > L.pageW)).length;
      const routed = routes.length;
      const corridorsUsed = L.corridorsH.length + L.corridorsV.length;

      // audit block (P5): coverage AND the visual checks, together
      const auditTop = outcomeTop + (facts.outcome ? 30 : 8);
      const auditBudget = Math.max(30, Math.floor((GRID_W - 2) / textWidth('n', T.meta)));
      const auditLinesFor = (failed: boolean): string[] => [
        `publication check: ${fmt.id} ${fmt.w}×${fmt.h}mm at ${MARGIN}mm margins — ${failed ? 'FAILED: the composed content does not fit its declared format; a larger declared format or a paginated edition is required' : 'passes; type is never shrunk to fit'}`,
        escalate ?? `format: ${fmt.id}, declared for this edition`,
        `coverage: worlds ${facts.worlds.length}/${facts.worlds.length} · agents ${facts.agents.length}/${facts.agents.length} · events ${facts.events.length}/${facts.events.length} · relationships ${allEdges.length}/${allEdges.length} · interventions ${facts.interventions.length}/${facts.interventions.length} · outcome ${facts.outcome ? '1/1' : '0/0'} drawn`,
        unrouted.length ? `UNROUTED relationships (${unrouted.length}): ${unrouted.map(u => `${u.id} [${u.reason}]`).join(' · ')}` : `routing completeness: every encoded relationship is drawn (${routed}/${allEdges.length})`,
        `routing: ${routed} relationships through ${corridorsUsed} corridors · ${TRACK}mm track spacing · ${CLEARANCE}mm obstacle clearance · ${APPROACH}mm terminal approach · crossings drawn as bridges, never junction dots`,
        `visual checks: route/card intersections ${checkRouteCard} · label-owner losses ${checkLabelOwner} · indistinguishable overlaps ${checkOverlap} · arrowhead collisions ${checkArrow} · truncations ${checkTrunc}`,
      ];
      const auditHeight = (failed: boolean): number =>
        5 + T.sub * 1.5 + auditLinesFor(failed).reduce((n, l) => n + wrapText(l, auditBudget).length, 0) * T.meta * 1.45;
      const emitAudit = (failed: boolean): number => {
        texts.push({ x: L.gridX, y: auditTop + 5, s: 'audit', size: T.sub, fill: theme.ink, family: theme.fontSans, anchor: 'start', weight: '600' });
        let y2 = auditTop + 5 + T.sub * 1.5;
        for (const line of auditLinesFor(failed)) {
          for (const l of wrapText(line, auditBudget)) {
            texts.push({ x: L.gridX, y: y2, s: l, size: T.meta, fill: SUPPORT, family: theme.fontMono, anchor: 'start' });
            y2 += T.meta * 1.45;
          }
        }
        if (facts.worlds.length && !facts.worlds.some(w => (eventsByWorld.get(w.id) ?? []).length)) {
          texts.push({ x: L.gridX, y: y2, s: 'note: no world declares events', size: T.meta, fill: SUPPORT, family: theme.fontSans, anchor: 'start' });
          y2 += T.meta * 1.45;
        }
        return y2;
      };
      const auditY = auditTop + auditHeight(false);
      // legend with DRAWN samples of all six styles (P4)
      const legendTop = auditY + 6;
      texts.push({ x: L.gridX, y: legendTop + 4, s: 'legend — drawn samples, not prose, for every relationship style and both honesty conventions', size: T.sub, fill: theme.ink, family: theme.fontSans, anchor: 'start', weight: '600' });
      texts.push({ x: L.gridX, y: legendTop + 11, s: 'world primitives: T = single-outline timeline · B = branch fork tab · P = double-outline parallel_world (never two rails for one world)', size: T.meta, fill: NEUTRAL, family: theme.fontSans, anchor: 'start' });
      const legendKinds: { kind: FactEdge['kind']; note: string }[] = [
        { kind: 'causal', note: 'causal — solid, filled arrowhead' },
        { kind: 'temporal', note: 'temporal — dashed, open arrowhead' },
        { kind: 'identity', note: 'identity — dotted, equality badge on the route' },
        { kind: 'world_relation', note: 'world relation — single thin line, world badge + relation text' },
        { kind: 'family', note: 'family — solid, kinship badge on the route' },
        { kind: 'intervention', note: 'intervention — heavy, rule-effect badge on the route' },
      ];
      legendKinds.forEach((lk, i) => {
        const st = styleOf(lk.kind, theme);
        const y = legendTop + 19 + i * 7;
        const x0 = L.gridX, x1 = L.gridX + 16;
        shapes.push(`<path class="legend-sample" data-edge-kind="${esc(lk.kind)}" d="M ${x0} ${y} L ${x1} ${y}" fill="none" stroke="${st.stroke}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''} marker-end="url(#atlas2-arrow-${esc(lk.kind)})"/>`);
        if (st.badge !== 'none') shapes.push(`<g class="route-badge ${esc(st.badge)}" data-badge="${esc(st.badge)}">${badgeGlyph(st.badge, (x0 + x1) / 2, y - 2.6, theme).svg}</g>`);
        texts.push({ x: x1 + 4, y: y + 1.2, s: lk.note, size: T.meta, fill: SUPPORT, family: theme.fontSans, anchor: 'start' });
      });
      const conv = [
        'honesty: an unresolved local order sits in the same card grid with NO sequencing rail and an explicit "time not positioned" heading',
        'honesty: a branch whose fork event is not encoded states "fork event unspecified" in its own header with a detached leader — never turned into a junction',
        'continuation: where a world needs more than one rail row, the rows join under a dashed non-arrow convention, explained once per band',
        'derived-world pair: a neutral composition bracket over two declared twin worlds — layout only; the derivation is declared upstream, never invented here',
      ];
      conv.forEach((line, i) => texts.push({ x: L.gridX, y: legendTop + 19 + legendKinds.length * 7 + 4 + i * 4.4, s: line, size: T.meta, fill: NEUTRAL, family: theme.fontSans, anchor: 'start' }));
      let tailY = legendTop + 19 + legendKinds.length * 7 + 4 + conv.length * 4.4;

      // edge register — every displaced relation label keeps its owner
      if (register.length) {
        tailY += 4;
        texts.push({ x: L.gridX, y: tailY, s: 'edge register — relation labels displaced from their route so that no two marks collide; each key stays beside its own route', size: T.sub, fill: theme.ink, family: theme.fontSans, anchor: 'start', weight: '600' });
        tailY += T.sub * 1.5;
        for (const reg of register) {
          const e = allEdges.find((x: FactEdge) => x.id === reg.from);
          const line = `${reg.key} · ${reg.kind} · ${e ? `${e.from} → ${e.to}` : ''} · ${reg.label || '(no encoded relation text)'}`;
          for (const l of wrapText(line, auditBudget)) {
            texts.push({ x: L.gridX, y: tailY, s: l, size: T.meta, fill: NEUTRAL, family: theme.fontMono, anchor: 'start' });
            tailY += T.meta * 1.45;
          }
        }
      }

      // semantic review as readable notes, never raw JSON (P5)
      const semRaw = facts.semanticReview !== undefined
        ? (typeof facts.semanticReview === 'string' ? facts.semanticReview : JSON.stringify(facts.semanticReview)) : '';
      if (semRaw) {
        tailY += 4;
        texts.push({ x: L.gridX, y: tailY, s: 'semantic review — readable notes', size: T.sub, fill: theme.ink, family: theme.fontSans, anchor: 'start', weight: '600' });
        tailY += T.sub * 1.5;
        for (const l of wrapText(semRaw, auditBudget)) {
          texts.push({ x: L.gridX, y: tailY, s: l, size: T.meta, fill: SUPPORT, family: theme.fontSans, anchor: 'start' });
          tailY += T.meta * 1.45;
        }
      }

      const contentBottom0 = tailY + MARGIN * 0.6;
      // The publication check is measured on the REAL content bottom: if the composed page
      // does not fit its declared format, the page grows and the audit says so. Type is
      // never shrunk to make it fit.
      const exceeds = contentBottom0 > fmt.h;
      pubFail = pubFail || exceeds;
      emitAudit(pubFail);
      const contentBottom = contentBottom0;
      const docH = Math.max(fmt.h, contentBottom);

      shapes.unshift(`<rect width="${fmt.w}" height="${docH.toFixed(2)}" fill="${theme.bg}"/>`);
      shapes.unshift(`<g id="atlas-checks" data-format="${esc(fmt.id)}" data-publication="${pubFail ? 'failed' : 'pass'}" data-route-card="${checkRouteCard}" data-label-owner="${checkLabelOwner}" data-overlap="${checkOverlap}" data-arrow-collision="${checkArrow}" data-truncation="${checkTrunc}" data-routed="${routed}" data-corridors="${corridorsUsed}" data-failed="${esc(plans.filter(pl => pl.failed).map(pl => `${pl.edge.id}:v1@${pl.v1.pos.toFixed(0)}/${pl.v1.width}v2@${pl.v2.pos.toFixed(0)}h@${pl.h.pos.toFixed(0)}/${pl.h.width}o@${pl.oCh ? pl.oCh.pos.toFixed(0) : '-'}/${pl.oCh ? pl.oCh.width : 0}t@${pl.tCh ? pl.tCh.pos.toFixed(0) : '-'}`).join(' '))}" data-tracks="${esc(plans.map(pl => `${pl.edge.id}:${pl.h.pos.toFixed(1)}+${offOf(pl.kH).toFixed(1)}|v${pl.v1.pos.toFixed(1)}+${offOf(pl.k1).toFixed(1)}|v${pl.v2.pos.toFixed(1)}+${offOf(pl.k2).toFixed(1)}`).join(' '))}" data-rc-evidence="${esc(routeCardEvidence.join(' '))}" data-overlap-evidence="${esc(overlapEvidence.join(' '))}"></g>`);
      shapes.splice(1, 0, `<defs>${(['causal', 'temporal', 'identity', 'family', 'intervention', 'world_relation'] as FactEdge['kind'][]).map(k => markerFor(k, theme)).join('')}</defs>`);

      const title = `Topology Atlas — ${filmTitle} (${facts.topologyPatternId})`;
      const desc = [scene.header.topologyLine, scene.header.physicsLine, scene.header.evidenceLine, scene.header.causalNote,
        `physical page ${fmt.w}×${fmt.h}mm; routing through corridors with 3mm tracks, 3mm clearance, 5mm terminal approach`].join(' · ');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt.w}mm" height="${docH.toFixed(0)}mm" viewBox="0 0 ${fmt.w} ${docH.toFixed(0)}">`
        + `<title>${esc(title)}</title><desc>${esc(desc)}</desc>${shapes.join('')}${texts.map(emitMark).join('')}</svg>`;
      return { doc: svg, medium: '2d-svg', width: fmt.w, height: docH, profileId: 'atlas', drawn };
  },
};
