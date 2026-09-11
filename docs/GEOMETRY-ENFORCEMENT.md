# Geometry enforcement — integration spec

**Status:** draft for review. **Nothing in this document is implemented.**
**Scope:** `tt-ont-render` only. No source file is modified by this document.
**Sources:** `tt-ont/docs/DESIGN-ATLAS.md` (the law), and the `diagram-design` skill
(`cathrynlavery/diagram-design`, MIT) as the external source of the connector/label rule set.

---

## 0. Why this exists

Three rules this spec enforces are **already mandated** in `tt-ont/docs/DESIGN-ATLAS.md`
and have no implementation and no check:

| Design law | Where | Current state |
|---|---|---|
| "Crossings use small bridge gaps; only explicit junctions get dots." | §2, line 92 | **Not implemented.** `grep -rn "bridge\|hop\|arc\|sweep" src/design/*.ts` → 0 matches. Every current crossing is a bare overlap. |
| "Optimize crossings and label collisions under those hard constraints." | §7, step 7, line 239 | **Not implemented, not measured.** Nothing counts crossings or measures label-to-stroke clearance. |
| "Required invariants" (six listed) | §8, line 305 | Five are implemented in `src/engine/invariants.ts` and all five are *semantic*. The geometric half of the spec has no assertion anywhere. |

**Status at landing (`bf9413c`, the commit that introduced the `atlas` profile).** Defects and
line numbers below were **measured against the working tree as it stood before that commit**, so the
line references have drifted (`src/design/atlas.ts` grew from 613 to 1008 lines when the type floor
landed). The quoted code fragments are the durable reference — grep the fragment, not the number.
What changed since measurement:

| Defect | Status after landing |
|---|---|
| D1 — bounded channel slots | **Stands.** Now `((index % 5) - 2) * 9` at one site and still `* 8` at another; both below the 12px separation the rule set requires, and a sixth connector still recycles a slot. |
| D2 — paired stroke offset 2.6px | **Stands.** `const off = 2.6` unchanged. |
| D3/D4 — connector label clearance, no plate | **Largely addressed.** The landing added a collision-aware placer (`addFree(...)`, `edgeCandidates(...)`): labels now choose among candidate positions, and an independent audit found zero text-on-text collisions across dark, tenet, arrival and steins-gate. Labels are still unplated, so clearance to *strokes* is not proven by that check. |
| D5 — same heuristic in the edge router | **Stands** (the slot expression above is that heuristic). |
| D8 — no bridge gaps | **Stands.** Still zero `bridge`/`hop` implementation anywhere in `src/`. |
| D9 — README documents four profiles | **Fixed** in `bf9413c`. |
| Deliverable B — `src/verify-geometry.ts` | **Not built.** `tests/run.ts` now estimates text-box overlap, which covers part of it; crossing counts and stroke clearance are still unmeasured. |

**Original working-tree context (as written).** A review written against an uncommitted tree: last
commit was `6356dd8`, six tracked files carried uncommitted edits, and `src/design/atlas.ts` was
untracked. Both consequences it drew still hold for the items above that stand — they target newly
landed code, and fixing them now costs a fraction of fixing them once stories depend on the routing.

This spec is therefore **not new design law**. It is the enforcement layer for laws already
stated, plus the small set of concrete defects that enforcement immediately exposes.

It also imports one durable idea from `diagram-design` that you do not currently have:
*a verifier that is proven able to fail*. The skill ships one and it does not work — I
reproduced this: a diagram of mine passed `self_check.py` (`OK`) and `verify-geometry.py`
(`0 findings`) while 3 of its 7 arrow labels sat **12–23px** off their connector, against a
rule its own `SKILL.md` calls a hard fail. A gate that cannot fail is worse than no gate,
because it is trusted. §5 exists to prevent that here.

**Licence note:** the rule set below is restated in this project's own vocabulary. If any
phrasing is lifted verbatim from the skill, carry the MIT attribution in a comment header;
as written, no text is copied and no obligation attaches.

---

## 1. Scope

**In scope**
- `src/design/geometry.ts` — shared geometry + label primitives (new).
- `src/verify-geometry.ts` — a document-level geometry verifier (new).
- Negative fixtures + test blocks in `tests/run.ts`.
- Five concrete code fixes (D1–D9 in §2).
- CI step, npm scripts, README sync.

**Out of scope (explicitly)**
- **Determinism.** Identical input must keep producing byte-identical output. The existing
  test at `tests/run.ts` covers 5 profiles × 4 stories and must stay green.
