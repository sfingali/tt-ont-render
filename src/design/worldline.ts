/**
 * DESIGN — "Worldline Loom" (three.js sculpture).
 * Affinity: worldline_bundle (esp. observer_persistent agents + divergenceMagnitude payloads).
 * X = world-time position (causal layer — derived, labeled), Y = world lane,
 * Z = lived order (encoded ordinal where present, else declared reference).
 * Deterministic geometry; interactions defined inline; no external assets.
 */
import type { DesignProfile, ThemeSpec } from './registry.ts';
import { esc } from './registry.ts';
import type { SemanticScene } from '../engine/types.ts';

export const worldline: DesignProfile = {
  id: 'worldline',
  label: 'Worldline Loom',
  medium: '3d-html',
  topoAffinity: ['worldline_bundle', 'single_fixed_timeline'],
  render(scene: SemanticScene, theme: ThemeSpec) {
    const facts = scene.facts;
    const W = 1500, H = 940;

    // per-world Y lanes; events X by causal layer, Z by encoded ordinal (lived proxy)
    const worlds = facts.worlds;
    const yLane = new Map<string, number>();
    worlds.forEach((w, i) => yLane.set(w.id, i));

    const causalLayer = new Map(
      scene.nodes.filter(n => n.kind === 'eventNode' && n.sourceId)
        .map(n => [n.sourceId as string, typeof n.data['causalLayer'] === 'number' ? n.data['causalLayer'] as number : 0]),
    );

    const payload = {
      worlds: worlds.map(w => ({ id: w.id, kind: w.kind, spanLabel: w.spanLabel, depth: w.nestingDepth })),
      series: worlds.map((w, wi) => {
        const evs = facts.events.filter(e => e.worldRef === w.id);
        const ordered = evs.filter(e => e.order).sort((a, b) => a.order!.ordinal - b.order!.ordinal);
        return {
          world: w.id, color: wi % 2 === 0 ? '#88ada4' : '#c0a17a',
          pts: ordered.map((e) => ({
            // x = derived causal depth (labeled as derived), z = encoded ordinal
            x: causalLayer.get(e.id) ?? 0,
            z: e.order!.ordinal,
            label: e.label ?? e.id,
            description: e.description ?? '',
            timeLabel: e.timeLabel ?? '',
            agents: e.agents, id: e.id, y: wi,
          })),
          unresolvedCount: evs.filter(e => !e.order).length,
        };
      }),
      header: scene.header,
      axisNote: 'X = derived causal depth (not coordinate time) · Y = world lane · Z = encoded ordinal (asserted order) · node text: description leads, short label beneath · hollow worlds = all events time-unresolved (rail drawn, no invented positions)',
    };

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Worldline Loom</title>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
<style>
:root{color-scheme:dark;--bg:#141a1c;--text:#dee2dc;--muted:#88958f;--line:#2a3434}
body{margin:0;background:var(--bg);color:var(--text);font:13px/1.5 system-ui,sans-serif}
.app{height:100vh;display:grid;grid-template-rows:auto 1fr auto}
header{padding:18px 24px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline}
h1{font-size:20px;margin:0;font-weight:500}
.eyebrow{color:var(--muted);text-transform:uppercase;letter-spacing:.16em;font-size:10px}
#stage{position:relative}canvas{display:block;width:100%;height:100%;touch-action:none}
footer{padding:12px 24px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}
</style></head>
<body><div class="app">
<header><div><div class="eyebrow">ontology render</div><h1>Worldline Loom</h1></div>
<div style="color:var(--muted);font-size:12px">${esc(scene.header.topologyLine)}</div></header>
<div id="stage"></div>
<footer>${esc(payload.axisNote)}</footer>
</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const DATA = ${JSON.stringify(payload)};
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);
const scene3 = new THREE.Scene();
scene3.background = new THREE.Color(0x141a1c);
const camera = new THREE.PerspectiveCamera(45, stage.clientWidth/stage.clientHeight, 0.1, 200);
camera.position.set(9, 7, 12);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene3.add(new THREE.AmbientLight(0xffffff, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(6, 10, 4); scene3.add(key);
// reference plane Z=0
const grid = new THREE.GridHelper(20, 20, 0x2a3434, 0x1c2426);
grid.position.y = -0.02; scene3.add(grid);
const axes = new THREE.AxesHelper(3.2); axes.position.set(-9, 0, -8); scene3.add(axes);
// ---- node text: description primary, short label beneath, encoded time last ----
const DESC_CHARS = 40, PX_PER_UNIT = 200, LINE_H = 34, PAD = 18;
function wrapText(text, n) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  const push = (t) => { if (t) lines.push(t); };
  for (const raw of words) {
    const parts = raw.length > n ? raw.match(new RegExp('.{1,' + n + '}', 'g')) : [raw];
    for (const w of parts) {
      if (!line) { line = w; continue; }
      if (line.length + 1 + w.length <= n) line += ' ' + w;
      else { push(line); line = w; }
    }
  }
  push(line);
  return lines;
}
function nodeSprite(d) {
  const desc = (d.description || '').trim();
  const primary = desc || (d.label || d.id);
  const lines = wrapText(primary, DESC_CHARS);
  const caps = [];
  if (desc && d.label) caps.push({ t: d.label, size: 21, fill: '#88958f', mono: false });
  if (d.timeLabel) caps.push({ t: d.timeLabel, size: 20, fill: '#c0a17a', mono: true });
  const H = PAD * 2 + lines.length * LINE_H + caps.reduce((a, c) => a + c.size + 8, 0);
  const W = 820;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  cx.fillStyle = 'rgba(20,26,28,0.86)'; cx.fillRect(0, 0, W, H);
  cx.strokeStyle = '#2a3434'; cx.strokeRect(0.5, 0.5, W - 1, H - 1);
  let y = PAD + 26;
  cx.font = '400 26px system-ui';
  cx.fillStyle = '#dee2dc';
  for (const l of lines) { cx.fillText(l, PAD, y); y += LINE_H; }
  for (const c of caps) {
    y += c.size + 8 - 12;
    cx.font = c.mono ? '400 20px ui-monospace, Menlo, monospace' : '400 21px system-ui';
    cx.fillStyle = c.fill;
    cx.fillText(c.t, PAD, y);
    y += 12;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  spr.scale.set(W / PX_PER_UNIT, H / PX_PER_UNIT, 1);
  return spr;
}
// ribbons: one per world series; unresolved worlds get a hollow rail at Z=0 (visible gap)
for (const s of DATA.series) {
  const laneY = DATA.series.indexOf(s) * 3.2;
  if (s.pts.length === 0) {
    const railMat = new THREE.LineBasicMaterial({ color: 0x44514d });
    const rg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-4, laneY, 0), new THREE.Vector3(4, laneY, 0),
    ]);
    scene3.add(new THREE.Line(rg, railMat));
    const cv = document.createElement('canvas'); cv.width=512; cv.height=96;
    const cx = cv.getContext('2d');
    cx.fillStyle='rgba(20,26,28,0.85)'; cx.fillRect(0,0,512,96);
    cx.strokeStyle='#44514d'; cx.strokeRect(1,1,510,94);
    cx.fillStyle='#88958f'; cx.font='600 34px system-ui';
    cx.fillText(s.world + (s.unresolvedCount ? ' (' + s.unresolvedCount + ' unresolved)' : ''), 18, 60);
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:tex}));
    spr.scale.set(3.6, 0.68, 1);
    spr.position.set(-6.4, laneY + 0.9, 0);
    scene3.add(spr);
    continue;
  }
  const pts = s.pts.map((p)=>new THREE.Vector3(p.x - (s.pts.length-1)/2, p.y*3.2, p.z - (s.pts.length-1)/2));
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, Math.max(32, pts.length*8), 0.055, 8, false);
  const mat = new THREE.MeshStandardMaterial({color:new THREE.Color(s.color), roughness:0.85, metalness:0.05});
  const ribbon = new THREE.Mesh(geo, mat); scene3.add(ribbon);
  // event beads + one node-text sprite each: description primary, short label beneath
  s.pts.forEach((d, i) => {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12),
      new THREE.MeshStandardMaterial({color:0xdee2dc, roughness:0.6}));
    bead.position.copy(pts[i]); scene3.add(bead);
    const spr = nodeSprite(d);
    // alternate above/below the bead: callouts in a 3D stack collide far less
    spr.position.copy(pts[i]).setY(pts[i].y + (i % 2 === 0 ? 0.5 : -0.5));
    scene3.add(spr);
  });
  // world label sprite
  const cv = document.createElement('canvas'); cv.width=512; cv.height=96;
  const cx = cv.getContext('2d');
  cx.fillStyle='rgba(20,26,28,0.85)'; cx.fillRect(0,0,512,96);
  cx.strokeStyle='#2a3434'; cx.strokeRect(1,1,510,94);
  cx.fillStyle='#dee2dc'; cx.font='600 34px system-ui'; cx.fillText(s.world, 18, 60);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:tex}));
  spr.scale.set(3.2, 0.6, 1);
  spr.position.set(pts[0].x - 3.6, pts[0].y + 1.0, pts[0].z);
  scene3.add(spr);
}
(function loop(){ requestAnimationFrame(loop); controls.update(); renderer.render(scene3, camera); })();
window.addEventListener('resize', ()=>{
  camera.aspect = stage.clientWidth/stage.clientHeight; camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth, stage.clientHeight);
});
</script></body></html>`;

    return { doc: html, medium: '3d-html' as const, width: W, height: H, profileId: this.id };
  },
};
