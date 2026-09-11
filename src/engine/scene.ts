/**
 * ENGINE — semantic scene compilation + reference/topology audit.
 * compileScene produces the design-agnostic scene graph.
 * auditReferencesAndTopology reports (never repairs) structural problems.
 */
import type { Facts, SemanticScene, SceneNode, SceneEdge } from './types.ts';
import type { RawStory } from './index.ts';
import { causalDepth } from './index.ts';

function node(
  kind: SceneNode['kind'], id: string, label: string,
  prov: SceneNode['prov'], extra: Partial<SceneNode> = {}, data: Record<string, unknown> = {},
): SceneNode {
  return { kind, id, label, prov, data, ...extra };
}

export function compileScene(facts: Facts, story: RawStory): SemanticScene {
  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  const causal = causalDepth(story);
  const layers = causal.depth;
  if (causal.backEdges.length) {
    facts.issues.push({
      severity: 'info', code: 'CAUSAL_CYCLE',
      message: `${causal.backEdges.length} causal edge(s) close a cycle (${causal.backEdges.slice(0, 6).join(', ')}${causal.backEdges.length > 6 ? ', …' : ''}) — causal depth reports the longest acyclic path, cycles are not expanded`,
    });
  }

  // world bands (form per design; semantics fixed here)
  for (const w of facts.worlds) {
    nodes.push(node('worldBand', `world:${w.id}`, w.id, w.prov, { sourceId: w.id, worldRef: w.id }, {
      kind: w.kind, label: w.label, description: w.description, spanLabel: w.spanLabel,
      nestingDepth: w.nestingDepth, forkParent: w.forkParent,
      parentRef: w.parentRef, forkEventRef: w.forkEventRef, forkLabel: w.forkLabel,
      isOriginWorld: w.isOriginWorld, originWorldRef: w.originWorldRef, mirrorOf: w.mirrorOf,
      correspondenceKey: w.correspondenceKey, correspondenceMap: w.correspondenceMap,
      attractorFieldId: w.attractorFieldId, worldlineId: w.worldlineId,
    }));
  }

  // agent lanes — one per agent, with identity-group token data
  for (const a of facts.agents) {
    nodes.push(node('lane', `agent:${a.id}`, a.label ?? a.id, a.prov, { sourceId: a.id }, {
      identityGroup: a.identityGroup, continuityRole: a.continuityRole,
    }));
  }

  // event nodes
  for (const ev of facts.events) {
    nodes.push(node('eventNode', `event:${ev.id}`, ev.label ?? ev.id, ev.prov, { sourceId: ev.id, worldRef: ev.worldRef }, {
      type: ev.type, description: ev.description, timeLabel: ev.timeLabel, agents: ev.agents, order: ev.order,
      payload: ev.payload,
      causalLayer: layers.get(ev.id) ?? null,
    }));
  }

  // shelf for unresolved time
  const unresolved = facts.events.filter(e => !e.order);
  if (unresolved.length) {
    nodes.push(node('shelf', 'shelf:unresolved-time',
      `time not positioned (${unresolved.length})`,
      { status: 'derived', derivationRule: 'events with no encoded temporal ordering' },
      {}, { eventIds: unresolved.map(e => e.id) }));
  }

  // edges
  for (const e of facts.edges) {
    edges.push({
      kind: e.kind, id: e.id, from: e.from, to: e.to, label: e.label ?? e.relation, prov: e.prov,
    });
  }

  // synchronized-event columns: ONLY exact timeLabel equality across different worlds
  // (SEMANTIC_CONTRACT: equal-looking labels alone do NOT establish simultaneity —
  //  so the column is derived, labeled as label-match, never as asserted simultaneity.)
  const byTime = new Map<string, string[]>();
  for (const ev of facts.events) {
    if (!ev.timeLabel) continue;
    const arr = byTime.get(ev.timeLabel) ?? [];
    arr.push(ev.id); byTime.set(ev.timeLabel, arr);
  }
  for (const [tl, ids] of byTime) {
    const worldRefs = new Set(ids.map(id => facts.events.find(e => e.id === id)!.worldRef));
    if (ids.length > 1 && worldRefs.size > 1) {
      edges.push({
        kind: 'synchrony', id: `sync:${tl}`, from: ids[0], to: ids[1],
        label: `label match: "${tl}"`, prov: { status: 'derived', derivationRule: 'exact timeLabel equality across worlds (not asserted simultaneity)' },
      });
    }
  }

  const header = {
    causalNote: causal.backEdges.length
      ? `causal depth: longest acyclic causal path (derived) · ${causal.backEdges.length} edge(s) closing cycles not expanded`
      : 'causal depth: longest acyclic causal path (derived)',
    topologyLine: `Topology: ${facts.topologyPatternId}`,
    physicsLine: `Primary physics: ${facts.primaryRuleSetId}` +
      (facts.mixinRuleSetIds.length ? ` · Mixins: ${facts.mixinRuleSetIds.join(', ')}` : ''),
    evidenceLine: `Evidence status: ${facts.issues.some(i => i.severity === 'error') ? 'errors present' : 'see audit'}`,
  };

  return { facts, nodes, edges, header };
}

export function auditReferencesAndTopology(scene: SemanticScene, story: RawStory) {
  const issues = [...scene.facts.issues];
  const eventIds = new Set(story.events.map(e => e.id));
  const agentIds = new Set(story.agents.map(a => a.id));
  const worldIds = new Set(story.worlds.map(w => w.id));

  // topology pattern existence is delegated to the catalogue import at CLI level;
  // here we check structural coherence only.
  // Only UNRESOLVABLE endpoints are errors here. Type anomalies are advisory
  // warnings raised in indexAndResolve — the ontology validator owns type law.
  const knownIds = new Set([...eventIds, ...agentIds, ...worldIds]);
  for (const e of story.edges) {
    if (!knownIds.has(e.from) || !knownIds.has(e.to)) {
      issues.push({ severity: 'error', code: 'EDGE_BAD_ENDPOINT', message: `edge ${e.id} (${e.kind}) references unknown entity`, sourceId: e.id });
    }
  }

  // duplicate edge ids
  const seen = new Set<string>();
  for (const e of story.edges) {
    if (seen.has(e.id)) issues.push({ severity: 'warning', code: 'DUP_EDGE_ID', message: `duplicate edge id ${e.id}`, sourceId: e.id });
    seen.add(e.id);
  }

  // events in unknown worlds already flagged in indexAndResolve.
  // NOTE: type anomalies (e.g. event→event identity) are ADVISORY warnings raised in
  // indexAndResolve — the ontology validator owns type law; we only report.

  return {
    issues,
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    byId: (id: string) => issues.filter(i => i.sourceId === id),
  };
}