- **The seam.** `src/engine/` stays design-agnostic and geometry-free. `SemanticScene`
  carries no coordinates and must not start. The verifier sits *outside* the seam and reads
  emitted documents, not scenes.
- **The coverage contract.** `RenderDoc.drawn` vs `Facts` reconciliation must produce
  identical results before and after. If a fix changes which ids are declared drawn, the fix
  is wrong.
- The `diagram-design` palette, its deletion/complexity budget (it fights your coverage
  contract), its importers (`.drawio`/`.mmd`/`.excalidraw` only — they cannot read your
  archived SVG/PNG references), and its 40-type taxonomy.
- **Layout algorithm changes.** `DESIGN-ATLAS` §8 names ELK.js for constrained placement;
  the profiles currently hand-place. That is a separate, much larger question and this spec
  does not touch it.

---

## 2. Verified defects this addresses

All line references are against the current working tree. Nothing here is inferred.

**D1 — Bounded channel heuristic, silently recycles slots.**
`src/design/atlas.ts:451`
```ts
const midX = a.x + dx / 2 + ((i % 5) - 2) * 8;
```
Five slots at 8px separation. A sixth `world_relation` reuses slot 1 — two connectors share
a vertical channel and one hides the other. 8px also sits below the 12px separation the rule
set requires. No warning is raised.

**D2 — Paired stroke offset is hardcoded and sub-minimum.**
`src/design/atlas.ts:453–454`: `const off = 2.6;` — the second world-relation stroke runs
2.6px from the first. Two connectors on one visual channel, distinguishable only at print
DPI.

**D3 — Connector label sits 3.4px from a stroke with no mask.**
`src/design/atlas.ts:458`
```ts
parts.push(svgText(midX + 6, (a.y + b.y) / 2 + (dy >= 0 ? -6 : 12), label, 9, theme.secondary, theme.fontSans));
```
Strokes at `midX` and `midX + 2.6`; text begins at `midX + 6`, i.e. **3.4px** from the second
stroke. `svgText` (`atlas.ts:70`) emits a bare `<text>` — no opaque plate behind it, so the
channel runs under the glyphs. Required clearance is 6–10px.

**D4 — Same pattern at eight more sites across four profiles.**

| Site | Anchor | Clearance to nearest stroke | Plate |
|---|---|---|---|
| `atlas.ts:458` | `midX + 6` | 3.4px | none |
| `atlas.ts:471` | `(a.x+z.x)/2 + 6`, `y-6` | ~6px / ~6px | none |
| `atlas.ts:482` | midpoint, `y-5` | ~5px | none |
| `atlas.ts:498` | `route.midX + 5`, `midY-4` | ~4px | none |
| `atlas.ts:499–501` | `route.midX + 5`, `midY+10` | ~3px | none |
| `atlas.ts:570` | `M.l + 8`, `y+2` | leader line passes through the text band | none |
| `temporal.ts:187` | `x + 6` beside a vertical dashed accent line | 6px (boundary) | none |
| `reveal.ts:137` | `(prevX+c.x)/2`, `c.y-16` | 6px (boundary) | none |

`atlas.ts:570` is the worst: `<line … y1=y y2=target.y stroke=accent>` is drawn from the same
origin the label sits on, so the leader crosses the label's lower third.

**D5 — The same heuristic again in the edge router.**
`src/design/atlas.ts:143`: `const midX = a.x + dx / 2 + ((index % 5) - 2) * 9;` — same bounded
slot re-use, different step size. Two independent copies of the same unsound idea is itself a
finding: the rule belongs in one shared function.

**D6 — `worldline` is not theme-wired.**
`src/design/worldline.ts` contains **zero** `theme.` references and 21 colour literals
across 16 lines (40, 61, 86, 91, 92, 94, 119, 120, 126, 129, 148, 156, 157, 174, 185, 186):
14 `#`-prefixed and 7 `0x`-prefixed, 11 distinct values — three.js background `0x141a1c`,
grid `0x2a3434`/`0x1c2426`, lane rails `0x44514d`, CSS custom props `--bg/--text/--muted/--line`.
Two of the `0x` values are three.js light colours (`0xffffff`, lines 91–92) and are legitimately
not theme values — the fix is 19, not 21. The rest already match `DARK_THEME`
(`registry.ts:68`), so this is palette duplication, not a different palette. Within it:
`worldline.ts:40` `color: wi % 2 === 0 ? '#88ada4' : '#c0a17a'` gives a bundle story **two**
alternating worldline colours regardless of world count.

