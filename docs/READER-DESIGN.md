# Timelines: implementation contract

The product explains a story to a reader. Its primary document is an authored guide: a question, selected moments, an explicit reading path and an answer. The ontology remains a research archive and import source. It is not a prerequisite for writing or reading a guide.

This implementation follows the design review of renderer revision `f76a81c9d83e473b28d317e20b8ca95f33626155` and ontology revision `021e23d9c23d1fba5e5b7fdbc6400e6be1c949a2`.

## Reader experience

The library opens with readable questions, story titles, scope and spoiler information. A story opens with its premise, then an authored path through chapters and moments. The ending answers the opening question. Explicit before/after comparisons explain changes where useful.

At desktop widths, the selected moment has a companion explanation: two labelled endpoints and one directed relationship. A journey identifies the traveller; an influence explains a consequence; a reset explains what returns and what is retained. At phone widths, those connections appear in disclosures attached to their moments. Labels and direction carry meaning without dependence on colour. Source notes are available locally and collected at the end.

Selection works through numbered anchors, connection endpoints, Previous/Next buttons and scroll position. A URL records an explicitly selected event and optional view. View changes preserve the selected event when that view includes it; otherwise the reader receives a notice. The full default guide is rendered as HTML before JavaScript executes. Native links, source disclosures and reading remain available without JavaScript.

Optional alternate views are authored, not generated from record order. A journey is one named person's experienced sequence. A chronology is a sequence of groups in a named frame, with simultaneous or unspecified order inside a group. Equal spacing never measures elapsed time. An invalid optional view is unavailable while the default guide remains valid; repository builds reject invalid catalogued views so errors can be corrected before shipping.

## Content model

`src/content/story.ts` defines and validates format 2.0. The core is a story, optional people, events, and a guide. Sources, contexts, connections, comparisons and alternate views are optional capabilities. Authors do not select physics rule sets, topology patterns, branch states or identity relations.

| Field | Required meaning |
| --- | --- |
| `id`, `version`, `title` | Stable story identity and format version |
| `scope` | Work/edition and the strand this guide explains |
| `premise` | The question or difficulty facing the reader |
| `ending` | A direct answer, including uncertainty where appropriate |
| `events` | Stable IDs, short titles and complete explanatory text |
| `guide.chapters` | Explicit event references in the intended reading order |
| `people` | Names and introductions; aliases can be explained in prose |
| `connections` | Explicit journey, influence or reset with labelled endpoints |
| `comparisons` | Authored before/after statements supported by event references |
| `views` | Optional calendar groups or a person's experienced order |

Descriptions are plain text. HTML is escaped; sources become links only for HTTP(S) locators. Stable IDs are constrained so content cannot produce arbitrary output paths. A journey needs a real person who participates at both ends. No name match, graph degree or shared participant can create a connection automatically.

The model distinguishes an explanatory phase from a timestamp through ordinary wording. Groundhog Day's selected phases have no invented iteration count. Arrival's initial presentation of a vision is described separately from the later occurrence it reveals. Tenet's two experiences of one encounter remain separate beats with an explicit identity explanation. A date label alone never establishes a global chronology.

## Pilots and editorial scope

| Guide | Scope | Essential test |
| --- | --- | --- |
| Back to the Future | 1985 film; six beats | Two jumps and a changed homecoming |
| Groundhog Day | Representative stages | Experience accumulates without inventing day counts |
| Arrival | Louise's experience and future information | Perception is not silently treated as past occurrence |
| Tenet | Oslo encounter | Two experiences of one fight, with a later inverted return |
| Dark | Season 1 Mikkel/Michael strand | One life across two names and calendar periods |
| Primer | Basic box method | Operating interval and overlapping personal stages |
| Predestination | Central identity loop | Names and roles explained without multiplying people |

These are editorial drafts based on existing repository material. They have not been independently checked against every scene of the primary works. `content/catalog.json` therefore records source and reader review as pending. Preview builds work; `npm run build:release` fails until both reviews pass. A passing schema is never recorded as a source review.

## Author workspace and migration

`/edit.html` accepts a format 2.0 JSON file or a legacy ontology file. It supports editing, validation, guide preview, local draft recovery and download. This is a minimal document editor, not a visual graph editor. Browser storage is best-effort; downloading is the durable handoff.

A legacy import preserves the original document and a ledger for every event and edge. It extracts event text as candidate evidence. It leaves scope, premise, ending and guide empty, so imported material cannot pass validation as a finished explanation. Old relations never automatically become journeys, causes, chronology or identity claims.

Each pilot has a migration ledger in `content/migrations`. The source revision, file digest, record counts, every old event/edge ID, editorial disposition and new event references are recorded. Added explanatory beats are explicit. These ledgers show what was selected or omitted; they do not certify that overlapping source records are duplicate occurrences. The original ontology repository is unchanged.

Remaining corpus entries stay in the research archive. Migrate another work when there is an actual reader need: choose a scope, write the explanation, reconcile evidence, preview it, then source-check and reader-test it. Do not bulk-publish imported JSON.

## Delivery and exports

`web/build.mjs` writes the static library, story pages, story JSON, SVG explanations, author workspace and legacy viewer into `web/dist`. Paths are relative, so it supports a subdirectory host. Browser bundles import no Node runtime. There are no remote fonts, analytics or required third-party services.

Each moment has a self-contained SVG export with text, direction, story context and a scope/spacing note. Its height grows with its content. The reader has an A4 print stylesheet and a Print guide action. Full print proofing on target browsers remains a release check. SVG export is the local explanation, not a claim to draw every event in one chart.

The old CLI and design profiles remain available. The research viewer now defaults to Atlas rather than a profile that only draws the first world. Its ordering resolver accepts only explicit chronological constraints within a world, processes all predecessors correctly, and leaves isolated, partial and cyclic orders unresolved. Atlas reserves space above unresolved cards for their relationship routes and allows its assignment pass to settle before final verification.

## Acceptance and release checks

Automated checks cover reference failures, isolated optional-view errors, safe HTML/JSON/SVG rendering, repeated visits, migration accounting, import preservation and chronology regressions. The existing deterministic rendering and geometry suite remains in place.

Before changing catalog reviews to passed, complete these human checks for each pilot:

1. Check the stated edition and each causal/identity claim against the primary work. Add scene locators or reviewed notes; resolve contested claims explicitly.
2. Ask five readers unfamiliar with the ontology to explain the opening problem, the key time movement and the ending after reading. Record errors and revise the guide. No comprehension score is claimed by this implementation.
3. Verify keyboard focus, screen-reader order, 200% text zoom, 390px phone layout, reduced motion, and an actual printed A4/PDF result in the supported browser matrix.
4. Check a copied moment URL, invalid view fallback, JSON/SVG download, draft recovery and import-record download.
5. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build:release`. Deploy only the reviewed output.

Do not add new ontology categories or renderer profiles to solve an editorial problem. First try a better sentence, a better-selected event, an explicit comparison, or a more focused scope. Extend the content model only when a reader task cannot be expressed by the existing document.
