import {
  availableViews,
  type Story,
  type StoryEvent,
} from "../content/story.ts";

export const escapeHtml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const e = escapeHtml;
export const eventAnchor = (id: string, occurrence = 0) =>
  `event-${id}${occurrence ? `-visit-${occurrence}` : ""}`;
export const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export const guideIds = (story: Story) =>
  story.guide.chapters.flatMap((c) => c.eventRefs);
const sourceMarkup = (story: Story, ids: string[]) =>
  ids
    .map((id) => {
      const s = story.sources?.find((x) => x.id === id);
      if (!s) return "";
      const url = /^https?:\/\//i.test(s.locator)
        ? `<a href="${e(s.locator)}" target="_blank" rel="noopener noreferrer">${e(s.title)}</a>`
        : `<strong>${e(s.title)}</strong> — ${e(s.locator)}`;
      return `<li>${url}${s.note ? `<p>${e(s.note)}</p>` : ""}</li>`;
    })
    .join("");

function eventMarkup(
  story: Story,
  event: StoryEvent,
  number: number,
  occurrence: number,
): string {
  const context = story.contexts?.find((c) => c.id === event.contextRef);
  return `<article class="beat" id="${eventAnchor(event.id, occurrence)}" data-event="${e(event.id)}">
    <a class="beat-number" href="#${eventAnchor(event.id, occurrence)}" aria-label="Moment ${number}: ${e(event.title)}">${String(number).padStart(2, "0")}</a>
    <div class="beat-copy">${event.whenLabel ? `<p class="when">${e(event.whenLabel)}</p>` : ""}<h3>${e(event.title)}</h3><p>${e(event.text)}</p>
    ${context ? `<details class="context-note"><summary>${e(context.label)}</summary><p>${e(context.explanation)}</p></details>` : ""}
    ${event.sourceRefs?.length ? `<details class="event-source"><summary>Source notes</summary><ul>${sourceMarkup(story, event.sourceRefs)}</ul></details>` : ""}
    ${(story.connections ?? []).some((c) => c.fromEvent === event.id || c.toEvent === event.id) ? `<details class="mobile-focus"><summary>Connections at this moment</summary>${renderFocus(story, event.id)}<a href="../../diagrams/${e(story.id)}/${e(event.id)}.svg" download>Download this explanation</a></details>` : ""}</div></article>`;
}

export function renderReading(story: Story, viewId = "guide"): string {
  const view = availableViews(story).find((v) => v.id === viewId);
  const seen = new Map<string, number>();
  let n = 0;
  const beats = (ids: string[]) =>
    ids
      .map((id) => {
        const event = story.events.find((ev) => ev.id === id);
        if (!event) return "";
        const occurrence = seen.get(id) ?? 0;
        seen.set(id, occurrence + 1);
        return eventMarkup(story, event, ++n, occurrence);
      })
      .join("");
  if (view?.kind === "chronology")
    return (
      `<div class="view-intro"><h2>${e(view.title)}</h2><p>${e(view.frame)}. Groups are in date order; gaps are not to scale. This differs from the order of the guide.</p></div>` +
      view.groups
        .map(
          (g, i) =>
            `<section class="chapter" id="chapter-${i + 1}"><header><span class="chapter-number">${String(i + 1).padStart(2, "0")}</span><h2>${e(g.label)}</h2></header>${g.eventRefs.length > 1 ? `<p class="group-note">${g.withinGroup === "simultaneous" ? "These occurrences are simultaneous in this frame." : "The order within this group is not specified."}</p>` : ""}${beats(g.eventRefs)}</section>`,
        )
        .join("")
    );
  if (view?.kind === "journey")
    return `<section class="chapter"><header><h2>${e(view.title)}</h2></header><p>In ${e(story.people?.find((p) => p.id === view.personRef)?.name)}’s experienced order.</p>${beats(view.eventRefs)}</section>`;
  return story.guide.chapters
    .map(
      (c, i) =>
        `<section class="chapter" id="chapter-${i + 1}"><header><span class="chapter-number">${String(i + 1).padStart(2, "0")}</span><h2>${e(c.title)}</h2></header>${c.introduction ? `<p class="chapter-intro">${e(c.introduction)}</p>` : ""}${beats(c.eventRefs)}</section>`,
    )
    .join("");
}

