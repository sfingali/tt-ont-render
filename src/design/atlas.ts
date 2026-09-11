/**
 * DESIGN — "Atlas" (2D, topology-first atlas).
 *
 * Implements the primitive-to-form grammar of DESIGN-ATLAS.md §2 literally:
 * T/B/P world primitives, event-type glyphs, and one routing channel per
 * encoded edge kind. The engine has already resolved every fact; this profile
 * never invents a junction, a chronology, or a connection.
 *
 * Honesty rules are structural, not decorative:
 *   - a branch with no encoded fork event gets a detached leader and the words
 *     "fork event unspecified";
 *   - an unresolved local order is shown on a visible shelf;
 *   - every edge the document strokes is declared in `drawn`, and every drawn
 *     edge carries exactly one SVG arrowhead marker.
 *
 * Legibility floor (repo §8 contract, DESIGN-ATLAS §7 "publication threshold"):
 *   no drawn text is smaller than MIN_TEXT px. Type never shrinks to fit — the
 *   modules, gaps and canvas grow instead. Because larger type is denser type,
 *   every text mark is planned first and free-floating labels (edge relations,
 *   fork/origin/mirror annotations) are deconflicted against the placed boxes;
 *   a rare label that cannot sit near its mark falls through to a bottom edge
 *   register rather than overlapping.
 *
 * §9 composition: Adam/Eva sit below Origin under a neutral, layout-only
 * "derived-world pair" bracket, and every bootstrap entity declared in an
 * event payload gets an interlocked-ring token. No closed knot is fabricated:
 * the supplied causal edges are never re-routed into a cycle.
 */
import type { DesignProfile, DrawnSource, ThemeSpec } from './registry.ts';
import { declareDrawn, esc, textWidth, nodeTextBlock } from './registry.ts';
import type { NodeTextBlock } from './registry.ts';
import type { FactEdge, FactEvent, FactWorld, SemanticScene } from '../engine/types.ts';

// ---------------------------------------------------------------------------
// Publication threshold + layout scale.
// ---------------------------------------------------------------------------
const MIN_TEXT = 10;
const TEXT = {
  wrapChars: 32,
  descSize: 11,
  labelSize: 10.5,
  timeSize: 10.5,
  maxDescLines: 6,
  lineHeight: 1.32,
  gapAfterDesc: 6,
  gapAfterLabel: 4,
};
const M = { l: 76, r: 68, t: 186, b: 120 };
const WORLD_GAP = 56;
const ROW_GAP = 120;
const HEADER_H = 94;
const EVENT_GAP = 26;
const AGENT_CARD_W = 250;
const AGENT_CARD_H = 108;
const AGENT_GAP_X = 18;
const AGENT_GAP_Y = 16;
const AGENT_COLS = 4;
const CARD_PAD = 10;
const CARD_TOP = 24;
const CHIP_SIZE = 10;
const CHIP_H = 16;
const CHIP_GAP = 6;
const BRACKET_RISE = 50;

interface Rect { x: number; y: number; w: number; h: number }
type AnchorKind = 'event' | 'agent' | 'world' | 'unresolved';
interface Anchor { x: number; y: number; kind: AnchorKind; id: string; worldId?: string }

interface EventCard {
  ev: FactEvent;
  block: NodeTextBlock;
  w: number;
  h: number;
  /** ordered cards sit below their glyph; unresolved cards sit on the shelf */
  rect: Rect;
  anchor: Anchor;
  orderIndex: number | null;
}

interface WorldBox {
  world: FactWorld;
  rect: Rect;
  railY: number;
  ordered: EventCard[];
  unresolved: EventCard[];
  eventCards: Map<string, EventCard>;
  labelW: number;
}

interface AgentBox {
  id: string;
  label?: string;
  identityGroup?: string;
  continuityRole?: string;
  homeWorldRef?: string;
  rect: Rect;
  anchor: Anchor;
}

interface Box { x0: number; y0: number; x1: number; y1: number }
type AnchorName = 'start' | 'middle' | 'end';
interface Cand { x: number; y: number }

/** One planned text mark. `movable` marks are free-floating and resolved last. */
interface TextMark {
  x: number;
  y: number;
  s: string;
  size: number;
  fill: string;
  family: string;
  anchor: AnchorName;
  movable: boolean;
  priority: number;
  candidates?: Cand[];
  /** raw extra attributes (already escaped) for provenance/token hooks */
  data?: string;
}

function rect(x: number, y: number, w: number, h: number): Rect { return { x, y, w, h }; }

/** The exact box the legibility test estimates: width = chars * 0.52 * size. */
function boxOf(m: TextMark): Box {
  const w = textWidth(m.s, m.size);
  const h = m.size * 1.2;
  let x0 = m.x;
  if (m.anchor === 'middle') x0 = m.x - w / 2;
  else if (m.anchor === 'end') x0 = m.x - w;
  return { x0, y0: m.y - m.size * 0.9, x1: x0 + w, y1: m.y - m.size * 0.9 + h };
}

function hit(a: Box, b: Box, pad = 0): boolean {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
}

function emitMark(m: TextMark): string {
  const a = m.anchor !== 'start' ? ` text-anchor="${m.anchor}"` : '';
  const d = m.data ? ` ${m.data}` : '';
  return `<text x="${m.x.toFixed(1)}" y="${m.y.toFixed(1)}"${a} font-family="${m.family}" font-size="${m.size}" fill="${m.fill}"${d}>${esc(m.s)}</text>`;
}

/** Candidate offsets near a preferred anchor: vertical first, then lateral. */
function candidatesAround(x: number, y: number, s: string, size: number): Cand[] {
  const out: Cand[] = [{ x, y }];
  const stepY = Math.max(15, size * 1.9);
  const stepX = textWidth(s, size) + 12;
  for (let k = 1; k <= 10; k++) {
    out.push({ x, y: y - k * stepY });
    out.push({ x, y: y + k * stepY });
  }
  for (const dx of [stepX, -stepX]) {
    for (let k = 0; k <= 5; k++) {
      out.push({ x: x + dx, y });
      if (k) {
        out.push({ x: x + dx, y: y - k * stepY });
        out.push({ x: x + dx, y: y + k * stepY });
      }
    }
  }
  return out;
}

/** Candidates along an orthogonal route plus nearby offsets, so a label stays near its edge. */
function edgeCandidates(route: { midX: number; midY: number; pts: Cand[] }, s: string, size: number): Cand[] {
  const out = candidatesAround(route.midX + 5, route.midY - 4, s, size);
  for (const p of route.pts) {
    out.push({ x: p.x + 8, y: p.y - 8 });
    out.push({ x: p.x + 8, y: p.y + 16 });
  }
  return out;
}

/** Bottom of a text block relative to its top (matches the emitter's baseline model). */
function blockBottom(block: NodeTextBlock): number {
  return block.runs.length ? Math.max(...block.runs.map(r => r.dy + r.size * 1.2)) : 0;
}

/** Uniform-grid occupancy so deconfliction stays cheap on large canvases. */
class Occupancy {
  private cell = 24;
  private map = new Map<string, Box[]>();
  private keys(b: Box): string[] {
    const out: string[] = [];
    for (let cx = Math.floor(b.x0 / this.cell); cx <= Math.floor(b.x1 / this.cell); cx++) {
      for (let cy = Math.floor(b.y0 / this.cell); cy <= Math.floor(b.y1 / this.cell); cy++) {
        out.push(`${cx},${cy}`);
      }
    }
    return out;
  }
  add(b: Box): void {
    for (const k of this.keys(b)) {
      const a = this.map.get(k);
      if (a) a.push(b); else this.map.set(k, [b]);
    }
  }
  hits(b: Box, pad: number): boolean {
    const expanded = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
    const seen = new Set<Box>();
    for (const k of this.keys(expanded)) {
      const a = this.map.get(k);
      if (!a) continue;
      for (const o of a) {
        if (seen.has(o)) continue;
        seen.add(o);
        if (hit(o, b, pad)) return true;
      }
    }
    return false;
  }
}

/**
 * Place fixed marks first, then greedy-place free marks at the first candidate
 * that clears every placed box. Unplaceable marks are returned as `register`.
 */
