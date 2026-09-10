/**
 * Timelines — browser front end for the tt-ont-render compiler.
 *
 * The compiler itself is the bundle built from src/render.ts: this file only
 * picks inputs (a corpus story, a dropped/pasted scheme file), calls render()
 * and puts the result on screen. No network beyond fetching the corpus JSON
 * that ships beside this page, and the three.js CDN the 3D profile's own HTML
 * imports.
 */
import { render, listProfiles } from './renderer.js';

const $ = (id) => document.getElementById(id);
const state = { story: null, storyId: '', source: '', profile: 'counterpoint', doc: null, audit: null, scene: null, zoom: 1, autoFit: true };

const PROFILES = listProfiles().map(p => ({ id: p.id, label: p.label, medium: p.medium, affinity: p.topoAffinity }));
const MEDIUM_LABEL = { '2d-svg': '2d', '2.5d-svg': '2.5d', '3d-html': '3d' };

/* ---------------- profiles ---------------- */
function drawProfiles() {
  const host = $('profiles');
  host.innerHTML = '';
  for (const p of PROFILES) {
    const b = document.createElement('button');
    b.className = 'prof' + (p.id === state.profile ? ' on' : '');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.innerHTML = `<span class="n">${p.label}</span><span class="k">${MEDIUM_LABEL[p.medium] ?? p.medium}</span>`;
    b.title = `designed for ${p.affinity.join(', ') || 'any topology'}`;
    b.onclick = () => { state.profile = p.id; state.autoFit = true; drawProfiles(); go(); };
    host.appendChild(b);
  }
}

/* ---------------- corpus ---------------- */
async function loadManifest() {
  try {
    const res = await fetch('./corpus/manifest.json');
    if (!res.ok) throw new Error(String(res.status));
    const list = await res.json();
    state.manifest = list;
    $('corpusCount').textContent = `${list.length}`;
    drawStories('');
  } catch {
    $('corpusCount').textContent = 'unavailable';
    $('stories').innerHTML = '<li class="m" style="color:#5d5a55;padding:8px">No corpus beside this page — drop a scheme file instead.</li>';
  }
}

function drawStories(filter) {
  const host = $('stories');
  const q = filter.trim().toLowerCase();
  const list = (state.manifest ?? []).filter(s =>
    !q || s.title.toLowerCase().includes(q) || s.id.includes(q) || s.topology.includes(q) || s.physics.includes(q));
  host.innerHTML = '';
  for (const s of list) {
    const li = document.createElement('li');
    li.className = s.id === state.storyId ? 'on' : '';
    li.dataset.id = s.id;
    li.innerHTML = `<span class="t">${escapeHtml(s.title)}</span><span class="m">${s.topology || '—'} · ${s.events} events${s.described && s.described !== s.events ? ` · ${s.described} described` : ''}</span>`;
    li.onclick = () => loadStory(s.id, s.title);
    host.appendChild(li);
  }
}

