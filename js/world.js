// 地圖：山景地形、道路、城市、港口、工地、農場、加油站、路燈、紅綠燈、室內改裝廠
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, makeNoise, clamp, canvasTex, FONT } from './util.js';
import {
  asphaltTex, noiseBumpTex, concreteTex, grassTex, facadeTex, photoMap, photoDetail, corrugatedTex, boardTex, gravelTex, fieldTex, stripeTex, ledTex,
} from './textures.js';
import { naturalHeight, terrainHeight, buildHighway, LUMBER, nearHighway, inCity, isInterchangeRoad, PIERS } from './highway.js';
import { nearStruct, buildElevated } from './elevated.js';

export const ROADS = [-400, -240, -80, 80, 240, 400];
export const ROAD_W = 14;
export const WORLD = 466;
// 可探索區域標記：供世界入口標示與 GPS 小地圖共用。
export const DISTRICTS = [
  { name: '城市商業區', short: '市中心', x: 0, z: 0, rx: 92, rz: 92, color: '#d7a84b' },
  { name: '港灣物流區', short: '港區', x: -226, z: 164, rx: 74, rz: 72, color: '#4a9bd4' },
  { name: '工業園區', short: '工業區', x: 202, z: -54, rx: 78, rz: 92, color: '#9aa6b2' },
  { name: '農業產區', short: '農業區', x: 164, z: -228, rx: 72, rz: 62, color: '#83b65b' },
  { name: '山區林道', short: '山區', x: 590, z: -100, rx: 110, rz: 150, color: '#7eaa83' },
  { name: '西郊轉運區', short: '西郊', x: -390, z: -110, rx: 78, rz: 100, color: '#c18a5a' },
  { name: '北城倉儲區', short: '北倉', x: -20, z: -390, rx: 110, rz: 62, color: '#8c9aa8' },
  { name: '東區冷鏈區', short: '冷鏈', x: 390, z: 100, rx: 62, rz: 100, color: '#65a9bd' },
  { name: '南郊配送區', short: '南郊', x: 100, z: 390, rx: 100, rz: 62, color: '#b49a55' },
];
export const DEPOTS = [
  { name: '港口', emoji: '🚢', x: -266, z: 160, bx: -288, bz: 160, color: '#1f5fa8', kind: 'port' },
  { name: '農場', emoji: '🐄', x: 160, z: -264, bx: 160, bz: -287, color: '#4c7a2a', kind: 'farm' },
  { name: '工廠', emoji: '🏭', x: 266, z: -20, bx: 288, bz: -20, color: '#5c6670', kind: 'factory' },
  { name: '超市', emoji: '🛒', x: 0, z: 102, bx: 0, bz: 126, color: '#c62828', kind: 'shop' },
  { name: '建材行', emoji: '🧱', x: -160, z: -102, bx: -160, bz: -126, color: '#b5651d', kind: 'site' },
  { name: '玩具店', emoji: '🧸', x: 102, z: 170, bx: 126, bz: 170, color: '#d81b60', kind: 'shop' },
  { name: '冰店', emoji: '🍦', x: -100, z: 264, bx: -100, bz: 287, color: '#0288d1', kind: 'shop' },
  { name: '西郊轉運站', emoji: '📦', x: -425, z: -80, bx: -448, bz: -80, color: '#8d6e63', kind: 'shop' },
  { name: '北城倉庫', emoji: '🏬', x: -80, z: -425, bx: -80, bz: -448, color: '#607d8b', kind: 'shop' },
  { name: '東區冷鏈倉', emoji: '❄️', x: 425, z: 80, bx: 448, bz: 80, color: '#388eaa', kind: 'shop' },
  { name: '南郊配送站', emoji: '🚚', x: 80, z: 425, bx: 80, bz: 448, color: '#9b7b35', kind: 'shop' },
  LUMBER, // 山上林場（走國道、過收費站和隧道）
];
export const GAS = { x: -58, z: 30, name: '加油站' };
export const GARAGE_BLD = { x: 122, z: -34 };
export const SPAWN = { x: 80 - 3.5, z: -30, heading: 0 };
export const SHOWROOM = { x: 0, y: -400, z: 0 };

const N = makeNoise(42);
export const heightAt = naturalHeight;
const cGrass = new THREE.Color(0x56703a), cForest = new THREE.Color(0x2f4a2a), cRock = new THREE.Color(0x6f6a62), cSnow = new THREE.Color(0xeef2f5);
function terrainColor(x, z, h, out) {
  const n = N.n2(x / 30, z / 30);
  if (h < 25) out.copy(cGrass).lerp(cForest, clamp(h / 25, 0, 1) * 0.7);
  else if (h < 170) out.copy(cForest).lerp(cRock, clamp((h - 120) / 50, 0, 1));
  else if (h < 300) out.copy(cRock).lerp(cSnow, clamp((h - 270) / 30, 0, 1));
  else out.copy(cSnow);
  return out.multiplyScalar(0.85 + n * 0.3);
}
export function onRoad(x, z) {
  if (Math.abs(x) > 460 || Math.abs(z) > 460) return false;
  return ROADS.some((r) => Math.abs(x - r) < ROAD_W / 2 + 0.5 || Math.abs(z - r) < ROAD_W / 2 + 0.5);
}
const GRAVEL_ZONES = [];
export function surfaceAt(x, z) {
  if (!inCity(x, z)) return 'road'; // 城外只能開在國道上
  if (isInterchangeRoad(x, z) || onRoad(x, z)) return 'road';
  if (Math.hypot(x - GAS.x, z - GAS.z) < 14) return 'road';
  for (const d of DEPOTS) if (Math.abs(x - d.x) < 12 && Math.abs(z - d.z) < 12) return 'road';
  if (GRAVEL_ZONES.some((g) => Math.abs(x - g.x) < g.w / 2 && Math.abs(z - g.z) < g.d / 2)) return 'gravel';
  return 'grass';
}

export const boxes = []; // 會撞到的東西
const wetMats = []; // 下雨要變濕的材質
const nightMats = []; // 晚上會亮的材質 {mat, on}
let lampPools = null;
const lampHeads = [];
const tlMats = { z: {}, x: {} };
let showroomLights = [];

export function setWet(w) {
  for (const o of wetMats) {
    o.mat.roughness = w ? o.wet : o.dry;
    o.mat.color.copy(w ? o.wetColor : o.dryColor);
  }
  puddles.forEach((p) => (p.visible = w));
}
export function setNight(level) {
  for (const o of nightMats) o.mat.emissiveIntensity = o.on * level;
  if (lampPools) lampPools.visible = level > 0.3;
}
export function lampPositions() { return lampHeads; }
export function setShowroomLights(on) { showroomLights.forEach((l) => (l.visible = on)); }

