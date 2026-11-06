'use strict';
// =============================================================================
// ACTOR — anything that can move, shoot and die. The player and every bot are
// Actors; bots just get a `brain` (see bot.js) that fills in their input.
// =============================================================================
const SHARED = {};
// Merge the meshes that sit directly in the same joint group and share a material into one
// mesh (geometry baked into the group's space). Joints keep animating; far fewer draw calls.
function collapseMeshes(group, skip) {
  for (const ch of group.children.slice()) if (!ch.isMesh && ch !== skip) collapseMeshes(ch, skip);
  const byMat = new Map();
  for (const ch of group.children) if (ch.isMesh && !ch.isInstancedMesh) { if (!byMat.has(ch.material)) byMat.set(ch.material, []); byMat.get(ch.material).push(ch); }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    let n = 0; const parts = list.map(m => { m.updateMatrix(); const gg = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); n += gg.attributes.position.count; return gg; });
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
    for (const gg of parts) { P.set(gg.attributes.position.array, o * 3); if (!gg.attributes.normal) gg.computeVertexNormals(); N.set(gg.attributes.normal.array, o * 3); o += gg.attributes.position.count; gg.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.computeBoundingSphere();
    for (const m of list) group.remove(m);
    group.add(new THREE.Mesh(geo, mat));
  }
}
const _ikA = new THREE.Vector3(), _ikB = new THREE.Vector3(), _ikC = new THREE.Vector3(), _ikV = new THREE.Vector3();
const _ikD = new THREE.Vector3(), _ikE = new THREE.Vector3(), _ikP = new THREE.Vector3(), _ikQ = new THREE.Quaternion();
const _DOWN = new THREE.Vector3(0, -1, 0);
const ARM_L1 = 0.28, ARM_L2 = 0.27;
// Two-bone IK: rotate shoulder + elbow so the hand (at the end of the forearm) reaches
// `target` (in the upper-body space the shoulder lives in). Elbow points down/out.
function solveArm(arm, target, side) {
  const d = _ikD.copy(target).sub(arm.sh.position);
  let len = d.length();
  if (len < 1e-4) return;
  d.divideScalar(len);
  len = Math.min(Math.max(len, 0.12), ARM_L1 + ARM_L2 - 0.002);
  const a1 = Math.acos(Math.min(1, Math.max(-1, (ARM_L1 * ARM_L1 + len * len - ARM_L2 * ARM_L2) / (2 * ARM_L1 * len))));
  // pole (elbow hint) projected perpendicular to the reach direction
  const pole = _ikP.set(side * 0.7, -1, 0.25);
  pole.addScaledVector(d, -pole.dot(d)).normalize();
  const upperDir = _ikE.copy(d).multiplyScalar(Math.cos(a1)).addScaledVector(pole, Math.sin(a1));
  arm.sh.quaternion.setFromUnitVectors(_DOWN, upperDir);
  // forearm: from elbow to the target, expressed in the shoulder's rotated space
  const elbow = upperDir.multiplyScalar(ARM_L1);
  const fore = _ikV.copy(d).multiplyScalar(len).sub(elbow).normalize();
  fore.applyQuaternion(_ikQ.copy(arm.sh.quaternion).invert());
  arm.el.quaternion.setFromUnitVectors(_DOWN, fore);
}
// v1.27.2 downed crawl on hands and knees (window.__CK overrides for tuning)
const CRAWL = Object.assign({ by: -0.5, cz: 0.1, lean: -1.5, h: 0.05, k: -1.45, hz: 0.1, ax: 0.22, ay: 0.62, az: -0.52, head: 0.95 }, (typeof window !== 'undefined' && window.__CK) || {});
BR.solveArm = (arm, target, side) => solveArm(arm, target, side);      // (the victory dance poses the arms by IK)
// v1.26: whose look an actor wears ({ o: outfit id, m: mask id }): its own (party members, previews) or, for the player, the profile's
BR.lookOf = a => (a && a.look) || (a && a.isPlayer && BR.Profile && BR.Profile.data && BR.Profile.charLook ? BR.Profile.charLook() : null);
// v1.25: the imported character's shared geometry (built once from BR.CHAR_DATA) + a woven fabric detail map
let charCache = null;
function charAssets() {
  if (charCache) return charCache;
  const D = BR.CHAR_DATA, dec = (b, T) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new T(u.buffer); };
  const pos = new THREE.BufferAttribute(dec(D.pos, Float32Array), 3), uv = new THREE.BufferAttribute(dec(D.uv, Float32Array), 2);
  const col = new THREE.BufferAttribute(dec(D.col, Uint8Array), 3, true), si = new THREE.BufferAttribute(dec(D.si, Uint8Array), 4), sw = new THREE.BufferAttribute(dec(D.sw, Uint8Array), 4, true);
  const geoAll = new THREE.BufferGeometry(); geoAll.setAttribute('position', pos); geoAll.setAttribute('uv', uv); geoAll.setAttribute('skinIndex', si); geoAll.setAttribute('skinWeight', sw);
  geoAll.setIndex(new THREE.BufferAttribute(dec(D.idx, Uint16Array), 1)); geoAll.computeVertexNormals();
  geoAll.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
  const team = dec(D.team, Uint8Array), cb = col.array, base = new Float32Array(cb.length), teamIdx = [];
  for (let i = 0; i < cb.length; i++) base[i] = cb[i] / 255;
  for (let i = 0; i < team.length; i++) if (team[i]) teamIdx.push(i);
  // the other clothing regions by their base colour (pants / boots / gloves), for outfits that recolour them
  const reg = { pants: [], boots: [], gloves: [] };
  for (let i = 0; i < team.length; i++) if (!team[i]) { const r = col.array[i * 3]; const L = r === 56 ? reg.pants : r === 41 ? reg.boots : r === 26 ? reg.gloves : null; if (L) L.push(i); }
  // the index split in two groups: jacket triangles first (patterned outfits give them their own material), then the rest
  const ia = geoAll.index.array, jt = [], rt = [];
  for (let t = 0; t < ia.length; t += 3) (team[ia[t]] && team[ia[t + 1]] && team[ia[t + 2]] ? jt : rt).push(ia[t], ia[t + 1], ia[t + 2]);
  const split = { index: new THREE.BufferAttribute(new Uint16Array(jt.concat(rt)), 1), nj: jt.length, n: ia.length };
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, 64, 64);
  for (let yy = 0; yy < 64; yy += 2) for (let xx = 0; xx < 64; xx += 2) { const v = 196 + ((xx + yy) % 4 ? 18 : -10) + Math.random() * 30; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(xx, yy, 2, 2); }
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(Math.random() * 64, Math.random() * 64, 6 + Math.random() * 12, 1); }
  const fabric = new THREE.CanvasTexture(cv); fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  // the ski mask: a smooth head-shaped ellipsoid in black knit with a painted eye opening (front = -Z: u 0.75, v ~0.56)
  const R = D.mask.r, mg = new THREE.SphereGeometry(1, 32, 24), mp = mg.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    let x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i); const front = -z;
    if (y < -0.35) { const k = 1 - (-0.35 - y) * 0.55; x *= k; z *= k; }                                   // tapers into the neck
    if (front > 0.55 && y < 0.05 && y > -0.6) z -= 0.06 * (front - 0.55) * (1 - Math.abs(y + 0.25) * 2);       // nose / chin shape
    if (front > 0.6 && Math.abs(y - 0.16) < 0.13) z += 0.03 * (front - 0.6);                                    // the eyes sit a touch deeper
    mp.setXYZ(i, x * R[0], y * R[1], z * R[2]);
  }
  mg.computeVertexNormals();
  const mc = document.createElement('canvas'); mc.width = 256; mc.height = 128; const m2 = mc.getContext('2d');
  m2.fillStyle = '#17181b'; m2.fillRect(0, 0, 256, 128);
  for (let yy = 0; yy < 128; yy += 2) for (let xx = 0; xx < 256; xx += 3) { m2.fillStyle = `rgba(255,255,255,${((xx / 3 + yy / 2) % 2 ? 0.035 : 0.0)})`; m2.fillRect(xx, yy, 2, 2); }      // knit rib
  const ex = 0.75 * 256, ey = 0.44 * 128;
  m2.fillStyle = '#0c0d0f'; m2.beginPath(); m2.ellipse(ex, ey, 34, 11, 0, 0, Math.PI * 2); m2.fill();                                  // rim
  m2.fillStyle = '#b4866a'; m2.beginPath(); m2.ellipse(ex, ey, 29, 8, 0, 0, Math.PI * 2); m2.fill();                                   // skin
  m2.fillStyle = 'rgba(80,50,35,0.35)'; m2.fillRect(ex - 29, ey - 8, 58, 3);                                                             // brow shadow
  for (const dx of [-12, 12]) { m2.fillStyle = '#efe9e2'; m2.beginPath(); m2.ellipse(ex + dx, ey + 1, 4.6, 2.5, 0, 0, Math.PI * 2); m2.fill();
    m2.fillStyle = '#3a2a20'; m2.beginPath(); m2.arc(ex + dx, ey + 1, 2.0, 0, Math.PI * 2); m2.fill(); m2.fillStyle = '#000'; m2.beginPath(); m2.arc(ex + dx, ey + 1, 1.0, 0, Math.PI * 2); m2.fill(); }
  const maskTex = new THREE.CanvasTexture(mc);
  return (charCache = { geo: geoAll, base, teamIdx, reg, split, fabric, mask: mg, maskTex });
}

