import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validateStory, type Story } from "../src/content/story.ts";
import {
  layoutFlowchart,
  renderFlowPage,
  renderFlowSvg,
  wrapFlowText,
} from "../src/reader/flowchart.ts";
import { renderStoryPage } from "../src/reader/render.ts";
const demo = JSON.parse(
  readFileSync(
    new URL("../examples/branching-guide.json", import.meta.url),
    "utf8",
  ),
) as Story;
const copy = () => structuredClone(demo);
test("authored demo distinguishes a new branch from travel to an existing world", () => {
  const v = validateStory(demo);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.flowchartErrors, []);
  const svg = renderFlowSvg(demo);
  assert.match(svg, /data-timeline="orchard" data-origin="existing"/);
  assert.match(svg, /data-timeline="branch" data-origin="split"/);
  assert.match(svg, /data-link="gate" data-kind="split"/);
  assert.match(svg, /data-link="orchard-trip" data-kind="travel"/);
  assert.match(svg, /Mira enters Orchard/);
});
test("every pilot has a valid authored diagram and a static export link", () => {
  const dir = new URL("../content/stories/", import.meta.url);
  for (const name of readdirSync(dir)) {
    const s = JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Story;
    assert.ok(s.flowchart, name);
    assert.deepEqual(validateStory(s).flowchartErrors, [], name);
    assert.match(renderStoryPage(s), /href="timeline.html"/);
    assert.match(renderFlowPage(s), /Read the diagram as text/);
  }
});
test("a journey cannot masquerade as the origin of a new timeline", () => {
  const s = copy();
  s.flowchart!.links.shift();
  assert.ok(
    validateStory(s).flowchartErrors.some((i) =>
      i.message.includes("exactly one split"),
    ),
  );
});
test("pre-existing worlds reject creation arrows", () => {
  const s = copy();
  s.flowchart!.timelines[1].origin = "existing";
  assert.ok(
    validateStory(s).flowchartErrors.some((i) =>
      i.message.includes("pre-existing"),
    ),
  );
});
test("split origins must be unique, cross lanes and enter their first moment", () => {
  for (const mutation of [
    (s: Story) =>
      s.flowchart!.links.push({ ...s.flowchart!.links[0], id: "duplicate" }),
    (s: Story) => (s.flowchart!.links[0].to = "b1"),
    (s: Story) => (s.flowchart!.links[0].to = "h2"),
    (s: Story) => (s.flowchart!.nodes.find((n) => n.id === "b0")!.row = 0),
  ]) {
    const s = copy();
    mutation(s);
    assert.ok(validateStory(s).flowchartErrors.length);
  }
});
test("invalid endpoints, participants and overlapping placements fail locally", () => {
  for (const mutation of [
    (s: Story) => (s.flowchart!.links[1].from = "missing"),
    (s: Story) => (s.flowchart!.links[1].personRef = "stranger"),
    (s: Story) => (s.events.find((e) => e.id === "visit")!.people = []),
    (s: Story) => (s.flowchart!.nodes.find((n) => n.id === "h1")!.row = 0),
    (s: Story) => (s.flowchart!.nodes[0].eventRef = "missing"),
    (s: Story) => (s.flowchart!.nodes[0].row = -1),
  ]) {
    const s = copy();
    mutation(s);
    const v = validateStory(s);
    assert.ok(v.story);
    assert.ok(v.flowchartErrors.length);
    assert.doesNotMatch(renderStoryPage(s), /href="timeline.html"/);
    assert.throws(() => renderFlowSvg(s));
  }
});
test("an invalid optional diagram never prevents reading the guide", () => {
  const s = copy();
  (s as unknown as { flowchart: unknown }).flowchart = null;
  const v = validateStory(s);
  assert.ok(v.story);
  assert.ok(v.flowchartErrors.length);
  assert.match(renderStoryPage(s), /Mira starts in Harbour/);
});
test("no diagram or split is inferred from the guide or its people", () => {
  const s = copy();
  delete s.flowchart;
  assert.deepEqual(validateStory(s).flowchartErrors, []);
  assert.doesNotMatch(renderStoryPage(s), /href="timeline.html"/);
});
test("connectors avoid card interiors, including backward and same-lane journeys", () => {
  const s = copy();
  s.flowchart!.links.push({
    id: "backwards",
    kind: "travel",
    from: "b1",
    to: "h0",
    personRef: "mira",
    label: "A return into an earlier moment.",
  });
  const layout = layoutFlowchart(s);
  const crosses = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    r: { x: number; y: number; width: number; height: number },
  ) =>
    a.x === b.x
      ? a.x > r.x &&
        a.x < r.x + r.width &&
        Math.max(a.y, b.y) > r.y &&
        Math.min(a.y, b.y) < r.y + r.height
      : a.y > r.y &&
        a.y < r.y + r.height &&
        Math.max(a.x, b.x) > r.x &&
        Math.min(a.x, b.x) < r.x + r.width;
  for (const path of layout.routes)
    for (let i = 1; i < path.points.length; i++)
      for (const card of layout.nodes)
        assert.equal(
          crosses(path.points[i - 1], path.points[i], card),
          false,
          `${path.id} crosses ${card.id}`,
        );
  assert.ok(
    layout.routes.every((r) =>
      r.points.every(
        (p) =>
          p.x >= 0 &&
          p.x < layout.width &&
          p.y >= layout.head + layout.laneHead,
      ),
    ),
  );
});
test("long labels grow cards and row numbers do not create unbounded empty space", () => {
  const s = copy();
  s.events[0].title = "W".repeat(200);
  s.flowchart!.nodes.find((n) => n.id === "b1")!.row = Number.MAX_SAFE_INTEGER;
  const g = layoutFlowchart(s);
  assert.ok(g.nodes[0].height > 200);
  assert.ok(g.chartEnd < 6000);
  assert.ok(
    wrapFlowText("W".repeat(80), 27).every((line) => line.length <= 15),
  );
  assert.doesNotMatch(renderFlowSvg(s), /NaN|Infinity/);
});
test("standalone HTML has inline artwork, styles, sources and no runtime imports", () => {
  const page = renderFlowPage(demo);
  assert.match(page, /<!doctype html>/);
  assert.match(page, /<svg /);
  assert.match(page, /<style>/);
  assert.match(page, /Original explanatory example/);
  assert.match(page, /data:image\/svg\+xml/);
  assert.doesNotMatch(
    page,
    /<script[^>]+src=|<link[^>]+stylesheet|<iframe|<img|\bimport\(/,
  );
  assert.match(page, /source and reader reviews pending/);
});
test("untrusted text and locators remain inert in SVG and portable HTML", () => {
  const s = copy();
  s.flowchart!.title = "<script>alert(1)</script>";
  s.flowchart!.links[0].label = "<img src=x onerror=alert(1)>";
  s.sources![0].locator = "javascript:alert(1)";
  for (const out of [renderFlowPage(s), renderFlowSvg(s)]) {
    assert.doesNotMatch(out, /<script>alert\(1\)|<img src=x|href="javascript:/);
    assert.match(out, /&lt;script&gt;|&lt;script/);
  }
});
