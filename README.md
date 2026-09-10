# tt-ont-render

**Deterministic visual compiler for the [time-travel ontology](https://github.com/sfingali/time-travel-ontology).**

[![CI](https://github.com/sfingali/tt-ont-render/actions/workflows/ci.yml/badge.svg)](https://github.com/sfingali/tt-ont-render/actions/workflows/ci.yml)

Takes a validated `StoryEncoding` — worlds, agents, events, edges — and compiles it into a chart.
Pure functions, no clocks, no randomness, no I/O: the same input always produces byte-identical output.

**Zero runtime dependencies.** three.js is pinned by importmap inside the HTML the 3D profile emits.

| Design profile | Medium | Designed for | Draws |
|---|---|---|---|
| `counterpoint` — Counterpoint Score | 2D SVG | `inverted_single_timeline`, `single_fixed_timeline` | one world band, agent lanes as staves |
| `reveal` — Reveal Atlas | 2D SVG | `single_fixed_timeline` | one world band, terraces by causal depth |
| `temporal` — Temporal Section | 2.5D SVG | `origin_plus_twins`, nested worlds | every world, as stacked planes |
| `worldline` — Worldline Loom | 3D HTML | `worldline_bundle`, `single_fixed_timeline` | every world, time-resolved events only |

`topoAffinity` is advisory. A profile rendering a topology outside its affinity is a **declared warning**, never a refusal.
Because `counterpoint` and `reveal` are single-world grids, a multi-world story raises
`TOPO_AFFINITY_MISMATCH` and only its first world is drawn — use `temporal` or `worldline` for those.

---

## Quick start

Node **20+**.

```bash
npm install

npm test                 # 71 checks: determinism, invariants, seam, provenance, node text
npm run typecheck

npx tsx src/cli.ts --story tenet       --profile counterpoint --out out/tenet.svg
npx tsx src/cli.ts --story arrival     --profile reveal       --out out/arrival.svg
npx tsx src/cli.ts --story dark        --profile temporal     --out out/dark.svg
npx tsx src/cli.ts --story steins-gate --profile worldline    --out out/steins-gate.html
```

The CLI exits `2` on invariant violations — it never silently renders a broken scene.
It prints the audit: unrecoverable problems are errors, advisory anomalies are warnings.

### Where stories come from

`--story` takes a bare name (`tenet`) or any path containing a `/`. The corpus is resolved in this order:

1. `--instances <dir>`
2. `$TT_ONT_INSTANCES`
3. `../tt-ont/instances` — the sibling ontology repo, if checked out alongside
4. `./fixtures` — the vendored subset committed here (tenet, steins-gate, dark, arrival)

`npm test` loads from `fixtures/` (or `$TT_ONT_INSTANCES`) the same way, so the suite runs standalone.

---

## Node text: the description leads

Every event in the corpus carries a plain-English `description`, written for a reader who has not seen
the work and knows no ontology vocabulary. **That description is the node's primary text**; the short
`label` sits beneath it, and the encoded `timeLabel` last in mono. Ids are never rendered, and a long
word is never allowed to widen a column.

This is a rendering contract, not a style choice: chart text is prose a person can read, not a dump of
ontology terms. `src/design/registry.ts` holds the whole text layer — `wrapText`, `nodeTextBlock`,
`emitNodeText` — and it is measurement-free: a fixed 0.52em advance estimate and greedy word wrap, so
layout stays deterministic across machines.

## The seam

The one architectural decision that everything else depends on:

```
src/engine/   semantic, design-agnostic       src/design/   aesthetic grammars
────────────                                 ────────────
index + resolve → Facts (provenance)          pure (scene, theme) → SVG / HTML
scene graph, audits, invariants               counterpoint · reveal · temporal · worldline
```

- `src/engine/` must **never** import from `src/design/`. A test walks the engine directory and fails if it does.
- `src/render.ts` is the only place the two meet, and it is ~50 lines long.
- A design profile receives only the `SemanticScene`. It cannot re-interpret the ontology: every visual assertion it makes carries provenance the engine computed.

### Ordering is asserted, not assumed

- An event's position comes **only** from encoded `temporal` edges within its world. Ordinal = position in that walk.
- Events on no temporal chain get `order = null` and land on a visible **"time not positioned"** shelf. Gaps stay visible; nothing is invented.
- Nesting depth derives **only** from encoded `nestsWithin` world relations.
- **Causal depth is a longest acyclic path.** Causal graphs here are frequently cyclic — a bootstrap knot is a cycle by definition — so a naive relaxation never converges (Tenet inflated to depth 17,116). Back edges are not expanded, the count is reported as an audit issue, and every chart that uses causal depth states the derivation on its face.
- Causal layering is a *derived, labeled* signal. It is never passed off as chronology.

Every assertion carries one of four statuses: `declared` (a catalogue id) · `encoded` (present in the JSON) · `derived` (a documented deterministic rule) · `unresolved` (the data does not establish it — render the gap).

### How each profile places text

- `counterpoint` — four text bands, two above the staves and two below, staggered. Column width comes from the wrap budget, so a dense story makes a wider score, never smaller type.
- `reveal` — the terrace *is* the text: its height is set by the description, and the caption hangs beneath it.
- `temporal` — text is a callout outside its plane, tied to its dot by a leader line (the axonometric convention). Planes are spaced by the text height as well as their own depth, so no callout lands on the plane above.
- `worldline` — one screen-facing panel per event, alternating above and below the bead. Panels are 3D sprites: orbiting separates them, and crowded views overlap by nature of the medium.

---

## Contract

The renderer implements the primitive-to-form grammar and the composition rules of **[DESIGN-ATLAS.md](https://github.com/sfingali/time-travel-ontology/blob/main/docs/DESIGN-ATLAS.md)** in the ontology repo (§2 worlds/events/edges grammar, §8 composition). The ontology stays the source of truth: `worlds[].kind` selects the world primitive, `topologyPatternId` selects the composition, and **only encoded relationships become connections** — shared labels, proximity and shared event participation establish nothing.

No LLM participates in runtime semantic interpretation. The four design grammars were authored as prose design briefs, then implemented here as deterministic profiles that obey the atlas.

---

## Layout

```
src/engine/     facts resolution, scene graph, audits, invariants (design-agnostic)
src/design/     profile registry, text layer, four aesthetic grammars
src/render.ts   render(request) — the only engine↔design meeting point
src/cli.ts      command line
tests/run.ts    correctness suite (71 checks)
fixtures/       vendored corpus subset for standalone tests
examples/       committed renders (SVG + HTML; PNGs are build products)
```

## Examples

`examples/` holds vector output only — diffable, no rasterised build products. Rasterise with any SVG
tool (`cairosvg`, `rsvg-convert`, a browser); the 3D profile needs a WebGL-capable browser.

## Licence

MIT
