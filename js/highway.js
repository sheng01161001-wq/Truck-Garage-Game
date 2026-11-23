// 城外路線：國道（收費站）→ 山路（陡坡 8%、山風隧道）→ 山上林場
// 道路用「中心線取樣點」描述：每 4 公尺一點，記錄位置、方向、路面高度、路寬、是不是隧道。
import * as THREE from 'three';
import { clamp, makeNoise, canvasTex, FONT } from './util.js';
import { asphaltTex, noiseBumpTex, concreteTex, corrugatedTex, boardTex, stripeTex } from './textures.js';

const N = makeNoise(42);
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const CITY = 300; // 市區範圍（正方形半邊）

// ---------- 地形（遠山＋一道山脊，路從山脊下面的隧道穿過） ----------
function spur(x, z) { return 45 * Math.exp(-(((z + 265) / 38) ** 2)) * sm((x - 400) / 80); }
export function naturalHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const t = clamp((d - 360) / 520, 0, 1);
  if (t <= 0) return 0;
  const ridge = N.fbm(x / 420 + 10, z / 420 - 3, 5), hills = N.fbm(x / 110, z / 110, 3);
  return t * t * (90 + ridge * 520) + t * hills * 45 + spur(x, z);
}

// ---------- 路線：直線＋圓弧 ----------
const DS = 4;
const SEGS = [['s', 110], ['a', 110, 90], ['s', 160], ['a', 150, -25], ['s', 100]];
export const PTS = [];
{
  let x = CITY, z = -80, h = Math.PI / 2;
  const push = () => PTS.push({ x, z, hd: h });
  push();
  for (const sg of SEGS) {
    if (sg[0] === 's') {
      const n = Math.round(sg[1] / DS);
      for (let i = 0; i < n; i++) { x += Math.sin(h) * DS; z += Math.cos(h) * DS; push(); }
    } else {
      const R = sg[1], A = (sg[2] * Math.PI) / 180, n = Math.round((Math.abs(A) * R) / DS), da = A / n, step = Math.abs(da) * R;
      for (let i = 0; i < n; i++) { h += da / 2; x += Math.sin(h) * step; z += Math.cos(h) * step; h += da / 2; push(); }
    }
  }
}
const NP = PTS.length;
export const LEN = (NP - 1) * DS;
export const TOLL_S = 55; // 收費亭的位置（離市區 55 公尺）
const PAD_LEN = 100; // 最後 100 公尺是林場空地

function halfWOf(s) {
  let w = 7;
  if (s < 100) w = 7 + 14 * (s < TOLL_S ? sm((s - 10) / 30) : sm((100 - s) / 30));
  if (s > LEN - PAD_LEN) w = Math.max(w, 7 + 23 * sm((s - (LEN - PAD_LEN)) / 25));
  return w;
}
// 路面高度：照著山的高度走，但坡度最多 8%；收費站和林場是平的
{
  const G = 0.08 * DS, H = PTS.map((p) => naturalHeight(p.x, p.z) - 1.5);
  for (let i = 0; i < NP; i++) if (i * DS <= 70) H[i] = 0;
  for (let i = 1; i < NP; i++) H[i] = Math.min(H[i], H[i - 1] + G);
  const padStart = NP - 1 - Math.round(PAD_LEN / DS);
  for (let i = padStart; i < NP; i++) H[i] = H[padStart];
  for (let i = NP - 2; i >= 0; i--) H[i] = Math.max(H[i], H[i + 1] - G);
  PTS.forEach((p, i) => {
    p.s = i * DS; p.y = Math.max(0, H[i]); p.w = halfWOf(p.s);
    p.fx = Math.sin(p.hd); p.fz = Math.cos(p.hd); p.rx = -p.fz; p.rz = p.fx; // 右手邊方向
  });
  // 山蓋得比路面高 24 公尺以上的地方挖隧道
  for (const p of PTS) p.tun = p.s > 120 && p.s < LEN - PAD_LEN - 20 && naturalHeight(p.x, p.z) - p.y > 24;
  // 去掉太短的（小於 40 公尺）
  for (let i = 0; i < NP;) {
    if (!PTS[i].tun) { i++; continue; }
    let j = i; while (j < NP && PTS[j].tun) j++;
    if ((j - i) * DS < 40) for (let k = i; k < j; k++) PTS[k].tun = false;
    i = j;
  }
}
export const TUNNELS = [];
for (let i = 0; i < NP; i++) if (PTS[i].tun && (i === 0 || !PTS[i - 1].tun)) { let j = i; while (j + 1 < NP && PTS[j + 1].tun) j++; TUNNELS.push({ i0: i, i1: j, s0: PTS[i].s, s1: PTS[j].s }); }

