#!/usr/bin/env tsx
/**
 * CLI: tsx src/cli.ts --story <name|path.json> --profile <id> --out <path> [--instances <dir>]
 *
 * --story takes a bare name (tenet), looked up in the instance corpus, or any
 * path containing a '/'. The corpus is, in order of precedence:
 *   1. --instances <dir>
 *   2. $TT_ONT_INSTANCES
 *   3. ../tt-ont/instances   (the sibling ontology repo, checked out alongside)
 *   4. ./fixtures            (the vendored subset committed here)
 *
 * Exits 2 on invariant violations (never silently renders a broken scene).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function corpusDir(): string {
  const explicit = arg('--instances') ?? process.env.TT_ONT_INSTANCES;
  if (explicit) return resolve(explicit);
  const sibling = resolve(REPO_ROOT, '..', 'tt-ont', 'instances');
  if (existsSync(sibling)) return sibling;
  return resolve(REPO_ROOT, 'fixtures');
}
import { render } from './render.ts';
import { listProfiles } from './design/registry.ts';
import type { RawStory } from './engine/index.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const profileId = arg('--profile') ?? 'counterpoint';
const storyArg = arg('--story');
const outArg = arg('--out');

if (!storyArg || !outArg) {
  console.error(`usage: tsx src/cli.ts --story <instances/name|abs.json> --profile <${listProfiles().map(p => p.id).join('|')}> --out <file>`);
  process.exit(1);
}

const storyPath = storyArg.includes('/')
  ? resolve(storyArg)
  : resolve(corpusDir(), `${storyArg}.json`);

const story = JSON.parse(readFileSync(storyPath, 'utf-8')) as RawStory;
const storyId = basename(storyPath).replace(/\.json$/, '');

const t0 = Date.now();
const { doc, audit, invariants } = render({ story, storyId, profile: profileId });
const ms = Date.now() - t0;

mkdirSync(dirname(outArg), { recursive: true });
writeFileSync(outArg, doc.doc, 'utf-8');

const errors = audit.issues.filter(i => i.severity === 'error');
const warnings = audit.issues.filter(i => i.severity === 'warning');
console.log(`rendered ${storyId} [${profileId}] -> ${outArg} (${doc.doc.length} bytes, ${ms}ms, ${doc.medium})`);
console.log(`audit: ${errors.length} error(s), ${warnings.length} warning(s)`);
for (const i of [...errors, ...warnings].slice(0, 12)) console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
if (!invariants.ok) {
  console.error('INVARIANT VIOLATIONS:');
  for (const v of invariants.violations) console.error(`  - ${v}`);
  process.exit(2);
}
console.log('invariants: ok');
