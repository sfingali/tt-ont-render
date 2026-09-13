import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  validateStory,
  availableViews,
  type Story,
} from "../src/content/story.ts";
import { importLegacy } from "../src/content/import.ts";
import {
  renderStoryPage,
  renderReading,
  scriptJson,
} from "../src/reader/render.ts";
import { renderDiagram } from "../src/reader/diagram.ts";
import { indexAndResolve, type RawStory } from "../src/engine/index.ts";
const content = new URL("../content/stories/", import.meta.url);
const pilot = JSON.parse(
  readFileSync(new URL("back-to-the-future.json", content), "utf8"),
) as Story;
const copy = () => structuredClone(pilot);
test("every pilot is a complete document with usable optional views", () => {
  for (const file of readdirSync(content)) {
    const s = JSON.parse(readFileSync(new URL(file, content), "utf8"));
    const v = validateStory(s);
    assert.deepEqual(v.errors, [], file);
    assert.deepEqual(v.viewErrors, {}, file);
    const html = renderStoryPage(s);
    for (const ev of s.events) assert.ok(html.includes(`id="event-${ev.id}"`));
  }
});
test("missing event references cannot produce a broken guide", () => {
  const s = copy();
  s.guide.chapters[0].eventRefs.push("absent");
  assert.equal(validateStory(s).story, undefined);
});
test("identity labels cannot substitute for a journey participant", () => {
  const s = copy();
  s.events[0].people = [];
  assert.ok(
    validateStory(s).errors.some((e) => e.message.includes("both endpoints")),
  );
});
test("invalid optional view leaves the guide readable", () => {
  const s = copy();
  s.views![0] = {
    id: "bad",
    kind: "chronology",
    title: "Invalid",
    frame: "calendar",
    groups: [
      { label: "first", eventRefs: ["absent"], withinGroup: "unspecified" },
    ],
  };
  const v = validateStory(s);
  assert.ok(v.story);
  assert.deepEqual(availableViews(s), []);
  assert.ok(renderReading(s, "bad").includes("Marty escapes"));
});
test("two placements of one chronological occurrence are rejected", () => {
  const s = copy();
  s.views = [
    {
      id: "calendar",
      kind: "chronology",
      title: "Calendar",
      frame: "test",
      groups: [
        { label: "a", eventRefs: ["escape"], withinGroup: "unspecified" },
        { label: "b", eventRefs: ["escape"], withinGroup: "simultaneous" },
      ],
    },
  ];
  assert.ok(validateStory(s).viewErrors.calendar.length);
});
test("same person at both ends does not infer a journey or merge occurrences", () => {
  const s = copy();
  delete s.connections;
  assert.equal(validateStory(s).errors.length, 0);
  assert.ok(!renderDiagram(s, "escape").includes("JOURNEY"));
  assert.equal(s.events.length, 6);
});
test("repeated guide visits have unique anchors", () => {
  const s = copy();
  s.guide.chapters[1].eventRefs.push("escape");
  const html = renderReading(s);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.includes("event-escape-visit-1"));
});
test("HTML, embedded JSON and exported SVG escape hostile source text", () => {
  const s = copy();
  s.events[0].title = "</script><img src=x onerror=alert(1)>";
  s.sources![0].locator = "javascript:alert(1)";
  const html = renderStoryPage(s);
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!scriptJson(s).includes("</script>"));
  assert.ok(!renderDiagram(s, "escape").includes("<img src=x"));
});
test("legacy import retains every record but cannot pass as a finished guide", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL("../fixtures/back-to-the-future.json", import.meta.url),
      "utf8",
    ),
  );
  const d = importLegacy(raw);
  assert.deepEqual(d.original, raw);
  assert.equal(d.ledger.events.length, raw.events.length);
  assert.equal(d.ledger.edges.length, raw.edges.length);
  assert.ok(d.ledger.events.every((e) => e.disposition === "unresolved"));
  assert.equal(d.story.guide.chapters.length, 0);
  assert.ok(validateStory(d.story).errors.length);
  d.story.events[0].text = "edited";
  assert.deepEqual(d.original, raw);
});
const graph = (pairs: [string, string, string?][]): RawStory => ({
  topologyPatternId: "single_fixed_timeline",
  primaryRuleSetId: "fixed",
  worlds: [{ id: "w", kind: "timeline" }],
  agents: [],
  events: ["a", "b", "z", "isolated"].map((id) => ({
    id,
    type: "ordinary",
    at: { worldRef: "w" },
  })),
  edges: pairs.map(([from, to, orderKind = "chronological"], i) => ({
    id: `e${i}`,
    kind: "temporal",
    from,
    to,
    orderKind,
  })),
});
test("chronological ordering waits for all predecessors and excludes isolated events", () => {
  const f = indexAndResolve(
    graph([
      ["a", "z"],
      ["a", "b"],
      ["z", "b"],
    ]),
  );
  assert.deepEqual(
    f.events
      .filter((e) => e.order)
      .sort((a, b) => a.order!.ordinal - b.order!.ordinal)
      .map((e) => e.id),
    ["a", "z", "b"],
  );
  assert.equal(f.events.find((e) => e.id === "isolated")!.order, null);
});
test("experienced, presentation, simultaneous and absent orderKind never become chronology", () => {
  for (const kind of ["experienced", "presentation", "simultaneous", ""])
    assert.ok(
      indexAndResolve(graph([["a", "b", kind]])).events.every(
        (e) => e.order === null,
      ),
    );
});
test("duplicate constraints do not corrupt chronological indegrees", () => {
  assert.equal(
    indexAndResolve(
      graph([
        ["a", "b"],
        ["a", "b"],
      ]),
    ).events.find((e) => e.id === "b")!.order!.ordinal,
    1,
  );
});
test("partial and cyclic orders remain honest on a scalar legacy axis", () => {
  for (const pairs of [
    [
      ["a", "b"],
      ["a", "z"],
    ],
    [
      ["a", "b"],
      ["b", "a"],
    ],
  ] as [string, string][][]) {
    const f = indexAndResolve(graph(pairs));
    assert.ok(f.events.every((e) => e.order === null));
    assert.ok(f.issues.some((e) => e.code.startsWith("CHRONOLOGY_")));
  }
});
test("cross-world constraints do not position either world", () => {
  const g = graph([["a", "b"]]);
  g.worlds.push({ id: "other", kind: "timeline" });
  g.events[1].at!.worldRef = "other";
  assert.ok(indexAndResolve(g).events.every((e) => e.order === null));
});
test("migration ledgers account for every source record and resolve new references", () => {
  const dir = new URL("../content/migrations/", import.meta.url);
  for (const file of readdirSync(dir)) {
    const ledger = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    const s = JSON.parse(readFileSync(new URL(file, content), "utf8")) as Story;
    assert.equal(ledger.events.length, ledger.source.eventCount);
    assert.equal(ledger.edges.length, ledger.source.edgeCount);
    for (const row of ledger.events) {
      assert.ok(row.reason);
      for (const id of row.newIds)
        assert.ok(
          s.events.some((e) => e.id === id),
          `${file}: ${id}`,
        );
    }
    assert.equal(
      new Set(ledger.events.map((e: { oldId: string }) => e.oldId)).size,
      ledger.events.length,
    );
  }
});
test("an encoded chronological axis states its limited basis", () => {
  const f = indexAndResolve(graph([["a", "b"]]));
  assert.match(
    f.events.find((e) => e.id === "a")!.order!.axisLabel,
    /ordered, not to scale/,
  );
});
