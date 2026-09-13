import { validateStory, type Story } from "../content/story.ts";
import type { TimelineFlowchart } from "../content/flowchart.ts";
import { escapeHtml as e } from "./html.ts";

const INK = "#263633",
  GREEN = "#28745c",
  BLUE = "#265d9f",
  PURPLE = "#795386";
const originLabel = (origin: string) =>
  origin === "existing"
    ? "already exists"
    : origin === "split"
      ? "begins at a split"
      : "origin not established";
const routeColor = (kind: string) =>
  kind === "split" ? GREEN : kind === "travel" ? BLUE : PURPLE;
const CARD = 260,
  GAP = 82,
  LEFT = 36;
export function wrapFlowText(text: string, max = 30): string[] {
  const lines: string[] = [];
  let line = "";
  const width = (s: string) =>
    Array.from(s).reduce(
      (sum, c) =>
        sum +
        (/\s/.test(c)
          ? 0.34
          : /[MW@]/.test(c)
            ? 0.94
            : /[ilI.,'!:;]/.test(c)
              ? 0.3
              : c.codePointAt(0)! > 0x2e80
                ? 1
                : /[A-Z]/.test(c)
                  ? 0.67
                  : 0.56),
      0,
    );
  for (const word of text.split(/\s+/)) {
    if (line && width(line + " " + word) > max * 0.5) {
      lines.push(line);
      line = "";
    }
    for (const char of Array.from((line ? " " : "") + word)) {
      if (line && width(line + char) > max * 0.5) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
const text = (
  lines: string[],
  x: number,
  y: number,
  size = 16,
  color = INK,
  weight = 400,
  step = 22,
) =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? step : 0}">${e(line)}${i < lines.length - 1 ? " " : ""}</tspan>`).join("")}</text>`;

function checked(story: Story): TimelineFlowchart {
  const result = validateStory(story);
  if (!result.story || result.flowchartErrors.length || !story.flowchart)
    throw new Error("A valid authored timeline diagram is required.");
  return story.flowchart;
}
export function hasFlowchart(story: Story): boolean {
  const result = validateStory(story);
  return !!story.flowchart && !!result.story && !result.flowchartErrors.length;
}

/** Rows are compacted, so a large author-supplied row number cannot allocate a giant canvas. */
export function layoutFlowchart(story: Story) {
  const f = checked(story),
    events = new Map(story.events.map((ev) => [ev.id, ev]));
  const rowIds = [...new Set(f.nodes.map((n) => n.row))].sort((a, b) => a - b);
  const laneX = new Map(
    f.timelines.map((l, i) => [l.id, LEFT + i * (CARD + GAP)]),
  );
  const laneEnd = LEFT + f.timelines.length * (CARD + GAP) - GAP;
  const width = Math.max(800, laneEnd + 110 + f.links.length * 48);
  const topLines = wrapFlowText(
    story.title + " · " + f.title,
    Math.floor((width - 72) / 12),
  );
  const frameLines = wrapFlowText(f.frame, Math.floor((width - 72) / 7));
  const head = 80 + topLines.length * 30 + frameLines.length * 21;
  const laneHead = Math.max(
    ...f.timelines.map(
      (l) =>
        wrapFlowText(l.label, 27).length * 24 +
        wrapFlowText(l.description, 32).length * 20 +
        62,
    ),
  );
  // Reserve routing space only where a connector actually enters or leaves a row.
  const exits = new Map<number, number>(),
    entries = new Map<number, number>();
  f.links.forEach((link, i) => {
    const from = f.nodes.find((n) => n.id === link.from)!;
    const to = f.nodes.find((n) => n.id === link.to)!;
    exits.set(from.row, Math.max(exits.get(from.row) ?? 0, 28 + i * 18));
    if (link.kind !== "split")
      entries.set(to.row, Math.max(entries.get(to.row) ?? 0, 28 + i * 18));
  });
  let y = head + laneHead + Math.max(48, (entries.get(rowIds[0]) ?? 0) + 20);
  const heights = new Map(
    rowIds.map((row) => [
      row,
      Math.max(
        ...f.nodes
          .filter((n) => n.row === row)
          .map((n) => {
            const ev = events.get(n.eventRef)!;
            return (
              46 +
              wrapFlowText(ev.title, 27).length * 24 +
              wrapFlowText(ev.whenLabel ?? "Selected moment", 32).length * 19
            );
          }),
      ),
    ]),
  );
  const rowY = new Map<number, number>();
  for (const [index, row] of rowIds.entries()) {
    rowY.set(row, y);
    y +=
      heights.get(row)! +
      Math.max(
        48,
        (exits.get(row) ?? 0) + (entries.get(rowIds[index + 1]) ?? 0) + 20,
      );
  }
  const nodes = f.nodes.map((n) => ({
    ...n,
    x: laneX.get(n.timelineRef)!,
    y: rowY.get(n.row)!,
    width: CARD,
    height: heights.get(n.row)!,
    event: events.get(n.eventRef)!,
  }));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let splitNumber = 0,
    travelNumber = 0,
    sequenceNumber = 0;
  const routes = f.links.map((link, i) => {
    const from = nodeMap.get(link.from)!,
      to = nodeMap.get(link.to)!;
    const code =
      link.kind === "split"
        ? `S${++splitNumber}`
        : link.kind === "travel"
          ? `T${++travelNumber}`
          : `R${++sequenceNumber}`;
    if (link.kind === "split") {
      const sy = from.y + from.height + 24 + i * 18;
      return {
        ...link,
        code,
        points: [
          { x: from.x + CARD / 2, y: from.y + from.height },
          { x: from.x + CARD / 2, y: sy },
          { x: to.x + CARD / 2, y: sy },
          { x: to.x + CARD / 2, y: to.y },
        ],
        badge: { x: (from.x + to.x + CARD) / 2, y: sy },
      };
    }
    // Every trip has its own exterior track; horizontal legs use empty row gutters.
    const x = laneEnd + 48 + i * 48,
      fx = from.x + CARD + 18,
      tx = to.x + CARD + 36;
    const sy = from.y + from.height + 28 + i * 18,
      ty = to.y - 28 - i * 18;
    return {
      ...link,
      code,
      points: [
        { x: from.x + CARD, y: from.y + from.height / 2 },
        { x: fx, y: from.y + from.height / 2 },
        { x: fx, y: sy },
        { x, y: sy },
        { x, y: ty },
        { x: tx, y: ty },
        { x: tx, y: to.y + to.height / 2 },
        { x: to.x + CARD, y: to.y + to.height / 2 },
      ],
      badge: { x, y: (sy + ty) / 2 },
    };
  });
  return {
    f,
    nodes,
    routes,
    laneX,
    head,
    laneHead,
    topLines,
    frameLines,
    width,
    chartEnd: Math.max(
      ...nodes.map(
        (n) => n.y + n.height + Math.max(30, (exits.get(n.row) ?? 0) + 20),
      ),
    ),
  };
}

export function renderFlowSvg(story: Story, draft = true): string {
  const g = layoutFlowchart(story),
    { f } = g;
  const marks: string[] = [];
  marks.push(
    text(
      [
        draft
          ? "EDITORIAL PREVIEW · FULL SPOILERS"
          : "TIMELINE DIAGRAM · FULL SPOILERS",
      ],
      LEFT,
      30,
      12,
      "#586862",
      700,
    ),
  );
  marks.push(text(g.topLines, LEFT, 65, 24, INK, 700, 30));
  marks.push(
    text(
      g.frameLines,
      LEFT,
      78 + g.topLines.length * 30,
      14,
      "#586862",
      400,
      21,
    ),
  );
  for (const lane of f.timelines) {
    const x = g.laneX.get(lane.id)!,
      title = wrapFlowText(lane.label, 27),
      notes = wrapFlowText(lane.description, 32);
    marks.push(
      `<rect x="${x}" y="${g.head}" width="${CARD}" height="${g.laneHead}" rx="12" fill="${lane.origin === "split" ? "#e6f1e9" : "#edf0ed"}"/>`,
    );
    marks.push(text(title, x + 14, g.head + 26, 17, INK, 700, 24));
    marks.push(
      text(
        [originLabel(lane.origin).toUpperCase()],
        x + 14,
        g.head + title.length * 24 + 26,
        11,
        lane.origin === "split" ? GREEN : "#586862",
        700,
      ),
    );
    marks.push(
      text(
        notes,
        x + 14,
        g.head + title.length * 24 + 51,
        13,
        "#586862",
        400,
        20,
      ),
    );
    const placed = g.nodes
      .filter((n) => n.timelineRef === lane.id)
      .sort((a, b) => a.row - b.row);
    const first = placed[0],
      last = placed[placed.length - 1];
    const start = lane.origin === "existing" ? g.head + g.laneHead : first.y;
    marks.push(
      `<path data-timeline="${e(lane.id)}" data-origin="${lane.origin}" d="M${x + CARD / 2} ${start}V${last.y + last.height}" fill="none" stroke="#a5b4ab" stroke-width="3" ${lane.origin === "unspecified" ? 'stroke-dasharray="3 5"' : ""}/>`,
    );
    for (let i = 0; i < placed.length - 1; i++) {
      const from = placed[i],
        to = placed[i + 1];
      marks.push(
        `<path d="M${x + CARD / 2} ${from.y + from.height + 2}V${to.y - 6}" fill="none" stroke="#a5b4ab" stroke-width="2" marker-end="url(#flow-order)"/>`,
      );
    }
  }
  for (const route of g.routes) {
    const color = routeColor(route.kind);
    marks.push(
      `<path data-link="${e(route.id)}" data-kind="${route.kind}" d="${route.points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" ${route.kind === "travel" ? 'stroke-dasharray="8 5"' : route.kind === "sequence" ? 'stroke-dasharray="2 6"' : ""} marker-end="url(#flow-${route.kind})"/>`,
    );
  }
  for (const n of g.nodes) {
    marks.push(
      `<g data-node="${e(n.id)}"><title>${e(n.event.title + ": " + n.event.text)}</title><rect x="${n.x}" y="${n.y}" width="${CARD}" height="${n.height}" rx="9" fill="#fffefa" stroke="#aab7ae"/>`,
    );
    const when = wrapFlowText(n.event.whenLabel ?? "Selected moment", 32);
    marks.push(text(when, n.x + 14, n.y + 25, 12, "#586862", 400, 19));
    marks.push(
      text(
        wrapFlowText(n.event.title, 27),
        n.x + 14,
        n.y + 45 + when.length * 19,
        17,
        INK,
        600,
        24,
      ),
    );
    marks.push("</g>");
  }
  for (const r of g.routes)
    marks.push(
      `<g><rect x="${r.badge.x - 19}" y="${r.badge.y - 12}" width="38" height="24" rx="12" fill="${routeColor(r.kind)}"/><text x="${r.badge.x}" y="${r.badge.y + 5}" text-anchor="middle" font-size="12" font-weight="700" fill="white">${r.code}</text></g>`,
    );
  let y = g.chartEnd + 38;
  const note = (copy: string, size = 14, color = INK, weight = 400) => {
    const lines = wrapFlowText(
      copy,
      Math.floor((g.width - 72) / (size * 0.62)),
    );
    marks.push(text(lines, LEFT, y, size, color, weight, size + 7));
    y += lines.length * (size + 7) + 12;
  };
  note("READING THE DIAGRAM", 12, "#586862", 700);
  note(
    "Grey line: order within a lane. Solid green arrow: a new timeline splits off. Dashed blue arrow: a named person travels.",
    14,
  );
  if (f.links.some((l) => l.kind === "sequence"))
    note(
      "Dotted purple arrow: reading order only. It does not establish travel, survival or the creation of a world.",
      14,
    );
  if (f.timelines.some((l) => l.origin === "unspecified"))
    note(
      "Origin not established: a sequence whose relationship to other worlds remains unresolved. A separate lane is not proof of a separate universe.",
      14,
    );
  note(
    "Rows and spacing are arranged for reading, not a measured time axis. Separate lanes do not imply simultaneous events.",
    13,
    "#586862",
  );
  for (const r of g.routes) {
    const from = g.nodes.find((n) => n.id === r.from)!,
      to = g.nodes.find((n) => n.id === r.to)!;
    const lane = (id: string) => f.timelines.find((l) => l.id === id)!.label;
    const person = story.people?.find((p) => p.id === r.personRef)?.name;
    note(
      `${r.code} · ${r.kind === "split" ? "SPLIT" : r.kind === "sequence" ? "READING ORDER" : `TRAVEL — ${person}`}: ${r.label}`,
      15,
      routeColor(r.kind),
      600,
    );
    note(
      `${lane(from.timelineRef)}: ${from.event.title} → ${lane(to.timelineRef)}: ${to.event.title}`,
      13,
      "#586862",
    );
  }
  note(f.description, 14);
  note(story.scope, 12, "#586862");
  if (draft)
    note(
      "Source and reader reviews pending. This diagram is an authored interpretation of the stated scope.",
      12,
      "#586862",
    );
  const desc = [
    f.description,
    ...g.routes.map((r) => `${r.code}: ${r.label}`),
  ].join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="flow-svg" width="${g.width}" height="${y + 16}" viewBox="0 0 ${g.width} ${y + 16}" role="img" aria-labelledby="flow-title flow-desc"><title id="flow-title">${e(story.title + " — " + f.title)}</title><desc id="flow-desc">${e(desc)}</desc><defs>${[
    ["split", GREEN],
    ["travel", BLUE],
    ["sequence", PURPLE],
    ["order", "#a5b4ab"],
  ]
    .map(
      ([id, color]) =>
        `<marker id="flow-${id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0 0L8 4L0 8Z" fill="${color}"/></marker>`,
    )
    .join(
      "",
    )}</defs><rect width="100%" height="100%" fill="#faf9f4"/><g font-family="Arial, sans-serif">${marks.join("")}</g></svg>`;
}

export const flowStyles = `.flow-viewport{overflow:auto;border:1px solid #d6dfd8;border-radius:12px;background:#faf9f4;max-width:100%}.flow-svg{display:block;width:100%;min-width:720px;height:auto}.flow-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:20px 0}.flow-tools button,.flow-tools a{font:inherit;padding:9px 13px;border:1px solid #9aaea2;background:#fffefa;color:#225740;border-radius:6px;text-decoration:none}.flow-tools button:focus-visible,.flow-tools a:focus-visible,.flow-viewport:focus-visible{outline:3px solid #265d9f;outline-offset:3px}.flow-text{max-width:85ch}.flow-text li{margin-bottom:18px}.flow-text h3{margin-top:28px}.flow-text p{line-height:1.6}.flow-text [id]{scroll-margin-top:24px}@media print{.flow-tools,.flow-help{display:none!important}.flow-viewport{overflow:visible;border:0;break-inside:avoid}.flow-svg{width:100%!important;min-width:0!important;max-height:245mm}.flow-text{break-before:page}body{background:white!important}h2,h3{break-after:avoid}@page{size:A3 landscape;margin:12mm}}`;

export function renderFlowText(story: Story): string {
  const f = checked(story),
    g = layoutFlowchart(story);
  const lane = (id: string) => f.timelines.find((l) => l.id === id)!.label;
  return `<section class="flow-text"><h2>Read the diagram as text</h2><p>${e(f.description)}</p>${f.timelines
    .map(
      (l) =>
        `<section><h3>${e(l.label)} · ${originLabel(l.origin)}</h3><p>${e(l.description)}</p><ol>${g.nodes
          .filter((n) => n.timelineRef === l.id)
          .sort((a, b) => a.row - b.row)
          .map(
            (n) =>
              `<li id="flow-note-${e(n.id)}"><strong>${e(n.event.title)}</strong>${n.event.whenLabel ? ` — ${e(n.event.whenLabel)}` : ""}<p>${e(n.event.text)}</p></li>`,
          )
          .join("")}</ol></section>`,
    )
    .join("")}${
    g.routes.length
      ? `<h3>Diagram connections</h3><ol>${g.routes
          .map((r) => {
            const from = g.nodes.find((n) => n.id === r.from)!,
              to = g.nodes.find((n) => n.id === r.to)!;
            return `<li><strong>${r.code} · ${r.kind === "split" ? "Split" : r.kind === "sequence" ? "Reading order only" : `Travel: ${e(story.people?.find((p) => p.id === r.personRef)?.name)}`}</strong><p>${e(r.label)}</p><p><a href="#flow-note-${e(from.id)}">${e(lane(from.timelineRef))}: ${e(from.event.title)}</a> → <a href="#flow-note-${e(to.id)}">${e(lane(to.timelineRef))}: ${e(to.event.title)}</a></p></li>`;
          })
          .join("")}</ol>`
      : ""
  }<h3>Where it leaves us</h3><p>${e(story.ending)}</p><h3>Sources and interpretation</h3><ul>${(story.sources ?? []).map((s) => `<li>${/^https?:\/\//i.test(s.locator) ? `<a href="${e(s.locator)}" rel="noopener noreferrer">${e(s.title)}</a>` : `<strong>${e(s.title)}</strong> — ${e(s.locator)}`}<p>${e(s.note ?? "")}</p></li>`).join("")}</ul></section>`;
}

export function renderFlowPage(story: Story, draft = true): string {
  const f = checked(story),
    svg = renderFlowSvg(story, draft);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(story.title)} — Timeline diagram</title><style>body{margin:0;background:#faf9f4;color:${INK};font:16px/1.6 system-ui,sans-serif}main{max-width:1440px;padding:32px;margin:auto}h1{font:600 clamp(30px,4vw,48px)/1.15 Georgia,serif;margin:20px 0}a{color:${BLUE}}.flow-intro{max-width:85ch}.flow-status{font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:#586862}@media(max-width:600px){main{padding:18px}}${flowStyles}</style></head><body><main data-filename="${e(story.id)}-timeline"><p class="flow-status">${draft ? "Editorial preview · source and reader reviews pending" : "Timeline diagram"} · Full spoilers</p><h1>${e(story.title)}<br>${e(f.title)}</h1><p class="flow-intro">${e(f.description)}</p><p class="flow-intro"><strong>Reading frame:</strong> ${e(f.frame)}</p><p class="flow-help">Follow each lane downwards. Trace the numbered arrows using the key below. Scroll sideways for a wide diagram, or use the text version.</p><div class="flow-tools"><a href="#flow-text">Text version</a><a href="data:image/svg+xml;charset=utf-8,${e(encodeURIComponent(svg))}" download="${e(story.id)}-timeline.svg">Download SVG</a><button id="save-page" hidden>Save standalone page</button><button id="flow-print" hidden>Print / save PDF</button><button id="flow-fit" hidden>Fit width</button><button id="flow-larger" hidden>Zoom in</button><button id="flow-smaller" hidden>Zoom out</button></div><div class="flow-viewport" tabindex="0" role="region" aria-label="Timeline diagram; scroll horizontally if needed">${svg}</div><div id="flow-text">${renderFlowText(story)}</div></main><script>${flowScript}</script></body></html>`;
}
const flowScript = `const box=document.querySelector('.flow-viewport'),svg=box.querySelector('svg');document.querySelectorAll('.flow-tools button').forEach(b=>b.hidden=false);document.getElementById('flow-fit').onclick=()=>{svg.style.width='100%';svg.style.minWidth='0'};function zoom(f){svg.style.width=Math.max(320,Math.min(6000,svg.getBoundingClientRect().width*f))+'px';svg.style.minWidth='0'}document.getElementById('flow-larger').onclick=()=>zoom(1.25);document.getElementById('flow-smaller').onclick=()=>zoom(.8);document.getElementById('flow-print').onclick=()=>window.print();document.getElementById('save-page').onclick=()=>{const url=URL.createObjectURL(new Blob(['<!doctype html>'+document.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=document.querySelector('main').dataset.filename+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};`;
