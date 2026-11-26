// 高架結構（高架橋、匝道、環狀交流道）：路面高度、碰撞、導航、小地圖都共用這裡的資料。
// 每一座結構＝一條中心線（每幾公尺一點，記錄 x、z、路面高度 y）＋半寬 hw。
import * as THREE from 'three';
import { boardTex } from './textures.js';

const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export const STRUCTS = [];

// def: { id, name, kind: 'bridge'|'ramp', hw, pts: [{x,z,y}] }
export function registerStruct(def) {
  const bb = { minx: Infinity, maxx: -Infinity, minz: Infinity, maxz: -Infinity };
  let len = 0;
  def.pts.forEach((p, i) => {
    bb.minx = Math.min(bb.minx, p.x); bb.maxx = Math.max(bb.maxx, p.x); bb.minz = Math.min(bb.minz, p.z); bb.maxz = Math.max(bb.maxz, p.z);
    if (i) len += Math.hypot(p.x - def.pts[i - 1].x, p.z - def.pts[i - 1].z);
  });
  const m = def.hw + 1;
  def.bb = { minx: bb.minx - m, maxx: bb.maxx + m, minz: bb.minz - m, maxz: bb.maxz + m };
  def.len = len;
  STRUCTS.push(def);
  return def;
}

// 這一點上方／下方所有的高架路面高度（同一座結構繞回來的兩層也會分開列出）
const TMP = [];
export function structHeights(x, z, out = TMP, pad = 0) {
  out.length = 0;
  for (const st of STRUCTS) {
    const b = st.bb;
    if (x < b.minx - pad || x > b.maxx + pad || z < b.minz - pad || z > b.maxz + pad) continue;
    const P = st.pts, hw2 = (st.hw + pad) ** 2;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], c = P[i + 1], dx = c.x - a.x, dz = c.z - a.z, L2 = dx * dx + dz * dz || 1;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + dx * t, pz = a.z + dz * t;
      if ((x - px) ** 2 + (z - pz) ** 2 < hw2) out.push({ y: a.y + (c.y - a.y) * t, st, i: i + t });
    }
  }
  return out;
}
export const onStruct = (x, z) => structHeights(x, z, TMP).length > 0;
export function nearStruct(x, z, pad = 0) { return structHeights(x, z, TMP, pad).length > 0; }
export function onRamp(x, z, y) { return structHeights(x, z, TMP).some((k) => k.st.kind === 'ramp' && Math.abs(k.y - y) < 1.2); }

// 依「車子現在的高度」挑路面：接得上的高架優先（開上匝道），接不上就留在地面（從橋下過）
export function pickLevel(x, z, refY = null, tol = 0.6) {
  const c = structHeights(x, z, TMP);
  if (!c.length) return 0;
  if (refY === null) return Math.max(...c.map((k) => k.y));
  let best = null, bd = Infinity;
  for (const k of c) { const d = Math.abs(k.y - refY); if (d < tol && d < bd) { bd = d; best = k.y; } }
  // 高架接得很順（差 0.6 公尺內）就走高架；不然跟地面比，誰比較接近選誰（橋下開車時前輪不會被當成在上坡）
  const dg = Math.abs(refY);
  if (best !== null && (bd < 0.6 || bd <= dg)) return best;
  if (dg < tol) return 0;
  if (best !== null) return best;
  let b2 = 0, d2 = Math.abs(refY);
  for (const k of c) { const d = Math.abs(k.y - refY); if (d < d2) { d2 = d; b2 = k.y; } }
  return b2;
}

