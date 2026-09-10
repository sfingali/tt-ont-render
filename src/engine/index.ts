/**
 * ENGINE — index + resolve a validated StoryEncoding into Facts.
 * Pure, deterministic, no design knowledge. Read-only over the story.
 *
 * Ordering policy (SEMANTIC_CONTRACT-compliant):
 *  - Within a world, an event's ordinal is resolved ONLY from encoded `temporal`
 *    edges among that world's events. Heads (in-degree 0) are walked in lexicographic
 *    order; ordinal = walk position. This is "temporal-chain order" — asserted
 *    orderings, NOT coordinate time.
 *  - Events on no temporal chain get order = null  ->  "time not positioned" shelf.
 *    causal-path layering is available to designs as an ADDITIONAL signal but is
 *    never substituted for unresolved time.
 */
import type { FactAgent, FactEdge, FactEvent, FactWorld, Facts, Provenance } from './types.ts';

export interface RawStory {
  topologyPatternId: string;
  primaryRuleSetId: string;
  mixinRuleSetIds?: string[];
  ruleSetIds?: string[];
  semanticReview?: unknown;
  outcome?: { summary?: string; endWorldRefs?: string[] };
  worlds: Array<{ id: string; kind: string; spanLabel?: string }>;
  agents: Array<{ id: string; label?: string; identityGroup?: string; continuityRole?: string }>;
  events: Array<{
    id: string; type: string; label?: string; agents?: string[];
    at?: { worldRef?: string; timeLabel?: string };
    payload?: Record<string, unknown>;
  }>;
  edges: Array<{ id: string; kind: string; from: string; to: string; relation?: string; label?: string }>;
  interventions?: Array<{ id: string; [k: string]: unknown }>;
  meta?: { title?: string; [k: string]: unknown };
}

/** causal-path layer (documented derivation; NOT chronology). */
export function causalLayers(story: RawStory): Map<string, number> {
  const layer = new Map<string, number>();
  const causal = story.edges.filter(e => e.kind === 'causal');
  const limit = story.events.length * Math.max(1, causal.length) + 10;
  let changed = true, iter = 0;
  while (changed && iter < limit) {
    changed = false; iter++;
    for (const e of causal) {
      const fromL = layer.get(e.from) ?? 0;
      const toL = layer.get(e.to);
      if (toL === undefined || fromL + 1 > toL) { layer.set(e.to, fromL + 1); changed = true; }
    }
  }
  return layer;
}

