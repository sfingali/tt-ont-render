/**
 * DESIGN — "Temporal Section" (2.5D axonometric exploded section).
 * Affinity: origin_plus_twins / parallel_world_network / any multi-world story.
 * Depth (stacking) = engine-derived nestingDepth from encoded nestsWithin edges;
 * worlds without nesting data get declared depth slots (labeled, not invented).
 * The synchronized column joins events sharing an exact timeLabel across worlds.
 */
import type { DesignProfile, ThemeSpec } from './registry.ts';
import { esc } from './registry.ts';
import type { SemanticScene, SceneNode } from '../engine/types.ts';

export const temporal: DesignProfile = {
  id: 'temporal',
  label: 'Temporal Section',
  medium: '2.5d-svg',
  topoAffinity: ['origin_plus_twins', 'parallel_world_network', 'dual_parallel_pair', 'worldline_bundle'],
  render(scene: SemanticScene, theme: ThemeSpec) {
    const facts = scene.facts;
    const W = 1500, H = 1160;
    const parts: string[] = [];
    const iso = (x: number, y: number, z: number): [number, number] => [x - y * 0.5, (x + y) * 0.26 - z];

    // plane stack: nested worlds above their parents; un-nested worlds get declared slots
    const nested = facts.worlds.filter(w => w.nestingDepth !== null)
      .sort((a, b) => (b.nestingDepth ?? 0) - (a.nestingDepth ?? 0));
    const flat = facts.worlds.filter(w => w.nestingDepth === null);
    const stack = [...nested, ...flat];
    const slotDepth = (i: number) => stack.length > 1 ? (stack.length - 1 - i) * 120 : 0;

    parts.push(`<rect width="${W}" height="${H}" fill="${theme.bg}"/>`);
    parts.push(`<text x="70" y="58" font-family="${theme.fontSerif}" font-size="30" fill="${theme.ink}">Temporal Section</text>`);
    parts.push(`<text x="70" y="84" font-family="${theme.fontSans}" font-size="12.5" fill="${theme.muted}">${esc(scene.header.topologyLine)} · ${esc(scene.header.physicsLine)}</text>`);
    const depthNote = nested.length
      ? `plane height = nesting depth (encoded nestsWithin: ${nested.map(w => w.id).join(', ')})`
      : 'plane height = declared section slots (no encoded nestsWithin — depth is declarative, not derived)';
    parts.push(`<text x="70" y="102" font-family="${theme.fontSans}" font-size="12" fill="${theme.muted}">${esc(depthNote)}</text>`);

    const planeCenters = new Map<string, { cx: number; cy: number; z: number }>();
    const laneDx = 120;
    stack.forEach((w, i) => {
      const z = slotDepth(i);
      const agents = facts.agents.filter(a => facts.events.some(e => e.worldRef === w.id && e.agents.includes(a.id)));
      const laneCount = Math.max(1, agents.length);
      const cx = 640, cy = 420;
      const [px, py] = iso(cx, cy, z);
      planeCenters.set(w.id, { cx: px, cy: py, z });
      // plane as parallelogram (chalk-white, cut-away feel)
      const pw = 760, ph = laneCount * 46 + 60;
      const corners = [
        iso(cx - pw / 2, cy - ph / 2, z), iso(cx + pw / 2, cy - ph / 2, z),
        iso(cx + pw / 2, cy + ph / 2, z), iso(cx - pw / 2, cy + ph / 2, z),
      ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      parts.push(`<polygon points="${corners}" fill="#f2ede2" stroke="${theme.lane}" stroke-width="1" opacity="0.95"/>`);
      // world header + section label
      const kindTab = w.kind === 'parallel_world' ? 'P' : w.kind === 'branch' ? 'B' : 'T';
      parts.push(`<text x="${px - pw / 2 + 8}" y="${py - ph / 2 + 4}" font-family="${theme.fontSans}" font-size="14" font-weight="bold" fill="${theme.ink}">${w.id} · ${kindTab} ${esc(w.spanLabel ?? '')}${w.nestingDepth !== null ? ` · depth ${w.nestingDepth}` : ''}</text>`);
      // lanes + events on this plane
      agents.forEach((a, li) => {
        const ly = cy - ph / 2 + 50 + li * 46;
        const evs = facts.events.filter(e => e.worldRef === w.id && e.agents.includes(a.id));
        evs.forEach(ev => {
          const ord = ev.order?.ordinal ?? -1;
          const lx = cx - pw / 2 + 40 + (ord >= 0 ? ord : 14 + li) * 52;
          const [ex, ey] = iso(lx, ly, z);
          const fill = ev.order ? theme.secondary : 'none';
          parts.push(`<circle cx="${ex}" cy="${ey}" r="5.5" fill="${fill}" stroke="${theme.ink}" stroke-width="1.2"/>`);
          if (ev.label) parts.push(`<text x="${ex + 9}" y="${ey + 3}" font-family="${theme.fontSans}" font-size="9.5" fill="${theme.ink}">${esc(ev.label.slice(0, 22))}</text>`);
        });
        const [l1x, l1y] = iso(cx - pw / 2 + 30, ly, z);
        const [l2x, l2y] = iso(cx + pw / 2 - 30, ly, z);
        parts.push(`<line x1="${l1x}" y1="${l1y}" x2="${l2x}" y2="${l2y}" stroke="${theme.lane}" stroke-width="0.7" opacity="0.5"/>`);
        parts.push(`<text x="${l1x - 6}" y="${l1y + 3}" text-anchor="end" font-family="${theme.fontSans}" font-size="9.5" fill="${theme.ink}">${esc(a.label ?? a.id)}</text>`);
      });
    });

    // synchrony columns: derived label-match columns from engine edges
    for (const se of scene.edges) {
      if (se.kind !== 'synchrony') continue;
      const a = scene.nodes.find(n => n.id === `event:${se.from}`);
      const b = scene.nodes.find(n => n.id === `event:${se.to}`);
      if (!a || !b) continue;
      const wa = planeCenters.get(String(a.worldRef));
      const wb = planeCenters.get(String(b.worldRef));
      if (!wa || !wb) continue;
      parts.push(`<line x1="${wa.cx}" y1="${wa.cy - 320}" x2="${wa.cx}" y2="${wb.cy + 320}" stroke="${theme.accent}" stroke-width="1.6" stroke-dasharray="6 4" opacity="0.85"/>`);
      parts.push(`<text x="${wa.cx + 6}" y="${(wa.cy + wb.cy) / 2}" font-family="${theme.fontMono}" font-size="10" fill="${theme.accent}">${esc(se.label ?? '')}</text>`);
    }

    // legend
    parts.push(`<text x="70" y="${H - 40}" font-family="${theme.fontSans}" font-size="11" fill="${theme.muted}">T/B/P = timeline/branch/parallel world primitive · filled dot = positioned event · open dot = unresolved · dashed accent = label-match synchrony (not asserted simultaneity)</text>`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
    return { doc: svg, medium: '2.5d-svg' as const, width: W, height: H, profileId: this.id };
  },
};
