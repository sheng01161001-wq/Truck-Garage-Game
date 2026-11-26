// 導航用的路網：地面格子道路＋高架橋／匝道／環道（v22）
// 高架橋下的路口：地面的路可以轉彎，但高架上的車不能直接轉下去（要走匝道）。
// 高架橋頭：從地面直直開過去會自動上橋，所以「橋頭往橋下那段地面路」只能從橋下往外開（單行）。
import { ROADS } from './world.js';
import { STRUCTS, structHeights } from './elevated.js';
import { CITY_SIZE } from './highway.js';

let NET = null;
const plen = (P) => { let l = 0; for (let i = 1; i < P.length; i++) l += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); return l; };

function build() {
  const nodes = [], adj = [], keys = new Map(), edges = [];
  const node = (k, x, z, y = 0) => { if (keys.has(k)) return keys.get(k); const id = nodes.length; nodes.push({ x, z, y }); adj.push([]); keys.set(k, id); return id; };
  // 單行：oneWay＝只能 a→b
  const addEdge = (a, b, poly, level, oneWay = false) => {
    const e = { a, b, poly, len: plen(poly), level, oneWay };
    edges.push(e);
    adj[a].push({ to: b, w: e.len, poly });
    if (!oneWay) adj[b].push({ to: a, w: e.len, poly: [...poly].reverse() });
    return e;
  };
  const gkey = (x, z) => 'g' + Math.round(x) + ',' + Math.round(z);

  // 1. 結構的端點：落在地面道路上（貼到最近的路線），或接在別的結構上
  const LINES = [];
  for (const r of ROADS) { LINES.push({ axis: 'x', line: r }); LINES.push({ axis: 'z', line: r }); } // axis x＝東西向（z 固定）
  const snapGround = (p) => {
    let best = null;
    for (const L of LINES) {
      const d = L.axis === 'x' ? Math.abs(p.z - L.line) : Math.abs(p.x - L.line);
      if (d < 9.5 && (!best || d < best.d)) best = { ...L, d, s: L.axis === 'x' ? p.x : p.z };
    }
    return best;
  };
  const ends = []; // { st, idx, ground: {axis,line,s} | null, host: {st, idx} | null, dir }
  const split = new Map(STRUCTS.map((st) => [st, new Set([0, st.pts.length - 1])]));
  for (const st of STRUCTS) {
    const P = st.pts, n = P.length;
    for (const [idx, nxt] of [[0, Math.min(3, n - 1)], [n - 1, Math.max(0, n - 4)]]) {
      const p = P[idx], q = P[nxt], dl = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      const end = { st, idx, dir: { x: (q.x - p.x) / dl, z: (q.z - p.z) / dl }, ground: null, host: null };
      if (p.y < 0.5) end.ground = snapGround(p);
      else {
        const hd = (h) => { const q = h.st.pts[Math.round(h.i)]; return Math.hypot(q.x - p.x, q.z - p.z) + Math.abs(h.y - p.y) * 3 + (h.st.kind === 'ramp' ? 50 : 0); }; // 匝道優先接到主線（橋），不要兩條匝道互接
        const k = structHeights(p.x, p.z, [], 2.5).filter((h) => h.st !== st && Math.abs(h.y - p.y) < 1.2).sort((a, b) => hd(a) - hd(b))[0]; // 接到最近的那一點
        if (k) { end.host = { st: k.st, idx: Math.round(k.i) }; split.get(k.st).add(end.host.idx); }
      }
      ends.push(end);
    }
  }
  // 2. 地面道路：每條路線上的點＝路口＋市區邊界＋結構落地點
  for (const L of LINES) {
    const pos = new Map();
    for (const r of ROADS) pos.set(r, { s: r, ban: 0 });
    for (const s of [-CITY_SIZE, CITY_SIZE]) pos.set(s, { s, ban: 0 });
    for (const e of ends) {
      if (!e.ground || e.ground.axis !== L.axis || e.ground.line !== L.line) continue;
      const s = Math.round(e.ground.s);
      const along = L.axis === 'x' ? e.dir.x : e.dir.z; // 結構從這裡往哪邊延伸（沿著這條路的話）
      const cur = pos.get(s) || { s, ban: 0 };
      if (Math.abs(along) > 0.9 && e.ground.d < 3) cur.ban = Math.sign(along); // 橋頭正對著路中間：從這裡直直開過去會上橋（旁邊分出去的匝道不算）
      pos.set(s, cur);
    }
    const list = [...pos.values()].sort((a, b) => a.s - b.s);
    const xy = (s) => (L.axis === 'x' ? { x: s, z: L.line } : { x: L.line, z: s });
    for (let i = 0; i < list.length - 1; i++) {
      const A = list[i], B = list[i + 1], pa = xy(A.s), pb = xy(B.s);
      const a = node(gkey(pa.x, pa.z), pa.x, pa.z), b = node(gkey(pb.x, pb.z), pb.x, pb.z);
      const noAB = A.ban > 0, noBA = B.ban < 0;
      if (noAB && noBA) continue;
      if (noAB) addEdge(b, a, [pb, pa], 'g', true);
      else if (noBA) addEdge(a, b, [pa, pb], 'g', true);
      else addEdge(a, b, [pa, pb], 'g');
    }
  }
  // 3. 結構：在端點和「別的匝道接進來的地方」切開
  const endNode = (e) => {
    const p = e.st.pts[e.idx];
    if (e.ground) { const g = e.ground, q = g.axis === 'x' ? { x: Math.round(g.s), z: g.line } : { x: g.line, z: Math.round(g.s) }; return node(gkey(q.x, q.z), q.x, q.z); }
    if (e.host) { const hp = e.host.st.pts[e.host.idx]; return node('s' + e.host.st.id + ':' + e.host.idx, hp.x, hp.z, hp.y); }
    return node('s' + e.st.id + ':' + e.idx, p.x, p.z, p.y);
  };
  for (const st of STRUCTS) {
    const idxs = [...split.get(st)].sort((a, b) => a - b);
    const nodeAt = (i) => {
      const e = ends.find((k) => k.st === st && k.idx === i);
      if (e) return endNode(e);
      const p = st.pts[i]; return node('s' + st.id + ':' + i, p.x, p.z, p.y);
    };
    for (let k = 0; k < idxs.length - 1; k++) {
      const i0 = idxs[k], i1 = idxs[k + 1];
      const a = nodeAt(i0), b = nodeAt(i1);
      if (a === b) continue;
      const poly = st.pts.slice(i0, i1 + 1).map((p) => ({ x: p.x, z: p.z, y: p.y }));
      addEdge(a, b, poly, st.id);
    }
  }
  return { nodes, adj, edges };
}

