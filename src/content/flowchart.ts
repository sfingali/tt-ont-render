import type { Issue, Story } from "./story.ts";

/** Authored lanes and placements; a trip never creates a timeline implicitly. */
export interface TimelineFlowchart {
  layout?: "branches";
  title: string;
  description: string;
  frame: string;
  timelines: {
    id: string;
    label: string;
    description: string;
    origin: "existing" | "split" | "unspecified";
  }[];
  nodes: { id: string; eventRef: string; timelineRef: string; row: number }[];
  links: {
    id: string;
    kind: "split" | "travel" | "sequence";
    from: string;
    to: string;
    label: string;
    personRef?: string;
  }[];
}

export function validateFlowchart(value: unknown, story: Story): Issue[] {
  const issues: Issue[] = [];
  const fail = (path: string, message: string) =>
    issues.push({ path: `flowchart.${path}`, message });
  type Obj = Record<string, unknown>;
  const obj = (v: unknown, path: string, keys: string[]): Obj => {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      fail(path, "Expected an object.");
      return {};
    }
    for (const key of Object.keys(v))
      if (!keys.includes(key)) fail(`${path}.${key}`, "Unrecognised field.");
    return v as Obj;
  };
  const text = (v: unknown, path: string) => {
    if (typeof v !== "string" || !v.trim()) fail(path, "Write some text.");
  };
  const list = (
    v: unknown,
    path: string,
    keys: string[],
    required: boolean,
  ): Obj[] => {
    if (!Array.isArray(v)) {
      fail(path, "Expected a list.");
      return [];
    }
    if (required && !v.length) fail(path, "Include at least one item.");
    const seen = new Set<unknown>();
    return v.map((item, i) => {
      const p = `${path}[${i}]`,
        r = obj(item, p, keys);
      if (
        typeof r.id !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(r.id)
      )
        fail(
          `${p}.id`,
          "Use a stable ID with letters, numbers, dots, underscores or hyphens.",
        );
      if (seen.has(r.id)) fail(`${p}.id`, "Duplicate ID.");
      seen.add(r.id);
      return r;
    });
  };
  const f = obj(value, "", [
    "layout",
    "title",
    "description",
    "frame",
    "timelines",
    "nodes",
    "links",
  ]);
  if (f.layout !== undefined && f.layout !== "branches")
    fail("layout", "Choose branches or omit the layout for lanes.");
  for (const key of ["title", "description", "frame"]) text(f[key], key);
  const lanes = list(
    f.timelines,
    "timelines",
    ["id", "label", "description", "origin"],
    true,
  );
  const nodes = list(
    f.nodes,
    "nodes",
    ["id", "eventRef", "timelineRef", "row"],
    true,
  );
  const links = list(
    f.links,
    "links",
    ["id", "kind", "from", "to", "label", "personRef"],
    false,
  );
  const laneIds = new Set(lanes.map((l) => l.id));
  const eventMap = new Map(story.events.map((e) => [e.id, e]));
  const people = new Set(story.people?.map((p) => p.id));
  const guide = new Set(story.guide.chapters.flatMap((c) => c.eventRefs));
  const slots = new Set<string>();
  nodes.forEach((n, i) => {
    const p = `nodes[${i}]`;
    if (!laneIds.has(n.timelineRef))
      fail(`${p}.timelineRef`, "Timeline does not exist.");
    if (!eventMap.has(String(n.eventRef)) || !guide.has(String(n.eventRef)))
      fail(`${p}.eventRef`, "Choose a moment included in the guide.");
    if (!Number.isSafeInteger(n.row) || Number(n.row) < 0)
      fail(`${p}.row`, "Use a non-negative whole row number.");
    const slot = JSON.stringify([n.timelineRef, n.row]);
    if (slots.has(slot))
      fail(
        `${p}.row`,
        "Place these moments on separate rows within this timeline.",
      );
    slots.add(slot);
  });
  lanes.forEach((l, i) => {
    const p = `timelines[${i}]`;
    text(l.label, `${p}.label`);
    text(l.description, `${p}.description`);
    if (!["existing", "split", "unspecified"].includes(String(l.origin)))
      fail(`${p}.origin`, "Choose existing, split or unspecified.");
    const placed = nodes.filter((n) => n.timelineRef === l.id);
    if (!placed.length)
      fail(p, "Include at least one moment on this timeline.");
    const incoming = links.filter(
      (link) => link.kind === "split" && placed.some((n) => n.id === link.to),
    );
    if (l.origin === "existing" && incoming.length)
      fail(
        p,
        "A pre-existing timeline cannot begin at a split. Use travel to enter it.",
      );
    if (l.origin === "unspecified" && incoming.length)
      fail(p, "An unspecified origin cannot have a confirmed split.");
    if (l.origin === "split" && incoming.length !== 1)
      fail(p, "A new timeline needs exactly one split into its first moment.");
  });
  links.forEach((l, i) => {
    const p = `links[${i}]`,
      from = nodes.find((n) => n.id === l.from),
      to = nodes.find((n) => n.id === l.to);
    text(l.label, `${p}.label`);
    if (!from) fail(`${p}.from`, "Diagram moment does not exist.");
    if (!to) fail(`${p}.to`, "Diagram moment does not exist.");
    if (l.from === l.to)
      fail(
        p,
        "Use distinct departure and arrival moments, including for a repeated visit.",
      );
    if (l.kind === "split") {
      if (l.personRef !== undefined)
        fail(
          `${p}.personRef`,
          "A split describes a timeline. Add a separate travel arrow for a traveller.",
        );
      if (from && to) {
        if (from.timelineRef === to.timelineRef)
          fail(p, "A split must start a different timeline.");
        if (Number(to.row) <= Number(from.row))
          fail(
            p,
            "Place the new timeline’s first moment below its split point.",
          );
        if (
          nodes.some(
            (n) =>
              n.timelineRef === to.timelineRef &&
              Number(n.row) < Number(to.row),
          )
        )
          fail(p, "A split must enter the first moment on the new timeline.");
      }
    } else if (l.kind === "travel") {
      if (!people.has(String(l.personRef)))
        fail(`${p}.personRef`, "Name the travelling person.");
      for (const n of [from, to])
        if (
          n &&
          !eventMap
            .get(String(n.eventRef))
            ?.people?.includes(String(l.personRef))
        )
          fail(p, "The traveller must be present at both endpoints.");
    } else if (l.kind === "sequence") {
      if (f.layout === "branches")
        fail(
          p,
          "Keep viewing order in the reading view, outside the branching diagram.",
        );
      if (l.personRef !== undefined)
        fail(`${p}.personRef`, "Reading order does not assert a traveller.");
      if (from && to && Number(to.row) <= Number(from.row))
        fail(p, "Place the next part of the story below the earlier part.");
    } else fail(`${p}.kind`, "Choose split, travel or sequence.");
  });
  return issues;
}
