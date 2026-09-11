/**
 * Chronicle — calendar bands, routed movement, and a complete reading index.
 *
 * One SVG contains consecutive, explicitly separated sheets:
 *   1. Calendar overview, followed by as much reading text as fits.
 *   2. Reading-index continuation sheets, when necessary.
 *   3. An exhaustive technical rendering.
 *
 * Coordinates are millimetres. Font sizes are converted from points.
 * No I/O, clock, randomness, browser measurement, or inferred event merging.
 */

import type {
  FactEdge,
  FactEvent,
  FactWorld,
  SemanticScene,
} from '../engine/types.js';
import type {
  DesignProfile,
  DrawnKind,
  DrawnSource,
  RenderDoc,
  ThemeSpec,
} from './registry.js';
import { declareDrawn, esc, textWidth, wrapText } from './registry.js';

const PT = 0.352778;
const pt = (n: number): number => n * PT;

const PAGE_W = 594;
const PAGE_H = 420;
const M = 14;
const GAP = 8;

const SIZE = {
  title: pt(28),
  heading: pt(16),
  body: pt(12),
  small: pt(11),
};

const C = {
  bg: '#FFFFFF',
  ink: '#202A34',
  secondary: '#475569',
  blue: '#174EA6',
  amber: '#9A410B',
  teal: '#086F62',
  rule: '#BBC5D0',
  band: '#F2F5F8',
  alternate: '#F8FAFC',
};

type Mode = 'branching' | 'revision' | 'fixed' | 'unresolved';

interface Physics {
  mode: Mode;
  explanation: string;
  warnings: string[];
}

interface Run {
  text: string;
  size: number;
  fill: string;
  bold: boolean;
  advance: number;
}

interface Sheet {
  height: number;
  shapes: string[];
  texts: string[];
  technical: boolean;
}

interface Position {
  x: number;
  y: number;
  day: string;
}

interface Route {
  edge: FactEdge;
  from: FactEvent;
  to: FactEvent;
  kind: 'journey' | 'ripple';
  caption: string;
  number: number;
  laneY: number;
  sourcePort: number;
  targetPort: number;
}

const compare = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/**
 * These are deliberately bounded vocabulary recognisers, not a default
 * "anything not fixed is mutable" rule.
 *
 * The seam exposes catalogue identifiers, not catalogue definitions.
 * Unrecognised declarations therefore remain visibly unresolved.
 */
function ruleClass(id: string): Mode {
  const s = normalise(id);
  if (
    /(^|_)(branch|branching|multiverse|multiversal|tangent|fork|prune)(_|$)/.test(s)
  ) return 'branching';
  if (
    /(^|_)(fixed|predestination|novikov)(_|$)/.test(s) ||
    s.includes('closed_loop')
  ) return 'fixed';
  if (
    /(^|_)(mutable|mutability|rewrite|rewritable|revision)(_|$)/.test(s)
  ) return 'revision';
  return 'unresolved';
}

function resolvePhysics(scene: SemanticScene): Physics {
  const f = scene.facts;
  const primary = ruleClass(f.primaryRuleSetId);
  const mixins = f.mixinRuleSetIds.map(ruleClass);
  const topology = ruleClass(f.topologyPatternId);
  const warnings: string[] = [];

  // A branch-licensing rule wins over a mutable-single topology: that is
  // precisely the mixed declaration carried by the supplied instance.
  const branchLicensed =
    primary === 'branching' || mixins.includes('branching');
  const fixedDeclared =
    primary === 'fixed' || mixins.includes('fixed');
  const mutableDeclared =
    primary === 'revision' || mixins.includes('revision');

  let mode: Mode;
  if (branchLicensed) {
    mode = 'branching';
  } else if (fixedDeclared && mutableDeclared) {
    mode = 'unresolved';
    warnings.push(
      'Fixed and mutable rules are both declared; a continuation model is not established.',
    );
  } else if (fixedDeclared) {
    mode = 'fixed';
  } else if (mutableDeclared) {
    if (topology === 'branching' || topology === 'fixed') {
      mode = 'unresolved';
      warnings.push(
        'The declared topology and mutable rules disagree; no fork or replacement is invented.',
      );
    } else {
      mode = 'revision';
    }
  } else {
    mode = 'unresolved';
  }

  if (branchLicensed && topology === 'revision') {
    warnings.push(
      'The topology describes one mutable history, but an explicit branch-licensing rule also exists. Separate continuing histories are retained.',
    );
  }
  if (branchLicensed && (fixedDeclared || topology === 'fixed')) {
    warnings.push(
      'A fixed-history declaration conflicts with the branch licence. The licensed histories are shown, with the conflict left explicit.',
    );
  }
  if (
    primary === 'unresolved' ||
    mixins.includes('unresolved') ||
    topology === 'unresolved'
  ) {
    warnings.push(
      'Some declared physics vocabulary is not recognised by this profile; it supplies no additional physical claims.',
    );
  }

  const explanation: Record<Mode, string> = {
    branching:
      'Branching is explicitly licensed: distinct histories retain continuing rails. A threatened label alone does not remove a history.',
    revision:
      'One mutable history: revisions are not parallel universes. Only an established final revision receives a continuing rail.',
    fixed:
      'Fixed history: no fork is drawn. Additional world declarations remain visible without asserting additional physical histories.',
    unresolved:
      'The declarations do not establish a consistent continuation model. World records remain visible, but no physical fork is drawn.',
  };

  return { mode, explanation: explanation[mode], warnings };
}

