/**
 * render(req) -> ChartArtifact  (DESIGN-ATLAS §8 composition)
 * The ONLY place engine and design meet. Engine never imports design;
 * design never imports story parsing. Provenance flows through untouched.
 */
import type { RawStory } from './engine/index.ts';
import { indexAndResolve } from './engine/index.ts';
import { compileScene, auditReferencesAndTopology } from './engine/scene.ts';
import { assertInvariants } from './engine/invariants.ts';
import { getProfile, themeFor, registerProfile } from './design/registry.ts';
import { atlas } from './design/atlas.ts';
import { counterpoint } from './design/counterpoint.ts';
import { reveal } from './design/reveal.ts';
import { temporal } from './design/temporal.ts';
import { worldline } from './design/worldline.ts';

registerProfile(counterpoint);
registerProfile(reveal);
registerProfile(temporal);
registerProfile(worldline);
registerProfile(atlas);

/** The design profile registry, so a caller (CLI help, GUI) can enumerate profiles. */
export { listProfiles, getProfile } from './design/registry.ts';

export interface RenderRequest {
  story: RawStory;
  storyId?: string;
  profile: string;            // design profile id
}

export function render(req: RenderRequest) {
  const facts = indexAndResolve(req.story);
  facts.storyId = req.storyId ?? '';
  const scene = compileScene(facts, req.story);
  const audit = auditReferencesAndTopology(scene, req.story);
  const invariants = assertInvariants(scene);

  const profile = getProfile(req.profile);
  const affinityWarning = profile.topoAffinity.length > 0 && !profile.topoAffinity.includes(req.story.topologyPatternId)
    ? [{
        severity: 'warning' as const, code: 'TOPO_AFFINITY_MISMATCH',
        message: `design profile '${profile.id}' declares affinity for [${profile.topoAffinity.join(', ')}] but story topology is '${req.story.topologyPatternId}' (rendering anyway — declaration, not refusal)`,
      }]
    : [];

  const doc = profile.render(scene, themeFor(profile.id));
  return {
    doc,
    audit: { ...audit, issues: [...audit.issues, ...affinityWarning] },
    invariants,
    scene,
  };
}