// 兩邊挖山（或填土）的坡面寬度
for (const p of PTS) {
  for (const side of [-1, 1]) {
    const o = side * (p.w + 20), d = Math.abs(naturalHeight(p.x + p.rx * o, p.z + p.rz * o) - p.y);
    const span = p.tun ? 30 : clamp(d * 1.3, 10, 45);
    p[side < 0 ? 'spanL' : 'spanR'] = span;
    p[side < 0 ? 'sinkL' : 'sinkR'] = p.w + 1.2 + span + 5;
  }
}
const BB = { minx: Infinity, maxx: -Infinity, minz: Infinity, maxz: -Infinity };
for (const p of PTS) { BB.minx = Math.min(BB.minx, p.x - 140); BB.maxx = Math.max(BB.maxx, p.x + 140); BB.minz = Math.min(BB.minz, p.z - 140); BB.maxz = Math.max(BB.maxz, p.z + 140); }

// ---------- 查詢 ----------
export function hwProject(x, z) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < NP; i++) { const p = PTS[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  const p = PTS[bi], dx = x - p.x, dz = z - p.z;
  return { s: p.s + dx * p.fx + dz * p.fz, o: dx * p.rx + dz * p.rz, i: bi };
}
export function roadY(s) {
  const f = clamp(s / DS, 0, NP - 1), i = Math.min(NP - 2, Math.floor(f)), t = f - i;
  return PTS[i].y + (PTS[i + 1].y - PTS[i].y) * t;
}
// 路上某一點（s 公尺、偏右 o 公尺）的世界座標
export function hwAt(s, o = 0) {
  const f = clamp(s / DS, 0, NP - 1), i = Math.min(NP - 2, Math.floor(f)), t = f - i, a = PTS[i], b = PTS[i + 1];
  const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
  const hd = a.hd + (b.hd - a.hd) * t, rx = -Math.cos(hd), rz = Math.sin(hd);
  return { x: x + rx * o, z: z + rz * o, y: a.y + (b.y - a.y) * t, hd, grade: (b.y - a.y) / DS };
}
export const inCity = (x, z) => Math.abs(x) <= CITY && Math.abs(z) <= CITY;
// 地面高度（市區都是 0）
export function groundAt(x, z) {
  if (inCity(x, z)) return 0;
  const q = hwProject(x, z);
  return q.s < 0 ? 0 : roadY(q.s);
}
function inTunnelS(s) { return TUNNELS.some((t) => s >= t.s0 && s <= t.s1); }
export function inTunnel(x, y, z) {
  if (inCity(x, z)) return false;
  const q = hwProject(x, z);
  return inTunnelS(q.s) && Math.abs(q.o) < 8.8 && y < roadY(q.s) + 9.2;
}
// 地表高度（包含路旁挖出來的山坡）：鏡頭用，避免鑽進山裡
export function surfaceY(x, z) {
  if (inCity(x, z)) return 0;
  const n = naturalHeight(x, z);
  if (x < BB.minx || x > BB.maxx || z < BB.minz || z > BB.maxz) return n;
  const q = hwProject(x, z);
  if (q.s < 0 || q.s > LEN) return n;
  const p = PTS[q.i];
  if (p.tun) return Math.max(n, p.y + 10.5);
  const f = (Math.abs(q.o) - p.w - 1.2) / (q.o < 0 ? p.spanL : p.spanR);
  if (f <= 0) return p.y;
  if (f >= 1) return n;
  return p.y + (n - p.y) * (1 - (1 - f) ** 1.7);
}
export function nearTunnel(x, z, margin = 25) {
  if (inCity(x, z)) return false;
  const q = hwProject(x, z);
  return Math.abs(q.o) < 12 && TUNNELS.some((t) => q.s >= t.s0 - margin && q.s <= t.s1 + margin);
}
export function nearHighway(x, z, pad = 8) {
  if (x < BB.minx || x > BB.maxx || z < BB.minz || z > BB.maxz) return false;
  const q = hwProject(x, z);
  if (q.s < -20 || q.s > LEN + 20) return false;
  const p = PTS[q.i];
  return Math.abs(q.o) < (q.o < 0 ? p.sinkL : p.sinkR) + pad;
}
// 遠山地形：路的兩旁壓到地底（上面另外蓋道路的山坡）
export function terrainHeight(x, z) {
  const h = naturalHeight(x, z);
  if (Math.max(Math.abs(x), Math.abs(z)) < 372) return h;
  if (x < BB.minx || x > BB.maxx || z < BB.minz || z > BB.maxz) return h;
  const q = hwProject(x, z);
  if (q.s < 0 || q.s > LEN) return h;
  const p = PTS[q.i];
  return Math.abs(q.o) < (q.o < 0 ? p.sinkL : p.sinkR) ? p.y - 30 : h;
}

// ---------- 碰撞：護欄、收費亭、柵欄、林場的木頭堆 ----------
const RECTS = []; // 用道路座標 (s, o) 表示的長方形
export const GATES = [];
function wallHalf(s) { return inTunnelS(s) ? 7.0 : halfWOf(s) + 0.9; }
export function hwBlocked(x, z, r) {
  const q = hwProject(x, z);
  if (q.s < -6 || q.s > LEN - 1.5 - r) return true;
  if (Math.abs(q.o) + r > wallHalf(q.s)) return true;
  for (const b of RECTS) {
    if (b.gate && b.gate.open > 0.6) continue;
    const cs = clamp(q.s, b.s0, b.s1), co = clamp(q.o, b.o0, b.o1);
    if ((q.s - cs) ** 2 + (q.o - co) ** 2 < r * r) return true;
  }
  return false;
}

// 收費站：每個車道一支柵欄，慢下來（30 公里以下）才會打開
const ISLANDS = [-14, -7, 0, 7, 14];
for (const side of [1, -1]) for (let k = 0; k < 3; k++) {
  const a = 7 * k + 0.7, b = 7 * k + 6.3;
  const g = { side, s: TOLL_S + side * 4, o0: side > 0 ? a : -b, o1: side > 0 ? b : -a, pivot: side * a, open: 0, want: 0, mesh: null };
  GATES.push(g);
  RECTS.push({ s0: g.s - 0.2, s1: g.s + 0.2, o0: g.o0, o1: g.o1, gate: g });
}
for (const o of ISLANDS) RECTS.push({ s0: TOLL_S - 6, s1: TOLL_S + 6, o0: o - 0.7, o1: o + 0.7 });
// 林場
RECTS.push({ s0: LEN - 15, s1: LEN + 5, o0: -14, o1: 14 });
RECTS.push({ s0: LEN - 72, s1: LEN - 24, o0: 20.5, o1: 31 });
RECTS.push({ s0: LEN - 58, s1: LEN - 30, o0: -31, o1: -20.5 });

// 柵欄開關：rigPts＝卡車的四個點（第一個是車頭附近），speed＝車速（公尺/秒）
export function updateHighway(dt, rigPts, carPos, speed) {
  for (const g of GATES) {
    let want = false;
    const lane = (o) => o > Math.min(g.o0, g.o1) - 1.2 && o < Math.max(g.o0, g.o1) + 1.2;
    for (const p of rigPts) {
      if (inCity(p.x, p.z)) continue;
      const q = hwProject(p.x, p.z);
      if (!lane(q.o)) continue;
      const before = (g.s - q.s) * g.side; // 正的＝還沒到柵欄
      if (Math.abs(before) < 13 && g.open > 0.3) want = true; // 車子正在通過，不能放下
      if (Math.abs(before) < 26 && speed < 8.4) want = true;
    }
    for (const c of carPos) {
      if (inCity(c.x, c.z)) continue;
      const q = hwProject(c.x, c.z);
      if (lane(q.o) && Math.abs(q.s - g.s) < 16) want = true;
    }
    g.open = clamp(g.open + (want ? 1.6 : -0.8) * dt, 0, 1);
    if (g.mesh) g.mesh.rotation.z = -g.side * 1.4 * sm(g.open);
  }
}

// 林場（送貨點）
const padP = hwAt(LEN - 42);
export const LUMBER = { name: '林場', emoji: '🌲', x: padP.x, z: padP.z, y: padP.y, bx: hwAt(LEN - 8).x, bz: hwAt(LEN - 8).z, color: '#2e7d32', kind: 'lumber' };
export const TUNNEL_LAMPS = [];

// ---------- 蓋出來 ----------
// ctx: { stdMat, wet(mat,dry,wet,col), night(mat,on), colorAt(x,z,h,outColor), bayMat, lamps(陣列) , quality }
export function buildHighway(root, ctx) {
  const { stdMat } = ctx;
  const P2W = (p, o, dy) => new THREE.Vector3(p.x + p.rx * o, p.y + dy, p.z + p.rz * o);
  const inSq = (x, z) => Math.abs(x) < 372 && Math.abs(z) < 372;

  // ---- 山坡（挖方／填方）＋隧道上方的山 ----
  const F = [0.12, 0.3, 0.5, 0.72, 1], OUT = [12, 25, 38, 50];
  const cutCol = new THREE.Color(0x7a6d5c), gravelCol = new THREE.Color(0x77736b), tmp = new THREE.Color(), nat = new THREE.Color();
  const pos = [], col = [], idx = [];
  const COLS = 2 * (2 + F.length + OUT.length) + 1; // 每個斷面的點數
  const CENTER = (COLS - 1) / 2;
  function section(p, cover) {
    const out = [];
    for (const side of [-1, 1]) {
      const span = side < 0 ? p.spanL : p.spanR, list = [];
      const add = (o, h, kind, f = 0) => list.push({ o: side * o, h, kind, f });
      const w = p.w;
      add(w, p.y - 0.03, 'gravel'); add(w + 1.2, p.y - 0.35, 'gravel');
      for (const f of F) add(w + 1.2 + span * f, null, 'cut', f);
      for (const e of OUT) add(w + 1.2 + span + e, null, 'nat');
      if (side < 0) list.reverse();
      out.push(list);
    }
    const all = [...out[0], { o: 0, h: p.y - 0.03, kind: 'gravel' }, ...out[1]];
    for (const c of all) {
      const X = p.x + p.rx * c.o, Z = p.z + p.rz * c.o, n = naturalHeight(X, Z);
      if (cover) { c.h = Math.max(n, p.y + 10.5); c.kind = 'nat'; }
      else if (c.kind === 'cut') { const g = 1 - (1 - c.f) ** 1.7; c.h = p.y + (n - p.y) * g; }
      else if (c.kind === 'nat') c.h = n;
      if (!cover && c.kind !== 'nat' && inSq(X, Z)) c.h -= 0.3;
      else if (inSq(X, Z) && c.h < 0.05) c.h = -0.3;
      ctx.colorAt(X, Z, Math.max(0, c.h), nat);
      if (c.kind === 'gravel') tmp.copy(gravelCol);
      else if (c.kind === 'cut') tmp.copy(cutCol).lerp(nat, c.f ** 1.5).multiplyScalar(0.9 + ((c.o * 7 + p.s) % 5) * 0.03);
      else tmp.copy(nat);
      c.X = X; c.Z = Z; c.r = tmp.r; c.g = tmp.g; c.b = tmp.b;
    }
    return all;
  }
  const cutSec = [], covSec = [];
  const vIndex = (sec) => {
    const base = pos.length / 3;
    for (const c of sec) { pos.push(c.X, c.h, c.Z); col.push(c.r, c.g, c.b); }
    return base;
  };
  for (let i = 0; i < NP; i++) {
    const p = PTS[i];
    const near = (i > 0 && PTS[i - 1].tun) || (i < NP - 1 && PTS[i + 1].tun) || p.tun;
    const c = section(p, false); cutSec.push({ sec: c, base: vIndex(c) });
    if (near && p.tun) { const v = section(p, true); covSec.push({ sec: v, base: vIndex(v), i }); } else covSec.push(null);
  }
  const strip = (a, b, skipCenter) => {
    for (let j = 0; j < COLS - 1; j++) {
      if (skipCenter && (j === CENTER - 1 || j === CENTER)) continue;
      const a0 = a + j, a1 = a + j + 1, b0 = b + j, b1 = b + j + 1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  };
  for (let i = 0; i < NP - 1; i++) {
    if (PTS[i].tun && PTS[i + 1].tun) strip(covSec[i].base, covSec[i + 1].base, false);
    else strip(cutSec[i].base, cutSec[i + 1].base, true);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  rg.setIndex(idx); rg.computeVertexNormals();
  // 三角形方向要朝上
  const slopeMat = stdMat({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const slope = new THREE.Mesh(rg, slopeMat); slope.receiveShadow = true; slope.castShadow = true; root.add(slope);

  // ---- 路面 ----
  const bump = noiseBumpTex(5, 256, 0.8); bump.repeat.set(4, 8);
  const asphalt = stdMat({ map: asphaltTex('highway'), bumpMap: bump, bumpScale: 1.2, roughness: 0.88 });
  ctx.wet(asphalt, 0.88, 0.12, new THREE.Color(0.55, 0.56, 0.6));
  const ct = concreteTex(); ct.repeat.set(1, 1);
  const padMat = stdMat({ map: ct, roughness: 0.85 });
  ctx.wet(padMat, 0.85, 0.25, new THREE.Color(0.7, 0.7, 0.72));
  const deck = (i0, i1, mat, uvScale) => {
    const dp = [], du = [], di = [];
    for (let i = i0; i <= i1; i++) {
      const p = PTS[i];
      for (const o of [-p.w, p.w]) { const v = P2W(p, o, 0.02); dp.push(v.x, v.y, v.z); du.push(uvScale ? (o + p.w) / 20 : (o + 7) / 14, p.s / (uvScale ? 20 : 28)); }
      if (i > i0) { const b = (i - i0) * 2; di.push(b - 2, b - 1, b, b - 1, b + 1, b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2));
    g.setIndex(di); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; root.add(m);
  };
  const padI = Math.round((LEN - PAD_LEN + 10) / DS);
  deck(0, padI, asphalt, false); deck(padI, NP - 1, padMat, true);

  // ---- 護欄（隧道裡沒有） ----
  const railMat = stdMat({ color: 0xb8bec4, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide });
  const postG = new THREE.BoxGeometry(0.15, 0.9, 0.15).translate(0, 0.45, 0);
  const postSpots = [];
  for (const side of [-1, 1]) {
    const rp = [], ri = [];
    let run = 0;
    for (let i = 2; i < NP; i++) {
      const p = PTS[i], ok = !p.tun;
      if (!ok) { run = 0; continue; }
      const o = side * (p.w + 0.9), a = P2W(p, o, 0.55), b = P2W(p, o, 0.85);
      const base = rp.length / 3; rp.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (run > 0) ri.push(base - 2, base, base - 1, base - 1, base, base + 1);
      run++;
      postSpots.push(P2W(p, o + side * 0.1, 0));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); g.setIndex(ri); g.computeVertexNormals();
    const m = new THREE.Mesh(g, railMat); m.castShadow = true; root.add(m);
  }
  const posts = new THREE.InstancedMesh(postG, stdMat({ color: 0x8a9096, roughness: 0.5, metalness: 0.7 }), postSpots.length);
  const m4 = new THREE.Matrix4();
  postSpots.forEach((v, i) => { m4.makeTranslation(v.x, v.y, v.z); posts.setMatrixAt(i, m4); });
  posts.castShadow = true; root.add(posts);

  // ---- 路燈（每 40 公尺，左右交錯；隧道裡用隧道燈） ----
  for (let i = 5, k = 0; i < NP; i += 10, k++) {
    const p = PTS[i];
    if (p.tun || Math.abs(p.s - TOLL_S) < 14) continue;
    const side = k % 2 ? 1 : -1, o = side * (p.w + 1.9), v = P2W(p, o, 0);
    ctx.lamps.push({ x: v.x, y: p.y, z: v.z, ry: Math.atan2(-side * p.rx, -side * p.rz) });
  }

  // ---- 收費站 ----
  {
    const g = new THREE.Group(); const p = hwAt(TOLL_S);
    g.position.set(p.x, p.y, p.z); g.rotation.y = p.hd; root.add(g);
    // 在這個群組裡：x＝往左（-o），z＝往前（s）
    const add = (geo, mat, o, y, s, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(-o, y, s); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
    const curb = stdMat({ map: stripeTex('#f2c200', '#222222', 10), roughness: 0.6 });
    const white = stdMat({ color: 0xeeeeee, roughness: 0.5 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x29404f, roughness: 0.05, metalness: 0.2, emissive: 0xfff0c8, emissiveIntensity: 0.05, clearcoat: 1 });
    ctx.night(glass, 0.8);
    const roof = stdMat({ color: 0x2e7d32, roughness: 0.5, metalness: 0.3 });
    for (const o of ISLANDS) {
      add(new THREE.BoxGeometry(1.4, 0.3, 12), curb, o, 0.15, 0);
      add(new THREE.BoxGeometry(1.1, 2.7, 2.6), white, o, 1.65, 0);
      add(new THREE.BoxGeometry(1.15, 1.0, 2.0), glass, o, 2.1, 0);
      add(new THREE.CylinderGeometry(0.25, 0.25, 6.6, 10), white, o, 3.6, 3.2);
      for (const e of [-6.2, 6.2]) add(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10), curb, o, 0.55, e);
    }
    add(new THREE.BoxGeometry(46, 0.7, 7), roof, 0, 7.2, 3.2);
    add(new THREE.BoxGeometry(46.4, 0.15, 7.4), white, 0, 6.82, 3.2, false);
    const under = stdMat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 }); ctx.night(under, 2.5);
    for (const o of [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5]) add(new THREE.BoxGeometry(1.2, 0.05, 4), under, o, 6.74, 3.2, false);
    const bt = boardTex('國道收費站　請減速慢行', '#1b5e20', '#ffffff', 1024, 128);
    const bm = stdMat({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.15 }); ctx.night(bm, 1.3);
    const sign = add(new THREE.BoxGeometry(26, 2.4, 0.2), [roof, roof, roof, roof, bm, bm], 0, 8.7, 0.2, false);
    sign.position.z = 3.2 - 3.6;
    const sign2 = add(new THREE.BoxGeometry(26, 2.4, 0.2), [roof, roof, roof, roof, bm, bm], 0, 8.7, 0, false);
    sign2.position.z = 3.2 + 3.6;
    // 每個車道上方的綠色通行燈
    const ok = stdMat({ color: 0x111111, emissive: 0x20ff60, emissiveIntensity: 2 });
    for (const o of [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5]) add(new THREE.BoxGeometry(0.8, 0.8, 0.1), ok, o, 6.2, o > 0 ? 3.2 - 3.4 : 3.2 + 3.4, false);
    // 柵欄
    const armMat = stdMat({ map: stripeTex('#d62828', '#f5f5f5', 8), roughness: 0.5 });
    const armG = new THREE.BoxGeometry(5.6, 0.14, 0.14);
    for (const gt of GATES) {
      const piv = new THREE.Group(); piv.position.set(-gt.pivot, 1.05, gt.s - TOLL_S); g.add(piv);
      const arm = new THREE.Mesh(armG, armMat); arm.position.x = -gt.side * 2.8; arm.castShadow = true; piv.add(arm);
      add(new THREE.BoxGeometry(0.4, 1.2, 0.4), white, gt.pivot - gt.side * 0.1, 0.6, gt.s - TOLL_S);
      gt.mesh = piv;
    }
  }

  // ---- 隧道 ----
  const tunMat = stdMat({ map: concreteTex(), color: 0xd8d2c4, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.3 });
  tunMat.map.repeat.set(2, 1);
  const lampMat = stdMat({ color: 0x222222, emissive: 0xffc070, emissiveIntensity: 3 });
  const PROF = [[7.0, 0.02], [7.0, 0.32], [8.6, 0.32], [8.6, 5.2]];
  for (let k = 1; k < 12; k++) { const a = (k / 12) * Math.PI; PROF.push([8.6 * Math.cos(a), 5.2 + 3.6 * Math.sin(a)]); }
  PROF.push([-8.6, 5.2], [-8.6, 0.32], [-7.0, 0.32], [-7.0, 0.02]);
  const archTop = (o) => 5.2 + 3.6 * Math.sqrt(Math.max(0, 1 - (o / 8.6) ** 2));
  const rockMat = stdMat({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const ringShape = new THREE.Shape();
  ringShape.moveTo(-10.2, -0.5); ringShape.lineTo(-10.2, 5.2);
  for (let k = 1; k <= 24; k++) { const a = Math.PI - (k / 24) * Math.PI; ringShape.lineTo(10.2 * Math.cos(a), 5.2 + 5.4 * Math.sin(a)); }
  ringShape.lineTo(10.2, -0.5); ringShape.lineTo(8.6, -0.5); ringShape.lineTo(8.6, 5.2);
  for (let k = 1; k < 24; k++) { const a = (k / 24) * Math.PI; ringShape.lineTo(8.6 * Math.cos(a), 5.2 + 3.6 * Math.sin(a)); }
  ringShape.lineTo(-8.6, 5.2); ringShape.lineTo(-8.6, -0.5); ringShape.closePath();
  const ringG = new THREE.ExtrudeGeometry(ringShape, { depth: 1.4, bevelEnabled: false });
  const ringMat = stdMat({ map: concreteTex(), color: 0xc9c4ba, roughness: 0.85 });
  for (const T of TUNNELS) {
    // 管子
    const tp = [], tu = [], ti = [];
    for (let i = T.i0; i <= T.i1; i++) {
      const p = PTS[i];
      PROF.forEach(([o, dy], k) => { const v = P2W(p, o, dy); tp.push(v.x, v.y, v.z); tu.push(k / (PROF.length - 1) * 3, p.s / 6); });
      if (i > T.i0) {
        const b = (i - T.i0) * PROF.length, a = b - PROF.length;
        for (let k = 0; k < PROF.length - 1; k++) ti.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2));
    g.setIndex(ti); g.computeVertexNormals();
    const tube = new THREE.Mesh(g, tunMat); tube.castShadow = true; tube.receiveShadow = true; root.add(tube);
    // 隧道燈
    const spots = [];
    for (let i = T.i0 + 1; i < T.i1; i += 2) for (const o of [-5.6, 5.6]) spots.push({ p: PTS[i], o });
    const lg = new THREE.BoxGeometry(0.35, 0.12, 1.6);
    const lamps = new THREE.InstancedMesh(lg, lampMat, spots.length);
    const q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    spots.forEach(({ p, o }, n) => {
      const v = P2W(p, o, archTop(o) - 0.15);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.hd);
      m4.compose(v, q, one); lamps.setMatrixAt(n, m4);
      if (n % 4 === 0) TUNNEL_LAMPS.push(P2W(p, o * 0.7, 6.8));
    });
    root.add(lamps);
    // 洞口：山壁＋水泥拱圈
    for (const [ii, dirSign] of [[T.i0, -1], [T.i1, 1]]) {
      const p = PTS[ii], cut = cutSec[ii].sec, cov = covSec[ii].sec;
      const interp = (sec, o) => {
        for (let j = 0; j < sec.length - 1; j++) { const a = sec[j], b = sec[j + 1]; if (o >= a.o && o <= b.o) return a.h + (b.h - a.h) * ((o - a.o) / Math.max(1e-6, b.o - a.o)); }
        return sec[o < 0 ? 0 : sec.length - 1].h;
      };
      const cols = [];
      for (const c of cut) if (Math.abs(c.o) > 8.7) cols.push({ o: c.o, top: interp(cov, c.o), bot: c.h });
      cols.push({ o: -8.6, top: interp(cov, -8.6), bot: interp(cut, -8.6) });
      for (let k = 0; k <= 20; k++) { const o = -8.6 + (17.2 * k) / 20; cols.push({ o, top: interp(cov, o), bot: p.y + archTop(o) }); }
      cols.push({ o: 8.6, top: interp(cov, 8.6), bot: interp(cut, 8.6) });
      cols.sort((a, b) => a.o - b.o);
      const fp = [], fc = [], fi = [];
      const concrete = new THREE.Color(0xbdb8ae), rock = new THREE.Color(0x6a6258);
      for (const c of cols) {
        for (const h of [c.bot, c.top]) {
          const v = P2W(p, c.o, h - p.y); fp.push(v.x, v.y, v.z);
          const cc = Math.abs(c.o) < 12 && h < p.y + 12 ? concrete : rock; fc.push(cc.r, cc.g, cc.b);
        }
      }
      for (let k = 0; k < cols.length - 1; k++) {
        if (cols[k + 1].o - cols[k].o < 1e-3) continue;
        const a = k * 2, b = a + 2;
        fi.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
      fg.setIndex(fi); fg.computeVertexNormals();
      const face = new THREE.Mesh(fg, rockMat); face.castShadow = true; face.receiveShadow = true; root.add(face);
      const ring = new THREE.Mesh(ringG, ringMat);
      ring.position.set(p.x, p.y, p.z); ring.rotation.y = p.hd;
      ring.translateZ(dirSign > 0 ? 0 : -1.4); ring.castShadow = true; root.add(ring);
      // 隧道名牌
      const nt = boardTex('山風隧道', '#1b5e20', '#ffffff', 512, 128);
      const nm = stdMat({ map: nt, emissiveMap: nt, emissive: 0xffffff, emissiveIntensity: 0.2 }); ctx.night(nm, 1.2);
      const name = new THREE.Mesh(new THREE.BoxGeometry(7, 1.75, 0.2), [ringMat, ringMat, ringMat, ringMat, nm, nm]);
      name.position.set(p.x, p.y + 11.6, p.z); name.rotation.y = p.hd; name.translateZ(dirSign > 0 ? 1.5 : -1.5); root.add(name);
    }
  }

  // ---- 路牌 ----
  const sign = (s, o, text, bg, w = 9) => {
    const p = hwAt(s), r = { x: -Math.cos(p.hd), z: Math.sin(p.hd) };
    const g = new THREE.Group(); g.position.set(p.x + r.x * o, p.y, p.z + r.z * o); g.rotation.y = p.hd; root.add(g);
    const bt = boardTex(text, bg, '#ffffff', 1024, 160);
    const bm = stdMat({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.4 }); ctx.night(bm, 1.1);
    const back = stdMat({ color: 0x8a9096, metalness: 0.6, roughness: 0.4 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.16, 0.15), [back, back, back, back, bm, bm]); b.position.y = 4.6; b.castShadow = true; g.add(b);
    for (const x of [-w * 0.35, w * 0.35]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.6, 8), back); pl.position.set(x, 2.3, 0); g.add(pl); }
  };
  const t0 = TUNNELS[0];
  sign(8, 10.5, '國道山區線　往 林場', '#1b5e20');
  sign(24, 16.5, '前方收費站　減速 30', '#1b5e20');
  sign(118, 10, '陡坡 8%　注意煞車', '#9a6a00');
  if (t0) sign(t0.s0 - 50, 10, `山風隧道　長 ${Math.round(t0.s1 - t0.s0)} 公尺　開大燈`, '#1b5e20', 10);
  if (t0) sign(t0.s1 + 50, -10, '隧道　開大燈', '#1b5e20');
  sign(LEN - PAD_LEN - 20, -10, '往 市區', '#1b5e20');
  sign(LEN - PAD_LEN - 10, 10, '林場　大車迴轉區', '#2e7d32');
  sign(130, -10, '前方收費站　減速 30', '#1b5e20');

  // ---- 林場 ----
  {
    const p = hwAt(LEN - 42);
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = p.hd; root.add(g);
    const add = (geo, mat, o, y, s, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(-o, y, s); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
    // 裝卸區
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2), ctx.bayMat); bay.position.y = 0.06; bay.rotation.y = Math.PI; g.add(bay);
    // 鐵皮倉庫（在空地盡頭）
    const ct2 = corrugatedTex('#6d5a3f', 21); ct2.repeat.set(3, 1.2);
    const wall = stdMat({ map: ct2, roughness: 0.6, metalness: 0.35 }), roofM = stdMat({ color: 0x4a4f55, roughness: 0.8 });
    add(new THREE.BoxGeometry(28, 9, 13), [wall, wall, roofM, roofM, wall, wall], 0, 4.5, 34);
    const door = stdMat({ map: corrugatedTex('#9aa0a6', 9), roughness: 0.5, metalness: 0.5 });
    add(new THREE.BoxGeometry(8, 6, 0.2), door, 0, 3, 27.4);
    const bt = boardTex('🌲 山上林場', '#2e7d32', '#ffffff', 1024, 160);
    const bm = stdMat({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.15 }); ctx.night(bm, 1.3);
    add(new THREE.BoxGeometry(14, 2.2, 0.3), [roofM, roofM, roofM, roofM, bm, bm], 0, 10.5, 27.3);
    // 木頭堆
    const bark = stdMat({ color: 0x5b3f28, roughness: 0.95 });
    const logG = new THREE.CylinderGeometry(0.38, 0.42, 9, 10).rotateX(Math.PI / 2);
    const logs = [];
    const pile = (o, s0, len) => {
      for (let s = s0; s < s0 + len - 8; s += 9.5) for (let row = 0; row < 5; row++) for (let k = 0; k < 5 - row; k++) logs.push([o + (k - (4 - row) / 2) * 0.82, 0.42 + row * 0.7, s + 4.5]);
    };
    pile(25.5, -30, 48); pile(-25.5, -16, 28);
    const li = new THREE.InstancedMesh(logG, bark, logs.length);
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    logs.forEach(([o, y, s], n) => { q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (n * 1.7) % 6.28); m4.compose(new THREE.Vector3(-o, y, s), q, sc); li.setMatrixAt(n, m4); });
    li.castShadow = true; li.receiveShadow = true; g.add(li);
    // 盡頭的山壁擋土牆
    const last = PTS[NP - 1], wallW = 2 * Math.max(last.sinkL, last.sinkR) + 12;
    let topH = last.y + 6; for (let o = -wallW / 2; o <= wallW / 2; o += 8) topH = Math.max(topH, naturalHeight(last.x + last.rx * o, last.z + last.rz * o) + 2);
    const rw = stdMat({ map: concreteTex(), color: 0x7d766b, roughness: 0.95 }); rw.map.repeat.set(10, 3);
    const rwall = new THREE.Mesh(new THREE.BoxGeometry(wallW, topH - last.y + 4, 4), rw);
    rwall.position.set(last.x + last.fx * 3, (topH + last.y - 4) / 2, last.z + last.fz * 3); rwall.rotation.y = last.hd; rwall.receiveShadow = true; root.add(rwall);
    // 空地的大燈
    for (const [o, s] of [[-17, -30], [17, -5], [-17, 10]]) {
      const v = hwAt(LEN - 42 + s, o); const side = o > 0 ? 1 : -1, P = PTS[Math.round((LEN - 42 + s) / DS)];
      ctx.lamps.push({ x: v.x, y: v.y, z: v.z, ry: Math.atan2(-side * P.rx, -side * P.rz) });
    }
  }
  return { tunnelLamps: TUNNEL_LAMPS };
}