export function renderFocus(story: Story, eventId: string): string {
  const event = story.events.find((ev) => ev.id === eventId);
  if (!event) return "<p>Select a moment in the guide.</p>";
  const connections = (story.connections ?? []).filter(
    (c) => c.fromEvent === eventId || c.toEvent === eventId,
  );
  const blocks = connections
    .map((c) => {
      const from = story.events.find((ev) => ev.id === c.fromEvent)!,
        to = story.events.find((ev) => ev.id === c.toEvent)!;
      const kind =
        c.kind === "journey"
          ? "Journey"
          : c.kind === "reset"
            ? "Repeating point"
            : "Consequence";
      return `<section class="connection ${e(c.kind)}"><p class="connection-kind">${kind}</p><p class="connection-label">${e(c.label)}</p><div class="connection-path" role="group" aria-label="${e(c.label)}">
      <a href="#${eventAnchor(from.id)}" data-focus="${e(from.id)}"><span>${e(from.whenLabel || "Earlier in this explanation")}</span><strong>${e(from.title)}</strong></a>
      <span class="path-arrow" aria-hidden="true">${c.kind === "reset" ? "↶" : "↓"}</span>
      <a href="#${eventAnchor(to.id)}" data-focus="${e(to.id)}"><span>${e(to.whenLabel || "Connected moment")}</span><strong>${e(to.title)}</strong></a></div>
      ${c.kind === "reset" && c.retainedText ? `<p class="retained">${e(c.retainedText)}</p>` : ""}</section>`;
    })
    .join("");
  return `<p class="eyebrow">A closer look</p><h2>${e(event.title)}</h2>${blocks || `<p>${e(event.text)}</p>`}`;
}

export function renderEnding(story: Story): string {
  return `<section class="ending" id="ending"><p class="eyebrow">Where it leaves us</p><h2>The answer</h2><p class="ending-answer">${e(story.ending)}</p>${(story.comparisons ?? []).map((c) => `<section class="comparison"><h3>${e(c.title)}</h3>${c.rows.map((r) => `<div class="comparison-row"><h4>${e(r.subject)}</h4><div><span>Before</span><p>${e(r.beforeText)}</p></div><div><span>After</span><p>${e(r.afterText)}</p></div></div>`).join("")}</section>`).join("")}</section>`;
}

