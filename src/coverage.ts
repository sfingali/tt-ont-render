/**
 * COVERAGE — reconcile a profile's draw declaration against the full resolved
 * Facts.
 *
 * A profile appends a DrawnSource at each draw site (RenderDoc.drawn). Coverage
 * enumerates every declared world / agent / event / edge (grouped by edge kind) /
 * intervention / outcome and reports each as drawn or not drawn with a reason.
 *
 * Honesty guard: a declaration naming a source id the story does not declare is
 * a hard error. That makes invented coverage impossible to print: the report can
 * only describe ids that really exist in the resolved Facts. Coverage also
 * re-derives the not-drawn set from those same Facts, so a profile cannot shrink
 * its omissions by staying silent.
 *
 * Pure and browser-safe (no node: imports), so the GUI can use it too.
 */
import type { FactEdge, SemanticScene } from './engine/types.ts';
import type { DrawnSource, RenderDoc } from './design/registry.ts';
import { getProfile } from './design/registry.ts';

export type CoverageKind = 'world' | 'agent' | 'event' | 'edge' | 'intervention' | 'outcome';

export interface CoverageItem {
  kind: CoverageKind;
  id: string;
  label: string;
  /** present only on edge items: the encoded edge kind */
  edgeKind?: FactEdge['kind'];
  /** present only on edge items: the encoded relation, if any */
  relation?: string;
  drawn: boolean;
  reason: string;
}

export interface CoverageGroup {
  kind: CoverageKind;
  /** for edge groups: the encoded edge kind */
  edgeKind?: FactEdge['kind'];
  label: string;
  items: CoverageItem[];
  drawn: number;
  notDrawn: number;
}

export interface CoverageReport {
  storyId: string;
  profileId: string;
  profileLabel: string;
  groups: CoverageGroup[];
  totals: { declared: number; drawn: number; notDrawn: number };
}

const EDGE_KIND_ORDER: FactEdge['kind'][] = [
  'causal', 'temporal', 'identity', 'world_relation', 'family', 'intervention',
];

const KIND_ORDER: CoverageKind[] = ['world', 'agent', 'event', 'edge', 'intervention', 'outcome'];

function profileLabelFor(profileId: string): string {
  try { return getProfile(profileId).label; } catch { return profileId; }
}

function group(kind: CoverageKind, label: string, items: CoverageItem[], edgeKind?: FactEdge['kind']): CoverageGroup {
  const drawn = items.filter(i => i.drawn).length;
  return { kind, edgeKind, label, items, drawn, notDrawn: items.length - drawn };
}