// 紅綠燈：30 秒一輪（z 向綠 12 秒、黃 3 秒；x 向綠 12 秒、黃 3 秒）
export function lightState(t, axis) {
  const p = t % 30;
  const zs = p < 12 ? 'g' : p < 15 ? 'y' : 'r';
  const xs = p < 15 ? 'r' : p < 27 ? 'g' : 'y';
  return axis === 'z' ? zs : xs;
}
// v23：市中心 4×4 的路口（±80、±240）都有紅綠燈
export const LIGHT_LINES = [-240, -80, 80, 240];
export function hasLight(cx, cz) { return LIGHT_LINES.includes(cx) && LIGHT_LINES.includes(cz); }
export function updateTrafficLights(t) {
  for (const axis of ['z', 'x']) {
    const s = lightState(t, axis), m = tlMats[axis];
    m.r.emissiveIntensity = s === 'r' ? 4 : 0.03; m.y.emissiveIntensity = s === 'y' ? 4 : 0.03; m.g.emissiveIntensity = s === 'g' ? 4 : 0.03;
  }
}

const puddles = [];

function stdMat(opts) { return new THREE.MeshStandardMaterial(opts); }
function mesh(geo, mat, x, y, z, parent, { cast = true, recv = true, ry = 0 } = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m;
}

