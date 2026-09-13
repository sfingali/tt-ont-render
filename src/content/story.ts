/** The reader validates an authored document. It does not infer a story from a graph. */
export interface Person {
  id: string;
  name: string;
  introduction?: string;
}
export interface StoryEvent {
  id: string;
  title: string;
  text: string;
  whenLabel?: string;
  people?: string[];
  contextRef?: string;
  sourceRefs?: string[];
}
export interface Chapter {
  title: string;
  introduction?: string;
  eventRefs: string[];
}
export interface Source {
  id: string;
  title: string;
  locator: string;
  note?: string;
}
export interface Context {
  id: string;
  label: string;
  explanation: string;
}
export type Connection =
  | {
      id: string;
      kind: "journey";
      fromEvent: string;
      toEvent: string;
      personRef: string;
      label: string;
    }
  | {
      id: string;
      kind: "influence";
      fromEvent: string;
      toEvent: string;
      label: string;
    }
  | {
      id: string;
      kind: "reset";
      fromEvent: string;
      toEvent: string;
      label: string;
      retainedText?: string;
    };
export interface Comparison {
  title: string;
  rows: {
    subject: string;
    beforeText: string;
    afterText: string;
    eventRefs: string[];
    sourceRefs?: string[];
  }[];
}
export type StoryView =
  | {
      id: string;
      kind: "chronology";
      title: string;
      frame: string;
      groups: {
        label: string;
        eventRefs: string[];
        withinGroup: "simultaneous" | "unspecified";
      }[];
    }
  | {
      id: string;
      kind: "journey";
      title: string;
      personRef: string;
      eventRefs: string[];
    };
export interface Story {
  version: "2.0";
  id: string;
  title: string;
  scope: string;
  premise: string;
  ending: string;
  people?: Person[];
  events: StoryEvent[];
  guide: { title: string; personRef?: string; chapters: Chapter[] };
  sources?: Source[];
  contexts?: Context[];
  connections?: Connection[];
  comparisons?: Comparison[];
  views?: StoryView[];
}
export interface Issue {
  path: string;
  message: string;
}
export interface Validation {
  story?: Story;
  errors: Issue[];
  warnings: Issue[];
  viewErrors: Record<string, Issue[]>;
}
type RecordValue = Record<string, unknown>;