**D7 — Inconsistent numeric rounding.**
`registry.ts:241` rounds `y` but not `x`. `atlas.ts:464–466` emits raw `${a.x}` in the
origin-reference path. Committed output carries artefacts like
`y1="465.40000000000003"` in `examples/tenet-counterpoint.svg`. Some attributes round to 1dp,
some do not, decided per call site.

**D8 — Bridge gaps are design law and do not exist.** See §0.

**D9 — README/profile drift.** `README.md` documents four profiles (`counterpoint`, `reveal`,
`temporal`, `worldline`). `tests/run.ts` iterates five, including `atlas`, and
`examples/dark-atlas.svg` ships. Confirm intent before editing — see Q4.

---

## 3. Deliverable A — `src/design/geometry.ts`

Shared, pure, no I/O, no clocks, no randomness. Determinism is preserved by construction: the
functions are total and order-independent.

```ts
/** Axis-aligned 3-segment route. r=0 (default) reproduces today's sharp corners exactly. */
export function orthoPath(a: Point, b: Point, opts?: { r?: number; channel?: number }):
  { d: string; segments: Segment[]; midX: number; midY: number };

/** Deterministic slot offsets for n parallel connectors sharing one channel. */
export function channelSlots(n: number, opts?: { minSep?: number; centre?: number }):
  { slots: number[]; overflow: number };   // minSep default 12

/** Opaque plate + text, guaranteed clear of every supplied stroke. */
export function labelPlate(text: string, x: number, y: number,
  opts: { size: number; fill: string; family: string; anchor?: 'start'|'middle'|'end';
          strokes: number[]; minGap?: number; bg: string }): { rect: string; text: string };

/** One rounding function for every emitted numeric attribute. */
export function fmt(n: number, opts?: { dp?: 0|1; snap?: number }): string;
```

Notes
- `orthoPath` returns its `segments`, so the verifier and `labelPlate` can query geometry
  rather than re-derive it. Today every profile reconstructs `midX`/`midY` inline.
- `channelSlots` **returns** `overflow` rather than throwing, so the profile can raise an
  `AuditIssue` — consistent with your "report, never repair" posture (`scene.ts:105`).
- `labelPlate` measures with `textWidth` (`registry.ts:122`) and emits a `fill: theme.bg`
  plate sized to the measured glyph box plus padding.
- `fmt` default is 1dp; `snap` is opt-in and off by default so no existing output moves
  unless a profile asks for it.

---

## 4. Deliverable B — `src/verify-geometry.ts`

**Input:** emitted documents — either paths on disk, or in-memory `RenderDoc.doc`.
**Extraction:** a minimal tolerant parser for `<line>`, `<path d>`, `<rect>`, `<circle>`,
`<ellipse>`, `<text>`, capturing attributes and document order. No DOM dependency, consistent
with the zero-runtime-dependency posture.

### Rules

| Id | Assertion | Tolerance | Would have caught |
|---|---|---|---|
| R1 | Every segment of every connector path is axis-aligned (H or V) | 0.5u | future profiles; guards the grammar |
| R2 | Two connectors sharing a channel run ≥12u apart, measured over their whole overlap | 0.5u | D1, D2, D5 |
| R3 | Every label anchored to a connector has an opaque plate, and ≥6u clearance from the nearest non-plate stroke | 0.5u | D3, D4 |
| R4 | No connector crosses a card/box rect it does not terminate on | 0.5u | atlas cards, world boxes |
| R5 | Two connectors that cross carry a bridge gap on the lower-priority one | geometric | D8 (§2 line 92) |
| R6 | Connectors sharing one edge of a card/box attach ≥12u apart | 0.5u | world headers, event cards |
| R7 | No emitted numeric attribute carries more than 1 decimal place | exact | D7 |
| R8 | Minimum final-size text, **gated behind `--text-min`** | — | see Q1 |

R8 ships disabled: `DESIGN-ATLAS` §7 Print rules, line 248, requires "minimum 9 pt
final-size body text", and
several atlas labels sit at 7.4–8.5 SVG units. Comparing those is only meaningful once the
px→pt mapping for the print profile is pinned down (Q1). Reporting it before then would be
noise, and noise is how a gate gets ignored.

### Output

