# Timeline flow charts

The reader now has an optional **Timeline diagram** alongside the authored guide. It shows named timelines, selected moments, the points where new timelines split off, and named characters travelling between moments. **Export static diagram** saves a standalone HTML page. The diagram page also offers SVG download, zoom, a text version and Print / save PDF.

The seven pilots each include an explicitly authored diagram. Their existing scope determines what appears: some are calendar sequences, some follow a person’s experience, and Arrival follows the explanation of future knowledge. Each diagram states its reading frame. These diagrams do not invent parallel worlds for stories whose guide does not establish them. Source and reader reviews remain pending.

The library’s **Explore a branching timeline** link opens _The observatory door_, an original example. It demonstrates two pre-existing worlds, a new branch at a decision, and a traveller moving first into the existing other world and then into the new branch. It is an illustration of the notation, not a new film interpretation.

## Visual meaning

| Mark                                | Meaning                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Lane headed “Already exists”        | This timeline exists before the first depicted arrival. Its line starts below the lane heading.                                   |
| Lane headed “Begins at a split”     | Its line starts at its first moment, reached by an explicit split arrow. No line implies its existence before that point.         |
| Grey line with arrows               | The authored reading order within that lane, in the stated frame.                                                                 |
| Solid green arrow, numbered S1, S2… | A split starts a new timeline. It does not by itself move a character.                                                            |
| Dashed blue arrow, numbered T1, T2… | A named character travels. The destination may be the same timeline, a pre-existing other timeline, or an already-created branch. |
| Labelled moments                    | Reuse the guide’s event titles and date labels. Full descriptions are present in the text alternative.                            |

Line style, explicit labels and arrow direction supplement colour. The numbered key supplies the complete relationship descriptions and endpoint names. Rows are positions in an authored explanation: alignment does not establish simultaneity, and spacing does not measure elapsed time. A changed history is not automatically a coexisting branch.

## Authoring

When a source leaves the relationship between two sequences open, use `origin: "unspecified"` for the unresolved lane. It is labelled **Origin not established**; its line does not extend to the heading as though a pre-existing history had been established. A separate lane is not proof of a separate universe.

Use `kind: "sequence"` for a dotted purple **Reading order only** arrow, numbered R1, R2… . It connects the next part of an explanation without claiming travel, survival or creation of a world. It has no `personRef` and must point to a later reading row. Give its label the actual reason the connection is unresolved. An unspecified origin cannot receive a confirmed split arrow. Existing split and travel notation retains its original meaning.

In **Edit a guide**, load a story and choose **Add timeline diagram** to create a single-lane starting point in guide order. Then edit its names, frame and placements in the document. Use the downloadable branching example as a complete multi-lane template. Preview the draft to inspect the chart. **Export diagram page** and **Export diagram SVG** validate the current document, so edits cannot accidentally export an older preview.

There is no drag-and-drop graph editor in this increment. The existing document editor owns the chart alongside the prose, and a small optional field expresses the extra information. The ontology importer does not guess lanes, split points or destinations.

`flowchart` is optional in story format 2.0:

```json
{
  "title": "The crossing",
  "description": "Mira visits a world that already exists.",
  "frame": "Read down each lane; dates are given on the moments.",
  "timelines": [
    {
      "id": "home",
      "label": "Home",
      "description": "Mira’s starting world.",
      "origin": "existing"
    },
    {
      "id": "other",
      "label": "Other world",
      "description": "Exists before Mira arrives.",
      "origin": "existing"
    }
  ],
  "nodes": [
    { "id": "leave", "eventRef": "departure", "timelineRef": "home", "row": 0 },
    { "id": "arrive", "eventRef": "arrival", "timelineRef": "other", "row": 1 }
  ],
  "links": [
    {
      "id": "crossing",
      "kind": "travel",
      "from": "leave",
      "to": "arrive",
      "personRef": "mira",
      "label": "Mira enters the other world; her arrival does not create it."
    }
  ]
}
```

This is a field example, not a complete story file. The containing guide must declare person `mira` and events `departure` and `arrival`, with Mira participating at both endpoints. For a complete working file, use [the original example](../examples/branching-guide.json).

To draw a split, give the new lane `origin: "split"`, place its first node below the source node, and add one `kind: "split"` link from the parent moment to that first node. Supply a plain-language label. Do not add `personRef` to a split. If someone also travels, add a separate travel link with that person. The parent lane can continue with its own later moments.

`row` is a non-negative integer; only its order matters. Sparse row values are compacted in layout. Each lane can contain at most one node per row. The same guide event may be deliberately shown in different lanes using distinct node IDs; this placement does not prove those occurrences are identical. Explain the author’s meaning in the description.

## Validation and failure behaviour

The optional diagram has its own errors. A malformed diagram does not invalidate the prose guide; the reader omits its diagram links. The editor displays diagram errors while retaining access to the guide. Export of that invalid diagram is refused, and the site build rejects invalid diagrams in its input stories.

Checks include unique IDs, real guide-event references, valid lane references, distinct placements, a real traveller at both endpoints, and exactly one origin split for each new lane. An existing timeline rejects a creation arrow. A split must enter another lane’s first node below its source; this also prevents cyclic ancestry. Ordinary travel is allowed backwards and between any declared lanes. No relationship is inferred from matching people or event order.

The layout measures wrapped text conservatively and grows cards for longer labels. Connections use empty row gutters and separate tracks outside the lanes, with short arrival/departure legs in the inter-lane space. Travel arrows may cross lane lines; their dash pattern and key make them distinguishable. Dense diagrams can still have connector crossings. Start with a scoped explanation and fewer selected moments when the overall view becomes hard to follow.

## Static export

The build writes `read/<story-id>/timeline.html` and `timeline.svg`. Each HTML file includes its SVG, CSS, text explanation, source notes and small optional script for zoom, saving and printing. It has no required network requests, fonts, renderer service, CDN or sibling assets. It can be copied to another machine, opened as a local file or hosted by itself. Source citations remain ordinary external links.

The drawing and text remain readable without JavaScript. SVG download uses an embedded data URL. Saving the HTML from the reader uses the existing static file; saving from the editor creates a Blob from the same page renderer. The standalone page can also save its own current document. It retains review notices and full spoilers in exported copies.

A wide chart scrolls inside its own keyboard-focusable region on a phone. Fit width and zoom are optional controls; the text version remains available when fitting would make labels too small. The print stylesheet fits the complete SVG onto an A3 landscape page and puts the full text explanation afterwards. Large diagrams may need a larger paper size or SVG printing for readable diagram labels. Browser Print / save PDF uses the browser’s native print facility; no PDF service is required.

## Verification and remaining review

Automated tests cover every pilot, the multi-lane example, the split/existing distinction, invalid origins and endpoints, backwards travel, connector/card intersection, long labels, sparse rows, isolated optional errors, escaping and portable-page dependencies. The normal reader tests continue to run.

Browser checks should cover the diagram link, SVG and HTML export controls, zoom, phone scrolling, text links and the editor’s current-draft validation. Inspect a copied local HTML file with no site server dependency. Proof an actual print on the target browser before asserting print readiness for publication.

Add these questions to the reader study: “Which timeline begins at the split?”; “Which existed before the traveller arrived?”; “Does this arrow create a timeline or move a person?” Ask participants to identify the arrow and both endpoints without relying on colour. Keep their actual answers with the existing study records. No human comprehension results are claimed by this implementation.
