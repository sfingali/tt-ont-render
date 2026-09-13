import type { Story } from "../content/story.ts";
import { escapeHtml as e } from "./html.ts";
import { wrapFlowText } from "./flow-text.ts";

const CARD = 250,
  STEP = 320,
  LEFT = 36,
  GREEN = "#28745c",
  BLUE = "#265d9f";
/** Reuse columns after a branch ends. A world starts at its fork, never at a detached header. */
export function layoutBranches(story: Story) {
  const f = story.flowchart!;
  const events = new Map(story.events.map((x) => [x.id, x]));
  const lanes = f.timelines.map((l) => ({
    ...l,
    placed: f.nodes
      .filter((n) => n.timelineRef === l.id)
      .sort((a, b) => a.row - b.row),
  }));
  const laneMap = new Map(lanes.map((l) => [l.id, l]));
  const nodeMap = new Map(f.nodes.map((n) => [n.id, n]));
  const independent = new Set(
    lanes
      .filter(
        (l) =>
          l.placed.length === 1 &&
          !f.links.some(
            (k) => k.from === l.placed[0].id || k.to === l.placed[0].id,
          ),
      )
      .map((l) => l.id),
  );
  const active = lanes.filter((l) => !independent.has(l.id));
  const cols = new Map<string, number>();
  const occupied: { col: number; start: number; end: number }[] = [];
  const depth = (id: string): number => {
    const l = laneMap.get(id)!;
    return (
      l.placed.length +
      Math.max(
        0,
        ...f.links
          .filter(
            (k) => k.kind === "split" && l.placed.some((n) => n.id === k.from),
          )
          .map((k) => depth(nodeMap.get(k.to)!.timelineRef)),
      )
    );
  };
  function assign(id: string, preferred: number) {
    if (cols.has(id)) return;
    const l = laneMap.get(id)!,
      start = l.placed[0].row,
      end = l.placed.at(-1)!.row;
    let col = preferred;
    const free = (c: number) =>
      !occupied.some((o) => o.col === c && o.start <= end && o.end >= start);
    for (let distance = 1; !free(col); distance++)
      col =
        preferred + (distance % 2 ? -Math.ceil(distance / 2) : distance / 2);
    cols.set(id, col);
    occupied.push({ col, start, end });
    const children = f.links
      .filter(
        (k) => k.kind === "split" && l.placed.some((n) => n.id === k.from),
      )
      .map((k) => nodeMap.get(k.to)!.timelineRef)
      .sort((a, b) => depth(b) - depth(a));
    children.forEach((child) => assign(child, col));
  }
  active
    .filter(
      (l) =>
        !f.links.some(
          (k) => k.kind === "split" && l.placed.some((n) => n.id === k.to),
        ),
    )
    .forEach((l) => assign(l.id, 1));
  const min = Math.min(0, ...cols.values());
  for (const [id, col] of cols) cols.set(id, col - min);
  const width = Math.max(
    760,
    LEFT * 2 + (Math.max(0, ...cols.values()) + 1) * STEP - 70,
  );
  const rows = [
    ...new Set(
      f.nodes.filter((n) => !independent.has(n.timelineRef)).map((n) => n.row),
    ),
  ].sort((a, b) => a - b);
  const height = (id: string) => {
    const n = nodeMap.get(id)!,
      ev = events.get(n.eventRef)!;
    return (
      48 +
      wrapFlowText(ev.title, 29).length * 23 +
      wrapFlowText(ev.whenLabel ?? "", 34).length * 17
    );
  };
  const headingLines = wrapFlowText(
    story.title + " · " + f.title,
    Math.floor(width / 12),
  ).length;
  const introY = 36 + headingLines * 30 + 24;
  const yByRow = new Map<number, number>();
  let y = introY + 50;
  for (const row of rows) {
    yByRow.set(row, y);
    y +=
      Math.max(
        ...f.nodes
          .filter((n) => n.row === row && !independent.has(n.timelineRef))
          .map((n) => height(n.id)),
      ) + 88;
  }
  const nodes = f.nodes
    .filter((n) => !independent.has(n.timelineRef))
    .map((n) => ({
      ...n,
      x: LEFT + cols.get(n.timelineRef)! * STEP,
      y: yByRow.get(n.row)!,
      width: CARD,
      height: height(n.id),
      event: events.get(n.eventRef)!,
    }));
  const placed = new Map(nodes.map((n) => [n.id, n]));
  const links = [
    ...f.links.map((l) => ({ ...l, kind: l.kind as string })),
    ...active.flatMap((l) =>
      l.placed.slice(1).map((to, i) => ({
        id: `continue-${to.id}`,
        kind: "continuation",
        from: l.placed[i].id,
        to: to.id,
        label: "History continues",
        personRef: undefined,
      })),
    ),
  ];
  let exterior = 0;
  const routes = links.map((l) => {
    const a = placed.get(l.from)!,
      b = placed.get(l.to)!;
    const mid = a.y + a.height + 40;
    const points =
      l.kind === "travel" && b.y <= a.y
        ? [
            { x: a.x + CARD, y: a.y + a.height / 2 },
            { x: width + 40 + exterior++ * 30, y: a.y + a.height / 2 },
            { x: width + 40 + (exterior - 1) * 30, y: b.y - 25 },
            { x: b.x + CARD / 2, y: b.y - 25 },
            { x: b.x + CARD / 2, y: b.y },
          ]
        : [
            { x: a.x + CARD / 2, y: a.y + a.height },
            { x: a.x + CARD / 2, y: mid },
            { x: b.x + CARD / 2, y: mid },
            { x: b.x + CARD / 2, y: b.y },
          ];
    return { ...l, points };
  });
  const panels = lanes
    .filter((l) => independent.has(l.id))
    .map((l) => ({
      lane: l,
      event: events.get(l.placed[0].eventRef)!,
      node: l.placed[0],
    }));
  return {
    nodes,
    routes,
    panels,
    width: width + (exterior ? 70 + exterior * 30 : 0),
    chartEnd: y,
    cols,
    introY,
  };
}
function txt(
  copy: string,
  x: number,
  y: number,
  max: number,
  size = 16,
  color = "#263633",
  weight = 400,
) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${wrapFlowText(
    copy,
    max,
  )
    .map((s, i) => `<tspan x="${x}" dy="${i ? size + 6 : 0}">${e(s)}</tspan>`)
    .join("")}</text>`;
}
export function renderBranchSvg(story: Story): string {
  const g = layoutBranches(story),
    f = story.flowchart!;
  const marks = [
    txt(
      story.title + " · " + f.title,
      LEFT,
      36,
      Math.floor(g.width / 12),
      24,
      "#263633",
      700,
    ),
    txt(
      "Each fork creates distinct outcomes. A capped path stops where this perspective ends.",
      LEFT,
      g.introY,
      Math.floor(g.width / 7),
      14,
    ),
  ];
  for (const r of g.routes)
    marks.push(
      `<path data-link="${e(r.id)}" data-kind="${r.kind}" d="${r.points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")}" fill="none" stroke="${r.kind === "travel" ? BLUE : GREEN}" stroke-width="3" ${r.kind === "travel" ? 'stroke-dasharray="7 5"' : ""} marker-end="url(#branch-${r.kind === "travel" ? "travel" : "split"})"><title>${e(r.label)}</title></path>`,
    );
  for (const n of g.nodes) {
    const end = !g.routes.some((r) => r.from === n.id);
    marks.push(
      `<g data-node="${e(n.id)}"><title>${e(n.event.text)}</title><rect x="${n.x}" y="${n.y}" width="${CARD}" height="${n.height}" rx="10" fill="#fffefa" stroke="#99afa0"/>`,
      txt(n.event.whenLabel ?? "", n.x + 16, n.y + 25, 34, 12, "#586862"),
      txt(
        n.event.title,
        n.x + 16,
        n.y + 48 + wrapFlowText(n.event.whenLabel ?? "", 34).length * 17,
        29,
        17,
        "#263633",
        600,
      ),
      "</g>",
    );
    if (end)
      marks.push(
        `<path data-end="${e(n.id)}" d="M${n.x + CARD / 2} ${n.y + n.height}v18m-9 0h18" fill="none" stroke="#52685b" stroke-width="3"/>`,
      );
  }
  let y = g.chartEnd;
  for (const p of g.panels) {
    const body = p.event.text,
      max = Math.floor((g.width - 110) / 8),
      lines = wrapFlowText(body, max).length,
      ph = 100 + lines * 22;
    marks.push(
      `<g data-independent="${e(p.node.id)}"><rect x="${LEFT}" y="${y}" width="${g.width - LEFT * 2}" height="${ph}" rx="10" fill="#edf0ed"/>`,
      txt(p.lane.label, LEFT + 18, y + 30, max, 18, "#263633", 700),
      txt(body, LEFT + 18, y + 64, max, 16),
      "</g>",
    );
    y += ph + 24;
  }
  marks.push(
    txt(
      "Green forks: branching universes. Dashed blue arrows: a character crosses into another world.",
      LEFT,
      y + 20,
      Math.floor(g.width / 8),
      14,
    ),
  );
  y += 80;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="flow-svg" width="${g.width}" height="${y}" viewBox="0 0 ${g.width} ${y}" role="img" aria-labelledby="flow-title flow-desc"><title id="flow-title">${e(story.title + " — " + f.title)}</title><desc id="flow-desc">${e(f.description)}</desc><defs>${[
    ["split", GREEN],
    ["travel", BLUE],
  ]
    .map(
      ([id, c]) =>
        `<marker id="branch-${id}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="${c}"/></marker>`,
    )
    .join(
      "",
    )}</defs><rect width="100%" height="100%" fill="#faf9f4"/><g font-family="Arial,sans-serif">${marks.join("")}</g></svg>`;
}
export function renderBranchText(story: Story): string {
  const f = story.flowchart!,
    events = new Map(story.events.map((x) => [x.id, x]));
  return `<section class="flow-text"><h2>Read the branching diagram as text</h2><p>${e(f.description)}</p>${[
    ...f.nodes,
  ]
    .sort((a, b) => a.row - b.row)
    .map((n) => {
      const ev = events.get(n.eventRef)!;
      return `<section id="flow-note-${e(n.id)}"><h3>${e(ev.title)}</h3><p>${e(ev.whenLabel ?? "")}</p><p>${e(ev.text)}</p>${f.links
        .filter((k) => k.from === n.id)
        .map(
          (k) =>
            `<p>${k.kind === "split" ? "Branches to" : "Crosses to"} <a href="#flow-note-${e(k.to)}">${e(events.get(f.nodes.find((x) => x.id === k.to)!.eventRef)!.title)}</a> — ${e(k.label)}</p>`,
        )
        .join("")}</section>`;
    })
    .join(
      "",
    )}<h3>Sources</h3><ul>${(story.sources ?? []).map((s) => `<li>${e(s.title)} — ${e(s.locator)}<p>${e(s.note ?? "")}</p></li>`).join("")}</ul></section>`;
}
