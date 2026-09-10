/**
 * DESIGN — "Reveal Atlas" (2D, act-of-disclosure terraces).
 * Affinity: perception_nonlinear / single_fixed_timeline.
 * x = temporal-chain order (labeled as asserted ordering — the engine has no
 * presentation-order axis unless encoded); y = causal depth (DERIVED, labeled).
 * Revisited events (identical timeLabel, distinct events) get the single accent.
 *
 * Node text: the encoded plain-English description is the PRIMARY text (set in
 * the terrace itself), with the short label and encoded time label as a caption
 * beneath. Terrace height follows the text, so causal bands are spaced by the
 * longest node, never by an assumed one-line label.
 */
import type { DesignProfile, ThemeSpec } from './registry.ts';
import { esc, textWidth, wrapText, nodeTextBlock, emitNodeText } from './registry.ts';
import type { SemanticScene } from '../engine/types.ts';

const DESC_CHARS = 30;
const DESC_SIZE = 10;
const LABEL_SIZE = 9;
const TIME_SIZE = 9;
const PAD = 7;

export const reveal: DesignProfile = {
  id: 'reveal',
  label: 'Reveal Atlas',
  medium: '2d-svg',
  topoAffinity: ['single_fixed_timeline'],
  render(scene: SemanticScene, theme: ThemeSpec) {
    const facts = scene.facts;
    const world = facts.worlds[0];
    const parts: string[] = [];

    const worldEvents = facts.events.filter(e => e.worldRef === world?.id);
    const ordered = worldEvents.filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal);
    const unordered = worldEvents.filter(e => !e.order);

    // causal depth from engine data (derived)
    const layerOf = (evId: string): number => {
      const n = scene.nodes.find(x => x.kind === 'eventNode' && x.sourceId === evId);
      return typeof n?.data['causalLayer'] === 'number' ? n!.data['causalLayer'] as number : 0;
    };
    // bands come from the OCCUPIED causal depths (a gap in depth is not a band)
    const occupied = [...new Set(ordered.map(e => layerOf(e.id)))].sort((a, b) => a - b);
    const bandIndex = new Map(occupied.map((l, i) => [l, i]));
    const nBands = Math.max(1, occupied.length);

    // revisited = same exact timeLabel on 2+ distinct events (derived, honest label)
    const byTime = new Map<string, number>();
    for (const e of worldEvents) if (e.timeLabel) byTime.set(e.timeLabel, (byTime.get(e.timeLabel) ?? 0) + 1);
    const revisited = (e: { timeLabel?: string }) => !!e.timeLabel && (byTime.get(e.timeLabel) ?? 0) > 1;

    // node text: description wrapped into the terrace; label + time as a caption below
    const descLines = (ev: typeof ordered[number]) => wrapText((ev.description ?? ev.label ?? ev.id).trim(), DESC_CHARS);
    const caption = (ev: typeof ordered[number]) => {
      const line = (ev.label ?? ev.id).trim();
      return { label: wrapText(line, DESC_CHARS), time: ev.timeLabel ?? '' };
    };

    const lineH = DESC_SIZE * 1.28;
    const nodeH = (ev: typeof ordered[number]) =>
      descLines(ev).length * lineH + 2 * PAD + (caption(ev).label.length * LABEL_SIZE * 1.35) + (ev.timeLabel ? TIME_SIZE * 1.5 : 0) + 6;
    const tallest = Math.max(60, ...ordered.map(nodeH));

    const colW = Math.max(120, DESC_CHARS * DESC_SIZE * 0.52 + 2 * PAD + 16);
    const nCols = Math.max(ordered.length, 6);
    const M = { l: 90, r: 70, t: 146, b: 100 };
    const W = Math.ceil(M.l + nCols * colW + M.r);
    const bandH = tallest + 18;
    const bandBot = M.t + nBands * bandH;
    const H = Math.ceil(bandBot + 40 + M.b);
    /** y of the TOP of a terrace in causal band `layer` (shallowest depth at the bottom) */
    const yFor = (layer: number) => bandBot - ((bandIndex.get(layer) ?? 0) + 1) * bandH + (bandH - tallest) / 2;

    parts.push(`<rect width="${W}" height="${H}" fill="${theme.bg}"/>`);
    parts.push(`<text x="${M.l}" y="56" font-family="${theme.fontSerif}" font-size="30" fill="${theme.ink}">Reveal Atlas</text>`);
    parts.push(`<text x="${M.l}" y="82" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">${esc(scene.header.topologyLine)} · ${esc(scene.header.physicsLine)}</text>`);
    parts.push(`<text x="${M.l}" y="100" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">x: temporal-chain order (encoded, not to scale) · y: causal depth (derived, not chronology)</text>`);
    parts.push(`<text x="${M.l}" y="117" font-family="${theme.fontSans}" font-size="11.5" fill="${theme.muted}">${esc(scene.header.causalNote)}</text>`);

    // quiet chronological guides
    for (let i = 0; i < nCols; i += 2) {
      const x = M.l + i * colW;
      parts.push(`<line x1="${x}" y1="${M.t - 10}" x2="${x}" y2="${bandBot + 10}" stroke="${theme.lane}" stroke-width="0.5" opacity="0.35"/>`);
    }

    // terraces: one per ordered event, height set by its own text
    const centers = new Map<string, { x: number; y: number }>();
    ordered.forEach((ev, i) => {
      const x0 = M.l + i * colW + colW * 0.08;
      const w = colW * 0.84;
      const layer = layerOf(ev.id);
      const lines = descLines(ev);
      const isRe = revisited(ev);
      const fill = isRe ? theme.accent : theme.secondary;
      const rectH = lines.length * lineH + 2 * PAD;
      const y = yFor(layer);
      const cap = caption(ev);

      parts.push(`<rect x="${x0}" y="${y}" width="${w}" height="${rectH}" rx="2" fill="${fill}" opacity="${isRe ? 0.92 : 0.82}"/>`);
      lines.forEach((t, k) => {
        parts.push(`<text x="${x0 + w / 2}" y="${(y + PAD + k * lineH + DESC_SIZE * 0.92).toFixed(1)}" text-anchor="middle" font-family="${theme.fontSans}" font-size="${DESC_SIZE}" fill="${theme.bg}">${esc(t)}</text>`);
      });
      // caption: short label, then encoded time label
      let cy = y + rectH + 13;
      for (const t of cap.label) {
        parts.push(`<text x="${x0 + w / 2}" y="${cy.toFixed(1)}" text-anchor="middle" font-family="${theme.fontSans}" font-size="${LABEL_SIZE}" fill="${theme.muted}">${esc(t)}</text>`);
        cy += LABEL_SIZE * 1.35;
      }
      if (cap.time) {
        parts.push(`<text x="${x0 + w / 2}" y="${cy.toFixed(1)}" text-anchor="middle" font-family="${theme.fontMono}" font-size="${TIME_SIZE}" fill="${isRe ? theme.accent : theme.muted}">${esc(cap.time)}</text>`);
      }
      centers.set(ev.id, { x: x0 + w / 2, y: y + rectH / 2 });
      // connectors: editing transitions between consecutive resolved events (derived order)
      if (i > 0) {
        const p = centers.get(ordered[i - 1].id)!;
        parts.push(`<line x1="${p.x}" y1="${p.y}" x2="${x0 + w / 2}" y2="${y + rectH / 2}" stroke="${theme.lane}" stroke-width="1" opacity="0.55"/>`);
      }
    });

    // causal-depth labels at the left of each occupied band
    for (const layer of occupied) {
      const y = yFor(layer);
      parts.push(`<text x="${M.l - 12}" y="${(y + 12).toFixed(1)}" text-anchor="end" font-family="${theme.fontMono}" font-size="9.5" fill="${theme.muted}">depth ${layer}</text>`);
    }

    // revisited-event vertical echo lines (same band, later x)
    const seen = new Map<string, number>();
    for (const ev of ordered) {
      if (!revisited(ev)) continue;
      const c = centers.get(ev.id)!;
      const prevX = seen.get(ev.timeLabel!);
      if (prevX !== undefined) {
        parts.push(`<line x1="${prevX}" y1="${c.y - 10}" x2="${c.x}" y2="${c.y - 10}" stroke="${theme.accent}" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/>`);
        parts.push(`<text x="${(prevX + c.x) / 2}" y="${c.y - 16}" text-anchor="middle" font-family="${theme.fontSans}" font-size="9.5" fill="${theme.accent}">same event re-encountered</text>`);
      }
      seen.set(ev.timeLabel!, c.x);
    }

    // unresolved shelf: same node text, stacked
    if (unordered.length) {
      const stackW = Math.max(...unordered.map(e => textWidth((e.description ?? e.label ?? e.id).slice(0, DESC_CHARS + 2), DESC_SIZE)), 40);
      const sx = W - M.r - stackW;
      parts.push(`<line x1="${sx - 10}" y1="${M.t - 30}" x2="${sx - 10}" y2="${H - M.b + 10}" stroke="${theme.muted}" stroke-dasharray="3 4"/>`);
      parts.push(`<text x="${sx}" y="${M.t - 34}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">time not positioned (${unordered.length})</text>`);
      let y = M.t - 18;
      for (const ev of unordered) {
        const b = nodeTextBlock(ev, theme, { wrapChars: DESC_CHARS, descSize: DESC_SIZE, labelSize: LABEL_SIZE, timeSize: TIME_SIZE });
        parts.push(`<circle cx="${sx - 6}" cy="${y + 5}" r="4" fill="none" stroke="${theme.muted}" stroke-width="1.2"/>`);
        parts.push(emitNodeText(b, sx + 6, y, 'start'));
        y += b.height + 10;
      }
    }

    // legend
    parts.push(`<text x="${M.l}" y="${H - 40}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">blue = first encounter · apricot = re-encountered event (identical encoded timeLabel) · terrace height = its own text · lines = derived ordering, not travel</text>`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
    return { doc: svg, medium: '2d-svg' as const, width: W, height: H, profileId: this.id };
  },
};
