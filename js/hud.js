// 儀表板（轉速表、速度表、檔位、油量、水溫、損傷）、GPS 小地圖與導航路線
import { ROADS, ROAD_W, DEPOTS, GAS, GARAGE_BLD, DISTRICTS } from './world.js';
import { clamp, roundRectPath } from './util.js';
import { PTS as HW_PTS, hwProject, inCity, LEN as HW_LEN, CITY_SIZE } from './highway.js';

// ---------- 導航：沿著道路找最短路 ----------
function nearestRoadPoint(x, z) {
  let best = null;
  for (const r of ROADS) {
    const a = { x: r, z: clamp(z, -CITY_SIZE, CITY_SIZE), axis: 'z', line: r, s: clamp(z, -CITY_SIZE, CITY_SIZE) };
    const b = { x: clamp(x, -CITY_SIZE, CITY_SIZE), z: r, axis: 'x', line: r, s: clamp(x, -CITY_SIZE, CITY_SIZE) };
    for (const p of [a, b]) { const d = Math.hypot(p.x - x, p.z - z); if (!best || d < best.d) best = { ...p, d }; }
  }
  return best;
}
const key = (x, z) => x + ',' + z;
function gridRoute(from, to) {
  const A = nearestRoadPoint(from.x, from.z), B = nearestRoadPoint(to.x, to.z);
  const nodes = new Map(), edges = new Map();
  const addNode = (id, x, z) => { if (!nodes.has(id)) { nodes.set(id, { x, z }); edges.set(id, []); } };
  const link = (a, b) => { const p = nodes.get(a), q = nodes.get(b), d = Math.hypot(p.x - q.x, p.z - q.z); edges.get(a).push([b, d]); edges.get(b).push([a, d]); };
  for (const x of ROADS) for (const z of ROADS) addNode(key(x, z), x, z);
  for (const line of ROADS) for (let i = 0; i < ROADS.length - 1; i++) {
    link(key(line, ROADS[i]), key(line, ROADS[i + 1]));
    link(key(ROADS[i], line), key(ROADS[i + 1], line));
  }
  const attach = (id, p) => {
    addNode(id, p.x, p.z);
    const lo = [...ROADS].reverse().find((r) => r <= p.s), hi = ROADS.find((r) => r >= p.s);
    const nodeAt = (s) => (p.axis === 'z' ? key(p.line, s) : key(s, p.line));
    if (lo !== undefined) link(id, nodeAt(lo));
    if (hi !== undefined && hi !== lo) link(id, nodeAt(hi));
    return { lo, hi };
  };
  const sa = attach('S', A), sb = attach('G', B);
  if (A.axis === B.axis && A.line === B.line && sa.lo === sb.lo && sa.hi === sb.hi) link('S', 'G');
  // Dijkstra
  const dist = new Map([['S', 0]]), prev = new Map(), done = new Set();
  while (true) {
    let u = null, ud = Infinity;
    for (const [id, d] of dist) if (!done.has(id) && d < ud) { u = id; ud = d; }
    if (u === null || u === 'G') break;
    done.add(u);
    for (const [v, w] of edges.get(u)) { const nd = ud + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); } }
  }
  const path = [];
  let cur = 'G';
  while (cur) { path.unshift(nodes.get(cur)); cur = prev.get(cur); if (cur === undefined) break; }
  const pts = [{ x: from.x, z: from.z }, ...path, { x: to.x, z: to.z }];
  return pts;
}
// 國道上從 s0 走到 s1 的點（每 12 公尺一點）
function hwSlice(s0, s1) {
  const out = [], a = clamp(s0, 0, HW_LEN), b = clamp(s1, 0, HW_LEN), step = a < b ? 12 : -12;
  for (let s = a; (b - s) * Math.sign(step) > 0; s += step) { const p = HW_PTS[Math.round(s / 4)]; out.push({ x: p.x, z: p.z }); }
  const e = HW_PTS[Math.round(b / 4)]; out.push({ x: e.x, z: e.z });
  return out;
}
export function computeRoute(from, to) {
  const fOut = !inCity(from.x, from.z), tOut = !inCity(to.x, to.z);
  let pts;
  if (!fOut && !tOut) pts = gridRoute(from, to);
  else {
    const fs = fOut ? hwProject(from.x, from.z).s : 0, ts = tOut ? hwProject(to.x, to.z).s : 0;
    const gate = HW_PTS[0];
    if (fOut && tOut) pts = [{ x: from.x, z: from.z }, ...hwSlice(fs, ts), { x: to.x, z: to.z }];
    else if (fOut) pts = [{ x: from.x, z: from.z }, ...hwSlice(fs, 0), ...gridRoute({ x: gate.x, z: gate.z }, to)];
    else pts = [...gridRoute(from, { x: gate.x, z: gate.z }), ...hwSlice(0, ts), { x: to.x, z: to.z }];
  }
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, len };
}