export function indexAndResolve(story: RawStory): Facts {
  const issues: Facts['issues'] = [];
  const worlds: FactWorld[] = [];
  const agents: FactAgent[] = [];
  const events: FactEvent[] = [];
  const edges: FactEdge[] = [];
  const enc = (id: string): Provenance => ({ status: 'encoded', sourceId: id });

  // ---- worlds -----------------------------------------------------------------
  const nestEdges = story.edges.filter(e => e.kind === 'world_relation' && e.relation === 'nestsWithin');
  // Encoding convention (dark.json wr5): FROM = the nested world, TO = the container.
  const nestDepth = new Map<string, number>();
  for (let guard = 0; guard < 20; guard++) {
    let changed = false;
    for (const e of nestEdges) {
      const child = (nestDepth.get(e.to) ?? 0) + 1;
      if (child > (nestDepth.get(e.from) ?? 0)) { nestDepth.set(e.from, child); changed = true; }
    }
    if (!changed) break;
  }
  const forkParent = new Map<string, string>();
  for (const e of story.edges) {
    if (e.kind === 'world_relation' && e.relation === 'forksFrom') forkParent.set(e.to, e.from);
  }
  for (const w of story.worlds) {
    const nested = nestEdges.some(e => e.from === w.id);
    worlds.push({
      id: w.id, kind: w.kind as FactWorld['kind'], spanLabel: w.spanLabel,
      nestingDepth: nested ? (nestDepth.get(w.id) ?? 0) : null,
      forkParent: forkParent.get(w.id) ?? null, prov: enc(w.id),
    });
    if (!['timeline', 'branch', 'parallel_world'].includes(w.kind)) {
      issues.push({ severity: 'error', code: 'WORLD_KIND_UNKNOWN', message: `world ${w.id} has unknown kind ${w.kind}`, sourceId: w.id });
    }
  }

  // ---- agents -------------------------------------------------------------------
  for (const a of story.agents) agents.push({ ...a, prov: enc(a.id) });

  // ---- edges --------------------------------------------------------------------
  // Referential integrity is an ERROR (unresolvable endpoint). Type policing is
  // ADVISORY ONLY: the ontology's own validator is the authority (it passes these
  // instances), and the corpus deliberately encodes e.g. event→event identity
  // (bootstrap/repetition) edges — DESIGN-ATLAS §9 (dkx1, bootstrap_causes).
  const eventIds = new Set(story.events.map(e => e.id));
  const agentIds = new Set(story.agents.map(a => a.id));
  const anything = new Set([...eventIds, ...agentIds, ...story.worlds.map(w => w.id)]);
  for (const e of story.edges) {
    if (!anything.has(e.from) || !anything.has(e.to)) {
      issues.push({ severity: 'error', code: 'EDGE_ENDPOINT_MISSING', message: `${e.kind} edge ${e.id} references unknown entity (${e.from} / ${e.to})`, sourceId: e.id });
      edges.push({ ...e, kind: e.kind as FactEdge['kind'], prov: enc(e.id) });
      continue;
    }
    if (e.kind === 'identity' || e.kind === 'family') {
      const cross = [e.from, e.to].filter(id => !agentIds.has(id));
      if (cross.length) {
        issues.push({ severity: 'warning', code: 'EDGE_TYPE_ANOMALY', message: `${e.kind} edge ${e.id} has non-agent endpoint(s): ${cross.join(', ')} (advisory — corpus may encode cross-type ${e.kind})`, sourceId: e.id });
      }
    } else if (e.kind !== 'world_relation') {
      const cross = [e.from, e.to].filter(id => !eventIds.has(id));
      if (cross.length) {
        issues.push({ severity: 'warning', code: 'EDGE_TYPE_ANOMALY', message: `${e.kind} edge ${e.id} has non-event endpoint(s): ${cross.join(', ')} (advisory)`, sourceId: e.id });
      }
    }
    edges.push({ ...e, kind: e.kind as FactEdge['kind'], prov: enc(e.id) });
  }

  // ---- events + per-world temporal-chain ordering --------------------------------
  const rawById = new Map(story.events.map(e => [e.id, e]));
  for (const ev of story.events) {
    const worldRef = ev.at?.worldRef ?? null;
    if (!worldRef || !story.worlds.some(w => w.id === worldRef)) {
      issues.push({ severity: 'error', code: 'EVENT_WORLD_MISSING', message: `event ${ev.id} has no resolvable worldRef`, sourceId: ev.id });
    }
    events.push({
      id: ev.id, worldRef: worldRef ?? '', type: ev.type, label: ev.label,
      timeLabel: ev.at?.timeLabel, agents: ev.agents ?? [], payload: ev.payload,
      order: null, prov: enc(ev.id),
    });
  }

  // temporal edges grouped by the world of their FROM endpoint
  const temporalInWorld = new Map<string, FactEdge[]>();
  for (const e of edges) {
    if (e.kind !== 'temporal') continue;
    const w = rawById.get(e.from)?.at?.worldRef;
    const w2 = rawById.get(e.to)?.at?.worldRef;
    if (w && w === w2) {
      const arr = temporalInWorld.get(w) ?? [];
      arr.push(e); temporalInWorld.set(w, arr);
    }
  }
  const byId = new Map(events.map(e => [e.id, e]));
  for (const [w, tedges] of temporalInWorld) {
    const succ = new Map<string, string[]>(); // keep multi-succ (chains may fork); deterministic order by id
    const indeg = new Map<string, number>();
    const worldEventIds = events.filter(e => e.worldRef === w).map(e => e.id);
    for (const id of worldEventIds) { indeg.set(id, 0); succ.set(id, []); }
    for (const t of tedges) {
      if (!succ.has(t.from) || !indeg.has(t.to)) continue;
      succ.get(t.from)!.push(t.to);
      indeg.set(t.to, (indeg.get(t.to) ?? 0) + 1);
    }
    const heads = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id).sort();
    let ordinal = 0;
    // BFS across chain forks, lexicographic among ready nodes, per walk
    const queue = [...heads];
    const seen = new Set<string>();
    while (queue.length) {
      queue.sort();
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const node = byId.get(cur);
      if (node) node.order = { ordinal, basis: 'temporal_edge', axisLabel: 'temporal-chain order (encoded temporal edges)' };
      ordinal++;
      for (const nx of succ.get(cur) ?? []) queue.push(nx);
    }
  }
  const unresolved = events.filter(e => !e.order);
  if (unresolved.length) {
    issues.push({
      severity: 'info', code: 'TIME_UNRESOLVED',
      message: `${unresolved.length}/${events.length} event(s) lack encoded temporal ordering — render on "time not positioned" shelf`,
    });
  }

  return {
    storyId: '',
    topologyPatternId: story.topologyPatternId,
    primaryRuleSetId: story.primaryRuleSetId,
    mixinRuleSetIds: story.mixinRuleSetIds ?? [],
    ruleSetIds: story.ruleSetIds ?? [story.primaryRuleSetId, ...(story.mixinRuleSetIds ?? [])],
    semanticReview: story.semanticReview,
    outcome: story.outcome,
    worlds, agents, events, edges,
    worldRelations: edges.filter(e => e.kind === 'world_relation'),
    issues,
  };
}
