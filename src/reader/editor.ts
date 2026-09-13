import { validateStory } from "../content/story.ts";
import { importLegacy, type ImportDraft } from "../content/import.ts";
import { escapeHtml, renderReading, renderEnding } from "./render.ts";

const draft = document.getElementById("draft") as HTMLTextAreaElement,
  status = document.getElementById("editor-status")!,
  errors = document.getElementById("editor-errors")!,
  preview = document.getElementById("editor-preview")!;
let imported: ImportDraft | undefined;
const key = "timelines-story-draft-v2";
function say(s: string) {
  status.textContent = s;
}
function download(content: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
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
  say(
    "Guide preview updated. A valid file still needs source and reader review before publication.",
  );
  save();
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
