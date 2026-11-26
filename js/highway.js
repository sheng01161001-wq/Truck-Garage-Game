// 城外路線：國道（收費站）→ 山路（陡坡 8%、山風隧道）→ 山上林場
// 道路用「中心線取樣點」描述：每 4 公尺一點，記錄位置、方向、路面高度、路寬、是不是隧道。
import * as THREE from 'three';
import { clamp, makeNoise, canvasTex, FONT } from './util.js';
import { asphaltTex, noiseBumpTex, concreteTex, corrugatedTex, boardTex, stripeTex } from './textures.js';

const N = makeNoise(42);
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const CITY = 460; // M：擴大市區可駕駛範圍（正方形半邊）
export const CITY_SIZE = CITY;

// ---------- 地形（遠山＋一道山脊，路從山脊下面的隧道穿過） ----------
function spur(x, z) { return 45 * Math.exp(-(((z + 265) / 38) ** 2)) * sm((x - (CITY + 40)) / 80); }
export function naturalHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const t = clamp((d - (CITY + 60)) / 520, 0, 1);
  if (t <= 0) return 0;
  const ridge = N.fbm(x / 420 + 10, z / 420 - 3, 5), hills = N.fbm(x / 110, z / 110, 3);
  return t * t * (90 + ridge * 520) + t * hills * 45 + spur(x, z);
}

// ---------- 路線：直線＋圓弧 ----------
const DS = 4;
const SEGS = [['s', 110], ['a', 110, 90], ['s', 160], ['a', 150, -25], ['s', 100], ['a', 72, 145], ['s', 90]]; // 新增髮夾彎與出彎加速路段
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