// ---------- v22：東門交流道（國道入口）----------
// 南北向的 x=400 改成高架橋，跨過往國道的 z=-80；四個象限各一條環狀匝道（苜蓿葉型），
// 讓高架上的車可以下來開上國道，地面的車也可以上高架。
export const EAST_GATE = { x: 400, z: -80, H: 7 };
const BZ0 = -228, BZ1 = 68, RISE = 80;
{
  const pts = [];
  for (let z = BZ0; z <= BZ1 + 0.01; z += 3) {
    const y = z < BZ0 + RISE ? EAST_GATE.H * sm((z - BZ0) / RISE) : z > BZ1 - RISE ? EAST_GATE.H * sm((BZ1 - z) / RISE) : EAST_GATE.H;
    pts.push({ x: 400, z, y });
  }
  registerStruct({ id: 'gateBridge', name: '東門高架', kind: 'bridge', hw: 7.4, pts, piersOnCenter: true });
}
const LOOP_R = 19, LOOP_C = 32, MERGE = 22;
function loopRamp(sx, sz, name) {
  const H = EAST_GATE.H, cx = 400 + sx * LOOP_C, cz = -80 + sz * LOOP_C;
  const a1 = -sz * Math.PI / 2, a2 = sx > 0 ? Math.PI : 0;
  let dShort = a2 - a1; while (dShort > Math.PI) dShort -= 2 * Math.PI; while (dShort <= -Math.PI) dShort += 2 * Math.PI;
  const sweep = dShort - Math.sign(dShort) * 2 * Math.PI, sg = Math.sign(sweep);
  const d1x = sg * -Math.sin(a1), d2z = sg * Math.cos(a2);
  const pts = [];
  // 地面這頭：沿著 z=-80 慢慢分出去
  for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push({ x: cx - d1x * MERGE * (1 - t), z: -80 + sz * (8 + 5 * sm(t)), y: 0 }); }
  // 270 度的環道，一邊繞一邊爬到高架的高度
  const n = 44;
  for (let k = 1; k <= n; k++) {
    const t = k / n, a = a1 + sweep * t;
    pts.push({ x: cx + LOOP_R * Math.cos(a), z: cz + LOOP_R * Math.sin(a), y: H * (0.5 * t + 0.5 * sm(t)) });
  }
  // 高架這頭：併進 x=400 的高架橋
  const T2z = cz;
  for (let k = 1; k <= 10; k++) { const t = k / 10; pts.push({ x: 400 + sx * (13 - 8 * sm(t)), z: T2z + d2z * 30 * t, y: H }); } // 併到橋面中間，跟橋面重疊夠多
  return registerStruct({ id: 'loop' + (sx > 0 ? 'E' : 'W') + (sz > 0 ? 'S' : 'N'), name, kind: 'ramp', hw: 7.5, pts }); // 寬一點：聯結車轉彎拖車會往內切
}
export const GATE_LOOPS = [
  loopRamp(1, 1, '東門環道（東北）'), loopRamp(1, -1, '東門環道（東南）'),
  loopRamp(-1, 1, '東門環道（西北）'), loopRamp(-1, -1, '東門環道（西南）'),
];

