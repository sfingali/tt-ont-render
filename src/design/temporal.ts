/**
 * DESIGN — "Temporal Section" (2.5D axonometric exploded section).
 * Affinity: origin_plus_twins / parallel_world_network / any multi-world story.
 * Plane stacking = engine-derived nestingDepth from encoded nestsWithin edges;
 * un-nested worlds get declared slots (labeled, not invented). Positioned events
 * sit along the asserted order; events with no encoded ordering stay as open dots
 * after that run. The synchronized column joins events sharing an exact timeLabel
 * across worlds.
 *
 * Node text: the encoded plain-English description is the PRIMARY text, set
 * beside its dot; the short label and encoded time label sit beneath it. Plane
 * width and lane pitch come from those blocks, so a plane is exactly as large as
 * its writing needs. Layout is two-pass: geometry is built in a local frame as
 * typed data, then serialised once into canvas coordinates — no string surgery.
 */
import type { DesignProfile, DrawnSource, ThemeSpec } from './registry.ts';
import { declareDrawn, esc, textWidth, nodeTextBlock, emitNodeText } from './registry.ts';
import type { NodeTextBlock } from './registry.ts';
import type { SemanticScene } from '../engine/types.ts';

const DESC_CHARS = 34;
const TEXT = { wrapChars: DESC_CHARS, descSize: 9.5, labelSize: 9, timeSize: 9 };

type Piece =
  | { k: 'text'; x: number; y: number; s: string; size: number; fill: string; anchor?: 'start' | 'middle' | 'end' }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; w: number; op?: number }
  | { k: 'dot'; x: number; y: number; r: number; fill: string; stroke: string }
  | { k: 'lead'; x1: number; y1: number; x2: number; y2: number; stroke: string }
  | { k: 'poly'; pts: [number, number][]; fill: string; stroke: string; op: number }
  | { k: 'block'; x: number; y: number; block: NodeTextBlock };

/** Serialise one piece with the canvas translation applied. */
function emit(p: Piece, dx: number, dy: number, theme: ThemeSpec): string {
  const f = (n: number) => (n + 0).toFixed(1);
  switch (p.k) {
    case 'text':
      return `<text x="${f(p.x + dx)}" y="${f(p.y + dy)}"${p.anchor ? ` text-anchor="${p.anchor}"` : ''} font-family="${theme.fontSans}" font-size="${p.size}" fill="${p.fill}">${esc(p.s)}</text>`;
    case 'line':
      return `<line x1="${f(p.x1 + dx)}" y1="${f(p.y1 + dy)}" x2="${f(p.x2 + dx)}" y2="${f(p.y2 + dy)}" stroke="${p.stroke}" stroke-width="${p.w}"${p.op !== undefined ? ` opacity="${p.op}"` : ''}/>`;
    case 'dot':
      return `<circle cx="${f(p.x + dx)}" cy="${f(p.y + dy)}" r="${p.r}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="1.2"/>`;
    case 'lead':
      return `<path d="M ${f(p.x1 + dx)} ${f(p.y1 + dy)} L ${f(p.x2 + dx)} ${f(p.y2 + dy)}" fill="none" stroke="${p.stroke}" stroke-width="0.7" opacity="0.7"/>`;
    case 'poly':
      return `<polygon points="${p.pts.map(([x, y]) => `${f(x + dx)},${f(y + dy)}`).join(' ')}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="1" opacity="${p.op}"/>`;
    case 'block':
      return emitNodeText(p.block, p.x + dx, p.y + dy, 'start');
  }
}

