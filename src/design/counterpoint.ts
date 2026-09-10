/**
 * DESIGN — "Counterpoint Score" (2D, editorial musical-notation grammar).
 * Affinity: inverted_single_timeline. One world band, agent lanes as staves,
 * inverted agents' traversal marks point LEFT without reversing the axis,
 * hollow rings on multi-agent encounters, // compressed-break marks.
 * Axis uses engine-resolved order only; unresolved time lands on the shelf.
 *
 * Node text: the encoded plain-English description is the PRIMARY text and the
 * short label sits beneath it (corpus standard). Columns are sized from the
 * description's wrap budget, so a dense story makes a wider score, never
 * smaller type.
 */
import type { DesignProfile, RenderDoc, ThemeSpec } from './registry.ts';
import { esc, textWidth, nodeTextBlock, emitNodeText } from './registry.ts';
import type { SemanticScene } from '../engine/types.ts';

const DESC_CHARS = 34;
const TEXT = { wrapChars: DESC_CHARS, descSize: 10, labelSize: 9, timeSize: 9 };

export const counterpoint: DesignProfile = {
  id: 'counterpoint',
  label: 'Counterpoint Score',
  medium: '2d-svg',
  topoAffinity: ['inverted_single_timeline', 'single_fixed_timeline'],
  render(scene: SemanticScene, theme: ThemeSpec): RenderDoc {
    const facts = scene.facts;
    const world = facts.worlds[0];
    const lanes = facts.agents.filter(a => world && facts.events.some(e => e.worldRef === world.id && e.agents.includes(a.id)));
    // left margin fits the longest lane label (agent name + continuity role) whole
    const laneLabelW = Math.max(0, ...lanes.map(a => textWidth(`${a.label ?? a.id}${a.continuityRole ? ` · ${a.continuityRole}` : ''}`, 12.5)));
    const M = { l: Math.ceil(Math.max(170, laneLabelW + 46)), r: 60 };

    // axis: resolved-order events first (temporal_edge), then causal-derived, then shelf
    const worldEvents = facts.events.filter(e => e.worldRef === world?.id);
    const ordered = worldEvents.filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal);
    const unordered = worldEvents.filter(e => !e.order);
    const axisLabel = ordered.length
      ? 'temporal-chain order — encoded temporal edges (ordered, not to scale)'
      : 'causal-path order — DERIVED, not coordinate time (no temporal edges encoded)';

    // text blocks: description primary, label beneath, time label last
    const block = (ev: typeof ordered[number]) => nodeTextBlock(ev, theme, TEXT);
    const blocks = new Map(ordered.map(ev => [ev.id, block(ev)]));
    const shelfBlocks = new Map(unordered.map(ev => [ev.id, block(ev)]));
    const colW = Math.max(150, Math.max(0, ...[...blocks.values()].map(b => b.width)) + 26);
    const shelfW = Math.max(140, Math.max(0, ...[...shelfBlocks.values()].map(b => b.width)) + 24);
    const bandH = Math.max(0, ...[...blocks.values()].map(b => b.height)) + 14;

    const nCols = Math.max(ordered.length, 6);
    const W = M.l + (nCols - 1) * colW + 46 + shelfW + M.r;
    const colX = (i: number) => M.l + i * colW;
    const place = new Map<string, number>();
    ordered.forEach((e, i) => place.set(e.id, colX(i)));

    // vertical budget: text bands above (2) and below (2), lanes between, shelf stack on the right
    const aboveTop = 126;
    const laneArea = Math.max(300, lanes.length * 54);
    const shelfStackH = [...shelfBlocks.values()].reduce((h, b) => h + b.height + 16, 0);
    const M_t = aboveTop + 2 * bandH + 12;
    const M_b = 2 * bandH + 12 + 78;
    const H = Math.ceil(M_t + Math.max(laneArea, shelfStackH + 30) + M_b);
    const laneY = new Map<string, number>();
    lanes.forEach((a, i) => laneY.set(a.id, M_t + 40 + i * ((laneArea - 60) / Math.max(1, lanes.length))));

    const shelfX = M.l + (nCols - 1) * colW + 46;

    const parts: string[] = [];
    parts.push(`<rect width="${W}" height="${H}" fill="${theme.bg}"/>`);

    // header (DESIGN-ATLAS §1 mandatory header)
    parts.push(`<text x="${M.l}" y="56" font-family="${theme.fontSerif}" font-size="30" fill="${theme.ink}">Counterpoint Score</text>`);
    parts.push(`<text x="${M.l}" y="82" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">${esc(scene.header.topologyLine)} · ${esc(scene.header.physicsLine)}</text>`);
    parts.push(`<text x="${M.l}" y="100" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">${esc(axisLabel)}</text>`);

    // staves (lane rails) + labels + identity tokens
    for (const a of lanes) {
      const y = laneY.get(a.id)!;
      parts.push(`<line x1="${M.l - 14}" y1="${y}" x2="${W - M.r - shelfW - 40}" y2="${y}" stroke="${theme.lane}" stroke-width="1" opacity="0.55"/>`);
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
        const span = (nCols - 1) * colW - 120;
        for (let k = 0; k < 5; k++) {
          const x = M.l + 60 + k * (span / 4);
          parts.push(`<path d="M ${x + 7} ${y - 5} L ${x - 3} ${y} L ${x + 7} ${y + 5}" fill="none" stroke="${theme.accent}" stroke-width="1.4" opacity="0.75"/>`);
        }
      }
    }

    // encounter rings + event marks
    for (const ev of worldEvents) {
      const x = place.get(ev.id);
      if (x === undefined || ev.agents.length === 0) continue;
      if (ev.agents.length > 1) {
        const y1 = laneY.get(ev.agents[0]), y2 = laneY.get(ev.agents[ev.agents.length - 1]);
        if (y1 !== undefined && y2 !== undefined) {
          parts.push(`<ellipse cx="${x}" cy="${(y1 + y2) / 2}" rx="7" ry="${Math.max(7, Math.abs(y2 - y1) / 2)}" fill="none" stroke="${theme.secondary}" stroke-width="1.6"/>`);
          for (const ag of ev.agents) {
            const y = laneY.get(ag);
            if (y !== undefined) parts.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${(y1! + y2!) / 2}" stroke="${theme.secondary}" stroke-width="1" opacity="0.6"/>`);
          }
        }
      } else {
        const y = laneY.get(ev.agents[0]);
        if (y !== undefined) parts.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="${theme.bg}" stroke="${theme.ink}" stroke-width="1.4"/>`);
      }
    }

    // node text: description primary, label beneath — two bands above the staves, two below
    ordered.forEach((ev, i) => {
      const x = place.get(ev.id)!;
      const b = blocks.get(ev.id)!;
      const above = i % 2 === 0;
      const row = Math.floor(i / 2) % 2;
      const top = above ? aboveTop + row * bandH : H - M_b + 24 + row * bandH;
      parts.push(emitNodeText(b, x, top, 'middle'));
    });

    // compressed-break marks between non-adjacent resolved ordinals
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].order!.ordinal - ordered[i - 1].order!.ordinal > 1) {
        const x = (place.get(ordered[i].id)! + place.get(ordered[i - 1].id)!) / 2;
        parts.push(`<text x="${x}" y="${aboveTop - 14}" text-anchor="middle" font-family="${theme.fontMono}" font-size="11" fill="${theme.muted}">//</text>`);
      }
    }

    // unresolved shelf (visible gap): same node text, stacked in reading order
    if (unordered.length) {
      parts.push(`<line x1="${shelfX - 14}" y1="${aboveTop - 30}" x2="${shelfX - 14}" y2="${H - M_b + 4}" stroke="${theme.muted}" stroke-width="1" stroke-dasharray="3 4"/>`);
      parts.push(`<text x="${shelfX}" y="${aboveTop - 34}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">time not positioned (${unordered.length})</text>`);
      let y = aboveTop - 18;
      for (const ev of unordered) {
        const b = shelfBlocks.get(ev.id)!;
        parts.push(`<circle cx="${shelfX - 6}" cy="${y + 5}" r="4" fill="none" stroke="${theme.muted}" stroke-width="1.2"/>`);
        parts.push(emitNodeText(b, shelfX + 6, y, 'start'));
        y += b.height + 16;
      }
    }

    // legend + axis titles in reserved bands (no collision with staggered labels)
    parts.push(`<text x="${M.l}" y="${H - 74}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">four text bands: two above the staves, two below (staggered) · description leads, short label beneath, encoded time label last</text>`);
    const ly = H - 34;
    parts.push(`<text x="${M.l}" y="${ly}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">hollow ring = encounter · circle = single-agent event · &lt; chevrons = inverted traversal (reads leftward) · // = compressed time · dashed rail = unresolved</text>`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
    return { doc: svg, medium: '2d-svg', width: W, height: H, profileId: this.id };
  },
};
