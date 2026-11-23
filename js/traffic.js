// 路上的車流：靠右行駛、路口轉彎、遇紅燈停、前面有車（或卡車）會減速
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROADS, lightState, hasLight } from './world.js';
import { rng } from './util.js';
import { hwAt, LEN as HW_LEN, TOLL_S } from './highway.js';

const LANE = 3.5;
const COLORS = ['#f2f2f2', '#c9ccd1', '#1c1c1f', '#2b3a55', '#8a1f1f', '#5b6770', '#d9d1c0', '#0f4c5c', '#e8e8e8', '#3d3d3d'];

function lanePos(axis, line, dir, s) {
  return axis === 'z' ? { x: line - LANE * dir, z: s } : { x: s, z: line + LANE * dir };
}
function headingOf(axis, dir) { return axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2); }

let SH = null;
function shared() {
  if (SH) return SH;
  SH = {
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0f1820, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    hub: new THREE.MeshStandardMaterial({ color: 0xbfc3c7, metalness: 0.9, roughness: 0.3 }),
    black: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dd, emissiveIntensity: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.2 }),
    wheel: new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18).rotateZ(Math.PI / 2),
    hubG: new THREE.CylinderGeometry(0.2, 0.2, 0.26, 12).rotateZ(Math.PI / 2),
    paints: COLORS.map((c) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 })),
    geo: {},
  };
  const g = SH.geo;
  g.sedanBody = new RoundedBoxGeometry(1.8, 0.7, 4.5, 3, 0.2);
  g.sedanCab = new RoundedBoxGeometry(1.62, 0.62, 2.3, 3, 0.22);
  g.suvBody = new RoundedBoxGeometry(1.9, 0.9, 4.7, 3, 0.2);
  g.suvCab = new RoundedBoxGeometry(1.78, 0.75, 2.9, 3, 0.2);
  g.vanBody = new RoundedBoxGeometry(1.95, 1.9, 5.2, 3, 0.25);
  g.vanWin = new THREE.BoxGeometry(1.9, 0.7, 0.05);
  g.lamp = new THREE.BoxGeometry(0.35, 0.14, 0.05);
  return SH;
}

function makeCar(type, colorIdx) {
  const s = shared(), g = new THREE.Group(), paint = s.paints[colorIdx % s.paints.length];
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  let len = 4.5;
  if (type === 'sedan') { add(s.geo.sedanBody, paint, 0, 0.68, 0); add(s.geo.sedanCab, s.glass, 0, 1.28, -0.25); }
  else if (type === 'suv') { add(s.geo.suvBody, paint, 0, 0.82, 0); add(s.geo.suvCab, s.glass, 0, 1.6, -0.3); len = 4.7; }
  else { add(s.geo.vanBody, paint, 0, 1.25, 0); add(s.geo.vanWin, s.glass, 0, 1.75, 2.58); len = 5.2; }
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) { add(s.wheel, s.tire, sx * 0.82, 0.33, sz * (len / 2 - 0.9)); add(s.hubG, s.hub, sx * 0.83, 0.33, sz * (len / 2 - 0.9)); }
    add(s.geo.lamp, s.head, sx * 0.6, type === 'van' ? 0.9 : 0.8, len / 2 + 0.01);
    add(s.geo.lamp, s.tail, sx * 0.62, type === 'van' ? 1.0 : 0.85, -len / 2 - 0.01);
  }
  return { g, len };
}

