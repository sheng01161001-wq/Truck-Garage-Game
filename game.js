// 卡車改裝王 v2（寫實版）— 主程式：存檔、操作、重車物理、送貨任務、鏡頭、儀表、改裝車庫
import * as THREE from 'three';
import {
  buildWorld, boxes, DEPOTS, GAS, GARAGE_BLD, SPAWN, SHOWROOM, WORLD, surfaceAt,
  setWet, setNight, lampPositions, updateTrafficLights, setShowroomLights,
} from './js/world.js';
import { buildRig, setTruckLights } from './js/truck.js';
import { createEnv } from './js/env.js';
import { createTraffic } from './js/traffic.js';
import { Snd } from './js/audio.js';
import { drawCluster, drawMinimap, computeRoute } from './js/hud.js';
import { clamp, wrapAngle } from './js/util.js';
import { groundAt, surfaceY, hwBlocked, hwProject, inCity, inTunnel, nearTunnel, updateHighway, TOLL_S, TUNNEL_LAMPS, PTS as HW_PTS } from './js/highway.js';

const VERSION = 'v3';
const $ = (s) => document.querySelector(s);
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');

// ================= 存檔 =================
const SAVE_KEY = 'truckGarage_save_v1';
const DEFAULT_TRUCK = {
  cabStyle: 'euro', trailerType: 'box',
  cabColor: '#b71c1c', paint: 'normal', pattern: 'none', patternColor: '#ffd60a',
  rims: 'std', bumper: 'std', lightbar: 'off', stacks: 'off', visor: 'off', spoiler: 'off',
  horn: 'normal', glow: 'off',
  trailerColor: '#e9ecef', trailerPattern: 'none', trailerPatColor: '#1d3557', name: '我的卡車',
};
const CATALOG = {
  cabStyle: { title: '車頭款式', items: [
    { id: 'euro', name: '歐式平頭', icon: '🚛', price: 0 },
    { id: 'us', name: '美式長鼻', icon: '🚚', price: 400 },
  ] },
  trailerType: { title: '車斗種類', items: [
    { id: 'box', name: '廂型貨櫃', icon: '📦', price: 0 },
    { id: 'flat', name: '平板車', icon: '🪜', price: 200 },
    { id: 'dump', name: '砂石斗', icon: '⛰️', price: 300 },
  ] },
  paint: { title: '烤漆種類', items: [
    { id: 'normal', name: '原廠亮漆', icon: '🎨', price: 0 },
    { id: 'matte', name: '消光霧面', icon: '🌫️', price: 80 },
    { id: 'metal', name: '金屬亮光', icon: '✨', price: 120 },
    { id: 'pearl', name: '珍珠變色', icon: '💎', price: 300 },
    { id: 'neon', name: '霓虹發光', icon: '🌟', price: 400 },
    { id: 'chrome', name: '電鍍鏡面', icon: '🔮', price: 500 },
    { id: 'chameleon', name: '變色龍', icon: '🦎', price: 800 },
  ] },
  pattern: { title: '彩繪圖案', items: [
    { id: 'none', name: '不要彩繪', icon: '⬜', price: 0 },
    { id: 'dots', name: '圓點點', icon: '🔵', price: 100 },
    { id: 'stripes', name: '賽車條紋', icon: '🏁', price: 120 },
    { id: 'checker', name: '賽車格子', icon: '♟️', price: 150 },
    { id: 'camo', name: '迷彩', icon: '🎖️', price: 150 },
    { id: 'stars', name: '星星', icon: '⭐', price: 150 },
    { id: 'lightning', name: '閃電', icon: '⚡', price: 180 },
    { id: 'flames', name: '火焰', icon: '🔥', price: 200 },
    { id: 'tiger', name: '老虎紋', icon: '🐯', price: 220 },
    { id: 'rainbow', name: '彩虹', icon: '🌈', price: 250 },
  ] },
  bumper: { title: '保險桿', items: [
    { id: 'std', name: '原廠', icon: '▬', price: 0 },
    { id: 'chromeb', name: '電鍍', icon: '🪙', price: 120 },
    { id: 'bull', name: '鐵牛欄', icon: '🐂', price: 150 },
  ] },
  rims: { title: '輪框', items: [
    { id: 'std', name: '原廠鋼圈', icon: '⚙️', price: 0 },
    { id: 'color', name: '同車身色', icon: '🎡', price: 100 },
    { id: 'chrome', name: '拋光鋁圈', icon: '💿', price: 150 },
    { id: 'gold', name: '黃金', icon: '📀', price: 300 },
  ] },
  stacks: { title: '直立排氣管', items: [{ id: 'off', name: '不裝', icon: '✖️', price: 0 }, { id: 'on', name: '電鍍排氣管', icon: '🎺', price: 180 }] },
  lightbar: { title: '車頂 LED 燈條', items: [{ id: 'off', name: '不裝', icon: '✖️', price: 0 }, { id: 'on', name: 'LED 燈條', icon: '🚨', price: 120 }] },
  visor: { title: '遮陽板', items: [{ id: 'off', name: '不裝', icon: '✖️', price: 0 }, { id: 'on', name: '遮陽板', icon: '🧢', price: 80 }] },
  spoiler: { title: '車頂導流罩', items: [{ id: 'off', name: '不裝', icon: '✖️', price: 0 }, { id: 'on', name: '導流罩', icon: '🛸', price: 100 }] },
  horn: { title: '喇叭聲音（點了會叫）', items: [
    { id: 'normal', name: '氣喇叭', icon: '📯', price: 0 },
    { id: 'funny', name: '搞笑喇叭', icon: '🤡', price: 80 },
    { id: 'train', name: '火車喇叭', icon: '🚂', price: 100 },
    { id: 'cow', name: '牛叫喇叭', icon: '🐄', price: 120 },
  ] },
  glow: { title: '底盤燈', items: [
    { id: 'off', name: '不裝', icon: '✖️', price: 0 },
    { id: 'blue', name: '藍色', icon: '💙', price: 200 },
    { id: 'pink', name: '粉紅', icon: '💗', price: 200 },
    { id: 'green', name: '綠色', icon: '💚', price: 200 },
    { id: 'rainbow', name: '彩虹閃爍', icon: '🌈', price: 350 },
  ] },
};
const catList = (cat) => CATALOG[cat === 'trailerPattern' ? 'pattern' : cat].items;
const ownKey = (cat, id) => (cat === 'trailerPattern' ? 'pattern' : cat) + ':' + id;
const itemOf = (cat, id) => catList(cat).find((i) => i.id === id);
function isOwned(cat, id) { const it = itemOf(cat, id); return !!it && (it.price === 0 || save.owned.includes(ownKey(cat, id))); }
const ITEM_KEYS = ['cabStyle', 'trailerType', 'paint', 'pattern', 'bumper', 'rims', 'stacks', 'lightbar', 'visor', 'spoiler', 'horn', 'glow', 'trailerPattern'];
const COLOR_KEYS = ['cabColor', 'patternColor', 'trailerColor', 'trailerPatColor'];
const PALETTE = ['#b71c1c', '#e65100', '#f9a825', '#2e7d32', '#00695c', '#0277bd', '#1a237e', '#4a148c',
  '#ad1457', '#f5f5f5', '#9e9e9e', '#37474f', '#111111', '#5d4037', '#c0a062', '#00e5ff'];

