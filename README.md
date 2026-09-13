# Timelines

Readable guides to stories that bend time. Start with a person's problem, follow a small set of meaningful moments, and explain where the story leaves them.

The default site is an authored story reader. The original ontology renderer remains available at `/legacy/` and through the CLI.

## Run

Requires Node 20 or later.

```sh
npm ci
npm run typecheck
npm test
npm run serve:web
```

Open http://localhost:8099. `npm run build:web` creates a static preview in `web/dist`; it can be served under a subdirectory. `npm run build:release` additionally requires source and reader reviews to be recorded as passed in `content/catalog.json`.

## Write a guide

The seven editorial pilots are in `content/stories`. Begin with a title, scope, premise, ending and an explicit reading path. Add optional connections only when they explain something the reader needs to understand.

```json
{
  "version": "2.0",
  "id": "a-small-example",
  "title": "A message from tomorrow",
  "scope": "An original one-moment example",
  "premise": "What does Mira learn from the message?",
  "ending": "She knows the bridge will close tomorrow.",
  "events": [{
    "id": "message",
    "title": "Mira reads the warning",
    "text": "A message dated tomorrow warns Mira that the bridge will close."
  }],
  "guide": {
    "title": "Read the explanation",
    "chapters": [{ "title": "The warning", "eventRefs": ["message"] }]
  }
}
```

Use **Edit a guide** to open or paste a document, preview it, recover a local draft and download it. Opening legacy JSON extracts candidate descriptions and preserves the original with a migration ledger; it deliberately leaves the guide unwritten. Import success does not mean a guide is ready to publish.

The reader works as static HTML without JavaScript. JavaScript adds moment selection, optional authored reading orders and print controls. Phone layouts place connection details beside their moments. Each moment also has a downloadable SVG explanation.

## Where things live

| Location | Responsibility |
| --- | --- |
| `content/stories` | Authored explanations |
| `content/catalog.json` | Library and editorial release review |
| `content/migrations` | Record-by-record dispositions and pinned sources |
| `src/content` | Reader document contract and cautious legacy import |
| `src/reader` | Static HTML, interaction, author preview and SVG export |
| `web/reader.css` | Responsive reader and print styling |
| `src/engine`, `src/design` | Legacy ontology renderer |
| `tests` | Reader contracts and legacy regressions |

See [the reader design contract](docs/READER-DESIGN.md) for the implemented scope, content meanings, migration policy and release requirements. Older design documents describe the research viewer; they do not govern the new reader.

## Status

Seven pilot guides are implemented. An [editorial and source review](docs/SOURCE-AND-READER-REVIEW.md) records clarity fixes, limited creator/screenplay corroboration and the remaining scene checks. The [reader study kit](docs/READER-STUDY.md) is ready for actual comprehension sessions; none have been conducted. Both review flags remain pending for every guide. The remaining ontology corpus has not been bulk-converted into published guides.

## Legacy renderer

The existing `render` and `coverage` commands remain available. The web research viewer defaults to Atlas. Only explicitly chronological temporal edges can establish its calendar ordering; ambiguous and unconnected events are left unpositioned.

```sh
npm run render -- --help
npm run coverage -- --help
```

MIT license.
