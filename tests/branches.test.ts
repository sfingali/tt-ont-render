import test from "node:test";
import assert from "node:assert/strict";
import { validateStory, type Story } from "../src/content/story.ts";
import { layoutBranches } from "../src/reader/branch-flowchart.ts";
import { renderFlowPage, renderFlowSvg } from "../src/reader/flowchart.ts";
import { renderBranchText } from "../src/reader/branch-flowchart.ts";
function example(): Story {
  const s: Story = {
    version: "2.0",
    id: "repeated-forks",
    title: "Repeated forks",
    scope: "Original diagram fixture",
    premise: "Each choice creates two outcomes.",
    ending: "One followed outcome remains.",
    events: [],
    guide: {
      title: "The choices",
      chapters: [{ title: "Three choices", eventRefs: [] }],
    },
    flowchart: {
      layout: "branches",
      title: "Three successive forks",
      description: "An ending and a continuation at each fork.",
      frame: "World history, not viewing order.",
      timelines: [
        {
          id: "root",
          label: "Before the first choice",
          description: "The initial history.",
          origin: "existing",
        },
      ],
      nodes: [],
      links: [],
    },
  };
  let parent = "root";
  for (let i = 1; i <= 3; i++) {
    const choice = `choice-${i}`,
      stop = `stop-${i}`,
      live = `live-${i}`;
    for (const [id, title] of [
      [choice, "A choice splits the outcomes"],
      [stop, "This path ends"],
      [live, "A new surviving outcome"],
    ]) {
      s.events.push({ id, title, text: title, whenLabel: `Choice ${i}` });
      s.guide.chapters[0].eventRefs.push(id);
    }
    s.flowchart!.nodes.push(
      { id: choice, eventRef: choice, timelineRef: parent, row: i * 2 },
      { id: stop, eventRef: stop, timelineRef: stop, row: i * 2 + 1 },
      { id: live, eventRef: live, timelineRef: live, row: i * 2 + 1 },
    );
    for (const id of [stop, live]) {
      s.flowchart!.timelines.push({
        id,
        label: id,
        description: "An outcome of the choice.",
        origin: "split",
      });
      s.flowchart!.links.push({
        id: `to-${id}`,
        kind: "split",
        from: choice,
        to: id,
        label: "This choice creates this outcome.",
      });
    }
    parent = live;
  }
  return s;
}
test("successive forks connect both new universes and keep terminal paths beside their fork", () => {
  const s = example();
  assert.deepEqual(validateStory(s).flowchartErrors, []);
  const g = layoutBranches(s);
  assert.equal(g.nodes.length, 9);
  assert.ok(
    g.width < 900,
    "Repeated deaths must not allocate a widening set of world columns",
  );
  for (let i = 1; i <= 3; i++) {
    const from = g.nodes.find((n) => n.id === `choice-${i}`)!,
      dead = g.nodes.find((n) => n.id === `stop-${i}`)!,
      alive = g.nodes.find((n) => n.id === `live-${i}`)!;
    assert.equal(dead.y, alive.y);
    assert.ok(dead.y > from.y);
    assert.ok(Math.abs(dead.x - alive.x) <= 350);
    assert.equal(
      g.routes.filter((r) => r.from === from.id && r.kind === "split").length,
      2,
    );
    assert.ok(
      !g.routes.some((r) => r.from === dead.id),
      "An ended perspective must not continue",
    );
  }
  const svg = renderFlowSvg(s),
    page = renderFlowPage(s);
  assert.doesNotMatch(svg, />[RST][0-9]+<|data-timeline=/);
  assert.match(svg, /data-end="stop-1"/);
  assert.match(page, /Viewing order is kept in the reading guide/);
  assert.ok(
    page.includes(encodeURIComponent(svg)),
    "The downloadable SVG must match the displayed version",
  );
});
test("branch view rejects viewing-order connections without changing the lane view", () => {
  const s = example();
  s.flowchart!.links.push({
    id: "reading",
    kind: "sequence",
    from: "choice-1",
    to: "choice-2",
    label: "Next presented scene",
  });
  assert.ok(
    validateStory(s).flowchartErrors.some((x) =>
      x.message.includes("viewing order"),
    ),
  );
  delete s.flowchart!.layout;
  assert.deepEqual(validateStory(s).flowchartErrors, []);
});
test("an independent scene gets a separate panel with no invented connection", () => {
  const s = example();
  s.events.push({
    id: "parallel",
    title: "Meanwhile",
    text: "An independent scene.",
  });
  s.guide.chapters[0].eventRefs.push("parallel");
  s.flowchart!.timelines.push({
    id: "parallel",
    label: "Independent parallel scene",
    description: "No causal connection.",
    origin: "existing",
  });
  s.flowchart!.nodes.push({
    id: "parallel",
    eventRef: "parallel",
    timelineRef: "parallel",
    row: 0,
  });
  assert.deepEqual(validateStory(s).flowchartErrors, []);
  const g = layoutBranches(s);
  assert.equal(g.panels.length, 1);
  assert.ok(
    !g.routes.some((x) => x.from === "parallel" || x.to === "parallel"),
  );
  assert.match(renderFlowSvg(s), /data-independent="parallel"/);
});
test("branch routes stay out of event cards", () => {
  const g = layoutBranches(example());
  for (const r of g.routes)
    for (let i = 1; i < r.points.length; i++)
      for (const n of g.nodes) {
        const a = r.points[i - 1],
          b = r.points[i];
        const crosses =
          a.x === b.x
            ? a.x > n.x &&
              a.x < n.x + n.width &&
              Math.max(a.y, b.y) > n.y &&
              Math.min(a.y, b.y) < n.y + n.height
            : a.y > n.y &&
              a.y < n.y + n.height &&
              Math.max(a.x, b.x) > n.x &&
              Math.min(a.x, b.x) < n.x + n.width;
        assert.ok(!crosses, `${r.id} crosses ${n.id}`);
      }
});