function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  const out = { coins: 500, owned: [], deliveries: 0, truck: { ...DEFAULT_TRUCK }, fuel: 1, damage: 0, dirt: 0.15,
    settings: { time: 'day', weather: 'clear', quality: IS_TOUCH ? 'low' : 'high' } };
  if (s && typeof s === 'object') {
    if (Number.isFinite(s.coins) && s.coins >= 0) out.coins = Math.floor(s.coins);
    if (Array.isArray(s.owned)) out.owned = s.owned.filter((x) => typeof x === 'string');
    if (Number.isFinite(s.deliveries)) out.deliveries = s.deliveries;
    for (const k of ['fuel', 'damage', 'dirt']) if (Number.isFinite(s[k])) out[k] = clamp(s[k], 0, 1);
    if (s.truck && typeof s.truck === 'object') {
      for (const k of COLOR_KEYS) if (/^#[0-9a-f]{6}$/i.test(s.truck[k])) out.truck[k] = s.truck[k];
      if (typeof s.truck.name === 'string') out.truck.name = s.truck.name.slice(0, 8);
      for (const k of ITEM_KEYS) if (typeof s.truck[k] === 'string') out.truck[k] = s.truck[k];
    }
    if (s.settings && typeof s.settings === 'object') {
      if (['day', 'dusk', 'night'].includes(s.settings.time)) out.settings.time = s.settings.time;
      if (['clear', 'rain', 'fog'].includes(s.settings.weather)) out.settings.weather = s.settings.weather;
      if (['high', 'low'].includes(s.settings.quality)) out.settings.quality = s.settings.quality;
    }
  }
  return out;
}
let save = loadSave();
for (const k of ITEM_KEYS) if (!isOwned(k, save.truck[k])) save.truck[k] = DEFAULT_TRUCK[k];
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 存不了就算了 */ } }
let draft = { ...save.truck };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ================= 3D =================
const HIGH = save.settings.quality === 'high';
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, HIGH ? 1.75 : 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = HIGH ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 3000);
const env = createEnv(renderer, scene);
if (!HIGH) env.sun.shadow.mapSize.set(1024, 1024);
buildWorld(scene, save.settings.quality);
const traffic = createTraffic(scene, HIGH ? 16 : 10, HIGH ? 5 : 3);

// 晚上：在卡車附近的路燈放真的燈光（最多 6 盞）
const lampLights = [];
for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffc98a, 0, 30, 1.6); scene.add(l); lampLights.push(l); }

// ================= 遊戲狀態 =================
const S = {
  mode: 'title', x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading, trailerHeading: SPAWN.heading,
  v: 0, steer: 0, thr: 0, brk: 0, gear: 1, shiftT: 0, rpm: 600, revHold: 0,
  wheelAngle: 0, travelled: 0, roll: 0, rollV: 0, pitch: 0, pitchV: 0, bump: 0, lastV: 0,
  lights: false, ind: null, blinkT: 0, blink: false, indArmed: false, wipers: false, wiperT: 0,
  cam: 0, camYaw: 0, camYawT: 0, shake: 0, cine: null,
  gAng: 0.9, gDrag: null, gTab: 'model', pending: null,
  mission: null, hint: '', time: 0, temp: 0.5, hornT: 0, bumpsThisJob: 0, loadT: 0,
  route: null, routeT: 0, dirtDrawn: save.dirt, fuelCoinAcc: 0, wasStopped: true, lastSurface: 'road',
  y: 0, yA: 0, grade: 0, tunNear: false, tollSide: null,
};
let rig = null;
function rebuildRig(cfg) {
  if (rig) rig.dispose();
  rig = buildRig(cfg, save.dirt);
  S.rigCfg = JSON.stringify(cfg);
  scene.add(rig.tractor, rig.trailer);
  rig.setLoaded(!!(S.mission && S.mission.stage === 'deliver'));
  S.dirtDrawn = save.dirt;
  placeRig();
}
function inGarage() { return S.mode === 'garage'; }
function placeRig() {
  const g = inGarage();
  const x = g ? SHOWROOM.x : S.x, z = g ? SHOWROOM.z + 5 : S.z, y = g ? SHOWROOM.y : S.y;
  const h = g ? 0 : S.heading, th = g ? 0 : S.trailerHeading;
  // 上下坡：車頭、拖車跟著路面抬頭／低頭
  const pT = g ? 0 : -Math.atan(S.grade), pTr = g ? 0 : -Math.atan((S.y - S.yA) / LT);
  rig.tractor.rotation.order = 'YXZ'; rig.trailer.rotation.order = 'YXZ';
  rig.tractor.position.set(x, y + S.bump, z);
  rig.tractor.rotation.set(S.pitch * 0.25 + pT, h, S.roll * 0.25);
  rig.cab.rotation.set(S.pitch, 0, S.roll);
  rig.trailer.position.set(x, y + S.bump * 0.6, z);
  rig.trailer.rotation.set(pTr, th, 0);
  rig.trailerBody.rotation.set(0, 0, S.roll * 0.6);
}