/**
 * Position only a supplied, valid ISO calendar day.
 * A range is not silently converted into an instantaneous event.
 * No Date object is used, so parsing is independent of locale/time zone.
 */
function calendarDay(e: FactEvent): string | null {
  if (!e.order || !e.timeLabel) return null;
  const s = e.timeLabel.trim();
  if (/\bto\b|[–—]/i.test(s)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?=$|[\sT])/.exec(s);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function readableDay(day: string): string {
  const [year, month, date] = day.split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${Number(date)} ${months[Number(month) - 1]} ${year}`;
}

function yearIn(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  return /(?:^|\D)(\d{4})(?:\D|$)/.exec(s)?.[1] ?? null;
}

function stableJSON(value: unknown): string {
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      const record = v as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort(compare)) {
        result[key] = visit(record[key]);
      }
      return result;
    }
    return v;
  };
  return JSON.stringify(visit(value)) ?? 'null';
}

function readableRelation(e: FactEdge): string {
  const value = e.label || e.relation;
  if (value) {
    return value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ');
  }
  const defaults: Record<FactEdge['kind'], string> = {
    causal: 'has an encoded causal effect on',
    temporal: 'has an encoded temporal relation to',
    identity: 'is linked in identity to',
    world_relation: 'has a declared history relation to',
    family: 'has a family relation to',
    intervention: 'changes',
  };
  return defaults[e.kind];
}

function effectsText(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(effectsText);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return typeof record.effect === 'string' ? [record.effect] : [];
}

export const chronicle: DesignProfile = {
  id: 'chronicle',
  label: 'Chronicle',
  medium: '2d-svg',
  topoAffinity: [],

  render(scene: SemanticScene, theme: ThemeSpec): RenderDoc {
    const f = scene.facts;
    const physics = resolvePhysics(scene);
    const drawn: DrawnSource[] = [];
    const sheets: Sheet[] = [];
    const font = theme.fontSans || 'Helvetica, Arial, sans-serif';

    const eventMap = new Map(f.events.map(e => [e.id, e]));
    const worldMap = new Map(f.worlds.map(w => [w.id, w]));
    const agentMap = new Map(f.agents.map(a => [a.id, a]));

    // Preserve the first occurrence of each resolved edge.
    const edgeMap = new Map<string, FactEdge>();
    for (const e of [...f.edges, ...f.worldRelations]) {
      if (!edgeMap.has(e.id)) edgeMap.set(e.id, e);
    }
    const edges = [...edgeMap.values()];

    // Reading references are local numbers, never ontology identifiers.
    const eventNumber = new Map(f.events.map((e, i) => [e.id, i + 1]));
    const worldNumber = new Map(f.worlds.map((w, i) => [w.id, i + 1]));

    const eventRef = (id: string): string => {
      const n = eventNumber.get(id);
      return n === undefined ? 'an unresolved event' : `event ${n}`;
    };
    const worldName = (id: string): string => {
      const w = worldMap.get(id);
      return w?.label || (w ? `History ${worldNumber.get(id)}` : 'an unresolved history');
    };
    const agentName = (id: string): string =>
      agentMap.get(id)?.label || 'an unnamed character';

    const endpoint = (id: string): string => {
      if (eventMap.has(id)) return eventRef(id);
      if (worldMap.has(id)) return worldName(id);
      if (agentMap.has(id)) return agentName(id);
      return 'an unresolved endpoint';
    };

    const knownSources = new Map<string, DrawnKind[]>();
    const remember = (kind: DrawnKind, id: string): void => {
      const kinds = knownSources.get(id) ?? [];
      if (!kinds.includes(kind)) kinds.push(kind);
      knownSources.set(id, kinds);
    };
    f.worlds.forEach(w => remember('world', w.id));
    f.events.forEach(e => remember('event', e.id));
    f.agents.forEach(a => remember('agent', a.id));
    edges.forEach(e => remember('edge', e.id));
    f.interventions.forEach(i => remember('intervention', i.id));
    if (f.outcome) remember('outcome', 'outcome');

    const addSheet = (technical: boolean, height = PAGE_H): Sheet => {
      const sheet: Sheet = { height, shapes: [], texts: [], technical };
      sheets.push(sheet);
      return sheet;
    };

    /**
     * Conservative wrapping plus textLength bounds every rendered line.
     * textLength can only compress a line, never expand it.
     */
    const runs = (
      text: string,
      width: number,
      size = SIZE.body,
      fill = C.ink,
      bold = false,
    ): Run[] => {
      const budget = Math.max(4, Math.floor(width / (size * 0.61)));
      return wrapText(text, budget).map(line => ({
        text: line,
        size,
        fill,
        bold,
        advance: size * 1.34,
      }));
    };

    const blockHeight = (block: Run[]): number =>
      block.reduce((sum, run) => sum + run.advance, 0);

    const print = (
      sheet: Sheet,
      block: Run[],
      x: number,
      top: number,
      width: number,
    ): number => {
      let y = top;
      for (const run of block) {
        const estimated = textWidth(run.text, run.size) * (0.61 / 0.52);
        const length = Math.min(width, estimated);
        sheet.texts.push(
          `<text x="${x}" y="${y + run.size}" ` +
          `font-family="${esc(font)}" font-size="${run.size}" ` +
          `font-weight="${run.bold ? 700 : 400}" fill="${run.fill}" ` +
          `textLength="${length}" lengthAdjust="spacingAndGlyphs">` +
          `${esc(run.text)}</text>`,
        );
        y += run.advance;
      }
      return y;
    };

    const line = (
      sheet: Sheet,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      colour: string,
      width = 0.45,
      dash = '',
      arrow = '',
    ): void => {
      sheet.shapes.push(
        `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" ` +
        `stroke="${colour}" stroke-width="${width}"` +
        (dash ? ` stroke-dasharray="${dash}"` : '') +
        (arrow ? ` marker-end="url(#${arrow})"` : '') + '/>',
      );
    };

    const title = f.storyId
      .split(/[-_]+/)
      .filter(Boolean)
      .map(word => word[0].toUpperCase() + word.slice(1))
      .join(' ') || 'Untitled';

    const first = addSheet(false);
    let y = print(first, runs(title, PAGE_W - 2 * M, SIZE.title, C.ink, true),
      M, M, PAGE_W - 2 * M);
    y += 3;
    y = print(first, runs(physics.explanation, PAGE_W - 2 * M),
      M, y, PAGE_W - 2 * M);

    const warnings = [...physics.warnings];
    for (const w of f.worlds) {
      if (
        (w.kind === 'branch' || w.kind === 'parallel_world') &&
        physics.mode === 'fixed'
      ) {
        warnings.push(
          `${worldName(w.id)} is declared as a ${w.kind === 'branch' ? 'branch' : 'parallel world'}, which the fixed physics does not support.`,
        );
      }
      if (w.kind === 'parallel_world' && physics.mode === 'revision') {
        warnings.push(
          `${worldName(w.id)} is declared as a parallel world, but the rules establish one mutable history.`,
        );
      }
    }

    for (const warning of warnings) {
      y = print(first, runs(`Declaration conflict / limit: ${warning}`,
        PAGE_W - 2 * M, SIZE.small, C.amber), M, y + 1, PAGE_W - 2 * M);
    }

    y = print(first, runs(
      'Read left to right for calendar days, not elapsed duration. Each band is one declared history; stacked numbers share a day, not an inferred sequence. Blue arrows show supported character movement; dashed amber arrows show selected changes and ripples. All numbered events and all relationships are explained below.',
      PAGE_W - 2 * M, SIZE.small, C.secondary,
    ), M, y + 3, PAGE_W - 2 * M);

    // ----------------------------------------------------- history treatment

    const endWorlds = (f.outcome?.endWorldRefs ?? []).filter(id => worldMap.has(id));
    const superseded = new Set(
      edges.filter(e => e.kind === 'world_relation' &&
        normalise(e.relation ?? '') === 'supersedes')
        .map(e => e.to),
    );

    let revisionCurrent: string | undefined;
    if (physics.mode === 'revision') {
      if (endWorlds.length === 1) {
        revisionCurrent = endWorlds[0];
      } else if (f.worlds.length === 1) {
        revisionCurrent = f.worlds[0].id;
      } else {
        const survivors = f.worlds.filter(w => !superseded.has(w.id));
        if (superseded.size > 0 && survivors.length === 1) {
          revisionCurrent = survivors[0].id;
        }
      }
    }

    const fixedReference = f.worlds.find(w => w.isOriginWorld)?.id ??
      f.worlds[0]?.id;

    const parentOf = (w: FactWorld): string | undefined =>
      w.forkParent || w.parentRef ||
      edges.find(e =>
        e.kind === 'world_relation' &&
        e.from === w.id &&
        normalise(e.relation ?? '') === 'forksfrom',
      )?.to;

    const worldTreatment = (w: FactWorld): string => {
      if (physics.mode === 'branching') {
        return superseded.has(w.id)
          ? 'Continuing rail under the branch licence; a superseding relation is also recorded, without an encoded pruning time.'
          : 'Continuing history under the branch licence.';
      }
      if (physics.mode === 'revision') {
        if (w.id === revisionCurrent) return 'Current continuation of one mutable history.';
        if (superseded.has(w.id)) {
          return 'Replaced revision; muted trace, not another universe. Replacement time is not positioned.';
        }
        return 'Revision record; continuation status is not established. No second continuing universe is asserted.';
      }
      if (physics.mode === 'fixed') {
        return w.id === fixedReference
          ? 'Reference band for the single fixed history.'
          : 'Declaration-only band; not an additional physical history.';
      }
      return 'Declaration-only band; physical continuation unresolved.';
    };

    // ------------------------------------------------------- calendar marks

    const dayOf = new Map<string, string>();
    for (const e of f.events) {
      const day = calendarDay(e);
      if (day && worldMap.has(e.worldRef)) dayOf.set(e.id, day);
    }
    const days = [...new Set(dayOf.values())].sort(compare);

    const plotX = 124;
    const plotRight = PAGE_W - M;
    const plotWidth = plotRight - plotX;
    const cellWidth = plotWidth / Math.max(1, days.length);
    const dayIndex = new Map(days.map((day, i) => [day, i]));
    const markerX = (day: string): number =>
      plotX + (dayIndex.get(day)! + 0.23) * cellWidth;

    // ------------------------------------------------------------ movement

    /**
     * A temporal edge is NOT automatically a journey.
     *
     * A derived journey needs:
     *   - an encoded edge between the two events;
     *   - an explicit machine departure;
     *   - a destination year matching the target's supplied year;
     *   - exactly one explicitly shared agent;
     *   - positioned endpoints.
     *
     * The causal/temporal edge retains its original meaning in the index.
     */
    const journeyAgent = (a: FactEvent, b: FactEvent): string | null => {
      if (a.type !== 'departure' || a.payload?.travelMode !== 'machine') {
        return null;
      }
      const destination = yearIn(a.payload.destinationTimeLabel);
      if (!destination || destination !== yearIn(b.timeLabel)) return null;
      const shared = a.agents.filter(id => b.agents.includes(id) && agentMap.has(id));
      return shared.length === 1 ? shared[0] : null;
    };

    const routes: Route[] = [];
    let journeyCount = 0;
    let rippleCount = 0;
    const interventionEvents = new Set(
      f.interventions.map(iv => iv.eventId).filter((id): id is string => !!id),
    );

    for (const edge of edges) {
      const a = eventMap.get(edge.from);
      const b = eventMap.get(edge.to);
      if (!a || !b || !dayOf.has(a.id) || !dayOf.has(b.id)) continue;

      const who = edge.kind === 'causal' || edge.kind === 'temporal'
        ? journeyAgent(a, b) : null;
      if (who) {
        journeyCount += 1;
        routes.push({
          edge, from: a, to: b, kind: 'journey',
          caption: `Journey ${journeyCount}: ${agentName(who)} · ${eventRef(a.id)} to ${eventRef(b.id)}`,
          number: journeyCount, laneY: 0, sourcePort: 0, targetPort: 0,
        });
      } else if (
        edge.kind === 'intervention' ||
        (edge.kind === 'causal' &&
          (interventionEvents.has(a.id) || a.type === 'intervention'))
      ) {
        rippleCount += 1;
        routes.push({
          edge, from: a, to: b, kind: 'ripple',
          caption: `Ripple ${rippleCount}: ${eventRef(a.id)} to ${eventRef(b.id)}`,
          number: rippleCount, laneY: 0, sourcePort: 0, targetPort: 0,
        });
      }
    }

    // Journeys first, then effects; original encoded order breaks ties.
    routes.sort((a, b) =>
      (a.kind === 'journey' ? 0 : 1) - (b.kind === 'journey' ? 0 : 1));

    // Every route gets its own horizontal corridor.
    // Every endpoint incidence gets its own vertical gutter within its day.
    y += 7;
    for (const route of routes) {
      const block = runs(route.caption, plotX - M - 9, SIZE.small,
        route.kind === 'journey' ? C.blue : C.amber, true);
      const h = Math.max(8, blockHeight(block) + 2);
      route.laneY = y + h / 2;
      print(first, block, M, y, plotX - M - 9);
      y += h;
    }

    const incidences = new Map<string, { route: Route; source: boolean }[]>();
    for (const route of routes) {
      for (const source of [true, false]) {
        const day = dayOf.get(source ? route.from.id : route.to.id)!;
        const list = incidences.get(day) ?? [];
        list.push({ route, source });
        incidences.set(day, list);
      }
    }

    for (const [day, list] of incidences) {
      const cellLeft = plotX + dayIndex.get(day)! * cellWidth;
      list.forEach((entry, i) => {
        const x = cellLeft + cellWidth * (0.43 + 0.50 * (i + 1) / (list.length + 1));
        if (entry.source) entry.route.sourcePort = x;
        else entry.route.targetPort = x;
      });
    }

    const plotTop = y + 5;
    const positions = new Map<string, Position>();
    let rowTop = plotTop;

    for (const w of f.worlds) {
      const worldEvents = f.events.filter(e => e.worldRef === w.id);
      const groups = days.map(day =>
        worldEvents.filter(e => dayOf.get(e.id) === day));
      const maxStack = Math.max(1, ...groups.map(group => group.length));
      const unpositioned = worldEvents.filter(e => !dayOf.has(e.id));

      const labelBlock = [
        ...runs(worldName(w.id), plotX - M - 9, SIZE.body, C.ink, true),
        ...runs(`${worldEvents.length} events · ${worldTreatment(w)}`,
          plotX - M - 9, SIZE.small, C.secondary),
        ...(unpositioned.length
          ? runs(`Not positioned here: ${unpositioned.map(e => eventNumber.get(e.id)).join(', ')}. See the numbered descriptions.`,
            plotX - M - 9, SIZE.small, C.secondary)
          : []),
      ];
      const rowHeight = Math.max(20, maxStack * 7 + 11, blockHeight(labelBlock) + 5);

      first.shapes.push(
        `<rect x="${plotX}" y="${rowTop}" width="${plotWidth}" ` +
        `height="${rowHeight}" fill="${C.band}"/>`,
      );
      print(first, labelBlock, M, rowTop + 1, plotX - M - 9);

      const active =
        physics.mode === 'branching' ||
        (physics.mode === 'revision' && w.id === revisionCurrent) ||
        (physics.mode === 'fixed' && w.id === fixedReference);

      if (active) {
        line(first, plotX + 1, rowTop + rowHeight - 3,
          plotRight - 2, rowTop + rowHeight - 3,
          endWorlds.includes(w.id) ? C.teal : C.secondary,
          0.65, '', endWorlds.includes(w.id) ? 'chronicle-teal' : 'chronicle-grey');
      } else if (physics.mode === 'revision') {
        line(first, plotX + 1, rowTop + rowHeight - 3,
          plotRight - 2, rowTop + rowHeight - 3, C.rule, 0.65, '2 2');
      }

      groups.forEach((group, i) => {
        group.forEach((e, stack) => {
          positions.set(e.id, {
            x: markerX(days[i]),
            y: rowTop + 5 + stack * 7,
            day: days[i],
          });
        });
      });

      declareDrawn(drawn, 'world', w.id,
        'Labelled history/declaration band with complete event count and an explicit physics treatment.');
      rowTop += rowHeight + 4;
    }

    if (!f.worlds.length) {
      rowTop = print(first, runs('No histories were supplied.',
        plotWidth), plotX, rowTop, plotWidth) + 6;
    }

    // Vertical boundaries are guides, not event synchrony claims.
    for (let i = 0; i <= days.length; i += 1) {
      line(first, plotX + i * cellWidth, plotTop,
        plotX + i * cellWidth, rowTop - 4, C.rule, 0.25);
    }

    // Connectors are below markers in paint order and outside all text boxes.
    // Their horizontal spans run only in dedicated lanes above the bands.
    for (const route of routes) {
      const a = positions.get(route.from.id)!;
      const b = positions.get(route.to.id)!;
      const colour = route.kind === 'journey' ? C.blue : C.amber;
      const marker = route.kind === 'journey' ? 'chronicle-blue' : 'chronicle-amber';

      first.shapes.push(
        `<path d="M ${a.x + 3.1} ${a.y} ` +
        `H ${route.sourcePort} V ${route.laneY} ` +
        `H ${route.targetPort} V ${b.y} H ${b.x + 3.3}" ` +
        `fill="none" stroke="${colour}" stroke-width="${route.kind === 'journey' ? 0.85 : 0.55}" ` +
        (route.kind === 'ripple' ? 'stroke-dasharray="2 1.6" ' : '') +
        `stroke-linejoin="round" marker-end="url(#${marker})"/>`,
      );

      declareDrawn(drawn, 'edge', route.edge.id,
        route.kind === 'journey'
          ? 'Directed movement overlay derived from an encoded link, machine departure, matching destination year and unique shared agent; original edge meaning retained in the reading index.'
          : 'Directed amber consequence path in its own labelled corridor; endpoints use reading-event numbers.');
    }

    // Markers are painted last, including their local reading numbers.
    for (const e of f.events) {
      const p = positions.get(e.id);
      if (!p) continue;
      const intervention = interventionEvents.has(e.id) || e.type === 'intervention';

      first.shapes.push(intervention
        ? `<path d="M ${p.x} ${p.y - 3.2} L ${p.x + 3.2} ${p.y} ` +
          `L ${p.x} ${p.y + 3.2} L ${p.x - 3.2} ${p.y} Z" ` +
          `fill="${C.bg}" stroke="${C.amber}" stroke-width="0.65"/>`
        : `<circle cx="${p.x}" cy="${p.y}" r="3.1" ` +
          `fill="${C.bg}" stroke="${C.ink}" stroke-width="0.55"/>`);

      first.texts.push(
        `<text x="${p.x}" y="${p.y + SIZE.small * 0.34}" text-anchor="middle" ` +
        `font-family="${esc(font)}" font-size="${SIZE.small}" font-weight="700" ` +
        `fill="${C.ink}">${eventNumber.get(e.id)}</text>`,
      );
      declareDrawn(drawn, 'event', e.id,
        'Numbered calendar-day marker, linked to its complete description in the reading index.');

      for (const iv of f.interventions.filter(item => item.eventId === e.id)) {
        declareDrawn(drawn, 'intervention', iv.id,
          'Intervention diamond at its target; notes and effects are printed in the reading index.');
      }
    }

    // Calendar labels are BELOW every connector endpoint, not across gutters.
    let dateHeight = 0;
    days.forEach((day, i) => {
      const block = runs(readableDay(day), Math.max(6, cellWidth - 4),
        SIZE.small, C.ink, true);
      dateHeight = Math.max(dateHeight, blockHeight(block));
      print(first, block, plotX + i * cellWidth + 2, rowTop + 1,
        Math.max(6, cellWidth - 4));
    });

    y = rowTop + dateHeight + 5;
    y = print(first, runs(
      days.length
        ? 'Calendar days; equal-width day columns, gaps not to scale. Within-day times are printed in the descriptions. Ranges and unresolved order remain off the point axis.'
        : 'No events have both a usable calendar day and resolved order. Their complete descriptions remain below; no substitute causal-time axis is invented.',
      PAGE_W - 2 * M, SIZE.small, C.secondary,
    ), M, y, PAGE_W - 2 * M);

    if (physics.mode === 'revision' && !revisionCurrent) {
      y = print(first, runs(
        'The encoding does not identify a unique surviving revision, so no arbitrary current continuation has been selected.',
        PAGE_W - 2 * M, SIZE.small, C.amber,
      ), M, y + 2, PAGE_W - 2 * M);
    }

    // A large instance enlarges the overview rather than clipping or shrinking.
    // Reading-index and technical continuation sheets remain A2.
    first.height = Math.max(PAGE_H, Math.ceil(y + 44));

    // --------------------------------------------------------- text flow

    interface Flow {
      sheet: Sheet;
      top: number;
      y: number;
      column: number;
      columns: number;
      width: number;
      technical: boolean;
    }

    const makeFlow = (
      sheet: Sheet,
      top: number,
      columns: number,
      technical: boolean,
    ): Flow => ({
      sheet, top, y: top, column: 0, columns,
      width: (PAGE_W - 2 * M - GAP * (columns - 1)) / columns,
      technical,
    });

    const newFlowPage = (flow: Flow): void => {
      flow.sheet = addSheet(flow.technical);
      flow.column = 0;
      const heading = flow.technical
        ? 'Technical rendering — continuation'
        : `${title} — reading index`;
      flow.top = print(flow.sheet,
        runs(heading, PAGE_W - 2 * M, SIZE.heading, C.ink, true),
        M, M, PAGE_W - 2 * M) + 7;
      flow.y = flow.top;
    };

    const nextColumn = (flow: Flow): void => {
      if (flow.column + 1 < flow.columns) {
        flow.column += 1;
        flow.y = flow.top;
      } else {
        newFlowPage(flow);
      }
    };

    const put = (flow: Flow, block: Run[], after?: () => void): void => {
      if (!block.length) {
        after?.();
        return;
      }

      const bottom = (): number => flow.sheet.height - M - 8;
      const h = blockHeight(block) + 4;

      // Keep ordinary records whole. Truly long records may continue,
      // but no line is truncated and every continuation is inside a column.
      if (h <= bottom() - flow.top && flow.y + h > bottom()) {
        nextColumn(flow);
      }
      for (const run of block) {
        if (flow.y + run.advance > bottom()) nextColumn(flow);
        const x = M + flow.column * (flow.width + GAP);
        print(flow.sheet, [run], x, flow.y, flow.width);
        flow.y += run.advance;
      }
      flow.y += 4;
      after?.();
    };

    const reading = makeFlow(first, y + 8, 4, false);

    const heading = (flow: Flow, text: string): void =>
      put(flow, runs(text, flow.width, SIZE.heading, C.ink, true));

    heading(reading, 'Numbered events');
    put(reading, runs(
      'Numbers are reading references, not source identifiers. Similar descriptions are separate supplied records, not silently merged events.',
      reading.width, SIZE.small, C.secondary,
    ));

    for (const e of f.events) {
      const n = eventNumber.get(e.id)!;
      const description = e.description || e.label || 'No description supplied.';
      const block = [
        ...runs(`${n}. ${description}`, reading.width, SIZE.body, C.ink, true),
        ...(e.description && e.label && e.label !== e.description
          ? runs(e.label, reading.width, SIZE.small, C.secondary)
          : []),
        ...runs(`${worldName(e.worldRef)} · ${e.timeLabel || 'Time not supplied'}`,
          reading.width, SIZE.small, C.secondary),
        ...(e.agents.length
          ? runs(e.agents.map(agentName).join(' · '), reading.width, SIZE.small)
          : []),
      ];

      if (!positions.has(e.id)) {
        block.push(...runs(
          !e.order
            ? 'Time not positioned: the resolved event order is absent.'
            : 'Not placed as a calendar point: the supplied time is a range, lacks a complete day, or refers to an unresolved history.',
          reading.width, SIZE.small, C.amber,
        ));
      }

      put(reading, block, () => declareDrawn(drawn, 'event', e.id,
        'Complete, description-primary reading entry with supplied label, time, history and participants.'));
    }

    heading(reading, 'Histories and changes');
    for (const w of f.worlds) {
      const parent = parentOf(w);
      const count = f.events.filter(e => e.worldRef === w.id).length;
      const block = [
        ...runs(worldName(w.id), reading.width, SIZE.body, C.ink, true),
        ...runs(`${count} events. ${worldTreatment(w)}`, reading.width),
        ...(w.spanLabel ? runs(w.spanLabel, reading.width, SIZE.small, C.secondary) : []),
        ...(w.description ? runs(w.description, reading.width) : []),
      ];

      if (parent) {
        const relation = physics.mode === 'branching'
          ? 'Declared branch parent'
          : 'Declared parent relation; not drawn as a physical fork';
        block.push(...runs(`${relation}: ${worldName(parent)}.`, reading.width));
        block.push(...runs(
          w.forkEventRef
            ? `Declared fork location: ${eventRef(w.forkEventRef)}. The overview does not invent a parent-to-child event correspondence.`
            : 'No fork event is supplied; no calendar location for the history change is invented.',
          reading.width, SIZE.small, C.secondary,
        ));
      }
      if (w.forkLabel) block.push(...runs(w.forkLabel, reading.width));
      block.push(...runs(
        'Complete world record: see the exhaustive view after the reading index.',
        reading.width, SIZE.small, C.secondary,
      ));
      put(reading, block, () => declareDrawn(drawn, 'world', w.id,
        'Full declared label, event count, history treatment and pointer to the exhaustive view.'));
    }

    heading(reading, 'Interventions');
    if (!f.interventions.length) {
      put(reading, runs('No separate intervention records were supplied.', reading.width));
    }
    for (const iv of f.interventions) {
      const target = iv.eventId ? eventRef(iv.eventId) : 'no specified event';
      const effects = effectsText(iv.ruleEffects);
      put(reading, [
        ...runs(`Change at ${target}`, reading.width, SIZE.body, C.amber, true),
        ...(iv.notes ? runs(iv.notes, reading.width) : []),
        ...effects.flatMap(effect => runs(effect, reading.width)),
        ...(!iv.notes && !effects.length
          ? runs('The change is recorded without a plain-English effect statement.',
            reading.width)
          : []),
      ], () => declareDrawn(drawn, 'intervention', iv.id,
        'Individual reading entry carrying its target, notes and supplied plain-English effects.'));
    }

    heading(reading, 'Movement and ripples');
    put(reading, runs(
      'Blue movement is derived only where an encoded link joins a machine departure to its stated destination year and names exactly one shared traveller. It does not reclassify the underlying edge. Temporal succession alone is not character travel.',
      reading.width, SIZE.small, C.secondary,
    ));
    put(reading, runs(
      'Amber paths highlight intervention links and causal links leaving intervention events. Other relationships use exact numbered references below instead of adding crossing lines to the calendar.',
      reading.width, SIZE.small, C.secondary,
    ));

    for (const e of edges) {
      const route = routes.find(r => r.edge.id === e.id);
      const prefix = route
        ? `${route.kind === 'journey' ? 'Journey' : 'Ripple'} ${route.number}; `
        : '';
      const kind = e.kind.replace(/_/g, ' ');
      put(reading, runs(
        `${prefix}${kind}: ${endpoint(e.from)} — ${readableRelation(e)} — ${endpoint(e.to)}.`,
        reading.width, SIZE.small,
        e.kind === 'causal' || e.kind === 'intervention' ? C.amber : C.ink,
      ), () => declareDrawn(drawn, 'edge', e.id,
        'Individual relationship entry with its original kind, direction, supplied wording and both resolved reading endpoints.'));
    }

    heading(reading, 'Characters');
    for (const a of f.agents) {
      const appearances = f.events
        .filter(e => e.agents.includes(a.id))
        .map(e => eventNumber.get(e.id));
      put(reading, [
        ...runs(a.label || 'Unnamed character', reading.width, SIZE.body, C.ink, true),
        ...runs(appearances.length
          ? `Present at events ${appearances.join(', ')}.`
          : 'No event explicitly names this character.', reading.width, SIZE.small),
        ...(a.homeWorldRef
          ? runs(`Home: ${worldName(a.homeWorldRef)}.`, reading.width, SIZE.small)
          : []),
      ], () => declareDrawn(drawn, 'agent', a.id,
        'Named character entry listing every explicitly encoded event appearance and supplied home history.'));
    }

    heading(reading, 'Ending');
    if (f.outcome) {
      put(reading, [
        ...runs(f.outcome.summary || 'No ending summary supplied.', reading.width),
        ...runs(endWorlds.length
          ? `Ending histories: ${endWorlds.map(worldName).join('; ')}.`
          : 'No ending history is specified.', reading.width, SIZE.small),
      ], () => declareDrawn(drawn, 'outcome', 'outcome',
        'The supplied ending summary and ending-history references are explicitly printed.'));
    } else {
      put(reading, runs('No outcome was supplied.', reading.width));
    }

    const orderLabels = [...new Set(
      f.events.filter(e => e.order).map(e => e.order!.axisLabel),
    )];
    if (orderLabels.length) {
      heading(reading, 'Order is not elapsed time');
      put(reading, runs(
        'The overview uses supplied calendar days, never causal rank. The resolved sequence labels are retained here verbatim; they are not substituted for the calendar axis:',
        reading.width, SIZE.small, C.secondary,
      ));
      for (const label of orderLabels) {
        put(reading, runs(label, reading.width, SIZE.small));
      }
    }

    // This is the sole reading-page naming of the technical destination.
    put(reading, runs(
      'Topology Atlas — exhaustive technical rendering follows, including source records, unresolved declarations and provenance.',
      reading.width, SIZE.small, C.secondary,
    ));

    // ------------------------------------------------ exhaustive rendering

    const technicalSheet = addSheet(true);
    const technicalTop = print(technicalSheet, runs(
      'Technical rendering — exhaustive resolved records',
      PAGE_W - 2 * M, SIZE.heading, C.ink, true,
    ), M, M, PAGE_W - 2 * M) + 7;
    const technical = makeFlow(technicalSheet, technicalTop, 2, true);

    /**
     * A sourceId-bearing annotation is itself retained as visible text.
     * Declare its reference only when it resolves to an actual source.
     * Unknown source IDs are printed, not fabricated as coverage entries.
     */
    const declareSourceReferences = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(declareSourceReferences);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (typeof record.sourceId === 'string') {
        for (const kind of knownSources.get(record.sourceId) ?? []) {
          declareDrawn(drawn, kind, record.sourceId,
            'Visible sourceId reference in a fully printed technical record.');
        }
      }
      Object.keys(record).sort(compare)
        .forEach(key => declareSourceReferences(record[key]));
    };

    const technicalRecord = (
      label: string,
      value: unknown,
      kind?: DrawnKind,
      id?: string,
    ): void => {
      put(technical, [
        ...runs(label, technical.width, SIZE.body, C.ink, true),
        ...runs(stableJSON(value), technical.width, SIZE.small, C.ink),
      ], () => {
        if (kind && id) declareDrawn(drawn, kind, id,
          'Complete resolved source record printed in the exhaustive technical rendering.');
        declareSourceReferences(value);
      });
    };

    technicalRecord('Story declarations and resolved header', {
      storyId: f.storyId,
      topologyPatternId: f.topologyPatternId,
      primaryRuleSetId: f.primaryRuleSetId,
      mixinRuleSetIds: f.mixinRuleSetIds,
      ruleSetIds: f.ruleSetIds,
      semanticReview: f.semanticReview,
      header: scene.header,
      visualPhysics: physics,
    });

    for (const w of f.worlds) technicalRecord(`World: ${w.id}`, w, 'world', w.id);
    for (const a of f.agents) technicalRecord(`Agent: ${a.id}`, a, 'agent', a.id);
    for (const e of f.events) technicalRecord(`Event: ${e.id}`, e, 'event', e.id);

    // Preserve both source arrays, including any differing duplicate record.
    for (const e of f.edges) technicalRecord(`Edge: ${e.id}`, e, 'edge', e.id);
    for (const e of f.worldRelations) {
      technicalRecord(`World relation: ${e.id}`, e, 'edge', e.id);
    }
    for (const iv of f.interventions) {
      technicalRecord(`Intervention: ${iv.id}`, iv, 'intervention', iv.id);
    }
    if (f.outcome) technicalRecord('Outcome', f.outcome, 'outcome', 'outcome');

    f.issues.forEach((issue, i) => technicalRecord(`Issue ${i + 1}`, issue));
    scene.nodes.forEach((node, i) => technicalRecord(`Scene node ${i + 1}`, node));
    scene.edges.forEach((edge, i) => technicalRecord(`Scene edge ${i + 1}`, edge));

    // A visible accounting table describes actual emitted marks.
    // Take a snapshot so printing references cannot change the table mid-loop.
    technicalRecord('Draw declarations', drawn.map(item => ({ ...item })));

    // ------------------------------------------------------------- assemble

    const defs =
      '<defs>' +
      [
        ['chronicle-blue', C.blue],
        ['chronicle-amber', C.amber],
        ['chronicle-teal', C.teal],
        ['chronicle-grey', C.secondary],
      ].map(([id, colour]) =>
        `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" ` +
        'markerWidth="3.2" markerHeight="3.2" markerUnits="userSpaceOnUse" orient="auto">' +
        `<path d="M 0 0 L 7 4 L 0 8 Z" fill="${colour}"/></marker>`,
      ).join('') +
      '</defs>';

    let offset = 0;
    const sheetMarkup: string[] = [];
    sheets.forEach((sheet, i) => {
      print(sheet, runs(
        `${sheet.technical ? 'Technical' : 'Reading'} sheet ${i + 1} / ${sheets.length}`,
        PAGE_W - 2 * M, SIZE.small, C.secondary,
      ), M, sheet.height - M, PAGE_W - 2 * M);

      sheetMarkup.push(
        `<g transform="translate(0 ${offset})">` +
        `<rect x="0" y="0" width="${PAGE_W}" height="${sheet.height}" fill="${C.bg}"/>` +
        sheet.shapes.join('') +
        sheet.texts.join('') +
        `<path d="M 0 ${sheet.height - 0.25} H ${PAGE_W}" stroke="${C.rule}" stroke-width="0.5"/>` +
        '</g>',
      );
      offset += sheet.height;
    });

    const doc =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${offset}mm" ` +
      `viewBox="0 0 ${PAGE_W} ${offset}">` +
      `<title>${esc(`${title} — Chronicle`)}</title>` +
      '<desc>' + esc(
        'Consecutive landscape reading and technical sheets. Horizontal position denotes supplied calendar days; vertical bands retain distinct declared histories. Numbered marks reference complete event descriptions. Blue movement and amber consequences use separate routing corridors. Physical continuation is determined from declared rules, mixins and topology, not world kind.',
      ) + '</desc>' +
      defs + sheetMarkup.join('') + '</svg>';

    return {
      doc,
      medium: '2d-svg',
      width: PAGE_W,
      height: offset,
      profileId: 'chronicle',
      drawn,
    };
  },
};