/** A world entered partway down did not begin where the traveller reached it. */
function withPriorWorld(): Story {
  const s = example();
  const f = s.flowchart!;
  s.people = [{ id: "trav", name: "The traveller", introduction: "Crosses over." }];
  s.events.push({
    id: "elsewhere",
    title: "A history already under way",
    text: "It has been running independently.",
    whenLabel: "Long before",
    people: ["trav"],
  });
  // the traveller departs from the last surviving outcome
  const depart = f.nodes.find((n) => n.id === "live-3")!;
  s.events.find((e) => e.id === depart.eventRef)!.people = ["trav"];
  f.timelines.push({
    id: "prior",
    label: "A world already under way",
    description: "Running long before the traveller arrives.",
    origin: "existing",
  });
  f.nodes.push({
    id: "prior-1",
    eventRef: "elsewhere",
    timelineRef: "prior",
    row: depart.row + 1,
  });
  f.links.push({
    id: "cross",
    kind: "travel",
    from: depart.id,
    to: "prior-1",
    personRef: "trav",
    label: "The traveller crosses into it.",
  });
  s.guide.chapters[0].eventRefs.push("elsewhere");
  return s;
}
test("a world entered partway down is drawn as already running; a forked one is not", () => {
  const s = withPriorWorld();
  assert.deepEqual(validateStory(s).flowchartErrors, []);
  const g = layoutBranches(s);

  assert.equal(g.priorLines.length, 1, "only the pre-existing world gets one");
  const line = g.priorLines[0];
  assert.equal(line.timelineRef, "prior");

  const first = g.nodes.find((n) => n.id === "prior-1")!;
  assert.ok(line.top < first.y, "its line reaches back above its first moment");
  assert.ok(line.top <= g.introY + 20, "and runs to the top of the chart");

  // Columns are reused, so the line must not run down a column centre.
  for (const n of g.nodes)
    assert.ok(
      line.x < n.x || line.x > n.x + 250,
      `the line must not cross the card ${n.id}`,
    );

  const svg = renderFlowSvg(s);
  assert.match(svg, /data-timeline="prior" data-origin="existing"/);
  // A world created by a split makes the opposite claim and never gets one.
  for (const id of ["stop-1", "stop-2", "stop-3"])
    assert.ok(
      !g.priorLines.some((l) => l.timelineRef === id),
      "a fatal outcome connects to nothing earlier",
    );
  assert.match(renderBranchText(s), /was already running before this point/);
});
test("a world present from the first row needs no prior-history line", () => {
  const g = layoutBranches(example());
  assert.equal(g.priorLines.length, 0);
  assert.doesNotMatch(renderFlowSvg(example()), /data-origin="existing"/);
});