export function validateStory(input: unknown): Validation {
  const result: Validation = { errors: [], warnings: [], viewErrors: {} };
  const error = (path: string, message: string) =>
    result.errors.push({ path, message });
  const object = (
    value: unknown,
    path: string,
    keys: string[],
  ): RecordValue => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      error(path, "Expected an object.");
      return {};
    }
    const record = value as RecordValue;
    for (const key of Object.keys(record))
      if (!keys.includes(key)) error(`${path}.${key}`, "Unrecognised field.");
    return record;
  };
  const string = (value: unknown, path: string, optional = false): string => {
    if (optional && value === undefined) return "";
    if (typeof value !== "string" || !value.trim()) {
      error(path, "Write some text.");
      return "";
    }
    return value;
  };
  const list = (value: unknown, path: string, required = false): unknown[] => {
    if (value === undefined && !required) return [];
    if (!Array.isArray(value)) {
      error(path, "Expected a list.");
      return [];
    }
    if (required && !value.length) error(path, "Include at least one item.");
    return value;
  };
  const refs = (
    value: unknown,
    path: string,
    ids: Set<string>,
    required = false,
  ) => {
    const values = list(value, path, required);
    for (const [i, ref] of values.entries()) {
      if (typeof ref !== "string" || !ids.has(ref))
        error(`${path}[${i}]`, `Reference does not exist: ${String(ref)}.`);
    }
    return values;
  };
  const records = (
    value: unknown,
    path: string,
    keys: string[],
    required = false,
  ) => {
    const ids = new Set<string>();
    const values = list(value, path, required).map((v, i) => {
      const p = `${path}[${i}]`;
      const r = object(v, p, keys);
      const id = string(r.id, `${p}.id`);
      if (id && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(id))
        error(`${p}.id`, "Use letters, numbers, dots, underscores or hyphens.");
      if (ids.has(id)) error(`${p}.id`, `Duplicate ID: ${id}.`);
      ids.add(id);
      return r;
    });
    return { ids, values };
  };
  const s = object(input, "story", [
    "version",
    "id",
    "title",
    "scope",
    "premise",
    "ending",
    "people",
    "events",
    "guide",
    "sources",
    "contexts",
    "connections",
    "comparisons",
    "views",
  ]);
  if (s.version !== "2.0")
    error(
      "story.version",
      "Use story format 2.0. Import an older file as a draft first.",
    );
  for (const key of ["id", "title", "scope", "premise", "ending"])
    string(s[key], `story.${key}`);
  if (typeof s.id === "string" && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(s.id))
    error(
      "story.id",
      "Use a stable ID containing letters, numbers, dots, underscores or hyphens.",
    );
  const people = records(s.people, "people", ["id", "name", "introduction"]);
  people.values.forEach((p, i) => {
    string(p.name, `people[${i}].name`);
    string(p.introduction, `people[${i}].introduction`, true);
  });
  const sources = records(s.sources, "sources", [
    "id",
    "title",
    "locator",
    "note",
  ]);
  sources.values.forEach((p, i) => {
    string(p.title, `sources[${i}].title`);
    string(p.locator, `sources[${i}].locator`);
    string(p.note, `sources[${i}].note`, true);
  });
  const contexts = records(s.contexts, "contexts", [
    "id",
    "label",
    "explanation",
  ]);
  contexts.values.forEach((p, i) => {
    string(p.label, `contexts[${i}].label`);
    string(p.explanation, `contexts[${i}].explanation`);
  });
  const events = records(
    s.events,
    "events",
    ["id", "title", "text", "whenLabel", "people", "contextRef", "sourceRefs"],
    true,
  );
  events.values.forEach((e, i) => {
    const p = `events[${i}]`;
    string(e.title, `${p}.title`);
    string(e.text, `${p}.text`);
    string(e.whenLabel, `${p}.whenLabel`, true);
    refs(e.people, `${p}.people`, people.ids);
    refs(e.sourceRefs, `${p}.sourceRefs`, sources.ids);
    if (e.contextRef !== undefined && !contexts.ids.has(String(e.contextRef)))
      error(`${p}.contextRef`, "History/context does not exist.");
    if (typeof e.title === "string" && e.title.length > 90)
      result.warnings.push({
        path: `${p}.title`,
        message:
          "This headline may be difficult to scan. Consider shortening it.",
      });
  });
  const guide = object(s.guide, "guide", ["title", "personRef", "chapters"]);
  string(guide.title, "guide.title");
  if (guide.personRef !== undefined && !people.ids.has(String(guide.personRef)))
    error("guide.personRef", "Person does not exist.");
  const seen = new Set<unknown>();
  list(guide.chapters, "guide.chapters", true).forEach((c, i) => {
    const p = `guide.chapters[${i}]`;
    const chapter = object(c, p, ["title", "introduction", "eventRefs"]);
    string(chapter.title, `${p}.title`);
    string(chapter.introduction, `${p}.introduction`, true);
    refs(chapter.eventRefs, `${p}.eventRefs`, events.ids, true).forEach(
      (ref) => {
        if (seen.has(ref))
          result.warnings.push({
            path: p,
            message: `The guide revisits ${String(ref)}. Make the reason clear in this chapter’s introduction.`,
          });
        seen.add(ref);
      },
    );
  });
  const connections = records(s.connections, "connections", [
    "id",
    "kind",
    "fromEvent",
    "toEvent",
    "personRef",
    "label",
    "retainedText",
  ]);
  connections.values.forEach((c, i) => {
    const p = `connections[${i}]`;
    string(c.label, `${p}.label`);
    if (!["journey", "influence", "reset"].includes(String(c.kind)))
      error(`${p}.kind`, "Choose journey, influence or reset.");
    for (const key of ["fromEvent", "toEvent"])
      if (!events.ids.has(String(c[key])))
        error(`${p}.${key}`, "Event does not exist.");
    for (const key of ["fromEvent", "toEvent"])
      if (events.ids.has(String(c[key])) && !seen.has(c[key]))
        error(
          `${p}.${key}`,
          "Include this connected moment in the guide so readers can reach its explanation.",
        );
    if (c.kind === "journey") {
      if (!people.ids.has(String(c.personRef)))
        error(`${p}.personRef`, "A journey needs a named person.");
      for (const key of ["fromEvent", "toEvent"]) {
        const event = events.values.find((e) => e.id === c[key]);
        if (
          event &&
          (!Array.isArray(event.people) || !event.people.includes(c.personRef))
        )
          error(
            `${p}.${key}`,
            "The travelling person must participate at both endpoints.",
          );
      }
    } else if (c.personRef !== undefined)
      error(`${p}.personRef`, "Only journeys use personRef.");
    if (c.kind === "reset") string(c.retainedText, `${p}.retainedText`, true);
    else if (c.retainedText !== undefined)
      error(
        `${p}.retainedText`,
        "Only resets describe retained experience here.",
      );
  });
  list(s.comparisons, "comparisons").forEach((c, i) => {
    const p = `comparisons[${i}]`;
    const comparison = object(c, p, ["title", "rows"]);
    string(comparison.title, `${p}.title`);
    list(comparison.rows, `${p}.rows`, true).forEach((r, j) => {
      const q = `${p}.rows[${j}]`;
      const row = object(r, q, [
        "subject",
        "beforeText",
        "afterText",
        "eventRefs",
        "sourceRefs",
      ]);
      for (const key of ["subject", "beforeText", "afterText"])
        string(row[key], `${q}.${key}`);
      refs(row.eventRefs, `${q}.eventRefs`, events.ids, true);
      refs(row.sourceRefs, `${q}.sourceRefs`, sources.ids);
    });
  });
  const viewStart = result.errors.length;
  const views = records(s.views, "views", [
    "id",
    "kind",
    "title",
    "personRef",
    "eventRefs",
    "frame",
    "groups",
  ]);
  // Duplicate/invalid view IDs invalidate the optional view collection, never the guide.
  const collectionErrors = result.errors.splice(viewStart);
  if (collectionErrors.length) result.viewErrors["*"] = collectionErrors;
  views.values.forEach((v, i) => {
    const start = result.errors.length,
      p = `views[${i}]`;
    string(v.title, `${p}.title`);
    if (v.id === "guide")
      error(`${p}.id`, "The ID guide is reserved for the default explanation.");
    if (v.kind === "journey") {
      if (!people.ids.has(String(v.personRef)))
        error(`${p}.personRef`, "Person does not exist.");
      refs(v.eventRefs, `${p}.eventRefs`, events.ids, true).forEach((ref) => {
        const e = events.values.find((e) => e.id === ref);
        if (e && (!Array.isArray(e.people) || !e.people.includes(v.personRef)))
          error(
            `${p}.eventRefs`,
            "Every journey event must include the named person.",
          );
      });
      if (v.groups !== undefined || v.frame !== undefined)
        error(p, "A person journey does not use calendar groups.");
    } else if (v.kind === "chronology") {
      string(v.frame, `${p}.frame`);
      const placed = new Set<unknown>();
      list(v.groups, `${p}.groups`, true).forEach((g, j) => {
        const q = `${p}.groups[${j}]`;
        const group = object(g, q, ["label", "eventRefs", "withinGroup"]);
        string(group.label, `${q}.label`);
        if (
          !["simultaneous", "unspecified"].includes(String(group.withinGroup))
        )
          error(
            `${q}.withinGroup`,
            "Declare simultaneous or unspecified local order.",
          );
        refs(group.eventRefs, `${q}.eventRefs`, events.ids, true).forEach(
          (ref) => {
            if (placed.has(ref))
              error(
                `${q}.eventRefs`,
                "One occurrence cannot occupy two chronological groups.",
              );
            placed.add(ref);
          },
        );
      });
      if (v.personRef !== undefined || v.eventRefs !== undefined)
        error(p, "A chronology uses groups in a named frame.");
    } else error(`${p}.kind`, "Choose chronology or journey.");
    const issues = result.errors.splice(start);
    if (issues.length) result.viewErrors[String(v.id)] = issues;
  });
  if (!result.errors.length) result.story = input as Story;
  return result;
}

export function availableViews(story: Story): StoryView[] {
  const v = validateStory(story);
  return v.viewErrors["*"]
    ? []
    : (story.views ?? []).filter(
        (view) => !Object.hasOwn(v.viewErrors, view.id),
      );
}
export function parseStory(value: unknown): Story {
  const v = validateStory(value);
  if (!v.story)
    throw new Error(v.errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
  return v.story;
}
