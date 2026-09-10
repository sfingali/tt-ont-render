# tt-ont-render

**Deterministic visual compiler for the [time-travel ontology](https://github.com/sfingali/time-travel-ontology).**

[![CI](https://github.com/sfingali/tt-ont-render/actions/workflows/ci.yml/badge.svg)](https://github.com/sfingali/tt-ont-render/actions/workflows/ci.yml)

Takes a validated `StoryEncoding` — worlds, agents, events, edges — and compiles it into a chart.
Pure functions, no clocks, no randomness, no I/O: the same input always produces byte-identical output.

**Zero runtime dependencies.** three.js is pinned by importmap inside the HTML the 3D profile emits.

| Design profile | Medium | Designed for |
|---|---|---|
| `counterpoint` — Counterpoint Score | 2D SVG | `inverted_single_timeline`, `single_fixed_timeline` |
| `reveal` — Reveal Atlas | 2D SVG | `single_fixed_timeline` |
| `temporal` — Temporal Section | 2.5D SVG | `origin_plus_twins`, nested worlds |
| `worldline` — Worldline Loom | 3D HTML | `worldline_bundle`, `single_fixed_timeline` |

`topoAffinity` is advisory. A profile rendering a topology outside its affinity is a **declared warning**, never a refusal.

---

## Quick start

Node **20+**.

```bash
npm install

npm test                 # determinism, invariants, seam, provenance honesty
npm run typecheck

npx tsx src/cli.ts --story tenet       --profile counterpoint --out out/tenet.svg
npx tsx src/cli.ts --story arrival     --profile reveal       --out out/arrival.svg
npx tsx src/cli.ts --story dark        --profile temporal     --out out/dark.svg
npx tsx src/cli.ts --story steins-gate --profile worldline    --out out/steins-gate.html
```

The CLI exits `2` on invariant violations — it never silently renders a broken scene.

### Where stories come from

`--story` takes a bare name (`tenet`) or any path containing a `/`. The corpus is resolved in this order:

1. `--instances <dir>`
2. `$TT_ONT_INSTANCES`
3. `../tt-ont/instances` — the sibling ontology repo, if checked out alongside
4. `./fixtures` — the vendored subset committed here (tenet, steins-gate, dark, arrival)

`npm test` loads from `fixtures/` (or `$TT_ONT_INSTANCES`) the same way, so the suite runs standalone.

---

## The seam

The one architectural decision that everything else depends on:

```
src/engine/   semantic, design-agnostic       src/design/   aesthetic grammars
────────────                                 ────────────
index + resolve → Facts (provenance)          pure (scene, theme) → SVG / HTML
scene graph, audits, invariants               counterpoint · reveal · temporal · worldline
```

- `src/engine/` must **never** import from `src/design/`. A test walks the engine directory and fails if it does.
- `src/render.ts` is the only place the two meet, and it is 49 lines long.
- A design profile receives only the `SemanticScene`. It cannot re-interpret the ontology: every visual assertion it makes carries provenance the engine computed.

### Ordering is asserted, not assumed

- An event's position comes **only** from encoded `temporal` edges within its world. Ordinal = position in that walk.
- Events on no temporal chain get `order = null` and land on a visible **"time not positioned"** shelf. Gaps stay visible; nothing is invented.
- Nesting depth derives **only** from encoded `nestsWithin` world relations.
- Causal-path layering (`causalLayers()`) is a separate, *labeled* signal. It is never passed off as chronology.

Every assertion carries one of four statuses: `declared` (a catalogue id) · `encoded` (present in the JSON) · `derived` (a documented deterministic rule) · `unresolved` (the data does not establish it — render the gap).

---

## Contract

The renderer implements the primitive-to-form grammar and the composition rules of **[DESIGN-ATLAS.md](https://github.com/sfingali/time-travel-ontology/blob/main/docs/DESIGN-ATLAS.md)** in the ontology repo (§2 worlds/events/edges grammar, §8 composition). The ontology stays the source of truth: `worlds[].kind` selects the world primitive, `topologyPatternId` selects the composition, and **only encoded relationships become connections** — shared labels, proximity and shared event participation establish nothing.

No LLM participates in runtime semantic interpretation. The four design grammars were authored as prose design briefs, then implemented here as deterministic profiles that obey the atlas.

---

## Layout

```
src/engine/     facts resolution, scene graph, audits, invariants (design-agnostic)
src/design/     profile registry + four aesthetic grammars
src/render.ts   render(request) — the only engine↔design meeting point
src/cli.ts      command line
tests/run.ts    correctness suite (43 checks)
fixtures/       vendored corpus subset for standalone tests
examples/       committed renders
```

## Examples

`examples/` holds the SVG and HTML output — vector, diffable, no rasterised build products.

## Licence

MIT