// ================= 送貨任務 =================
const CARGOS = [
  { n: '🍌 香蕉', t: 14 }, { n: '🚗 小汽車', t: 10 }, { n: '🍦 冰淇淋', t: 12 }, { n: '🔩 鋼筋', t: 24 }, { n: '🧱 水泥', t: 22 },
  { n: '🧸 玩具', t: 6 }, { n: '🍉 西瓜', t: 16 }, { n: '🦖 恐龍蛋', t: 8 }, { n: '🏗️ 砂石', t: 26 }, { n: '🎁 禮物', t: 5 },
  { n: '🌲 木頭', t: 20 }, { n: '🐟 魚', t: 15 },
];
function newMission(fromIdx = null) {
  const r = Math.random;
  const a = fromIdx ?? Math.floor(r() * DEPOTS.length);
  let b; do { b = Math.floor(r() * DEPOTS.length); } while (b === a);
  const A = DEPOTS[a], B = DEPOTS[b], c = CARGOS[Math.floor(r() * CARGOS.length)];
  const dist = Math.hypot(A.x - B.x, A.z - B.z);
  S.mission = { from: a, to: b, cargo: c.n, tons: c.t, stage: 'pickup', reward: Math.round((80 + dist * 0.45 + c.t * 4) / 10) * 10, wait: 0 };
  S.loadT = 0; S.route = null;
  if (rig) rig.setLoaded(false);
}
function missionTarget() { const m = S.mission; return DEPOTS[m.stage === 'pickup' ? m.from : m.to]; }
function cargoTons() { return S.mission && S.mission.stage === 'deliver' ? S.mission.tons : 0; }
function checkMission(dt) {
  const m = S.mission; if (!m) return;
  if (m.wait > 0) { m.wait -= dt; return; }
  const d = missionTarget(), cx = S.x + Math.sin(S.heading) * 2, cz = S.z + Math.cos(S.heading) * 2;
  if (Math.hypot(cx - d.x, cz - d.z) < 11) {
    if (Math.abs(S.v) > 0.6) { S.hint = '停進黃色框裡，踩煞車停好'; S.loadT = 0; return; }
    S.loadT += dt;
    S.hint = m.stage === 'pickup' ? `裝貨中… ${Math.min(100, Math.round((S.loadT / 3) * 100))}%` : `卸貨中… ${Math.min(100, Math.round((S.loadT / 3) * 100))}%`;
    if (S.loadT < 3) return;
    S.loadT = 0;
    if (m.stage === 'pickup') {
      m.stage = 'deliver'; S.bumpsThisJob = 0; rig.setLoaded(true); S.route = null;
      Snd.coin(); popup(`${m.cargo.split(' ')[0]} 裝好了！${m.tons} 噸`);
    } else {
      const bonus = S.bumpsThisJob === 0 ? Math.round(m.reward * 0.25) : 0;
      save.coins += m.reward + bonus; save.deliveries++; persist(); updateCoins();
      Snd.coin(); setTimeout(() => Snd.buy(), 350); popup(`💰 +${m.reward + bonus}`);
      toast(bonus ? `送達！零碰撞獎金 +${bonus}` : `送達！第 ${save.deliveries} 趟`);
      newMission(m.to); S.mission.wait = 2.2;
    }
  } else S.loadT = 0;
}

// ================= 輸入 =================
const input = { up: false, down: false, left: false, right: false };
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
window.addEventListener('keydown', (e) => {
  if (inGarage() && e.code === 'Escape') { closeGarage(); return; }
  if (e.target && e.target.tagName === 'INPUT') return;
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.repeat || S.mode !== 'drive') return;
  const k = e.code;
  if (k === 'KeyH') honk();
  else if (k === 'KeyL') toggleLights();
  else if (k === 'KeyC') switchCam();
  else if (k === 'KeyR') resetTruck();
  else if (k === 'KeyG') openGarage();
  else if (k === 'KeyQ') setIndicator('L');
  else if (k === 'KeyE') setIndicator('R');
  else if (k === 'KeyX') setIndicator('H');
  else if (k === 'KeyK') toggleWipers();
  else if (k === 'KeyT') cycleEnv('time');
  else if (k === 'KeyY') cycleEnv('weather');
  else if (k === 'KeyM') toggleSound();
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
function releaseAll() { for (const k in input) input[k] = false; document.querySelectorAll('.tc').forEach((b) => b.classList.remove('on')); }
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); Snd.suspend(); } else Snd.resume(); });
document.querySelectorAll('.tc').forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); input[k] = true; b.classList.add('on'); Snd.init(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ } };
  const off = () => { input[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});
// 拖曳畫面：車庫轉鏡頭、開車時環顧四周
canvas.addEventListener('pointerdown', (e) => { S.gDrag = { x: e.clientX, a: inGarage() ? S.gAng : S.camYaw }; });
window.addEventListener('pointermove', (e) => {
  if (!S.gDrag) return;
  const v = S.gDrag.a - (e.clientX - S.gDrag.x) * 0.008;
  if (inGarage()) S.gAng = v; else { S.camYaw = v; S.camYawT = 2.5; }
});
window.addEventListener('pointerup', () => { S.gDrag = null; });

// ================= 介面 =================
let toastTimer = 0;
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
function popup(msg) { const p = $('#popup'); p.textContent = msg; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); }
function updateCoins() { $('#coinNum').textContent = save.coins; $('#gCoins').textContent = save.coins; }
function honk() { Snd.init(); if (S.hornT > 0) return; S.hornT = 0.4; Snd.horn(save.truck.horn); }
function toggleLights() { S.lights = !S.lights; S.lightsManual = true; Snd.click(); refreshButtons(); }
function toggleWipers() { S.wipers = !S.wipers; Snd.click(); refreshButtons(); }
function setIndicator(k) { S.ind = S.ind === k ? null : k; S.blinkT = 0; S.indArmed = false; refreshButtons(); }
const CAM_NAMES = ['追車鏡頭', '高空鏡頭', '駕駛座', '路邊轉播'];
function switchCam() { S.cam = (S.cam + 1) % 4; S.camYaw = 0; S.cine = null; toast('📷 ' + CAM_NAMES[S.cam], 1000); }
function resetTruck() {
  Object.assign(S, { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading, trailerHeading: SPAWN.heading, v: 0, steer: 0, gear: 1, y: 0, yA: 0, grade: 0, tunNear: false, tollSide: null, tollPaid: false });
  placeRig(); toast('🔄 回到改裝廠門口', 1200);
}
function toggleSound() { Snd.init(); Snd.setMuted(!Snd.muted); $('#bSound').firstChild.textContent = Snd.muted ? '🔇' : '🔊'; }
function refreshButtons() {
  $('#cL').classList.toggle('on', S.ind === 'L'); $('#cR').classList.toggle('on', S.ind === 'R'); $('#cH').classList.toggle('on', S.ind === 'H');
  $('#cLights').classList.toggle('on', S.lights); $('#cWipers').classList.toggle('on', S.wipers);
}
$('#bGarage').onclick = () => openGarage();
$('#bCam').onclick = () => switchCam();
$('#bReset').onclick = () => resetTruck();
$('#bSound').onclick = () => toggleSound();
$('#bEnv').onclick = () => { $('#envPanel').classList.toggle('hidden'); renderEnvPanel(); };
$('#cL').onclick = () => setIndicator('L'); $('#cR').onclick = () => setIndicator('R'); $('#cH').onclick = () => setIndicator('H');
$('#cLights').onclick = () => toggleLights(); $('#cWipers').onclick = () => toggleWipers(); $('#cHorn').onclick = () => honk();
let coinTaps = [];
$('#coins').addEventListener('click', () => {
  const now = performance.now(); coinTaps = coinTaps.filter((t) => now - t < 3000); coinTaps.push(now);
  if (coinTaps.length >= 7) { coinTaps = []; save.coins += 1000; persist(); updateCoins(); Snd.coin(); popup('💰 +1000'); }
});

