/**
 * DESIGN — "Counterpoint Score" (2D, editorial musical-notation grammar).
 * Affinity: inverted_single_timeline. One world band, agent lanes as staves,
 * inverted agents' traversal marks point LEFT without reversing the axis,
 * hollow rings on multi-agent encounters, // compressed-break marks.
 * Axis uses engine-resolved order only; unresolved time lands on the shelf.
 */
import type { DesignProfile, RenderDoc, ThemeSpec } from './registry.ts';
import { esc } from './registry.ts';
import type { SemanticScene } from '../engine/types.ts';

interface Placed { x: number; laneY: number; label: string; evId: string; timeLabel?: string; agents: string[] }

export const counterpoint: DesignProfile = {
  id: 'counterpoint',
  label: 'Counterpoint Score',
  medium: '2d-svg',
  topoAffinity: ['inverted_single_timeline', 'single_fixed_timeline'],
  render(scene: SemanticScene, theme: ThemeSpec): RenderDoc {
    const facts = scene.facts;
    const world = facts.worlds[0];
    const W = 1360, H = 1000;
    const M = { l: 170, r: 60, t: 130, b: 120 };
    const lanes = facts.agents.filter(a => world && facts.events.some(e => e.worldRef === world.id && e.agents.includes(a.id)));
    const laneY = new Map<string, number>();
    lanes.forEach((a, i) => laneY.set(a.id, M.t + 60 + i * ((H - M.t - M.b - 80) / Math.max(1, lanes.length))));

    // axis: resolved-order events first (temporal_edge), then causal-derived, then shelf
    const worldEvents = facts.events.filter(e => e.worldRef === world?.id);
    const ordered = worldEvents.filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal);
    const unordered = worldEvents.filter(e => !e.order);
    const axisLabel = ordered.length
      ? 'temporal-chain order — encoded temporal edges (ordered, not to scale)'
      : 'causal-path order — DERIVED, not coordinate time (no temporal edges encoded)';

    const nCols = Math.max(ordered.length, 6);
    const colX = (i: number) => M.l + (i * (W - M.l - M.r)) / (nCols - 1 || 1);
    const place = new Map<string, number>();
    ordered.forEach((e, i) => place.set(e.id, colX(i)));
    // unresolved events go to a right shelf zone
    const shelfX = W - M.r + 8;

    const parts: string[] = [];
    parts.push(`<rect width="${W}" height="${H}" fill="${theme.bg}"/>`);

    // header (DESIGN-ATLAS §1 mandatory header)
    parts.push(`<text x="${M.l}" y="56" font-family="${theme.fontSerif}" font-size="30" fill="${theme.ink}">Counterpoint Score</text>`);
    parts.push(`<text x="${M.l}" y="82" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">${esc(scene.header.topologyLine)} · ${esc(scene.header.physicsLine)}</text>`);
    parts.push(`<text x="${M.l}" y="100" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">${esc(axisLabel)}</text>`);

    // staves (lane rails) + labels + identity tokens
    for (const a of lanes) {
      const y = laneY.get(a.id)!;
      parts.push(`<line x1="${M.l - 14}" y1="${y}" x2="${W - M.r}" y2="${y}" stroke="${theme.lane}" stroke-width="1" opacity="0.55"/>`);
      const role = a.continuityRole ? ` · ${a.continuityRole}` : '';
      parts.push(`<text x="${M.l - 22}" y="${y + 4}" text-anchor="end" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.ink}">${esc(a.label ?? a.id)}${esc(role)}</text>`);
      if (a.identityGroup) {
        parts.push(`<circle cx="${M.l - 8}" cy="${y - 8}" r="3" fill="none" stroke="${theme.secondary}" stroke-width="1.2"/>`);
      }
    }

    // traversal direction marks: inverted_self roles get left-pointing chevrons
    for (const a of lanes) {
      if (a.continuityRole && /inverted/.test(a.continuityRole)) {
        const y = laneY.get(a.id)!;
        for (let k = 0; k < 5; k++) {
          const x = M.l + 60 + k * ((W - M.l - M.r - 120) / 4);
          parts.push(`<path d="M ${x + 7} ${y - 5} L ${x - 3} ${y} L ${x + 7} ${y + 5}" fill="none" stroke="${theme.accent}" stroke-width="1.4" opacity="0.75"/>`);
        }
      }
    }

    // encounter rings + event marks
    const multi = worldEvents.filter(e => e.agents.length > 1);
    for (const ev of worldEvents) {
      const x = place.get(ev.id) ?? shelfX;
      if (ev.agents.length === 0) continue;
      if (ev.agents.length > 1) {
        const y1 = laneY.get(ev.agents[0]), y2 = laneY.get(ev.agents[ev.agents.length - 1]);
        if (y1 !== undefined && y2 !== undefined) {
          parts.push(`<ellipse cx="${x}" cy="${(y1 + y2) / 2}" rx="7" ry="${Math.max(7, Math.abs(y2 - y1) / 2)}" fill="none" stroke="${theme.secondary}" stroke-width="1.6"/>`);
        }
        for (const ag of ev.agents) {
          const y = laneY.get(ag);
          if (y !== undefined) parts.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${(y1! + y2!) / 2}" stroke="${theme.secondary}" stroke-width="1" opacity="0.6"/>`);
        }
      } else {
        const y = laneY.get(ev.agents[0]);
        if (y !== undefined) parts.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="${theme.bg}" stroke="${theme.ink}" stroke-width="1.4"/>`);
      }
    }

    // event labels for ordered events (3-row stagger above, 3-row below to avoid collisions)
    ordered.forEach((ev, i) => {
      const x = place.get(ev.id)!;
      const above = i % 2 === 0;
      const row = Math.floor(i / 2) % 3;
      const y = above ? M.t + 14 + row * 16 : H - M.b + 6 + row * 16;
      parts.push(`<text x="${x}" y="${y}" text-anchor="middle" font-family="${theme.fontSans}" font-size="10.5" fill="${theme.muted}">${esc((ev.label ?? ev.id).slice(0, 26))}</text>`);
      if (ev.timeLabel) parts.push(`<text x="${x}" y="${y + 12}" text-anchor="middle" font-family="${theme.fontMono}" font-size="9.5" fill="${theme.accent}">${esc(ev.timeLabel.slice(0, 22))}</text>`);
    });

    // compressed-break marks between non-adjacent resolved ordinals
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].order!.ordinal - ordered[i - 1].order!.ordinal > 1) {
        const x = (place.get(ordered[i].id)! + place.get(ordered[i - 1].id)!) / 2;
        parts.push(`<text x="${x}" y="${M.t + 44}" text-anchor="middle" font-family="${theme.fontMono}" font-size="11" fill="${theme.muted}">//</text>`);
      }
    }

    // unresolved shelf (visible gap)
    if (unordered.length) {
      parts.push(`<line x1="${shelfX - 6}" y1="${M.t}" x2="${shelfX - 6}" y2="${H - M.b}" stroke="${theme.muted}" stroke-width="1" stroke-dasharray="3 4"/>`);
      parts.push(`<text x="${shelfX}" y="${M.t - 8}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">time not positioned (${unordered.length})</text>`);
      unordered.forEach((ev, i) => {
        const y = M.t + 14 + i * 22;
        parts.push(`<circle cx="${shelfX + 6}" cy="${y}" r="4" fill="none" stroke="${theme.muted}" stroke-width="1.2"/>`);
        parts.push(`<text x="${shelfX + 16}" y="${y + 3.5}" font-family="${theme.fontSans}" font-size="10" fill="${theme.muted}">${esc((ev.label ?? ev.id).slice(0, 30))}</text>`);
      });
    }

    // legend + axis titles in reserved bands (no collision with staggered labels)
    parts.push(`<text x="${M.l}" y="${H - 74}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">screen-order bands: above = label rows · below = encoded timeLabel rows (staggered)</text>`);
    const ly = H - 34;
    parts.push(`<text x="${M.l}" y="${ly}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">hollow ring = encounter · circle = single-agent event · &lt; chevrons = inverted traversal (reads leftward) · // = compressed time · dashed rail = unresolved</text>`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
    return { doc: svg, medium: '2d-svg', width: W, height: H, profileId: this.id };
  },
};
