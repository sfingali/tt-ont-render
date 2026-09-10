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

// ---------------------------------------------------------------------------
// TEXT LAYER — description-primary node text.
//
// Corpus standard: every event carries a plain-English `description`, written
// for a reader who has not seen the work and knows no ontology vocabulary. The
// description is the node's PRIMARY text; the short `label` sits beneath it.
// Ids are never rendered, and neither is jargon: this layer only wraps and
// places whatever the encoding supplies.
//
// Everything here is pure, deterministic, measurement-free: a fixed advance
// width approximation (0.52em, Arial/Helvetica metrics), greedy word wrap.
// ---------------------------------------------------------------------------

/** Approximate advance width of the sans stack at `size` px. */
export function textWidth(s: string, size: number): number {
  return s.length * size * 0.52;
}

/**
 * Greedy word wrap to a character budget. Deterministic.
 * A single token longer than the budget is hard-split, so no one long word can
 * widen a column (and the whole canvas) by itself.
 */
export function wrapText(text: string, maxChars: number): string[] {
  const budget = Math.max(4, Math.floor(maxChars));
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = '';
  const push = (t: string) => { if (t) lines.push(t); };
  for (const raw of words) {
    const word = raw.length > budget
      ? raw.match(new RegExp(`.{1,${budget}}`, 'g'))!   // hard-split an over-long token
      : [raw];
    for (const w of word) {
      if (!line) { line = w; continue; }
      if (line.length + 1 + w.length <= budget) line += ` ${w}`;
      else { push(line); line = w; }
    }
  }
  push(line);
  return lines;
}

export interface TextRun {
  text: string;
  size: number;
  fill: string;
  family: string;
  /** y offset from the top of the block */
  dy: number;
}

export interface NodeTextBlock {
  runs: TextRun[];
  height: number;
  width: number;
  /** true when a finite maxDescLines budget forced a truncation mark */
  truncated: boolean;
}

export interface NodeTextOpts {
  wrapChars: number;
  descSize: number;
  labelSize: number;
  timeSize: number;
  /** finite budget => truncate with an ellipsis (honest, visible) */
  maxDescLines?: number;
  /** line advance as a multiple of descSize (default 1.28) */
  lineHeight?: number;
  gapAfterDesc?: number;
  gapAfterLabel?: number;
}

/**
 * Build an event's text block: plain-English description first, short label
 * beneath, encoded time label last in mono.
 */
export function nodeTextBlock(
  ev: { description?: string; label?: string; timeLabel?: string },
  theme: ThemeSpec,
  o: NodeTextOpts,
): NodeTextBlock {
  const lh = (o.lineHeight ?? 1.28) * o.descSize;
  const runs: TextRun[] = [];
  let y = 0;
  let truncated = false;

  const desc = (ev.description ?? '').trim();
  const label = (ev.label ?? '').trim();
  const primary = desc || label;
  // only a real description is wrapped/truncated; a bare label is short by nature
  const budget = desc ? (o.maxDescLines ?? Infinity) : 1;
  let lines = wrapText(primary, o.wrapChars);
  if (lines.length > budget) {
    lines = lines.slice(0, budget);
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[\s.,;:—-]+$/, '')}…`;
    truncated = true;
  }
  for (const t of lines) {
    runs.push({ text: t, size: o.descSize, fill: theme.ink, family: theme.fontSans, dy: y });
    y += lh;
  }

  if (desc && label && label !== desc) {
    y += o.gapAfterDesc ?? 5;
    // the label wraps to the same budget as the description: a long label must
    // not widen the column (and with it the whole canvas) on its own
    for (const t of wrapText(label, o.wrapChars)) {
      runs.push({ text: t, size: o.labelSize, fill: theme.muted, family: theme.fontSans, dy: y });
      y += o.labelSize * 1.35;
    }
  }
  if (ev.timeLabel) {
    y += o.gapAfterLabel ?? 2;
    runs.push({ text: ev.timeLabel, size: o.timeSize, fill: theme.accent, family: theme.fontMono, dy: y });
    y += o.timeSize * 1.2;
  }

  const height = y - lh + (runs.at(-1)!.size * 1.2);
  const width = Math.max(...runs.map(r => textWidth(r.text, r.size)), 0);
  return { runs, height: Math.max(height, lh), width, truncated };
}

/** Emit a text block as SVG. `top` is the block's top; the first baseline sits one ascent below. */
export function emitNodeText(
  b: NodeTextBlock,
  x: number,
  top: number,
  anchor: 'start' | 'middle' | 'end' = 'start',
): string {
  const a = anchor === 'start' ? '' : ` text-anchor="${anchor}"`;
  return b.runs
    .map(r => `<text x="${x}" y="${(top + r.dy + r.size * 0.9).toFixed(1)}"${a} font-family="${r.family}" font-size="${r.size}" fill="${r.fill}">${esc(r.text)}</text>`)
    .join('');
}