// ---- 環境（時間、天氣、畫質） ----
const TIME_N = { day: '☀️ 白天', dusk: '🌇 黃昏', night: '🌙 晚上' }, WEATHER_N = { clear: '🌤 晴天', rain: '🌧 下雨', fog: '🌫 起霧' };
function applyEnv() {
  const st = env.apply(save.settings.time, save.settings.weather);
  setNight(st.night); setWet(st.wet);
  if (!S.lightsManual) S.lights = st.night > 0.3 || save.settings.weather !== 'clear';
  S.wipers = save.settings.weather === 'rain';
  refreshButtons();
}
function cycleEnv(kind) {
  const list = kind === 'time' ? ['day', 'dusk', 'night'] : ['clear', 'rain', 'fog'];
  save.settings[kind] = list[(list.indexOf(save.settings[kind]) + 1) % list.length];
  S.lightsManual = false; persist(); applyEnv(); renderEnvPanel();
  toast(kind === 'time' ? TIME_N[save.settings.time] : WEATHER_N[save.settings.weather], 1000);
}
function renderEnvPanel() {
  const b = (kind, id, label) => `<button class="opt ${save.settings[kind] === id ? 'sel' : ''}" data-kind="${kind}" data-id="${id}">${label}</button>`;
  $('#envBody').innerHTML = `<div class="e-sec">時間</div><div class="opts">${Object.entries(TIME_N).map(([k, v]) => b('time', k, v)).join('')}</div>
    <div class="e-sec">天氣</div><div class="opts">${Object.entries(WEATHER_N).map(([k, v]) => b('weather', k, v)).join('')}</div>
    <div class="e-sec">畫質（換了會重新載入）</div><div class="opts">${b('quality', 'high', '高（電腦）')}${b('quality', 'low', '順（手機平板）')}</div>`;
}
$('#envBody').addEventListener('click', (e) => {
  const o = e.target.closest('.opt'); if (!o) return;
  const { kind, id } = o.dataset;
  if (kind === 'quality') { if (save.settings.quality !== id) { save.settings.quality = id; persist(); location.reload(); } return; }
  save.settings[kind] = id; S.lightsManual = false; persist(); applyEnv(); renderEnvPanel();
});
$('#envClose').onclick = () => $('#envPanel').classList.add('hidden');

// ---- 車庫 ----
const TABS = [
  { id: 'model', name: '🚛 車型' }, { id: 'paint', name: '🎨 烤漆' }, { id: 'pattern', name: '🔥 彩繪' },
  { id: 'parts', name: '🔧 零件' }, { id: 'fun', name: '📯 喇叭燈' }, { id: 'trailer', name: '📦 拖車' },
];
function openGarage() {
  if (S.mode !== 'drive') return;
  if (Math.abs(S.v) > 3) { toast('先停車再進改裝廠'); return; }
  S.mode = 'garage'; S.v = 0; releaseAll();
  draft = { ...save.truck }; S.pending = null; S.gAng = 0.9;
  env.setIndoor(true); setShowroomLights(true);
  $('#garage').classList.remove('hidden'); $('#touch').classList.add('hidden'); $('#hud').classList.add('hidden'); $('#envPanel').classList.add('hidden');
  placeRig(); renderGarage(); Snd.click();
}
function closeGarage() {
  if (!inGarage()) return;
  clearTimeout(nameTimer);
  draft = { ...save.truck }; S.pending = null;
  const changed = S.rigCfg !== JSON.stringify(save.truck);
  S.mode = 'drive';
  env.setIndoor(false); setShowroomLights(false);
  if (changed) rebuildRig(save.truck); else placeRig();
  $('#garage').classList.add('hidden'); $('#touch').classList.remove('hidden'); $('#hud').classList.remove('hidden');
}
$('#gExit').onclick = () => closeGarage();
const secHtml = (t) => `<div class="g-sec">${t}</div>`;
function swatchHtml(key) {
  return `<div class="swatches">${PALETTE.map((c) => `<button class="sw ${draft[key] === c ? 'sel' : ''}" data-key="${key}" data-col="${c}" style="background:${c}"></button>`).join('')}</div>`;
}
function cardsHtml(cat) {
  return `<div class="g-cards">${catList(cat).map((it) => {
    const sel = draft[cat] === it.id, owned = isOwned(cat, it.id);
    const pr = owned ? `<span class="pr own">${sel ? '✔ 使用中' : '已擁有'}</span>` : `<span class="pr">💰 ${it.price}</span>`;
    return `<button class="card ${sel ? 'sel' : ''}" data-cat="${cat}" data-id="${it.id}"><span class="ic">${it.icon}</span><span class="nm">${it.name}</span>${pr}</button>`;
  }).join('')}</div>`;
}
const repairCost = () => Math.round(save.damage * 250);
const fuelCost = () => Math.round((1 - save.fuel) * 60);
function renderGarage() {
  $('#gTabs').innerHTML = TABS.map((t) => `<button class="g-tab ${S.gTab === t.id ? 'sel' : ''}" data-tab="${t.id}">${t.name}</button>`).join('');
  let h = '';
  if (S.gTab === 'model') h = secHtml(CATALOG.cabStyle.title) + cardsHtml('cabStyle') + secHtml(CATALOG.trailerType.title) + cardsHtml('trailerType');
  else if (S.gTab === 'paint') h = secHtml('車身顏色（免費換）') + swatchHtml('cabColor') + secHtml('特殊烤漆') + cardsHtml('paint');
  else if (S.gTab === 'pattern') h = secHtml('彩繪圖案') + cardsHtml('pattern') + secHtml('彩繪顏色（免費換）') + swatchHtml('patternColor');
  else if (S.gTab === 'parts') h = ['bumper', 'rims', 'stacks', 'lightbar', 'visor', 'spoiler'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('');
  else if (S.gTab === 'fun') h = ['horn', 'glow'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('');
  else if (S.gTab === 'trailer') {
    h = secHtml('拖車顏色（免費換）') + swatchHtml('trailerColor') + secHtml('拖車彩繪（買過的圖案都能用）') + cardsHtml('trailerPattern')
      + secHtml('拖車彩繪顏色（免費換）') + swatchHtml('trailerPatColor')
      + secHtml('寫在拖車上的名字（最多 8 個字）') + `<input class="name-in" id="nameIn" maxlength="8" value="${escapeHtml(draft.name)}" placeholder="例如：小明號">`;
  }
  $('#gBody').innerHTML = h;
  const nameIn = $('#nameIn'); if (nameIn) nameIn.addEventListener('input', onNameInput);
  $('#gService').innerHTML = `
    <button data-svc="wash">🧽 洗車<small>${save.dirt > 0.05 ? '免費' : '很乾淨'}</small></button>
    <button data-svc="repair">🔧 修理<small>${save.damage > 0.01 ? '💰 ' + repairCost() : '沒壞'}</small></button>
    <button data-svc="fuel">⛽ 加油<small>${save.fuel < 0.99 ? '💰 ' + fuelCost() : '滿的'}</small></button>`;
  renderBuyBar(); updateCoins();
}
function renderBuyBar() {
  const p = S.pending, el = $('#gBuy');
  if (!p) { el.innerHTML = '<span>👆 點一下就能先試看，喜歡再買！拖曳畫面可以轉著看</span>'; return; }
  const it = itemOf(p.cat, p.id);
  el.innerHTML = `<span>${it.icon} ${it.name}　💰 ${it.price}</span><button id="buyBtn">買下來！</button>`;
  $('#buyBtn').onclick = buyPending;
}
let nameTimer = 0;
function onNameInput(e) {
  const v = e.target.value.slice(0, 8);
  draft.name = v; save.truck.name = v; persist();
  clearTimeout(nameTimer); nameTimer = setTimeout(() => { if (inGarage()) rebuildRig(draft); }, 350);
}
$('#gTabs').addEventListener('click', (e) => { const b = e.target.closest('.g-tab'); if (!b) return; S.gTab = b.dataset.tab; Snd.click(); renderGarage(); });
$('#gBody').addEventListener('click', (e) => {
  const sw = e.target.closest('.sw');
  if (sw) { draft[sw.dataset.key] = sw.dataset.col; save.truck[sw.dataset.key] = sw.dataset.col; persist(); Snd.click(); rebuildRig(draft); renderGarage(); return; }
  const c = e.target.closest('.card'); if (c) selectItem(c.dataset.cat, c.dataset.id);
});
$('#gService').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const svc = b.dataset.svc;
  if (svc === 'wash') { if (save.dirt <= 0.05) return; save.dirt = 0; persist(); rig.redrawDirt(0); S.dirtDrawn = 0; Snd.burst(1.2, 'highpass', 1500, 0.2); toast('🧽 洗得亮晶晶！'); }
  else if (svc === 'repair') {
    if (save.damage <= 0.01) return;
    const c = repairCost(); if (save.coins < c) { Snd.no(); toast(`修理要 💰${c}，金幣不夠`); return; }
    save.coins -= c; save.damage = 0; persist(); Snd.buy(); toast('🔧 修好了！');
  } else if (svc === 'fuel') {
    if (save.fuel >= 0.99) return;
    const c = Math.min(fuelCost(), save.coins); save.coins -= c; save.fuel = 1; persist(); Snd.buy(); toast('⛽ 油加滿了');
  }
  renderGarage();
});
function selectItem(cat, id) {
  Snd.init();
  if (S.pending && S.pending.cat !== cat) draft[S.pending.cat] = save.truck[S.pending.cat];
  draft[cat] = id;
  if (isOwned(cat, id)) { save.truck[cat] = id; persist(); S.pending = null; Snd.click(); } else S.pending = { cat, id };
  if (cat === 'horn') Snd.horn(id);
  rebuildRig(draft); renderGarage();
}
function buyPending() {
  const p = S.pending; if (!p) return;
  const it = itemOf(p.cat, p.id);
  if (save.coins < it.price) { Snd.no(); toast(`金幣還差 ${it.price - save.coins} 個，去送貨賺錢吧！`); return; }
  save.coins -= it.price; save.owned.push(ownKey(p.cat, p.id)); save.truck[p.cat] = p.id; persist();
  S.pending = null; Snd.buy(); popup(`${it.icon} 買到了！`); renderGarage();
}

