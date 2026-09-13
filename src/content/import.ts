import type { Story } from "./story.ts";

export interface MigrationEntry {
  oldId: string;
  disposition: "unresolved" | "retained" | "merged" | "prose" | "omitted";
  newIds: string[];
  reason: string;
}
export interface ImportDraft {
  status: "draft";
  original: unknown;
  story: Story;
  ledger: { events: MigrationEntry[]; edges: MigrationEntry[] };
  instructions: string[];
}

/** Candidate extraction only. Original order, roles and graph degree never become a guide. */
export function importLegacy(input: unknown): ImportDraft {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Choose a story object.");
  const raw = input as Record<string, any>;
  if (
    !Array.isArray(raw.events) ||
    !Array.isArray(raw.worlds) ||
    !raw.meta?.title
  )
    throw new Error(
      "This is not a recognised legacy story. Expected title, events and worlds.",
    );
  const safeId = (value: unknown, fallback: string) =>
    typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)
      ? value
      : fallback;
  const original = JSON.parse(JSON.stringify(input));
  const candidates = raw.events.map((e: any, i: number) => ({
    id: safeId(e.id, `candidate-${i + 1}`),
    title: String(e.label ?? ""),
    text: String(e.description ?? ""),
    ...(e.at?.timeLabel ? { whenLabel: String(e.at.timeLabel) } : {}),
    sourceRefs: ["legacy"],
  }));
  const entry = (record: any, i: number): MigrationEntry => ({
    oldId: String(record.id ?? `record-${i + 1}`),
    disposition: "unresolved",
    newIds: [],
    reason:
      "Imported as evidence. An editor must select, reconcile and source-check this record.",
  });
  return {
    status: "draft",
    original,
    story: {
      version: "2.0",
      id: safeId(raw.meta.id, "imported-story"),
      title: String(raw.meta.title),
      scope: "",
      premise: "",
      ending: "",
      events: candidates,
      guide: { title: "", chapters: [] },
      sources: [
        {
          id: "legacy",
          title: "Original ontology encoding",
          locator: String(raw.meta.id ?? raw.meta.title),
          note: "Imported candidate material; not independently verified.",
        },
      ],
    },
    ledger: {
      events: raw.events.map(entry),
      edges: (Array.isArray(raw.edges) ? raw.edges : []).map(entry),
    },
    instructions: [
      "Write the scope and the question this guide answers.",
      "Reconcile repeated records against the work.",
      "Choose chapters and event references in the intended reading order.",
      "Add explicit journeys and comparisons only when supported.",
      "Preview and review before publishing.",
    ],
  };
}
