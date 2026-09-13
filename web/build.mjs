#!/usr/bin/env node
/** Build authored, readable HTML first. Keep the ontology viewer under /legacy. */
import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url)),
  ROOT = resolve(HERE, ".."),
  DIST = join(HERE, "dist");
const catalog = JSON.parse(
  await readFile(join(ROOT, "content/catalog.json"), "utf8"),
);
const release = process.argv.includes("--release");
if (
  release &&
  catalog.some(
    (s) => s.sourceReview !== "passed" || s.readerReview !== "passed",
  )
)
  throw new Error(
    "Release blocked: complete source and reader review in content/catalog.json. Preview builds remain available.",
  );
// DIST is a fixed child of this script's directory, never supplied by content.
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
const bundle = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  logLevel: "warning",
};
const server = await build({
  ...bundle,
  entryPoints: [join(ROOT, "src/reader/render.ts")],
  write: false,
});
const renderer = await import(
  `data:text/javascript;base64,${Buffer.from(server.outputFiles[0].text).toString("base64")}`
);
const contract = await build({
  ...bundle,
  entryPoints: [join(ROOT, "src/content/story.ts")],
  write: false,
});
const { validateStory } = await import(
  `data:text/javascript;base64,${Buffer.from(contract.outputFiles[0].text).toString("base64")}`
);
const diagram = await build({
  ...bundle,
  entryPoints: [join(ROOT, "src/reader/diagram.ts")],
  write: false,
});
const { renderDiagram } = await import(
  `data:text/javascript;base64,${Buffer.from(diagram.outputFiles[0].text).toString("base64")}`
);
const stories = [];
for (const entry of [
  ...catalog,
  { id: "the-observatory-door", example: true },
]) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(entry.id))
    throw new Error("Invalid catalog ID");
  const raw = await readFile(
    entry.example
      ? join(ROOT, "examples/branching-guide.json")
      : join(ROOT, "content/stories", `${entry.id}.json`),
    "utf8",
  );
  const result = validateStory(JSON.parse(raw));
  if (!result.story) throw new Error(JSON.stringify(result.errors));
  if (result.flowchartErrors.length)
    throw new Error(
      `Invalid timeline diagram in ${entry.id}: ${JSON.stringify(result.flowchartErrors)}`,
    );
  if (Object.keys(result.viewErrors).length)
    throw new Error(
      `Invalid optional view in ${entry.id}: ${JSON.stringify(result.viewErrors)}`,
    );
  if (result.story.id !== entry.id || stories.some((s) => s.id === entry.id))
    throw new Error(`Catalog ID mismatch or duplicate: ${entry.id}`);
  if (!entry.example) stories.push(result.story);
  await mkdir(join(DIST, "read", entry.id), { recursive: true });
  await mkdir(join(DIST, "stories"), { recursive: true });
  await writeFile(
    join(DIST, "read", entry.id, "index.html"),
    renderer.renderStoryPage(result.story, !release || entry.example),
  );
  if (result.story.flowchart) {
    await writeFile(
      join(DIST, "read", entry.id, "timeline.html"),
      renderer.renderFlowPage(result.story, !release || entry.example),
    );
    await writeFile(
      join(DIST, "read", entry.id, "timeline.svg"),
      renderer.renderFlowSvg(result.story, !release || entry.example),
    );
  }
  await writeFile(join(DIST, "stories", `${entry.id}.json`), raw);
  await mkdir(join(DIST, "diagrams", entry.id), { recursive: true });
  for (const event of result.story.events)
    await writeFile(
      join(DIST, "diagrams", entry.id, `${event.id}.svg`),
      renderDiagram(result.story, event.id),
    );
}
await writeFile(
  join(DIST, "index.html"),
  renderer.renderLibrary(stories, !release),
);
await writeFile(join(DIST, "edit.html"), renderer.renderEditor());
await mkdir(join(DIST, "examples"), { recursive: true });
await cp(
  join(ROOT, "examples/branching-guide.json"),
  join(DIST, "examples/branching-guide.json"),
);
await cp(join(HERE, "reader.css"), join(DIST, "reader.css"));
await cp(join(HERE, "favicon.svg"), join(DIST, "favicon.svg"));
await build({
  ...bundle,
  entryPoints: [join(ROOT, "src/reader/app.ts")],
  outfile: join(DIST, "reader.js"),
});
await build({
  ...bundle,
  entryPoints: [join(ROOT, "src/reader/editor.ts")],
  outfile: join(DIST, "editor.js"),
});
const legacy = join(DIST, "legacy");
await mkdir(join(legacy, "corpus"), { recursive: true });
await build({
  ...bundle,
  entryPoints: [join(ROOT, "src/render.ts")],
  outfile: join(legacy, "renderer.js"),
});
for (const file of ["index.html", "app.js", "style.css", "favicon.svg"])
  await cp(join(HERE, file), join(legacy, file));
const corpus = existsSync(join(ROOT, "../tt-ont/instances"))
  ? join(ROOT, "../tt-ont/instances")
  : join(ROOT, "fixtures");
const manifest = [];
if (!process.argv.includes("--no-corpus"))
  for (const file of (await readdir(corpus)).filter(
    (f) => f.endsWith(".json") && f !== "manifest.json",
  )) {
    const raw = await readFile(join(corpus, file), "utf8");
    let s;
    try {
      s = JSON.parse(raw);
    } catch {
      continue;
    }
    await writeFile(join(legacy, "corpus", file), raw);
    manifest.push({
      id: file.replace(/\.json$/, ""),
      title: s.meta?.title ?? file,
      topology: s.topologyPatternId ?? "",
      physics: s.primaryRuleSetId ?? "",
      worlds: s.worlds?.length ?? 0,
      events: s.events?.length ?? 0,
      described: (s.events ?? []).filter((e) => e.description).length,
      bytes: raw.length,
    });
  }
manifest.sort((a, b) => a.title.localeCompare(b.title));
await writeFile(join(legacy, "corpus/manifest.json"), JSON.stringify(manifest));
console.log(
  `Built ${stories.length} authored guides and ${manifest.length} legacy records in web/dist. ${process.argv.includes("--release") ? "Release checks passed." : "Editorial preview; reviews pending."}`,
);