Mirrors `auditReferencesAndTopology` (`scene.ts:105`) so it can be folded into the same
report:
```ts
{ findings: Array<{ rule: 'R1'|…; severity: 'info'|'warning'|'error';
                    file: string; line: number; measured: number; limit: number;
                    message: string }>; byRule: Record<string, number> }
```
Severity defaults to `error` for R1–R7. `warning` is the correct level for a channel that is
merely near capacity.

### CLI

```
npm run verify:geometry -- <path...>            # files
npm run verify:geometry -- --all                # compile every profile × fixture, then verify
npm run verify:geometry -- --story tenet --profile counterpoint
npm run verify:geometry -- --rule R3 --json
```
Exit `2` on any `error` finding — matching `src/cli.ts`, which already exits 2 rather than
rendering a broken scene. Exit `0` clean, `1` usage error.

`--all` is the important mode: it turns every (profile × story) pair into a gate input without
committing new artefacts.

---

## 5. Deliverable C — the gate must be proven able to fail

This is the part `diagram-design` got wrong, and it is the reason the verifier lands before
any fix.

- `tests/fixtures/violations/` — one small hand-written SVG per rule R1–R8, each violating
  **exactly one** rule and nothing else.
- A new block in `tests/run.ts`, using the existing `ok()` harness:
  1. for each violation fixture, the verifier reports **exactly that rule id** and no other;
  2. the verifier reports **zero** findings on `examples/*.svg`;
  3. the verifier reports zero findings on the in-memory output of all 5 profiles × 4
     stories — unless a finding is triaged as a known exception with an id and a reason
     recorded in this document's appendix.
- A fixture that produces no finding is a bug in the verifier, not a passing test.

---

## 6. Deliverable D — the code fixes

- **D-a — one channel allocator.** Replace both heuristics (`atlas.ts:143`,
  `atlas.ts:451`) with `channelSlots`. Deterministic slot assignment ordered by the edge
  iteration you already have, centred on the channel, ≥12u separation. On overflow, push
  `{ severity: 'warning', code: 'RELATION_CHANNEL_FULL', message: … }` onto `facts.issues`
  and widen the channel — never silently recycle a slot.
- **D-b — label plates.** Convert each D4 site to `labelPlate`. `temporal.ts:187` and
  `reveal.ts:137` are at exactly 6px and are included for consistency, not because they are
  currently broken.
- **D-c — `fmt()` everywhere**, including `registry.ts:241` (`x` as well as `y`) and the
  origin-reference path at `atlas.ts:464`. Any attribute deliberately left raw gets an
  explicit exemption in the fixture set, so R7 stays meaningful.
- **D-d — worldline theme wiring.** One source of truth for the 3D profile. three.js takes
  numeric colours, so the theme needs numeric variants or a documented converter beside
  `ThemeSpec`. World colours come from a deterministic palette indexed by world order —
  remove the `% 2` alternation. CSS custom props emitted from theme values.
- **D-e — README.** Add the missing profile row, or correct the tests. Intent first (Q4).

---

## 7. Acceptance criteria

1. `npm run typecheck`, `npm test`, `npm run build:web` all green.
2. The existing byte-identical determinism assertion still passes for all 5 × 4 pairs.
3. `npm run coverage` output is byte-identical before and after for every story.
4. `npm run verify:geometry -- --all` exits 0.
5. Each negative fixture produces exactly its rule id.
6. No file under `src/design/` other than `registry.ts` contains a hex literal — asserted in
   `tests/run.ts` using the existing `walk()` helper.
7. Committed artefact diffs are reviewed and listed. Decide regenerate vs freeze (Q3).
8. This work adds **no new** `src/engine/` changes. The engine already carries uncommitted
   edits (§0), so the criterion is a diff against the current working tree, not against
   `HEAD` — take a baseline before starting.

---

## 8. Sequencing

1. `fmt()` and its call sites — lowest risk, immediately visible in output.
2. `geometry.ts` + isolated unit tests. No callers yet, so nothing can regress.
3. `verify-geometry.ts` + violation fixtures. **Run in report-only mode against current
   output.** This is where the enumerated D-list in §2 is replaced by measured fact — expect
   the real count to differ from mine, and trust the run, not this document.
4. Triage: fix, or record as a known exception with an id.
5. D-a and D-b — the two atlas routing/label fixes, validated against a gate that is already
   proven able to fail.
6. D-d — worldline theme.
7. CI step (`npm run verify:geometry -- --all` after `npm test`), README, this document's
   status flipped to implemented.