// ================= 重車物理 =================
const GEARS = [14.9, 11.7, 9.1, 7.1, 5.6, 4.4, 3.4, 2.7, 2.1, 1.6, 1.28, 1.0], FINAL = 2.85, EFF = 0.88, RW = 0.53, R_GEAR = 13;
const L = 3.8, LT = 10.7, VMAX = 25;
function torque(rpm) {
  if (rpm < 1000) return 1700 + (rpm - 600) * 2;
  if (rpm <= 1400) return 2500;
  if (rpm <= 1900) return 2500 - (rpm - 1400) * 1.2;
  return Math.max(0, 1900 - (rpm - 1900) * 9);
}
const tmpV = new THREE.Vector3();
function rigPoints(x, z, h, th) {
  const fx = Math.sin(h), fz = Math.cos(h), tx = Math.sin(th), tz = Math.cos(th);
  return [
    { x: x + fx * 2.2, z: z + fz * 2.2, r: 1.6 }, { x: x + fx * (rig.frontZ - 1.1), z: z + fz * (rig.frontZ - 1.1), r: 1.3 },
    { x: x - tx * 6, z: z - tz * 6, r: 1.45 }, { x: x - tx * 11.8, z: z - tz * 11.8, r: 1.4 },
  ];
}
function hitTest(x, z, h, th) {
  const cars = traffic.circles();
  for (const p of rigPoints(x, z, h, th)) {
    const out = Math.abs(p.x) > WORLD - p.r || Math.abs(p.z) > WORLD - p.r;
    if (out && hwBlocked(p.x, p.z, p.r)) return { wall: true }; // 城外只能走國道
    if (!out) for (const b of boxes) {
      const cx = clamp(p.x, b.minx, b.maxx), cz = clamp(p.z, b.minz, b.maxz);
      if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < p.r * p.r) return { wall: true };
    }
    for (const c of cars) if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (p.r + c.r) ** 2) return { car: c.car };
  }
  return null;
}
function drive(dt) {
  S.hint = '';
  const tons = cargoTons(), mass = 16500 + tons * 1000;
  const surf = surfaceAt(S.x, S.z); S.lastSurface = surf;
  const wet = env.state.wet;
  const grip = (surf === 'road' ? 1 : surf === 'gravel' ? 0.75 : 0.8) * (wet ? 0.85 : 1);
  const crr = surf === 'road' ? 0.008 : surf === 'gravel' ? 0.035 : 0.025;
  // 油門、煞車慢慢踩下去
  S.thr += ((input.up ? 1 : 0) - S.thr) * Math.min(1, dt * 4);
  const brkIn = input.down ? 1 : 0;
  const noFuel = save.fuel <= 0;
  const power = (1 - save.damage * 0.45) * (noFuel ? 0 : 1);
  // 倒車：停住後按住煞車 0.3 秒
  if (S.gear > 0 && Math.abs(S.v) < 0.3 && input.down && !input.up) { S.revHold += dt; if (S.revHold > 0.3) { S.gear = -1; Snd.shift(); } } else if (S.gear > 0) S.revHold = 0;
  if (S.gear < 0 && input.up && Math.abs(S.v) < 0.3) { S.gear = 1; S.revHold = 0; Snd.shift(); }
  const rev = S.gear < 0;
  const accelPedal = rev ? brkIn : S.thr;
  const brakePedal = rev ? (input.up ? 1 : 0) : brkIn;
  // 轉速
  const ratio = rev ? R_GEAR : GEARS[S.gear - 1];
  const wheelRpm = (Math.abs(S.v) / RW) * 60 / (2 * Math.PI);
  let rpm = wheelRpm * ratio * FINAL;
  if (rpm < 600 + accelPedal * 700 && (rev || S.gear <= 2)) rpm = 600 + accelPedal * 700 * (1 - Math.min(1, rpm / 1300)) + rpm * 0.5; // 離合器半聯結
  rpm = Math.max(600, rpm);
  S.rpm += (rpm - S.rpm) * Math.min(1, dt * 8);
  // 自動排檔
  if (S.shiftT > 0) S.shiftT -= dt;
  else if (!rev) {
    if (S.rpm > 1750 && S.gear < 12) { S.gear++; S.shiftT = 0.4; Snd.shift(); if (S.thr > 0.5) Snd.blowOff(); }
    else if (S.rpm < 1050 && S.gear > 1 && Math.abs(S.v) > 1) { S.gear--; S.shiftT = 0.3; Snd.shift(); }
    else if (Math.abs(S.v) < 1 && S.gear > 1) S.gear = 1;
  }
  let F = 0;
  if (S.shiftT <= 0 && accelPedal > 0) {
    F = accelPedal * torque(S.rpm) * ratio * FINAL * EFF / RW * power;
    F = Math.min(F, 2.6 * mass * grip); // 抓地力上限
    if (!rev && S.v > VMAX) F = 0;
    if (rev && S.v < -4) F = 0;
    if (rev) F = -F;
  }
  const dir = Math.sign(S.v);
  const resist = crr * mass * 9.81 + 3.3 * S.v * S.v + (accelPedal < 0.05 ? 0.035 * mass * Math.min(1, Math.abs(S.v)) : 0);
  let a = F / mass - dir * resist / mass - 9.81 * S.grade; // 上坡變慢、下坡變快
  if (!rev && S.v > VMAX + 0.3) a -= (S.v - VMAX) * 1.5; // 下坡自動排氣煞車，不超過 90
  if (rev && S.v < -5) a += (-5 - S.v) * 1.5; // 倒車下坡也不會越倒越快
  // 煞車：重車煞車距離比較長
  const brakeDecel = brakePedal * 5.5 * grip * (1 - tons / 80);
  S.v += a * dt;
  if (brakeDecel > 0) { const dv = brakeDecel * dt; S.v = Math.abs(S.v) <= dv ? 0 : S.v - Math.sign(S.v) * dv; }
  if (Math.abs(S.v) < 0.05 && accelPedal < 0.05) S.v = 0;
  // 氣壓煞車「嘶」：剛停下來
  const stopped = Math.abs(S.v) < 0.05;
  if (stopped && !S.wasStopped && brakePedal > 0) Snd.airBrake();
  S.wasStopped = stopped;

  // 轉向：方向盤慢慢轉，車速越快能轉的角度越小
  const target = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * (0.6 / (1 + Math.abs(S.v) * 0.07));
  const rate = target === 0 ? 1.8 : 1.1;
  S.steer += clamp(target - S.steer, -rate * dt, rate * dt);

  const px = S.x, pz = S.z, ph = S.heading, pth = S.trailerHeading;
  S.heading += (S.v / L) * Math.tan(S.steer) * grip * dt;
  S.x += Math.sin(S.heading) * S.v * dt; S.z += Math.cos(S.heading) * S.v * dt;
  S.trailerHeading += (S.v / LT) * Math.sin(S.heading - S.trailerHeading) * dt;
  const rel = wrapAngle(S.heading - S.trailerHeading);
  if (Math.abs(rel) > 1.35) S.trailerHeading = S.heading - Math.sign(rel) * 1.35;

  const hit = hitTest(S.x, S.z, S.heading, S.trailerHeading);
  if (hit) {
    S.x = px; S.z = pz; S.heading = ph; S.trailerHeading = pth;
    const impact = Math.abs(S.v);
    if (impact > 1.5) {
      const dmg = impact * 0.007 * (hit.car ? 0.6 : 1);
      save.damage = clamp(save.damage + dmg, 0, 1); S.bumpsThisJob++;
      Snd.thud(clamp(impact / 12, 0.3, 1)); S.shake = Math.min(1.2, impact / 10);
      toast(hit.car ? `撞到車了！車損 +${Math.round(dmg * 100)}%` : `碰撞！車損 +${Math.round(dmg * 100)}%`, 1300);
    }
    S.v = -S.v * 0.2;
  }
  // 路面高度、坡度
  {
    const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
    S.y = groundAt(S.x, S.z);
    S.grade = (groundAt(S.x + fx * L, S.z + fz * L) - S.y) / L;
    S.yA = groundAt(S.x - Math.sin(S.trailerHeading) * LT, S.z - Math.cos(S.trailerHeading) * LT);
    S.tunNear = nearTunnel(S.x, S.z);
    tollCheck(S.x + fx * 4, S.z + fz * 4, fx, fz);
  }
  const dist = Math.abs(S.v) * dt;
  S.travelled += dist; S.wheelAngle += (S.v * dt) / RW;
  // 車身側傾、點頭（彈簧＋阻尼）
  const aLat = (S.v * S.v * Math.tan(S.steer) * grip) / L;
  const aLong = (S.v - S.lastV) / Math.max(dt, 1e-3); S.lastV = S.v;
  const rollT = clamp(aLat * 0.016 * (1 + tons / 40), -0.09, 0.09), pitchT = clamp(-aLong * 0.008, -0.05, 0.05);
  S.rollV += ((rollT - S.roll) * 70 - S.rollV * 9) * dt; S.roll += S.rollV * dt;
  S.pitchV += ((pitchT - S.pitch) * 70 - S.pitchV * 9) * dt; S.pitch += S.pitchV * dt;
  const amp = surf === 'road' ? 0.012 : 0.05;
  S.bump = Math.sin(S.travelled * 1.9) * Math.sin(S.travelled * 0.71) * amp * Math.min(1, Math.abs(S.v) / 6);
  // 油、水溫、髒污
  save.fuel = clamp(save.fuel - (0.00012 + S.thr * (S.rpm / 2100) * 0.0011) * dt, 0, 1);
  S.temp += ((0.5 + S.thr * 0.3 * (S.rpm / 2100)) - S.temp) * dt * 0.05;
  save.dirt = clamp(save.dirt + dist * (surf === 'road' ? 0.000015 : 0.00015) * (wet ? 3 : 1), 0, 1);
  if (Math.abs(save.dirt - S.dirtDrawn) > 0.06) { S.dirtDrawn = save.dirt; rig.redrawDirt(save.dirt); }
  if (noFuel && !S.noFuelWarned) { S.noFuelWarned = true; toast('⛽ 沒油了！開到加油站，或按 🔄 回改裝廠加油', 4000); }
  if (!noFuel) S.noFuelWarned = false;
  // 加油站
  if (Math.hypot(S.x + Math.sin(S.heading) * 2 - GAS.x, S.z + Math.cos(S.heading) * 2 - GAS.z) < 10 && stopped && save.fuel < 0.999) {
    const add = Math.min(1 - save.fuel, dt * 0.08); save.fuel += add; S.fuelCoinAcc += add * 60;
    if (S.fuelCoinAcc >= 1 && save.coins > 0) { save.coins -= 1; S.fuelCoinAcc -= 1; updateCoins(); }
    S.hint = `加油中… ${Math.round(save.fuel * 100)}%`;
  }
  // 方向燈自動回正
  if ((S.ind === 'L' || S.ind === 'R') && Math.abs(S.steer) > 0.25) S.indArmed = true;
  if (S.indArmed && Math.abs(S.steer) < 0.05) { S.ind = null; S.indArmed = false; refreshButtons(); }
  Snd.update({ rpm: S.rpm, throttle: accelPedal, speed: S.v, surface: surf, rain: wet, running: !noFuel, inside: S.cam === 2 });
}