// ---------- 小地圖 ----------
export function drawMinimap(cv, st) {
  const ctx = cv.getContext('2d'), W = cv.width, cx = W / 2, cy = W / 2;
  const s = W / 920, th = st.heading;
  const a = -s * Math.cos(th), c = s * Math.sin(th), b = -s * Math.sin(th), d = -s * Math.cos(th);
  const e = cx - (a * st.x + c * st.z), f = cy - (b * st.x + d * st.z);
  const toScreen = (x, z) => [a * x + c * z + e, b * x + d * z + f];
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, W);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = st.night ? '#101820' : '#2a3a2c'; ctx.fillRect(0, 0, W, W);
  ctx.setTransform(a, b, c, d, e, f);
  // 半透明區域輪廓與名稱，讓玩家在 GPS 上辨識不同物流地帶。
  for (const zone of DISTRICTS) {
    ctx.save(); ctx.fillStyle = zone.color + '22'; ctx.strokeStyle = zone.color + 'bb'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(zone.x, zone.z, zone.rx, zone.rz, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = st.night ? '#f2f5f7' : '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,.72)'; ctx.lineWidth = 3;
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText(zone.short, zone.x, zone.z); ctx.fillText(zone.short, zone.x, zone.z); ctx.restore();
  }
  ctx.strokeStyle = st.night ? '#4a5866' : '#8e979f'; ctx.lineWidth = ROAD_W; ctx.lineCap = 'butt';
  for (const r of ROADS) { ctx.beginPath(); ctx.moveTo(r, -CITY_SIZE); ctx.lineTo(r, CITY_SIZE); ctx.moveTo(-CITY_SIZE, r); ctx.lineTo(CITY_SIZE, r); ctx.stroke(); }
  // Q：四象限環狀交流道主線與四條匝道，同步呈現在 GPS。
  ctx.save(); ctx.strokeStyle = st.night ? '#b8c8d8' : '#dce4eb'; ctx.lineWidth = ROAD_W * 0.72;
  ctx.beginPath(); ctx.moveTo(240,100); ctx.lineTo(240,380); ctx.stroke();
  ctx.setLineDash([7,5]); ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(330,234); ctx.bezierCurveTo(330,180,285,145,240,145);
  ctx.moveTo(330,246); ctx.bezierCurveTo(330,300,285,335,240,335);
  ctx.moveTo(150,234); ctx.bezierCurveTo(150,180,195,175,240,175);
  ctx.moveTo(150,246); ctx.bezierCurveTo(150,300,195,305,240,305);
  ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  ctx.lineJoin = 'round'; ctx.beginPath(); HW_PTS.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z))); ctx.stroke();
  for (const p of HW_PTS) if (p.w > 7.5) { ctx.lineWidth = p.w * 2; ctx.beginPath(); ctx.moveTo(p.x - p.fx * 2.2, p.z - p.fz * 2.2); ctx.lineTo(p.x + p.fx * 2.2, p.z + p.fz * 2.2); ctx.stroke(); }
  ctx.strokeStyle = st.night ? '#2a3038' : '#5d646b'; ctx.lineWidth = ROAD_W * 0.9;
  for (const p of HW_PTS) if (p.tun) { ctx.beginPath(); ctx.moveTo(p.x - p.fx * 2.2, p.z - p.fz * 2.2); ctx.lineTo(p.x + p.fx * 2.2, p.z + p.fz * 2.2); ctx.stroke(); }
  if (st.route) {
    ctx.strokeStyle = '#ff9f1c'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.beginPath(); st.route.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z))); ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (st.cars) { ctx.fillStyle = '#d0d6dc'; for (const p of st.cars) { const [x, y] = toScreen(p.x, p.z); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); } }
  if (st.selectedFleet) { const [x,y]=toScreen(st.selectedFleet.x,st.selectedFleet.z);ctx.fillStyle='#ff9f1c';ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke(); } 
  const dot = (x, z, col, r, label) => {
    const [sx, sy] = toScreen(x, z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    if (label) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, sx, sy - r - 3); }
  };
  for (const dp of DEPOTS) dp === st.target ? null : dot(dp.x, dp.z, dp.color, 4);
  dot(GAS.x, GAS.z, '#c62828', 4, '油');
  dot(GARAGE_BLD.x, GARAGE_BLD.z, '#1d3557', 4, '修');
  if (st.target) dot(st.target.x, st.target.z, Math.sin(st.time * 6) > 0 ? '#ff9f1c' : '#ffd166', 7, st.target.name);
  // 自己的卡車（永遠朝上）
  ctx.fillStyle = '#ff9f1c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 7, cy + 7); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 7, cy + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); ctx.stroke();
}

