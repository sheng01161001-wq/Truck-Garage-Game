// 儀表板（轉速表、速度表、檔位、油量、水溫、損傷）、GPS 小地圖與導航路線
import { ROADS, ROAD_W, DEPOTS, GAS, GARAGE_BLD, DISTRICTS } from './world.js';
import { clamp, roundRectPath } from './util.js';
import { PTS as HW_PTS, hwProject, inCity, LEN as HW_LEN, CITY_SIZE } from './highway.js';
import { netRoute } from './roadnet.js';
import { STRUCTS } from './elevated.js';

// ---------- 導航：地面道路＋高架／匝道（js/roadnet.js）----------
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
  if (!fOut && !tOut) pts = netRoute(from, to);
  else {
    const fs = fOut ? hwProject(from.x, from.z).s : 0, ts = tOut ? hwProject(to.x, to.z).s : 0;
    const gate = HW_PTS[0];
    if (fOut && tOut) pts = [{ x: from.x, z: from.z }, ...hwSlice(fs, ts), { x: to.x, z: to.z }];
    else if (fOut) pts = [{ x: from.x, z: from.z }, ...hwSlice(fs, 0), ...netRoute({ x: gate.x, z: gate.z, y: 0 }, to)];
    else pts = [...netRoute(from, { x: gate.x, z: gate.z, y: 0 }), ...hwSlice(0, ts), { x: to.x, z: to.z }];
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
  // 高架橋、匝道、環道（淺色、比地面路亮一點）
  ctx.save(); ctx.strokeStyle = st.night ? '#b8c8d8' : '#dce4eb'; ctx.lineJoin = 'round';
  for (const S of STRUCTS) { ctx.lineWidth = S.hw * 1.6; ctx.beginPath(); S.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z))); ctx.stroke(); }
  ctx.restore();
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
  if (st.incidents) for (const p of st.incidents) { const [x, y] = toScreen(p.x, p.z); ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5.5, y + 4); ctx.lineTo(x - 5.5, y + 4); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x - 0.7, y - 2.5, 1.4, 3.5); } // 事故：紅色三角
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