async function loadStory(id, title) {
  try {
    const res = await fetch(`./corpus/${encodeURIComponent(id)}.json`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const story = await res.json();
    setStory(story, id, title ? `${title} — corpus` : id);
  } catch (err) {
    note(`Could not load ${id}: ${err.message}`);
  }
}

function setStory(story, id, source) {
  const problem = describeSchemeProblem(story);
  if (problem) { note(problem); return; }
  state.story = story; state.storyId = id; state.source = source; state.autoFit = true;
  note(`${source}`);
  for (const li of $('stories').children) li.classList.toggle('on', li.dataset.id === id);
  go();
}

/** Cheap shape check so a wrong file gives a sentence, not a stack trace. */
function describeSchemeProblem(story) {
  if (story === null || typeof story !== 'object' || Array.isArray(story)) return 'That is not a scheme object.';
  if (!story.topologyPatternId) return 'Missing topologyPatternId — this does not look like a scheme file.';
  if (!story.primaryRuleSetId) return 'Missing primaryRuleSetId.';
  if (!Array.isArray(story.worlds) || !story.worlds.length) return 'Missing worlds[].';
  if (!Array.isArray(story.events)) return 'Missing events[].';
  if (!Array.isArray(story.edges)) return 'Missing edges[].';
  return '';
}

/* ---------------- render ---------------- */
function go() {
  if (!state.story) return;
  let out;
  try {
    out = render({ story: state.story, storyId: state.storyId, profile: state.profile });
  } catch (err) {
    showEmpty(`Render failed: ${err.message}`);
    return;
  }
  state.doc = out.doc; state.audit = out.audit; state.scene = out.scene;
  $('empty').classList.add('hidden');

  if (out.doc.medium === '3d-html') {
    $('canvas').classList.add('hidden');
    const frame = $('frame');
    frame.classList.remove('hidden');
    frame.srcdoc = out.doc.doc;
  } else {
    $('frame').classList.add('hidden');
    $('frame').srcdoc = '';
    const canvas = $('canvas');
    canvas.classList.remove('hidden');
    canvas.innerHTML = out.doc.doc;
    if (state.autoFit) fit();
    else applyZoom();
  }
  $('download').disabled = false;
  $('open').disabled = false;
  drawFacts(out);
  drawAudit(out);
}

function showEmpty(msg) {
  $('empty').classList.remove('hidden');
  $('empty').innerHTML = `<p class="big">${escapeHtml(msg)}</p>`;
  $('canvas').classList.add('hidden');
  $('frame').classList.add('hidden');
  $('download').disabled = true;
  $('open').disabled = true;
}

function fit() {
  const svg = $('canvas').querySelector('svg');
  if (!svg) return;
  const nat = Number(svg.getAttribute('width')) || svg.viewBox.baseVal.width;
  const avail = $('viewport').clientWidth - 72;
  state.zoom = Math.min(1, Math.max(0.1, avail / nat));
  state.autoFit = true;
  applyZoom();
}

function applyZoom() {
  const svg = $('canvas').querySelector('svg');
  if (!svg) return;
  const w = Number(svg.getAttribute('width')) || svg.viewBox.baseVal.width;
  const h = Number(svg.getAttribute('height')) || svg.viewBox.baseVal.height;
  svg.style.width = `${w * state.zoom}px`;
  svg.style.height = `${h * state.zoom}px`;
  $('zoom').value = String(Math.round(state.zoom * 100));
  $('zoomVal').textContent = `${Math.round(state.zoom * 100)}%`;
}

function drawFacts(out) {
  const f = out.scene.facts;
  const unresolved = f.events.filter(e => !e.order).length;
  const described = f.events.filter(e => e.description).length;
  const errors = out.audit.issues.filter(i => i.severity === 'error').length;
  const warnings = out.audit.issues.filter(i => i.severity === 'warning').length;
  const prof = PROFILES.find(p => p.id === state.profile);
  const affin = prof && !prof.affinity.includes(f.topologyPatternId);
  const cell = (k, v) => `<div class="fact"><b>${k}</b>${escapeHtml(String(v))}</div>`;
  $('facts').innerHTML = [
    cell('work', state.source.replace(/ — corpus$/, '')),
    cell('topology', f.topologyPatternId),
    cell('physics', f.primaryRuleSetId + (f.mixinRuleSetIds.length ? ` + ${f.mixinRuleSetIds.join(' + ')}` : '')),
    cell('worlds', `${f.worlds.length} · agents ${f.agents.length}`),
    cell('events', `${f.events.length}${unresolved ? ` · ${unresolved} unplaced` : ''}`),
    cell('edges', f.edges.length),
    cell('described', `${described}/${f.events.length}`),
    cell('profile', `${state.profile}${affin ? ' (outside declared affinity)' : ''}`),
    cell('audit', `${errors} error${errors === 1 ? '' : 's'} · ${warnings} warning${warnings === 1 ? '' : 's'}`),
    cell('medium', out.doc.medium),
  ].join('');
}

function drawAudit(out) {
  const order = { error: 0, warning: 1, info: 2 };
  const issues = [...out.audit.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  const inv = out.invariants;
  const parts = [];
  if (!inv.ok) {
    for (const v of inv.violations) parts.push(`<div class="issue error"><span class="lv">invariant</span>${escapeHtml(v)}</div>`);
  }
  for (const i of issues) {
    parts.push(`<div class="issue ${i.severity}"><span class="lv">${i.severity}</span>${escapeHtml(i.code)}: ${escapeHtml(i.message)}</div>`);
  }
  if (!parts.length) parts.push('<div class="none">No audit issues — every reference in this scheme resolves.</div>');
  $('audit').innerHTML = parts.join('');
}

/* ---------------- input plumbing ---------------- */
function note(msg) { $('sourceNote').textContent = msg; }

function readFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      setStory(JSON.parse(String(reader.result)), file.name.replace(/\.json$/, ''), `${file.name} (${file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(0)} KB`}, local file)`);
    } catch (err) {
      note(`${file.name} is not valid JSON: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

$('file').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) readFile(f); });
$('pasteToggle').onclick = () => $('pasteWrap').classList.toggle('hidden');
$('pasteLoad').onclick = () => {
  try {
    const story = JSON.parse($('paste').value);
    setStory(story, 'pasted', 'pasted scheme');
  } catch (err) {
    note(`Pasted text is not valid JSON: ${err.message}`);
  }
};
const drop = $('drop');
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
drop.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) readFile(f); });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) readFile(f);
});
$('search').addEventListener('input', (e) => drawStories(e.target.value));
$('zoom').addEventListener('input', (e) => { state.autoFit = false; state.zoom = Number(e.target.value) / 100; applyZoom(); });
$('fit').onclick = () => fit();
window.addEventListener('resize', () => { if (state.autoFit) fit(); });

function download() {
  if (!state.doc) return;
  const is3d = state.doc.medium === '3d-html';
  const ext = is3d ? 'html' : 'svg';
  const blob = new Blob([state.doc.doc], { type: is3d ? 'text/html' : 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.storyId || 'scheme'}-${state.profile}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('download').onclick = download;
$('open').onclick = () => {
  if (!state.doc) return;
  const is3d = state.doc.medium === '3d-html';
  const blob = new Blob([state.doc.doc], { type: is3d ? 'text/html' : 'image/svg+xml' });
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
};

drawProfiles();
loadManifest();