// ---------- 蓋出來（只蓋 v22 新增的；GPT 做的橋在 highway.js 自己蓋） ----------
// ctx: { stdMat, wet(mat,dry,wet,col), night(mat,on), onRoad(x,z), piers(陣列) }
export function buildElevated(root, ctx) {
  const { stdMat } = ctx;
  const deckMat = stdMat({ color: 0x404348, roughness: 0.82, side: THREE.DoubleSide });
  ctx.wet(deckMat, 0.82, 0.18, new THREE.Color(0.6, 0.62, 0.66));
  const concrete = stdMat({ color: 0xb4b0a6, roughness: 0.9, side: THREE.DoubleSide });
  const pierMat = stdMat({ color: 0x8d8a83, roughness: 0.9 });
  const lineMat = stdMat({ color: 0xf2eee2, roughness: 0.8 });
  const yellow = stdMat({ color: 0xf2c200, roughness: 0.7 });
  const mine = STRUCTS.filter((s) => s.id === 'gateBridge' || s.id.startsWith('loop'));
  // 某一點是不是跟別的路面接在一起（同高度）：那裡不放護欄，車才開得過去
  const joined = (st, x, z, y) => {
    if (y < 0.7 && ctx.onRoad(x, z)) return true;
    return structHeights(x, z, [], 0.3).some((k) => k.st !== st && Math.abs(k.y - y) < 0.8);
  };
  for (const st of mine) {
    const P = st.pts, n = P.length, hw = st.hw;
    const nrm = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: -dz / l, z: dx / l }; });
    // 路面＋兩側的厚度
    const top = [], ti = [], side = [], si = [];
    P.forEach((p, i) => {
      const N = nrm[i];
      top.push(p.x + N.x * hw, p.y + 0.04, p.z + N.z * hw, p.x - N.x * hw, p.y + 0.04, p.z - N.z * hw);
      if (i) { const b = (i - 1) * 2; ti.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    });
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); tg.setIndex(ti); tg.computeVertexNormals();
    const deck = new THREE.Mesh(tg, deckMat); deck.receiveShadow = true; root.add(deck);
    for (const s of [1, -1]) {
      let base = side.length / 3;
      P.forEach((p, i) => {
        const N = nrm[i], x = p.x + N.x * hw * s, z = p.z + N.z * hw * s;
        side.push(x, p.y + 0.04, z, x, p.y - 0.9, z);
        if (i) { const b = base + (i - 1) * 2; si.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      });
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(side, 3)); sg.setIndex(si); sg.computeVertexNormals();
    const skirt = new THREE.Mesh(sg, concrete); skirt.castShadow = true; root.add(skirt);
    // 紐澤西護欄（跟別的路接在一起的地方留開口）
    for (const s of [1, -1]) {
      const bp = [], bi = []; let run = -1;
      P.forEach((p, i) => {
        const N = nrm[i], o = (hw - 0.3) * s, x = p.x + N.x * o, z = p.z + N.z * o;
        const ok = p.y > 0.4 && !joined(st, p.x + N.x * (hw + 1) * s, p.z + N.z * (hw + 1) * s, p.y);
        if (!ok) { run = -1; return; }
        const k = bp.length / 3; bp.push(x, p.y, z, x, p.y + 0.95, z);
        if (run >= 0) bi.push(run, run + 1, k, run + 1, k + 1, k);
        run = k;
      });
      if (bi.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); g.setIndex(bi); g.computeVertexNormals(); const m = new THREE.Mesh(g, concrete); m.castShadow = true; root.add(m); }
    }
    // 中心虛線（環道用黃線）
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const a = P[i - 1], b = P[i], l = Math.hypot(b.x - a.x, b.z - a.z); acc += l;
      if (acc < 9) continue; acc = 0;
      const mk = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 3.2), st.kind === 'ramp' ? yellow : lineMat);
      mk.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.07, (a.z + b.z) / 2); mk.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); root.add(mk);
    }
    // 橋墩
    let last = -99;
    P.forEach((p, i) => {
      if (p.y < 2.2 || i - last < 4) return;
      if (st.piersOnCenter) { if (Math.abs(p.z + 80) < 12 || Math.abs(p.z - 80) < 12 || Math.abs(p.z + 240) < 12) return; }
      else if (ctx.onRoad(p.x, p.z) || structHeights(p.x, p.z, [], 1.5).some((k) => k.st !== st && k.y < p.y - 2)) return;
      // 同一座環道繞回來的下面那一層也不能擋
      if (structHeights(p.x, p.z, [], 1.5).some((k) => k.st === st && k.y < p.y - 2)) return;
      last = i;
      const w = st.piersOnCenter ? 1.4 : 1.3, h = p.y - 0.9;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), pierMat); pier.position.set(p.x, h / 2, p.z); pier.castShadow = true; pier.receiveShadow = true; root.add(pier);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(st.piersOnCenter ? 10 : 6, 0.6, 1.8), pierMat);
      cap.position.set(p.x, p.y - 1.2, p.z); cap.rotation.y = Math.atan2(nrm[i].x, nrm[i].z) + Math.PI / 2; root.add(cap);
      ctx.piers.push({ x: p.x, z: p.z, sx: w, sz: w, top: p.y });
    });
  }
  // ---- 出口預告牌（出口選擇） ----
  // 單柱懸臂牌：柱子立在路邊，牌子伸到車道上方（底部 4.8 公尺，大車過得去）
  const signAt = (x, y, z, ry, l1, l2, armDir, bg = '#1b5e20') => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
    const t = boardTex(l1 + '　' + l2, bg, '#ffffff', 1024, 150);
    const bm = stdMat({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.4 }); ctx.night(bm, 1.2);
    const steel = stdMat({ color: 0x8a9096, metalness: 0.6, roughness: 0.4 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(8, 1.3, 0.15), [steel, steel, steel, steel, bm, steel]); b.position.set(armDir * 4.2, 5.45, 0); g.add(b);
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 6.3, 8), steel); pl.position.set(0, 3.15, 0); g.add(pl);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.18, 0.18), steel); arm.position.set(armDir * 4.2, 6.2, 0); g.add(arm);
  };
  // 高架上：往北（右邊是 x<400）、往南（右邊是 x>400）
  signAt(392.2, 7, -150, Math.PI, '出口 ↘ 國道入口', '往林場　環道下高架', -1);
  signAt(407.8, 7, -10, 0, '出口 ↘ 國道入口', '往林場　環道下高架', -1);
  // 地面 z=-80：往東（右邊是 z>-80）直走上國道；往西（右邊是 z<-80）
  signAt(330, 0, -71.5, -Math.PI / 2, '直走 → 國道入口', '環道 上高架 往北倉・南郊', -1);
  signAt(458, 0, -88.5, Math.PI / 2, '前方 環狀交流道', '上高架 往北倉・南郊', -1);
}