// ---------- 儀表 ----------
function dial(ctx, x, y, r, value, max, step, label, unit, opts) {
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = (v) => a0 + (a1 - a0) * clamp(v / max, 0, 1);
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  g.addColorStop(0, '#1b2129'); g.addColorStop(1, '#0b0e12');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,180,255,.35)'; ctx.lineWidth = 2; ctx.stroke();
  for (const band of opts.bands || []) { ctx.strokeStyle = band.c; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, r - 9, ang(band.from), ang(band.to)); ctx.stroke(); }
  ctx.fillStyle = '#cfd8e3'; ctx.strokeStyle = '#cfd8e3'; ctx.font = `bold ${Math.round(r * 0.15)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let v = 0; v <= max + 0.001; v += step / 2) {
    const A = ang(v), major = Math.abs((v / step) - Math.round(v / step)) < 0.01;
    ctx.lineWidth = major ? 2.5 : 1.2;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(A) * (r - 4), y + Math.sin(A) * (r - 4)); ctx.lineTo(x + Math.cos(A) * (r - (major ? 15 : 10)), y + Math.sin(A) * (r - (major ? 15 : 10))); ctx.stroke();
    if (major) ctx.fillText(String(opts.labelDiv ? v / opts.labelDiv : v), x + Math.cos(A) * (r - 27), y + Math.sin(A) * (r - 27));
  }
  ctx.fillStyle = '#7f8c99'; ctx.font = `${Math.round(r * 0.12)}px sans-serif`; ctx.fillText(label, x, y - r * 0.32);
  const A = ang(value);
  ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - Math.cos(A) * 8, y - Math.sin(A) * 8); ctx.lineTo(x + Math.cos(A) * (r - 12), y + Math.sin(A) * (r - 12)); ctx.stroke();
  ctx.fillStyle = '#2a323c'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.round(r * 0.3)}px sans-serif`; ctx.fillText(opts.big, x, y + r * 0.42);
  ctx.fillStyle = '#7f8c99'; ctx.font = `${Math.round(r * 0.11)}px sans-serif`; ctx.fillText(unit, x, y + r * 0.66);
}
function bar(ctx, x, y, w, label, v, col, warn) {
  ctx.fillStyle = '#7f8c99'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y);
  const bx = x + 34, bw = w - 34;
  ctx.fillStyle = '#1d242c'; roundRectPath(ctx, bx, y - 5, bw, 10, 5); ctx.fill();
  ctx.fillStyle = warn ? '#ff4d4d' : col; roundRectPath(ctx, bx, y - 5, Math.max(4, bw * clamp(v, 0, 1)), 10, 5); ctx.fill();
}
function arrow(ctx, x, y, dir, on) {
  ctx.fillStyle = on ? '#2bff7a' : '#24302a';
  ctx.beginPath(); ctx.moveTo(x + dir * 12, y); ctx.lineTo(x - dir * 2, y - 10); ctx.lineTo(x - dir * 2, y - 4); ctx.lineTo(x - dir * 12, y - 4); ctx.lineTo(x - dir * 12, y + 4); ctx.lineTo(x - dir * 2, y + 4); ctx.lineTo(x - dir * 2, y + 10); ctx.closePath(); ctx.fill();
}
export function drawCluster(cv, d) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(18,22,28,.92)'); g.addColorStop(1, 'rgba(6,8,10,.95)');
  ctx.fillStyle = g; roundRectPath(ctx, 2, 2, W - 4, H - 4, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; ctx.stroke();
  const r = 86;
  dial(ctx, 112, 104, r, d.rpm, 2500, 500, '轉速 ×100', `檔位 ${d.gear}`, { labelDiv: 100, bands: [{ from: 1000, to: 1500, c: '#2ecc71' }, { from: 2100, to: 2500, c: '#e74c3c' }], big: d.gear });
  dial(ctx, W - 112, 104, r, d.kmh, 120, 20, '公里/小時', d.cruise ? '定速' : '速度', { big: String(Math.round(d.kmh)) });
  const mx = W / 2;
  arrow(ctx, mx - 16, 30, -1, d.indL && d.blink);
  arrow(ctx, mx + 16, 30, 1, d.indR && d.blink);
  ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = d.lights ? 1 : 0.25; ctx.fillStyle = '#4aa3ff'; ctx.fillText('◉', mx, 62);
  ctx.globalAlpha = d.wipers ? 1 : 0.25; ctx.fillStyle = '#9fe3ff'; ctx.font = '13px sans-serif'; ctx.fillText('雨刷', mx, 88);
  ctx.globalAlpha = d.brake ? 1 : 0.25; ctx.fillStyle = '#ff5a5a'; ctx.fillText('(P)', mx, 112);
  ctx.globalAlpha = d.engineWarn ? 1 : 0.2; ctx.fillStyle = '#ffb020'; ctx.fillText('引擎', mx, 136);
  ctx.globalAlpha = 1;
  bar(ctx, 30, H - 18, 150, '油量', d.fuel, '#2ecc71', d.fuel < 0.15);
  bar(ctx, W / 2 - 70, H - 18, 140, '水溫', d.temp, '#4aa3ff', d.temp > 0.9);
  bar(ctx, W - 180, H - 18, 150, '車損', d.damage, '#ffb020', d.damage > 0.7);
  ctx.fillStyle = '#7f8c99'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`載重 ${d.tons} 噸`, mx, 168);
  ctx.fillStyle = d.kmh > d.speedLimit + 1 ? '#ff5a5a' : '#a9c4d8'; ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`速限 ${d.speedLimit} km/h${d.brakeTemp > 0.5 ? '　煞車溫度偏高' : ''}${d.rollover ? '　側翻救援：按 R' : ''}`, mx, 190);
}
