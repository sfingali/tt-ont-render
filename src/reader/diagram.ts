import type { Story } from "../content/story.ts";
import { escapeHtml as e } from "./render.ts";

/** A portable local explanation: labels and arrow direction survive export. */
export function renderDiagram(story: Story, eventId: string): string {
  const event = story.events.find((ev) => ev.id === eventId);
  if (!event) throw new Error("Unknown event");
  const wrap = (text: string, max = 60) => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      if (line && (line + " " + word).length > max) {
        lines.push(line);
        line = "";
      }
      if (word.length > max) {
        if (line) {
          lines.push(line);
          line = "";
        }
        for (let i = 0; i < word.length; i += max)
          lines.push(word.slice(i, i + max));
      } else line += (line ? " " : "") + word;
    }
    if (line) lines.push(line);
    return lines;
  };
  let y = 48;
  const marks: string[] = [];
  const text = (copy: string, size = 18, color = "#282c29", weight = 400) => {
    for (const line of wrap(copy, size > 22 ? 38 : 66)) {
      marks.push(
        `<text x="36" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${e(line)}</text>`,
      );
      y += size * 1.5;
    }
  };
  text(story.title, 18, "#54675e", 700);
  text(event.title, 28, "#282c29", 700);
  y += 12;
  const links = (story.connections ?? []).filter(
    (c) => c.fromEvent === eventId || c.toEvent === eventId,
  );
  for (const c of links) {
    text(
      c.kind === "journey"
        ? "JOURNEY"
        : c.kind === "reset"
          ? "REPEATING POINT"
          : "CONSEQUENCE",
      14,
      "#54675e",
      700,
    );
    text(c.label, 20, "#282c29", 600);
    y += 8;
    const from = story.events.find((ev) => ev.id === c.fromEvent)!,
      to = story.events.find((ev) => ev.id === c.toEvent)!;
    text(`${from.whenLabel ?? "From"} — ${from.title}`);
    marks.push(
      `<path d="M48 ${y - 10}v24m-6-6 6 6 6-6" fill="none" stroke="#38634e" stroke-width="2"/>`,
    );
    y += 38;
    text(`${to.whenLabel ?? "To"} — ${to.title}`);
    if (c.kind === "reset" && c.retainedText) text(c.retainedText, 16);
    y += 32;
  }
  if (!links.length) text(event.text);
  text(
    "Selected connections, not a complete timeline. Spacing does not measure time.",
    14,
    "#54675e",
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${Math.ceil(y + 24)}" viewBox="0 0 800 ${Math.ceil(y + 24)}" role="img" aria-labelledby="title description"><title id="title">${e(story.title)}: ${e(event.title)}</title><desc id="description">${e(links.map((c) => c.label).join(" ") || event.text)}</desc><rect width="100%" height="100%" fill="#faf8f2"/><g font-family="Arial, sans-serif">${marks.join("")}</g></svg>`;
}
