/**
 * ENGINE — semantic scene-graph types + provenance contract.
 *
 * SEAM RULE (enforced by architecture):
 *  - This directory is DESIGN-AGNOSTIC: no palette, no geometry, no aesthetic
 *    decisions beyond the primitive-to-form grammar of DESIGN-ATLAS.md §2.
 *  - src/design/* may import from here. This directory must never import
 *    from src/design/*.
 *
 * Every visual assertion carries provenance:
 *   status: 'declared'    — asserted by a catalogue id (topology/rule), not localized
 *   status: 'encoded'     — directly present in the story JSON
 *   status: 'derived'     — computed by a documented, deterministic rule
 *   status: 'unresolved'  — the data does not establish it; render the gap, never fill it
 */

export type ProvStatus = 'declared' | 'encoded' | 'derived' | 'unresolved';

export interface Provenance {
  status: ProvStatus;
  sourceId?: string;
  sourcePath?: string;
  derivationRule?: string;
}

export interface AuditIssue {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourceId?: string;
}

export type WorldKind = 'timeline' | 'branch' | 'parallel_world';

export interface CorrespondenceFactEntry {
  localKey: string;
  remoteWorldRef: string;
  remoteKey: string;
  notes?: string;
}

export interface FactWorld {
  id: string;
  kind: WorldKind;
  label?: string;
  description?: string;
  spanLabel?: string;
  /** nesting depth derived ONLY from encoded nestsWithin world_relations (DESIGN-ATLAS §3/§9). */
  nestingDepth: number | null;
  /** parent from encoded forksFrom, if any. */
  forkParent: string | null;
  /** encoded branch parentRef, preserved for the atlas primitive grammar. */
  parentRef?: string;
  /** encoded event at which a branch forked, if supplied. */
  forkEventRef?: string;
  forkLabel?: string;
  draft?: boolean;
  isOriginWorld?: boolean;
  originWorldRef?: string;
  mirrorOf?: string;
  correspondenceKey?: string;
  correspondenceMap?: CorrespondenceFactEntry[];
  attractorFieldId?: string;
  worldlineId?: string;
  prov: Provenance;
}

export interface FactAgent {
  id: string;
  label?: string;
  identityGroup?: string;
  continuityRole?: string;
  homeWorldRef?: string;
  prov: Provenance;
}

/** Deterministic ordering basis. causal_path is NOT chronology and must be labeled as such. */
export type OrderBasis = 'temporal_edge' | 'causal_path';

export interface EventOrder {
  ordinal: number;          // 0-based within its world
  basis: OrderBasis;
  axisLabel: string;        // exact label the design must print on the axis
}

export interface FactEvent {
  id: string;
  worldRef: string;
  type: string;
  label?: string;
  /**
   * Plain-English description of what happens, written for a reader who has not
   * seen the work and knows no ontology vocabulary. This is the node's PRIMARY
   * text in every design; `label` is the short name that sits beneath it.
   */
  description?: string;
  timeLabel?: string;
  agents: string[];
  payload?: Record<string, unknown>;
  order: EventOrder | null; // null => unresolved time -> "time not positioned" shelf
  prov: Provenance;
}

export interface FactEdge {
  id: string;
  kind: 'causal' | 'temporal' | 'identity' | 'world_relation' | 'family' | 'intervention';
  from: string;
  to: string;
  relation?: string;
  label?: string;
  orderKind?: string;
  prov: Provenance;
}

/**
 * Intervention primitive from the story encoding.  Interventions are not part
 * of the visual primitive grammar (DESIGN-ATLAS §2), but the renderer must be
 * able to report honestly whether or not a profile drew one.
 */
export interface FactIntervention {
  id: string;
  /** target event, when the encoding declares one */
  eventId?: string;
  /** raw rule-effect payload; shape is owned by the ontology validator */
  ruleEffects?: unknown;
  notes?: string;
  [key: string]: unknown;
  prov: Provenance;
}

export interface Facts {
  storyId: string;                    // file stem
  topologyPatternId: string;          // declared, authoritative (never inferred)
  primaryRuleSetId: string;
  mixinRuleSetIds: string[];
  ruleSetIds: string[];
  semanticReview: unknown;
  outcome?: { summary?: string; endWorldRefs?: string[] };
  worlds: FactWorld[];
  agents: FactAgent[];
  events: FactEvent[];
  edges: FactEdge[];
  /** world_relation edges (from/to are world ids) */
  worldRelations: FactEdge[];
  /** declared intervention primitives, if the story encodes any */
  interventions: FactIntervention[];
  issues: AuditIssue[];
}

/** Semantic scene graph — the ONLY thing designs consume. */
export interface SceneNode {
  kind:
    | 'worldBand'        // a world container (form determined by design, semantics fixed here)
    | 'lane'             // agent lane (or sub-lane) inside a world band
    | 'eventNode'        // one encoded event
    | 'shelf'            // "time not positioned" holder
    | 'column'           // cross-world synchronized-event column (exact timeLabel match only)
    | 'annotation';      // physics seal / axis label / legend entry
  id: string;
  sourceId?: string;     // ontology id this node renders (event/agent/world/edge id)
  worldRef?: string;
  label: string;
  prov: Provenance;
  data: Record<string, unknown>;   // profile-specific, but provenance-bearing
}

export interface SceneEdge {
  kind: 'causal' | 'temporal' | 'identity' | 'world_relation' | 'family' | 'intervention' | 'synchrony' | 'presentation';
  id: string;
  from: string;          // SceneNode id
  to: string;
  label?: string;
  prov: Provenance;
}

export interface SemanticScene {
  facts: Facts;
  nodes: SceneNode[];
  edges: SceneEdge[];
  header: {
    topologyLine: string;
    physicsLine: string;
    evidenceLine: string;
    /** honest one-line statement of the causal-depth derivation, cycles included */
    causalNote: string;
  };
}