// 收費站：車頭經過收費亭扣過路費；太快會提醒減速
const TOLL = 15;
function tollCheck(px, pz, fx, fz) {
  if (inCity(px, pz)) { S.tollSide = null; S.tollPaid = false; return; }
  const q = hwProject(px, pz);
  if (q.s < 0 || q.s > 110 || Math.abs(q.o) > 23) { S.tollSide = null; S.tollPaid = false; return; }
  const side = Math.sign(q.s - TOLL_S) || 1;
  if (S.tollSide && side !== S.tollSide && !S.tollPaid) { // 一次進出收費站只收一次（撞到柵欄退回來不會再扣）
    S.tollPaid = true;
    if (save.coins >= TOLL) { save.coins -= TOLL; persist(); updateCoins(); Snd.coin(); toast(`🛣️ 過路費 −${TOLL} 金幣`, 1600); }
    else toast('🛣️ 金幣不夠，這次先免費通過', 1600);
  }
  S.tollSide = side;
  const p = HW_PTS[q.i], along = Math.sign((fx * p.fx + fz * p.fz) * S.v);
  const ahead = (TOLL_S - q.s) * along;
  if (ahead > 2 && ahead < 50 && Math.abs(S.v) > 8.4) S.hint = '收費站：減速到 30 以下，柵欄才會打開';
}