function resolveMarks(W: number, H: number, fixed: TextMark[], free: TextMark[]): { out: TextMark[]; register: TextMark[] } {
  const occ = new Occupancy();
  const out: TextMark[] = [];
  for (const m of fixed) { out.push(m); occ.add(boxOf(m)); }
  const order = [...free].sort((a, b) =>
    b.priority - a.priority || a.y - b.y || a.x - b.x || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  const register: TextMark[] = [];
  for (const m of order) {
    const cands = m.candidates && m.candidates.length ? m.candidates : [{ x: m.x, y: m.y }];
    let chosen: TextMark | null = null;
    for (const c of cands) {
      const t: TextMark = { ...m, x: c.x, y: c.y };
      const b = boxOf(t);
      if (b.x0 < 4 || b.x1 > W - 4 || b.y0 < 4 || b.y1 > H - 4) continue;
      if (!occ.hits(b, 1.5)) { chosen = t; break; }
    }
    if (!chosen) {
      outer:
      for (let yy = 8; yy < H - 8; yy += 14) {
        for (let xx = 6; xx < W - 6; xx += 22) {
          const t: TextMark = { ...m, x: xx, y: yy };
          const b = boxOf(t);
          if (b.x0 < 4 || b.x1 > W - 4 || b.y0 < 4 || b.y1 > H - 4) continue;
          if (!occ.hits(b, 1.5)) { chosen = t; break outer; }
        }
      }
    }
    if (!chosen) { register.push(m); continue; }
    out.push(chosen);
    occ.add(boxOf(chosen));
  }
  return { out, register };
}

function blockFor(ev: FactEvent, theme: ThemeSpec): NodeTextBlock {
  return nodeTextBlock(
    { description: ev.description, label: ev.label ?? ev.id, timeLabel: ev.timeLabel },
    theme,
    TEXT,
  );
}

function chipLabels(ev: FactEvent, facts: SemanticScene['facts']): string[] {
  return ev.agents.map(aid => facts.agents.find(x => x.id === aid)?.label ?? aid);
}

function chipsWidth(ev: FactEvent, facts: SemanticScene['facts']): number {
  const labels = chipLabels(ev, facts);
  let w = 0;
  for (const l of labels) w += textWidth(l, CHIP_SIZE) + 16 + CHIP_GAP;
  return labels.length ? w - CHIP_GAP : 0;
}

function cardWidth(ev: FactEvent, block: NodeTextBlock, facts: SemanticScene['facts']): number {
  const idW = textWidth(`source: ${ev.id}`, MIN_TEXT) + 2 * CARD_PAD;
  return Math.max(210, block.width + 2 * CARD_PAD, idW, chipsWidth(ev, facts) + 2 * CARD_PAD);
}

function cardHeight(block: NodeTextBlock, ev: FactEvent): number {
  const chipH = ev.agents.length ? 8 + CHIP_H : 0;
  return CARD_TOP + blockBottom(block) + chipH + 12;
}

const KNOWN_TYPES = new Set([
  'ordinary', 'departure', 'arrival', 'bootstrap_origin', 'intervention',
  'collapse', 'birth', 'contact', 'reveal',
]);

function glyphSvg(type: string, x: number, y: number, theme: ThemeSpec): string {
  const ink = theme.ink;
  const bg = theme.bg;
  const acc = theme.accent;
  const sec = theme.secondary;
  const open = `fill="none" stroke="${ink}" stroke-width="1.35"`;
  const g = (body: string) => `<g class="event-glyph" data-event-type="${esc(type)}">${body}</g>`;
  switch (type) {
    case 'ordinary':
      return g(`<circle cx="${x}" cy="${y}" r="5.8" ${open}/>`);
    case 'departure':
      return g(`<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="1.5" fill="none" stroke="${ink}" stroke-width="1.2"/><path d="M ${x - 3.5} ${y} L ${x + 3.5} ${y} M ${x + 0.8} ${y - 2.8} L ${x + 3.5} ${y} L ${x + 0.8} ${y + 2.8}" fill="none" stroke="${ink}" stroke-width="1.2"/>`);
    case 'arrival':
      return g(`<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="1.5" fill="none" stroke="${ink}" stroke-width="1.2"/><path d="M ${x - 3.5} ${y} L ${x + 3.5} ${y} M ${x - 0.8} ${y - 2.8} L ${x - 3.5} ${y} L ${x - 0.8} ${y + 2.8}" fill="none" stroke="${ink}" stroke-width="1.2"/>`);
    case 'bootstrap_origin':
      return g(`<circle cx="${x - 3.4}" cy="${y}" r="4.8" fill="none" stroke="${sec}" stroke-width="1.35"/><circle cx="${x + 3.4}" cy="${y}" r="4.8" fill="none" stroke="${acc}" stroke-width="1.35"/>`);
    case 'intervention':
      return g(`<polygon points="${x},${y - 7.5} ${x + 7.5},${y} ${x},${y + 7.5} ${x - 7.5},${y}" fill="none" stroke="${acc}" stroke-width="1.35"/><path d="M ${x - 5} ${y + 5} L ${x + 5} ${y - 5}" fill="none" stroke="${acc}" stroke-width="1.35"/>`);
    case 'collapse':
      return g(`<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="1" fill="none" stroke="${ink}" stroke-width="1.2"/><path d="M ${x - 4} ${y - 4} L ${x + 4} ${y + 4} M ${x + 4} ${y - 4} L ${x - 4} ${y + 4}" fill="none" stroke="${ink}" stroke-width="1.2"/>`);
    case 'birth':
      return g(`<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${ink}" stroke-width="1.25"/><path d="M ${x - 3.5} ${y} L ${x + 3.5} ${y} M ${x} ${y - 3.5} L ${x} ${y + 3.5}" fill="none" stroke="${ink}" stroke-width="1.25"/>`);
    case 'contact':
      return g(`<circle cx="${x - 3.8}" cy="${y}" r="4.8" fill="none" stroke="${sec}" stroke-width="1.35"/><circle cx="${x + 3.8}" cy="${y}" r="4.8" fill="none" stroke="${acc}" stroke-width="1.35"/>`);
    case 'reveal':
      return g(`<path d="M ${x - 9} ${y} Q ${x} ${y - 8.5} ${x + 9} ${y} Q ${x} ${y + 8.5} ${x - 9} ${y} Z" fill="none" stroke="${acc}" stroke-width="1.35"/><circle cx="${x}" cy="${y}" r="2.2" fill="${acc}"/>`);
    default:
      // the exact type text is a floating label (see addGlyph) so it can dodge collisions
      return g(`<polygon points="${x - 6},${y - 5} ${x + 1},${y - 8} ${x + 7},${y - 3} ${x + 7},${y + 4} ${x + 1},${y + 8} ${x - 6},${y + 5}" fill="${bg}" stroke="${ink}" stroke-width="1.2"/>`);
  }
}

function edgeStyle(kind: FactEdge['kind'], theme: ThemeSpec): { stroke: string; width: number; dash: string; marker: string } {
  switch (kind) {
    case 'causal': return { stroke: theme.ink, width: 1.55, dash: '', marker: 'url(#atlas-arrow-filled)' };
    case 'temporal': return { stroke: theme.secondary, width: 1.35, dash: '6 4', marker: 'url(#atlas-arrow-open)' };
    case 'identity': return { stroke: theme.accent, width: 1.15, dash: '1.5 3.5', marker: 'url(#atlas-arrow-open)' };
    case 'family': return { stroke: theme.secondary, width: 1.35, dash: '', marker: 'url(#atlas-arrow-filled)' };
    case 'intervention': return { stroke: theme.accent, width: 3.1, dash: '', marker: 'url(#atlas-arrow-filled)' };
    case 'world_relation': return { stroke: theme.secondary, width: 0.95, dash: '', marker: 'url(#atlas-arrow-open)' };
    default: return { stroke: theme.muted, width: 1.05, dash: '2 2', marker: 'url(#atlas-arrow-open)' };
  }
}

/** A deterministic orthogonal route; the final segment carries the one marker-end on this edge. */
function routeD(a: Anchor, b: Anchor, index: number): { d: string; midX: number; midY: number; pts: Cand[] } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 2) {
    return {
      d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      midX: a.x,
      midY: (a.y + b.y) / 2,
      pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }],
    };
  }
  const midX = a.x + dx / 2 + ((index % 5) - 2) * 9;
  const d = `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${midX.toFixed(1)} ${a.y.toFixed(1)} L ${midX.toFixed(1)} ${b.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  return {
    d,
    midX,
    midY: (a.y + b.y) / 2,
    pts: [{ x: a.x, y: a.y }, { x: midX, y: a.y }, { x: midX, y: b.y }, { x: b.x, y: b.y }],
  };
}

export const atlas: DesignProfile = {
  id: 'atlas',
  label: 'Topology Atlas',
  medium: '2d-svg',
  topoAffinity: [],
  render(scene: SemanticScene, theme: ThemeSpec) {
    const facts = scene.facts;
    const drawn: DrawnSource[] = [];
    const shapes: string[] = [];
    const staticText: TextMark[] = [];
    const freeText: TextMark[] = [];

    const addStatic = (x: number, y: number, s: string, size: number, fill: string, family: string, anchor: AnchorName = 'start', data?: string): void => {
      if (!s) return;
      staticText.push({ x, y, s, size, fill, family, anchor, movable: false, priority: 0, data });
    };
    const addFree = (x: number, y: number, s: string, size: number, fill: string, family: string, anchor: AnchorName, priority: number, candidates: Cand[]): void => {
      if (!s) return;
      freeText.push({ x, y, s, size, fill, family, anchor, movable: true, priority, candidates });
    };
    const addBlock = (block: NodeTextBlock, x: number, top: number, anchor: AnchorName): void => {
      for (const run of block.runs) addStatic(x, top + run.dy + run.size * 0.9, run.text, run.size, run.fill, run.family, anchor);
    };
    const addGlyph = (type: string, x: number, y: number): void => {
      shapes.push(glyphSvg(type, x, y, theme));
      if (!KNOWN_TYPES.has(type)) {
        addFree(x + 11, y + 3.2, type, MIN_TEXT, theme.muted, theme.fontMono, 'start', 3, candidatesAround(x + 11, y + 3.2, type, MIN_TEXT));
      }
    };

    // ---------------------------------------------------------------------
    // Geometry pass: every mark is planned in typed data before any SVG text
    // is emitted, so layout is one deterministic function of the scene.
    // ---------------------------------------------------------------------
    const worldEvents = new Map<string, FactEvent[]>();
    for (const w of facts.worlds) worldEvents.set(w.id, []);
    for (const e of facts.events) (worldEvents.get(e.worldRef) ?? []).push(e);

    const parentOf = (w: FactWorld): string | null => w.forkParent ?? w.parentRef ?? w.originWorldRef ?? null;
    const levelCache = new Map<string, number>();
    const levelOf = (w: FactWorld, seen = new Set<string>()): number => {
      if (levelCache.has(w.id)) return levelCache.get(w.id)!;
      if (seen.has(w.id)) return 0;
      const p = parentOf(w);
      const parent = p ? facts.worlds.find(x => x.id === p) : undefined;
      const n = parent ? levelOf(parent, new Set([...seen, w.id])) + 1 : 0;
      levelCache.set(w.id, n);
      return n;
    };
    const levels = new Map<number, FactWorld[]>();
    for (const w of facts.worlds) {
      const lv = levelOf(w);
      const arr = levels.get(lv) ?? [];
      arr.push(w); levels.set(lv, arr);
    }
    const sortedLevels = [...levels.keys()].sort((a, b) => a - b);

    const worldBoxes = new Map<string, WorldBox>();
    for (const w of facts.worlds) {
      const evs = worldEvents.get(w.id) ?? [];
      const orderedEvs = evs.filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal);
      const unresolvedEvs = evs.filter(e => !e.order);

      const makeCards = (list: FactEvent[], ordered: boolean): EventCard[] => {
        let cursor = ordered ? CARD_PAD : 46;
        return list.map((ev, i) => {
          const block = blockFor(ev, theme);
          const wCard = cardWidth(ev, block, facts);
          const hCard = cardHeight(block, ev);
          const x = cursor;
          cursor += wCard + EVENT_GAP;
          return {
            ev, block, w: wCard, h: hCard,
            rect: rect(x, 0, wCard, hCard),
            anchor: { x: x + 16, y: 0, kind: ordered ? 'event' : 'unresolved', id: ev.id, worldId: w.id },
            orderIndex: ordered ? i : null,
          };
        });
      };
      const ordered = makeCards(orderedEvs, true);
      const unresolved = makeCards(unresolvedEvs, false);
      const worldTitle = `${w.id} · ${w.label ?? w.id}`;
      const endTagW = facts.outcome?.endWorldRefs?.includes(w.id) ? textWidth('end-state world', MIN_TEXT) : 0;
      const labelW = Math.max(
        textWidth(worldTitle, 13),
        w.spanLabel ? textWidth(`spanLabel: ${w.spanLabel}`, TEXT.labelSize) : 0,
        w.forkLabel ? textWidth(`forkLabel: ${w.forkLabel}`, TEXT.labelSize) : 0,
        unresolved.length ? textWidth(`time not positioned (${unresolved.length})`, TEXT.labelSize) : 0,
      );
      const headerNeeds = 72 + labelW + (endTagW ? endTagW + 40 : 24);
      const rowW = (cards: EventCard[]) => cards.reduce((s, c) => s + c.w, 0) + Math.max(0, cards.length - 1) * EVENT_GAP;
      const orderedRowW = ordered.length ? 46 + rowW(ordered) : 0;
      const contentW = Math.max(340, orderedRowW, rowW(unresolved), headerNeeds);

      const orderedH = ordered.length ? Math.max(...ordered.map(c => c.h)) : 0;
      const unresolvedH = unresolved.length ? Math.max(...unresolved.map(c => c.h)) : 0;
      const orderedTop = HEADER_H + 22;
      const orderedBottom = ordered.length ? orderedTop + orderedH : orderedTop;
      const shelfTop = ordered.length ? orderedBottom + 44 : HEADER_H + 30;
      const unresolvedTop = shelfTop + 22;
      const contentBottom = unresolved.length ? unresolvedTop + unresolvedH : (ordered.length ? orderedBottom : HEADER_H + 40);
      const rectW = Math.ceil(contentW + 48);
      const rectH = Math.ceil(Math.max(HEADER_H + 70, contentBottom + 26));
      const box: WorldBox = { world: w, rect: rect(0, 0, rectW, rectH), railY: 0, ordered, unresolved, eventCards: new Map(), labelW };
      worldBoxes.set(w.id, box);
    }

    // assign rows
    let cursorY = M.t;
    let maxRowW = 0;
    for (const lv of sortedLevels) {
      const row = levels.get(lv)!;
      const rowW = row.reduce((s, w) => s + worldBoxes.get(w.id)!.rect.w, 0) + Math.max(0, row.length - 1) * WORLD_GAP;
      const rowH = Math.max(...row.map(w => worldBoxes.get(w.id)!.rect.h));
      let x = M.l;
      for (const w of row) {
        const b = worldBoxes.get(w.id)!;
        b.rect = rect(x, cursorY, b.rect.w, b.rect.h);
        b.railY = cursorY + HEADER_H;
        x += b.rect.w + WORLD_GAP;
      }
      maxRowW = Math.max(maxRowW, rowW);
      cursorY += rowH + ROW_GAP;
    }

    // position ordered cards below their glyph; unresolved cards on their shelf
    for (const b of worldBoxes.values()) {
      b.ordered.forEach((c) => {
        c.rect = rect(b.rect.x + c.rect.x, b.railY + 22, c.w, c.h);
        c.anchor = { x: c.rect.x + 16, y: b.railY, kind: 'event', id: c.ev.id, worldId: b.world.id };
        b.eventCards.set(c.ev.id, c);
      });
      const shelfTop = b.ordered.length
        ? b.railY + 22 + Math.max(...b.ordered.map(c => c.h)) + 44
        : b.railY + 30;
      b.unresolved.forEach((c) => {
        c.rect = rect(b.rect.x + c.rect.x, shelfTop + 22, c.w, c.h);
        c.anchor = { x: c.rect.x - 16, y: c.rect.y + c.h / 2, kind: 'unresolved', id: c.ev.id, worldId: b.world.id };
        b.eventCards.set(c.ev.id, c);
      });
    }

    // derived-world pair (§9): two same-level worlds under one origin parent
    interface PairBracket { x0: number; x1: number; y: number; parent: string }
    const pairBrackets: PairBracket[] = [];
    for (const lv of sortedLevels) {
      if (lv === 0) continue;
      const row = levels.get(lv)!;
      if (row.length !== 2) continue;
      const p0 = parentOf(row[0]);
      const p1 = parentOf(row[1]);
      if (!p0 || p0 !== p1) continue;
      const parent = facts.worlds.find(w => w.id === p0);
      if (!parent || levelOf(parent) !== lv - 1) continue;
      if (!(parent.isOriginWorld || facts.topologyPatternId === 'origin_plus_twins')) continue;
      const b0 = worldBoxes.get(row[0].id)!;
      const b1 = worldBoxes.get(row[1].id)!;
      pairBrackets.push({
        x0: Math.min(b0.rect.x, b1.rect.x),
        x1: Math.max(b0.rect.x + b0.rect.w, b1.rect.x + b1.rect.w),
        y: Math.min(b0.rect.y, b1.rect.y) - BRACKET_RISE,
        parent: p0,
      });
    }

    // bootstrap-entity tokens (§9): declared payloads only
    const bootstrapEntities: string[] = [];
    for (const ev of facts.events) {
      const raw = ev.payload?.['bootstrapEntity'];
      if (typeof raw === 'string' && raw && !bootstrapEntities.includes(raw)) bootstrapEntities.push(raw);
    }

    // agent registry panel
    const agents = facts.agents;
    const agentRows = Math.max(1, Math.ceil(agents.length / AGENT_COLS));

    // correspondence ladder geometry
    const correspondenceWorlds = facts.worlds.filter(w => w.correspondenceMap?.length);
    const corrEntries = correspondenceWorlds.flatMap(w => (w.correspondenceMap ?? []).map(entry => ({ w, entry })));
    const corrH = corrEntries.length ? 26 + corrEntries.length * 18 : 0;

    // intervention geometry
    const ivCount = facts.interventions.length;
    const ivH = ivCount ? 30 + ivCount * 44 : 0;

    // Header / legend strings are measured before the canvas is sized so that
    // nothing clips and the seal never overlaps the header text.
    const titleLine = 'Topology Atlas';
    const line2 = `${scene.header.topologyLine} · ${scene.header.physicsLine}`;
    const line3 = scene.header.evidenceLine;
    const line4 = 'T/B/P world primitives · event glyphs · one encoded relationship channel per edge kind';
    const line5 = facts.worlds.length
      ? `worlds: ${facts.worlds.map(w => `${w.id}[${w.kind}]`).join(' · ')}`
      : 'no worlds declared';
    const headerMax = Math.max(
      textWidth(titleLine, 30), textWidth(line2, 12.5), textWidth(line3, 12),
      textWidth(line4, 11), textWidth(line5, 10.5),
    );

    const sealTitle = 'PRIMARY PHYSICS';
    const sealPrimary = facts.primaryRuleSetId;
    const sealMixins = facts.mixinRuleSetIds.length ? `mixins: ${facts.mixinRuleSetIds.join(', ')}` : 'no mixins declared';
    const sealTopology = facts.topologyPatternId;
    const sealW = Math.max(
      260,
      textWidth(sealTitle, 11) + 28, textWidth(sealPrimary, 13) + 28,
      textWidth(sealMixins, 10.5) + 28, textWidth(sealTopology, MIN_TEXT) + 28,
    );

    const legendLines = [
      'world primitives: T = single-outline timeline · B = branch fork tab · P = double-outline parallel_world (never two rails)',
      'edges: causal gutter (solid + filled arrowhead) · time gutter (dashed + open arrowhead) · identity gutter (dotted + equality marker)',
      'world_relation = paired thin world-header ports with explicit relation text; family = orthogonal relationship-panel line + kinship marker; intervention = heavy effect-gutter line + slash marker + arrowhead',
      'exactly one arrowhead per drawn encoded edge · symmetric relations retain stored endpoint order in metadata',
      'unresolved time stays on the "time not positioned" shelf; a missing branch anchor stays detached and is never turned into a junction.',
    ];
    const legendMax = Math.max(...legendLines.map(l => textWidth(l, 10.5)));

    const tokenTitle = 'bootstrap entity tokens (declared) — interlocked-ring token; no closed knot is drawn unless the encoded causal edges form a directed cycle';
    const tokenTitleMax = textWidth(tokenTitle, 11);
    const tokenW = 250;
    const tokenH = 36;
    const tokenGap = 22;

    const contentWidth = maxRowW + M.l + M.r;
    const agentNeeds = M.l + AGENT_COLS * AGENT_CARD_W + (AGENT_COLS - 1) * AGENT_GAP_X + M.r;
    const headerNeeds = M.l + headerMax + 28 + sealW + M.r;
    const legendNeeds = M.l + legendMax + M.r;
    const tokenTitleNeeds = M.l + tokenTitleMax + M.r;
    const W = Math.ceil(Math.max(1180, contentWidth, agentNeeds, headerNeeds, legendNeeds, tokenTitleNeeds));
    const sealX = W - M.r - sealW;

    // sections below the world rows
    const tokenMaxCols = Math.max(1, Math.floor((W - M.l - M.r + tokenGap) / (tokenW + tokenGap)));
    const tokenRows = Math.ceil(bootstrapEntities.length / tokenMaxCols) || 0;
    const tokenPanelTop = cursorY + 14;
    const tokenPanelH = bootstrapEntities.length ? 36 + tokenRows * (tokenH + 16) : 0;
    const tokenPanelBottom = bootstrapEntities.length ? tokenPanelTop + tokenPanelH : cursorY;

    const agentPanelTop = tokenPanelBottom + 20;
    const agentPanelH = agents.length ? 30 + agentRows * (AGENT_CARD_H + AGENT_GAP_Y) : 0;
    const agentBoxes: AgentBox[] = agents.map((a, i) => {
      const col = i % AGENT_COLS;
      const row = Math.floor(i / AGENT_COLS);
      const r = rect(M.l + col * (AGENT_CARD_W + AGENT_GAP_X), agentPanelTop + 30 + row * (AGENT_CARD_H + AGENT_GAP_Y), AGENT_CARD_W, AGENT_CARD_H);
      return { ...a, rect: r, anchor: { x: r.x, y: r.y + r.h / 2, kind: 'agent', id: a.id } };
    });
    const agentBottom = agents.length ? agentPanelTop + agentPanelH : tokenPanelBottom;
    const corrTop = agentBottom + (corrH ? 20 : 0);
    const corrBottom = corrH ? corrTop + corrH : agentBottom;

    const panelBottom = Math.max(cursorY, agentBottom, corrBottom);
    const ivTop = panelBottom + 26;
    const afterIvHeight = ivH ? ivTop + ivH + 26 : panelBottom;
    // with no world rows there is no content below the "No worlds" note; reserve room for it
    const footerTop = facts.worlds.length ? afterIvHeight : Math.max(afterIvHeight, cursorY + 60);

    const outcomeHeight = facts.outcome ? 92 : 46;
    const legendY = footerTop + outcomeHeight;
    const legendBottom = legendY + 4 * 18 + 8;
    const semanticRaw = facts.semanticReview !== undefined
      ? (typeof facts.semanticReview === 'string' ? facts.semanticReview : JSON.stringify(facts.semanticReview))
      : '';
    const semBudget = 132;
    const semLines = semanticRaw ? wrapFor(semanticRaw, semBudget) : [];
    const semTop = legendBottom + 22;
    const semBottom = semanticRaw ? semTop + semLines.length * 16 : legendBottom;
    const bodyBottom = Math.max(footerTop + outcomeHeight, legendBottom, semBottom);
    const registerTop = bodyBottom + 30;
    const H0 = registerTop; // free labels must stay inside the body

    const eventAnchor = new Map<string, Anchor>();
    for (const b of worldBoxes.values()) for (const [id, c] of b.eventCards) eventAnchor.set(id, c.anchor);
    const agentAnchor = new Map<string, Anchor>(agentBoxes.map(a => [a.id, a.anchor]));
    const worldAnchor = new Map<string, Anchor>();
    for (const b of worldBoxes.values()) worldAnchor.set(b.world.id, { x: b.rect.x + b.rect.w / 2, y: b.rect.y, kind: 'world', id: b.world.id });

    const fallback = (id: string, i: number): Anchor => ({ x: M.l + 30 + (i % 6) * 16, y: footerTop + 40 + Math.floor(i / 6) * 14, kind: 'unresolved', id });
    const resolveAnchor = (id: string, i: number): Anchor => eventAnchor.get(id) ?? agentAnchor.get(id) ?? worldAnchor.get(id) ?? fallback(id, i);

    // ---------------------------------------------------------------------
    // Emit pass.
    // ---------------------------------------------------------------------
    shapes.push(`<defs>