export function shell(
  title: string,
  body: string,
  root = "./",
  extraHead = "",
): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} — Timelines</title><meta name="color-scheme" content="light"><link rel="stylesheet" href="${root}reader.css"><link rel="icon" href="${root}favicon.svg">${extraHead}</head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="wordmark" href="${root}index.html">Timelines<span>Stories, made clear.</span></a><nav aria-label="Main"><a href="${root}index.html">Stories</a><a href="${root}edit.html">Edit a guide</a></nav></header>${body}<footer class="site-footer"><span>A good timeline starts with a good explanation.</span><a href="${root}legacy/index.html">Legacy research viewer</a></footer></body></html>`;
}

export function renderStoryPage(story: Story, draft = false): string {
  const views = availableViews(story),
    ids = guideIds(story),
    first = ids[0];
  const body = `<main id="main" class="story-page">${draft ? '<p class="preview-banner">Editorial preview · source and reader reviews pending</p>' : ""}<header class="story-heading"><p class="eyebrow">A story explained</p><h1>${e(story.title)}</h1><p class="premise">${e(story.premise)}</p><p class="story-meta">${e(story.scope)} <span>Full spoilers</span></p>
    ${story.people?.length ? `<details class="cast"><summary>Meet the people</summary><dl>${story.people.map((p) => `<div><dt>${e(p.name)}</dt><dd>${e(p.introduction ?? "")}</dd></div>`).join("")}</dl></details>` : ""}</header>
    <div class="reading-toolbar"><p>${e(story.guide.title)} <span>· ${ids.length} moments</span></p><div>${views.length ? `<label class="enhancement" hidden>Reading order <select id="view-select"><option value="guide">${e(story.guide.title)}</option>${views.map((v) => `<option value="${e(v.id)}">${e(v.title)}</option>`).join("")}</select></label>` : ""}<button type="button" class="enhancement" id="print" hidden>Print guide</button><a href="../../stories/${e(story.id)}.json" download>Story file</a></div></div>
    <p id="reader-notice" class="notice" role="status" hidden></p><div class="reading-layout"><div id="reading-content">${renderReading(story)}</div><aside class="focus-panel" aria-label="Connections for the selected moment"><div id="focus-content">${renderFocus(story, first)}</div><div class="step-controls enhancement" hidden><button id="previous" type="button">← Previous</button><button id="next" type="button">Next →</button></div><a id="diagram-download" href="../../diagrams/${e(story.id)}/${e(first)}.svg" download>Download this explanation</a></aside></div>
    ${renderEnding(story)}<section class="source-section"><h2>Sources & interpretation</h2><p>This guide selects the moments needed for its stated question. It is not an exhaustive plot record.</p><ul>${sourceMarkup(
      story,
      (story.sources ?? []).map((s) => s.id),
    )}</ul></section></main>
    <script type="application/json" id="story-data">${scriptJson(story)}</script><script type="module" src="../../reader.js"></script>`;
  return shell(story.title, body, "../../");
}

export function renderLibrary(stories: Story[], draft = false): string {
  return shell(
    "Stories",
    `<main id="main" class="library">${draft ? '<p class="preview-banner">Editorial preview · seven guides for source and reader review</p>' : ""}<header><p class="eyebrow">Read the story. Understand the time.</p><h1>A way through<br>the complicated bits.</h1><p class="library-intro">Clear, illustrated guides to stories that bend time. Follow a person, see what changes, and understand why it matters.</p></header><div class="library-label"><h2>Choose a story</h2><span>All guides contain spoilers</span></div><div class="story-list">${stories.map((s, i) => `<a class="story-card" href="read/${e(s.id)}/index.html"><span class="story-index">${String(i + 1).padStart(2, "0")}</span><div><h3>${e(s.title)}</h3><p>${e(s.premise)}</p><span class="card-meta">${e(s.scope)} · ${guideIds(s).length} moments</span></div><span aria-hidden="true" class="card-arrow">↗</span></a>`).join("")}</div></main>`,
  );
}

export function renderEditor(): string {
  return shell(
    "Edit a guide",
    `<main id="main" class="editor"><header><p class="eyebrow">Author workspace</p><h1>Start with the explanation.</h1><p>Choose a story file or paste a draft. Preview it as a reader will see it. Your work stays in this browser until you download it.</p></header><section class="editor-input"><label for="story-file">Open a story or legacy file</label><input id="story-file" type="file" accept=".json,application/json"><label for="draft">Story document</label><textarea id="draft" rows="18" spellcheck="false" placeholder="Paste a version 2.0 story document here"></textarea><div class="editor-actions"><button id="preview" type="button">Preview guide</button><button id="download-draft" type="button">Download draft</button><button id="download-ledger" type="button" hidden>Download import record</button><button id="restore" type="button" hidden>Restore saved draft</button></div><p id="editor-status" role="status"></p><ul id="editor-errors" role="alert"></ul></section><section id="editor-preview" aria-label="Draft preview"><p>The reader preview will appear here. Legacy imports are unreviewed candidates: write a scope, premise, ending and reading path before previewing them.</p></section></main><script type="module" src="editor.js"></script>`,
  );
}
