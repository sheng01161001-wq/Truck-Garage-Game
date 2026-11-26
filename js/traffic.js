// 路上的車流：靠右行駛、路口轉彎、遇紅燈停、前面有車（或卡車）會減速
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROADS, DEPOTS, lightState, hasLight } from './world.js';
import { rng, clamp } from './util.js';
import { hwAt, LEN as HW_LEN, TOLL_S, PTS as HW_PTS, CITY_SIZE, REST_FUEL, REST_REPAIR } from './highway.js';

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
  // 國道上的小貨車：車頭＋貨箱
  g.lorryCab = new RoundedBoxGeometry(2.2, 2.1, 2.0, 3, 0.15);
  g.lorryBox = new THREE.BoxGeometry(2.3, 2.6, 6.2);
  g.lorryWin = new THREE.BoxGeometry(2.0, 0.8, 0.05);
  SH.box = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.6, metalness: 0.1 });
  return SH;
}

function makeCar(type, colorIdx) {
  const s = shared(), g = new THREE.Group(), paint = s.paints[colorIdx % s.paints.length];
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  let len = 4.5;
  if (type === 'sedan') { add(s.geo.sedanBody, paint, 0, 0.68, 0); add(s.geo.sedanCab, s.glass, 0, 1.28, -0.25); }
  else if (type === 'suv') { add(s.geo.suvBody, paint, 0, 0.82, 0); add(s.geo.suvCab, s.glass, 0, 1.6, -0.3); len = 4.7; }
  else if (type === 'lorry') {
    len = 8.8;
    add(s.geo.lorryCab, paint, 0, 1.55, 3.3); add(s.geo.lorryWin, s.glass, 0, 2.05, 4.31);
    add(s.geo.lorryBox, s.box, 0, 2.05, -1.0);
  }
  else { add(s.geo.vanBody, paint, 0, 1.25, 0); add(s.geo.vanWin, s.glass, 0, 1.75, 2.58); len = 5.2; }
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) { add(s.wheel, s.tire, sx * 0.82, 0.33, sz * (len / 2 - 0.9)); add(s.hubG, s.hub, sx * 0.83, 0.33, sz * (len / 2 - 0.9)); }
    add(s.geo.lamp, s.head, sx * (type === 'lorry' ? 0.8 : 0.6), type === 'van' || type === 'lorry' ? 0.9 : 0.8, len / 2 + 0.01);
    add(s.geo.lamp, s.tail, sx * (type === 'lorry' ? 0.95 : 0.62), type === 'van' || type === 'lorry' ? 1.0 : 0.85, -len / 2 - 0.01);
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
    const axis = r() < 0.5 ? 'z' : 'x', line = ROADS[Math.floor(r() * ROADS.length)], dir = r() < 0.5 ? 1 : -1;
    // 起點：兩個路口之間
    const seg = Math.floor(r() * (ROADS.length - 1)), a = ROADS[seg] + 12, b = ROADS[seg + 1] - 12;
    cars.push({ g, len, axis, line, dir, s: a + r() * (b - a), v: 8, vmax: 10 + r() * 4, turn: null, stall: 0 });
  }
  // 國道上的車（往西開回市區、往東開到林場前面迴轉）
  const hwCars = [];
  for (let i = 0; i < hwCount; i++) {
    const { g, len } = makeCar(i % 3 === 0 ? 'lorry' : types[(i + 1) % types.length], Math.floor(r() * COLORS.length));
    g.rotation.order = 'YXZ'; scene.add(g);
    const dir = i % 2 ? 1 : -1;
    hwCars.push({ g, len, dir, s: 200 + r() * (HW_LEN - 350), v: 12, vmax: 15 + r() * 5, hw: true, ut: null, stall: 0, o: dir * 3.5, rest: null });
  }
  let ALL = cars.concat(hwCars);
  const managedFleet = new Map();
  const allCars = () => ALL;
  const UT_S = HW_LEN - 92, UT_R = 3.5; // 林場前面迴轉
  // 卡在原地太久（例如卡車停在路中間擋住）：換到離卡車很遠的地方
  const STALL_MAX = 25;
  function respawnFar(c, me) {
    for (let k = 0; k < 30; k++) {
      let p;
      if (c.hw) { const s = 120 + r() * (UT_S - 150), d = r() < 0.5 ? 1 : -1; p = hwAt(s, d * 3.5); if (far(p, me)) { Object.assign(c, { s, dir: d, ut: null, v: 0, stall: 0, o: d * 3.5, rest: null }); return; } }
      else {
        const axis = r() < 0.5 ? 'z' : 'x', line = ROADS[Math.floor(r() * ROADS.length)], dir = r() < 0.5 ? 1 : -1, seg = Math.floor(r() * (ROADS.length - 1));
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
    const lastX = ROADS[ROADS.length - 1];
    if (c.axis === 'x' && c.line === -80 && c.dir > 0 && cross === lastX) { c.passed = cross; return; } // 最東邊的路口：直走上國道（出城只有這條路）
    if (c.axis === 'x' && c.line === -80 && c.dir > 0 && cross >= lastX - 160) opts.push({ straight: true }, { straight: true });
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
    // 一般車流也會把玩家公司派遣中的聯結車視為前方障礙，避免直接穿車。
    for (const item of managedFleet.values()) {
      if (!item.g.visible) continue;
      const op=item.g.position, dx=op.x-pos.x, dz=op.z-pos.z, f=dx*fwd.x+dz*fwd.z, l=Math.abs(dx*fwd.z-dz*fwd.x);
      if(f>0&&f<34&&l<2.7)d=Math.min(d,f-(c.len+8.5)/2-2.8);
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
        if (c.axis === 'x' && c.line === -80 && c.dir > 0 && c.s > CITY_SIZE) toHw.push(c); // 往東開上國道
        else if (Math.abs(c.s) > CITY_SIZE) { c.dir = -c.dir; c.s = Math.sign(c.s) * (CITY_SIZE - 1); }
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
      const Q = hwAt(c.s, c.o ?? c.dir * 3.5);
      return { x: Q.x, y: Q.y, z: Q.z, h: c.dir > 0 ? Q.hd : Q.hd + Math.PI, grade: Q.grade * c.dir };
    };
    // 休息站：有些車會開進去加油／修車，停一下再開回主線
    const REST_STOP = { 1: { zone: REST_FUEL, o: 16.75, s: 132 }, [-1]: { zone: REST_REPAIR, o: -14.5, s: 136 } };
    const restPlan = (c) => {
      const R = REST_STOP[c.dir], before = (R.s - c.s) * c.dir;
      if (c.rest === null && before > 60 && before < 110) c.rest = r() < 0.35 ? { t: 0, done: false } : false;
      if (!c.rest) { if (before < -40) c.rest = null; return c.dir * 3.5; }
      if (c.rest.done) { if (before < -40) c.rest = null; return before < -15 ? c.dir * 3.5 : R.o; }
      return before < 57 ? R.o : c.dir * 3.5;
    };
    for (const c of hwCars) {
      const P = place(c);
      const pos = { x: P.x, z: P.z }, fwd = { x: Math.sin(P.h), z: Math.cos(P.h) };
      let free = obstacleAhead(c, pos, fwd, rigPts);
      let target = c.ut !== null ? 3 : c.s > 110 ? c.vmax * 0.75 : c.vmax;
      if (c.ut === null && Math.abs(c.s - TOLL_S) < 40) target = Math.abs(c.o ?? 3.5) < 7 ? 9 : 4.5; // ETC 車道 30 公里通過
      let wantO = c.dir * 3.5;
      if (c.ut === null) {
        wantO = restPlan(c);
        const R = REST_STOP[c.dir];
        if (c.rest && !c.rest.done) {
          const left = (R.s - c.s) * c.dir;
          target = Math.min(target, Math.max(0, Math.sqrt(2 * 1.2 * Math.max(0, left))), 7);
          if (left < 0.6) { target = 0; c.rest.t += dt; c.stall = 0; if (c.rest.t > 7) c.rest.done = true; }
        } else if (c.rest && c.rest.done) target = Math.min(target, 7);
      }
      if (c.o === undefined) c.o = c.dir * 3.5;
      c.o += clamp(wantO - c.o, -2.2 * dt * Math.min(1, c.v / 4), 2.2 * dt * Math.min(1, c.v / 4));
      if (c.ut === null && c.dir > 0 && c.s > UT_S - 30) target = Math.min(target, 5);
      const brakeV = free < 0 ? 0 : Math.sqrt(2 * 5 * Math.max(0, free));
      target = Math.min(target, brakeV);
      c.v += Math.max(-8 * dt, Math.min(2.5 * dt, target - c.v));
      if (c.v < 0) c.v = 0;
      c.stall = c.v < 0.2 && !(c.rest && !c.rest.done) ? c.stall + dt : 0;
      if (c.stall > STALL_MAX) respawnFar(c, rigPts[0]);
      if (c.ut !== null) {
        c.ut += (c.v * dt) / UT_R;
        if (c.ut >= Math.PI) { c.ut = null; c.dir = -1; c.s = UT_S; c.o = -3.5; c.rest = null; }
      } else {
        c.s += c.v * c.dir * dt;
        if (c.dir > 0 && c.s >= UT_S) { c.s = UT_S; c.ut = 0; }
        if (c.dir < 0 && c.s < 0) toCity.push(c);
      }
      const Q = place(c);
      // 換車道時車頭跟著偏一點
      let h = Q.h;
      if (c.ut === null) { const dx = Q.x - c.g.position.x, dz = Q.z - c.g.position.z; if (dx * dx + dz * dz > 1e-4 && dx * dx + dz * dz < 4) h = Math.atan2(dx, dz); }
      c.g.position.set(Q.x, Q.y, Q.z);
      c.g.rotation.set(-Math.atan(Q.grade), h, 0);
    }
    // 國道上的車太少：把離卡車很遠的市區車搬到國道上（國道不要空空的）
    if (hwCars.length + toHw.length < hwCount && !toCity.length) {
      const me = rigPts[0];
      const c = cars.find((k) => !toHw.includes(k) && !k.turn && Math.hypot(k.g.position.x - me.x, k.g.position.z - me.z) > 160);
      if (c) {
        const ns = 200 + r() * (UT_S - 260), nd = r() < 0.5 ? 1 : -1, Q = hwAt(ns, nd * 3.5);
        if (Math.hypot(Q.x - me.x, Q.z - me.z) > 160 && !allCars().some((o) => Math.hypot(o.g.position.x - Q.x, o.g.position.z - Q.z) < 20)) {
          cars.splice(cars.indexOf(c), 1); hwCars.push(c);
          Object.assign(c, { hw: true, ut: null, dir: nd, s: ns, v: 8, vmax: 15 + r() * 5, turn: null, stall: 0, o: nd * 3.5, rest: null });
          c.g.rotation.order = 'YXZ'; c.g.position.set(Q.x, Q.y, Q.z);
        }
      }
    }
    for (const c of toHw) {
      cars.splice(cars.indexOf(c), 1); hwCars.push(c);
      Object.assign(c, { hw: true, ut: null, dir: 1, s: Math.max(0, c.s - CITY_SIZE), vmax: 15 + r() * 5, turn: null, stall: 0, o: 3.5, rest: null });
      c.g.rotation.order = 'YXZ';
    }
    for (const c of toCity) {
      hwCars.splice(hwCars.indexOf(c), 1); cars.push(c);
      Object.assign(c, { hw: false, ut: null, axis: 'x', line: -80, dir: -1, s: CITY_SIZE + c.s, turn: null, passed: null, vmax: 10 + r() * 4, stall: 0 });
      c.g.rotation.x = 0;
    }
    ALL = cars.concat(hwCars);
    const s = shared();
    s.head.emissiveIntensity = night ? 4 : 0.2; s.tail.emissiveIntensity = night ? 1.5 : 0.2;
  }

  // J：車隊專屬塗裝與公司識別。Canvas 貼圖只在車輛建立／識別變更時產生。
  function fleetLabelTexture(companyName, unitName, plate) {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext('2d');
    const grad=ctx.createLinearGradient(0,0,1024,0);grad.addColorStop(0,'#101820');grad.addColorStop(.5,'#263746');grad.addColorStop(1,'#101820');
    ctx.fillStyle=grad;ctx.fillRect(0,0,1024,256);
    ctx.strokeStyle='#e5b65b';ctx.lineWidth=12;ctx.strokeRect(12,12,1000,232);
    ctx.fillStyle='#f4d18b';ctx.font='bold 76px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(companyName||'物流車隊').slice(0,16),512,94);
    ctx.fillStyle='#ffffff';ctx.font='bold 42px sans-serif';ctx.fillText(`${String(unitName||'車隊車輛').slice(0,12)}  /  ${String(plate||'BK-000').slice(0,10)}`,512,184);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;return tex;
  }
  // J：物流公司車隊模型，具備獨立車色、公司標識與車牌。
  function makeManagedTruck(color = '#1f5fa8', companyName='小棒槌物流', unitName='物流車 01', plate='BK-001') {
    const root = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.48, roughness: 0.28, clearcoat: 0.8 });
    const trailerMat = new THREE.MeshPhysicalMaterial({ color: '#c7cdd2', metalness: 0.28, roughness: 0.42, clearcoat: 0.35 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#172631', roughness: 0.12, metalness: 0.25, clearcoat: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#151719', roughness: 0.82 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#b9c2c8', metalness: 0.9, roughness: 0.22 });
    const box = (w,h,d,mat,x,y,z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; root.add(m); return m; };
    // 前方朝 +Z：駕駛室、車架與半掛車
    box(2.45,1.35,2.55,bodyMat,0,1.45,2.1);
    box(2.25,0.82,1.35,glass,0,2.48,2.35);
    box(2.5,0.22,0.18,chrome,0,1.1,3.42);
    box(2.42,0.16,0.18,dark,0,0.83,3.42);
    box(2.45,2.45,7.4,trailerMat,0,2.0,-3.9);
    box(2.5,0.16,7.5,chrome,0,0.78,-3.9);
    for (const x of [-1.28,1.28]) {
      for (const z of [2.7,1.0,-5.8,-4.5,-3.2]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.48,0.48,0.28,18).rotateZ(Math.PI/2),dark); tire.position.set(x,0.48,z); tire.castShadow=true; root.add(tire);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,0.3,14).rotateZ(Math.PI/2),chrome); hub.position.set(x*1.01,0.48,z); root.add(hub);
      }
    }
    for (const x of [-0.82,0.82]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.22,0.08),new THREE.MeshStandardMaterial({color:'#fff2d5',emissive:'#fff0c2',emissiveIntensity:0.8})); lamp.position.set(x,1.35,3.42); root.add(lamp);
    }
    const brandMap=fleetLabelTexture(companyName,unitName,plate);
    const brandMat=new THREE.MeshBasicMaterial({map:brandMap,transparent:false,side:THREE.DoubleSide});
    for(const side of [-1,1]){const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.7,1.12),brandMat);sign.position.set(side*1.263,2.05,-3.85);sign.rotation.y=side*Math.PI/2;root.add(sign);}
    const plateCanvas=document.createElement('canvas');plateCanvas.width=512;plateCanvas.height=160;const pc=plateCanvas.getContext('2d');pc.fillStyle='#f2f2e8';pc.fillRect(0,0,512,160);pc.strokeStyle='#202830';pc.lineWidth=10;pc.strokeRect(5,5,502,150);pc.fillStyle='#17212a';pc.font='bold 86px monospace';pc.textAlign='center';pc.textBaseline='middle';pc.fillText(String(plate||'BK-001').slice(0,10),256,84);const plateTex=new THREE.CanvasTexture(plateCanvas);plateTex.colorSpace=THREE.SRGBColorSpace;const plateMesh=new THREE.Mesh(new THREE.PlaneGeometry(1.15,.36),new THREE.MeshBasicMaterial({map:plateTex,side:THREE.DoubleSide}));plateMesh.position.set(0,.91,3.515);root.add(plateMesh);
    return root;
  }
  function nearestRoad(v) { return ROADS.reduce((best,r)=>Math.abs(r-v)<Math.abs(best-v)?r:best,ROADS[0]); }
  function pushPoint(out,p) { const last=out[out.length-1]; if(!last||Math.hypot(last.x-p.x,last.z-p.z)>0.5)out.push({x:p.x,z:p.z,y:p.y??0}); }
  function cityAccess(dep,out) {
    const rx=nearestRoad(dep.bx), rz=nearestRoad(dep.bz);
    pushPoint(out,{x:dep.bx,z:dep.bz,y:0});
    pushPoint(out,{x:rx,z:dep.bz,y:0});
    pushPoint(out,{x:rx,z:rz,y:0});
    return {x:rx,z:rz,y:0};
  }
  function buildFleetRoute(unit) {
    const a=DEPOTS[unit.origin], b=DEPOTS[unit.destination]; if(!a||!b)return [{x:0,z:0,y:0},{x:0,z:80,y:0}];
    const out=[]; const aLumber=a.kind==='lumber', bLumber=b.kind==='lumber';
    if(aLumber){const reversed=buildFleetRoute({...unit,origin:unit.destination,destination:unit.origin});return reversed.reverse();}
    const start=cityAccess(a,out);
    if(bLumber){
      const gate={x:nearestRoad(CITY_SIZE),z:nearestRoad(-80),y:0};
      pushPoint(out,{x:gate.x,z:start.z,y:0});pushPoint(out,gate);pushPoint(out,hwAt(0));
      for(let s=24;s<=HW_LEN-8;s+=24)pushPoint(out,hwAt(s));pushPoint(out,hwAt(HW_LEN-8));
    } else {
      const endX=nearestRoad(b.bx),endZ=nearestRoad(b.bz);
      const goX=Math.abs(endX-start.x)+Math.abs(endZ-start.z);
      const mid=goX>=0?{x:endX,z:start.z,y:0}:null;
      pushPoint(out,mid);pushPoint(out,{x:endX,z:endZ,y:0});
    }
    if(!bLumber){
      pushPoint(out,{x:nearestRoad(b.bx),z:b.bz,y:0});pushPoint(out,{x:b.bx,z:b.bz,y:0});
    } else { pushPoint(out,{x:b.bx,z:b.bz,y:b.y??0}); }
    return out.length>1?out:[{x:a.bx,z:a.bz,y:0},{x:b.bx,z:b.bz,y:0}];
  }
  function routeAt(points,progress) {
    const lens=[];let total=0;for(let i=1;i<points.length;i++){const d=Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z);lens.push(d);total+=d;}
    let dist=Math.max(0,Math.min(1,progress))*total;
    for(let i=0;i<lens.length;i++){if(dist<=lens[i]||i===lens.length-1){const a=points[i],b=points[i+1],t=lens[i]?dist/lens[i]:0;return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,hd:Math.atan2(b.x-a.x,b.z-a.z),segment:i,segmentT:t,next:b};}dist-=lens[i];}
    return { ...points[points.length-1], hd:0, segment:lens.length-1, segmentT:1, next:points[points.length-1] };
  }
  function syncFleet(units = [], companyName='小棒槌物流') {
    const ids = new Set(units.map(u => u.id));
    for (const [id, item] of managedFleet) if (!ids.has(id)) { scene.remove(item.g); managedFleet.delete(id); }
    for (const u of units) {
      const color=u.paint||'#145da0', plate=u.plate||'BK-000';
      const key=[color,companyName,u.name,plate].join('|');
      let item=managedFleet.get(u.id);
      if(item && item.liveryKey!==key){scene.remove(item.g);managedFleet.delete(u.id);item=null;}
      if(!item){const g=makeManagedTruck(color,companyName,u.name,plate);scene.add(g);item={g,unit:u,routeKey:'',route:[],liveryKey:key};managedFleet.set(u.id,item);}
      item.unit=u;
    }
  }
  function updateFleet(units = [], dt = 1/60, time = 0, companyName='小棒槌物流') {
    syncFleet(units,companyName);
    for (const u of units) {
      const item=managedFleet.get(u.id); if(!item) continue;
      const active=u.status==='outbound'||u.status==='returning';
      item.g.visible=active; if(!active) continue;
      const key=`${u.origin}-${u.destination}-${u.status}`;
      if(item.routeKey!==key){const forward=buildFleetRoute(u);item.route=u.status==='returning'?[...forward].reverse():forward;item.routeKey=key;}
      let q=routeAt(item.route,Math.max(0,Math.min(1,Number(u.progress)||0)));
      const next=q.next, atSignal=next&&hasLight(Math.round(next.x),Math.round(next.z));
      let blocked=false;
      const vx=Math.sin(q.hd),vz=Math.cos(q.hd);
      for(const other of allCars()) {const dx=other.g.position.x-q.x,dz=other.g.position.z-q.z,forward=dx*vx+dz*vz,lateral=Math.abs(dx*vz-dz*vx);if(forward>0&&forward<13&&lateral<3.1){blocked=true;break;}}
      if(!blocked){for(const [otherId,other] of managedFleet){if(otherId===u.id||!other.g.visible)continue;const dx=other.g.position.x-q.x,dz=other.g.position.z-q.z,forward=dx*vx+dz*vz,lateral=Math.abs(dx*vz-dz*vx);if(forward>0&&forward<15&&lateral<3.2){blocked=true;break;}}}
      if((blocked||(atSignal&&q.segmentT>0.82&&(()=>{const axis=Math.abs(next.x-item.route[q.segment].x)>Math.abs(next.z-item.route[q.segment].z)?'x':'z';return lightState(time,axis)==='r';})()))){u.progress=Math.max(0,u.progress-dt/Math.max(1,u.duration));q=routeAt(item.route,u.progress);}
      const old=item.g.rotation.y, delta=Math.atan2(Math.sin(q.hd-old),Math.cos(q.hd-old));
      item.g.position.set(q.x,q.y,q.z);item.g.rotation.set(0,old+delta*0.18,0);
    }
  }
  function fleetPositions() { return [...managedFleet.values()].filter(v=>v.g.visible).map(v=>v.g.position); }
  function fleetObject(id) { const item=managedFleet.get(id); return item ? item.g : null; }

  // 碰撞用：每台車兩個圓
  function circles() {
    const out = [];
    for (const c of allCars()) {
      const p = c.g.position, h = c.g.rotation.y, fx = Math.sin(h), fz = Math.cos(h), o = c.len / 2 - 1.0;
      out.push({ x: p.x + fx * o, z: p.z + fz * o, y: p.y, r: 1.1, car: c }, { x: p.x - fx * o, z: p.z - fz * o, y: p.y, r: 1.1, car: c });
    }
    for (const item of managedFleet.values()) if(item.g.visible) { const p=item.g.position,h=item.g.rotation.y,fx=Math.sin(h),fz=Math.cos(h); out.push({x:p.x+fx*4,z:p.z+fz*4,y:p.y,r:1.6,car:item},{x:p.x-fx*4,z:p.z-fz*4,y:p.y,r:1.6,car:item}); }
    return out;
  }
  function positions() { return allCars().map((c) => c.g.position).concat(fleetPositions()); }
  function setVisible(v) { allCars().forEach((c) => (c.g.visible = v)); for(const item of managedFleet.values()) item.g.visible=v && item.unit && (item.unit.status==='outbound'||item.unit.status==='returning'); }
  return { update, circles, positions, setVisible, syncFleet, updateFleet, fleetPositions, fleetObject };
}
