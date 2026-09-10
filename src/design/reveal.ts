/**
 * DESIGN — "Reveal Atlas" (2D, act-of-disclosure terraces).
 * Affinity: perception_nonlinear / single_fixed_timeline.
 * x = temporal-chain order (labeled as asserted ordering — the engine has no
 * presentation-order axis unless encoded); y = causal depth (DERIVED, labeled).
 * Revisited events (identical timeLabel, distinct events) get the single accent.
 */
import type { DesignProfile, ThemeSpec } from './registry.ts';
import { esc } from './registry.ts';
import type { SemanticScene } from '../engine/types.ts';

export const reveal: DesignProfile = {
  id: 'reveal',
  label: 'Reveal Atlas',
  medium: '2d-svg',
  topoAffinity: ['single_fixed_timeline'],
  render(scene: SemanticScene, theme: ThemeSpec) {
    const facts = scene.facts;
    const world = facts.worlds[0];
    const W = 1440, H = 1110;
    const M = { l: 90, r: 70, t: 130, b: 110 };
    const parts: string[] = [];

    const worldEvents = facts.events.filter(e => e.worldRef === world?.id);
    const ordered = worldEvents.filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal);
    const unordered = worldEvents.filter(e => !e.order);

    // causal depth from engine data (derived)
    const layerOf = (evId: string): number => {
      const n = scene.nodes.find(x => x.kind === 'eventNode' && x.sourceId === evId);
      return typeof n?.data['causalLayer'] === 'number' ? n!.data['causalLayer'] as number : 0;
    };
    const maxLayer = Math.max(0, ...ordered.map(e => layerOf(e.id)));

    // revisited = same exact timeLabel on 2+ distinct events (derived, honest label)
    const byTime = new Map<string, number>();
    for (const e of worldEvents) if (e.timeLabel) byTime.set(e.timeLabel, (byTime.get(e.timeLabel) ?? 0) + 1);
    const revisited = (e: { timeLabel?: string }) => !!e.timeLabel && (byTime.get(e.timeLabel) ?? 0) > 1;

    parts.push(`<rect width="${W}" height="${H}" fill="${theme.bg}"/>`);
    parts.push(`<text x="${M.l}" y="56" font-family="${theme.fontSerif}" font-size="30" fill="${theme.ink}">Reveal Atlas</text>`);
    parts.push(`<text x="${M.l}" y="82" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">${esc(scene.header.topologyLine)} · ${esc(scene.header.physicsLine)}</text>`);
    parts.push(`<text x="${M.l}" y="100" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">x: temporal-chain order (encoded, not to scale) · y: causal depth (derived, not chronology)</text>`);

    const nCols = Math.max(ordered.length, 6);
    const colW = (W - M.l - M.r) / nCols;
    const bandTop = M.t + 10, bandBot = H - M.b;
    const yFor = (layer: number) => bandBot - (layer / Math.max(1, maxLayer)) * (bandBot - bandTop) * 0.86 - 14;

    // quiet chronological guides
    for (let i = 0; i < nCols; i += 2) {
      const x = M.l + i * colW;
      parts.push(`<line x1="${x}" y1="${bandTop - 10}" x2="${x}" y2="${bandBot + 10}" stroke="${theme.lane}" stroke-width="0.5" opacity="0.35"/>`);
    }

    // terraces: one segment per ordered event; rises/falls are abrupt by construction
    const centers = new Map<string, { x: number; y: number }>();
    ordered.forEach((ev, i) => {
      const x0 = M.l + i * colW + colW * 0.12;
      const w = colW * 0.76;
      const layer = layerOf(ev.id);
      const y = yFor(layer);
      const isRe = revisited(ev);
      const fill = isRe ? theme.accent : theme.secondary;
      parts.push(`<rect x="${x0}" y="${y}" width="${w}" height="26" rx="2" fill="${fill}" opacity="${isRe ? 0.92 : 0.82}"/>`);
      parts.push(`<text x="${x0 + w / 2}" y="${y + 17}" text-anchor="middle" font-family="${theme.fontSans}" font-size="10" fill="${theme.bg}">${esc((ev.label ?? ev.id).slice(0, 20))}</text>`);
      if (ev.timeLabel) parts.push(`<text x="${x0 + w / 2}" y="${y - 6}" text-anchor="middle" font-family="${theme.fontMono}" font-size="9" fill="${isRe ? theme.accent : theme.muted}">${esc(ev.timeLabel.slice(0, 24))}</text>`);
      centers.set(ev.id, { x: x0 + w / 2, y: y + 13 });
      // connectors: editing transitions between consecutive resolved events (derived order)
      if (i > 0) {
        const p = centers.get(ordered[i - 1].id)!;
        parts.push(`<line x1="${p.x}" y1="${p.y}" x2="${x0 + w / 2}" y2="${y + 13}" stroke="${theme.lane}" stroke-width="1" opacity="0.55"/>`);
      }
    });

    // revisited-event vertical echo lines (same band, later x)
    const seen = new Map<string, number>();
    for (const ev of ordered) {
      if (!revisited(ev)) continue;
      const c = centers.get(ev.id)!;
      const prevX = seen.get(ev.timeLabel!);
      if (prevX !== undefined) {
        parts.push(`<line x1="${prevX}" y1="${c.y - 40}" x2="${c.x}" y2="${c.y - 40}" stroke="${theme.accent}" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/>`);
        parts.push(`<text x="${(prevX + c.x) / 2}" y="${c.y - 46}" text-anchor="middle" font-family="${theme.fontSans}" font-size="9.5" fill="${theme.accent}">same event re-encountered</text>`);
      }
      seen.set(ev.timeLabel!, c.x);
    }

    // unresolved shelf
    if (unordered.length) {
      const sx = W - M.r - 150;
      parts.push(`<line x1="${sx - 8}" y1="${bandTop}" x2="${sx - 8}" y2="${bandBot}" stroke="${theme.muted}" stroke-dasharray="3 4"/>`);
      parts.push(`<text x="${sx}" y="${bandTop - 6}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">time not positioned (${unordered.length})</text>`);
      unordered.forEach((ev, i) => {
        const y = bandTop + 14 + i * 22;
        parts.push(`<circle cx="${sx}" cy="${y}" r="4" fill="none" stroke="${theme.muted}" stroke-width="1.2"/>`);
        parts.push(`<text x="${sx + 12}" y="${y + 3.5}" font-family="${theme.fontSans}" font-size="10" fill="${theme.muted}">${esc((ev.label ?? ev.id).slice(0, 26))}</text>`);
      });
    }

    // legend
    parts.push(`<text x="${M.l}" y="${H - 40}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">blue = first encounter · ${'apricot'} = re-encountered event (identical encoded timeLabel) · lines = derived ordering, not travel</text>`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
    return { doc: svg, medium: '2d-svg' as const, width: W, height: H, profileId: this.id };
  },
};
