#!/usr/bin/env tsx
/**
 * CLI: tsx src/coverage-cli.ts --story <name|path.json> [--instances <dir>]
 *
 * Renders the story under EVERY design profile and prints each profile's
 * declared coverage: worlds, agents, events, edges (grouped by kind),
 * interventions and the outcome, each marked drawn or not drawn with a reason.
 *
 * The report is produced from the same RenderDoc each profile returns, and
 * buildCoverageReport refuses any declaration that names an id the story does
 * not declare. It cannot print coverage for a source that was not resolved, and
 * not-drawn status is derived from the full Facts, not from the profile's
 * silence.
 *
 * Story resolution matches src/cli.ts:
 *   1. --instances <dir>
 *   2. $TT_ONT_INSTANCES
 *   3. ../tt-ont/instances   (sibling ontology repo)
 *   4. ./fixtures
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './render.ts';
import { listProfiles } from './design/registry.ts';
import { buildCoverageReport, formatCoverageReport } from './coverage.ts';
import type { RawStory } from './engine/index.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function corpusDir(): string {
  const explicit = arg('--instances') ?? process.env.TT_ONT_INSTANCES;
  if (explicit) return resolve(explicit);
  const sibling = resolve(REPO_ROOT, '..', 'tt-ont', 'instances');
  if (existsSync(sibling)) return sibling;
  return resolve(REPO_ROOT, 'fixtures');
}

const storyArg = arg('--story');
if (!storyArg) {
  console.error('usage: tsx src/coverage-cli.ts --story <instances/name|abs.json> [--instances <dir>]');
  process.exit(1);
}

const storyPath = storyArg.includes('/')
  ? resolve(storyArg)
  : resolve(corpusDir(), `${storyArg}.json`);

if (!existsSync(storyPath)) {
  console.error(`coverage: story not found: ${storyPath}`);
  process.exit(1);
}

const story = JSON.parse(readFileSync(storyPath, 'utf-8')) as RawStory;
const storyId = basename(storyPath).replace(/\.json$/, '');
const profiles = listProfiles();

console.log(`coverage report — ${storyId} (${storyPath})`);
console.log(`profiles: ${profiles.map(p => p.id).join(', ')}\n`);

let declaredTotal = 0;
let drawnTotal = 0;
let notDrawnTotal = 0;

for (const profile of profiles) {
  const { scene, doc } = render({ story, storyId, profile: profile.id });
  const report = buildCoverageReport(scene, doc);
  console.log(formatCoverageReport(report));
  console.log('');
  declaredTotal += report.totals.declared;
  drawnTotal += report.totals.drawn;
  notDrawnTotal += report.totals.notDrawn;
}

console.log(`all profiles: ${drawnTotal}/${declaredTotal} declared source ids drawn, ${notDrawnTotal} not drawn`);