export function createTraffic(scene, count = 16, hwCount = 4) {
  const r = rng(555);
  const cars = [];
  const types = ['sedan', 'sedan', 'suv', 'van'];
  for (let i = 0; i < count; i++) {
    const { g, len } = makeCar(types[i % types.length], Math.floor(r() * COLORS.length));
    scene.add(g);
    const axis = r() < 0.5 ? 'z' : 'x', line = ROADS[Math.floor(r() * 4)], dir = r() < 0.5 ? 1 : -1;
    // 起點：兩個路口之間
    const seg = Math.floor(r() * 3), a = ROADS[seg] + 12, b = ROADS[seg + 1] - 12;
    cars.push({ g, len, axis, line, dir, s: a + r() * (b - a), v: 8, vmax: 10 + r() * 4, turn: null, stall: 0 });
  }
  // 國道上的車（往西開回市區、往東開到林場前面迴轉）
  const hwCars = [];
  for (let i = 0; i < hwCount; i++) {
    const { g, len } = makeCar(types[(i + 1) % types.length], Math.floor(r() * COLORS.length));
    g.rotation.order = 'YXZ'; scene.add(g);
    hwCars.push({ g, len, dir: i % 2 ? 1 : -1, s: 130 + r() * (HW_LEN - 280), v: 12, vmax: 15 + r() * 5, hw: true, ut: null, stall: 0 });
  }
  let ALL = cars.concat(hwCars);
  const allCars = () => ALL;
  const UT_S = HW_LEN - 92, UT_R = 3.5; // 林場前面迴轉
  // 卡在原地太久（例如卡車停在路中間擋住）：換到離卡車很遠的地方
  const STALL_MAX = 25;
  function respawnFar(c, me) {
    for (let k = 0; k < 30; k++) {
      let p;
      if (c.hw) { const s = 120 + r() * (UT_S - 150), d = r() < 0.5 ? 1 : -1; p = hwAt(s, d * 3.5); if (far(p, me)) { Object.assign(c, { s, dir: d, ut: null, v: 0, stall: 0 }); return; } }
      else {
        const axis = r() < 0.5 ? 'z' : 'x', line = ROADS[Math.floor(r() * 4)], dir = r() < 0.5 ? 1 : -1, seg = Math.floor(r() * 3);
        const s = ROADS[seg] + 14 + r() * 132; p = lanePos(axis, line, dir, s);
        if (far(p, me)) { Object.assign(c, { axis, line, dir, s, turn: null, passed: null, v: 0, stall: 0 }); return; }
      }
    }
    c.stall = 0;
  }
  function far(p, me) {
    if (Math.hypot(p.x - me.x, p.z - me.z) < 140) return false;
    return !allCars().some((o) => Math.hypot(o.g.position.x - p.x, o.g.position.z - p.z) < 15);
  }

  function nextCross(c) {
    // 前方下一個路口
    let best = null;
    for (const rr of ROADS) if ((rr - c.s) * c.dir > -0.01 && (best === null || Math.abs(rr - c.s) < Math.abs(best - c.s))) best = rr;
    return best;
  }

  function startTurn(c, cross) {
    const opts = [];
    if (ROADS.includes(cross + c.dir * 160)) opts.push({ straight: true });
    if (c.axis === 'x' && c.line === -80 && c.dir > 0 && cross === 240) opts.push({ straight: true }, { straight: true }); // 往東直走上國道
    for (const nd of [1, -1]) if (ROADS.includes(c.line + nd * 160)) opts.push({ nd });
    const o = opts[Math.floor(r() * opts.length)];
    if (!o || o.straight) { c.passed = cross; return; }
    const p0 = lanePos(c.axis, c.line, c.dir, cross - c.dir * 7);
    const naxis = c.axis === 'z' ? 'x' : 'z', nline = cross, nd = o.nd;
    const p2 = lanePos(naxis, nline, nd, c.line + nd * 7);
    const p1 = c.axis === 'z' ? { x: c.line - LANE * c.dir, z: nline + LANE * nd } : { x: nline - LANE * nd, z: c.line + LANE * c.dir };
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) + Math.hypot(p2.x - p1.x, p2.z - p1.z);
    c.turn = { p0, p1, p2, t: 0, len: len * 0.8, naxis, nline, nd, ns: c.line + nd * 7 };
  }

  // 卡車（玩家）位置點：用來讓車子停下來、也用來算碰撞
  function obstacleAhead(c, pos, fwd, rigPts) {
    let d = Infinity;
    for (const p of rigPts) {
      const dx = p.x - pos.x, dz = p.z - pos.z, f = dx * fwd.x + dz * fwd.z, l = Math.abs(dx * fwd.z - dz * fwd.x);
      if (f > 0 && f < 30 && l < 3.0) d = Math.min(d, f - c.len / 2 - 3.5);
    }
    for (const o of allCars()) {
      if (o === c) continue;
      const op = o.g.position, dx = op.x - pos.x, dz = op.z - pos.z, f = dx * fwd.x + dz * fwd.z, l = Math.abs(dx * fwd.z - dz * fwd.x);
      if (f > 0 && f < 30 && l < 1.8) d = Math.min(d, f - (c.len + o.len) / 2 - 2.5);
    }
    return d;
  }

  function update(dt, t, rigPts, night) {
    ALL = cars.concat(hwCars);
    const toHw = [], toCity = [];
    for (const c of cars) {
      let pos, h;
      if (c.turn) {
        const T = c.turn, u = T.t, a = 1 - u;
        pos = { x: a * a * T.p0.x + 2 * a * u * T.p1.x + u * u * T.p2.x, z: a * a * T.p0.z + 2 * a * u * T.p1.z + u * u * T.p2.z };
        const dx = 2 * a * (T.p1.x - T.p0.x) + 2 * u * (T.p2.x - T.p1.x), dz = 2 * a * (T.p1.z - T.p0.z) + 2 * u * (T.p2.z - T.p1.z);
        h = Math.atan2(dx, dz);
      } else { pos = lanePos(c.axis, c.line, c.dir, c.s); h = headingOf(c.axis, c.dir); }
      const fwd = { x: Math.sin(h), z: Math.cos(h) };
      let free = obstacleAhead(c, pos, fwd, rigPts);
      let target = c.turn ? 6 : c.vmax;
      if (!c.turn) {
        const cross = nextCross(c);
        if (cross !== null) {
          const dist = (cross - c.s) * c.dir;
          if (hasLight(cross, c.line) || hasLight(c.line, cross)) {
            const st = lightState(t, c.axis);
            const stopAt = dist - 10;
            if ((st === 'r' || (st === 'y' && stopAt > 4)) && stopAt > -1) free = Math.min(free, stopAt);
          }
          if (dist < 18) target = Math.min(target, 8);
          if (dist <= 7 && c.passed !== cross) startTurn(c, cross);
        }
      }
      const brakeV = free < 0 ? 0 : Math.sqrt(2 * 5 * Math.max(0, free));
      target = Math.min(target, brakeV);
      c.v += Math.max(-8 * dt, Math.min(2.5 * dt, target - c.v));
      if (c.v < 0) c.v = 0;
      c.stall = c.v < 0.2 ? c.stall + dt : 0;
      if (c.stall > STALL_MAX) { respawnFar(c, rigPts[0]); continue; }
      if (c.turn) {
        c.turn.t += (c.v * dt) / c.turn.len;
        if (c.turn.t >= 1) { const T = c.turn; c.axis = T.naxis; c.line = T.nline; c.dir = T.nd; c.s = T.ns; c.passed = null; c.turn = null; }
      } else {
        c.s += c.v * c.dir * dt;
        // 跑出地圖就換到別條路
        if (c.axis === 'x' && c.line === -80 && c.dir > 0 && c.s > 300) toHw.push(c); // 往東開上國道
        else if (Math.abs(c.s) > 300) { c.dir = -c.dir; c.s = Math.sign(c.s) * 299; }
      }
      c.g.position.set(pos.x, 0, pos.z); c.g.rotation.y = h;
    }
    // 國道上的車：往西開到市區就變回市區的車；往東開到林場前面迴轉
    const place = (c) => {
      if (c.ut !== null) {
        const th = c.ut, Q = hwAt(UT_S + UT_R * Math.sin(th), UT_R * Math.cos(th));
        const fx = Math.sin(Q.hd), fz = Math.cos(Q.hd), rx = -fz, rz = fx;
        const dx = fx * Math.cos(th) - rx * Math.sin(th), dz = fz * Math.cos(th) - rz * Math.sin(th);
        return { x: Q.x, y: Q.y, z: Q.z, h: Math.atan2(dx, dz), grade: 0 };
      }
      const Q = hwAt(c.s, c.dir * 3.5);
      return { x: Q.x, y: Q.y, z: Q.z, h: c.dir > 0 ? Q.hd : Q.hd + Math.PI, grade: Q.grade * c.dir };
    };
    for (const c of hwCars) {
      const P = place(c);
      const pos = { x: P.x, z: P.z }, fwd = { x: Math.sin(P.h), z: Math.cos(P.h) };
      let free = obstacleAhead(c, pos, fwd, rigPts);
      let target = c.ut !== null ? 3 : c.s > 110 ? c.vmax * 0.75 : c.vmax;
      if (c.ut === null && Math.abs(c.s - TOLL_S) < 40) target = 4.5; // 收費站慢慢過
      if (c.ut === null && c.dir > 0 && c.s > UT_S - 30) target = Math.min(target, 5);
      const brakeV = free < 0 ? 0 : Math.sqrt(2 * 5 * Math.max(0, free));
      target = Math.min(target, brakeV);
      c.v += Math.max(-8 * dt, Math.min(2.5 * dt, target - c.v));
      if (c.v < 0) c.v = 0;
      c.stall = c.v < 0.2 ? c.stall + dt : 0;
      if (c.stall > STALL_MAX) respawnFar(c, rigPts[0]);
      if (c.ut !== null) {
        c.ut += (c.v * dt) / UT_R;
        if (c.ut >= Math.PI) { c.ut = null; c.dir = -1; c.s = UT_S; }
      } else {
        c.s += c.v * c.dir * dt;
        if (c.dir > 0 && c.s >= UT_S) { c.s = UT_S; c.ut = 0; }
        if (c.dir < 0 && c.s < 0) toCity.push(c);
      }
      const Q = place(c);
      c.g.position.set(Q.x, Q.y, Q.z);
      c.g.rotation.set(-Math.atan(Q.grade), Q.h, 0);
    }
    for (const c of toHw) {
      cars.splice(cars.indexOf(c), 1); hwCars.push(c);
      Object.assign(c, { hw: true, ut: null, dir: 1, s: Math.max(0, c.s - 300), vmax: 15 + r() * 5, turn: null, stall: 0 });
      c.g.rotation.order = 'YXZ';
    }
    for (const c of toCity) {
      hwCars.splice(hwCars.indexOf(c), 1); cars.push(c);
      Object.assign(c, { hw: false, ut: null, axis: 'x', line: -80, dir: -1, s: 300 + c.s, turn: null, passed: null, vmax: 10 + r() * 4, stall: 0 });
      c.g.rotation.x = 0;
    }
    ALL = cars.concat(hwCars);
    const s = shared();
    s.head.emissiveIntensity = night ? 4 : 0.2; s.tail.emissiveIntensity = night ? 1.5 : 0.2;
  }

  // 碰撞用：每台車兩個圓
  function circles() {
    const out = [];
    for (const c of allCars()) {
      const p = c.g.position, h = c.g.rotation.y, fx = Math.sin(h), fz = Math.cos(h), o = c.len / 2 - 1.0;
      out.push({ x: p.x + fx * o, z: p.z + fz * o, r: 1.1, car: c }, { x: p.x - fx * o, z: p.z - fz * o, r: 1.1, car: c });
    }
    return out;
  }
  function positions() { return allCars().map((c) => c.g.position); }
  function setVisible(v) { allCars().forEach((c) => (c.g.visible = v)); }
  return { update, circles, positions, setVisible };
}