// ================= 鏡頭 =================
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
  const want = new THREE.Vector3(), look = new THREE.Vector3();
  rig.windshield.forEach((w) => (w.visible = !(S.mode === 'drive' && S.cam === 2)));
  if (inGarage()) {
    const tx = SHOWROOM.x, tz = SHOWROOM.z + (S.gTab === 'trailer' ? -1 : 8), y = SHOWROOM.y;
    const R = S.gTab === 'trailer' ? 15 : 11;
    if (!S.gDrag) S.gAng += dt * 0.12;
    want.set(tx + Math.sin(S.gAng) * R, y + (S.gTab === 'trailer' ? 6 : 4.2), tz + Math.cos(S.gAng) * R);
    want.x = clamp(want.x, tx - 15.5, tx + 15.5); want.z = clamp(want.z, SHOWROOM.z - 22.5, SHOWROOM.z + 22.5);
    look.set(tx, y + 2.4, tz);
    if (window.innerWidth > 760) { const right = new THREE.Vector3().subVectors(look, want).cross(new THREE.Vector3(0, 1, 0)).normalize(); want.addScaledVector(right, 3.5); look.addScaledVector(right, 3.5); }
  } else if (S.mode === 'title') {
    const a = S.time * 0.12;
    want.set(S.x + Math.sin(a) * 19, 5.5, S.z + 2 + Math.cos(a) * 19); look.set(S.x, 2.4, S.z + 1);
  } else if (S.cam === 2) {
    rig.cab.updateMatrixWorld(true);
    rig.cabInner.localToWorld(want.copy(rig.camLocal));
    const q = new THREE.Quaternion(); rig.cab.getWorldQuaternion(q);
    const yaw = S.camYawT > 0 ? S.camYaw : 0;
    look.set(Math.sin(yaw) * 10, -0.6, Math.cos(yaw) * 10).applyQuaternion(q).add(want);
    camPos.copy(want); camLook.copy(look);
    camera.position.copy(want); camera.lookAt(look); return;
  } else if (S.cam === 3 && !S.tunNear) {
    const d = S.cine ? Math.hypot(S.cine.x - S.x, S.cine.z - S.z) : 999;
    if (!S.cine || d > 70) { const side = Math.random() < 0.5 ? 1 : -1, cx = S.x + fx * 45 + fz * 9 * side, cz = S.z + fz * 45 - fx * 9 * side; S.cine = new THREE.Vector3(cx, surfaceY(cx, cz) + 2.2, cz); }
    want.copy(S.cine); look.set(S.x - Math.sin(S.trailerHeading) * 4, S.y + 2.5, S.z - Math.cos(S.trailerHeading) * 4);
    camPos.copy(want); camLook.lerp(look, Math.min(1, dt * 5)); camera.position.copy(camPos); camera.lookAt(camLook); return;
  } else {
    // 隧道附近鏡頭放低，才不會穿到山裡
    const back = S.tunNear ? 15 : S.cam === 1 ? 42 : 19, up = S.tunNear ? 4.6 : S.cam === 1 ? 30 : 8.5;
    if (S.camYawT > 0) { S.camYawT -= dt; if (S.camYawT <= 0) S.camYaw = 0; }
    const th = S.trailerHeading * 0.55 + S.heading * 0.45 + (S.camYawT > 0 ? S.camYaw : 0);
    want.set(S.x - Math.sin(th) * back + fx * 2, S.y + up, S.z - Math.cos(th) * back + fz * 2);
    if (!S.tunNear) want.y = Math.max(want.y, surfaceY(want.x, want.z) + 3); // 不要鑽進山坡
    look.set(S.x + fx * 7, S.y + 2.8, S.z + fz * 7);
  }
  if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
  const k = inGarage() ? Math.min(1, dt * 6) : Math.min(1, dt * 3.2);
  camPos.lerp(want, k); camLook.lerp(look, k);
  camera.position.copy(camPos);
  if (S.shake > 0) camera.position.add(tmpV.set((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake, 0));
  camera.lookAt(camLook);
}