// 把一個點掛到最近的路上：高架上的車只掛高架、地面的車只掛地面
function attach(net, p, isStart) {
  const elevated = (p.y ?? 0) > 1.2;
  let best = null;
  for (const e of net.edges) {
    if (elevated !== (e.level !== 'g' && e.poly.some((q) => q.y > 1.2))) {
      // 地面的車可以掛在結構「貼地的那一段」；高架的車不能掛地面
      if (elevated) continue;
    }
    const P = e.poly;
    let acc = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1e-6;
      let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / (L * L); t = Math.max(0, Math.min(1, t));
      const x = a.x + dx * t, z = a.z + dz * t, y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
      let d = Math.hypot(p.x - x, p.z - z);
      if (elevated) { if (Math.abs(y - p.y) > 2) d += 1000; } else if (y > 1.2) d += 1000;
      if (!best || d < best.d) best = { d, e, seg: i, t, x, z, y, along: acc + L * t };
      acc += L;
    }
  }
  return best;
}

export function netRoute(from, to) {
  if (!NET) NET = build();
  const A = attach(NET, from, true), B = attach(NET, to, false);
  const pts0 = [{ x: from.x, z: from.z }];
  if (!A || !B) return [...pts0, { x: to.x, z: to.z }];
  // 同一段路上：直接走
  if (A.e === B.e && !(A.e.oneWay && B.along < A.along)) {
    const P = A.e.poly, lo = Math.min(A.seg, B.seg), hi = Math.max(A.seg, B.seg);
    const mid = P.slice(lo + 1, hi + 1);
    return [...pts0, { x: A.x, z: A.z }, ...(A.along <= B.along ? mid : mid.reverse()), { x: B.x, z: B.z }, { x: to.x, z: to.z }];
  }
  const { nodes, adj } = NET, N = nodes.length, S = N, G = N + 1;
  const extra = new Map(); // S、G 的臨時連線
  const startLinks = [];
  const P = A.e.poly;
  const toB = [{ x: A.x, z: A.z }, ...P.slice(A.seg + 1)], toA = [{ x: A.x, z: A.z }, ...P.slice(0, A.seg + 1).reverse()];
  startLinks.push({ to: A.e.b, w: A.e.len - A.along, poly: toB });
  if (!A.e.oneWay) startLinks.push({ to: A.e.a, w: A.along, poly: toA });
  const Q = B.e.poly;
  const fromA = [...Q.slice(0, B.seg + 1), { x: B.x, z: B.z }], fromB = [...Q.slice(B.seg + 1).reverse(), { x: B.x, z: B.z }];
  extra.set(B.e.a, { to: G, w: B.along, poly: fromA });
  if (!B.e.oneWay) extra.set(B.e.b, { to: G, w: B.e.len - B.along, poly: fromB });
  const dist = new Float64Array(N + 2).fill(Infinity), prev = new Array(N + 2), via = new Array(N + 2), done = new Uint8Array(N + 2);
  dist[S] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < N + 2; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === G) break;
    done[u] = 1;
    const out = u === S ? startLinks : extra.has(u) ? [...adj[u], extra.get(u)] : adj[u];
    for (const l of out) { const nd = ud + l.w; if (nd < dist[l.to]) { dist[l.to] = nd; prev[l.to] = u; via[l.to] = l.poly; } }
  }
  if (dist[G] === Infinity) return [...pts0, { x: to.x, z: to.z }];
  const chain = [];
  for (let v = G; v !== S; v = prev[v]) chain.unshift(via[v]);
  const out = [...pts0];
  for (const poly of chain) for (const q of poly) { const l = out[out.length - 1]; if (!l || Math.hypot(l.x - q.x, l.z - q.z) > 0.5) out.push({ x: q.x, z: q.z }); }
  out.push({ x: to.x, z: to.z });
  return out;
}
export function netForTest() { if (!NET) NET = build(); return NET; }
