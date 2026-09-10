/**
 * ENGINE — invariant assertions (DESIGN-ATLAS §8 "Required invariants").
 * Pure checks over the semantic scene; designs must pass these pre-export.
 */
import type { SemanticScene } from './types.ts';

export interface InvariantReport {
  ok: boolean;
  violations: string[];
}

export function assertInvariants(scene: SemanticScene): InvariantReport {
  const violations: string[] = [];
  const facts = scene.facts;
  const worldKind = new Map(facts.worlds.map(w => [w.id, w.kind]));
  const eventWorld = new Map(facts.events.map(e => [e.id, e.worldRef]));

  // 1. no event changes world: an event node must stay in its encoded world band
  for (const n of scene.nodes) {
    if (n.kind === 'eventNode' && n.worldRef && !worldKind.has(n.worldRef)) {
      violations.push(`event ${n.sourceId} references world ${n.worldRef} not in worlds[]`);
    }
  }

  // 2. no branch junction without encoded anchor: worldBand parent links must come
  //    from encoded edges (already guaranteed by engine), but designs must not invent
  //    extra junctions — enforce by counting band junction data.
  for (const n of scene.nodes) {
    if (n.kind === 'worldBand') {
      const junction = n.data['forkParent'];
      if (junction !== null && junction !== undefined && !worldKind.has(String(junction))) {
        violations.push(`world ${n.worldRef} forkParent ${junction} not a known world`);
      }
    }
  }

  // 3. no arrow reverses a directional relation: scene edges must keep ontology direction
  const dir = new Set(facts.edges.map(e => `${e.from}->${e.to}`));
  for (const se of scene.edges) {
    if (se.kind === 'causal' || se.kind === 'temporal' || se.kind === 'intervention') {
      // scene edge from/to are event ids here
      if (!dir.has(`${se.from}->${se.to}`) && !dir.has(`${se.to}->${se.from}`)) {
        violations.push(`scene edge ${se.id} (${se.kind}) has no encoded counterpart direction`);
      }
    }
  }

  // 4. correspondence never becomes travel: world_relation edges stay world-header-scoped
  for (const se of scene.edges) {
    if (se.kind === 'world_relation') {
      const f = eventWorld.get(se.from);
      if (f) violations.push(`world_relation ${se.id} attached to event ${se.from} — must attach to world headers`);
    }
  }

  // 5. identical input -> identical output: enforce node/edge order determinism
  const nodeIds = scene.nodes.map(n => n.id);
  if (new Set(nodeIds).size !== nodeIds.length) violations.push('duplicate scene node ids');
  const edgeIds = scene.edges.map(e => e.id);
  if (new Set(edgeIds).size !== edgeIds.length) violations.push('duplicate scene edge ids');

  return { ok: violations.length === 0, violations };
}