The order is the point: **no routing change lands before the thing that measures routing
changes.**

---

## 9. Risks

- **Determinism.** All new code is pure; no ordering changes among emitted attributes. Held
  by the existing test, which is the reason it lands first in the sequence.
- **D-a is the only behavioural change** — it alters routing. It is deliberately late.
- **Seam.** Nothing in `src/engine/` changes. The verifier reads documents, not scenes.
- **Label metrics.** R3 depends on `textWidth` (`registry.ts:122`) matching the metrics used
  elsewhere. If it is an approximation, R3 measures an approximation (Q2).
- **Committed artefacts.** `examples/*.svg` and `out/*.png` are in the tree; routing and
  rounding changes will reflow them.
- **Scope creep.** ELK.js per `DESIGN-ATLAS` §8 is a real gap and is *not* in this spec.

---

## 10. Effort

| Item | Estimate |
|---|---|
| `geometry.ts` + unit tests | ~1 day |
| `verify-geometry.ts` + violation fixtures + test block | ~1.5–2 days |
| atlas fixes (D-a, D-b) | ~0.5 day |
| worldline theme (D-d) | ~0.5 day |
| CI, scripts, README, rounding sweep | ~0.25 day |

**~3.5–4 days to all-green**, two-thirds of it the verifier.

---

## 11. Open questions

- **Q1 — px→pt mapping.** What is the canonical SVG-unit to point conversion for the print
  profile? R8 cannot be enabled without it.
- **Q2 — Is `textWidth` authoritative** for label metrics, or an estimate? It decides whether
  R3's measurements are real.
- **Q3 — Regenerate `examples/*.svg` and `out/*.png`, or freeze them** and note the drift?
- **Q4 — Is `atlas` intended to be public and documented?** The README omits it.
- **Q5 — Accent discipline.** `theme.accent` currently carries five jobs across profiles
  (inverted chevrons, every encoded time label, fork connectors, junctions, `coda` tags). The
  ontology already models the two things worth marking — `FactIntervention` and
  `Facts.outcome`. Reserving accent for those and moving time labels to `muted` would give it
  a semantic role instead of a decorative one. **Not included in this spec's scope** — it
  changes every profile's appearance and is a design decision, not an enforcement one.

---

## Appendix A — where these rules come from

The rule set is stated in `diagram-design`'s `SKILL.md` §6 ("Mandatory connector rules",
six rules) and §9 (pre-output checklist), with per-type detail in
`references/type-architecture.md`. Restated for this project:

1. Connectors between off-axis points are orthogonal, with quarter-arc corners.
2. A label never sits on its connector — minimum gap, measured to the stroke.
3. Two connectors never share a stroke path or run for any segment on top of each other.
4. Connectors sharing one edge of a box get distinct attach points, fanned apart.
5. A connector does not pass behind a box that is not its source or destination.
6. A label's opaque plate must not be overlapped by anything painted after it.

Your `DESIGN-ATLAS` §2 line 92 already carries the crossing rule, and §7 step 7 already
requires collision optimisation. Rules 1–6 are the operational detail those two sentences
need in order to be checkable.

**The lesson, kept:** `diagram-design` states rule 2 as an automatic fail, ships
`scripts/verify-geometry.py`, and that verifier **cannot** detect a rule-2 violation — it only
checks plate-vs-node clipping. Its own checklist tells the agent to run it as the gate. This
spec's §5 exists so the same thing cannot happen here.

## Appendix B — how the D-list was measured

- Determinism/thresholds from reading the current tree (`atlas.ts`, `temporal.ts`,
  `reveal.ts`, `worldline.ts`, `registry.ts`, `engine/*`).
- Hex-literal counts from `grep -o '#[0-9a-fA-F]\{6\}'` per file; `worldline.ts` `theme.`
  count is zero by `grep -n "theme\."`.
- Clearance figures for D3/D4 are derived from the literal call-site offsets
  (`midX + 6` vs strokes at `midX` and `midX + 2.6`), not from a rendered measurement.
  Step 3 of the sequence replaces them with measured values; treat the table as a starting
  hypothesis, not evidence.
- §0's claim about the external verifier was reproduced: a diagram generated against that
  skill passed `self_check.py` (`OK`) and `verify-geometry.py`
  (`Summary: 1 file(s) checked, 0 finding(s)`), while three of its seven arrow labels were
  measured at 23.4px, 20.8px and 12.3px from their connector against a stated 6–10px rule.
