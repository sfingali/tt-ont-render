/**
 * DESIGN — profile registry.
 *
 * SEAM RULE: a DesignProfile receives ONLY the SemanticScene (engine output).
 * It must never re-interpret the ontology: every visual assertion it makes must
 * carry the provenance the engine computed. Designs are deterministic pure
 * functions: (scene, theme) -> SVG document. No clocks, no randomness, no I/O.
 */
import type { SemanticScene } from '../engine/types.ts';

export interface RenderDoc {
  doc: string;          // SVG markup (2d/2.5d) or full HTML (3d)
  medium: '2d-svg' | '2.5d-svg' | '3d-html';
  width: number;
  height: number;
  profileId: string;
}

export interface ThemeSpec {
  bg: string;
  ink: string;
  muted: string;
  accent: string;       // single accent (e.g. vermilion / apricot)
  secondary: string;    // deep blue / midnight blue
  lane: string;
  fontSerif: string;
  fontSans: string;
  fontMono: string;
}

export const THEME: ThemeSpec = {
  bg: '#f6f1e7', ink: '#26241f', muted: '#8a857a',
  accent: '#b6462e', secondary: '#1f3a5f', lane: '#5c584f',
  fontSerif: 'Georgia, serif', fontSans: 'Helvetica, Arial, sans-serif', fontMono: 'Menlo, Consolas, monospace',
};

const DARK_THEME: ThemeSpec = {
  bg: '#141a1c', ink: '#dee2dc', muted: '#88958f',
  accent: '#c0a17a', secondary: '#88ada4', lane: '#2a3434',
  fontSerif: 'Georgia, serif', fontSans: 'Helvetica, Arial, sans-serif', fontMono: 'Menlo, Consolas, monospace',
};

export function themeFor(profileId: string): ThemeSpec {
  return profileId === 'worldline' ? DARK_THEME : THEME;
}

export interface DesignProfile {
  id: string;
  label: string;
  medium: '2d-svg' | '2.5d-svg' | '3d-html';
  /** topologyPatternIds this aesthetic was designed for (advisory — mismatch is a declared warning, never a refusal) */
  topoAffinity: string[];
  render(scene: SemanticScene, theme: ThemeSpec): RenderDoc;
}

const REGISTRY = new Map<string, DesignProfile>();

export function registerProfile(p: DesignProfile): void {
  REGISTRY.set(p.id, p);
}

export function getProfile(id: string): DesignProfile {
  const p = REGISTRY.get(id);
  if (!p) throw new Error(`unknown design profile '${id}'. available: ${[...REGISTRY.keys()].join(', ')}`);
  return p;
}

export function listProfiles(): DesignProfile[] {
  return [...REGISTRY.values()];
}

/** Deterministic pseudo-layout helper shared by profiles (pure math, no state). */
export function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