<marker id="atlas-arrow-filled" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.ink}"/></marker>
<marker id="atlas-arrow-open" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="${theme.secondary}" stroke-width="1.6"/></marker>
</defs>`);

    // header
    addStatic(M.l, 56, titleLine, 30, theme.ink, theme.fontSerif);
    addStatic(M.l, 86, line2, 12.5, theme.muted, theme.fontSans);
    addStatic(M.l, 106, line3, 12, theme.muted, theme.fontSans);
    addStatic(M.l, 126, line4, 11, theme.muted, theme.fontSans);
    addStatic(M.l, 146, line5, 10.5, theme.muted, theme.fontMono);
    // physics seal (DESIGN-ATLAS §5): declared identifier, not a generated mechanism
    shapes.push(`<rect x="${sealX}" y="40" width="${sealW}" height="100" rx="8" fill="none" stroke="${theme.accent}" stroke-width="1.4"/>`);
    addStatic(sealX + 14, 64, sealTitle, 11, theme.accent, theme.fontSans);
    addStatic(sealX + 14, 86, sealPrimary, 13, theme.ink, theme.fontMono);
    addStatic(sealX + 14, 106, sealMixins, 10.5, theme.muted, theme.fontSans);
    addStatic(sealX + 14, 124, sealTopology, MIN_TEXT, theme.muted, theme.fontMono);

    if (!facts.worlds.length) {
      addStatic(M.l, M.t + 20, 'No worlds to compose.', 14, theme.ink, theme.fontSans);
    }

    // composition-group labels (layout frames, not semantic containment)
    for (const lv of sortedLevels) {
      const row = levels.get(lv)!;
      const first = worldBoxes.get(row[0].id)!;
      addStatic(first.rect.x, first.rect.y - 14, `composition group ${lv} — layout only; semantic containment appears only where encoded`, 10.5, theme.muted, theme.fontSans);
    }

    // derived-world pair bracket
    for (const br of pairBrackets) {
      shapes.push(`<path class="derived-world-pair-bracket" data-bracket-parent="${esc(br.parent)}" d="M ${br.x0.toFixed(1)} ${(br.y + 12).toFixed(1)} L ${br.x0.toFixed(1)} ${br.y.toFixed(1)} L ${br.x1.toFixed(1)} ${br.y.toFixed(1)} L ${br.x1.toFixed(1)} ${(br.y + 12).toFixed(1)}" fill="none" stroke="${theme.muted}" stroke-width="1.2"/>`);
      addStatic((br.x0 + br.x1) / 2, br.y - 8, 'derived-world pair — layout only; derivation is declared, never invented', 10.5, theme.muted, theme.fontSans, 'middle');
    }

    // world modules
    for (const b of worldBoxes.values()) {
      const w = b.world;
      const r = b.rect;
      declareDrawn(drawn, 'world', w.id, `${w.kind} world primitive with ${w.kind === 'parallel_world' ? 'double-outline P frame' : w.kind === 'branch' ? 'B fork tab' : 'T header tab'}, rail, events and unresolved shelf`);
      const inner = w.kind === 'parallel_world';
      shapes.push(`<rect class="primitive ${esc(w.kind)}" data-source-id="${esc(w.id)}" data-primitive="${esc(w.kind)}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8" fill="${theme.lane}" fill-opacity="0.045" stroke="${theme.ink}" stroke-width="1.5"/>`);
      if (inner) {
        shapes.push(`<rect class="primitive-inner" data-primitive="parallel_world-double-enclosure" x="${r.x + 6}" y="${r.y + 6}" width="${r.w - 12}" height="${r.h - 12}" rx="5" fill="none" stroke="${theme.secondary}" stroke-width="1.15" stroke-dasharray="2 2"/>`);
      }

      // header tab
      const tabY = r.y + 16;
      if (w.kind === 'branch') {
        shapes.push(`<path class="world-tab B" data-tab="B" d="M ${r.x + 14} ${tabY + 22} L ${r.x + 14} ${tabY} L ${r.x + 24} ${tabY} L ${r.x + 24} ${tabY + 9} L ${r.x + 34} ${tabY} L ${r.x + 44} ${tabY} L ${r.x + 44} ${tabY + 22} Z" fill="none" stroke="${theme.accent}" stroke-width="1.5"/>`);
        addStatic(r.x + 25, tabY + 17, 'B', 12, theme.accent, theme.fontSerif);
      } else if (w.kind === 'parallel_world') {
        shapes.push(`<rect class="world-tab P" data-tab="P" x="${r.x + 14}" y="${tabY}" width="18" height="22" rx="2" fill="none" stroke="${theme.secondary}" stroke-width="1.4"/>`);
        shapes.push(`<rect class="world-tab P" data-tab="P" x="${r.x + 26}" y="${tabY}" width="18" height="22" rx="2" fill="none" stroke="${theme.secondary}" stroke-width="1.4"/>`);
        addStatic(r.x + 22, tabY + 17, 'P', 12, theme.secondary, theme.fontSerif);
      } else {
        shapes.push(`<rect class="world-tab T" data-tab="T" x="${r.x + 14}" y="${tabY}" width="24" height="22" rx="2" fill="none" stroke="${theme.ink}" stroke-width="1.4"/>`);
        addStatic(r.x + 22, tabY + 17, 'T', 12, theme.ink, theme.fontSerif);
      }
      addStatic(r.x + 72, r.y + 28, `${w.id} · ${w.label ?? w.id}`, 13, theme.ink, theme.fontSans);
      if (w.spanLabel) addStatic(r.x + 72, r.y + 48, `spanLabel: ${w.spanLabel}`, TEXT.labelSize, theme.muted, theme.fontSans);
      if (w.forkLabel) addStatic(r.x + 72, r.y + 64, `forkLabel: ${w.forkLabel}`, TEXT.labelSize, theme.muted, theme.fontMono);
      if (facts.outcome?.endWorldRefs?.includes(w.id)) {
        addStatic(r.x + r.w - 12, r.y + 28, 'end-state world', MIN_TEXT, theme.accent, theme.fontSans, 'end');
      }

      // local-history rail: one rail per world, independent of other worlds
      shapes.push(`<line class="world-rail" data-world-id="${esc(w.id)}" x1="${r.x + 24}" y1="${b.railY}" x2="${r.x + r.w - 24}" y2="${b.railY}" stroke="${theme.lane}" stroke-width="1.8"/>`);
      const ordered = b.ordered;
      const axisLabel = ordered.length
        ? `${ordered[0].ev.order!.axisLabel} — ordered, not to scale`
        : 'local order unresolved — no encoded temporal chain';
      addStatic(r.x + 24, b.railY - 12, axisLabel, TEXT.labelSize, theme.muted, theme.fontSans);

      // event marks + cards
      for (const c of b.ordered) {
        const a = c.anchor;
        addGlyph(c.ev.type, a.x, a.y);
        shapes.push(`<line x1="${a.x}" y1="${a.y + 7}" x2="${a.x}" y2="${c.rect.y}" stroke="${theme.lane}" stroke-width="1"/>`);
        shapes.push(`<rect class="event-card" data-source-id="${esc(c.ev.id)}" x="${c.rect.x}" y="${c.rect.y}" width="${c.rect.w}" height="${c.rect.h}" rx="4" fill="${theme.bg}" stroke="${theme.lane}" stroke-width="1"/>`);
        addEventCardText(c);
        declareDrawn(drawn, 'event', c.ev.id, 'type glyph on the world rail + event card with label, exact timeLabel, compact source ID and participant chips');
      }

      // unresolved shelf stays visibly detached from every rail
      if (b.unresolved.length) {
        const shelfTop = b.ordered.length
          ? b.railY + 22 + Math.max(...b.ordered.map(c => c.h)) + 44
          : b.railY + 30;
        shapes.push(`<line x1="${r.x + 24}" y1="${shelfTop}" x2="${r.x + r.w - 24}" y2="${shelfTop}" stroke="${theme.muted}" stroke-width="1" stroke-dasharray="3 4"/>`);
        addStatic(r.x + 24, shelfTop - 8, `time not positioned (${b.unresolved.length})`, TEXT.labelSize, theme.muted, theme.fontSans);
        for (const c of b.unresolved) {
          const a = c.anchor;
          addGlyph(c.ev.type, a.x, a.y);
          shapes.push(`<rect class="event-card unresolved-card" data-source-id="${esc(c.ev.id)}" x="${c.rect.x}" y="${c.rect.y}" width="${c.rect.w}" height="${c.rect.h}" rx="4" fill="${theme.bg}" stroke="${theme.muted}" stroke-width="1" stroke-dasharray="2 3"/>`);
          addEventCardText(c);
          declareDrawn(drawn, 'event', c.ev.id, 'detached event card on the "time not positioned" shelf inside its encoded world; no chronology invented');
        }
      }
    }

    function addEventCardText(c: EventCard): void {
      const r = c.rect;
      addStatic(r.x + CARD_PAD, r.y + 16, `source: ${c.ev.id}`, MIN_TEXT, theme.muted, theme.fontMono);
      addBlock(c.block, r.x + CARD_PAD, r.y + CARD_TOP, 'start');
      const chipTop = r.y + CARD_TOP + blockBottom(c.block) + 8;
      let cx = r.x + CARD_PAD;
      for (const aid of c.ev.agents) {
        const label = facts.agents.find(x => x.id === aid)?.label ?? aid;
        const cw = textWidth(label, CHIP_SIZE) + 16;
        shapes.push(`<rect class="participant-chip" data-agent-id="${esc(aid)}" x="${cx.toFixed(1)}" y="${chipTop}" width="${cw.toFixed(1)}" height="${CHIP_H}" rx="8" fill="${theme.lane}" fill-opacity="0.18" stroke="${theme.lane}" stroke-width="0.7"/>`);
        addStatic(cx + 8, chipTop + 11.5, label, CHIP_SIZE, theme.ink, theme.fontSans);
        cx += cw + CHIP_GAP;
      }
    }

    // branch forks: anchored only at an encoded fork event; otherwise visibly unspecified
    for (const b of worldBoxes.values()) {
      if (b.world.kind !== 'branch') continue;
      const w = b.world;
      const parentId = w.forkParent ?? w.parentRef ?? null;
      const parent = parentId ? worldBoxes.get(parentId) : undefined;
      // The schema's encoded anchor is forkEventRef. An event of type
      // branch_fork is a narrative type, not a reference, so it is NOT
      // silently promoted into a junction anchor.
      const forkEvent = w.forkEventRef ? facts.events.find(e => e.id === w.forkEventRef) : undefined;
      const forkAnchor = forkEvent ? eventAnchor.get(forkEvent.id) : undefined;
      const encodedFork = forkEvent && forkAnchor ? { ev: forkEvent, anchor: forkAnchor } : null;
      const from: Anchor = parent
        ? { x: parent.rect.x + parent.rect.w / 2, y: parent.rect.y + parent.rect.h, kind: 'world', id: parent.world.id }
        : { x: b.rect.x + b.rect.w / 2, y: b.rect.y - 24, kind: 'world', id: w.id };
      if (encodedFork) {
        const a = encodedFork.anchor;
        const midY = from.y + Math.max(22, (a.y - from.y) / 2);
        shapes.push(`<path class="fork-connector anchored" data-fork-market="${esc(w.id)}" data-fork-event="${esc(encodedFork.ev.id)}" d="M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${from.x.toFixed(1)} ${midY.toFixed(1)} L ${a.x.toFixed(1)} ${midY.toFixed(1)} L ${a.x.toFixed(1)} ${a.y.toFixed(1)}" fill="none" stroke="${theme.accent}" stroke-width="1.7"/>`);
        shapes.push(`<circle class="fork-junction" data-fork-event="${esc(encodedFork.ev.id)}" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="3" fill="${theme.accent}"/>`);
        const text = `fork event: ${encodedFork.ev.id}`;
        addFree(a.x + 7, a.y - 8, text, MIN_TEXT, theme.accent, theme.fontMono, 'start', 12, candidatesAround(a.x + 7, a.y - 8, text, MIN_TEXT));
      } else {
        const endX = parent ? (from.x + (parent.rect.x + parent.rect.w / 2 - from.x) * 0.38) : from.x;
        const endY = parent ? parent.rect.y + parent.rect.h + 22 : from.y - 30;
        shapes.push(`<path class="fork-connector unspecified" data-fork-market="${esc(w.id)}" d="M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${from.x.toFixed(1)} ${endY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}" fill="none" stroke="${theme.muted}" stroke-width="1.2" stroke-dasharray="3 4"/>`);
        const text = 'fork event unspecified';
        addFree(Math.min(endX, from.x) + 6, endY - 8, text, TEXT.labelSize, theme.muted, theme.fontSans, 'start', 12, candidatesAround(Math.min(endX, from.x) + 6, endY - 8, text, TEXT.labelSize));
      }
    }

    // encoded world_relation edges: paired thin world-header ports, explicit relation text
    facts.worldRelations.forEach((e, i) => {
      const aBox = worldBoxes.get(e.from);
      const bBox = worldBoxes.get(e.to);
      const a: Anchor = aBox ? { x: aBox.rect.x + aBox.rect.w / 2, y: aBox.rect.y, kind: 'world', id: e.from } : fallback(e.from, i);
      const b: Anchor = bBox ? { x: bBox.rect.x + bBox.rect.w / 2, y: bBox.rect.y, kind: 'world', id: e.to } : fallback(e.to, i);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const midX = a.x + dx / 2 + ((i % 5) - 2) * 8;
      const d1 = `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${midX.toFixed(1)} ${a.y.toFixed(1)} L ${midX.toFixed(1)} ${b.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      const off = 2.6;
      const d2 = `M ${(a.x + off).toFixed(1)} ${a.y.toFixed(1)} L ${(midX + off).toFixed(1)} ${a.y.toFixed(1)} L ${(midX + off).toFixed(1)} ${b.y.toFixed(1)} L ${(b.x + off).toFixed(1)} ${b.y.toFixed(1)}`;
      shapes.push(`<path class="edge world-relation" data-source-id="${esc(e.id)}" data-edge-id="${esc(e.id)}" data-edge-kind="world_relation" d="${d1}" fill="none" stroke="${theme.secondary}" stroke-width="0.9" marker-end="url(#atlas-arrow-open)"/>`);
      shapes.push(`<path class="edge world-relation paired" data-source-id="${esc(e.id)}" data-edge-id="${esc(e.id)}" data-edge-kind="world_relation" d="${d2}" fill="none" stroke="${theme.secondary}" stroke-width="0.9"/>`);
      const label = [e.relation, e.label].filter(Boolean).join(' · ') || e.id;
      const route = { midX, midY: (a.y + b.y) / 2 + (dy >= 0 ? -8 : 14), pts: [{ x: a.x, y: a.y }, { x: midX, y: a.y }, { x: midX, y: b.y }, { x: b.x, y: b.y }] };
      addFree(route.midX + 6, route.midY, label, TEXT.labelSize, theme.secondary, theme.fontSans, 'start', 13, edgeCandidates(route, label, TEXT.labelSize));
      declareDrawn(drawn, 'edge', e.id, `world_relation stroked as a paired thin world-header connector: ${label}`);
    });

    // field-level origin / mirror connectors (not edges; no arrowheads, no junction dots)
    for (const b of worldBoxes.values()) {
      const w = b.world;
      if (w.originWorldRef) {
        const o = worldBoxes.get(w.originWorldRef);
        if (o) {
          const a = { x: o.rect.x + o.rect.w / 2, y: o.rect.y + o.rect.h };
          const z = { x: b.rect.x + b.rect.w / 2, y: b.rect.y };
          shapes.push(`<path class="origin-reference-connector" data-origin-ref="${esc(w.originWorldRef)}" data-source-world="${esc(w.id)}" d="M ${a.x} ${a.y} L ${a.x} ${(a.y + z.y) / 2} L ${z.x} ${(a.y + z.y) / 2} L ${z.x} ${z.y}" fill="none" stroke="${theme.lane}" stroke-width="1.1" stroke-dasharray="5 4"/>`);
          const text = `origin-reference: ${w.id} → ${w.originWorldRef}`;
          addFree((a.x + z.x) / 2 + 6, (a.y + z.y) / 2 - 8, text, MIN_TEXT, theme.muted, theme.fontSans, 'start', 11, candidatesAround((a.x + z.x) / 2 + 6, (a.y + z.y) / 2 - 8, text, MIN_TEXT));
        }
      }
      if (w.mirrorOf) {
        const m = worldBoxes.get(w.mirrorOf);
        if (m) {
          const y = Math.min(b.rect.y, m.rect.y) - 26;
          const x1 = Math.min(b.rect.x + b.rect.w, m.rect.x + m.rect.w);
          const x2 = Math.max(b.rect.x, m.rect.x);
          shapes.push(`<path class="mirror-relation-connector" data-mirror-of="${esc(w.mirrorOf)}" d="M ${x2} ${y} L ${x1} ${y}" fill="none" stroke="${theme.secondary}" stroke-width="0.9"/>`);
          shapes.push(`<path class="mirror-relation-connector paired" data-mirror-of="${esc(w.mirrorOf)}" d="M ${x2} ${y + 3} L ${x1} ${y + 3}" fill="none" stroke="${theme.secondary}" stroke-width="0.9" stroke-dasharray="2 3"/>`);
          const text = `mirror relation: ${w.id} ↔ ${w.mirrorOf}`;
          addFree((x1 + x2) / 2, y - 8, text, MIN_TEXT, theme.secondary, theme.fontSans, 'middle', 11, candidatesAround((x1 + x2) / 2, y - 8, text, MIN_TEXT));
        }
      }
    }

    // encoded event/agent/identity/family/intervention edges: exactly one marker-end each
    facts.edges.forEach((e, i) => {
      if (e.kind === 'world_relation') return; // drawn above, with its own paired-header routing
      const a = resolveAnchor(e.from, i);
      const b = resolveAnchor(e.to, i);
      const st = edgeStyle(e.kind, theme);
      const route = routeD(a, b, i);
      const dash = st.dash ? ` stroke-dasharray="${st.dash}"` : '';
      shapes.push(`<path class="edge ${esc(e.kind)}" data-source-id="${esc(e.id)}" data-edge-id="${esc(e.id)}" data-edge-kind="${esc(e.kind)}" d="${route.d}" fill="none" stroke="${st.stroke}" stroke-width="${st.width}"${dash} marker-end="${st.marker}"/>`);
      const labelBits = [...new Set([e.relation, e.label].filter((x): x is string => typeof x === 'string' && x.length > 0))];
      const label = labelBits.join(' · ');
      if (label) addFree(route.midX + 5, route.midY - 8, label, TEXT.labelSize, theme.muted, theme.fontSans, 'start', 10, edgeCandidates(route, label, TEXT.labelSize));
      if (e.kind === 'identity') {
        const t = 'identity =';
        addFree(route.midX + 5, route.midY + 8, t, TEXT.labelSize, theme.accent, theme.fontMono, 'start', 5, edgeCandidates(route, t, TEXT.labelSize));
      }
      if (e.kind === 'family') {
        const t = 'kinship +';
        addFree(route.midX + 5, route.midY + 8, t, TEXT.labelSize, theme.secondary, theme.fontMono, 'start', 5, edgeCandidates(route, t, TEXT.labelSize));
      }
      if (e.kind === 'intervention') {
        const t = 'effect /';
        addFree(route.midX + 5, route.midY + 8, t, TEXT.labelSize, theme.accent, theme.fontMono, 'start', 5, edgeCandidates(route, t, TEXT.labelSize));
      }
      const reason = e.kind === 'causal'
        ? 'causal gutter: solid line with one filled arrowhead, direction preserved from the encoded edge'
        : e.kind === 'temporal'
          ? 'time gutter: dashed line with one open arrowhead; relation/label retained exactly'
          : e.kind === 'identity'
            ? 'identity gutter: dotted line with equality marker and one arrowhead'
            : e.kind === 'family'
              ? 'relationship panel: orthogonal kinship line with kinship marker and one arrowhead'
              : 'effect gutter: heavy intervention line with slash marker and one arrowhead';
      declareDrawn(drawn, 'edge', e.id, reason);
    });

    // bootstrap-entity tokens (§9): declared payloads only, interlocked rings, no closed knot
    if (bootstrapEntities.length) {
      addStatic(M.l, tokenPanelTop + 18, tokenTitle, 11, theme.ink, theme.fontSans);
      bootstrapEntities.forEach((be, i) => {
        const col = i % tokenMaxCols;
        const row = Math.floor(i / tokenMaxCols);
        const x = M.l + col * (tokenW + tokenGap);
        const y = tokenPanelTop + 54 + row * (tokenH + 16);
        shapes.push(`<rect class="bootstrap-token" data-bootstrap-entity="${esc(be)}" x="${x}" y="${y - 18}" width="${tokenW - 10}" height="${tokenH}" rx="6" fill="${theme.bg}" stroke="${theme.secondary}" stroke-width="1"/>`);
        shapes.push(`<g class="bootstrap-glyph" data-bootstrap-entity="${esc(be)}"><circle cx="${x + 18}" cy="${y}" r="7" fill="none" stroke="${theme.secondary}" stroke-width="1.4"/><circle cx="${x + 30}" cy="${y}" r="7" fill="none" stroke="${theme.accent}" stroke-width="1.4"/></g>`);
        addStatic(x + 46, y + 4, `${be} — declared bootstrap entity`, 11, theme.ink, theme.fontSans, 'start', `data-bootstrap-entity="${esc(be)}"`);
      });
    }

    // relationship panel: agent registry cards (all declared agents have a card)
    if (agents.length) {
      addStatic(M.l, agentPanelTop + 20, `agent registry cards (${agents.length}) — grouped by identityGroup token, not by invented pairwise identity`, 12, theme.ink, theme.fontSans);
      for (const a of agentBoxes) {
        declareDrawn(drawn, 'agent', a.id, 'agent registry card: label, identity token, continuity-role marker, homeWorldRef');
        const r = a.rect;
        shapes.push(`<rect class="agent-card" data-source-id="${esc(a.id)}" data-agent-id="${esc(a.id)}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="${theme.bg}" stroke="${theme.lane}" stroke-width="1"/>`);
        addStatic(r.x + 12, r.y + 22, a.label ?? a.id, 12, theme.ink, theme.fontSans);
        addStatic(r.x + 12, r.y + 40, `homeWorldRef: ${a.homeWorldRef ?? 'unresolved'}`, MIN_TEXT, theme.muted, theme.fontMono);
        if (a.identityGroup) {
          const token = a.identityGroup.slice(0, 10);
          shapes.push(`<rect x="${r.x + 12}" y="${r.y + 50}" width="44" height="16" rx="2" fill="${theme.secondary}" fill-opacity="0.16" stroke="${theme.secondary}" stroke-width="0.8"/>`);
          addStatic(r.x + 17, r.y + 62, token, MIN_TEXT, theme.secondary, theme.fontMono);
        }
        const role = a.continuityRole ?? '';
        let rx = r.x + 68;
        if (/primary/.test(role)) { shapes.push(`<circle cx="${rx}" cy="${r.y + 80}" r="4" fill="${theme.accent}"/>`); rx += 16; }
        else if (/counterpart/.test(role)) { shapes.push(`<rect x="${rx - 4}" y="${r.y + 75}" width="7" height="7" fill="none" stroke="${theme.accent}" stroke-width="1.1"/><rect x="${rx + 3}" y="${r.y + 78}" width="7" height="7" fill="none" stroke="${theme.secondary}" stroke-width="1.1"/>`); rx += 22; }
        else if (/younger_self/.test(role)) { shapes.push(`<path d="M ${rx + 7} ${r.y + 76} L ${rx - 2} ${r.y + 81} L ${rx + 7} ${r.y + 86}" fill="none" stroke="${theme.accent}" stroke-width="1.3"/>`); addStatic(rx + 12, r.y + 84, 'younger self', MIN_TEXT, theme.accent, theme.fontSans); rx += 78; }
        else if (/bootstrap_sink/.test(role)) { shapes.push(`<circle cx="${rx}" cy="${r.y + 80}" r="6" fill="none" stroke="${theme.accent}" stroke-width="1.1"/><path d="M ${rx - 4} ${r.y + 80} L ${rx} ${r.y + 76} M ${rx + 4} ${r.y + 80} L ${rx} ${r.y + 76}" fill="none" stroke="${theme.accent}" stroke-width="1.1"/>`); addStatic(rx + 10, r.y + 84, 'bootstrap sink', MIN_TEXT, theme.accent, theme.fontSans); rx += 92; }
        else if (/observer_persistent/.test(role)) { shapes.push(`<path d="M ${rx - 8} ${r.y + 80} Q ${rx} ${r.y + 72} ${rx + 8} ${r.y + 80} Q ${rx} ${r.y + 88} ${rx - 8} ${r.y + 80} Z" fill="none" stroke="${theme.secondary}" stroke-width="1.1"/><circle cx="${rx}" cy="${r.y + 80}" r="2" fill="${theme.secondary}"/>`); rx += 22; }
        if (role) addStatic(r.x + 12, r.y + 100, `continuityRole: ${role}`, MIN_TEXT, theme.muted, theme.fontMono);
      }
    }

    // correspondence ladders (separate layer; never simultaneity or travel)
    if (corrEntries.length) {
      addStatic(M.l, corrTop + 16, 'correspondence ladder — localKey ⇄ remoteWorldRef:remoteKey', 11, theme.ink, theme.fontSans);
      corrEntries.forEach((x, i) => {
        addStatic(M.l + 14, corrTop + 40 + i * 18, `${x.w.id}:${x.entry.localKey} ⇄ ${x.entry.remoteWorldRef}:${x.entry.remoteKey}`, MIN_TEXT, theme.secondary, theme.fontMono);
      });
    }

    // intervention callouts (ruleEffects anchored to their event when supplied)
    if (facts.interventions.length) {
      addStatic(M.l, ivTop + 18, `intervention rule effects (${facts.interventions.length}) — anchored callouts, scope preserved verbatim`, 12, theme.ink, theme.fontSans);
      facts.interventions.forEach((iv, i) => {
        const y = ivTop + 46 + i * 44;
        const target = iv.eventId ? eventAnchor.get(iv.eventId) : undefined;
        const effects = iv.ruleEffects;
        const effectText = Array.isArray(effects)
          ? effects.map((x) => {
              if (x && typeof x === 'object') {
                const o = x as Record<string, unknown>;
                return `${String(o.ruleSetId ?? 'rule')}: ${String(o.effect ?? '')}${o.scope ? ` [scope: ${String(o.scope)}]` : ''}`;
              }
              return String(x);
            }).join(' · ')
          : effects === undefined ? 'no ruleEffects declared' : JSON.stringify(effects);
        shapes.push(`<rect class="intervention-callout" data-source-id="${esc(iv.id)}" data-intervention-id="${esc(iv.id)}" x="${M.l}" y="${y - 16}" width="${W - M.l - M.r}" height="32" rx="4" fill="${theme.lane}" fill-opacity="0.06" stroke="${theme.lane}" stroke-width="0.8"/>`);
        if (target) shapes.push(`<line x1="${M.l}" y1="${y}" x2="${target.x}" y2="${target.y}" stroke="${theme.accent}" stroke-width="0.8" stroke-dasharray="2 4" opacity="0.7"/>`);
        const idText = `${iv.id}${iv.eventId ? ` → ${iv.eventId}` : ' (event anchor not encoded)'}`;
        addStatic(M.l + 10, y + 4, idText, MIN_TEXT, theme.accent, theme.fontMono);
        const effectX = M.l + 10 + textWidth(idText, MIN_TEXT) + 18;
        const budget = Math.max(8, Math.floor((W - M.r - effectX - 6) / (MIN_TEXT * 0.52)));
        addStatic(effectX, y + 4, effectText.slice(0, budget), MIN_TEXT, theme.muted, theme.fontSans);
        declareDrawn(drawn, 'intervention', iv.id, 'anchored rule-effect callout; eventId, ruleSetId, effect and scope retained');
      });
    }

    // outcome + evidence footer
    if (facts.outcome) {
      addStatic(M.l, footerTop + 30, 'outcome', 13, theme.ink, theme.fontSerif);
      addStatic(M.l, footerTop + 52, facts.outcome.summary ?? '(no summary encoded)', 11, theme.muted, theme.fontSans);
      if (facts.outcome.endWorldRefs?.length) {
        addStatic(M.l, footerTop + 72, `end-state world tag: ${facts.outcome.endWorldRefs.join(', ')}`, MIN_TEXT, theme.accent, theme.fontMono);
      }
      declareDrawn(drawn, 'outcome', 'outcome', 'outcome summary + end-state world tag');
    } else {
      addStatic(M.l, footerTop + 30, 'outcome: none declared', 11, theme.muted, theme.fontSans);
    }

    // legend / publication grammar
    legendLines.forEach((l, i) => addStatic(M.l, legendY + i * 18, l, 10.5, theme.muted, theme.fontSans));
    if (semanticRaw) {
      semLines.forEach((l, i) => addStatic(M.l, semTop + i * 16, l, MIN_TEXT, theme.muted, theme.fontMono));
    }

    // ---------------------------------------------------------------------
    // Resolve free labels, then assemble the document.
    // ---------------------------------------------------------------------
    const { out, register } = resolveMarks(W, H0, staticText, freeText);
    const staticBeforeRegister = staticText.length;

    const registerLines: string[] = [];
    if (register.length) {
      const budget = Math.max(8, Math.floor((W - M.l - M.r) / (MIN_TEXT * 0.52)));
      for (const m of register) registerLines.push(...wrapFor(m.s, budget));
    }
    let finalH = registerTop + M.b;
    if (register.length) {
      addStatic(M.l, registerTop + 6, 'edge register — relation labels displaced here so no two marks overlap', 11, theme.muted, theme.fontSans);
      registerLines.forEach((l, i) => addStatic(M.l, registerTop + 28 + i * 15, l, MIN_TEXT, theme.muted, theme.fontSans));
      finalH = registerTop + 28 + registerLines.length * 15 + M.b;
    }
    // register text was appended to staticText after resolution; emit it directly.
    const registerSvg = staticText.slice(staticBeforeRegister).map(emitMark).join('');
    const textSvg = out.map(emitMark).join('') + registerSvg;

    shapes.unshift(`<rect width="${W}" height="${finalH.toFixed(0)}" fill="${theme.bg}"/>`);

    const title = `Atlas — ${facts.storyId || 'untitled'} (${facts.topologyPatternId})`;
    const desc = [
      scene.header.topologyLine, scene.header.physicsLine, scene.header.evidenceLine,
      scene.header.causalNote,
      'Generated from the validated StoryEncoding; every mark carries a data-source-id.',
    ].join(' · ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${finalH.toFixed(0)}" viewBox="0 0 ${W} ${finalH.toFixed(0)}">`
      + `<title>${esc(title)}</title><desc>${esc(desc)}</desc>${shapes.join('')}${textSvg}</svg>`;
    return { doc: svg, medium: '2d-svg', width: W, height: finalH, profileId: this.id, drawn };
  },
};

/** Deterministic word wrap used only for the footer/register prose. */
function wrapFor(text: string, maxChars: number): string[] {
  const budget = Math.max(8, Math.floor(maxChars));
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = '';
  for (const raw of words) {
    const parts = raw.length > budget ? raw.match(new RegExp(`.{1,${budget}}`, 'g'))! : [raw];
    for (const w of parts) {
      if (!line) { line = w; continue; }
      if (line.length + 1 + w.length <= budget) line += ` ${w}`;
      else { lines.push(line); line = w; }
    }
  }
  if (line) lines.push(line);
  return lines;
}