// 休息站（收費站後面，路變寬：右邊加油站、左邊維修站）
export const REST = { s0: 100, s1: 190 };
export const REST_FUEL = { s0: 122, s1: 142, o0: 10, o1: 23, name: 'fuel' };
export const REST_REPAIR = { s0: 124, s1: 146, o0: -19.5, o1: -9, name: 'repair' };
function halfWOf(s) {
  let w = 7;
  if (s < 100) w = 7 + 14 * (s < TOLL_S ? sm((s - 10) / 30) : sm((100 - s) / 30));
  if (s > REST.s0 && s < REST.s1) w = Math.max(w, 7 + 19 * Math.min(sm((s - REST.s0) / 20), sm((REST.s1 - s) / 20)));
  if (s > LEN - PAD_LEN) w = Math.max(w, 7 + 23 * sm((s - (LEN - PAD_LEN)) / 25));
  return w;
}
// 路面高度：照著山的高度走，但坡度最多 8%；收費站和林場是平的
{
  const G = 0.08 * DS, H = PTS.map((p) => naturalHeight(p.x, p.z) - 1.5);
  for (let i = 0; i < NP; i++) if (i * DS <= REST.s1 + 4) H[i] = 0; // 收費站＋休息站是平的
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
// N：依道路區段回傳實際速限（km/h），市區、國道與山路採不同限制。
export function speedLimitAt(x, z) {
  if (isInterchangeRoad(x, z)) return 40;
  if (inCity(x, z)) return 50;
  const q = hwProject(x, z);
  if (q.s < 0 || q.s > LEN) return 50;
  if (q.s < 100) return 50; // 收費站前後
  if (q.s < 600) return 60; // 休息站、隧道、山區道路
  if (q.s < LEN - PAD_LEN) return 40; // 髮夾彎
  return 30; // 林場
}
// 市區東西向高架橋：兩端緩坡、中段橋面高 8 公尺。
export function bridgeHeightAt(x, z) {
  if (Math.abs(z - 80) > 7.4 || x < -150 || x > 150) return null;
  if (x < -60) return (x + 150) / 90 * 8;
  if (x > 60) return (150 - x) / 90 * 8;
  return 8;
}
// Q：東區四象限環狀交流道。南北向主線跨越 z=240 平面幹道，
// 四條獨立三次 Bézier 匝道分別由東／西側幹道接入主線不同位置。
function flyoverHeightAt(x, z) {
  if (Math.abs(x - 240) > 7.4 || z < 100 || z > 380) return null;
  if (z < 180) return 7 * sm((z - 100) / 80);
  if (z > 300) return 7 * sm((380 - z) / 80);
  return 7;
}
const interchangeRamp = (t, r) => {
  const u = 1 - t, { a, c1, c2, b } = r;
  const x = u*u*u*a.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*b.x;
  const z = u*u*u*a.z + 3*u*u*t*c1.z + 3*u*t*t*c2.z + t*t*t*b.z;
  const endY = flyoverHeightAt(b.x, b.z) ?? 7;
  return { x, z, y: endY * sm(t) };
};
const INTERCHANGE_RAMPS = [
  { name: '東北環道', a: { x: 330, z: 234 }, c1: { x: 330, z: 180 }, c2: { x: 285, z: 145 }, b: { x: 240, z: 145 } },
  { name: '東南環道', a: { x: 330, z: 246 }, c1: { x: 330, z: 300 }, c2: { x: 285, z: 335 }, b: { x: 240, z: 335 } },
  { name: '西北環道', a: { x: 150, z: 234 }, c1: { x: 150, z: 180 }, c2: { x: 195, z: 175 }, b: { x: 240, z: 175 } },
  { name: '西南環道', a: { x: 150, z: 246 }, c1: { x: 150, z: 300 }, c2: { x: 195, z: 305 }, b: { x: 240, z: 305 } },
];
export function interchangeHeightAt(x, z) {
  const main = flyoverHeightAt(x, z);
  if (main !== null) return main;
  let best = null, dist = 8.5;
  for (const r of INTERCHANGE_RAMPS) for (let i = 0; i <= 64; i++) {
    const q = interchangeRamp(i / 64, r), d = Math.hypot(x - q.x, z - q.z);
    if (d < dist) { dist = d; best = q.y; }
  }
  return best;
}
export function isInterchangeRoad(x, z) {
  if (flyoverHeightAt(x, z) !== null) return true;
  for (const r of INTERCHANGE_RAMPS) for (let i = 0; i <= 64; i++) {
    const q = interchangeRamp(i / 64, r);
    if (Math.hypot(x - q.x, z - q.z) < 6.5) return true;
  }
  return false;
}
// 地面高度（市區平面道路 0；橋面、匝道依各自高度抬升）
// refY＝車子現在的高度：橋下的路口要留在地面，不會突然被抬到橋上
export function groundAt(x, z, refY = null) {
  if (inCity(x, z)) {
    const e = interchangeHeightAt(x, z) ?? bridgeHeightAt(x, z);
    if (e === null) return 0;
    if (refY === null) return e;
    return Math.abs(e - refY) <= Math.abs(refY) + 0.05 ? e : 0;
  }
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
// 休息站的加油區／維修區：回傳 'fuel'、'repair' 或 null
export function restZoneAt(x, z) {
  if (inCity(x, z)) return null;
  const q = hwProject(x, z);
  for (const r of [REST_FUEL, REST_REPAIR]) if (q.s > r.s0 && q.s < r.s1 && q.o > r.o0 && q.o < r.o1) return r.name;
  return null;
}
export function nearRest(x, z) {
  if (inCity(x, z)) return false;
  const q = hwProject(x, z);
  return q.s > REST.s0 - 10 && q.s < REST.s1;
}
// ETC 車道＝靠中間的那一道（左右各一）
export const isEtcLane = (o) => Math.abs(o) < 7;
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
  const g = { side, s: TOLL_S + side * 4, o0: side > 0 ? a : -b, o1: side > 0 ? b : -a, pivot: side * a, open: 0, want: 0, mesh: null, etc: k === 0 };
  GATES.push(g);
  RECTS.push({ s0: g.s - 0.2, s1: g.s + 0.2, o0: g.o0, o1: g.o1, gate: g });
}
for (const o of ISLANDS) RECTS.push({ s0: TOLL_S - 6, s1: TOLL_S + 6, o0: o - 0.7, o1: o + 0.7 });
// 休息站：加油島、商店、維修廠
for (const o of [13.9, 19.6]) RECTS.push({ s0: 127, s1: 137, o0: o - 0.6, o1: o + 0.6 });
RECTS.push({ s0: 150, s1: 168, o0: 20.5, o1: 27 });
RECTS.push({ s0: 128, s1: 142, o0: -27, o1: -20.5 });
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
      if (g.etc && before > -13 && before < 45 && speed < 16.8) want = true; // ETC：60 公里以下自動感應
    }
    for (const c of carPos) {
      if (inCity(c.x, c.z)) continue;
      const q = hwProject(c.x, c.z);
      if (lane(q.o) && Math.abs(q.s - g.s) < (g.etc ? 26 : 16)) want = true;
    }
    g.open = clamp(g.open + (want ? (g.etc ? 2.6 : 1.6) : -0.8) * dt, 0, 1);
    if (g.mesh) g.mesh.rotation.z = -g.side * 1.4 * sm(g.open);
  }
}