export const temporal: DesignProfile = {
  id: 'temporal',
  label: 'Temporal Section',
  medium: '2.5d-svg',
  topoAffinity: ['origin_plus_twins', 'parallel_world_network', 'dual_parallel_pair', 'worldline_bundle'],
  render(scene: SemanticScene, theme: ThemeSpec) {
    const facts = scene.facts;
    const drawn: DrawnSource[] = [];
    const parts: string[] = [];
    /** plan (u,v) relative to a plane centre -> local pixel frame */
    const proj = (u: number, v: number, py = 0): [number, number] => [u - v * 0.5, py + (u + v) * 0.26];

    const headerOf = (w: { id: string; kind: string; spanLabel?: string; nestingDepth: number | null }) => {
      const tab = w.kind === 'parallel_world' ? 'P' : w.kind === 'branch' ? 'B' : 'T';
      return `${w.id} · ${tab}${w.spanLabel ? ` ${w.spanLabel}` : ''}${w.nestingDepth !== null ? ` · depth ${w.nestingDepth}` : ''}`;
    };

    const nested = facts.worlds.filter(w => w.nestingDepth !== null)
      .sort((a, b) => (b.nestingDepth ?? 0) - (a.nestingDepth ?? 0));
    const stack = [...nested, ...facts.worlds.filter(w => w.nestingDepth === null)];

    // ---- geometry pass, local frame -----------------------------------------
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const track = (x: number, y: number) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };

    const sized = stack.map((w) => {
      const worldEvents = facts.events.filter(e => e.worldRef === w.id);
      const laneAgents = facts.agents.filter(a => worldEvents.some(e => e.agents.includes(a.id)));
      const blocks = new Map(worldEvents.map(ev => [ev.id, nodeTextBlock(ev, theme, TEXT)]));
      const blockW = Math.max(150, Math.max(0, ...[...blocks.values()].map(b => b.width)) + 22);
      const blockH = Math.max(0, ...[...blocks.values()].map(b => b.height));
      const lanes = [...laneAgents.map(a => a.label ?? a.id), ...(worldEvents.some(e => e.agents.length === 0) ? ['no agent recorded'] : [])];
      const positioned = worldEvents.filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal);
      const unresolved = worldEvents.filter(e => !e.order);
      const maxOrd = positioned.length ? Math.max(...positioned.map(e => e.order!.ordinal)) : -1;
      const runCount = Math.max(1, maxOrd + 1 + unresolved.length);
      // a plane must hold its own writing: block height clears the top edge, and the
      // rightmost block keeps a margin inside the right edge
      const pw = 40 + runCount * blockW + 60;
      const ph = (blockH + 12) + Math.max(1, lanes.length) * (blockH + 18) + 20;
      return { w, worldEvents, laneAgents, blocks, blockW, blockH, lanePitch: blockH + 18, lanes, positioned, unresolved, maxOrd, pw, ph };
    });

    const pixH = sized.map(s => s.ph * 0.26);          // v-axis compresses by 0.26
    const maxBlockH = Math.max(0, ...sized.map(s => s.blockH));
    // Node text is a CALLOUT: it sits outside its plane (the axonometric convention),
    // tied to its dot by a leader. Planes are therefore spaced by the text height as
    // well as their own depth, so no callout lands on the plane above it.
    const GAP = 34;
    const zs = new Array(sized.length).fill(0);
    for (let i = sized.length - 2; i >= 0; i--) {
      zs[i] = zs[i + 1] + Math.max((pixH[i] + pixH[i + 1]) / 2, maxBlockH + 30) + GAP;
    }

    const planePieces: { worldId: string; pyLocal: number; pieces: Piece[] }[] = sized.map((s, i) => {
      const py = -zs[i];
      const pieces: Piece[] = [];
      const [hx, hy] = proj(-s.pw / 2 + 8, -s.ph / 2 + 4, py);
      pieces.push({ k: 'text', x: hx, y: hy, s: headerOf(s.w), size: 13, fill: theme.ink });
      declareDrawn(drawn, 'world', s.w.id, 'stacked plane with a world header');

      s.lanes.forEach((label, li) => {
        const v = -s.ph / 2 + (s.blockH + 12) + li * s.lanePitch;
        const [x1, y1] = proj(-s.pw / 2 + 30, v, py);
        const [x2, y2] = proj(s.pw / 2 - 30, v, py);
        pieces.push({ k: 'line', x1, y1, x2, y2, stroke: theme.lane, w: 0.7, op: 0.5 });
        pieces.push({ k: 'text', x: x1 - 6, y: y1 + 3, s: label, size: 9.5, fill: theme.ink, anchor: 'end' });
        if (li < s.laneAgents.length) declareDrawn(drawn, 'agent', s.laneAgents[li].id, 'named lane on its world plane');
        track(x1 - 6 - textWidth(label, 9.5), y1 - 8);
      });

      const place = (ev: typeof s.worldEvents[number], slot: number) => {
        const laneIdx = ev.agents.length === 0 ? s.laneAgents.length : Math.max(0, s.laneAgents.findIndex(a => a.id === ev.agents[0]));
        const li = Math.min(laneIdx, Math.max(0, s.lanes.length - 1));
        const v = -s.ph / 2 + (s.blockH + 12) + li * s.lanePitch;
        const u = -s.pw / 2 + 40 + slot * s.blockW;
        const [dxp, dyp] = proj(u, v, py);
        const blk = s.blocks.get(ev.id)!;
        const bx = dxp + 12, byp = dyp - 4;
        const open = !ev.order;
        pieces.push({ k: 'lead', x1: dxp, y1: dyp, x2: bx, y2: byp + 2, stroke: theme.lane });
        pieces.push({ k: 'dot', x: dxp, y: dyp, r: 5.5, fill: open ? 'none' : theme.secondary, stroke: theme.ink });
        pieces.push({ k: 'block', x: bx, y: byp, block: blk });
        declareDrawn(drawn, 'event', ev.id, open
          ? 'open dot + callout text on its world plane (no encoded order)'
          : 'filled dot + callout text on its world plane');
        track(dxp - 8, dyp - 8); track(bx + blk.width, byp + blk.height);
      };
      s.positioned.forEach(ev => place(ev, ev.order!.ordinal));
      s.unresolved.forEach((ev, k) => place(ev, Math.max(0, s.maxOrd + 1) + k));

      const corners: [number, number][] = [
        proj(-s.pw / 2, -s.ph / 2, py), proj(s.pw / 2, -s.ph / 2, py),
        proj(s.pw / 2, s.ph / 2, py), proj(-s.pw / 2, s.ph / 2, py),
      ];
      for (const [x, y] of corners) track(x, y);
      pieces.unshift({ k: 'poly', pts: corners, fill: '#f2ede2', stroke: theme.lane, op: 0.95 });
      return { worldId: s.w.id, pyLocal: py, pieces };
    });

    // ---- serialise ----------------------------------------------------------
    const DX = 70 - minX;
    const DY = 140 - minY;
    const W = Math.ceil(maxX + DX + 90);
    const H = Math.ceil(maxY + DY + 96);

    parts.push(`<rect width="${W}" height="${H}" fill="${theme.bg}"/>`);
    parts.push(`<text x="70" y="58" font-family="${theme.fontSerif}" font-size="30" fill="${theme.ink}">Temporal Section</text>`);
    parts.push(`<text x="70" y="84" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">${esc(scene.header.topologyLine)} · ${esc(scene.header.physicsLine)}</text>`);
    parts.push(`<text x="70" y="102" font-family="${theme.fontSans}" font-size="12" fill="${theme.muted}">event text is a callout outside its plane, tied to its dot by a leader line</text>`);
    parts.push(`<text x="70" y="118" font-family="${theme.fontSans}" font-size="12" fill="${theme.muted}">${esc(nested.length
      ? `plane stacking = nesting depth (encoded nestsWithin: ${nested.map(w => w.id).join(', ')})`
      : 'plane stacking = declared section slots (no encoded nestsWithin — depth is declarative, not derived)')}</text>`);

    // every plane shares one pixel x centre: local u=0,v=0 projects to x=0, so the
    // centre is simply the translation DX
    const planeCenters = new Map<string, { cx: number; py: number }>();
    for (const p of planePieces) {
      for (const piece of p.pieces) parts.push(emit(piece, DX, DY, theme));
      planeCenters.set(p.worldId, { cx: DX, py: p.pyLocal + DY });
    }
    const centreX = DX;

    // synchrony columns: label-match only, from engine edges
    for (const se of scene.edges) {
      if (se.kind !== 'synchrony') continue;
      const a = scene.nodes.find(n => n.id === `event:${se.from}`);
      const b = scene.nodes.find(n => n.id === `event:${se.to}`);
      if (!a || !b) continue;
      const wa = planeCenters.get(String(a.worldRef));
      const wb = planeCenters.get(String(b.worldRef));
      if (!wa || !wb) continue;
      const x = centreX;
      const top = Math.min(wa.py, wb.py) - 300;
      const bot = Math.max(wa.py, wb.py) + 300;
      parts.push(`<line x1="${x.toFixed(1)}" y1="${top.toFixed(1)}" x2="${x.toFixed(1)}" y2="${bot.toFixed(1)}" stroke="${theme.accent}" stroke-width="1.6" stroke-dasharray="6 4" opacity="0.85"/>`);
      parts.push(`<text x="${(x + 6).toFixed(1)}" y="${((top + bot) / 2).toFixed(1)}" font-family="${theme.fontMono}" font-size="10" fill="${theme.accent}">${esc(se.label ?? '')}</text>`);
    }

    parts.push(`<text x="70" y="${H - 34}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">T/B/P = timeline/branch/parallel world primitive · filled dot = positioned event · open dot = unresolved · description leads, short label beneath · dashed accent = label-match synchrony (not asserted simultaneity)</text>`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
    return { doc: svg, medium: '2.5d-svg' as const, width: W, height: H, profileId: this.id, drawn };
  },
};