// ---------- v33：世界地圖（北方朝上，可以縮放拖曳） ----------
let MAP_BOUNDS = null;
export function mapBounds() {
  if (MAP_BOUNDS) return MAP_BOUNDS;
  let x0 = -CITY_SIZE, x1 = CITY_SIZE, z0 = -CITY_SIZE, z1 = CITY_SIZE;
  for (const p of HW_PTS) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return (MAP_BOUNDS = { x0: x0 - 60, x1: x1 + 60, z0: z0 - 60, z1: z1 + 60 });
}
// view = { cx, cz, scale（像素／公尺） }；跟小地圖車頭朝北時一樣：z 越大越上面、x 越大越左邊
export function drawWorldMap(cv, st, view) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, k = view.scale, dpr = st.dpr || 1;
  const toS = (x, z) => [W / 2 - (x - view.cx) * k, H / 2 - (z - view.cz) * k];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#16211a'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(-k, 0, 0, -k, W / 2 + view.cx * k, H / 2 + view.cz * k);
  // 海（西邊）、市區底色
  ctx.fillStyle = '#0f2a3d'; ctx.fillRect(-4000, -4000, 4000 - 468, 8000);
  ctx.fillStyle = '#26302a'; ctx.fillRect(-CITY_SIZE, -CITY_SIZE, CITY_SIZE * 2, CITY_SIZE * 2);
  for (const zone of DISTRICTS) {
    ctx.fillStyle = zone.color + '26'; ctx.strokeStyle = zone.color + 'aa'; ctx.lineWidth = 2 / k;
    ctx.beginPath(); ctx.ellipse(zone.x, zone.z, zone.rx, zone.rz, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  const roadW = Math.max(ROAD_W, 3 / k);
  ctx.strokeStyle = '#7d868e'; ctx.lineWidth = roadW; ctx.lineCap = 'butt';
  for (const r of ROADS) { ctx.beginPath(); ctx.moveTo(r, -CITY_SIZE); ctx.lineTo(r, CITY_SIZE); ctx.moveTo(-CITY_SIZE, r); ctx.lineTo(CITY_SIZE, r); ctx.stroke(); }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#8fb7e0';
  for (const S of STRUCTS) { ctx.lineWidth = Math.max(S.hw * 1.6, 3 / k); ctx.beginPath(); S.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z))); ctx.stroke(); }
  ctx.strokeStyle = '#e9eef3'; ctx.lineWidth = Math.max(14, 4 / k);
  ctx.beginPath(); HW_PTS.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z))); ctx.stroke();
  ctx.strokeStyle = '#4b535b'; ctx.lineWidth = Math.max(10, 3 / k);
  ctx.beginPath(); let on = false;
  for (const p of HW_PTS) { if (p.tun) { if (!on) { ctx.moveTo(p.x, p.z); on = true; } else ctx.lineTo(p.x, p.z); } else on = false; }
  ctx.stroke();
  if (st.route) { ctx.strokeStyle = '#ff9f1c'; ctx.lineWidth = Math.max(8, 5 / k); ctx.beginPath(); st.route.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z))); ctx.stroke(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 地名、物流點
  const fs = Math.round(13 * dpr);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const zone of DISTRICTS) { const [x, y] = toS(zone.x, zone.z + zone.rz * 0.7); ctx.font = `bold ${fs}px sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(zone.name || zone.short, x, y); }
  const pin = (x, z, col, label, big) => {
    const [sx, sy] = toS(x, z), r = (big ? 9 : 6) * dpr;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    if (label) { ctx.font = `bold ${fs}px sans-serif`; ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(label, sx, sy - r - fs * 0.8); ctx.fillStyle = '#fff'; ctx.fillText(label, sx, sy - r - fs * 0.8); }
  };
  for (const dp of DEPOTS) pin(dp.x, dp.z, dp === st.target ? '#ff9f1c' : dp.color, `${dp.emoji || ''} ${dp.name}`, dp === st.target);
  pin(GAS.x, GAS.z, '#c62828', '⛽ 加油站');
  pin(GARAGE_BLD.x, GARAGE_BLD.z, '#1d6fb8', '🔧 改裝廠');
  for (const e of st.extra || []) pin(e.x, e.z, e.color, e.label);
  // 自己
  const [px, py] = toS(st.x, st.z), h = st.heading, sz = 11 * dpr;
  ctx.save(); ctx.translate(px, py); ctx.rotate(-h);
  ctx.fillStyle = '#ff9f1c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * dpr;
  ctx.beginPath(); ctx.moveTo(0, -sz * 1.2); ctx.lineTo(sz, sz); ctx.lineTo(0, sz * 0.4); ctx.lineTo(-sz, sz); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  // 比例尺
  const meters = [50, 100, 200, 500, 1000, 2000].find((m) => m * k > 80 * dpr) || 2000;
  const bx = 20 * dpr, by = H - 60 * dpr;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + meters * k, by); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `${fs}px sans-serif`; ctx.textAlign = 'left'; ctx.fillText(meters >= 1000 ? meters / 1000 + ' 公里' : meters + ' 公尺', bx, by - 12 * dpr);
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
  arrow(ctx, mx - 16, 24, -1, d.indL && d.blink);
  arrow(ctx, mx + 16, 24, 1, d.indR && d.blink);
  // v33：警示燈一排（亮＝開著）
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 13px sans-serif';
  const lamp = (txt, on, col, y) => { ctx.globalAlpha = on ? 1 : 0.22; ctx.fillStyle = col; ctx.fillText(txt, mx, y); };
  lamp(d.highBeam ? '◉ 遠燈' : '◉ 大燈', d.lights, '#4aa3ff', 46);
  lamp('雨刷', d.wipers, '#9fe3ff', 64);
  lamp('煞車', d.brake, '#ff7a5a', 82);
  lamp('(P) 手煞車', d.handbrake, '#ff3b30', 100);
  lamp('氣壓過低', d.air < 0.4, '#ffb020', 118);
  lamp('引擎', d.engineWarn, '#ffb020', 136);
  ctx.globalAlpha = 1; ctx.fillStyle = d.manual ? '#ffd166' : '#8fd3ff'; ctx.fillText(d.manual ? '手排 M' : '自排 A', mx, 154);
  bar(ctx, 14, H - 18, 120, '油量', d.fuel, '#2ecc71', d.fuel < 0.15);
  bar(ctx, 140, H - 18, 118, '水溫', d.temp, '#4aa3ff', d.temp > 0.9);
  bar(ctx, 264, H - 18, 118, '氣壓', d.air, '#b38cff', d.air < 0.4);
  bar(ctx, 388, H - 18, 120, '車損', d.damage, '#ffb020', d.damage > 0.7);
  ctx.fillStyle = '#7f8c99'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  const odo = d.odo >= 1000 ? (d.odo / 1000).toFixed(1) + ' km' : Math.round(d.odo) + ' m';
  ctx.fillText(`總重 ${d.tons} 噸｜里程 ${odo}｜氣壓 ${(d.air * 10).toFixed(1)} bar${d.retarder ? '｜排氣煞車' : ''}`, mx, 174);
  ctx.fillStyle = d.kmh > d.speedLimit + 1 ? '#ff5a5a' : '#a9c4d8'; ctx.font = 'bold 12px sans-serif';
  const bt = d.brakeTemp > 0.3 ? `　煞車 ${Math.round(80 + d.brakeTemp * 420)}°C` : '';
  ctx.fillText(`速限 ${d.speedLimit} km/h${bt}${d.rollover ? '　側翻救援：按 Backspace' : ''}`, mx, 193);
}