// 林場（送貨點）
const padP = hwAt(LEN - 42);
export const LUMBER = { name: '林場', emoji: '🌲', x: padP.x, z: padP.z, y: padP.y, bx: hwAt(LEN - 8).x, bz: hwAt(LEN - 8).z, color: '#2e7d32', kind: 'lumber' };
export const TUNNEL_LAMPS = [];
export const PIERS = []; // 橋墩（地面的車會撞到）：{ x, z, sx, sz }

// ---------- 蓋出來 ----------
// ctx: { stdMat, wet(mat,dry,wet,col), night(mat,on), colorAt(x,z,h,outColor), bayMat, lamps(陣列) , quality }
export function buildHighway(root, ctx) {
  const { stdMat } = ctx;
  const P2W = (p, o, dy) => new THREE.Vector3(p.x + p.rx * o, p.y + dy, p.z + p.rz * o);
  const inSq = (x, z) => Math.abs(x) < 372 && Math.abs(z) < 372;

  // ---- P：東區大型立體交流道（高架主線＋上下匝道） ----
  {
    const asphalt = stdMat({ map: asphaltTex('highway'), bumpMap: noiseBumpTex(4, 128, 0.55), roughness: 0.84 });
    const concrete = stdMat({ color: 0x737b82, roughness: 0.9 });
    const rail = stdMat({ color: 0xb9c2ca, metalness: 0.72, roughness: 0.36 });
    const line = stdMat({ color: 0xf3eee2, roughness: 0.8 });
    ctx.wet(asphalt, 0.84, 0.14, new THREE.Color(0.56, 0.58, 0.62));
    // 高架主線：兩端漸升／下降，中段維持 7 公尺淨高。
    const deckRoad = (samples, width, material, rails = true) => {
      const vertices = [], indices = [];
      for (const q of samples) {
        const prev = samples[Math.max(0, samples.indexOf(q) - 1)], next = samples[Math.min(samples.length - 1, samples.indexOf(q) + 1)];
        const dx = next.x - prev.x, dz = next.z - prev.z, n = Math.hypot(dx, dz) || 1;
        const nx = -dz / n, nz = dx / n;
        vertices.push(q.x + nx*width/2, q.y, q.z + nz*width/2, q.x - nx*width/2, q.y, q.z - nz*width/2);
      }
      for (let i=1;i<samples.length;i++){const b=(i-1)*2;indices.push(b,b+1,b+2,b+1,b+3,b+2);}
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3)); g.setIndex(indices); g.computeVertexNormals();
      const m = new THREE.Mesh(g, material); m.material.side = THREE.DoubleSide; m.receiveShadow = true; m.castShadow = true; root.add(m);
      if (rails) for (const side of [-1,1]) for (let i=0;i<samples.length-1;i+=3) {
        const q=samples[i], n=samples[Math.min(i+1,samples.length-1)], dx=n.x-q.x,dz=n.z-q.z,l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
        const x=q.x+nx*side*(width/2-0.25), z=q.z+nz*side*(width/2-0.25);
        const post=new THREE.Mesh(new THREE.BoxGeometry(0.18,1.05,0.18),rail); post.position.set(x,q.y+0.52,z); root.add(post);
      }
      return m;
    };
    const main=[];
    for(let z=100;z<=380;z+=4) main.push({x:240,z,y:flyoverHeightAt(240,z)});
    deckRoad(main,14,asphalt);
    // 主線連續防撞護欄（兩側鋼樑）。
    for(const side of [-1,1]) for(let i=0;i<main.length-1;i+=2){const a=main[i],b=main[Math.min(i+2,main.length-1)];const beam=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.22,Math.hypot(b.z-a.z,b.x-a.x)+0.08),rail);beam.position.set(240+side*6.78,(a.y+b.y)/2+1.0,(a.z+b.z)/2);beam.rotation.x=-Math.atan2(b.y-a.y,b.z-a.z);root.add(beam);}
    // 主線橋墩及橫梁
    for(const z of [150,210,270,330]) { const y=flyoverHeightAt(240,z); if(y>1.2){const h=y-0.5;PIERS.push({x:240,z,sx:1.4,sz:1.4});const pier=new THREE.Mesh(new THREE.BoxGeometry(1.4,h,1.4),concrete);pier.position.set(240,h/2,z);pier.castShadow=true;pier.receiveShadow=true;root.add(pier);const cap=new THREE.Mesh(new THREE.BoxGeometry(9,0.55,2.8),concrete);cap.position.set(240,y-0.35,z);root.add(cap);} }
    // 四條獨立環狀匝道：每條均有實際路面高度、護欄、中央標線及橋墩支撐。
    for (const ramp of INTERCHANGE_RAMPS) {
      const samples=[]; for(let i=0;i<=64;i++) samples.push(interchangeRamp(i/64,ramp));
      deckRoad(samples,10,asphalt);
      for(let i=0;i<samples.length;i+=5){
        const q=samples[i], prev=samples[Math.max(0,i-1)], next=samples[Math.min(samples.length-1,i+1)], dx=next.x-prev.x,dz=next.z-prev.z,n=Math.hypot(dx,dz)||1;
        for(const side of [-1,1]){const post=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.95,0.16),rail);post.position.set(q.x-dz/n*side*4.7,q.y+0.48,q.z+dx/n*side*4.7);post.castShadow=true;root.add(post);}
      }
      for(let i=8;i<samples.length-5;i+=12){
        const q=samples[i]; if(q.y<1.25) continue;
        PIERS.push({x:q.x,z:q.z,sx:1.15,sz:1.15});
        const pier=new THREE.Mesh(new THREE.BoxGeometry(1.15,Math.max(0.7,q.y-0.55),1.15),concrete);
        pier.position.set(q.x,Math.max(0.35,(q.y-0.55)/2),q.z); pier.castShadow=true; pier.receiveShadow=true; root.add(pier);
        const cap=new THREE.Mesh(new THREE.BoxGeometry(3.2,0.38,2.1),concrete); cap.position.set(q.x,q.y-0.22,q.z); root.add(cap);
      }
      for(let i=3;i<samples.length-3;i+=5){
        const q=samples[i],prev=samples[i-1],next=samples[i+1],dx=next.x-prev.x,dz=next.z-prev.z,n=Math.hypot(dx,dz)||1;
        const mark=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.035,3.1),line);
        mark.position.set(q.x+dx/n*0.0,q.y+0.035,q.z); mark.rotation.y=Math.atan2(dx,dz); root.add(mark);
      }
    }
    // 四向入口指示牌及交流道編號牌。
    const signMat=stdMat({color:0x176b43,roughness:0.7});
    for(const [x,z,label] of [[348,218,'北向匝道'],[348,262,'南向匝道'],[132,218,'北向匝道'],[132,262,'南向匝道']]){
      const board=new THREE.Mesh(new THREE.BoxGeometry(7.2,1.6,0.28),signMat); board.position.set(x,5.2,z); root.add(board);
      const poleGeo=new THREE.BoxGeometry(0.16,4.4,0.16); for(const px of [x-2.8,x+2.8]){const pole=new THREE.Mesh(poleGeo,rail);pole.position.set(px,2.2,z);root.add(pole);}
    }
    // 車道虛線沿主線配置，夜間可辨識高架路徑。
    for(let z=112;z<376;z+=12){const y=flyoverHeightAt(240,z)+0.035;const mark=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.035,5.5),line);mark.position.set(240,y,z);root.add(mark);}
    // 交流道方向牌
    const board=new THREE.Mesh(new THREE.BoxGeometry(10,2.2,0.3),signMat);board.position.set(258,8.7,170);root.add(board);
    const poleGeo=new THREE.BoxGeometry(0.18,5.2,0.18);for(const x of [254,262]){const pole=new THREE.Mesh(poleGeo,rail);pole.position.set(x,5.6,170);root.add(pole);}
  }

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

  // ---- 市區高架橋：跨越南北向道路，含引道、橋墩、護欄與車道標線 ----
  {
    const bridgeZ = 80, halfW = 7, deckMat = stdMat({ map: asphaltTex('highway'), bumpMap: bump, bumpScale: 0.9, roughness: 0.82 });
    ctx.wet(deckMat, 0.82, 0.16, new THREE.Color(0.56, 0.58, 0.62));
    const concrete = stdMat({ color: 0x777d83, roughness: 0.88 });
    const rail = stdMat({ color: 0xb9c1c8, metalness: 0.78, roughness: 0.34 });
    const dashMat = stdMat({ color: 0xf4f1e8, roughness: 0.8 });
    const bridgeY = (x) => x < -60 ? (x + 150) / 90 * 8 : x > 60 ? (150 - x) / 90 * 8 : 8;
    for (let x = -148; x < 150; x += 4) {
      const x2 = Math.min(150, x + 4), y1 = bridgeY(x), y2 = bridgeY(x2), mid = (y1 + y2) / 2;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(x2 - x + 0.04, 0.72, halfW * 2), deckMat);
      slab.position.set((x + x2) / 2, mid - 0.36, bridgeZ); slab.rotation.z = Math.atan2(y2 - y1, x2 - x); slab.castShadow = true; slab.receiveShadow = true; root.add(slab);
    }
    for (const x of [-42, 0, 42]) {
      const h = bridgeY(x) - 0.72;
      PIERS.push({ x, z: bridgeZ, sx: 1.4, sz: 1.4 });
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, Math.max(0.6, h), 1.4), concrete);
      pier.position.set(x, Math.max(0.3, h / 2), bridgeZ); pier.castShadow = true; pier.receiveShadow = true; root.add(pier);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(9, 0.65, 2.8), concrete); cap.position.set(x, h - 0.2, bridgeZ); root.add(cap);
    }
    for (const side of [-1, 1]) {
      for (let x = -148; x <= 148; x += 4) {
        const y = bridgeY(x);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, 0.18), rail); post.position.set(x, y + 0.52, bridgeZ + side * (halfW - 0.25)); root.add(post);
      }
      for (let x = -148; x < 148; x += 4) {
        const x2 = x + 4, y1 = bridgeY(x), y2 = bridgeY(x2);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(4.08, 0.22, 0.22), rail);
        beam.position.set(x + 2, (y1 + y2) / 2 + 1.05, bridgeZ + side * (halfW - 0.25));
        beam.rotation.z = Math.atan2(y2 - y1, 4); root.add(beam);
      }
    }
    for (let x = -145; x < 145; x += 12) {
      const y = bridgeY(x + 2);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.035, 0.18), dashMat); mark.position.set(x + 2, y + 0.025, bridgeZ); root.add(mark);
    }
    // 橋頭反光導標
    for (const x of [-150, 150]) for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.15, 0.2), rail); post.position.set(x, 0.58, bridgeZ + side * 8.2); root.add(post);
    }
  }

  // ---- K：完整國道標線（中心虛線、兩側邊線） ----
  // 使用路線取樣點定位，標線會跟著彎道與坡度，不會像平面貼圖一樣切角。
  const markingMat = stdMat({ color: 0xf3f1e8, roughness: 0.82, metalness: 0.02 });
  const dashGeo = new THREE.PlaneGeometry(0.2, 3.6);
  dashGeo.rotateX(-Math.PI / 2);
  const edgeGeo = new THREE.PlaneGeometry(0.18, 4.2);
  edgeGeo.rotateX(-Math.PI / 2);
  for (let s = 8; s < LEN - PAD_LEN + 8; s += 12) {
    const p = hwAt(s);
    if (inTunnelS(s)) continue;
    const dash = new THREE.Mesh(dashGeo, markingMat);
    dash.position.set(p.x, p.y + 0.055, p.z);
    dash.rotation.y = p.hd;
    dash.receiveShadow = true;
    root.add(dash);
    for (const side of [-1, 1]) {
      const q = hwAt(s + 1.8, side * (p.w - 0.55));
      const edge = new THREE.Mesh(edgeGeo, markingMat);
      edge.position.set(q.x, q.y + 0.06, q.z);
      edge.rotation.y = q.hd;
      root.add(edge);
    }
  }

  // ---- K：山路反光導標，夜間車燈照射時提供道路邊界參考 ----
  const postGeo = new THREE.BoxGeometry(0.16, 1.05, 0.16);
  const postMat = stdMat({ color: 0xe7e8e5, roughness: 0.42, metalness: 0.25 });
  const reflectorGeo = new THREE.BoxGeometry(0.19, 0.25, 0.035);
  const reflectorMat = new THREE.MeshStandardMaterial({ color: 0xd62828, emissive: 0x5a0808, emissiveIntensity: 0.55, roughness: 0.35 });
  const markerSpots = [];
  for (let s = 18; s < LEN - PAD_LEN; s += 24) {
    if (inTunnelS(s)) continue;
    const p = hwAt(s);
    for (const side of [-1, 1]) {
      const q = hwAt(s, side * (p.w + 1.25));
      markerSpots.push({ x: q.x, y: q.y, z: q.z, hd: q.hd });
    }
  }
  const markerPosts = new THREE.InstancedMesh(postGeo, postMat, markerSpots.length);
  const reflectors = new THREE.InstancedMesh(reflectorGeo, reflectorMat, markerSpots.length);
  const postMatrix = new THREE.Matrix4();
  const postQuat = new THREE.Quaternion();
  const postScale = new THREE.Vector3(1, 1, 1);
  markerSpots.forEach((v, i) => {
    postQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.hd);
    postMatrix.compose(new THREE.Vector3(v.x, v.y + 0.53, v.z), postQuat, postScale);
    markerPosts.setMatrixAt(i, postMatrix);
    postMatrix.compose(new THREE.Vector3(v.x, v.y + 0.82, v.z), postQuat, postScale);
    reflectors.setMatrixAt(i, postMatrix);
  });
  markerPosts.castShadow = true; root.add(markerPosts); root.add(reflectors);

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


  // ---- v21：ETC 車道（地上紫色標字＋車道上方的牌子） ----
  const roadText = (sMid, o, len, wid, draw, flip) => {
    const t = canvasTex(256, Math.round(256 * len / wid), draw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wid, len).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const q = hwAt(sMid, o); m.position.set(q.x, q.y + 0.05, q.z); m.rotation.y = q.hd + (flip ? Math.PI : 0); m.receiveShadow = true; root.add(m);
  };
  const etcPaint = (c, w, h) => {
    c.fillStyle = 'rgba(120,40,170,.55)'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.font = `bold 120px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let y = h * 0.22; y < h; y += h * 0.45) c.fillText('ETC', w / 2, y);
  };
  roadText(TOLL_S - 26, 3.5, 34, 5.2, etcPaint, true);
  roadText(TOLL_S + 26, -3.5, 34, 5.2, etcPaint, false);
  {
    const p = hwAt(TOLL_S), g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = p.hd; root.add(g);
    const etcT = boardTex('ETC　60', '#6a1b9a', '#ffffff', 512, 128), cashT = boardTex('現金　減速 30', '#1b5e20', '#ffffff', 512, 128);
    const etcM = stdMat({ map: etcT, emissiveMap: etcT, emissive: 0xffffff, emissiveIntensity: 0.25 }), cashM = stdMat({ map: cashT, emissiveMap: cashT, emissive: 0xffffff, emissiveIntensity: 0.25 });
    ctx.night(etcM, 1.3); ctx.night(cashM, 1.3);
    const edge = stdMat({ color: 0x333333, roughness: 0.6 });
    for (const o of [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5]) {
      const bm = Math.abs(o) < 7 ? etcM : cashM;
      const b = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.15, 0.12), [edge, edge, edge, edge, bm, bm]);
      b.position.set(-o, 5.9, o > 0 ? 3.2 - 3.55 : 3.2 + 3.55); g.add(b);
    }
  }

  // ---- v21：國道休息站（右邊加油站＋商店，左邊維修站） ----
  {
    const place = (mesh, s, o, y, rotExtra = 0) => { const q = hwAt(s, o); mesh.position.set(q.x, q.y + y, q.z); mesh.rotation.y = q.hd + rotExtra; mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh; };
    // 地面標示
    roadText(132, 16.5, 20, 13, (c, w, h) => {
      c.fillStyle = 'rgba(200,205,210,.55)'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
      c.fillStyle = '#ffffff'; c.font = `bold 46px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('加油區', w / 2, h * 0.12);
    }, true);
    roadText(135, -14.25, 22, 10.5, (c, w, h) => {
      c.fillStyle = 'rgba(255,196,0,.35)'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffc400'; c.lineWidth = 14; c.setLineDash([22, 14]); c.strokeRect(8, 8, w - 16, h - 16); c.setLineDash([]);
      c.fillStyle = '#ffe082'; c.font = `bold 44px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('維修區', w / 2, h * 0.42); c.font = `bold 30px ${FONT}`; c.fillText('停車就會修理', w / 2, h * 0.55);
    }, false);
    // 加油站：加油島、加油機、雨遮
    const white = stdMat({ color: 0xeeeeee, roughness: 0.5 }), red = stdMat({ color: 0xc62828, roughness: 0.4, metalness: 0.2 });
    const curb = stdMat({ map: stripeTex('#f2c200', '#222222', 10), roughness: 0.6 });
    for (const o of [13.9, 19.6]) {
      place(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 10), curb), 132, o, 0.15);
      for (const s2 of [129.5, 134.5]) {
        place(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.7), red), s2, o, 1.25);
        place(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 0.72), white), s2, o, 2.1);
      }
      for (const s2 of [127.5, 136.5]) place(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6.4, 10), white), s2, o, 3.2);
    }
    const canopyT = boardTex('國道加油站', '#c62828', '#ffffff', 1024, 96);
    const canM = stdMat({ map: canopyT, emissiveMap: canopyT, emissive: 0xffffff, emissiveIntensity: 0.15 }); ctx.night(canM, 1.2);
    const canopy = place(new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.8, 16), white), 132, 16.75, 6.6);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.82, 0.1), canM); fascia.position.set(0, 0, -8.05); fascia.rotation.y = Math.PI; canopy.add(fascia);
    const fascia2 = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.82, 0.1), canM); fascia2.position.z = 8.05; canopy.add(fascia2);
    const under = stdMat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 }); ctx.night(under, 2.5);
    for (const s2 of [127, 132, 137]) place(new THREE.Mesh(new THREE.BoxGeometry(6, 0.05, 1.2), under), s2, 16.75, 6.18);
    // 商店（便利商店・餐廳）
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x29404f, roughness: 0.05, metalness: 0.2, emissive: 0xfff0c8, emissiveIntensity: 0.05, clearcoat: 1 }); ctx.night(glass, 0.9);
    const wallM = stdMat({ color: 0xd8d2c4, roughness: 0.8 }), roofM = stdMat({ color: 0x2e7d32, roughness: 0.6, metalness: 0.3 });
    place(new THREE.Mesh(new THREE.BoxGeometry(6.5, 5, 18), wallM), 159, 23.75, 2.5);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 15), glass), 159, 20.45, 1.9);
    place(new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 19), roofM), 159, 23.3, 5.2);
    const shopT = boardTex('國道休息站　便利商店・餐廳', '#1b5e20', '#ffffff', 1024, 128);
    const shopM = stdMat({ map: shopT, emissiveMap: shopT, emissive: 0xffffff, emissiveIntensity: 0.15 }); ctx.night(shopM, 1.3);
    // 招牌朝向馬路（-x 面＝朝路中間）
    place(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 12), [roofM, shopM, roofM, roofM, roofM, roofM]), 159, 20.3, 6.3);
    // 維修站（鐵皮廠房＋大門）
    const ct = corrugatedTex('#5c6b78', 13); ct.repeat.set(3, 1.2);
    const shed = stdMat({ map: ct, roughness: 0.6, metalness: 0.35 }), dark = stdMat({ color: 0x1d2329, roughness: 0.8 });
    place(new THREE.Mesh(new THREE.BoxGeometry(6.5, 7, 14), shed), 135, -23.75, 3.5);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.15, 5.4, 9), dark), 135, -20.45, 2.7);
    const fixT = boardTex('🔧 維修站　修車・保養', '#e65100', '#ffffff', 1024, 128);
    const fixM = stdMat({ map: fixT, emissiveMap: fixT, emissive: 0xffffff, emissiveIntensity: 0.15 }); ctx.night(fixM, 1.3);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 10), [fixM, dark, dark, dark, dark, dark]), 135, -20.3, 6.2);
    for (const [s2, o] of [[124, 27.6], [146, 27.6], [124, -27.6], [148, -27.6], [176, -24]]) { // 路燈立在路邊，不要擋在路上
      const q = hwAt(s2, o), P = PTS[Math.round(s2 / DS)], side = o > 0 ? 1 : -1;
      ctx.lamps.push({ x: q.x, y: q.y, z: q.z, ry: Math.atan2(-side * P.rx, -side * P.rz) });
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
    if (Math.abs(o) < halfWOf(s) + 2.5) o = Math.sign(o) * (halfWOf(s) + 3); // 路變寬的地方：牌子往外移，不要擋在路上
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
  sign(176, 10, '陡坡 8%　注意煞車', '#9a6a00');
  if (t0) sign(t0.s0 - 50, 10, `山風隧道　長 ${Math.round(t0.s1 - t0.s0)} 公尺　開大燈`, '#1b5e20', 10);
  if (t0) sign(t0.s1 + 50, -10, '隧道　開大燈', '#1b5e20');
  sign(LEN - PAD_LEN - 20, -10, '往 市區', '#1b5e20');
  sign(LEN - PAD_LEN - 10, 10, '林場　大車迴轉區', '#2e7d32');
  sign(186, -10, '前方收費站　ETC 走內側', '#1b5e20');
  // 區段速限與山路警示牌，提醒玩家依道路環境控制車速。
  sign(430, 11, '山區道路　速限 60', '#1b5e20', 9);
  sign(548, 11, '前方髮夾彎　速限 40', '#9a6a00', 10);
  sign(720, -11, '下坡髮夾彎　速限 40', '#9a6a00', 10);
  sign(425, -11, '下坡路段　請勿空檔滑行', '#9a6a00', 10);
  sign(470, -11, '山區道路　速限 60', '#1b5e20', 9);


  // ---- v21：門架式方向指示牌（跨在車道上方） ----
  const gSteel = stdMat({ color: 0x9aa2a8, metalness: 0.7, roughness: 0.4 });
  const gantry = (s0, side, l1, l2, bg = '#1b5e20') => {
    const p = hwAt(s0), g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = p.hd; root.add(g);
    const postO = side * (halfWOf(s0) + 1.4), innerO = side * 0.4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 8.6, 10), gSteel); post.position.set(-postO, 4.3, 0); post.castShadow = true; g.add(post);
    const armL = Math.abs(postO - innerO);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armL, 0.35, 0.35), gSteel); arm.position.set(-(postO + innerO) / 2, 8.2, 0); g.add(arm);
    const t = canvasTex(1024, 360, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffffff'; c.lineWidth = 10; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const fit = (txt, size, y) => { c.font = `bold ${size}px ${FONT}`; const tw = c.measureText(txt).width; if (tw > w * 0.9) c.font = `bold ${size * w * 0.9 / tw}px ${FONT}`; c.fillText(txt, w / 2, y); };
      fit(l1, 110, h * 0.36); fit(l2, 64, h * 0.74);
    });
    const bm = stdMat({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.4 }); ctx.night(bm, 1.2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2.95, 0.18), side > 0 ? [gSteel, gSteel, gSteel, gSteel, gSteel, bm] : [gSteel, gSteel, gSteel, gSteel, bm, gSteel]); // 只有迎面來的車看得到字
    b.position.set(-side * 3.6, 6.45, -side * 0.25); b.castShadow = true; g.add(b);
  };
  gantry(14, 1, '國道山區線　東行', 'ETC 走內側車道　現金走外側');
  gantry(90, 1, '休息站　100 公尺', '加油　維修　商店');
  gantry(184, 1, '林場 ↑　山風隧道', '隧道裡是陡坡 8%　大車注意');
  gantry(LEN - PAD_LEN - 60, -1, '往 市區 ↑', '休息站　收費站');
  gantry(440, -1, '過隧道就到休息站', '維修　加油　商店');
  gantry(98, -1, '收費站　ETC 走內側', '現金車道請減速到 30');

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