// ================= HUD =================
const clusterCv = $('#cluster'), mapCv = $('#minimap');
let lastMission = '', hudT = 0;
function updateHud(dt) {
  hudT += dt; if (hudT < 1 / 30) return; hudT = 0;
  const m = S.mission;
  if (m) {
    S.routeT -= 1 / 30;
    const d = missionTarget();
    if (!S.route || S.routeT <= 0) { S.route = computeRoute({ x: S.x, z: S.z }, d); S.routeT = 0.5; }
    const km = S.route.len >= 1000 ? (S.route.len / 1000).toFixed(1) + ' 公里' : Math.round(S.route.len) + ' 公尺';
    // 下一個轉彎方向
    const nxt = S.route.pts.find((p, i) => i > 0 && Math.hypot(p.x - S.x, p.z - S.z) > 14) || d;
    const bearing = wrapAngle(Math.atan2(nxt.x - S.x, nxt.z - S.z) - S.heading);
    $('#navArrow').style.transform = `rotate(${-bearing}rad)`;
    const html = `<div class="m-title">${m.stage === 'pickup' ? '① 去載貨' : '② 送貨中'}　${m.cargo} <small>${m.tons} 噸</small></div>
      <div class="m-row">${m.stage === 'pickup' ? '到' : '送到'} <b>${d.emoji} ${d.name}</b>　<span class="m-dist">${km}</span>　<span class="m-pay">💰 ${m.reward}</span></div>
      ${S.hint ? `<div class="m-hint">${S.hint}</div>` : ''}`;
    if (html !== lastMission) { $('#missionText').innerHTML = html; lastMission = html; }
  }
  const tons = cargoTons();
  drawCluster(clusterCv, {
    rpm: S.rpm, kmh: Math.abs(S.v) * 3.6, gear: S.gear < 0 ? 'R' : (Math.abs(S.v) < 0.05 && S.thr < 0.05 ? 'N' : 'A' + S.gear),
    fuel: save.fuel, temp: S.temp, damage: save.damage, indL: S.ind === 'L' || S.ind === 'H', indR: S.ind === 'R' || S.ind === 'H', blink: S.blink,
    lights: S.lights, wipers: S.wipers, brake: input.down || Math.abs(S.v) < 0.05, engineWarn: save.damage > 0.6 || save.fuel <= 0, tons: tons ? tons + 8 : 8,
  });
  drawMinimap(mapCv, { x: S.x, z: S.z, heading: S.heading, route: S.route, target: m ? missionTarget() : null, time: S.time, night: env.state.night > 0.5, cars: traffic.positions() });
}

// ================= 主迴圈 =================
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 72 : 55; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
const clock = new THREE.Clock();
const focus = new THREE.Vector3();
let lampT = 0;
function loop() {
  frame(Math.min(clock.getDelta(), 0.05));
  requestAnimationFrame(loop);
}
function frame(dt) {
  S.time += dt;
  if (S.hornT > 0) S.hornT -= dt;
  if (S.mode === 'drive') { drive(dt); checkMission(dt); }
  else Snd.update({ rpm: 600, throttle: 0, speed: 0, surface: 'road', rain: false, running: S.mode !== 'title' || Snd.ctx, inside: false });
  S.shake = Math.max(0, S.shake - dt * 2.5);
  placeRig();
  // 輪子、方向盤、雨刷
  for (const w of rig.spins) w.rotation.x = S.wheelAngle;
  for (const w of rig.trailerSpins) w.rotation.x = S.wheelAngle;
  for (const f of rig.front) f.rotation.y = S.steer;
  rig.steeringWheel.rotation.z = -S.steer * 7;
  if (S.wipers) S.wiperT += dt * 2.6;
  const wa = S.wipers ? (1 - Math.cos(S.wiperT)) * 0.85 : Math.max(0, rig.wipers[0].rotation.z * -1 - dt * 3) ;
  rig.wipers.forEach((w) => (w.rotation.z = -wa));
  // 方向燈閃爍
  if (S.ind) { S.blinkT += dt; const b = (S.blinkT % 0.8) < 0.4; if (b !== S.blink) { S.blink = b; Snd.tick(b); } } else S.blink = false;
  const braking = S.mode === 'drive' && ((input.down && S.gear > 0) || (input.up && S.gear < 0) || Math.abs(S.v) < 0.05);
  setTruckLights({ head: S.lights, brake: braking, indL: S.blink && (S.ind === 'L' || S.ind === 'H'), indR: S.blink && (S.ind === 'R' || S.ind === 'H'), reverse: S.gear < 0 });
  rig.spots.forEach((s) => (s.intensity = S.lights && !inGarage() ? 900 : 0));
  if (rig.chameleon) { const c = new THREE.Color().setHSL((S.time * 0.08) % 1, 0.85, 0.5); rig.paint.color.copy(c); rig.paintPlain.color.copy(c); if (rig.rimMat) rig.rimMat.color.copy(c); }
  if (rig.rainbowGlow) { const c = new THREE.Color().setHSL((S.time * 0.5) % 1, 1, 0.55); rig.glowMat.color.copy(c); rig.glowLight.color.copy(c); }
  // 紅綠燈、車流、路燈光
  updateTrafficLights(S.time);
  const pts = rigPoints(S.x, S.z, S.heading, S.trailerHeading);
  traffic.update(dt, S.time, pts, env.state.night > 0.3);
  updateHighway(dt, pts, traffic.positions(), Math.abs(S.v));
  lampT -= dt;
  if (lampT <= 0) {
    lampT = S.tunNear ? 0.2 : 0.5;
    const on = env.state.night > 0.3 && !inGarage();
    const cand = [...(on ? lampPositions() : []), ...(S.tunNear && !inGarage() ? TUNNEL_LAMPS : [])];
    const near = cand.map((p) => [p, (p.x - S.x) ** 2 + (p.y - S.y) ** 2 + (p.z - S.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, lampLights.length);
    lampLights.forEach((l, i) => { if (near[i]) { l.position.copy(near[i][0]); l.intensity = 260; } else l.intensity = 0; });
  }
  if (inGarage()) focus.set(SHOWROOM.x, SHOWROOM.y, SHOWROOM.z); else focus.set(S.x, S.y, S.z);
  updateCamera(dt);
  env.update(dt, focus, camera.position, !inGarage() && inTunnel(camera.position.x, camera.position.y, camera.position.z));
  if (S.mode === 'drive') updateHud(dt);
  renderer.render(scene, camera);
}

// ================= 開始 =================
window.__truck = { S, get save() { return save; }, hit: () => hitTest(S.x, S.z, S.heading, S.trailerHeading), boxes, input,
  step(n = 60) { for (let i = 0; i < n; i++) frame(1 / 60); }, applyEnv, openGarage, closeGarage, traffic };
newMission();
rebuildRig(save.truck);
applyEnv();
resize();
updateCoins();
$('#ver').textContent = '卡車改裝王 ' + VERSION;
$('#startBtn').disabled = false; $('#loadMsg').textContent = '';
$('#startBtn').onclick = () => {
  Snd.init();
  S.mode = 'drive'; camInit = false;
  $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#touch').classList.remove('hidden');
  toast('沿著橘色導航線去載貨！', 2500);
};
requestAnimationFrame(loop);
