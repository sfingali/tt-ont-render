import { validateStory } from "../content/story.ts";
import { importLegacy, type ImportDraft } from "../content/import.ts";
import { escapeHtml, renderReading, renderEnding } from "./render.ts";
import {
  renderFlowPage,
  renderFlowSvg,
  renderFlowText,
  flowStyles,
} from "./flowchart.ts";

const draft = document.getElementById("draft") as HTMLTextAreaElement,
  status = document.getElementById("editor-status")!,
  errors = document.getElementById("editor-errors")!,
  preview = document.getElementById("editor-preview")!;
let imported: ImportDraft | undefined;
const key = "timelines-story-draft-v2";
function say(s: string) {
  status.textContent = s;
}
function download(content: string, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function save() {
  try {
    localStorage.setItem(key, JSON.stringify({ text: draft.value, imported }));
  } catch {
    say("Browser storage is unavailable. Download your draft to keep it.");
  }
}
function load(text: string) {
  try {
    const value = JSON.parse(text);
    if (value.version === "2.0") {
      draft.value = JSON.stringify(value, null, 2);
      imported = undefined;
      say("Story loaded. Preview it to check references and wording.");
    } else {
      imported = importLegacy(value);
      draft.value = JSON.stringify(imported.story, null, 2);
      say(
        "Legacy events imported as unreviewed candidates. Choose a reading path and write the scope, premise and ending. The original and migration record can be downloaded.",
      );
    }
    document.getElementById("download-ledger")!.hidden = !imported;
    errors.replaceChildren();
    save();
  } catch (error) {
    say(`The file was not loaded: ${(error as Error).message}`);
  }
}
document
  .getElementById("story-file")
  ?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) load(await file.text());
  });
draft.addEventListener("input", save);
document.getElementById("preview")?.addEventListener("click", () => {
  errors.replaceChildren();
  let value;
  try {
    value = JSON.parse(draft.value);
  } catch {
    say("The document is not valid JSON. Your draft is still here.");
    return;
  }
  const result = validateStory(value);
  const issues = [
    ...result.errors,
    ...Object.values(result.viewErrors).flat(),
    ...result.flowchartErrors,
    ...result.warnings,
  ];
  errors.innerHTML = issues
    .map(
      (i) =>
        `<li><strong>${escapeHtml(i.path)}</strong>: ${escapeHtml(i.message)}</li>`,
    )
    .join("");
  if (!result.story) {
    say(
      "Fix the listed fields to preview this guide. The previous preview has been kept.",
    );
    return;
  }
  preview.innerHTML = `<p class="eyebrow">Draft preview · full spoilers</p><h1>${escapeHtml(result.story.title)}</h1><p class="premise">${escapeHtml(result.story.premise)}</p><p>${escapeHtml(result.story.scope)}</p>${renderReading(result.story)}${renderEnding(result.story)}`;
  if (result.story.flowchart && !result.flowchartErrors.length)
    preview.insertAdjacentHTML(
      "beforeend",
      `<style>${flowStyles}</style><h2>Timeline diagram</h2><div class="flow-viewport" tabindex="0" role="region" aria-label="Draft timeline diagram">${renderFlowSvg(result.story)}</div>${renderFlowText(result.story)}`,
    );
  say(
    result.flowchartErrors.length
      ? "Guide preview updated. Correct the diagram errors before previewing or exporting its chart."
      : "Guide preview updated. A valid file still needs source and reader review before publication.",
  );
  save();
});

document.getElementById("add-flowchart")?.addEventListener("click", () => {
  try {
    const result = validateStory(JSON.parse(draft.value));
    if (!result.story) {
      say("Write a valid guide first, then add its diagram.");
      return;
    }
    const story = result.story;
    if (story.flowchart) {
      say(
        "This draft already has a diagram. Edit its timelines, nodes and links in the document.",
      );
      return;
    }
    story.flowchart = {
      title: "Timeline flow chart",
      description: "Follow the selected moments in the guide’s order.",
      frame: "Guide order; dates are stated on individual moments.",
      timelines: [
        {
          id: "main",
          label: "Story timeline",
          description: "This timeline exists before the moments shown here.",
          origin: "existing",
        },
      ],
      nodes: [...new Set(story.guide.chapters.flatMap((c) => c.eventRefs))].map(
        (eventRef, row) => ({
          id: `moment-${row + 1}`,
          eventRef,
          timelineRef: "main",
          row,
        }),
      ),
      links: [],
    };
    draft.value = JSON.stringify(story, null, 2);
    save();
    say(
      "Diagram added in guide order. Edit the timeline names and placements; add explicit split or travel arrows as needed. Preview to inspect it.",
    );
  } catch {
    say("The document must be valid JSON before adding a diagram.");
  }
});
for (const kind of ["page", "svg"] as const)
  document
    .getElementById(`export-flow-${kind}`)
    ?.addEventListener("click", () => {
      try {
        const result = validateStory(JSON.parse(draft.value));
        if (
          !result.story ||
          !result.story.flowchart ||
          result.flowchartErrors.length
        ) {
          say(
            "Preview and correct the current diagram before exporting it. No file was exported.",
          );
          return;
        }
        download(
          kind === "page"
            ? renderFlowPage(result.story)
            : renderFlowSvg(result.story),
          `${result.story.id}-timeline.${kind === "page" ? "html" : "svg"}`,
          kind === "page" ? "text/html;charset=utf-8" : "image/svg+xml",
        );
        say(
          "Diagram export requested. The standalone page includes its drawing, text explanation and source notes.",
        );
      } catch {
        say(
          "The current document could not be exported. Preview it to inspect the errors.",
        );
      }
    });
document.getElementById("download-draft")?.addEventListener("click", () => {
  download(draft.value, "story-draft.json");
  say("Draft downloaded.");
});
document.getElementById("download-ledger")?.addEventListener("click", () => {
  if (imported)
    download(JSON.stringify(imported, null, 2), "legacy-import-record.json");
});
try {
  if (localStorage.getItem(key))
    document.getElementById("restore")!.hidden = false;
} catch {
  /* Download remains available. */
}
document.getElementById("restore")?.addEventListener("click", () => {
  try {
    const text = localStorage.getItem(key);
    if (text) {
      const saved = JSON.parse(text);
      if (typeof saved.text !== "string")
        throw new Error("Invalid saved draft");
      draft.value = saved.text;
      imported = saved.imported;
      document.getElementById("download-ledger")!.hidden = !imported;
      say(
        "Saved draft restored, including its import record. Preview it to check your changes.",
      );
    }
  } catch {
    say("Saved draft could not be read.");
  }
});