export function buildCoverageReport(scene: SemanticScene, doc: RenderDoc): CoverageReport {
  const facts = scene.facts;
  const profileId = doc.profileId;
  const profileLabel = profileLabelFor(profileId);

  // --- honesty guard: every declaration must name a declared source id -------
  const declared = new Set<string>();
  for (const w of facts.worlds) declared.add(`world:${w.id}`);
  for (const a of facts.agents) declared.add(`agent:${a.id}`);
  for (const e of facts.events) declared.add(`event:${e.id}`);
  for (const e of facts.edges) declared.add(`edge:${e.id}`);
  for (const iv of facts.interventions) declared.add(`intervention:${iv.id}`);
  if (facts.outcome) declared.add('outcome:outcome');

  const drawnMap = new Map<string, DrawnSource>();
  for (const d of doc.drawn) {
    const key = `${d.kind}:${d.id}`;
    if (!declared.has(key)) {
      throw new Error(
        `coverage: profile '${profileId}' declares it drew ${key}, but story '${facts.storyId}' declares no such source id`,
      );
    }
    if (!drawnMap.has(key)) drawnMap.set(key, d);
  }

  const done = (kind: CoverageKind, id: string): DrawnSource | undefined => drawnMap.get(`${kind}:${id}`);

  // --- omission reasons -------------------------------------------------------
  const w0 = facts.worlds[0]?.id ?? 'none';
  const isSingleWorld = profileId === 'counterpoint' || profileId === 'reveal';

  const worldReason = (id: string): string => {
    if (isSingleWorld) {
      return `not drawn: ${profileLabel} resolves one world band and draws only worlds[0] (${w0}); '${id}' has no band in this profile`;
    }
    return `not drawn: ${profileLabel} did not lay out world '${id}'`;
  };

  const agentReason = (id: string): string => {
    if (profileId === 'reveal') return `not drawn: ${profileLabel} draws event terraces only, with no agent-lane primitive`;
    if (profileId === 'worldline') return `not drawn: ${profileLabel} draws world lanes, not agent lanes`;
    if (profileId === 'counterpoint') {
      return `not drawn: no event in the drawn world '${w0}' lists agent '${id}'; only active agents get a stave`;
    }
    if (profileId === 'temporal') {
      return `not drawn: agent '${id}' appears in no event on any drawn plane; only active agents get a lane label`;
    }
    return `not drawn: ${profileLabel} has no agent-lane primitive`;
  };

  const eventReason = (id: string): string => {
    const ev = facts.events.find(e => e.id === id);
    if (!ev) return `not drawn: event '${id}' is not in the resolved facts`;
    if (isSingleWorld && ev.worldRef !== w0) {
      return `not drawn: event belongs to world '${ev.worldRef}'; ${profileLabel} draws only worlds[0] ('${w0}')`;
    }
    if (ev.order === null) {
      return `not drawn: event has no encoded temporal ordering, and ${profileLabel} can only place time-resolved events; it is reported as an unresolved count, not drawn`;
    }
    return `not drawn: ${profileLabel} did not place this event`;
  };

  const edgeNote = (): string => {
    switch (profileId) {
      case 'counterpoint': return 'the score strokes staves and derived ordering guides, not encoded ontology edges';
      case 'reveal': return 'the atlas places terraces by derived causal depth, not encoded edges';
      case 'temporal': return 'the section draws dots, planes and derived label-match synchrony columns, not encoded edges';
      case 'worldline': return 'the loom traces each world series as a presentation ribbon, not encoded edges';
      default: return 'this profile does not stroke encoded edges';
    }
  };

  const edgeReason = (e: FactEdge): string => {
    if (e.kind === 'world_relation') {
      return `not drawn: encoded world_relation (${e.relation ?? e.kind}) — ${profileLabel} stacks or places world headers from the relation, but does not stroke the relation itself`;
    }
    if (e.kind === 'intervention') {
      return 'not drawn: encoded intervention edge — interventions are outside the visual primitive grammar (DESIGN-ATLAS §2)';
    }
    return `not drawn: encoded ${e.kind} edge — ${edgeNote()}`;
  };

  const interventionReason = (id: string): string =>
    `not drawn: intervention '${id}' is outside the visual primitive grammar (DESIGN-ATLAS §2); ${profileLabel} has no intervention mark`;

  const outcomeReason = (): string =>
    `not drawn: outcome is a declared summary/end-world claim, not a visual primitive; ${profileLabel} does not render it`;

  // --- groups -----------------------------------------------------------------
  const worldItems: CoverageItem[] = facts.worlds.map(w => {
    const d = done('world', w.id);
    return {
      kind: 'world' as const,
      id: w.id,
      label: `${w.id} (${w.kind}${w.spanLabel ? ` · ${w.spanLabel}` : ''})`,
      drawn: !!d,
      reason: d ? d.reason : worldReason(w.id),
    };
  });

  const agentItems: CoverageItem[] = facts.agents.map(a => {
    const d = done('agent', a.id);
    return {
      kind: 'agent' as const,
      id: a.id,
      label: a.label ?? a.id,
      drawn: !!d,
      reason: d ? d.reason : agentReason(a.id),
    };
  });

  const eventItems: CoverageItem[] = facts.events.map(ev => {
    const d = done('event', ev.id);
    return {
      kind: 'event' as const,
      id: ev.id,
      label: ev.label ?? ev.id,
      drawn: !!d,
      reason: d ? d.reason : eventReason(ev.id),
    };
  });

  const edgeKinds = [...new Set(facts.edges.map(e => e.kind))].sort((a, b) => {
    const ia = EDGE_KIND_ORDER.indexOf(a);
    const ib = EDGE_KIND_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const edgeGroups: CoverageGroup[] = edgeKinds.map(k => {
    const items: CoverageItem[] = facts.edges.filter(e => e.kind === k).map(e => {
      const d = done('edge', e.id);
      return {
        kind: 'edge' as const,
        id: e.id,
        label: e.label ?? e.relation ?? e.id,
        edgeKind: e.kind,
        relation: e.relation,
        drawn: !!d,
        reason: d ? d.reason : edgeReason(e),
      };
    });
    return group('edge', k, items, k);
  });

  const interventionItems: CoverageItem[] = facts.interventions.map(iv => {
    const d = done('intervention', iv.id);
    return {
      kind: 'intervention' as const,
      id: iv.id,
      label: iv.notes ?? iv.id,
      drawn: !!d,
      reason: d ? d.reason : interventionReason(iv.id),
    };
  });

  const groups: CoverageGroup[] = [
    group('world', 'worlds', worldItems),
    group('agent', 'agents', agentItems),
    group('event', 'events', eventItems),
    ...edgeGroups,
    group('intervention', 'interventions', interventionItems),
  ];

  if (facts.outcome) {
    const d = done('outcome', 'outcome');
    const item: CoverageItem = {
      kind: 'outcome',
      id: 'outcome',
      label: facts.outcome.summary ?? (facts.outcome.endWorldRefs?.join(', ') ?? 'outcome'),
      drawn: !!d,
      reason: d ? d.reason : outcomeReason(),
    };
    groups.push(group('outcome', 'outcome', [item]));
  }

  const allItems = groups.flatMap(g => g.items);
  const totals = {
    declared: allItems.length,
    drawn: allItems.filter(i => i.drawn).length,
    notDrawn: allItems.filter(i => !i.drawn).length,
  };
  return { storyId: facts.storyId || '(unnamed)', profileId, profileLabel, groups, totals };
}

/** Deterministic, human-readable rendering of a coverage report. */
export function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push(`coverage: ${report.storyId} — ${report.profileId} (${report.profileLabel})`);

  let inEdges = false;
  for (const g of report.groups) {
    if (g.kind === 'edge') {
      if (!inEdges) { lines.push('  edges'); inEdges = true; }
      lines.push(`    ${g.edgeKind ?? g.label} (${g.drawn} drawn, ${g.notDrawn} not drawn)`);
      for (const it of g.items) {
        const rel = it.relation && it.relation !== it.id ? ` (${it.relation})` : '';
        lines.push(`      ${it.drawn ? '[drawn]' : '[not drawn]'} ${it.id}${rel} — ${it.reason}`);
      }
    } else {
      inEdges = false;
      lines.push(`  ${g.label} (${g.drawn} drawn, ${g.notDrawn} not drawn)`);
      for (const it of g.items) {
        lines.push(`    ${it.drawn ? '[drawn]' : '[not drawn]'} ${it.id} — ${it.reason}`);
      }
    }
  }

  const summary = KIND_ORDER.flatMap(kind => {
    const items = report.groups.filter(g => g.kind === kind).flatMap(g => g.items);
    if (!items.length) return [];
    const drawn = items.filter(i => i.drawn).length;
    const notDrawn = items.length - drawn;
    if (kind === 'outcome') return [`outcome ${drawn}/${items.length} drawn`];
    return [`${kind}s ${drawn}/${items.length} drawn — ${notDrawn} ${kind}s not drawn`];
  });
  lines.push(`  summary: ${summary.join(' · ')}`);
  return lines.join('\n');
}