// v1.26 CHARACTER COSMETICS: outfits (jacket / pants / boots / gloves colours, a jacket pattern, a glowing trim)
// and masks (knit colour + print, eye style, add-ons). Textures are painted once per item and cached.
const lookTex = {};
function rngFor(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; }
const hexCss = c => '#' + (c >>> 0).toString(16).padStart(6, '0');
// paint a 256² tile: pattern `pat` with colours [a, b, c, d] (the weave is laid over it so it still reads as cloth)
function paintPattern(x, pat, cols, R, S) {
  const [a, b, c, d] = cols.map(hexCss);
  x.fillStyle = a; x.fillRect(0, 0, S, S);
  const blob = (col, n, r0, r1) => { x.fillStyle = col; for (let i = 0; i < n; i++) { const cx = R() * S, cy = R() * S, r = r0 + R() * (r1 - r0); for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.beginPath(); x.ellipse(cx + ox, cy + oy, r * (1 + R() * 0.8), r * (0.5 + R() * 0.5), R() * 3, 0, 7); x.fill(); } } };
  if (pat === 'camo') { blob(b, 16, 14, 34); blob(c, 12, 10, 26); if (d) blob(d, 8, 6, 16); }
  else if (pat === 'digital') { const q = 8; for (const [col, n] of [[b, 70], [c, 50], [d || c, 30]]) { x.fillStyle = col; for (let i = 0; i < n; i++) { const px = Math.floor(R() * S / q) * q, py = Math.floor(R() * S / q) * q, w = (1 + Math.floor(R() * 4)) * q, h = (1 + Math.floor(R() * 3)) * q; x.fillRect(px, py, w, h); x.fillRect(px - S, py, w, h); x.fillRect(px, py - S, w, h); } } }
  else if (pat === 'tiger') { x.fillStyle = b; for (let i = 0; i < 9; i++) { const y0 = (i + R() * 0.5) * S / 9; x.beginPath(); x.moveTo(-10, y0); for (let t = 0; t <= S + 20; t += 16) x.lineTo(t, y0 + Math.sin(t * 0.05 + i) * 9 + (R() - 0.5) * 6); for (let t = S + 20; t >= -10; t -= 16) x.lineTo(t, y0 + 6 + Math.sin(t * 0.05 + i) * 9 + R() * 8 * (1 - Math.abs(t / S - 0.5))); x.fill(); } }
  else if (pat === 'stripes') { x.fillStyle = b; for (let i = -S; i < S * 2; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 18, 0); x.lineTo(i + 18 - S, S); x.lineTo(i - S, S); x.fill(); } }
  else if (pat === 'hazard') { x.fillStyle = b; for (let i = -S; i < S * 2; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 32, 0); x.lineTo(i + 32 - S, S); x.lineTo(i - S, S); x.fill(); } }
  else if (pat === 'splatter') { blob(b, 26, 2, 9); blob(c, 14, 1, 5); }
  else if (pat === 'galaxy') { const gr = x.createLinearGradient(0, 0, S, S); gr.addColorStop(0, a); gr.addColorStop(0.5, b); gr.addColorStop(1, a); x.fillStyle = gr; x.fillRect(0, 0, S, S); x.globalAlpha = 0.5; blob(c, 6, 20, 50); x.globalAlpha = 1; x.fillStyle = '#fff'; for (let i = 0; i < 120; i++) x.fillRect(R() * S, R() * S, R() < 0.1 ? 2 : 1, R() < 0.1 ? 2 : 1); }
  else if (pat === 'gold') { for (let i = 0; i < 40; i++) { const gr = x.createLinearGradient(0, i * 7, S, i * 7 + 40); gr.addColorStop(0, i % 2 ? a : b); gr.addColorStop(1, c); x.globalAlpha = 0.35; x.fillStyle = gr; x.fillRect(0, i * 7, S, 7); } x.globalAlpha = 1; }
  else if (pat === 'lava') { blob(b, 18, 10, 30); x.strokeStyle = c; x.lineWidth = 3; for (let i = 0; i < 18; i++) { x.beginPath(); let px = R() * S, py = R() * S; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (R() - 0.5) * 50; py += (R() - 0.5) * 50; x.lineTo(px, py); } x.stroke(); } }
  else if (pat === 'ghillie') { for (let i = 0; i < 900; i++) { x.strokeStyle = [b, c, d || b][i % 3]; x.lineWidth = 1 + R() * 2; const px = R() * S, py = R() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 10, py + 6 + R() * 12); x.stroke(); } }
  else if (pat === 'split') { x.fillStyle = b; x.fillRect(S / 2, 0, S / 2, S); x.fillStyle = c; x.fillRect(S / 2 - 4, 0, 8, S); }
  // the weave on top
  for (let yy = 0; yy < S; yy += 2) for (let xx = 0; xx < S; xx += 2) if ((xx + yy) % 4 === 0) { x.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.06})`; x.fillRect(xx, yy, 2, 2); }
}
// the glowing layer: black, with the glow lines in white (tinted by the item's glow colour)
function paintGlow(x, kind, R, S) {
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round';
  if (kind === 'circuit') { x.lineWidth = 2.5; for (let i = 0; i < 16; i++) { let px = Math.round(R() * 8) * 32, py = Math.round(R() * 8) * 32; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { if (R() < 0.5) px += (R() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(R() * 2)); else py += (R() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(R() * 2)); x.lineTo(px, py); } x.stroke(); x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); } }
  else if (kind === 'cracks') { x.lineWidth = 3; for (let i = 0; i < 16; i++) { x.beginPath(); let px = R() * S, py = R() * S; x.moveTo(px, py); for (let k = 0; k < 7; k++) { px += (R() - 0.5) * 46; py += (R() - 0.5) * 46; x.lineTo(px, py); } x.stroke(); } }
  else if (kind === 'stars') { for (let i = 0; i < 90; i++) { const r = R() < 0.12 ? 2.4 : 1.1; x.beginPath(); x.arc(R() * S, R() * S, r, 0, 7); x.fill(); } }
  else if (kind === 'seams') { x.lineWidth = 3; for (let i = 0; i < S; i += 64) { x.beginPath(); x.moveTo(i + 8, 0); x.lineTo(i + 8, S); x.stroke(); x.beginPath(); x.moveTo(0, i + 40); x.lineTo(S, i + 40); x.stroke(); } }
  else if (kind === 'chevron') { x.lineWidth = 6; for (let y = 0; y < S + 64; y += 64) { x.beginPath(); x.moveTo(0, y); x.lineTo(S / 2, y - 32); x.lineTo(S, y); x.stroke(); } }
}
function outfitTex(id, O) {
  if (lookTex['o:' + id]) return lookTex['o:' + id];
  const S = 256, R = rngFor(id), out = {};
  if (O.pat || O.glowPat) { const cv = document.createElement('canvas'); cv.width = cv.height = S; paintPattern(cv.getContext('2d'), O.pat || 'plain', O.cols || [0xffffff, 0xffffff, 0xffffff], R, S);
    out.map = new THREE.CanvasTexture(cv); out.map.wrapS = out.map.wrapT = THREE.RepeatWrapping; out.map.repeat.set(O.scale || 0.3, O.scale || 0.3); }
  if (O.glowPat) { const cv = document.createElement('canvas'); cv.width = cv.height = S; paintGlow(cv.getContext('2d'), O.glowPat, R, S);
    out.glow = new THREE.CanvasTexture(cv); out.glow.wrapS = out.glow.wrapT = THREE.RepeatWrapping; out.glow.repeat.set(O.scale || 0.3, O.scale || 0.3); }
  return (lookTex['o:' + id] = out);
}
// a mask texture (256x128, front at u 0.75) + its glow layer
function maskTex(id, K) {
  if (lookTex['m:' + id]) return lookTex['m:' + id];
  const W = 256, H = 128, R = rngFor(id), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  const gc = document.createElement('canvas'); gc.width = W; gc.height = H; const gx = gc.getContext('2d'); gx.fillStyle = '#000'; gx.fillRect(0, 0, W, H);
  const base = hexCss(K.base !== undefined ? K.base : 0x17181b), b = hexCss(K.c2 !== undefined ? K.c2 : 0xffffff);
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  if (K.pat && K.pat !== 'skull' && K.pat !== 'grin') { const t = document.createElement('canvas'); t.width = t.height = 128; paintPattern(t.getContext('2d'), K.pat, [K.base || 0x17181b, K.c2 || 0xffffff, K.c3 || K.c2 || 0x888888, K.c3], R, 128); x.drawImage(t, 0, 0, 128, 128); x.drawImage(t, 128, 0, 128, 128); }
  for (let yy = 0; yy < H; yy += 2) for (let xx = 0; xx < W; xx += 3) if ((xx / 3 + yy / 2) % 2) { x.fillStyle = 'rgba(255,255,255,0.035)'; x.fillRect(xx, yy, 2, 2); }      // knit rib
  const ex = 0.75 * W, ey = 0.44 * H;
  if (K.pat === 'skull') {                                            // a bone-white skull print around the eye opening
    x.fillStyle = b; x.beginPath(); x.ellipse(ex, ey + 4, 44, 34, 0, 0, 7); x.fill();
    x.fillStyle = base; x.beginPath(); x.moveTo(ex - 3, ey + 16); x.lineTo(ex + 3, ey + 16); x.lineTo(ex, ey + 10); x.fill();   // nose
    x.fillRect(ex - 22, ey + 26, 44, 3); for (let i = -20; i <= 20; i += 6) x.fillRect(ex + i, ey + 22, 2, 12);                   // teeth
  }
  if (K.pat === 'grin') {                                             // a stitched smile across the mouth
    x.strokeStyle = b; x.lineWidth = 5; x.beginPath(); x.arc(ex, ey + 6, 30, 0.35, Math.PI - 0.35); x.stroke();
    x.lineWidth = 3; for (let a = 0.45; a < Math.PI - 0.4; a += 0.22) { const px = ex + Math.cos(a) * 30, py = ey + 6 + Math.sin(a) * 30; x.beginPath(); x.moveTo(px - 3, py - 4); x.lineTo(px + 3, py + 4); x.stroke(); }
    if (K.glow) { gx.strokeStyle = '#fff'; gx.lineWidth = 3; gx.beginPath(); gx.arc(ex, ey + 6, 30, 0.35, Math.PI - 0.35); gx.stroke(); }
  }
  if (K.trim !== undefined) { x.fillStyle = hexCss(K.trim); x.fillRect(0, H - 14, W, 6); x.fillRect(0, 4, W, 4); if (K.glow) { gx.fillStyle = '#fff'; gx.fillRect(0, H - 14, W, 6); } }
  // the eye opening
  x.fillStyle = '#0c0d0f'; x.beginPath(); x.ellipse(ex, ey, 34, 11, 0, 0, 7); x.fill();
  if (K.eyes === 'glow') {                                            // no face inside: two glowing eyes
    x.fillStyle = '#050505'; x.beginPath(); x.ellipse(ex, ey, 29, 8, 0, 0, 7); x.fill();
    for (const dx of [-12, 12]) { x.fillStyle = hexCss(K.eyeCol || 0xff2030); x.beginPath(); x.ellipse(ex + dx, ey + 1, 6, 3, 0, 0, 7); x.fill();
      gx.fillStyle = '#fff'; gx.beginPath(); gx.ellipse(ex + dx, ey + 1, 6, 3, 0, 0, 7); gx.fill(); }
  } else {
    x.fillStyle = '#b4866a'; x.beginPath(); x.ellipse(ex, ey, 29, 8, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(80,50,35,0.35)'; x.fillRect(ex - 29, ey - 8, 58, 3);
    for (const dx of [-12, 12]) { x.fillStyle = '#efe9e2'; x.beginPath(); x.ellipse(ex + dx, ey + 1, 4.6, 2.5, 0, 0, 7); x.fill();
      x.fillStyle = '#3a2a20'; x.beginPath(); x.arc(ex + dx, ey + 1, 2.0, 0, 7); x.fill(); x.fillStyle = '#000'; x.beginPath(); x.arc(ex + dx, ey + 1, 1.0, 0, 7); x.fill(); }
  }
  const out = { map: new THREE.CanvasTexture(cv), glow: K.glow || K.eyes === 'glow' ? new THREE.CanvasTexture(gc) : null };
  return (lookTex['m:' + id] = out);
}
// v1.27 HATS: built from primitives around the mask (origin = mask centre, top of the head at y 0.132, front = -Z).
// A hat can animate: group.userData.tick(t) is called from syncMesh with the time in seconds.
function buildHat(id, H) {
  const g = new THREE.Group(), c1 = H.c1 !== undefined ? H.c1 : 0x333333, c2 = H.c2 !== undefined ? H.c2 : 0xffffff, gl = H.glow !== undefined ? H.glow : c2;
  const lam = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
  const pho = (c, o) => new THREE.MeshPhongMaterial(Object.assign({ color: c, shininess: 90, specular: 0x666666 }, o || {}));
  const neon = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {}));
  const add = (geo, mat, x, y, z, rx, ry, rz, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); (par || g).add(m); return m; };
  const dome = (r, sy, k) => new THREE.SphereGeometry(r, 22, 12, 0, Math.PI * 2, 0, Math.PI * (k || 0.5));
  const ticks = [];
  switch (H.kind) {
    case 'beanie': { const d = add(dome(0.114), lam(c1), 0, 0.02); d.scale.set(1, 1.15, 1.08);
      add(new THREE.CylinderGeometry(0.117, 0.117, 0.045, 22), lam(c2), 0, 0.03).scale.z = 1.08;
      add(new THREE.SphereGeometry(0.032, 10, 8), lam(c2), 0, 0.16); break; }
    case 'cap': case 'backcap': { const back = H.kind === 'backcap', d = add(dome(0.11), lam(c1), 0, 0.03); d.scale.set(1, 0.95, 1.08);
      const b = add(new THREE.CylinderGeometry(0.08, 0.08, 0.008, 20, 1, false, Math.PI * 0.5, Math.PI), lam(c2), 0, 0.045, back ? 0.09 : -0.09, back ? -0.12 : 0.12); b.scale.z = 1.25; if (back) b.rotation.y = Math.PI;
      add(new THREE.SphereGeometry(0.012, 8, 6), lam(c2), 0, 0.135); if (H.glow !== undefined) add(new THREE.TorusGeometry(0.111, 0.004, 4, 32), neon(gl), 0, 0.035, 0, Math.PI / 2).scale.y = 1.08; break; }
    case 'bucket': { add(new THREE.CylinderGeometry(0.1, 0.118, 0.09, 22), lam(c1), 0, 0.06); add(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 22), lam(c1), 0, 0.105);
      add(new THREE.CylinderGeometry(0.118, 0.17, 0.04, 26, 1, true), lam(c2, { side: THREE.DoubleSide }), 0, 0.0); add(new THREE.CylinderGeometry(0.119, 0.119, 0.018, 22), lam(c2), 0, 0.02); break; }
    case 'bandana': { const t = add(new THREE.TorusGeometry(0.108, 0.016, 6, 30), lam(c1), 0, 0.06, 0, Math.PI / 2); t.scale.y = 1.1;
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.07, 0.008), lam(c1), s * 0.02, 0.02, 0.125, 0.4, 0, s * 0.35); if (H.glow !== undefined) add(new THREE.TorusGeometry(0.11, 0.004, 4, 30), neon(gl), 0, 0.06, 0, Math.PI / 2).scale.y = 1.12; break; }
    case 'beret': { const b = add(new THREE.SphereGeometry(0.125, 20, 10), lam(c1), 0.02, 0.11, 0.005, 0, 0, 0.22); b.scale.set(1.05, 0.32, 1.05); add(new THREE.CylinderGeometry(0.006, 0.004, 0.025, 6), lam(c1), 0.0, 0.155, 0);
      add(new THREE.OctahedronGeometry(0.018), pho(c2, { emissive: c2, emissiveIntensity: 0.4 }), -0.03, 0.11, -0.11, 0, 0, 0); break; }
    case 'tophat': { add(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 28), pho(c1), 0, 0.1); const body = add(new THREE.CylinderGeometry(0.088, 0.083, 0.19, 24), pho(c1), 0, 0.2);
      const band = add(new THREE.CylinderGeometry(0.091, 0.091, 0.03, 24), neon(gl), 0, 0.125);
      ticks.push(t => { band.material.color.setHSL(((t * 0.15) % 1), 1, 0.55); }); void body; break; }
    case 'cowboy': { const pts = [[0.001, 0.2], [0.07, 0.205], [0.085, 0.17], [0.092, 0.1], [0.1, 0.07], [0.17, 0.075], [0.2, 0.11], [0.205, 0.115]].map(p => new THREE.Vector2(p[0], p[1]));
      add(new THREE.LatheGeometry(pts, 28), lam(c1, { side: THREE.DoubleSide }), 0, -0.01).scale.set(1, 1, 0.85);
      add(new THREE.CylinderGeometry(0.094, 0.098, 0.022, 24), pho(c2), 0, 0.075); break; }
    case 'catears': { add(new THREE.TorusGeometry(0.112, 0.008, 6, 30, Math.PI), lam(c1), 0, 0.02, 0, 0, Math.PI / 2, 0);
      for (const s of [-1, 1]) { add(new THREE.ConeGeometry(0.04, 0.08, 4), lam(c1), s * 0.065, 0.14, 0.0, 0, Math.PI / 4, -s * 0.3); add(new THREE.ConeGeometry(0.025, 0.055, 4), neon(gl), s * 0.064, 0.136, -0.012, 0, Math.PI / 4, -s * 0.3); } break; }
    case 'cone': { const cone = add(new THREE.ConeGeometry(0.1, 0.3, 24), lam(c1), 0, 0.24); void cone;
      for (const y of [0.2, 0.28]) add(new THREE.CylinderGeometry(0.1 * (0.39 - y + 0.09) / 0.3 + 0.001, 0.1 * (0.39 - y + 0.09 - 0.03) / 0.3 + 0.004, 0.03, 24), lam(0xffffff), 0, y);
      add(new THREE.BoxGeometry(0.24, 0.018, 0.24), lam(c1), 0, 0.09); break; }
    case 'headset': { add(new THREE.TorusGeometry(0.128, 0.013, 6, 30, Math.PI), pho(c1), 0, 0.02, 0);
      for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 18), pho(c1), s * 0.115, -0.01, 0, 0, 0, Math.PI / 2); const r = add(new THREE.TorusGeometry(0.038, 0.006, 6, 20), neon(gl), s * 0.134, -0.01, 0, 0, Math.PI / 2, 0); ticks.push(t => r.material.color.setHSL(((t * 0.25 + (s > 0 ? 0.5 : 0)) % 1), 1, 0.55)); }
      const boom = add(new THREE.CylinderGeometry(0.004, 0.004, 0.11, 6), pho(c1), 0.11, -0.06, -0.06, 0.9, 0, 0); void boom; add(new THREE.SphereGeometry(0.012, 8, 6), neon(gl), 0.105, -0.095, -0.105); break; }
    case 'kabuto': { const d = add(dome(0.122, 1, 0.5), pho(c1), 0, 0.015); d.scale.set(1, 0.95, 1.05);
      add(new THREE.CylinderGeometry(0.125, 0.185, 0.08, 24, 1, true, -Math.PI * 0.7, Math.PI * 1.4), pho(c1, { side: THREE.DoubleSide }), 0, -0.035, 0.005);
      add(new THREE.TorusGeometry(0.075, 0.008, 6, 20, Math.PI), pho(c2, { emissive: c2, emissiveIntensity: 0.3 }), 0, 0.2, -0.105, 0, 0, Math.PI);
      add(new THREE.CylinderGeometry(0.008, 0.012, 0.07, 6), pho(c2), 0, 0.14, -0.11);
      add(new THREE.SphereGeometry(0.018, 10, 8), neon(gl), 0, 0.09, -0.125); break; }
    case 'viking': { const d = add(dome(0.12), pho(c1), 0, 0.015); d.scale.set(1, 1.05, 1.06); add(new THREE.CylinderGeometry(0.123, 0.123, 0.025, 24), pho(c2), 0, 0.025);
      add(new THREE.BoxGeometry(0.018, 0.1, 0.02), pho(c2), 0, 0.06, -0.12);
      for (const s of [-1, 1]) { const h = add(new THREE.TorusGeometry(0.08, 0.018, 8, 16, Math.PI * 0.55), lam(0xefe6cf), s * 0.13, 0.07, 0, 0, 0, s > 0 ? -0.3 : Math.PI + 0.3 - Math.PI * 0.55); h.scale.set(1, 1, 1); } break; }
    case 'wizard': { const cone = add(new THREE.ConeGeometry(0.115, 0.36, 24), lam(c1), 0, 0.28, 0.02, -0.15, 0, 0.08); void cone; add(new THREE.CylinderGeometry(0.19, 0.19, 0.01, 28), lam(c1), 0, 0.1);
      const orb = new THREE.Group(); orb.position.y = 0.2; g.add(orb);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(new THREE.OctahedronGeometry(0.018), neon(i % 2 ? gl : c2), Math.cos(a) * 0.17, Math.sin(i * 1.7) * 0.05, Math.sin(a) * 0.17, 0, 0, 0, orb); }
      ticks.push(t => { orb.rotation.y = t * 1.4; }); break; }
    case 'antlers': { for (const s of [-1, 1]) { const root = new THREE.Group(); root.position.set(s * 0.06, 0.1, 0); root.rotation.z = -s * 0.4; g.add(root);
        add(new THREE.CylinderGeometry(0.007, 0.011, 0.16, 6), neon(gl), 0, 0.08, 0, 0, 0, 0, root);
        for (const [y, a, l] of [[0.06, 0.9, 0.07], [0.11, -0.8, 0.06], [0.14, 0.7, 0.05]]) add(new THREE.CylinderGeometry(0.005, 0.007, l, 6), neon(gl), Math.sin(a) * l * 0.5 * -s, y + Math.cos(a) * l * 0.5, 0, 0, 0, a * s, root); }
      ticks.push(t => g.children.forEach(r => r.children.forEach(m => m.material.color.setHex(gl).multiplyScalar(0.75 + 0.25 * Math.sin(t * 4))))); break; }
    case 'mohawk': { for (let i = 0; i < 7; i++) { const k = i / 6, z = -0.09 + k * 0.19, h = 0.07 + Math.sin(k * Math.PI) * 0.06, y = Math.sqrt(Math.max(0, 1 - (z / 0.12) ** 2)) * 0.12;
        const c = new THREE.Color(c1).lerp(new THREE.Color(c2), k); add(new THREE.ConeGeometry(0.028, h * 1.5, 6), neon(c.getHex()), 0, y + h * 0.75 - 0.01, z, -(z / 0.12) * 0.6).scale.x = 0.45; }
      const sp = g.children.slice(); ticks.push(t => sp.forEach((m, i) => { m.scale.y = 1 + 0.12 * Math.sin(t * 6 + i); })); break; }
    case 'flame': { add(new THREE.CylinderGeometry(0.115, 0.115, 0.035, 24, 1, true), pho(c1, { side: THREE.DoubleSide, emissive: 0x332200 }), 0, 0.075);
      const fl = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const f = add(new THREE.ConeGeometry(0.026, 0.11, 6), neon(i % 2 ? c2 : gl, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), Math.cos(a) * 0.1, 0.14, Math.sin(a) * 0.1); fl.push(f); }
      ticks.push(t => fl.forEach((f, i) => { f.scale.set(1, 0.8 + 0.4 * Math.abs(Math.sin(t * 9 + i * 1.3)), 1); f.position.y = 0.13 + f.scale.y * 0.05; })); break; }
    case 'saturn': { const R = new THREE.Group(); R.position.y = 0.2; R.rotation.set(0.35, 0, 0.25); g.add(R);
      add(new THREE.TorusGeometry(0.17, 0.006, 6, 48), neon(c1), 0, 0, 0, Math.PI / 2, 0, 0, R); add(new THREE.TorusGeometry(0.2, 0.003, 6, 48), neon(c2), 0, 0, 0, Math.PI / 2, 0, 0, R);
      const core = add(new THREE.SphereGeometry(0.05, 16, 12), pho(gl, { emissive: gl, emissiveIntensity: 0.7 }), 0, 0, 0, 0, 0, 0, R);
      const moons = []; for (let i = 0; i < 3; i++) moons.push(add(new THREE.SphereGeometry(0.016, 10, 8), neon(i === 1 ? c2 : c1), 0, 0, 0, 0, 0, 0, R));
      ticks.push(t => { moons.forEach((m, i) => { const a = t * (1.2 + i * 0.4) + i * 2.1; m.position.set(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17); }); core.rotation.y = t; R.position.y = 0.2 + Math.sin(t * 2) * 0.012; }); break; }
    case 'brainjar': { add(new THREE.CylinderGeometry(0.115, 0.118, 0.03, 24), pho(0x8a9099), 0, 0.03);
      const br = add(new THREE.SphereGeometry(0.075, 18, 12), pho(c1, { emissive: c1, emissiveIntensity: 0.25, shininess: 20 }), 0, 0.1); br.scale.set(1, 0.8, 1.15);
      add(new THREE.SphereGeometry(0.125, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshPhongMaterial({ color: gl, transparent: true, opacity: 0.28, shininess: 120, specular: 0xffffff, depthWrite: false }), 0, 0.075);
      const bub = []; for (let i = 0; i < 4; i++) bub.push(add(new THREE.SphereGeometry(0.008, 6, 4), neon(gl), (i - 1.5) * 0.04, 0.05, (i % 2 - 0.5) * 0.06));
      ticks.push(t => { bub.forEach((b, i) => { b.position.y = 0.05 + ((t * 0.35 + i * 0.25) % 1) * 0.12; }); br.rotation.y = Math.sin(t) * 0.2; }); break; }
  }
  g.userData.tick = ticks.length ? t => { for (const f of ticks) f(t); } : null;
  return g;
}
// add-ons on the head joint (positions are relative to the mask's centre)
function maskAddon(kind, K) {
  const g = new THREE.Group(), gl = K.glow || K.eyeCol || 0x1de9ff;
  const met = new THREE.MeshPhongMaterial({ color: K.addCol || 0x22252a, shininess: 80, specular: 0x888888 });
  const neon = new THREE.MeshBasicMaterial({ color: gl });
  if (kind === 'visor') { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.035, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76), neon); v.position.set(0, 0.008, 0); v.scale.set(1.04, 1, 1.06); g.add(v); }
  else if (kind === 'goggles') { for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 6, 16), met); r.position.set(s * 0.04, 0.025, -0.112); g.add(r); const l = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), neon); l.position.set(s * 0.04, 0.025, -0.114); l.rotation.y = Math.PI; g.add(l); }
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.007, 4, 32), met); strap.rotation.x = Math.PI / 2; strap.position.y = 0.025; strap.scale.z = 1.12; g.add(strap); }
  else if (kind === 'horns') { for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.12, 8), met); h.position.set(s * 0.07, 0.12, -0.02); h.rotation.set(-0.35, 0, -s * 0.55); g.add(h); } }
  else if (kind === 'halo') { const h = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.009, 8, 36), neon); h.rotation.x = Math.PI / 2; h.position.y = 0.2; h.userData.spin = true; g.add(h); }
  else if (kind === 'crown') { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, s = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 4), met); s.position.set(Math.cos(a) * 0.075, 0.15, Math.sin(a) * 0.075); g.add(s); } const band = new THREE.Mesh(new THREE.TorusGeometry(0.077, 0.01, 4, 28), met); band.rotation.x = Math.PI / 2; band.position.y = 0.125; g.add(band); }
  else if (kind === 'antenna') { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 4), met); s.position.set(0.06, 0.16, 0.02); s.rotation.z = -0.25; g.add(s); const t = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), neon); t.position.set(0.078, 0.23, 0.02); g.add(t); }
  return g;
}

function sharedGeo() {
  if (SHARED.ready) return SHARED;
  const cyl = (r1, r2, len, seg) => { const g = new THREE.CylinderGeometry(r1, r2, len, seg || 8); g.translate(0, -len / 2, 0); g._shared = true; return g; }; // hangs down from its joint
  SHARED.thigh = cyl(0.085, 0.068, 0.44);
  SHARED.shin = cyl(0.064, 0.05, 0.42);
  SHARED.boot = new THREE.BoxGeometry(0.12, 0.08, 0.24);
  SHARED.upperArm = cyl(0.056, 0.048, 0.28);
  SHARED.forearm = cyl(0.046, 0.04, 0.26);
  SHARED.hand = new THREE.SphereGeometry(0.045, 8, 6);
  SHARED.hips = BR.roundedBox(0.34, 0.16, 0.22);
  SHARED.abdomen = new THREE.CylinderGeometry(0.15, 0.13, 0.22, 10);
  SHARED.chest = new THREE.CylinderGeometry(0.21, 0.15, 0.34, 10);
  SHARED.vest = BR.roundedBox(0.34, 0.27, 0.07);
  SHARED.neck = new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8);
  SHARED.head = new THREE.SphereGeometry(0.12, 12, 10);
  SHARED.helmet = new THREE.SphereGeometry(0.135, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  SHARED.visor = new THREE.BoxGeometry(0.18, 0.045, 0.04);
  SHARED.pack = BR.roundedBox(0.3, 0.36, 0.14);
  SHARED.shoulder = new THREE.SphereGeometry(0.075, 8, 6);
  for (const k in SHARED) if (SHARED[k] && SHARED[k].isBufferGeometry) SHARED[k]._shared = true;
  SHARED.dark = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  SHARED.boots = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
  SHARED.gloves = new THREE.MeshLambertMaterial({ color: 0x23262b });
  SHARED.visorMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  SHARED.skins = [0xf1c7a1, 0xd9a27a, 0xb07a52, 0x7d5236, 0x5a3a26].map(c => new THREE.MeshLambertMaterial({ color: c }));
  SHARED.ready = true;
  return SHARED;
}
const dampAngle = (a, b, k, dt) => a + BR.util.wrapAngle(b - a) * (1 - Math.exp(-k * dt));

BR.Actor = class Actor {
  constructor(game, opts) {
    const A = BR.CONFIG.actor;
    this.game = game;
    this.id = opts.id;
    this.name = opts.name;
    this.isPlayer = !!opts.isPlayer;
    this.color = opts.color || 0xcccccc;
    this.mover = new BR.Mover(game.world);
    this.yaw = 0;
    this.pitch = 0;
    this.recoil = 0;
    this.health = A.maxHealth;
    this.shield = 0;
    this.alive = true;
    // 2 guns + the knife you always carry (yours: bayonet, karambit or butterfly, whichever you equipped)
    this.slots = [null, null, BR.Weapons.create(opts && opts.isPlayer && BR.Profile && BR.Profile.data ? BR.Profile.melee() : 'bayonet')];
    this.cur = 2;
    this.grappleCd = 0;
    this.stimCd = 0; this.stimT = 0; this.stimHealT = 0; this.stimAcc = 0;
    this.nades = 0; this.nadeCd = 0;      // shockwave grenades carried
    this.lunge = null;
    this.ammo = { light: 0, heavy: 0, shells: 0 };
    this.kills = 0;
    this.damageDealt = 0;
    this.fireHeld = false;
    this.ads = false;
    this.lastAttacker = null;
    this.lastHurtT = -99;
    this.deathT = 0;
    this.input = { mx: 0, mz: 0, jump: false, crouch: false, speedMult: 1 };
    this.brain = null;
    this.pickupT = Math.random() * 0.1;
    this.mesh = this.isPlayer ? null : this.buildMesh();
  }

  get weapon() { return this.slots[this.cur]; }
  get pos() { return this.mover.pos; }

  eye(out) {
    const m = this.mover;
    return out.set(m.pos.x, m.pos.y + m.h - BR.CONFIG.actor.eyeFromTop, m.pos.z);
  }

  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // The two gun slots (index 0 and 1). Slot 2 is always the karambit.
  guns() { return this.slots.slice(0, 2); }

  // Put a gun in an empty gun slot and switch to it. Returns the slot index or -1.
  giveWeapon(id, mag, rar) {
    for (let i = 0; i < 2; i++) {
      if (!this.slots[i]) {
        this.slots[i] = BR.Weapons.create(id, mag, rar);
        this.switchTo(i);
        return i;
      }
    }
    return -1;
  }

  hasWeapon(id) { return this.guns().some(s => s && s.id === id); }

  // Stim shot: speed boost + heal ticks. Returns true if it was used.
  tryStim() {
    const C = BR.CONFIG.stim;
    if (!this.alive || this.downed || this.stimCd > 0 || this.mover.dropping) return false;
    this.stimCd = C.cooldown;
    this.stimT = C.speedTime;
    this.stimHealT = C.healTime;
    this.stimAcc = 0;
    return true;
  }

  // Fire the grapple along the aim. Returns true if it hooked something.
  tryGrapple() {
    const G = BR.CONFIG.move.grapple, m = this.mover;
    if (this.downed || this.grappleCd > 0 || m.grapple || m.dropping) return false;
    const e = this.eye(this._ge || (this._ge = new THREE.Vector3()));
    const d = this.aimDir(this._gd || (this._gd = new THREE.Vector3()));
    // Anything solid works: buildings, rocks, the ground, tree canopies, other players
    const h = this.game.hitscan(this, e, d, G.range);
    let t = h.t, target = h.actor;
    const tt = this.game.world.raycastTrees(e.x, e.y, e.z, d.x, d.y, d.z, t);
    if (tt < t) { t = tt; target = null; }
    if (t >= G.range - 0.01) return false;
    m.startGrapple(e.x + d.x * t, e.y + d.y * t, e.z + d.z * t, target);
    return true;
  }

  switchTo(i) {
    if (i === this.cur || !this.slots[i]) return false;
    const w = this.weapon;
    if (w) w.reloadT = 0;
    this.cur = i;
    this.slots[i].cool = Math.max(this.slots[i].cool, 0.25);
    this.ads = false;
    return true;
  }

  update(dt) {
    if (this.netProxy) { this.netProxy.apply(this, dt); return; }     // v1.12: a remote player / remote bot (net.js)
    if (!this.alive) return;
    if (this.downed) {
      // v1.19 knocked down: crawl only (no jumping, shooting, aiming, items or reloads)
      const m = this.mover, inp = this.input;
      inp.jump = false; inp.crouch = false; inp.speedMult = 1; this.fireHeld = false; this.ads = false;
      m.prone = true; m.sliding = false; m.crouched = true;
      if (m.grapple) m.releaseGrapple();
      m.update(dt, inp, this.yaw);
      for (const w of this.slots) if (w) w.reloadT = 0;
      if (this.mesh) this.syncMesh(dt);
      return;
    }
    const w = this.weapon;
    this.input.speedMult = w && w.def.speedMult ? w.def.speedMult : 1;
    if (this.zSlowT > 0) this.input.speedMult *= 0.55;          // slowed by a zombie boss (scream / roar)
    // Stim: boost + heal 10 ticks a second
    const SC = BR.CONFIG.stim;
    if (this.stimCd > 0) this.stimCd = Math.max(0, this.stimCd - dt);
    if (this.stimT > 0) { this.stimT = Math.max(0, this.stimT - dt); this.input.speedMult *= SC.speedMult; }
    if (this.speedBoost) this.input.speedMult *= this.speedBoost;      // Overdrive: Haste upgrades
    if (this.stimHealT > 0) {
      const t = Math.min(dt, this.stimHealT);
      this.stimHealT -= dt;
      this.stimAcc += t * SC.tickRate;
      while (this.stimAcc >= 1) { this.stimAcc -= 1; this.health = Math.min(BR.CONFIG.actor.maxHealth, this.health + SC.healPerTick); }
    }
    const hooked = !!this.mover.grapple;
    this.mover.update(dt, this.input, this.yaw);
    if (hooked && !this.mover.grapple) this.grappleCd = BR.CONFIG.move.grapple.cooldown;
    if (!this.mover.grapple && this.grappleCd > 0) this.grappleCd -= dt;
    this.input.jump = false;
    this.input.crouch = false;
    // Karambit lunge: land the hit once we're close enough
    if (this.lunge) {
      const L = this.lunge, t = L.target;
      L.t -= dt;
      if (!t.alive || L.t <= 0) this.lunge = null;
      else if (t.pos.distanceTo(this.pos) < this.slots[2].def.range) { BR.Weapons.meleeHit(this.game, this, t, this.slots[2]); this.lunge = null; }
    }
    if (this.recoil > 0) {
      const k = Math.min(this.recoil, this.recoil * 14 * dt + 0.0005);
      this.pitch = Math.min(1.45, this.pitch + k);
      this.recoil -= k;
    }
    // recoil recovery: a moment after you stop shooting, the view settles back down most of the
    // climb (never below where the spray started, so pulling down yourself is never punished)
    if (this.recoilPull > 0 && this.game && this.game.time - (this.sprayLast ?? -9) > 0.09) {
      const k = Math.min(this.recoilPull, this.recoilPull * 9 * dt + 0.0002);
      this.recoilPull -= k;
      const floor = Math.min(this.pitch, this.sprayPitch0 ?? this.pitch);
      this.pitch = Math.max(floor, this.pitch - k * 0.75);
    }
    for (const w of this.slots) if (w) BR.Weapons.update(w, dt, this);
    if (this.fireHeld) BR.Weapons.tryFire(this.game, this);
    if (this.mesh) this.syncMesh(dt);
  }

  heal(amount) {
    const max = BR.CONFIG.actor.maxHealth;
    if (this.health >= max) return false;
    this.health = Math.min(max, this.health + amount);
    return true;
  }

  addShield(amount) {
    const max = BR.CONFIG.actor.maxShield;
    if (this.shield >= max) return false;
    this.shield = Math.min(max, this.shield + amount);
    return true;
  }

  // Shield soaks damage first. bypassShield is used by the zone.
  takeDamage(amount, bypassShield) {
    let left = amount;
    if (!bypassShield && this.shield > 0) {
      const s = Math.min(this.shield, left);
      this.shield -= s;
      left -= s;
    }
    this.health -= left;
    return this.health <= 0;
  }

  // ---------------------------------------------------------------- visuals
  buildMesh() {
    if (BR.CHAR_DATA && !this.zombie) return BR.Actor.prototype.buildCharMesh.call(this);      // (also called on plain objects: party stage)
    return BR.Actor.prototype.buildProcMesh.call(this);
  }
  // v1.25: the imported character, skinned onto the same joints the procedural animations drive (every pose,
  // run cycle, crouch, slide, knockdown, death and victory keeps working). Two draw calls: the jacket in the
  // team colour, everything else in its region colours (pants, boots, gloves, chest rig, ski mask).
  buildCharMesh() {
    const C = charAssets(), g = new THREE.Group(), body = new THREE.Group();
    const leg = x => { const hip = new THREE.Group(); hip.position.set(x, 0.96, 0); const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee); return { hip, knee }; };
    const L = leg(-0.1), R = leg(0.1); body.add(L.hip, R.hip);
    const upper = new THREE.Group(); upper.position.y = 1.0;
    const head = new THREE.Group(); head.position.y = 0.7; upper.add(head);
    const arm = x => { const sh = new THREE.Group(); sh.position.set(x, 0.5, 0); upper.add(sh); const el = new THREE.Group(); el.position.y = -0.28; sh.add(el); return { sh, el }; };
    const AR = arm(0.22), AL = arm(-0.22);
    const gun = new THREE.Group(); gun.position.set(0.1, 0.38, -0.2); upper.add(gun);
    body.add(upper); g.add(body);
    // bind pose = the model's A-pose: arms out, elbows a touch bent, legs slightly apart
    const B = BR.CHAR_DATA.bind;
    AR.sh.rotation.z = B.sh; AL.sh.rotation.z = -B.sh; AR.el.rotation.z = B.el; AL.el.rotation.z = -B.el;
    R.hip.rotation.z = B.hip; L.hip.rotation.z = -B.hip; R.knee.rotation.z = B.knee; L.knee.rotation.z = -B.knee;
    g.updateMatrixWorld(true);
    const skel = new THREE.Skeleton([body, upper, head, AR.sh, AR.el, AL.sh, AL.el, R.hip, R.knee, L.hip, L.knee]);
    // one skinned mesh, one draw call: per-vertex colours (pants, boots, gloves) with the jacket in this actor's
    // team colour, blended smoothly at the borders. The geometry is shared; only the colour layer is per actor.
    const geo = new THREE.BufferGeometry(); for (const k in C.geo.attributes) if (k !== 'color') geo.setAttribute(k, C.geo.attributes[k]);
    geo.setIndex(C.geo.index); geo.boundingSphere = C.geo.boundingSphere;
    const colA = new THREE.BufferAttribute(new Float32Array(C.base), 3); geo.setAttribute('color', colA);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: C.fabric, skinning: true });
    // existing code sets team colours with mat.color.setHex(...): route that into the jacket's vertex colours instead
    const fill = (idx, hex) => { const c = new THREE.Color(hex), a = colA.array; for (const i of idx) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } colA.needsUpdate = true; };
    const paint = hex => fill(C.teamIdx, hex);
    // v1.26: the equipped outfit (players and party members) overrides the team colour
    const own = (T, k) => T && k !== 'default' && Object.prototype.hasOwnProperty.call(T, k) ? T[k] : null;
    const look = BR.lookOf(this), O = look && own(BR.OUTFITS, look.o), K = look && own(BR.MASKS, look.m), Hh = look && own(BR.HATS, look.h);
    mat.color.setHex = function (hex) { if (!O) paint(hex); return this; };
    mat.clone = function () { const m = THREE.MeshLambertMaterial.prototype.clone.call(this); m.color.setHex = mat.color.setHex; m.clone = mat.clone; return m; };     // (the enemy highlight clones it)
    paint(O ? O.jacket : this.color !== undefined ? this.color : 0x8899aa);
    let mat2 = null;
    if (O) {
      if (O.pants !== undefined) fill(C.reg.pants, O.pants);
      if (O.boots !== undefined) fill(C.reg.boots, O.boots);
      if (O.gloves !== undefined) fill(C.reg.gloves, O.gloves);
      if (O.pat || O.glowPat) {                                       // the jacket gets its own patterned / glowing material
        const T = outfitTex(look.o, O);
        mat2 = new THREE.MeshLambertMaterial({ vertexColors: true, map: T.map, skinning: true, emissive: T.glow ? O.glow : 0x000000, emissiveMap: T.glow || null });
        mat2.userData.emi = T.glow ? O.glow : 0;
        geo.setIndex(C.split.index); geo.addGroup(0, C.split.nj, 0); geo.addGroup(C.split.nj, C.split.n - C.split.nj, 1);
      }
    }
    const sm = new THREE.SkinnedMesh(geo, mat2 ? [mat2, mat] : mat); sm.bind(skel); sm.userData.noMerge = true; g.add(sm);
    // the ski mask head (smooth knit, eye opening) on the head joint, in the equipped mask's colours
    const MT = K ? maskTex(look.m, K) : null;
    const mat3 = new THREE.MeshLambertMaterial({ map: MT ? MT.map : C.maskTex, emissive: MT && MT.glow ? (K.glow || K.eyeCol || 0xff2030) : 0x000000, emissiveMap: MT && MT.glow || null });
    mat3.userData.emi = MT && MT.glow ? (K.glow || K.eyeCol || 0xff2030) : 0;
    const mk = BR.CHAR_DATA.mask, maskM = new THREE.Mesh(C.mask, mat3); maskM.position.set(mk.c[0], mk.c[1] - 1.7, mk.c[2]); head.add(maskM);
    if (K && K.add) maskM.add(maskAddon(K.add, K));
    let hatTick = null;
    if (Hh) { const hat = buildHat(look.h, Hh); maskM.add(hat); hatTick = hat.userData.tick; }        // v1.27 hats
    for (const o of [AR.sh, AL.sh, AR.el, AL.el, R.hip, L.hip, R.knee, L.knee]) o.rotation.set(0, 0, 0);     // back to the rig's rest pose
    const chute = BR.Models.parachute(this.color, 0xf2f2f2);
    chute.position.y = 1.5; chute.visible = false; g.add(chute);
    g.userData = { body, upper, head, L, R, AR, AL, gun, mat, mat2, mat3, chute, t: 0, yaw: this.yaw, pitch: 0, char: true, hatTick };
    return g;
  }

  buildProcMesh() {
    // Low-poly humanoid. Joints: hips > thighs > knees > shins; waist > upper body
    // (chest, vest, neck, head, shoulders > arms holding the gun). All poses animate joints.
    const S = sharedGeo();
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: this.color });            // team colour: shirt + helmet
    const pants = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.color).multiplyScalar(0.35).add(new THREE.Color(0x1d2026)) });
    const skin = S.skins[Math.floor(Math.random() * S.skins.length)];
    const mesh = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); return o; };
    const body = new THREE.Group();
    body.add(mesh(S.hips, pants, 0, 0.97, 0));
    const leg = x => {
      const hip = new THREE.Group(); hip.position.set(x, 0.96, 0);
      hip.add(mesh(S.thigh, pants));
      const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
      knee.add(mesh(S.shin, pants));
      knee.add(mesh(S.boot, S.boots, 0, -0.44, -0.04));
      return { hip, knee };
    };
    const L = leg(-0.1), R = leg(0.1);
    body.add(L.hip, R.hip);
    const upper = new THREE.Group(); upper.position.y = 1.0;
    upper.add(mesh(S.abdomen, pants, 0, 0.1, 0));
    const chest = mesh(S.chest, mat, 0, 0.36, 0); chest.scale.z = 0.62; upper.add(chest);
    upper.add(mesh(S.vest, S.dark, 0, 0.34, -0.1));
    upper.add(mesh(S.pack, S.dark, 0, 0.36, 0.17));
    upper.add(mesh(S.neck, skin, 0, 0.56, 0));
    const head = new THREE.Group(); head.position.y = 0.7; upper.add(head);
    const face = mesh(S.head, skin); face.scale.set(0.95, 1.08, 1); head.add(face);
    head.add(mesh(S.helmet, mat, 0, 0.02, 0));
    head.add(mesh(S.visor, S.visorMat, 0, 0.0, -0.11));
    // Arms: shoulder joints swing the whole arm; elbows bend so the hands meet the gun
    const arm = x => {
      const sh = new THREE.Group(); sh.position.set(x, 0.5, 0); upper.add(sh);
      sh.add(mesh(S.shoulder, mat));
      sh.add(mesh(S.upperArm, mat));
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      el.add(mesh(S.forearm, mat));
      el.add(mesh(S.hand, S.gloves, 0, -0.27, 0));
      return { sh, el };
    };
    const AR = arm(0.22), AL = arm(-0.22);
    const gun = new THREE.Group(); gun.position.set(0.1, 0.38, -0.2);   // holds the real weapon model
    upper.add(gun);
    body.add(upper);
    g.add(body);
    const chute = BR.Models.parachute(this.color, 0xf2f2f2);
    chute.position.y = 1.5; chute.visible = false;
    g.add(chute);
    g.userData = { body, upper, head, L, R, AR, AL, gun, mat, chute, t: 0, yaw: this.yaw, pitch: 0 };
    collapseMeshes(g, gun);          // ~33 draw calls per bot -> ~14 (parts on the same joint share one mesh per material)
    return g;
  }

  syncMesh(dt) {
    const m = this.mover, u = this.mesh.userData, U = BR.util;
    this.mesh.position.copy(m.pos);
    if (u.hatTick) u.hatTick(performance.now() / 1000);
    const sp = m.speedH;
    // Smooth turning: the body eases toward where it's facing (or sliding), the
    // upper body / head / gun ease toward the aim — no snapping on either end.
    const velYaw = Math.atan2(-m.vel.x, -m.vel.z);
    const faceYaw = m.sliding && sp > 1 ? velYaw : this.yaw;
    u.yaw = dampAngle(u.yaw, faceYaw, 14, dt);
    this.mesh.rotation.y = u.yaw;
    // shoulders counter-rotate against the hip sway so the pelvis visibly swings under them
    u.upper.rotation.y = U.damp(u.upper.rotation.y, U.clamp(U.wrapAngle(this.yaw - u.yaw), -1.1, 1.1) - (u.hipYaw || 0) * 1.15, 16, dt);
    u.pitch = U.damp(u.pitch, this.pitch, 14, dt);
    u.spS = U.damp(u.spS || 0, sp, 7, dt);                       // v1.21: smoothed speed drives the gait (no stride pops)
    u.t += dt * (u.spS * 1.3 + (u.spS > 0.3 ? 0.6 : 0));
    // targets: [hipL, kneeL, hipR, kneeR, lean, bodyY, bodyX]
    let hL = 0, kL = 0, hR = 0, kR = 0, lean = 0, bodyY = 0, bodyX = 0, armsUp = 0, armsOut = 0, hipYaw = 0, hipRoll = 0, hipShift = 0;
    let crawl = 0;
    let crawlZ = 0;
    if (this.downed) {                            // v1.27.2 knocked down: crawling on hands and knees, centred on the hitbox
      u.ct = (u.ct || 0) + dt * (1.2 + Math.min(1, sp) * 3.2);   // the crawl cycle runs with the crawl speed (a slow sway when still)
      const c = Math.sin(u.ct), K = CRAWL;
      bodyY = K.by + Math.abs(Math.cos(u.ct)) * 0.02; crawlZ = K.cz; lean = K.lean;
      hL = K.h + c * 0.16; kL = K.k - c * 0.12; hR = K.h - c * 0.16; kR = K.k + c * 0.12;      // knees on the ground, shins flat behind, stepping in turn
      hipRoll = c * 0.05; hipYaw = c * 0.06; crawl = c || 0.0001;
    } else if (m.dropping && !m.chute) {                 // freefall: belly down, limbs spread
      bodyX = -1.4; bodyY = 1.0; hL = 0.3; kL = 0.6; hR = 0.25; kR = 0.5; armsOut = 1.1;
    } else if (m.dropping) {                      // under canopy: holding the lines, legs dangling
      const sw = Math.sin(performance.now() / 420) * 0.15;
      hL = -0.15 + sw; kL = 0.3; hR = -0.1 - sw; kR = 0.35; armsUp = 1;
    } else if (m.sliding) {                       // slide: lead leg straight out, trail leg tucked, lean back
      bodyY = -0.5; hL = -1.45; kL = 0.05; hR = -0.55; kR = 1.55; lean = 0.42;
    } else if (m.crouched) {
      bodyY = -0.34; hL = -1.0; kL = 1.6; hR = -0.6; kR = 1.4; lean = 0.18;
    } else if (!m.onGround) {                     // jump: tuck the knees
      hL = -0.7; kL = 1.0; hR = -0.2; kR = 0.6; lean = 0.05;
    } else {                                      // v1.21 direction-aware gait: forward/back strides, side-steps when strafing
      const spd = u.spS, c = Math.sin(u.t), cc = Math.cos(u.t);
      const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw), vf = m.vel.x * fx + m.vel.z * fz, vs = m.vel.x * -fz + m.vel.z * fx;
      const n = Math.max(0.001, Math.hypot(vf, vs)), f = vf / n, l = vs / n;          // f: +1 forward, -1 back; l: strafe share
      u.gf = U.damp(u.gf === undefined ? 1 : u.gf, spd > 0.3 ? f : 1, 8, dt); u.gl = U.damp(u.gl || 0, spd > 0.3 ? l : 0, 8, dt);
      const a = Math.min(0.72, spd * 0.085) * (spd < 2.6 ? 0.75 : 1);                 // a shorter, calmer stride when walking
      const fw = Math.abs(u.gf), sd = Math.min(1, Math.abs(u.gl) * 1.2), dir = u.gf < 0 ? -1 : 1;
      hL = c * a * fw * dir; hR = -c * a * fw * dir;
      const lift = a * (1.25 + 0.35 * sd);                                             // knees lift on the swing (also when side-stepping)
      kL = Math.max(0, -cc) * lift + (spd > 0.4 ? 0.12 : 0); kR = Math.max(0, cc) * lift + (spd > 0.4 ? 0.12 : 0);
      u.side = c * a * 0.55 * sd * Math.sign(u.gl || 1);                              // legs open + cross when strafing
      lean = U.clamp(u.gf * spd * 0.011, -0.05, 0.11);
      bodyY = -(0.5 - 0.5 * Math.cos(u.t * 2)) * Math.min(spd * 0.0065, 0.04);         // smooth double bounce per stride (no sharp dip)
      const amp = Math.min(1, spd / 5);
      hipYaw = c * 0.17 * amp * fw; hipRoll = c * 0.06 * amp - u.gl * Math.min(spd * 0.012, 0.07); hipShift = c * 0.03 * amp;
    }
    const D = (o, key, v, k) => { o[key] = U.damp(o[key], v, k, dt); };
    D(u.L.hip.rotation, 'x', hL, 16); D(u.L.knee.rotation, 'x', kL, 16);
    D(u.R.hip.rotation, 'x', hR, 16); D(u.R.knee.rotation, 'x', kR, 16);
    const sideOn = !m.dropping && !m.sliding && !m.crouched && m.onGround && !this.downed ? (u.side || 0) : 0;
    D(u.L.hip.rotation, 'z', -0.04 + sideOn, 14); D(u.R.hip.rotation, 'z', 0.04 + sideOn, 14);
    D(u.upper.rotation, 'x', lean, 12);
    D(u.body.rotation, 'x', bodyX, 7);
    D(u.body.position, 'y', bodyY, 12);
    D(u.body.rotation, 'z', (m.wallRunning ? 0.35 * (m.wallN.x + m.wallN.z) : m.sliding ? 0.1 : 0) + hipRoll, 10);
    D(u.body.rotation, 'y', hipYaw, 12); D(u.body.position, 'x', hipShift, 12); D(u.body.position, 'z', crawlZ, 10);
    if (this.downed) { D(u.L.hip.rotation, 'z', -CRAWL.hz, 10); D(u.R.hip.rotation, 'z', CRAWL.hz, 10); }
    D(u.upper.rotation, 'z', -hipRoll * 0.8, 12);
    u.hipYaw = u.body.rotation.y;
    // Aim: head + arms + gun follow the (smoothed) pitch together
    const aimP = u.pitch - u.upper.rotation.x;
    u.head.rotation.x = this.downed ? CRAWL.head : aimP * 0.6;           // downed: chin up, looking ahead
    u.gun.rotation.x = aimP;
    // Arms: two-bone IK puts the right hand on the grip and the left on the foregrip
    // of whatever gun is held; blends to holding the risers (canopy) or spread (freefall).
    const gp = u.gp || { grip: _ikV.set(0, -0.05, 0.1).clone(), fore: null };
    const sc = u.gunScale || 1.15;
    const tR = _ikA.copy(gp.grip).multiplyScalar(sc).applyEuler(u.gun.rotation).add(u.gun.position);
    const tL = _ikB.copy(gp.fore || _ikV.set(0, -0.03, -0.22)).multiplyScalar(gp.fore ? sc : 1).applyEuler(u.gun.rotation).add(u.gun.position);
    if (u.gun.userData.knife) tL.set(-0.2, 0.08, -0.08);           // off hand guards while holding the knife
    const up = Math.max(armsUp, 0), out = Math.min(armsOut, 1);
    if (up > 0) { tR.lerp(_ikV.set(0.2, 1.08, 0.02), up); tL.lerp(_ikC.set(-0.2, 1.08, 0.02), up); }
    if (crawl) {                                   // elbows on the ground ahead of the shoulders, reaching and pulling in turn
      const K = CRAWL;                             // hands planted under the shoulders, reaching forward in turn (the moving hand lifts)
      tR.set(K.ax, K.ay + crawl * 0.1, K.az + Math.max(0, crawl) * 0.07); tL.set(-K.ax, K.ay - crawl * 0.1, K.az + Math.max(0, -crawl) * 0.07);
    }
    if (out > 0) { tR.lerp(_ikV.set(0.62, 0.58, 0.05), out); tL.lerp(_ikC.set(-0.62, 0.58, 0.05), out); }
    if (!u.hR) { u.hR = tR.clone(); u.hL = tL.clone(); }
    const kk = 1 - Math.exp(-dt * 18);
    u.hR.lerp(tR, kk); u.hL.lerp(tL, kk);
    solveArm(u.AR, u.hR, 1); solveArm(u.AL, u.hL, -1);
    u.gun.visible = !m.dropping && !this.downed;
    u.chute.visible = !!(m.dropping && m.chute);
    if (u.chute.visible) u.chute.rotation.z = Math.sin(performance.now() / 700) * 0.06;
    // Show the gun this bot is actually holding
    const wid = this.weapon ? this.weapon.id : null;
    if (u.wid !== wid) {
      u.wid = wid;
      while (u.gun.children.length) u.gun.remove(u.gun.children[0]);
      if (wid) {
        const sc = wid === 'knife' ? 1.6 : wid === 'bayonet' || wid === 'tracker' ? 1.3 : 1.15, gm = BR.Models.worldWeapon(wid);
        gm.scale.setScalar(sc); u.gun.add(gm);
        u.gp = BR.Models.gripPoints(wid); u.gunScale = sc; u.gun.userData.knife = wid === 'knife' || wid === 'bayonet' || wid === 'tracker';
      }
    }
  }

  // Flash white briefly on hit
  flash() {
    if (!this.mesh) return;
    const u = this.mesh.userData, mats = [u.mat, u.mat2, u.mat3].filter(Boolean);
    for (const mat of mats) { mat.emissive.setHex(0xffffff); mat.emissiveIntensity = 0.7; }
    clearTimeout(this._flashTO);
    this._flashTO = setTimeout(() => { for (const mat of mats) { mat.emissive.setHex(mat.userData.emi || 0); mat.emissiveIntensity = 1; } }, 70);
  }

  // Ragdoll-lite: topple over
  dieVisual() {
    if (!this.mesh) return;
    const u = this.mesh.userData;
    u.body.rotation.x = -Math.PI / 2; u.body.position.y = 0.25;
    u.L.hip.rotation.x = u.R.hip.rotation.x = 0; u.L.knee.rotation.x = 0.3; u.R.knee.rotation.x = 0.1;
    u.chute.visible = false;
  }
};

// shared with zombies.js: the humanoid part geometry + the draw-call merger
BR.actorGeo = sharedGeo;
BR.collapseMeshes = collapseMeshes;
BR.dampAngle = dampAngle;