export function buildWorld(scene, quality) {
  const root = new THREE.Group(); scene.add(root);
  const R = rng(2024);

  // ---------- 遠方山景地形 ----------
  const seg = quality === 'low' ? 110 : 170;
  const tg = new THREE.PlaneGeometry(3400, 3400, seg, seg); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, cols = new Float32Array(tp.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = terrainHeight(x, z);
    tp.setY(i, h - 0.08);
    terrainColor(x, z, Math.max(0, h), tmp);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const terrainMat = stdMat({ vertexColors: true, roughness: 0.95 });
  mesh(tg, terrainMat, 0, 0, 0, root, { cast: false });

  // 地面草地（遊戲區）
  const gt = grassTex(); gt.repeat.set(70, 70);
  const groundMat = stdMat({ map: gt, roughness: 0.95 });
  // 實拍草地的凹凸細節（照片偏乾黃，所以顏色仍用程式畫的綠草，只借照片的立體感；照片 15 公尺見方 → 重複 72 次）
  photoDetail(groundMat, 'aerial_grass_rock', 72, 72, 0.6);
  wetMats.push({ mat: groundMat, dry: 0.95, wet: 0.6, dryColor: new THREE.Color(1, 1, 1), wetColor: new THREE.Color(0.75, 0.78, 0.75) });
  const ground = mesh(new THREE.PlaneGeometry(1080, 1080), groundMat, 0, 0, 0, root, { cast: false }); ground.rotation.x = -Math.PI / 2;

  // ---------- 區域入口指示牌 ----------
  const signEntries = [
    { text: 'CITY CENTER  城市商業區', x: 92, z: 108, ry: Math.PI / 2, color: '#8a5a18' },
    { text: 'PORT LOGISTICS  港灣物流區', x: -252, z: 112, ry: -Math.PI / 2, color: '#145b86' },
    { text: 'INDUSTRIAL PARK  工業園區', x: 252, z: -104, ry: Math.PI / 2, color: '#46515c' },
    { text: 'FARM DISTRICT  農業產區', x: 124, z: -246, ry: 0, color: '#426d2d' },
    { text: 'WEST FREIGHT  西郊轉運區', x: -452, z: -150, ry: -Math.PI / 2, color: '#76533b' },
    { text: 'NORTH WAREHOUSE  北城倉儲區', x: -150, z: -452, ry: 0, color: '#536b7b' },
    { text: 'EAST COLD CHAIN  東區冷鏈區', x: 452, z: 150, ry: Math.PI / 2, color: '#286f86' },
    { text: 'SOUTH DISTRIBUTION  南郊配送區', x: 150, z: 452, ry: Math.PI, color: '#80652d' },
  ];
  const signPostMat = stdMat({ color: 0x777d82, roughness: 0.55, metalness: 0.65 });
  for (const entry of signEntries) {
    const tex = canvasTex(768, 192, (ctx, w, h) => {
      ctx.fillStyle = entry.color; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#e9edf0'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#ffffff'; ctx.font = `bold 48px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(entry.text, w / 2, h / 2);
    });
    const boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65, metalness: 0.12, side: THREE.DoubleSide });
    const sign = new THREE.Group(); sign.position.set(entry.x, 0, entry.z); sign.rotation.y = entry.ry; root.add(sign);
    mesh(new THREE.BoxGeometry(0.45, 4.2, 0.45), signPostMat, -5.4, 2.1, 0, sign);
    mesh(new THREE.BoxGeometry(0.45, 4.2, 0.45), signPostMat, 5.4, 2.1, 0, sign);
    mesh(new THREE.BoxGeometry(12, 3, 0.35), boardMat, 0, 5.2, 0, sign);
  }

  // ---------- 道路 ----------
  const bump = noiseBumpTex(3, 256, 0.8); bump.repeat.set(4, 8);
  const roadMat = {};
  for (const kind of ['city', 'highway', 'plain']) {
    const t = asphaltTex(kind);
    const m = stdMat({ map: t, bumpMap: bump, bumpScale: 1.2, roughness: 0.88 });
    photoDetail(m, 'asphalt_02', 14 / 3, 28 / 3, 0.8);   // 實拍柏油的凹凸（照片 3 公尺見方）
    wetMats.push({ mat: m, dry: 0.88, wet: 0.12, dryColor: new THREE.Color(1, 1, 1), wetColor: new THREE.Color(0.55, 0.56, 0.6) });
    roadMat[kind] = m;
  }
  const lineKind = (r) => (Math.abs(r) >= 240 ? 'highway' : 'city');
  const addSeg = (axis, line, a, b) => {
    const len = b - a; if (len <= 0.1) return;
    const g = new THREE.PlaneGeometry(ROAD_W, len); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 28));
    const mm = mesh(g, roadMat[lineKind(line)], 0, 0.02, 0, root, { cast: false });
    if (axis === 'z') mm.position.set(line, 0.02, (a + b) / 2);
    else { mm.rotation.y = Math.PI / 2; mm.position.set((a + b) / 2, 0.02, line); }
  };
  const stops = [-460, ...ROADS, 460];
  for (const line of ROADS) for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i] + (ROADS.includes(stops[i]) ? ROAD_W / 2 : 0), b = stops[i + 1] - (ROADS.includes(stops[i + 1]) ? ROAD_W / 2 : 0);
    addSeg('z', line, a, b); addSeg('x', line, a, b);
  }
  // v23：每個方向兩條車道，中間畫白色虛線
  {
    const spots = [];
    for (const line of ROADS) for (const side of [-1, 1]) for (let a = -455; a <= 455; a += 9) {
      if (ROADS.some((r) => Math.abs(a - r) < ROAD_W / 2 + 4)) continue;
      spots.push([line + side * 3.5, a, 'z'], [a, line + side * 3.5, 'x']);
    }
    const dg = new THREE.BoxGeometry(0.15, 0.02, 3);
    const dm = new THREE.InstancedMesh(dg, stdMat({ color: 0xf0f0ec, roughness: 0.7 }), spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, ax], i) => { q.setFromAxisAngle(up, ax === 'z' ? 0 : Math.PI / 2); m4.compose(new THREE.Vector3(x, 0.035, z), q, one); dm.setMatrixAt(i, m4); });
    dm.receiveShadow = true; root.add(dm);
  }
  const ig = new THREE.PlaneGeometry(ROAD_W, ROAD_W); ig.rotateX(-Math.PI / 2);
  for (const x of ROADS) for (const z of ROADS) mesh(ig, roadMat.plain, x, 0.025, z, root, { cast: false });
  // 斑馬線、停止線（市區路口）
  const zebra = canvasTex(256, 64, (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(235,235,235,.85)'; for (let x = 6; x < w; x += 24) ctx.fillRect(x, 0, 12, h); });
  const zebraMat = new THREE.MeshStandardMaterial({ map: zebra, transparent: true, roughness: 0.7, depthWrite: false });
  const zg = new THREE.PlaneGeometry(ROAD_W - 1, 3); zg.rotateX(-Math.PI / 2);
  for (const x of [-80, 80]) for (const z of [-80, 80]) {
    for (const s of [1, -1]) {
      mesh(zg, zebraMat, x, 0.04, z + s * 9, root, { cast: false });
      const m2 = mesh(zg, zebraMat, x + s * 9, 0.04, z, root, { cast: false }); m2.rotation.y = Math.PI / 2;
    }
  }
  // 積水（下雨才出現）
  const pudMat = new THREE.MeshPhysicalMaterial({ color: 0x1c1f24, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.75, depthWrite: false, clearcoat: 1 });
  for (let i = 0; i < 70; i++) {
    const line = ROADS[Math.floor(R() * ROADS.length)], along = (R() * 2 - 1) * 445, off = (R() * 2 - 1) * 5;
    const pg = new THREE.CircleGeometry(1 + R() * 2.2, 18); pg.rotateX(-Math.PI / 2); pg.scale(1, 1, 0.5 + R());
    const p = R() < 0.5 ? mesh(pg, pudMat, line + off, 0.045, along, root, { cast: false }) : mesh(pg, pudMat, along, 0.045, line + off, root, { cast: false });
    p.visible = false; puddles.push(p);
  }

  // 人行道（市區道路兩側）
  const sideMat = stdMat({ map: concreteTex(), roughness: 0.9 }); sideMat.map.repeat.set(1, 8);
  photoMap(sideMat, 'concrete_pavement', 1.7, 14);   // 實拍人行道鋪面（照片 1.8 公尺見方）
  wetMats.push({ mat: sideMat, dry: 0.9, wet: 0.35, dryColor: new THREE.Color(1, 1, 1), wetColor: new THREE.Color(0.7, 0.7, 0.72) });
  for (const line of [-80, 80]) for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i] + (ROADS.includes(stops[i]) ? ROAD_W / 2 + 3 : 0), b = stops[i + 1] - (ROADS.includes(stops[i + 1]) ? ROAD_W / 2 + 3 : 0);
    if (a < -240 || b > 240) continue;
    const len = b - a, sg = new THREE.BoxGeometry(3, 0.16, len);
    for (const s of [1, -1]) {
      mesh(sg, sideMat, line + s * (ROAD_W / 2 + 1.5), 0.08, (a + b) / 2, root, { cast: false });
      const m2 = mesh(sg, sideMat, (a + b) / 2, 0.08, line + s * (ROAD_W / 2 + 1.5), root, { cast: false }); m2.rotation.y = Math.PI / 2;
    }
  }

  // ---------- 材質：大樓 ----------
  const facades = { office: [facadeTex('office', 1), facadeTex('office', 2)], apartment: [facadeTex('apartment', 3), facadeTex('apartment', 4)], brick: [facadeTex('brick', 5)], industrial: [facadeTex('industrial', 6)] };
  const roofMat = stdMat({ color: 0x55575a, roughness: 0.9 });
  const keepAway = [...DEPOTS.flatMap((d) => [[d.x, d.z, 34], [d.bx, d.bz, 40]]), [SPAWN.x, SPAWN.z, 30], [GARAGE_BLD.x, GARAGE_BLD.z, 30], [GAS.x, GAS.z, 34]];
  const free = (x, z, sx, sz, margin = 4) => {
    if (Math.abs(x) + sx / 2 > 452 || Math.abs(z) + sz / 2 > 452) return false;
    if (ROADS.some((r) => Math.abs(x - r) < sx / 2 + ROAD_W / 2 + 5 || Math.abs(z - r) < sz / 2 + ROAD_W / 2 + 5)) return false;
    if (keepAway.some(([kx, kz, d]) => Math.hypot(x - kx, z - kz) < d + Math.max(sx, sz) / 2)) return false;
    if (nearStruct(x, z, Math.hypot(sx, sz) / 2 + 3)) return false; // 高架橋、匝道底下不蓋房子
    return !boxes.some((b) => x + sx / 2 + margin > b.minx && x - sx / 2 - margin < b.maxx && z + sz / 2 + margin > b.minz && z - sz / 2 - margin < b.maxz);
  };
  const addBox = (x, z, sx, sz) => boxes.push({ minx: x - sx / 2, maxx: x + sx / 2, minz: z - sz / 2, maxz: z + sz / 2 });
  const building = (x, z, sx, sy, sz, type, ry = 0) => {
    const f = facades[type][Math.floor(R() * facades[type].length)];
    const map = f.map.clone(), emi = f.emi.clone();
    for (const t of [map, emi]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(sx / 6)) / 2, Math.max(1, Math.round(sy / 3)) / 4); t.needsUpdate = true; }
    const tint = type === 'office' ? 0xffffff : new THREE.Color().setHSL(0.08 + R() * 0.06, 0.15 + R() * 0.2, 0.75 + R() * 0.2);
    const mat = stdMat({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 0, color: tint, roughness: type === 'office' ? 0.2 : 0.85, metalness: type === 'office' ? 0.5 : 0.05 });
    nightMats.push({ mat, on: 0.85 });
    mesh(new THREE.BoxGeometry(sx, sy, sz), [mat, mat, roofMat, roofMat, mat, mat], x, sy / 2, z, root, { ry });
    mesh(new THREE.BoxGeometry(sx + 0.5, 0.5, sz + 0.5), roofMat, x, sy + 0.25, z, root, { ry });
    // 屋頂冷氣、水塔
    for (let i = 0; i < 2 + Math.floor(R() * 3); i++) mesh(new THREE.BoxGeometry(1.5 + R() * 2, 1 + R(), 1.5 + R() * 2), roofMat, x + (R() - 0.5) * (sx - 4), sy + 1, z + (R() - 0.5) * (sz - 4), root);
    addBox(x, z, sx, sz);
  };
  const shed = (x, z, sx, sy, sz, color, ry = 0, board = null, boardColor = '#1d3557') => {
    const t = corrugatedTex(color, Math.floor(R() * 100)); t.repeat.set(sx / 8, sy / 8);
    const mat = stdMat({ map: t, roughness: 0.55, metalness: 0.4 });
    mesh(new THREE.BoxGeometry(sx, sy, sz), [mat, mat, roofMat, roofMat, mat, mat], x, sy / 2, z, root, { ry });
    // 鐵捲門
    const door = stdMat({ map: corrugatedTex('#9aa0a6', 9), roughness: 0.5, metalness: 0.5 });
    const dw = Math.min(6, sx * 0.4);
    const dg = new THREE.BoxGeometry(dw, Math.min(5, sy * 0.6), 0.2);
    const d = new THREE.Mesh(dg, door);
    const c = Math.cos(ry), s = Math.sin(ry), off = sz / 2 + 0.05;
    d.position.set(x + s * off, Math.min(5, sy * 0.6) / 2, z + c * off); d.rotation.y = ry; root.add(d);
    if (board) {
      const bt = boardTex(board, boardColor);
      const bm = stdMat({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.5 });
      nightMats.push({ mat: bm, on: 1.2 });
      const bg = new THREE.BoxGeometry(Math.min(sx * 0.8, 14), 3, 0.3);
      const b = new THREE.Mesh(bg, [roofMat, roofMat, roofMat, roofMat, bm, bm]);
      b.position.set(x + s * (off + 0.2), sy + 1.8, z + c * (off + 0.2)); b.rotation.y = ry; b.castShadow = true; root.add(b);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2), roofMat); pole.position.set(x + s * off, sy + 0.5, z + c * off); root.add(pole);
    }
    addBox(x, z, Math.abs(c) > 0.5 ? sx : sz, Math.abs(c) > 0.5 ? sz : sx);
  };

  // ---------- 送貨點 ----------
  const apron = concreteTex(); apron.repeat.set(3, 3);
  const apronMat = stdMat({ map: apron, roughness: 0.85 });
  wetMats.push({ mat: apronMat, dry: 0.85, wet: 0.25, dryColor: new THREE.Color(1, 1, 1), wetColor: new THREE.Color(0.7, 0.7, 0.72) });
  const bayTex = canvasTex(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#f2c200'; ctx.lineWidth = 16; ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.save(); ctx.beginPath(); ctx.rect(12, 12, w - 24, 60); ctx.clip();
    for (let x = -60; x < w; x += 40) { ctx.fillStyle = '#f2c200'; ctx.beginPath(); ctx.moveTo(x, 72); ctx.lineTo(x + 20, 72); ctx.lineTo(x + 80, 12); ctx.lineTo(x + 60, 12); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(242,194,0,.9)'; ctx.font = `bold 70px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('裝卸區', w / 2, h / 2 + 25);
  });
  const bayMat = new THREE.MeshStandardMaterial({ map: bayTex, transparent: true, roughness: 0.7, depthWrite: false });
  const pg = new THREE.PlaneGeometry(24, 24); pg.rotateX(-Math.PI / 2);
  for (const d of DEPOTS) {
    if (d.kind === 'lumber') continue; // 林場在 highway.js 蓋
    mesh(pg, apronMat, d.x, 0.03, d.z, root, { cast: false });
    const bay = mesh(pg, bayMat, d.x, 0.05, d.z, root, { cast: false });
    const ry = Math.atan2(d.x - d.bx, d.z - d.bz); // 建築物朝向裝卸區
    bay.rotation.y = ry;
    const label = `${d.name}`;
    if (d.kind === 'port') {
      shed(d.bx - 4, d.bz, 26, 10, 14, '#8d9aa6', ry, label, d.color);
      const cc = ['#b03a2e', '#1f618d', '#239b56', '#d4ac0d', '#7d3c98', '#ca6f1e', '#566573'];
      const cg = new THREE.BoxGeometry(2.5, 2.6, 12);
      const ctex = cc.map((c, i) => { const t = corrugatedTex(c, i); t.repeat.set(3, 1); return stdMat({ map: t, roughness: 0.6, metalness: 0.35 }); });
      for (let i = 0; i < 6; i++) for (let k = 0; k < 1 + Math.floor(R() * 3); k++) {
        const x = -282 + (i % 3) * 3, z = 212 + Math.floor(i / 3) * 14;
        mesh(cg, ctex[Math.floor(R() * cc.length)], x, 1.3 + k * 2.6, z, root);
      }
      addBox(-279, 219, 10, 28);
      for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) mesh(cg, ctex[Math.floor(R() * cc.length)], -282 + i * 3, 1.3 + k * 2.6, 118, root);
      addBox(-277.5, 118, 13, 12);
      // 岸邊起重機
      const crane = stdMat({ color: 0xd35400, roughness: 0.6, metalness: 0.4 });
      for (const [x, z] of [[-292, 185], [-292, 197], [-276, 185], [-276, 197]]) mesh(new THREE.BoxGeometry(0.8, 28, 0.8), crane, x, 14, z, root);
      mesh(new THREE.BoxGeometry(22, 1.5, 1.2), crane, -284, 28, 185, root); mesh(new THREE.BoxGeometry(22, 1.5, 1.2), crane, -284, 28, 197, root);
      mesh(new THREE.BoxGeometry(1.2, 1.5, 34), crane, -284, 30, 191, root);
    } else if (d.kind === 'farm') {
      shed(d.bx, d.bz, 18, 9, 14, '#8e2b1f', ry, label, d.color);
      const silo = stdMat({ color: 0xcfd3d6, roughness: 0.4, metalness: 0.7 });
      for (const x of [d.bx + 15, d.bx + 21]) { mesh(new THREE.CylinderGeometry(2.6, 2.6, 13, 24), silo, x, 6.5, d.bz - 2, root); mesh(new THREE.ConeGeometry(2.8, 2, 24), silo, x, 14, d.bz - 2, root); addBox(x, d.bz - 2, 5.2, 5.2); }
      const ft = fieldTex(); ft.repeat.set(4, 2);
      const fm = stdMat({ map: ft, roughness: 1 });
      for (const [x, z] of [[105, -280], [215, -282], [118, -205], [205, -205]]) { const f = mesh(new THREE.PlaneGeometry(36, 26), fm, x, 0.03, z, root, { cast: false }); f.rotation.x = -Math.PI / 2; }
    } else if (d.kind === 'factory') {
      shed(d.bx + 2, d.bz, 30, 13, 18, '#9aa4ad', ry, label, d.color);
      const ch = stdMat({ color: 0x7b7d80, roughness: 0.8 });
      for (const z of [d.bz - 24, d.bz + 24]) { mesh(new THREE.CylinderGeometry(1.2, 1.5, 30, 16), ch, d.bx + 4, 15, z, root); mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.5, 16), stdMat({ map: stripeTex('#c62828', '#eeeeee', 6) }), d.bx + 4, 28, z, root); addBox(d.bx + 4, z, 3, 3); }
    } else if (d.kind === 'site') {
      shed(d.bx, d.bz - 4, 14, 7, 10, '#c9b18b', ry, label, d.color);
      GRAVEL_ZONES.push({ x: d.x - 30, z: d.z - 6, w: 34, d: 40 });
      const gm = stdMat({ map: gravelTex([150, 130, 100]), roughness: 1 }); gm.map.repeat.set(6, 6);
      const gp = mesh(new THREE.PlaneGeometry(34, 40), gm, d.x - 30, 0.03, d.z - 6, root, { cast: false }); gp.rotation.x = -Math.PI / 2;
      const sand = stdMat({ map: gravelTex([196, 170, 120]), roughness: 1 }); sand.map.repeat.set(3, 3);
      const sg = stdMat({ map: gravelTex([120, 118, 112]), roughness: 1 }); sg.map.repeat.set(3, 3);
      for (const [x, z, r, h, m] of [[-198, -118, 6, 4.5, sand], [-198, -100, 5, 3.8, sg], [-186, -96, 4, 3, sand]]) { mesh(new THREE.ConeGeometry(r, h, 20), m, x, h / 2, z, root); addBox(x, z, r * 1.2, r * 1.2); }
      // 鋼筋堆
      const rebar = stdMat({ color: 0x6b4a33, roughness: 0.6, metalness: 0.7 });
      const rg = new THREE.CylinderGeometry(0.08, 0.08, 12, 6); rg.rotateX(Math.PI / 2);
      for (let i = 0; i < 30; i++) mesh(rg, rebar, -206 + (i % 10) * 0.2, 0.1 + Math.floor(i / 10) * 0.18, -100, root, { cast: false });
      // 怪手
      const yel = stdMat({ color: 0xf2b705, roughness: 0.45, metalness: 0.3 });
      const ex = new THREE.Group(); ex.position.set(-182, 0, -116); ex.rotation.y = 0.8; root.add(ex);
      mesh(new THREE.BoxGeometry(3.2, 1, 4.6), stdMat({ color: 0x222222, roughness: 0.8 }), 0, 0.5, 0, ex);
      mesh(new THREE.BoxGeometry(2.8, 1.4, 3.2), yel, 0, 1.7, -0.3, ex);
      mesh(new THREE.BoxGeometry(1.2, 1.4, 1.2), stdMat({ color: 0x1a2630, roughness: 0.1, metalness: 0.5 }), -0.6, 2.9, 0.4, ex);
      const arm = mesh(new THREE.BoxGeometry(0.5, 0.5, 5), yel, 0.6, 3.3, 2.8, ex); arm.rotation.x = -0.45;
      const arm2 = mesh(new THREE.BoxGeometry(0.4, 0.4, 3.5), yel, 0.6, 3.3, 5.8, ex); arm2.rotation.x = 0.9;
      mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), stdMat({ color: 0x333333, metalness: 0.7, roughness: 0.4 }), 0.6, 1.2, 6.6, ex);
      addBox(-182, -116, 6, 6);
      // 塔吊
      const tc = stdMat({ color: 0xe8b500, roughness: 0.5, metalness: 0.5 });
      mesh(new THREE.BoxGeometry(1.6, 40, 1.6), tc, -205, 20, -135, root);
      mesh(new THREE.BoxGeometry(34, 1.2, 1.2), tc, -195, 40, -135, root);
      mesh(new THREE.BoxGeometry(3, 2.5, 3), stdMat({ color: 0x888888 }), -216, 38.5, -135, root);
      addBox(-205, -135, 3, 3);
      // 紐澤西護欄
      const bar = stdMat({ map: stripeTex('#d62828', '#f2f2f2', 6), roughness: 0.7 });
      for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(0.6, 0.9, 2), bar, -146, 0.45, -128 + i * 2.2, root);
    } else {
      // 商店：一樓玻璃、上面住家
      const ofs = facades.apartment[0];
      const mm = stdMat({ map: ofs.map.clone(), emissiveMap: ofs.emi.clone(), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8 });
      mm.map.wrapS = mm.map.wrapT = mm.emissiveMap.wrapS = mm.emissiveMap.wrapT = THREE.RepeatWrapping; mm.map.repeat.set(1.5, 1); mm.emissiveMap.repeat.set(1.5, 1); mm.map.needsUpdate = mm.emissiveMap.needsUpdate = true;
      nightMats.push({ mat: mm, on: 1.3 });
      const g = new THREE.Group(); g.position.set(d.bx, 0, d.bz); g.rotation.y = ry; root.add(g);
      mesh(new THREE.BoxGeometry(18, 9, 14), [mm, mm, roofMat, roofMat, mm, mm], 0, 7.5, 0, g);
      const glass = new THREE.MeshPhysicalMaterial({ color: 0x223440, roughness: 0.05, metalness: 0.2, emissive: 0xfff0d0, emissiveIntensity: 0.05, clearcoat: 1 });
      nightMats.push({ mat: glass, on: 0.6 });
      mesh(new THREE.BoxGeometry(18, 3, 14), glass, 0, 1.5, 0, g);
      mesh(new THREE.BoxGeometry(19, 0.4, 2), stdMat({ color: d.color, roughness: 0.5 }), 0, 3.2, 7.5, g);
      const bt = boardTex(d.name, d.color);
      const bm = stdMat({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.15 }); nightMats.push({ mat: bm, on: 1.5 });
      const b = mesh(new THREE.BoxGeometry(10, 2.4, 0.3), [roofMat, roofMat, roofMat, roofMat, bm, roofMat], 0, 4.8, 7.2, g);
      b.castShadow = false;
      addBox(d.bx, d.bz, 18, 18);
    }
  }

  // ---------- 加油站 ----------
  {
    mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), apronMat, GAS.x, 0.03, GAS.z, root, { cast: false });
    const white = stdMat({ color: 0xf0f0f0, roughness: 0.4 });
    const red = stdMat({ color: 0xc62828, roughness: 0.4 });
    mesh(new THREE.BoxGeometry(18, 0.8, 13), white, GAS.x, 6.4, GAS.z, root);
    mesh(new THREE.BoxGeometry(18.2, 0.5, 13.2), red, GAS.x, 6.0, GAS.z, root);
    const under = stdMat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.0 }); nightMats.push({ mat: under, on: 2.5 });
    for (const dx of [-5, 0, 5]) mesh(new THREE.BoxGeometry(1.5, 0.05, 8), under, GAS.x + dx, 5.73, GAS.z, root, { cast: false });
    for (const [dx, dz] of [[-7, -4.5], [7, -4.5], [-7, 4.5], [7, 4.5]]) mesh(new THREE.BoxGeometry(0.5, 6, 0.5), white, GAS.x + dx, 3, GAS.z + dz, root);
    for (const dx of [-4, 4]) {
      mesh(new THREE.BoxGeometry(1.2, 0.3, 4), white, GAS.x + dx, 0.15, GAS.z, root);
      mesh(new THREE.BoxGeometry(0.9, 2, 0.6), red, GAS.x + dx, 1.3, GAS.z, root);
      mesh(new THREE.BoxGeometry(0.7, 0.4, 0.62), stdMat({ color: 0x111111, emissive: 0x30ff60, emissiveIntensity: 0.6 }), GAS.x + dx, 1.9, GAS.z, root);
    }
    shed(GAS.x + 20, GAS.z, 10, 5, 14, '#e8e8e8', -Math.PI / 2, '便利商店', '#2e7d32');
    const bt = boardTex('⛽ 加油站', '#c62828');
    const bm = stdMat({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.2 }); nightMats.push({ mat: bm, on: 1.5 });
    mesh(new THREE.BoxGeometry(0.5, 9, 0.5), white, GAS.x - 12, 4.5, GAS.z - 12, root);
    mesh(new THREE.BoxGeometry(6, 1.6, 0.3), bm, GAS.x - 12, 9.5, GAS.z - 12, root, { ry: Math.PI / 2 });
  }
  // 改裝廠（車庫外觀）
  shed(GARAGE_BLD.x, GARAGE_BLD.z, 16, 9, 20, '#3d4a57', -Math.PI / 2, '🔧 改裝廠', '#1d3557');

  // ---------- 隨機大樓 ----------
  let placed = 0, tries = 0;
  while (placed < 165 && tries < 9000) {
    tries++;
    const x = (R() * 2 - 1) * 445, z = (R() * 2 - 1) * 445;
    const inner = Math.max(Math.abs(x), Math.abs(z)) < 170;
    const sx = 12 + R() * 16, sz = 12 + R() * 16;
    if (!free(x, z, sx, sz)) continue;
    const dc = Math.hypot(x, z);
    let type, sy;
    if (inner) { type = R() < 0.5 ? 'office' : R() < 0.6 ? 'apartment' : 'brick'; sy = type === 'office' ? 24 + R() * Math.max(10, 70 - dc * 0.3) : 12 + R() * 18; }
    else if (R() < 0.45) { shed(x, z, sx + 6, 7 + R() * 5, sz + 6, ['#8d99a6', '#a3a9ad', '#6f7f8f', '#b0a490'][Math.floor(R() * 4)], 0); placed++; continue; }
    else { type = R() < 0.5 ? 'apartment' : 'brick'; sy = 9 + R() * 12; }
    building(x, z, sx, sy, sz, type);
    placed++;
  }

  // ---------- 樹 ----------
  const pine = mergeGeometries([new THREE.ConeGeometry(2.4, 4.5, 8).translate(0, 4.5, 0), new THREE.ConeGeometry(1.9, 3.6, 8).translate(0, 6.6, 0), new THREE.ConeGeometry(1.3, 2.8, 8).translate(0, 8.4, 0)]);
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3, 6).translate(0, 1.5, 0);
  const round = new THREE.IcosahedronGeometry(2.6, 1).translate(0, 5, 0);
  const pineM = stdMat({ color: 0x2c4a2a, roughness: 0.95 }), roundM = stdMat({ color: 0x4a6b2f, roughness: 0.95 }), trunkM = stdMat({ color: 0x5a4030, roughness: 1 });
  const placeTrees = (count, area, minH, maxH, geo, mat) => {
    const crowns = new THREE.InstancedMesh(geo, mat, count), trunks = new THREE.InstancedMesh(trunk, trunkM, count);
    crowns.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0, t = 0;
    while (n < count && t < count * 30) {
      t++;
      const x = (R() * 2 - 1) * area, z = (R() * 2 - 1) * area, h = heightAt(x, z);
      if (h < minH || h > maxH) continue;
      if (nearHighway(x, z)) continue;
      if (nearStruct(x, z, 2.5)) continue; // 樹不要長在高架和匝道上
      if (Math.max(Math.abs(x), Math.abs(z)) < 465) {
        if (ROADS.some((r) => Math.abs(x - r) < 12 || Math.abs(z - r) < 12)) continue;
        if (keepAway.some(([kx, kz, d]) => Math.hypot(x - kx, z - kz) < d * 0.7)) continue;
        if (boxes.some((b) => x > b.minx - 3 && x < b.maxx + 3 && z > b.minz - 3 && z < b.maxz + 3)) continue;
        if (GRAVEL_ZONES.some((g) => Math.abs(x - g.x) < g.w / 2 + 2 && Math.abs(z - g.z) < g.d / 2 + 2)) continue;
      }
      const sc = 0.7 + R() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28); s.set(sc, sc * (0.85 + R() * 0.4), sc); p.set(x, h - 0.2, z);
      m4.compose(p, q, s); crowns.setMatrixAt(n, m4); trunks.setMatrixAt(n, m4);
      col.setHSL(0.25 + R() * 0.08, 0.35 + R() * 0.2, 0.5 + R() * 0.2); crowns.setColorAt(n, col);
      n++;
    }
    crowns.count = trunks.count = n;
    root.add(crowns, trunks);
  };
  placeTrees(quality === 'low' ? 450 : 850, 455, -1, 1, round, roundM);
  placeTrees(quality === 'low' ? 900 : 2200, 1200, 8, 160, pine, pineM);

  // ---------- 城外國道、收費站、隧道、林場 ----------
  const lampSpots = [];
  buildHighway(root, {
    stdMat, colorAt: terrainColor, bayMat, lamps: lampSpots, quality,
    wet: (mat, dry, wet, wetColor) => wetMats.push({ mat, dry, wet, dryColor: mat.color.clone(), wetColor }),
    night: (mat, on) => nightMats.push({ mat, on }),
  });
  // v22：東門環狀交流道（國道入口）
  buildElevated(root, {
    stdMat, onRoad, piers: PIERS,
    wet: (mat, dry, wet, wetColor) => wetMats.push({ mat, dry, wet, dryColor: mat.color.clone(), wetColor }),
    night: (mat, on) => nightMats.push({ mat, on }),
  });
  for (const p of PIERS) if (inCity(p.x, p.z)) boxes.push({ minx: p.x - p.sx / 2, maxx: p.x + p.sx / 2, minz: p.z - p.sz / 2, maxz: p.z + p.sz / 2, top: p.top ?? 7 }); // top＝橋面高度：在橋上的車不會撞到

  // ---------- 路燈 ----------
  for (const line of ROADS) {
    const inner = Math.abs(line) === 80, step = inner ? 34 : 50;
    for (let a = -450, i = 0; a <= 450; a += step, i++) {
      if (ROADS.some((r) => Math.abs(a - r) < 12)) continue;
      const side = inner ? (i % 2 ? 1 : -1) : 1;
      const off = ROAD_W / 2 + (inner ? 2.2 : 1.6);
      if (DEPOTS.some((d) => Math.hypot(line + side * off - d.x, a - d.z) < 14 || Math.hypot(a - d.x, line + side * off - d.z) < 14)) continue;
      lampSpots.push({ x: line + side * off, z: a, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
      lampSpots.push({ x: a, z: line + side * off, ry: side > 0 ? Math.PI : 0 });
    }
  }
  // 市區路燈不要立在高架橋下、匝道上（路燈有 9 公尺高會穿過橋面）
  for (let i = lampSpots.length - 1; i >= 0; i--) { const l = lampSpots[i]; if (l.y === undefined && nearStruct(l.x, l.z, 2.5)) lampSpots.splice(i, 1); }
  const poleG = new THREE.CylinderGeometry(0.12, 0.18, 9, 8).translate(0, 4.5, 0);
  const armG = new THREE.BoxGeometry(0.12, 0.12, 2.6).translate(0, 8.9, 1.2);
  const headG = new THREE.BoxGeometry(0.5, 0.18, 0.9).translate(0, 8.82, 2.4);
  const poleM = stdMat({ color: 0x7c8288, roughness: 0.5, metalness: 0.7 });
  const headM = stdMat({ color: 0xdddddd, emissive: 0xffd9a0, emissiveIntensity: 0 }); nightMats.push({ mat: headM, on: 6 });
  const poles = new THREE.InstancedMesh(poleG, poleM, lampSpots.length), arms = new THREE.InstancedMesh(armG, poleM, lampSpots.length), heads = new THREE.InstancedMesh(headG, headM, lampSpots.length);
  poles.castShadow = true;
  const poolTex = ledTex();
  const poolM = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffcf8a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const poolG = new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2);
  lampPools = new THREE.InstancedMesh(poolG, poolM, lampSpots.length); lampPools.visible = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  lampSpots.forEach((l, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.ry);
    const y = l.y || 0;
    m4.compose(new THREE.Vector3(l.x, y, l.z), q, one);
    poles.setMatrixAt(i, m4); arms.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
    const hx = l.x + Math.sin(l.ry) * 2.4, hz = l.z + Math.cos(l.ry) * 2.4;
    lampHeads.push(new THREE.Vector3(hx, y + 8.6, hz));
    m4.makeTranslation(hx, y + 0.06, hz); lampPools.setMatrixAt(i, m4);
  });
  root.add(poles, arms, heads, lampPools);

  // ---------- 紅綠燈 ----------
  for (const axis of ['z', 'x']) for (const c of ['r', 'y', 'g']) {
    tlMats[axis][c] = stdMat({ color: 0x111111, emissive: c === 'r' ? 0xff2020 : c === 'y' ? 0xffb000 : 0x20ff60, emissiveIntensity: 0.03 });
  }
  const tlPole = stdMat({ color: 0x444a50, roughness: 0.5, metalness: 0.6 });
  const lens = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14).rotateX(Math.PI / 2);
  for (const cx of LIGHT_LINES) for (const cz of LIGHT_LINES) {
    for (const [dx, dz, ry, axis] of [[-8.5, -8.5, 0, 'z'], [8.5, 8.5, Math.PI, 'z'], [-8.5, 8.5, Math.PI / 2, 'x'], [8.5, -8.5, -Math.PI / 2, 'x']]) {
      const g = new THREE.Group(); g.position.set(cx + dx, 0, cz + dz); g.rotation.y = ry; root.add(g);
      mesh(new THREE.CylinderGeometry(0.12, 0.15, 6, 8), tlPole, 0, 3, 0, g);
      mesh(new THREE.BoxGeometry(4.2, 0.1, 0.1), tlPole, 2.0, 5.9, 0, g);
      mesh(new THREE.BoxGeometry(0.5, 1.3, 0.35), stdMat({ color: 0x1a1a1a }), 3.9, 5.3, 0, g);
      ['r', 'y', 'g'].forEach((c, i) => { const l = new THREE.Mesh(lens, tlMats[axis][c]); l.position.set(3.9, 5.7 - i * 0.4, -0.2); g.add(l); });
    }
  }

  // ---------- 室內改裝廠（在地底下的展示間） ----------
  {
    const S = SHOWROOM, g = new THREE.Group(); g.position.set(S.x, S.y, S.z); root.add(g);
    const fl = concreteTex(); fl.repeat.set(5, 4);
    const floor = stdMat({ map: fl, color: 0x8a9096, roughness: 0.25, metalness: 0.1 });
    mesh(new THREE.BoxGeometry(34, 0.2, 48), floor, 0, -0.1, 0, g, { cast: false });
    const lineM = stdMat({ color: 0xf2c200, roughness: 0.6 });
    for (const x of [-6.5, 6.5]) mesh(new THREE.BoxGeometry(0.2, 0.02, 40), lineM, x, 0.01, 0, g, { cast: false });
    // 中央車輛展示區：地坪環形燈帶與定位刻度，保持地面齊平不影響車輪高度
    const stageDark = stdMat({ color: 0x202830, roughness: 0.42, metalness: 0.55 });
    const stageRing = stdMat({ color: 0xe7a52e, emissive: 0x8a4d08, emissiveIntensity: 0.75, roughness: 0.28, metalness: 0.65 });
    mesh(new THREE.CylinderGeometry(8.6, 8.6, 0.035, 96), stageDark, 0, 0.015, 5, g, { cast: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8.25, 0.055, 8, 120), stageRing); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.055, 5); ring.receiveShadow = false; g.add(ring);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(7.65, 0.018, 6, 120), lineM); innerRing.rotation.x = -Math.PI / 2; innerRing.position.set(0, 0.045, 5); g.add(innerRing);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.018, 0.055), stageRing);
      tick.position.set(Math.cos(a) * 8.25, 0.06, 5 + Math.sin(a) * 8.25); tick.rotation.y = -a; g.add(tick);
    }
    const floorLabel = boardTex('CUSTOM TRUCK　/　SHOWROOM', '#101820', '#e9b653', 1024, 128);
    const floorSign = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 1.05), new THREE.MeshBasicMaterial({ map: floorLabel, transparent: true, depthWrite: false }));
    floorSign.rotation.x = -Math.PI / 2; floorSign.position.set(0, 0.035, -16.5); g.add(floorSign);
    const wt = corrugatedTex('#c7ccd1', 3); wt.repeat.set(6, 2);
    const wall = stdMat({ map: wt, roughness: 0.6, metalness: 0.3 });
    mesh(new THREE.BoxGeometry(34, 12, 0.4), wall, 0, 6, -24, g); mesh(new THREE.BoxGeometry(34, 12, 0.4), wall, 0, 6, 24, g);
    mesh(new THREE.BoxGeometry(0.4, 12, 48), wall, -17, 6, 0, g); mesh(new THREE.BoxGeometry(0.4, 12, 48), wall, 17, 6, 0, g);
    mesh(new THREE.BoxGeometry(34, 0.4, 48), stdMat({ color: 0x3a3d40, roughness: 0.8 }), 0, 12, 0, g);
    const panel = stdMat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3 });
    for (const z of [-15, -5, 5, 15]) for (const x of [-7, 7]) mesh(new THREE.BoxGeometry(3, 0.1, 1.2), panel, x, 11.7, z, g, { cast: false });
    const bt = boardTex('卡車改裝王　改裝廠', '#1d3557', '#ffffff', 1024, 160);
    mesh(new THREE.BoxGeometry(16, 2.5, 0.1), stdMat({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.4 }), 0, 8, -23.7, g);
    const accent = stdMat({ color: 0x263746, emissive: 0x102b3d, emissiveIntensity: 0.55, metalness: 0.65, roughness: 0.35 });
    for (const x of [-16.65, 16.65]) mesh(new THREE.BoxGeometry(0.08, 9.5, 0.12), accent, x, 6, 0, g, { cast: false });
    for (const z of [-18, -12, 12, 18]) mesh(new THREE.BoxGeometry(0.08, 0.08, 3.8), stageRing, -16.72, 8.8, z, g, { cast: false });
    const red = stdMat({ color: 0xb71c1c, roughness: 0.35, metalness: 0.4 });
    for (let i = 0; i < 4; i++) mesh(new RoundedBoxGeometry(2, 1.8, 0.8, 2, 0.05), red, -12 + i * 2.2, 0.9, -23.2, g);
    const tireM = stdMat({ color: 0x151515, roughness: 0.9 });
    const torusTires = [];
    for (let k = 0; k < 4; k++) torusTires.push(mesh(new THREE.TorusGeometry(0.42, 0.18, 10, 24).rotateX(Math.PI / 2), tireM, 13, 0.2 + k * 0.36, -20, g));
    for (let k = 0; k < 3; k++) torusTires.push(mesh(new THREE.TorusGeometry(0.42, 0.18, 10, 24).rotateX(Math.PI / 2), tireM, 14.2, 0.2 + k * 0.36, -18.6, g));
    // 實拍道具（Poly Haven，CC0，models/props/）：背景載入，載不到就維持原樣
    // [檔名, x, z, 轉向, 放在多高, 放大倍數, 平放（輪胎）]
    const PROPS = [
      ['metal_toolbox', -11.6, -23.0, 0.2, 1.8, 1.6], ['metal_toolbox', -7.2, -23.0, -0.15, 1.8, 1.6],
      ['portable_welding_cart', -15.3, -16.5, 0.6, 0, 1],
      ['Barrel_01', 15.6, 9.5, 0, 0, 1.15], ['Barrel_01', 15.7, 10.9, 1, 0, 1.15], ['Barrel_01', 14.5, 10.2, 2, 0, 1.15],
      ['plastic_crate_01', -15.6, 12.0, 0, 0, 1.6], ['plastic_crate_01', -15.6, 12.7, 0.1, 0, 1.6], ['plastic_crate_01', -15.6, 12.35, -0.1, 0.42, 1.6],
    ];
    for (let k = 0; k < 4; k++) PROPS.push(['old_tyre', 13, -20, k * 0.7, k, 1.8, true]);
    for (let k = 0; k < 3; k++) PROPS.push(['old_tyre', 14.2, -18.6, k * 1.1, k, 1.8, true]);
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const L = new GLTFLoader(), cache = {};
      const get = (n) => cache[n] || (cache[n] = L.loadAsync(`models/props/${n}.glb`).then((gl) => {
        gl.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return gl.scene;
      }));
      for (const [n, x, z, ry, y0, sc, flat] of PROPS) get(n).then((model) => {
        const o = new THREE.Group(), m = model.clone(true); o.add(m);
        m.scale.setScalar(sc);
        if (flat) m.rotation.x = Math.PI / 2;
        o.rotation.y = ry; o.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(o);
        // 輪胎：y0＝第幾層（照實際厚度往上疊）；其他：y0＝放在多高（公尺）
        const y = flat ? y0 * (b.max.y - b.min.y) : y0;
        o.position.set(x, y - b.min.y, z); g.add(o);
        if (n === 'old_tyre') torusTires.forEach((t) => (t.visible = false));
      }).catch((e) => console.warn('改裝廠道具載入失敗：', n, e));
    }).catch(() => {});
    const yel = stdMat({ color: 0xf2b705, roughness: 0.5, metalness: 0.4 });
    for (const [x, z] of [[-4, -12], [4, -12], [-4, 12], [4, 12]]) mesh(new THREE.BoxGeometry(0.5, 4, 0.5), yel, x * 2.6, 2, z * 1.6, g);
    for (const [x, y, z] of [[-8, 10, -12], [8, 10, -12], [-8, 10, 12], [8, 10, 12], [0, 10, 0]]) {
      const l = new THREE.PointLight(0xfff4e6, 80, 40, 1.4); l.position.set(S.x + x, S.y + y, S.z + z); l.visible = false; scene.add(l); showroomLights.push(l);
    }
  }

  return root;
}
