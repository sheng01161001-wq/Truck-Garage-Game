// 卡車改裝王 v24（寫實版）— 主程式：存檔、操作、重車物理、送貨任務、鏡頭、儀表、改裝車庫
import * as THREE from 'three';
import {
  buildWorld, boxes, DEPOTS, GAS, GARAGE_BLD, SPAWN, SHOWROOM, WORLD, surfaceAt,
  setWet, setNight, lampPositions, updateTrafficLights, setShowroomLights, ROADS, hasLight, lightState,
} from './js/world.js';
import { buildRig, setTruckLights } from './js/truck.js';
import { createEnv } from './js/env.js';
import { createTraffic } from './js/traffic.js';
import { Snd } from './js/audio.js';
import { drawCluster, drawMinimap, computeRoute } from './js/hud.js';
import { clamp, wrapAngle } from './js/util.js';
import { groundAt, surfaceY, hwBlocked, hwProject, inCity, inTunnel, nearTunnel, updateHighway, speedLimitAt, restZoneAt, nearRest, isEtcLane, TOLL_S, TUNNEL_LAMPS, PTS as HW_PTS } from './js/highway.js';

const VERSION = 'v24';
const $ = (s) => document.querySelector(s);
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');

// ================= 存檔 =================
const SAVE_KEY = 'truckGarage_save_v1';
const DEFAULT_TRUCK = {
  cabStyle: 'euro', trailerType: 'box',
  cabColor: '#b71c1c', cabColor2: '#ffb000', cabGradient: 'off', paint: 'normal', pattern: 'none', patternColor: '#ffd60a',
  rims: 'std', bumper: 'std', lightbar: 'off', stacks: 'off', visor: 'off', spoiler: 'off',
  horn: 'normal', glow: 'off',
  trailerColor: '#e9ecef', trailerColor2: '#9aa7b4', trailerGradient: 'off', trailerPattern: 'none', trailerPatColor: '#1d3557', name: '我的卡車',
  cabDecalData: '', cabDecalX: 0, cabDecalY: 0, cabDecalScale: 0.34, cabDecalRotation: 0,
  trailerDecalData: '', trailerDecalX: 0, trailerDecalY: 0, trailerDecalScale: 0.42, trailerDecalRotation: 0,
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
    { id: 'candy', name: '糖果透明漆', icon: '🍬', price: 650 },
    { id: 'satin', name: '緞面金屬漆', icon: '✨', price: 450 },
    { id: 'holographic', name: '極光全息漆', icon: '🌌', price: 950 },
    { id: 'brushed', name: '拉絲金屬漆', icon: '⚙️', price: 550 },
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
const COLOR_KEYS = ['cabColor', 'cabColor2', 'patternColor', 'trailerColor', 'trailerColor2', 'trailerPatColor'];
const PALETTE = ['#b71c1c', '#e65100', '#f9a825', '#2e7d32', '#00695c', '#0277bd', '#1a237e', '#4a148c',
  '#ad1457', '#f5f5f5', '#9e9e9e', '#37474f', '#111111', '#5d4037', '#c0a062', '#00e5ff'];

function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  const out = { coins: 500, owned: [], deliveries: 0, truck: { ...DEFAULT_TRUCK }, fleet: [], company: { name: '小棒槌物流', trucks: 1, engineLevel: 0, fuelLevel: 0, revenue: 0, expenses: 0, contracts: 0, wages: 0, maintenance: 0, fuelCost: 0, fleetLog: [], queuedCargo: null, fleetUnits: [] }, fuel: 1, damage: 0, dirt: 0.15,
    settings: { time: 'day', weather: 'clear', quality: IS_TOUCH ? 'low' : 'high', traffic: 'normal' } };
  if (s && typeof s === 'object') {
    if (Number.isFinite(s.coins) && s.coins >= 0) out.coins = Math.floor(s.coins);
    if (Array.isArray(s.owned)) out.owned = s.owned.filter((x) => typeof x === 'string');
    if (Array.isArray(s.fleet)) out.fleet = s.fleet.filter((v) => v && typeof v.id === 'string' && v.truck && typeof v.truck === 'object').slice(0, 8).map((v) => ({ id: v.id.slice(0, 40), name: String(v.name || '我的卡車').slice(0, 16), truck: { ...DEFAULT_TRUCK, ...v.truck }, photo: typeof v.photo === 'string' && v.photo.startsWith('data:image/') ? v.photo : '', savedAt: Number.isFinite(v.savedAt) ? v.savedAt : Date.now() }));
    if (s.company && typeof s.company === 'object') {
      const c = s.company;
      if (typeof c.name === 'string') out.company.name = c.name.slice(0, 20);
      if (Number.isFinite(c.trucks)) out.company.trucks = clamp(Math.floor(c.trucks), 1, 5);
      if (Number.isFinite(c.engineLevel)) out.company.engineLevel = clamp(Math.floor(c.engineLevel), 0, 3);
      if (Number.isFinite(c.fuelLevel)) out.company.fuelLevel = clamp(Math.floor(c.fuelLevel), 0, 3);
      for (const k of ['revenue', 'expenses', 'contracts', 'wages', 'maintenance', 'fuelCost']) if (Number.isFinite(c[k])) out.company[k] = Math.max(0, Math.floor(c[k]));
      if (Number.isInteger(c.queuedCargo) && c.queuedCargo >= 0 && c.queuedCargo < 12) out.company.queuedCargo = c.queuedCargo;
      if (Array.isArray(c.fleetLog)) out.company.fleetLog = c.fleetLog.slice(0,20).filter(v=>v&&typeof v.message==='string').map(v=>({time:Number.isFinite(v.time)?v.time:Date.now(),message:String(v.message).slice(0,100)}));
      if (Array.isArray(c.fleetUnits)) out.company.fleetUnits = c.fleetUnits.slice(0, 4).filter(u => u && typeof u.id === 'string').map((u,i) => ({ id:u.id.slice(0,48), name:String(u.name||`車隊 ${i+1}`).slice(0,16), driver:String(u.driver||'待指派司機').slice(0,16), paint:/^#[0-9a-f]{6}$/i.test(u.paint)?u.paint:['#b71c1c','#145da0','#d18a16','#315b45'][i%4], plate:String(u.plate||`BK-${String(i+1).padStart(3,'0')}`).replace(/[^a-zA-Z0-9-]/g,'').slice(0,10), status:['idle','outbound','returning'].includes(u.status)?u.status:'idle', progress:clamp(Number(u.progress)||0,0,1), duration:clamp(Number(u.duration)||90,45,180), fuel:clamp(Number(u.fuel??1),0,1), condition:clamp(Number(u.condition??1),0,1), cargoIndex:Number.isInteger(u.cargoIndex)?clamp(u.cargoIndex,0,11):null, origin:Number.isInteger(u.origin)?clamp(u.origin,0,DEPOTS.length-1):null, destination:Number.isInteger(u.destination)?clamp(u.destination,0,DEPOTS.length-1):null, reward:Math.max(0,Math.floor(Number(u.reward)||0)), earned:Math.max(0,Math.floor(Number(u.earned)||0)), phase:['outbound','unloading','returning'].includes(u.phase)?u.phase:'outbound', stopTimer:clamp(Number(u.stopTimer)||0,0,20), driverState:String(u.driverState||'待命').slice(0,16), fatigue:clamp(Number(u.fatigue)||0,0,1), incidents:Math.max(0,Math.floor(Number(u.incidents)||0)), lastEvent:String(u.lastEvent||'車輛已完成檢查').slice(0,48), eventChecked:!!u.eventChecked }));
    }
    if (Number.isFinite(s.deliveries)) out.deliveries = s.deliveries;
    for (const k of ['fuel', 'damage', 'dirt']) if (Number.isFinite(s[k])) out[k] = clamp(s[k], 0, 1);
    if (s.truck && typeof s.truck === 'object') {
      for (const k of COLOR_KEYS) if (/^#[0-9a-f]{6}$/i.test(s.truck[k])) out.truck[k] = s.truck[k];
      if (typeof s.truck.name === 'string') out.truck.name = s.truck.name.slice(0, 8);
      for (const k of ITEM_KEYS) if (typeof s.truck[k] === 'string') out.truck[k] = s.truck[k];
      for (const k of ['cabGradient', 'trailerGradient']) if (['off', 'horizontal', 'vertical'].includes(s.truck[k])) out.truck[k] = s.truck[k];
      for (const k of ['cabDecalData', 'trailerDecalData']) if (typeof s.truck[k] === 'string' && s.truck[k].startsWith('data:image/')) out.truck[k] = s.truck[k];
      for (const k of ['cabDecalX','cabDecalY','trailerDecalX','trailerDecalY']) if (Number.isFinite(s.truck[k])) out.truck[k] = clamp(s.truck[k], -0.45, 0.45);
      for (const k of ['cabDecalScale','trailerDecalScale']) if (Number.isFinite(s.truck[k])) out.truck[k] = clamp(s.truck[k], 0.08, 0.9);
      for (const k of ['cabDecalRotation','trailerDecalRotation']) if (Number.isFinite(s.truck[k])) out.truck[k] = clamp(s.truck[k], -180, 180);
    }
    if (s.settings && typeof s.settings === 'object') {
      if (['day', 'dusk', 'night'].includes(s.settings.time)) out.settings.time = s.settings.time;
      if (['clear', 'rain', 'fog'].includes(s.settings.weather)) out.settings.weather = s.settings.weather;
      if (['high', 'low'].includes(s.settings.quality)) out.settings.quality = s.settings.quality;
      if (['few', 'normal', 'many'].includes(s.settings.traffic)) out.settings.traffic = s.settings.traffic;
    }
  }
  return out;
}
let save = loadSave();
const FLEET_DRIVERS = ['阿哲','志明','小宇','建宏','阿凱','家豪'];
function createFleetUnit(index) { return { id:`fleet-${Date.now()}-${index}-${Math.random().toString(36).slice(2,6)}`, name:`物流車 ${index+1}`, driver:FLEET_DRIVERS[index % FLEET_DRIVERS.length], paint:['#b71c1c','#145da0','#d18a16','#315b45'][index%4], plate:`BK-${String(index+1).padStart(3,'0')}`, driverState:'待命', fatigue:0, incidents:0, lastEvent:'車輛已完成檢查', eventChecked:false, status:'idle', progress:0, duration:90, fuel:1, condition:1, cargoIndex:null, origin:null, destination:null, reward:0, earned:0, phase:'outbound' }; }
function logFleetEvent(message) { save.company.fleetLog.unshift({ time: Date.now(), message: String(message).slice(0,100) }); save.company.fleetLog = save.company.fleetLog.slice(0,20); }
while (save.company.fleetUnits.length < Math.max(0, save.company.trucks - 1)) save.company.fleetUnits.push(createFleetUnit(save.company.fleetUnits.length));
save.company.fleetUnits = save.company.fleetUnits.slice(0, Math.max(0, save.company.trucks - 1));
for (const k of ITEM_KEYS) if (!isOwned(k, save.truck[k])) save.truck[k] = DEFAULT_TRUCK[k];
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch (e) { return false; } }
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
// 車流密度：少／中／多（多的時候路口會塞車）
const DENSITY = { few: [10, 4], normal: [HIGH ? 22 : 14, HIGH ? 8 : 5], many: [HIGH ? 38 : 26, HIGH ? 12 : 8] }[save.settings.traffic] || [14, 5];
const traffic = createTraffic(scene, DENSITY[0], DENSITY[1]);

// 晚上：在卡車附近的路燈放真的燈光（最多 6 盞）
const lampLights = [];
for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffc98a, 0, 30, 1.6); scene.add(l); lampLights.push(l); }

// ================= 遊戲狀態 =================
const S = {
  mode: 'title', x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading, trailerHeading: SPAWN.heading,
  v: 0, steer: 0, thr: 0, brk: 0, gear: 1, shiftT: 0, rpm: 600, revHold: 0,
  wheelAngle: 0, travelled: 0, roll: 0, rollV: 0, pitch: 0, pitchV: 0, bump: 0, lastV: 0, suspension: 0, suspensionV: 0, brakeTemp: 0, speedLimit: 50, rollover: false, rolloverWarned: false,
  lights: false, ind: null, blinkT: 0, blink: false, indArmed: false, wipers: false, wiperT: 0,
  cam: 0, camYaw: 0, camYawT: 0, shake: 0, cine: null,
  gAng: 0.9, gDrag: null, gTab: 'model', pending: null, gRadius: 11, gHeight: 4.2, gAutoRotate: true, gFocus: { x: 0, y: 2.4, z: 0 },
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
  const tip = !g && S.rollover ? S.tipSide * 1.35 : 0, tipY = tip ? 1.25 : 0; // 翻車：整台倒在地上
  rig.tractor.position.set(x, y + S.bump + S.suspension + tipY, z);
  rig.tractor.rotation.set(S.pitch * 0.25 + pT, h, S.roll * 0.25 + tip);
  rig.cab.rotation.set(S.pitch, 0, S.roll);
  rig.trailer.position.set(x, y + S.bump * 0.6 + S.suspension * 0.55 + tipY, z);
  rig.trailer.rotation.set(pTr, th, tip);
  rig.trailerBody.rotation.set(0, 0, S.roll * 0.6);
}

// ================= 送貨任務 =================
const CARGOS = [
  { n: '🍌 香蕉', t: 14 }, { n: '🚗 小汽車', t: 10 }, { n: '🍦 冰淇淋', t: 12 }, { n: '🔩 鋼筋', t: 24 }, { n: '🧱 水泥', t: 22 },
  { n: '🧸 玩具', t: 6 }, { n: '🍉 西瓜', t: 16 }, { n: '🦖 恐龍蛋', t: 8 }, { n: '🏗️ 砂石', t: 26 }, { n: '🎁 禮物', t: 5 },
  { n: '🌲 木頭', t: 20 }, { n: '🐟 魚', t: 15 },
];
const CONTRACTS = [
  { cargo: 0, type: '冷鏈生鮮', multiplier: 1.32, note: '需準時送達，香蕉保鮮運輸' },
  { cargo: 1, type: '高價車輛', multiplier: 1.42, note: '高價貨物，安全抵達最重要' },
  { cargo: 2, type: '冷凍配送', multiplier: 1.5, note: '冰品低溫運送，報酬較高' },
  { cargo: 3, type: '重型鋼材', multiplier: 1.22, note: '重載貨物，考驗爬坡與煞車' },
  { cargo: 7, type: '精密易碎品', multiplier: 1.58, note: '恐龍蛋易碎，零碰撞獎金更重要' },
  { cargo: 9, type: '急件快遞', multiplier: 1.4, note: '高單價急件，適合快速交付' },
  { cargo: 11, type: '水產冷鏈', multiplier: 1.36, note: '魚貨低溫運輸' },
  { cargo: 10, type: '木材運輸', multiplier: 1.14, note: '大型建材，穩定行駛' },
];
function dispatchUnit(id, cargoIndex) {
  const u=save.company.fleetUnits.find(v=>v.id===id); if(!u || u.status!=='idle') return;
  if(u.fuel<0.18){toast(`${u.name} 油量不足，請先補給`);return;}
  if(u.condition<0.25){toast(`${u.name} 車況不佳，請先維修`);return;}
  if((u.fatigue||0)>0.72){toast(`${u.driver} 疲勞過高，請先安排休息`);return;}
  if(!Number.isInteger(cargoIndex)||!CARGOS[cargoIndex]) return;
  let a=Math.floor(Math.random()*DEPOTS.length), b; do{b=Math.floor(Math.random()*DEPOTS.length);}while(a===b);
  const A=DEPOTS[a],B=DEPOTS[b],cargo=CARGOS[cargoIndex],ct=CONTRACTS.find(v=>v.cargo===cargoIndex);
  const dist=Math.hypot(A.x-B.x,A.z-B.z),base=Math.round((80+dist*.45+cargo.t*4)/10)*10;
  u.status='outbound';u.phase='outbound';u.stopTimer=0;u.driverState='執勤中';u.fatigue=clamp(u.fatigue+0.28,0,1);u.eventChecked=false;u.lastEvent='已出車，依導航前往目的地';u.progress=0;u.duration=clamp((58+dist*.12)*(1-save.company.engineLevel*.04),55,145);u.cargoIndex=cargoIndex;u.origin=a;u.destination=b;u.reward=Math.round(base*(ct?ct.multiplier:1));
  logFleetEvent(`${u.name} 派遣：${A.name} → ${B.name}｜${cargo.n}`);persist();traffic.syncFleet(save.company.fleetUnits,save.company.name);renderGarage();toast(`${u.name} 已出車：${A.name} → ${B.name}`);Snd.buy();
}
function serviceFleetUnit(id, kind) {
  const u=save.company.fleetUnits.find(v=>v.id===id);if(!u||u.status!=='idle')return;
  const cost=kind==='fuel'?180:kind==='repair'?260:90;if(save.coins<cost){toast(`金幣不足，還差 ${cost-save.coins} 金幣`);return;}
  save.coins-=cost;save.company.expenses+=cost;logFleetEvent(`${u.name} ${kind==='fuel'?'燃油補給':kind==='repair'?'車輛維修':'司機休息'}｜支出 ${cost}`);if(kind==='fuel')u.fuel=1;else if(kind==='repair')u.condition=1;else {u.fatigue=0;u.driverState='待命';u.lastEvent='司機已完成休息';}
  persist();updateCoins();renderGarage();toast(`${u.name} ${kind==='fuel'?'補給完成':'維修完成'}`);Snd.buy();
}
let dispatchSaveT=0, dispatchUiT=0;
S.followFleetId = null;
function updateDispatchFleet(dt) {
  let changed=false;
  for(const u of save.company.fleetUnits){
    if(u.status!=='outbound'&&u.status!=='returning')continue;
    if(u.phase==='unloading'){u.stopTimer=Math.max(0,(u.stopTimer||0)-dt);if(u.stopTimer<=0){u.status='returning';u.phase='returning';u.driverState='返程中';u.progress=0;u.duration=Math.max(55,u.duration*.82);u.lastEvent='卸貨完成，空車返程';changed=true;}continue;}
    u.progress=Math.min(1,u.progress+dt/u.duration);
    if(u.progress>=1){
      if(u.status==='outbound'){
        if(!u.eventChecked){u.eventChecked=true;if(Math.random()<0.16){u.incidents=(u.incidents||0)+1;u.condition=clamp(u.condition-0.08,0,1);u.lastEvent='途中輪胎／路況異常，已扣除車況並完成安全處置';logFleetEvent(`${u.name} 發生道路事件，車況下降`);toast(`⚠️ ${u.name} 發生道路事件，車隊已通報`);}else{u.lastEvent='貨物安全送達，沒有事故紀錄';}}

        const cargo=CARGOS[u.cargoIndex]||CARGOS[0],origin=DEPOTS[u.origin],dest=DEPOTS[u.destination];
        const payout=Math.max(0,u.reward-35);save.coins+=payout;save.company.revenue+=u.reward;save.company.contracts++;u.earned+=u.reward;
        save.company.expenses+=35;save.company.fuelCost=(save.company.fuelCost||0)+35;u.fuel=clamp(u.fuel-.16*(1-save.company.fuelLevel*.1),0,1);u.condition=clamp(u.condition-.025,0,1);
        u.phase='unloading';u.stopTimer=4;u.driverState='裝卸作業';u.progress=1;u.lastEvent=`已抵達 ${dest.name}，正在卸貨`;logFleetEvent(`${u.name} 已抵達 ${dest.name}，完成 ${cargo.n} 交付`);
        toast(`🚛 ${u.name} 已送達 ${dest.name}｜${cargo.n} 淨入帳 +${payout}`);popup(`車隊淨收益 +${payout}`);Snd.coin();
      }else{
        const wage=45, maintenance=25; save.company.wages=(save.company.wages||0)+wage; save.company.maintenance=(save.company.maintenance||0)+maintenance; save.company.expenses+=wage+maintenance; save.coins=Math.max(0,save.coins-wage-maintenance); u.status='idle';u.driverState=u.fatigue>0.72?'需要休息':'待命';u.progress=0;u.cargoIndex=null;u.origin=null;u.destination=null;u.reward=0;u.phase='outbound';u.lastEvent=`已返抵物流中心｜司機薪資 ${wage}、保養 ${maintenance}`;u.eventChecked=false;logFleetEvent(`${u.name} 完成往返任務｜薪資 ${wage}、保養 ${maintenance}`);toast(`🚛 ${u.name} 已返抵｜薪資與保養支出 ${wage+maintenance}`);
      }
      changed=true;
    }
  }
  dispatchSaveT+=dt;dispatchUiT+=dt;
  if(changed||dispatchSaveT>=5){dispatchSaveT=0;persist();updateCoins();}
  if(dispatchUiT>=1.2){dispatchUiT=0;if(inGarage()&&S.gTab==='company'&&!$('#gBody').contains(document.activeElement))renderGarage();} // 正在選貨物／改車牌時不要重畫，不然選單會被關掉
}
function newMission(fromIdx = null, cargoIdx = null) {
  const r = Math.random;
  const a = fromIdx ?? Math.floor(r() * DEPOTS.length);
  let b; do { b = Math.floor(r() * DEPOTS.length); } while (b === a);
  if (cargoIdx == null && Number.isInteger(save.company.queuedCargo)) cargoIdx = save.company.queuedCargo;
  save.company.queuedCargo = null;
  const A = DEPOTS[a], B = DEPOTS[b], c = CARGOS[cargoIdx == null ? Math.floor(r() * CARGOS.length) : clamp(cargoIdx, 0, CARGOS.length - 1)];
  const contract = CONTRACTS.find(v => CARGOS[v.cargo] === c) || null;
  const dist = Math.hypot(A.x - B.x, A.z - B.z);
  const base = Math.round((80 + dist * 0.45 + c.t * 4) / 10) * 10;
  const reward = Math.round(base * (contract ? contract.multiplier : 1));
  S.mission = { from: a, to: b, cargo: c.n, tons: c.t, stage: 'pickup', reward, baseReward: base, contractType: contract ? contract.type : '一般貨運', wait: 0 };
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
      const fleetGross = Math.max(0, save.company.trucks - 1) * 120;
      const fleetCost = Math.max(0, save.company.trucks - 1) * 45;
      const payout = m.reward + bonus + fleetGross - fleetCost;
      save.coins += payout; save.deliveries++;
      save.company.revenue += m.reward + bonus + fleetGross;
      save.company.expenses += fleetCost; save.company.contracts++;
      persist(); updateCoins();
      Snd.coin(); setTimeout(() => Snd.buy(), 350); popup(`💰 +${payout}`);
      toast(`送達！${m.contractType || '一般貨運'}｜車隊營收 +${fleetGross - fleetCost}｜累計第 ${save.deliveries} 趟`);
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); releaseAll(); Snd.suspend(); } else Snd.resume(); });
window.addEventListener('beforeunload', () => persist());
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
function switchCam() { S.followFleetId = null; S.cam = (S.cam + 1) % 4; S.camYaw = 0; S.cine = null; toast('📷 ' + CAM_NAMES[S.cam], 1000); }
function resetTruck() {
  Object.assign(S, { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading, trailerHeading: SPAWN.heading, v: 0, steer: 0, gear: 1, y: 0, yA: 0, grade: 0, tunNear: false, tollSide: null, tollPaid: false, roll: 0, rollV: 0, rollover: false, rolloverWarned: false, tipT: 0, tipSide: 1 });
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
    <div class="e-sec">車流（換了會重新載入）</div><div class="opts">${b('traffic', 'few', '少')}${b('traffic', 'normal', '中')}${b('traffic', 'many', '多（會塞車）')}</div>
    <div class="e-sec">畫質（換了會重新載入）</div><div class="opts">${b('quality', 'high', '高（電腦）')}${b('quality', 'low', '順（手機平板）')}</div>`;
}
$('#envBody').addEventListener('click', (e) => {
  const o = e.target.closest('.opt'); if (!o) return;
  const { kind, id } = o.dataset;
  if (kind === 'quality' || kind === 'traffic') { if (save.settings[kind] !== id) { save.settings[kind] = id; persist(); location.reload(); } return; }
  save.settings[kind] = id; S.lightsManual = false; persist(); applyEnv(); renderEnvPanel();
});
$('#envClose').onclick = () => $('#envPanel').classList.add('hidden');

// ---- 車庫 ----
const TABS = [
  { id: 'model', name: '🚛 車型' }, { id: 'paint', name: '🎨 烤漆' }, { id: 'studio', name: '🖌️ 噴漆工坊' }, { id: 'pattern', name: '🔥 彩繪' },
  { id: 'parts', name: '🔧 零件' }, { id: 'fun', name: '📯 喇叭燈' }, { id: 'trailer', name: '📦 拖車' },
  { id: 'fleet', name: '🏆 收藏車庫' }, { id: 'company', name: '🏢 物流經營' },
];
function openGarage() {
  if (S.mode !== 'drive') return;
  if (Math.abs(S.v) > 3) { toast('先停車再進改裝廠'); return; }
  S.mode = 'garage'; S.v = 0; releaseAll();
  draft = { ...save.truck }; S.pending = null; S.gAng = 0.9; S.gRadius = 11; S.gHeight = 4.2; S.gAutoRotate = true; S.gFocus = { ...SHOWROOM_FOCI.overview };
  $('#rotateToggle').classList.add('active'); $('#rotateToggle').textContent = '⟳ 自動旋轉';
  env.setIndoor(true); setShowroomLights(true);
  $('#garage').classList.remove('hidden'); $('#showroomHud').classList.remove('hidden'); $('#touch').classList.add('hidden'); $('#hud').classList.add('hidden'); $('#envPanel').classList.add('hidden');
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
  $('#garage').classList.add('hidden'); $('#showroomHud').classList.add('hidden'); $('#touch').classList.remove('hidden'); $('#hud').classList.remove('hidden');
}
$('#gExit').onclick = () => closeGarage();
function setShowroomView(view) {
  S.gAutoRotate = false;
  $('#rotateToggle').classList.remove('active'); $('#rotateToggle').textContent = '▶ 手動旋轉';
  if (view === 'front') focusShowroomPart('front');
  else if (view === 'side') focusShowroomPart('side');
  else if (view === 'rear') focusShowroomPart('rear');
  else if (view === 'high') focusShowroomPart('roof');
  else { focusShowroomPart('overview', false); S.gAutoRotate = true; $('#rotateToggle').classList.add('active'); $('#rotateToggle').textContent = '⟳ 自動旋轉'; }
}
$('#viewFront').onclick = () => setShowroomView('front');
$('#viewSide').onclick = () => setShowroomView('side');
$('#viewRear').onclick = () => setShowroomView('rear');
$('#viewHigh').onclick = () => setShowroomView('high');
$('#viewReset').onclick = () => setShowroomView('reset');
$('#showroomHud').addEventListener('click', (e) => { const b = e.target.closest('[data-focus]'); if (!b) return; focusShowroomPart(b.dataset.focus); });
$('#zoomIn').onclick = () => { S.gRadius = clamp(S.gRadius - 1.5, 6.5, 19); S.gAutoRotate = false; $('#rotateToggle').classList.remove('active'); $('#rotateToggle').textContent = '▶ 手動旋轉'; };
$('#zoomOut').onclick = () => { S.gRadius = clamp(S.gRadius + 1.5, 6.5, 19); S.gAutoRotate = false; $('#rotateToggle').classList.remove('active'); $('#rotateToggle').textContent = '▶ 手動旋轉'; };
$('#rotateToggle').onclick = () => { S.gAutoRotate = !S.gAutoRotate; $('#rotateToggle').classList.toggle('active', S.gAutoRotate); $('#rotateToggle').textContent = S.gAutoRotate ? '⟳ 自動旋轉' : '▶ 手動旋轉'; };
canvas.addEventListener('wheel', (e) => { if (!inGarage()) return; e.preventDefault(); S.gRadius = clamp(S.gRadius + Math.sign(e.deltaY) * 1.1, 6.5, 19); S.gAutoRotate = false; $('#rotateToggle').classList.remove('active'); $('#rotateToggle').textContent = '▶ 手動旋轉'; }, { passive: false });
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
  else if (S.gTab === 'studio') h = `<div class="studio-intro"><b>PAINT LAB / 客製烤漆工作室</b><small>即時套用車頭與拖車顏色、雙色漸層及彩繪配置</small></div>
    ${secHtml('車頭主色')}<div class="studio-color-row"><label>主色 <input type="color" data-studio="cabColor" value="${draft.cabColor}"></label><label>第二色 <input type="color" data-studio="cabColor2" value="${draft.cabColor2 || '#ffb000'}"></label></div>
    <label class="studio-select">車頭漸層方向<select data-studio="cabGradient"><option value="off" ${draft.cabGradient === 'off' ? 'selected' : ''}>單色烤漆</option><option value="horizontal" ${draft.cabGradient === 'horizontal' ? 'selected' : ''}>左右雙色漸層</option><option value="vertical" ${draft.cabGradient === 'vertical' ? 'selected' : ''}>上下雙色漸層</option></select></label>
    ${secHtml('拖車主色')}<div class="studio-color-row"><label>主色 <input type="color" data-studio="trailerColor" value="${draft.trailerColor}"></label><label>第二色 <input type="color" data-studio="trailerColor2" value="${draft.trailerColor2 || '#9aa7b4'}"></label></div>
    <label class="studio-select">拖車漸層方向<select data-studio="trailerGradient"><option value="off" ${draft.trailerGradient === 'off' ? 'selected' : ''}>單色烤漆</option><option value="horizontal" ${draft.trailerGradient === 'horizontal' ? 'selected' : ''}>左右雙色漸層</option><option value="vertical" ${draft.trailerGradient === 'vertical' ? 'selected' : ''}>上下雙色漸層</option></select></label>
    ${secHtml('特殊烤漆效果')} ${cardsHtml('paint')}
    ${secHtml('車頭彩繪顏色')}<div class="studio-color-row single"><label>圖案顏色 <input type="color" data-studio="patternColor" value="${draft.patternColor}"></label></div>
    ${secHtml('車頭彩繪圖案')} ${cardsHtml('pattern')}
    ${secHtml('拖車彩繪顏色')}<div class="studio-color-row single"><label>圖案顏色 <input type="color" data-studio="trailerPatColor" value="${draft.trailerPatColor}"></label></div>
    ${secHtml('拖車彩繪圖案')} ${cardsHtml('trailerPattern')}
    ${secHtml('E / 自訂圖片彩繪設計器')}
    <div class="art-editor" data-art-editor="cab">
      <b>車頭彩繪貼圖</b><small>支援 PNG、JPG、WebP，透明 PNG 最適合做車身貼花。</small>
      <label class="art-upload">選擇車頭彩繪圖片<input type="file" accept="image/png,image/jpeg,image/webp" data-art-upload="cab"></label>
      <canvas class="art-preview" width="680" height="210" data-art-preview="cab"></canvas>
      <div class="art-controls"><label>左右位置 <input type="range" min="-0.45" max="0.45" step="0.01" data-art="cabDecalX" value="${draft.cabDecalX || 0}"></label><label>上下位置 <input type="range" min="-0.45" max="0.45" step="0.01" data-art="cabDecalY" value="${draft.cabDecalY || 0}"></label><label>圖案大小 <input type="range" min="0.08" max="0.9" step="0.01" data-art="cabDecalScale" value="${draft.cabDecalScale || 0.34}"></label><label>旋轉角度 <input type="range" min="-180" max="180" step="1" data-art="cabDecalRotation" value="${draft.cabDecalRotation || 0}"></label></div>
      <button class="art-remove" data-art-remove="cab">移除車頭圖片</button>
    </div>
    <div class="art-editor" data-art-editor="trailer">
      <b>拖車彩繪貼圖</b><small>可獨立上傳與定位，車頭與拖車不會互相覆蓋。</small>
      <label class="art-upload">選擇拖車彩繪圖片<input type="file" accept="image/png,image/jpeg,image/webp" data-art-upload="trailer"></label>
      <canvas class="art-preview" width="680" height="210" data-art-preview="trailer"></canvas>
      <div class="art-controls"><label>左右位置 <input type="range" min="-0.45" max="0.45" step="0.01" data-art="trailerDecalX" value="${draft.trailerDecalX || 0}"></label><label>上下位置 <input type="range" min="-0.45" max="0.45" step="0.01" data-art="trailerDecalY" value="${draft.trailerDecalY || 0}"></label><label>圖案大小 <input type="range" min="0.08" max="0.9" step="0.01" data-art="trailerDecalScale" value="${draft.trailerDecalScale || 0.42}"></label><label>旋轉角度 <input type="range" min="-180" max="180" step="1" data-art="trailerDecalRotation" value="${draft.trailerDecalRotation || 0}"></label></div>
      <button class="art-remove" data-art-remove="trailer">移除拖車圖片</button>
    </div>
    <div class="studio-note">圖片會縮圖後保存在本機存檔。可在預覽區直接拖曳圖案定位，也可用滑桿微調；車頭與拖車各自獨立儲存。</div>`;
  else if (S.gTab === 'pattern') h = secHtml('彩繪圖案') + cardsHtml('pattern') + secHtml('彩繪顏色（免費換）') + swatchHtml('patternColor');
  else if (S.gTab === 'parts') h = ['bumper', 'rims', 'stacks', 'lightbar', 'visor', 'spoiler'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('');
  else if (S.gTab === 'fun') h = ['horn', 'glow'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('');
  else if (S.gTab === 'trailer') {
    h = secHtml('拖車顏色（免費換）') + swatchHtml('trailerColor') + secHtml('拖車彩繪（買過的圖案都能用）') + cardsHtml('trailerPattern')
      + secHtml('拖車彩繪顏色（免費換）') + swatchHtml('trailerPatColor')
      + secHtml('寫在拖車上的名字（最多 8 個字）') + `<input class="name-in" id="nameIn" maxlength="8" value="${escapeHtml(draft.name)}" placeholder="例如：小明號">`;
  }
  else if (S.gTab === 'fleet') {
    h = `<div class="fleet-intro"><b>TRUCK COLLECTION / 專屬卡車收藏</b><small>把目前改裝完成的卡車保存成獨立車款。載入收藏不會覆蓋其他收藏；最多保存 8 台。</small><button class="fleet-save-current" data-fleet-save>＋ 收藏目前卡車</button><div class="fleet-count">收藏數：${save.fleet.length} / 8</div></div>`;
    h += save.fleet.length ? `<div class="fleet-grid">${save.fleet.map(v => `<article class="fleet-card"><div class="fleet-photo">${v.photo ? `<img src="${v.photo}" alt="${escapeHtml(v.name)} 展示照">` : '<span>🚛</span><small>尚未拍攝展示照</small>'}</div><div class="fleet-card-info"><input class="fleet-name" maxlength="16" value="${escapeHtml(v.name)}" aria-label="卡車名稱" data-fleet-name="${v.id}"><small>${escapeHtml(v.truck.cabStyle === 'us' ? '美式長鼻' : '歐式平頭')}・${escapeHtml(v.truck.trailerType || 'box')}・${escapeHtml(v.truck.paint || 'normal')} 烤漆</small><div class="fleet-actions"><button data-fleet-load="${v.id}">載入車款</button><button data-fleet-photo="${v.id}">拍攝展示照</button><button class="danger" data-fleet-delete="${v.id}">刪除</button></div></div></article>`).join('')}</div>` : '<div class="fleet-empty">🚛<b>車庫還沒有收藏</b><small>先完成一台喜歡的卡車，再按「收藏目前卡車」。</small></div>';
  }
  else if (S.gTab === 'company') {
    const c = save.company, engineCosts = [3200, 6800, 12500], fuelCosts = [2600, 5600, 9800];
    const truckCost = 15000 + Math.max(0, c.trucks - 1) * 8500;
    const engineLabel = c.engineLevel >= 3 ? '已達最高等級' : `升級至 Lv.${c.engineLevel + 1}｜💰 ${engineCosts[c.engineLevel]}`;
    const fuelLabel = c.fuelLevel >= 3 ? '已達最高等級' : `升級至 Lv.${c.fuelLevel + 1}｜💰 ${fuelCosts[c.fuelLevel]}`;
    const net = c.revenue - c.expenses;
    h = `<div class="company-hero"><div class="company-kicker">LOGISTICS MANAGEMENT / 物流營運中心</div><label>公司名稱<input id="companyName" maxlength="20" value="${escapeHtml(c.name)}"></label><div class="company-stats"><div><small>車隊車輛</small><b>🚛 ${c.trucks} / 5</b></div><div><small>完成趟次</small><b>${c.contracts}</b></div><div><small>累計營收</small><b>💰 ${c.revenue.toLocaleString()}</b></div><div><small>營運淨收益</small><b class="${net >= 0 ? 'positive' : 'negative'}">${net.toLocaleString()}</b></div></div></div>
      <div class="company-section"><b>🚚 車隊擴編</b><small>每完成一趟親自承運的貨運，其他車輛會同步產生營收 120 金幣，並計入 45 金幣營運成本。</small><div class="company-upgrade"><span>新增一台營運卡車<br><small>目前 ${c.trucks} 台｜最多 5 台</small></span><button data-company-action="truck" ${c.trucks >= 5 ? 'disabled' : ''}>${c.trucks >= 5 ? '車隊已滿' : `購買｜💰 ${truckCost}`}</button></div></div>
      <div class="company-section"><b>⚙️ 動力升級</b><small>提升引擎輸出，載重起步與爬坡更有力。</small><div class="level-row"><span>引擎動力 <b>Lv.${c.engineLevel}/3</b></span><button data-company-action="engine" ${c.engineLevel >= 3 ? 'disabled' : ''}>${engineLabel}</button></div></div>
      <div class="company-section"><b>⛽ 節能升級</b><small>改善燃油效率，降低行駛時的油耗。</small><div class="level-row"><span>燃油效率 <b>Lv.${c.fuelLevel}/3</b></span><button data-company-action="fuel" ${c.fuelLevel >= 3 ? 'disabled' : ''}>${fuelLabel}</button></div></div>
      <div class="company-section"><b>📦 貨運合約 / CONTRACT BOARD</b><small>選擇專項貨物承運。若目前尚未裝貨，會以新合約取代原本待接任務；已裝貨則排入下一趟。</small><div class="contract-grid">${CONTRACTS.map((ct,i)=>{const cg=CARGOS[ct.cargo];return `<article class="contract-card"><div><b>${cg.n}</b><span>${ct.type}</span></div><small>${cg.t} 噸｜合約加成 +${Math.round((ct.multiplier-1)*100)}%</small><p>${ct.note}</p><button data-contract="${ct.cargo}">承接合約</button></article>`;}).join('')}</div></div>
      <div class="company-section dispatch-section"><b>🛰️ 車隊即時調度 / LIVE DISPATCH</b><small>派遣後，車輛會以專屬烤漆、公司識別與車牌的 3D 聯結車模型，在市區／國道道路網行駛；路口會遵守號誌，抵達後自動返程。</small>
      ${c.fleetUnits.length ? `<div class="dispatch-list">${c.fleetUnits.map((u)=>{const active=u.status!=='idle',cargo=u.cargoIndex==null?null:CARGOS[u.cargoIndex],a=u.origin==null?null:DEPOTS[u.origin],b=u.destination==null?null:DEPOTS[u.destination];const status=u.phase==='unloading'?'📦 物流站裝卸中':u.status==='outbound'?'🚚 前往送貨':u.status==='returning'?'↩️ 空車返程':'🟢 待命';return `<article class="dispatch-card"><div class="dispatch-top"><b>${escapeHtml(u.name)}</b><span>${status}</span></div><div class="dispatch-meta">司機：${escapeHtml(u.driver)}（${escapeHtml(u.driverState||'待命')}）｜疲勞 ${Math.round((u.fatigue||0)*100)}%｜油量 ${Math.round(u.fuel*100)}%｜車況 ${Math.round(u.condition*100)}%</div><div class="fleet-custom-row"><label>車隊烤漆<select data-fleet-paint="${u.id}"><option value="#b71c1c" ${u.paint==='#b71c1c'?'selected':''}>競速紅</option><option value="#145da0" ${u.paint==='#145da0'?'selected':''}>物流藍</option><option value="#d18a16" ${u.paint==='#d18a16'?'selected':''}>工程金</option><option value="#315b45" ${u.paint==='#315b45'?'selected':''}>森林綠</option><option value="#4b3b78" ${u.paint==='#4b3b78'?'selected':''}>幻彩紫</option><option value="#e5e7eb" ${u.paint==='#e5e7eb'?'selected':''}>珍珠白</option></select></label><label>車牌<input data-fleet-plate="${u.id}" maxlength="10" value="${escapeHtml(u.plate||'')}"></label></div><div class="dispatch-event">📋 ${escapeHtml(u.lastEvent||'車輛狀態正常')}｜事件 ${u.incidents||0} 次</div>${active?`<div class="dispatch-route">${escapeHtml(a?.name||'物流中心')} → ${escapeHtml(b?.name||'目的地')}<button class="dispatch-follow" data-follow-fleet="${u.id}">📍 追蹤車輛</button><small>${escapeHtml(cargo?.n||'貨物')}｜${u.phase==='unloading'?'站點裝卸':u.status==='outbound'?'載貨行駛':'返程'} ${Math.round(u.progress*100)}%</small></div><div class="dispatch-progress"><i style="width:${Math.round(u.progress*100)}%"></i></div>`:`<label class="dispatch-pick">選擇貨物<select data-unit-cargo="${u.id}">${CONTRACTS.map(ct=>`<option value="${ct.cargo}">${CARGOS[ct.cargo].n}｜${ct.type}</option>`).join('')}</select></label><button class="dispatch-go" data-dispatch="${u.id}">派遣出車</button><div class="dispatch-service"><button data-unit-service="fuel" data-unit-id="${u.id}">⛽ 補給 180</button><button data-unit-service="repair" data-unit-id="${u.id}">🔧 維修 260</button><button data-unit-service="rest" data-unit-id="${u.id}">🛌 司機休息 90</button></div>`}<div class="dispatch-earned">累計承運收益：💰 ${u.earned.toLocaleString()}</div></article>`;}).join('')}</div>`:'<div class="fleet-empty"><b>目前沒有可派遣車輛</b><small>先在上方擴編車隊，購買第二台營運卡車。</small></div>'}</div>
      <div class="company-ledger"><b>📊 營運報表</b><div><span>累計貨運營收</span><strong>${c.revenue.toLocaleString()}</strong></div><div><span>車隊營運成本</span><strong>${c.expenses.toLocaleString()}</strong></div><div><span>燃油／承運成本</span><strong>${(c.fuelCost||0).toLocaleString()}</strong></div><div><span>司機薪資累計</span><strong>${(c.wages||0).toLocaleString()}</strong></div><div><span>車輛保養累計</span><strong>${(c.maintenance||0).toLocaleString()}</strong></div><div><span>營運淨收益</span><strong>${net.toLocaleString()}</strong></div><div><span>遊戲總送貨趟次</span><strong>${save.deliveries}</strong></div></div><div class="company-ledger fleet-history"><b>🧾 車隊營運歷史</b>${c.fleetLog?.length?c.fleetLog.slice(0,10).map(v=>`<div><span>${new Date(v.time).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}｜${escapeHtml(v.message)}</span></div>`).join(''):'<small>尚無車隊紀錄，派遣第一趟任務後會顯示。</small>'}</div>`;
  }
  $('#gBody').innerHTML = h;
  const nameIn = $('#nameIn'); if (nameIn) nameIn.addEventListener('input', onNameInput);
  setupArtEditors();
  $('#gService').innerHTML = `
    <button data-svc="wash">🧽 洗車<small>${save.dirt > 0.05 ? '免費' : '很乾淨'}</small></button>
    <button data-svc="repair">🔧 修理<small>${save.damage > 0.01 ? '💰 ' + repairCost() : '沒壞'}</small></button>
    <button data-svc="fuel">⛽ 加油<small>${save.fuel < 0.99 ? '💰 ' + fuelCost() : '滿的'}</small></button>`;
  renderBuyBar(); updateCoins();
}
function artPreviewDraw(kind) {
  const canvas = document.querySelector(`[data-art-preview="${kind}"]`); if (!canvas) return;
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h); ctx.fillStyle = '#101923'; ctx.fillRect(0,0,w,h);
  // stylized side-panel template for decal placement
  ctx.fillStyle = '#344453'; ctx.strokeStyle = '#8293a3'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(28,30,w-56,h-60,12); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(220,230,240,.22)'; ctx.lineWidth = 2;
  for (let x=65;x<w-50;x+=54) { ctx.beginPath();ctx.moveTo(x,34);ctx.lineTo(x,h-34);ctx.stroke(); }
  const key = kind === 'cab' ? 'cabDecal' : 'trailerDecal';
  const data = draft[key+'Data'];
  if (data) {
    const img = new Image(); img.onload=()=>{
      const x = w*(.5+(draft[key+'X']||0)), y=h*(.5+(draft[key+'Y']||0));
      const maxW=(w-100)*(draft[key+'Scale']||.4), ratio=Math.min(maxW/img.width, (h-70)*(draft[key+'Scale']||.4)/img.height);
      ctx.save();ctx.translate(x,y);ctx.rotate((draft[key+'Rotation']||0)*Math.PI/180);ctx.drawImage(img,-img.width*ratio/2,-img.height*ratio/2,img.width*ratio,img.height*ratio);ctx.restore();
      ctx.strokeStyle='#f7b84b';ctx.setLineDash([7,5]);ctx.strokeRect(x-maxW/2,y-(h-70)*(draft[key+'Scale']||.4)/2,maxW,(h-70)*(draft[key+'Scale']||.4));ctx.setLineDash([]);
    }; img.src=data;
  } else { ctx.fillStyle='#c3ced8';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillText('上傳彩繪圖片後，在此拖曳定位',w/2,h/2); }
}
function setupArtEditors() {
  for (const kind of ['cab','trailer']) {
    const canvas=document.querySelector(`[data-art-preview="${kind}"]`); if (!canvas) continue;
    artPreviewDraw(kind);
    if (canvas.dataset.bound) continue; canvas.dataset.bound='1';
    let drag=null;
    canvas.addEventListener('pointerdown',e=>{ const key=kind==='cab'?'cabDecal':'trailerDecal'; if(!draft[key+'Data']) return; drag={x:e.clientX,y:e.clientY,ox:draft[key+'X']||0,oy:draft[key+'Y']||0};canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove',e=>{if(!drag)return;const key=kind==='cab'?'cabDecal':'trailerDecal';const r=canvas.getBoundingClientRect();draft[key+'X']=clamp(drag.ox+(e.clientX-drag.x)/r.width,-.45,.45);draft[key+'Y']=clamp(drag.oy+(e.clientY-drag.y)/r.height,-.45,.45);save.truck[key+'X']=draft[key+'X'];save.truck[key+'Y']=draft[key+'Y'];const x=document.querySelector(`[data-art="${key}X"]`),y=document.querySelector(`[data-art="${key}Y"]`);if(x)x.value=draft[key+'X'];if(y)y.value=draft[key+'Y'];artPreviewDraw(kind);});
    const end=()=>{if(drag){drag=null;persist();rebuildRig(draft);}};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  }
}
$('#gBody').addEventListener('change', async e=>{
  const up=e.target.closest('[data-art-upload]'); if(up){
    const file=up.files&&up.files[0]; if(!file)return;
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)){toast('請選擇 PNG、JPG 或 WebP 圖片');up.value='';return;}
    if(file.size>12*1024*1024){toast('圖片請小於 12 MB');up.value='';return;}
    const data=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file);});
    const img=new Image();img.onload=()=>{const scale=Math.min(1,512/img.width,384/img.height),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);const compact=c.toDataURL('image/webp',.82);const kind=up.dataset.artUpload,key=kind==='cab'?'cabDecal':'trailerDecal';draft[key+'Data']=compact;save.truck[key+'Data']=compact;persist();rebuildRig(draft);renderGarage();toast('彩繪圖片已套用並儲存');};img.onerror=()=>toast('圖片讀取失敗，請換一張圖片');img.src=data;return;
  }
  const range=e.target.closest('[data-art]');if(range){const key=range.dataset.art;draft[key]=Number(range.value);save.truck[key]=draft[key];persist();const kind=key.startsWith('cab')?'cab':'trailer';artPreviewDraw(kind);rebuildRig(draft);focusShowroomPart(kind==='cab'?'paint':'trailer');}
});
$('#gBody').addEventListener('click',e=>{const b=e.target.closest('[data-art-remove]');if(!b)return;const key=b.dataset.artRemove==='cab'?'cabDecal':'trailerDecal';draft[key+'Data']='';save.truck[key+'Data']='';persist();rebuildRig(draft);renderGarage();toast('已移除彩繪圖片');});

// F：多台卡車收藏、切換與展示照
function saveCurrentToFleet() {
  if (save.fleet.length >= 8) { toast('收藏車庫已滿（最多 8 台），請先刪除一台'); return; }
  const entry = { id: `truck-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name: String(draft.name || '我的卡車').slice(0,16), truck: JSON.parse(JSON.stringify(draft)), photo: '', savedAt: Date.now() };
  save.fleet.unshift(entry);
  if (!persist()) { save.fleet.shift(); toast('儲存空間不足，請移除大型彩繪圖片或刪除部分收藏'); return; }
  renderGarage(); toast(`🏆 已收藏「${entry.name}」`);
}
function loadFleetTruck(id) {
  const entry = save.fleet.find(v => v.id === id); if (!entry) return;
  save.truck = { ...DEFAULT_TRUCK, ...JSON.parse(JSON.stringify(entry.truck)) };
  for (const k of ITEM_KEYS) if (!isOwned(k, save.truck[k])) save.truck[k] = DEFAULT_TRUCK[k];
  draft = { ...save.truck }; persist(); rebuildRig(save.truck); S.pending = null;
  focusShowroomPart('overview', false); renderGarage(); toast(`🚛 已載入「${entry.name}」`);
}
function captureFleetPhoto(id, afterLoad = false) {
  const entry = save.fleet.find(v => v.id === id); if (!entry) return;
  if (!afterLoad) { loadFleetTruck(id); requestAnimationFrame(() => captureFleetPhoto(id, true)); return; }
  try {
    renderer.render(scene, camera); // 沒有保留畫面緩衝：拍照前馬上重畫一次再複製
    const src = renderer.domElement, c = document.createElement('canvas'), w = 400, h = 250; c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#101820'; ctx.fillRect(0,0,w,h);
    const scale = Math.min(w/src.width, h/src.height), dw = src.width*scale, dh = src.height*scale; ctx.drawImage(src,(w-dw)/2,(h-dh)/2,dw,dh);
    entry.photo = c.toDataURL('image/jpeg',0.72);
    if (!persist()) { entry.photo = ''; toast('展示照太大，儲存空間不足'); return; }
    renderGarage(); toast(`📸 已更新「${entry.name}」展示照`);
  } catch (err) { toast('拍照失敗，請重新進入展示間後再試'); }
}
$('#gBody').addEventListener('click', e => {
  const saveBtn=e.target.closest('[data-fleet-save]'); if(saveBtn){saveCurrentToFleet();return;}
  const loadBtn=e.target.closest('[data-fleet-load]'); if(loadBtn){loadFleetTruck(loadBtn.dataset.fleetLoad);return;}
  const photoBtn=e.target.closest('[data-fleet-photo]'); if(photoBtn){captureFleetPhoto(photoBtn.dataset.fleetPhoto);return;}
  const delBtn=e.target.closest('[data-fleet-delete]'); if(delBtn){const i=save.fleet.findIndex(v=>v.id===delBtn.dataset.fleetDelete);if(i>=0){const [removed]=save.fleet.splice(i,1);if(!persist()){save.fleet.splice(i,0,removed);toast('刪除失敗，儲存空間異常');return;}renderGarage();toast('已刪除收藏車款');}return;}
});
$('#gBody').addEventListener('change', e => { const input=e.target.closest('[data-fleet-name]'); if(!input)return; const entry=save.fleet.find(v=>v.id===input.dataset.fleetName); if(!entry)return; entry.name=String(input.value||'我的卡車').slice(0,16); persist(); toast('車款名稱已更新'); });
$('#gBody').addEventListener('change', e => { const paint=e.target.closest('[data-fleet-paint]'); const plate=e.target.closest('[data-fleet-plate]'); if(paint){const u=save.company.fleetUnits.find(v=>v.id===paint.dataset.fleetPaint);if(u){u.paint=paint.value;persist();traffic.syncFleet(save.company.fleetUnits,save.company.name);toast(`${u.name} 車隊烤漆已更新`);}} if(plate){const u=save.company.fleetUnits.find(v=>v.id===plate.dataset.fleetPlate);if(u){u.plate=String(plate.value||'').replace(/[^a-zA-Z0-9-]/g,'').slice(0,10)||'BK-000';persist();traffic.syncFleet(save.company.fleetUnits,save.company.name);toast(`${u.name} 車牌已更新`);}} });


// G：物流公司、車隊擴編、貨運合約與車輛升級
$('#gBody').addEventListener('click', e => {
  const follow=e.target.closest('[data-follow-fleet]');if(follow){S.followFleetId=follow.dataset.followFleet;closeGarage();toast('📍 已切換至車隊追蹤鏡頭');return;}
  const dispatch=e.target.closest('[data-dispatch]');if(dispatch){const id=dispatch.dataset.dispatch,select=$(`[data-unit-cargo="${id}"]`);dispatchUnit(id,Number(select?.value));return;}
  const service=e.target.closest('[data-unit-service]');if(service){serviceFleetUnit(service.dataset.unitId,service.dataset.unitService);return;}
  const action = e.target.closest('[data-company-action]');
  if (action) {
    const c = save.company, kind = action.dataset.companyAction;
    const costs = { engine: [3200, 6800, 12500], fuel: [2600, 5600, 9800] };
    let cost = 0, message = '';
    if (kind === 'truck') {
      if (c.trucks >= 5) return;
      cost = 15000 + Math.max(0, c.trucks - 1) * 8500;
      if (save.coins < cost) { toast(`金幣不足，還差 ${cost - save.coins} 金幣`); return; }
      save.coins -= cost; c.trucks++; c.expenses += cost; c.fleetUnits.push(createFleetUnit(c.fleetUnits.length)); traffic.syncFleet(c.fleetUnits,c.name); message = `車隊擴編完成！現在有 ${c.trucks} 台營運卡車，已新增實體車隊單位`;
    } else if (kind === 'engine' || kind === 'fuel') {
      const key = kind === 'engine' ? 'engineLevel' : 'fuelLevel';
      if (c[key] >= 3) return;
      cost = costs[kind][c[key]];
      if (save.coins < cost) { toast(`金幣不足，還差 ${cost - save.coins} 金幣`); return; }
      save.coins -= cost; c[key]++; c.expenses += cost;
      message = kind === 'engine' ? `引擎動力升級至 Lv.${c[key]}` : `燃油效率升級至 Lv.${c[key]}`;
    }
    persist(); updateCoins(); renderGarage(); toast(message); Snd.buy(); return;
  }
  const contractBtn = e.target.closest('[data-contract]');
  if (contractBtn) {
    const cargoIndex = Number(contractBtn.dataset.contract);
    if (!Number.isInteger(cargoIndex) || !CARGOS[cargoIndex]) return;
    if (S.mission && S.mission.stage === 'deliver') {
      save.company.queuedCargo = cargoIndex; persist();
      toast(`${CARGOS[cargoIndex].n} 已排入下一趟貨運合約`);
    } else {
      newMission(null, cargoIndex); persist();
      toast(`已承接${(CONTRACTS.find(v=>v.cargo===cargoIndex)||{}).type || '貨運'}合約，導航已更新`);
    }
    S.gTab = 'company'; renderGarage(); return;
  }
});
$('#gBody').addEventListener('change', e => {
  const name = e.target.closest('#companyName');
  if (name) { save.company.name = String(name.value || '我的物流公司').trim().slice(0,20) || '我的物流公司'; persist(); traffic.syncFleet(save.company.fleetUnits,save.company.name); toast('物流公司名稱已儲存，車隊側邊識別同步更新'); }
});

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
  if (sw) { draft[sw.dataset.key] = sw.dataset.col; save.truck[sw.dataset.key] = sw.dataset.col; persist(); Snd.click(); focusShowroomPart(focusForItem(sw.dataset.key)); rebuildRig(draft); renderGarage(); return; }
  const c = e.target.closest('.card'); if (c) selectItem(c.dataset.cat, c.dataset.id);
});
$('#gBody').addEventListener('change', (e) => {
  const el = e.target.closest('[data-studio]'); if (!el) return;
  const key = el.dataset.studio; draft[key] = el.value; save.truck[key] = el.value; persist();
  focusShowroomPart(key.startsWith('trailer') ? 'trailer' : 'paint'); rebuildRig(draft); Snd.click();
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
// 依照改裝項目自動將展示鏡頭移到適合的位置（座標以車頭/車身中心為基準）
const SHOWROOM_FOCI = {
  overview: { ang: 0.9, radius: 11, height: 4.2, x: 0, y: 2.4, z: 0 },
  front:    { ang: 0, radius: 8.2, height: 2.8, x: 0, y: 1.5, z: 5.0 },
  side:     { ang: Math.PI / 2, radius: 9.0, height: 3.0, x: 0.8, y: 1.6, z: 1.5 },
  rear:     { ang: Math.PI, radius: 8.5, height: 3.2, x: 0, y: 1.8, z: -4.5 },
  roof:     { ang: 0.45, radius: 10.5, height: 8.0, x: 0, y: 3.4, z: 3.0 },
  wheel:    { ang: Math.PI / 2, radius: 6.8, height: 1.8, x: 1.05, y: 0.9, z: 3.6 },
  exhaust:  { ang: Math.PI * 0.72, radius: 7.5, height: 4.2, x: 0.9, y: 3.0, z: -0.4 },
  trailer:  { ang: Math.PI / 2, radius: 12.5, height: 5.2, x: 0, y: 2.6, z: -7.0 },
  paint:    { ang: 0.72, radius: 9.2, height: 4.0, x: 0, y: 2.6, z: 1.0 },
};
function focusShowroomPart(key, manual = true) {
  const f = SHOWROOM_FOCI[key] || SHOWROOM_FOCI.overview;
  S.gAng = f.ang; S.gRadius = f.radius; S.gHeight = f.height;
  S.gFocus = { x: f.x, y: f.y, z: f.z };
  if (manual) {
    S.gAutoRotate = false;
    $('#rotateToggle').classList.remove('active');
    $('#rotateToggle').textContent = '▶ 手動旋轉';
  }
  document.querySelectorAll('[data-focus]').forEach((b) => b.classList.toggle('active', b.dataset.focus === key));
}
function focusForItem(cat) {
  if (cat === 'rims') return 'wheel';
  if (cat === 'bumper') return 'front';
  if (cat === 'stacks') return 'exhaust';
  if (cat === 'lightbar' || cat === 'visor' || cat === 'spoiler') return 'roof';
  if (cat === 'trailerType' || cat === 'trailerPattern') return 'trailer';
  if (cat === 'cabStyle') return 'front';
  if (cat === 'paint' || cat === 'pattern' || cat === 'cabColor' || cat === 'patternColor') return 'paint';
  if (cat === 'glow') return 'side';
  return 'overview';
}

function selectItem(cat, id) {
  Snd.init();
  if (S.pending && S.pending.cat !== cat) draft[S.pending.cat] = save.truck[S.pending.cat];
  draft[cat] = id;
  if (isOwned(cat, id)) { save.truck[cat] = id; persist(); S.pending = null; Snd.click(); } else S.pending = { cat, id };
  if (cat === 'horn') Snd.horn(id);
  focusShowroomPart(focusForItem(cat));
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
  const cars = traffic.circles(), up = S.y > 2.5; // 在高架橋上：不會撞到橋下的車和東西
  const rp = rigPoints(x, z, h, th);
  for (let k = 0; k < rp.length; k++) {
    const p = rp[k];
    const out = Math.abs(p.x) > WORLD - p.r || Math.abs(p.z) > WORLD - p.r;
    if ((out || !inCity(p.x, p.z)) && hwBlocked(p.x, p.z, p.r)) return { wall: true }; // 城外只能走國道（市區邊緣外那一圈也一樣）
    if (k < 3 && !out && inCity(p.x, p.z) && Math.abs(groundAt(p.x, p.z, S.y) - S.y) > 2.5) return { wall: true }; // 橋邊有護欄，不會掉下去（拖車尾巴轉彎時會稍微超出橋面，不算）
    if (!out && !up) for (const b of boxes) {
      if (b.top !== undefined && S.y > b.top - 2.5) continue; // 橋墩：開在橋面上的車不會撞到下面的橋墩
      const cx = clamp(p.x, b.minx, b.maxx), cz = clamp(p.z, b.minz, b.maxz);
      if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < p.r * p.r) return { wall: true };
    }
    for (const c of cars) if (Math.abs((c.y ?? 0) - S.y) < 2.5 && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (p.r + c.r) ** 2) return { car: c.car };
  }
  return null;
}
function drive(dt) {
  S.hint = '';
  if (S.rollover) { S.v = 0; S.thr = 0; S.hint = '翻車了！按 🔄（或 R）回到改裝廠'; return; }
  const tons = cargoTons(), mass = 16500 + tons * 1000;
  const surf = surfaceAt(S.x, S.z); S.lastSurface = surf;
  const wet = env.state.wet;
  const loadGrip = clamp(1 - tons * 0.0035, 0.88, 1);
  const grip = (surf === 'road' ? 1 : surf === 'gravel' ? 0.72 : 0.78) * (wet ? 0.78 : 1) * loadGrip;
  const crr = surf === 'road' ? 0.008 : surf === 'gravel' ? 0.042 : 0.028;
  S.speedLimit = speedLimitAt(S.x, S.z, S.y);
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
    F = accelPedal * torque(S.rpm) * (1 + save.company.engineLevel * 0.08) * ratio * FINAL * EFF / RW * power;
    F = Math.min(F, 2.6 * mass * grip); // 抓地力上限
    if (!rev && S.v > VMAX + save.company.engineLevel * 0.7) F = 0;
    if (rev && S.v < -4) F = 0;
    if (rev) F = -F;
  }
  const dir = Math.sign(S.v);
  const resist = crr * mass * 9.81 + 3.3 * S.v * S.v + (accelPedal < 0.05 ? 0.035 * mass * Math.min(1, Math.abs(S.v)) : 0);
  let a = F / mass - dir * resist / mass - 9.81 * S.grade; // 上坡變慢、下坡變快
  const legalSpeed = S.speedLimit / 3.6;
  if (!rev && S.v > legalSpeed) a -= Math.min(2.8, (S.v - legalSpeed) * 1.35); // 依道路速限進行引擎煞車，不突然鎖死車速
  if (!rev && S.v > VMAX + save.company.engineLevel * 0.7 + 0.3) a -= (S.v - (VMAX + save.company.engineLevel * 0.7)) * 1.5;
  if (rev && S.v < -5) a += (-5 - S.v) * 1.5; // 倒車下坡也不會越倒越快
  // 煞車：重車煞車距離比較長
  const fade = 1 - clamp((S.brakeTemp - 0.45) * 0.62, 0, 0.38);
  const brakeDecel = brakePedal * 5.8 * grip * (1 - tons / 90) * fade;
  S.v += a * dt;
  if (brakeDecel > 0) { const dv = brakeDecel * dt; S.v = Math.abs(S.v) <= dv ? 0 : S.v - Math.sign(S.v) * dv; }
  // 長時間重煞車會累積煞車溫度；放開煞車後逐漸冷卻，熱衰退會降低制動力。
  S.brakeTemp = clamp(S.brakeTemp + (brakePedal * (Math.abs(S.v) / 24) * 0.22 - 0.035) * dt, 0, 1);
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
      if (hit.car && impact > 4) traffic.crash(hit.car, 25); // 被撞的車停在路邊閃故障燈
    }
    S.v = -S.v * 0.2;
  }
  // 路面高度、坡度
  {
    const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
    const y0 = S.y;
    S.y = groundAt(S.x, S.z, y0);
    S.grade = (groundAt(S.x + fx * L, S.z + fz * L, S.y, 1.5) - S.y) / L;
    S.yA = clamp(groundAt(S.x - Math.sin(S.trailerHeading) * LT, S.z - Math.cos(S.trailerHeading) * LT, S.y, 1.8), S.y - 1.8, S.y + 1.8); // 拖車尾巴超出橋面時不要往下栽
    S.tunNear = nearTunnel(S.x, S.z);
    tollCheck(S.x + fx * 4, S.z + fz * 4, fx, fz);
  }
  const dist = Math.abs(S.v) * dt;
  S.travelled += dist; S.wheelAngle += (S.v * dt) / RW;
  // 車身側傾、點頭（彈簧＋阻尼）
  const aLat = (S.v * S.v * Math.tan(S.steer) * grip) / L;
  const aLong = (S.v - S.lastV) / Math.max(dt, 1e-3); S.lastV = S.v;
  // 翻車：轉彎太快（載越重越容易）先提醒，持續太快才會翻；車身只微微側傾
  const risk = Math.abs(aLat) * (1 + tons / 40);
  S.tipT = risk > 14 ? (S.tipT || 0) + dt : Math.max(0, (S.tipT || 0) - dt * 2);
  if (risk > 10) S.hint = '轉彎太快了，慢一點，小心翻車！';
  const rollT = clamp(aLat * 0.016 * (1 + tons / 40), -0.1, 0.1) * (1 + S.tipT * 2), pitchT = clamp(-aLong * 0.008, -0.05, 0.05);
  S.rollV += ((rollT - S.roll) * 70 - S.rollV * 9) * dt; S.roll += S.rollV * dt;
  if (S.tipT > 0.7 && !S.rollover) { S.rollover = true; S.tipSide = Math.sign(aLat) || 1; S.v = 0; S.rolloverWarned = true; Snd.thud(1); S.shake = 1.2; toast('⚠️ 轉太快翻車了！按 🔄（或 R）回到改裝廠', 4200); }
  S.pitchV += ((pitchT - S.pitch) * 70 - S.pitchV * 9) * dt; S.pitch += S.pitchV * dt;
  const amp = surf === 'road' ? 0.018 : surf === 'gravel' ? 0.075 : 0.055;
  const roughness = Math.min(1.8, Math.abs(S.v) / 12);
  S.bump = Math.sin(S.travelled * 1.9) * Math.sin(S.travelled * 0.71) * amp * roughness;
  // N：底盤懸吊以彈簧／阻尼回應路面起伏，車速越快、碎石路越顛簸。
  const suspensionTarget = S.bump * (surf === 'road' ? 0.65 : 1.15);
  S.suspensionV += ((suspensionTarget - S.suspension) * 34 - S.suspensionV * 8.5) * dt;
  S.suspension += S.suspensionV * dt;
  // 油、水溫、髒污
  save.fuel = clamp(save.fuel - (0.00012 + S.thr * (S.rpm / 2100) * 0.0011) * (1 - save.company.fuelLevel * 0.1) * dt, 0, 1);
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
  restService(dt, stopped);
  redLightCheck();
  // 方向燈自動回正
  if ((S.ind === 'L' || S.ind === 'R') && Math.abs(S.steer) > 0.25) S.indArmed = true;
  if (S.indArmed && Math.abs(S.steer) < 0.05) { S.ind = null; S.indArmed = false; refreshButtons(); }
  Snd.update({ rpm: S.rpm, throttle: accelPedal, speed: S.v, surface: surf, rain: wet, running: !noFuel, inside: S.cam === 2 });
}

// 紅綠燈：前面紅燈會提醒；紅燈還開過路口就跳「闖紅燈」
function redLightCheck() {
  if (!inCity(S.x, S.z) || S.y > 2.5) { S.rlCross = null; return; }
  const fx = Math.sin(S.heading), fz = Math.cos(S.heading), axis = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z';
  const along = axis === 'x' ? S.x : S.z, cross = axis === 'x' ? S.z : S.x, d = (axis === 'x' ? fx : fz) > 0 ? 1 : -1;
  const line = ROADS.find((r) => Math.abs(cross - r) < 8);
  if (line === undefined) { S.rlCross = null; return; }
  // 前面最近的有燈路口
  let next = null;
  for (const r of ROADS) { const ds = (r - along) * d; if (ds > -8 && ds < 60 && (next === null || ds < (next - along) * d)) next = r; }
  if (next === null) { S.rlCross = null; return; }
  const cx = axis === 'x' ? next : line, cz = axis === 'x' ? line : next;
  if (!hasLight(cx, cz)) return;
  const ds = (next - along) * d, st = lightState(S.time, axis);
  if (st === 'r' && ds > 8 && ds < 45 && !S.hint && Math.abs(S.v) > 1) S.hint = '🚦 前面紅燈，請停在路口前';
  const inside = ds < 7 && ds > -7, key = cx + ',' + cz;
  if (inside && S.rlCross !== key) { S.rlCross = key; if (st === 'r' && Math.abs(S.v) > 3) { toast('🚦 闖紅燈了！要等綠燈喔', 1800); Snd.no(); } }
  if (!inside && S.rlCross === key && ds < -7) S.rlCross = null;
}

// 收費站：車頭經過收費亭扣過路費；太快會提醒減速
const TOLL = 15, TOLL_ETC = 10; // ETC 打折
function tollCheck(px, pz, fx, fz) {
  if (inCity(px, pz)) { S.tollSide = null; S.tollPaid = false; return; }
  const q = hwProject(px, pz);
  if (q.s < 0 || q.s > 110 || Math.abs(q.o) > 23) { S.tollSide = null; S.tollPaid = false; return; }
  const side = Math.sign(q.s - TOLL_S) || 1;
  if (S.tollSide && side !== S.tollSide && !S.tollPaid) { // 一次進出收費站只收一次（撞到柵欄退回來不會再扣）
    S.tollPaid = true;
    const etc = isEtcLane(q.o), fee = etc ? TOLL_ETC : TOLL;
    if (save.coins >= fee) { save.coins -= fee; persist(); updateCoins(); Snd.coin(); toast(etc ? `📡 ETC 嗶！過路費 −${fee} 金幣` : `🛣️ 現金過路費 −${fee} 金幣`, 1600); }
    else toast('🛣️ 金幣不夠，這次先免費通過', 1600);
  }
  S.tollSide = side;
  const p = HW_PTS[q.i], along = Math.sign((fx * p.fx + fz * p.fz) * S.v);
  const ahead = (TOLL_S - q.s) * along;
  if (ahead > 2 && ahead < 50) {
    if (isEtcLane(q.o)) { if (Math.abs(S.v) > 16.8) S.hint = 'ETC 車道：減速到 60 以下，柵欄會自動打開'; }
    else if (Math.abs(S.v) > 8.4) S.hint = '現金車道：減速到 30 以下柵欄才會開（靠中間的紫色 ETC 車道可以 60 通過）';
  }
}
// 國道休息站：停在加油區加油、停在維修區修車
function restService(dt, stopped) {
  const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
  if (!nearRest(S.x, S.z)) return;
  const zone = restZoneAt(S.x + fx * 2, S.z + fz * 2);
  if (!zone) { if (!S.hint && Math.abs(S.v) < 12) S.hint = '休息站：右邊加油區停車加油、左邊維修區停車修車'; return; }
  if (!stopped) { S.hint = zone === 'fuel' ? '停下來就會加油' : '停下來就會修車'; return; }
  if (zone === 'fuel') {
    if (save.fuel >= 0.999) { S.hint = '油是滿的 ⛽'; return; }
    const add = Math.min(1 - save.fuel, dt * 0.1); save.fuel += add; S.fuelCoinAcc += add * 60;
    if (S.fuelCoinAcc >= 1 && save.coins > 0) { save.coins -= 1; S.fuelCoinAcc -= 1; updateCoins(); }
    S.hint = `加油中… ${Math.round(save.fuel * 100)}%`;
  } else {
    if (save.damage <= 0.001) { S.hint = '車子沒有壞 🔧'; return; }
    const fix = Math.min(save.damage, dt * 0.08);
    S.repairAcc = (S.repairAcc || 0) + fix * 250;
    if (S.repairAcc >= 1) { if (save.coins <= 0) { S.hint = '金幣不夠，沒辦法修理'; return; } save.coins -= 1; S.repairAcc -= 1; updateCoins(); }
    save.damage -= fix;
    S.hint = `修理中… 車損 ${Math.round(save.damage * 100)}%`;
    if (save.damage <= 0.001) { save.damage = 0; persist(); toast('🔧 修好了！'); }
  }
}

// ================= 鏡頭 =================
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  if(S.followFleetId){
    const target=traffic.fleetObject(S.followFleetId);
    if(!target || !target.visible){S.followFleetId=null;}
    else {const h=target.rotation.y, fx=Math.sin(h), fz=Math.cos(h);const want=new THREE.Vector3(target.position.x-fx*20,target.position.y+8,target.position.z-fz*20);const look=new THREE.Vector3(target.position.x+fx*7,target.position.y+2.4,target.position.z+fz*7);camPos.lerp(want,Math.min(1,dt*3.5));camLook.lerp(look,Math.min(1,dt*4));camera.position.copy(camPos);camera.lookAt(camLook);return;}
  }
  const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
  const want = new THREE.Vector3(), look = new THREE.Vector3();
  rig.windshield.forEach((w) => (w.visible = !(S.mode === 'drive' && S.cam === 2)));
  if (inGarage()) {
    const f = S.gFocus || SHOWROOM_FOCI.overview;
    const tx = SHOWROOM.x + f.x, tz = SHOWROOM.z + 5 + f.z, y = SHOWROOM.y;
    const R = clamp(S.gRadius + (S.gTab === 'trailer' ? 1.5 : 0), 5.8, 21);
    if (S.gAutoRotate && !S.gDrag) S.gAng += dt * 0.105;
    want.set(tx + Math.sin(S.gAng) * R, y + S.gHeight, tz + Math.cos(S.gAng) * R);
    want.x = clamp(want.x, SHOWROOM.x - 19, SHOWROOM.x + 19); want.z = clamp(want.z, SHOWROOM.z - 24, SHOWROOM.z + 25);
    look.set(tx, y + f.y, tz);
    if (window.innerWidth > 760) { const right = new THREE.Vector3().subVectors(look, want).cross(new THREE.Vector3(0, 1, 0)).normalize(); want.addScaledVector(right, 3.5); look.addScaledVector(right, 3.5); }
  } else if (S.mode === 'title') {
    const a = S.time * 0.12;
    want.set(S.x + Math.sin(a) * 19, 5.5, S.z + 2 + Math.cos(a) * 19); look.set(S.x, 2.4, S.z + 1);
  } else if (S.cam === 2) {
    rig.cab.updateMatrixWorld(true);
    rig.cabInner.localToWorld(want.copy(rig.camLocal));
    const q = new THREE.Quaternion(); rig.cab.getWorldQuaternion(q);
    const yaw = S.camYawT > 0 ? S.camYaw : 0;
    look.set(Math.sin(yaw) * 10, -0.45, Math.cos(yaw) * 10).applyQuaternion(q).add(want);
    camPos.copy(want); camLook.copy(look);
    camera.position.copy(want); camera.lookAt(look); return;
  } else if (S.cam === 3 && !S.tunNear) {
    const d = S.cine ? Math.hypot(S.cine.x - S.x, S.cine.z - S.z) : 999;
    if (!S.cine || d > 70) { const side = Math.random() < 0.5 ? 1 : -1, cx = S.x + fx * 45 + fz * 9 * side, cz = S.z + fz * 45 - fx * 9 * side; S.cine = new THREE.Vector3(cx, surfaceY(cx, cz) + 2.2, cz); }
    want.copy(S.cine); look.set(S.x - Math.sin(S.trailerHeading) * 4, S.y + 2.5, S.z - Math.cos(S.trailerHeading) * 4);
    camPos.copy(want); camLook.lerp(look, Math.min(1, dt * 5)); camera.position.copy(camPos); camera.lookAt(camLook); return;
  } else {
    // 隧道附近鏡頭放低，才不會穿到山裡
    // 隧道附近：鏡頭比拖車頂高一點、比隧道頂低，往前看遠一點才不會被拖車擋住
    const back = S.tunNear ? 15 : S.cam === 1 ? 42 : 19, up = S.tunNear ? 6.6 : S.cam === 1 ? 30 : 8.5;
    if (S.camYawT > 0) { S.camYawT -= dt; if (S.camYawT <= 0) S.camYaw = 0; }
    const th = S.trailerHeading * 0.55 + S.heading * 0.45 + (S.camYawT > 0 ? S.camYaw : 0);
    want.set(S.x - Math.sin(th) * back + fx * 2, S.y + up, S.z - Math.cos(th) * back + fz * 2);
    if (!S.tunNear) want.y = Math.max(want.y, surfaceY(want.x, want.z) + 3); // 不要鑽進山坡
    if (S.tunNear) look.set(S.x + fx * 16, S.y + 2.2, S.z + fz * 16); else look.set(S.x + fx * 7, S.y + 2.8, S.z + fz * 7);
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
    if (!S.route || S.routeT <= 0) { S.route = computeRoute({ x: S.x, z: S.z, y: S.y, heading: S.heading }, d); S.routeT = 0.5; }
    const km = S.route.len >= 1000 ? (S.route.len / 1000).toFixed(1) + ' 公里' : Math.round(S.route.len) + ' 公尺';
    // 下一個轉彎方向
    const nxt = S.route.pts.find((p, i) => i > 0 && Math.hypot(p.x - S.x, p.z - S.z) > 14) || d;
    const bearing = wrapAngle(Math.atan2(nxt.x - S.x, nxt.z - S.z) - S.heading);
    $('#navArrow').style.transform = `rotate(${-bearing}rad)`;
    const html = `<div class="m-title">${m.stage === 'pickup' ? '① 去載貨' : '② 送貨中'}　${m.cargo} <small>${m.tons} 噸</small> <small class="m-contract">${m.contractType || '一般貨運'}</small></div>
      <div class="m-row">${m.stage === 'pickup' ? '到' : '送到'} <b>${d.emoji} ${d.name}</b>　<span class="m-dist">${km}</span>　<span class="m-pay">💰 ${m.reward}</span></div>
      ${S.hint ? `<div class="m-hint">${S.hint}</div>` : ''}`;
    if (html !== lastMission) { $('#missionText').innerHTML = html; lastMission = html; }
  }
  const tons = cargoTons();
  drawCluster(clusterCv, {
    rpm: S.rpm, kmh: Math.abs(S.v) * 3.6, speedLimit: S.speedLimit, brakeTemp: S.brakeTemp, rollover: S.rollover, gear: S.gear < 0 ? 'R' : (Math.abs(S.v) < 0.05 && S.thr < 0.05 ? 'N' : 'A' + S.gear),
    fuel: save.fuel, temp: S.temp, damage: save.damage, indL: S.ind === 'L' || S.ind === 'H', indR: S.ind === 'R' || S.ind === 'H', blink: S.blink,
    lights: S.lights, wipers: S.wipers, brake: input.down || Math.abs(S.v) < 0.05, engineWarn: save.damage > 0.6 || save.fuel <= 0, tons: tons ? tons + 8 : 8,
  });
  drawMinimap(mapCv, { x: S.x, z: S.z, heading: S.heading, route: S.route, target: m ? missionTarget() : null, time: S.time, night: env.state.night > 0.5, cars: traffic.positions(), incidents: traffic.incidents(), selectedFleet: S.followFleetId ? traffic.fleetObject(S.followFleetId)?.position : null });
}

// ================= 主迴圈 =================
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = baseFov(); camera.updateProjectionMatrix();
  if (post) post.setSize(w, h);
}
// 駕駛座視角廣一點（看得到兩邊窗外）
const baseFov = () => { const portrait = window.innerWidth < window.innerHeight; return S.mode === 'drive' && S.cam === 2 && !inGarage() ? (portrait ? 85 : 68) : (portrait ? 72 : 55); };

// ================= v24：畫面後製（高畫質才開）：環境光遮蔽（角落陰影）、發光、邊緣平滑 =================
let post = null;
if (HIGH) {
  Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/GTAOPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
  ]).then(([{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { OutputPass }]) => {
    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, w, h);
    gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.6, thickness: 2.5, scale: 1.4, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.4, 2.2); // 只有車燈、路燈這種很亮的東西會發光
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    post = { composer, gtao, bloom, slow: 0, setSize(a, b) { composer.setSize(a, b); } };
  }).catch((e) => console.warn('後製效果載入失敗，用一般畫面：', e));
}
// 數位後照鏡（駕駛座視角才顯示）：畫面左右上方各一個小畫面
const mirrorCams = [new THREE.PerspectiveCamera(32, 1.3, 0.5, HIGH ? 600 : 250), new THREE.PerspectiveCamera(32, 1.3, 0.5, HIGH ? 600 : 250)]; // 順暢模式看近一點，比較省
const mirrorFrames = [document.createElement('div'), document.createElement('div')];
mirrorFrames.forEach((d, i) => { d.className = 'mirror-frame'; d.innerHTML = `<span>${i ? '右後' : '左後'}</span>`; document.body.appendChild(d); });
const mirrorRect = (i) => {
  const W = window.innerWidth, H = window.innerHeight, mw = Math.round(Math.min(W * 0.2, 300)), mh = Math.round(mw / 1.3);
  const top = Math.round(H * (W < 760 ? 0.2 : 0.16));
  return { x: i ? W - mw - 10 : 10, y: top, w: mw, h: mh }; // 0＝左邊（駕駛座在左）、1＝右邊
};
const _mv = new THREE.Vector3(), _mf = new THREE.Vector3();
// 後照鏡先畫到小貼圖（隔幾格才重畫一次，比較省），每一格再把貼圖貼到畫面角落
const mirrorRTs = [0, 1].map(() => new THREE.WebGLRenderTarget(320, 246, { samples: HIGH ? 4 : 0, type: THREE.HalfFloatType }));
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new THREE.Scene();
const quadMat = new THREE.MeshBasicMaterial(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat); // 貼到畫面時才做色調（跟主畫面一樣）
quadScene.add(quad);
let mirrorTick = 0;
const mirrorReady = [false, false];
function renderMirrors() {
  const show = S.mode === 'drive' && S.cam === 2 && !inGarage() && !S.followFleetId;
  document.body.classList.toggle('cab-view', show);
  if (!show || !rig.mirrorLocal) return;
  const H = window.innerHeight, every = HIGH ? 2 : 3;
  mirrorTick++;
  const auto = renderer.autoClear, shadowAuto = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false; // 後照鏡不用重算陰影
  const fx2 = -Math.sin(S.trailerHeading), fz2 = -Math.cos(S.trailerHeading); // 往後看（沿著拖車）
  rig.mirrorLocal.forEach((ml, i) => {
    if ((mirrorTick + i) % every !== 0 && mirrorReady[i]) return;
    const cam = mirrorCams[i];
    rig.cabInner.localToWorld(_mv.copy(ml));
    const side = i ? -1 : 1; // 車頭座標 +x＝左邊：0＝左後照鏡、1＝右後照鏡，鏡頭稍微往外看
    const ox = Math.cos(S.heading) * side * 1.2, oz = -Math.sin(S.heading) * side * 1.2;
    cam.position.copy(_mv);
    cam.lookAt(_mf.set(_mv.x + fx2 * 30 + ox, _mv.y - 1.2, _mv.z + fz2 * 30 + oz));
    cam.aspect = 320 / 246; cam.updateProjectionMatrix();
    renderer.setRenderTarget(mirrorRTs[i]); renderer.autoClear = true; renderer.render(scene, cam);
    mirrorReady[i] = true;
  });
  renderer.setRenderTarget(null);
  renderer.autoClear = false; renderer.setScissorTest(true);
  rig.mirrorLocal.forEach((ml, i) => {
    const r = mirrorRect(i), vy = H - r.y - r.h;
    renderer.setViewport(r.x, vy, r.w, r.h); renderer.setScissor(r.x, vy, r.w, r.h);
    quadMat.map = mirrorRTs[i].texture; renderer.render(quadScene, quadCam);
    mirrorFrames[i].style.cssText = `left:${r.x - 3}px;top:${r.y - 3}px;width:${r.w}px;height:${r.h}px`;
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.autoClear = auto; renderer.shadowMap.autoUpdate = shadowAuto;
}
// 儀表板螢幕、導航螢幕：用 HUD 的儀表和小地圖畫面
let clusterTex = null, navTex = null;
function updateCabScreens() {
  if (!rig.screenMats || !rig.screenMats.cluster) return;
  if (!clusterTex) { clusterTex = new THREE.CanvasTexture(clusterCv); clusterTex.colorSpace = THREE.SRGBColorSpace; navTex = new THREE.CanvasTexture(mapCv); navTex.colorSpace = THREE.SRGBColorSpace; }
  if (rig.screenMats.cluster.map !== clusterTex) { rig.screenMats.cluster.map = clusterTex; rig.screenMats.cluster.needsUpdate = true; rig.screenMats.nav.map = navTex; rig.screenMats.nav.needsUpdate = true; }
  if (S.cam === 2) { clusterTex.needsUpdate = true; navTex.needsUpdate = true; }
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
  // 卡車在高架橋上時，橋下的車不用讓它（把卡車位置移到很遠的地方給車流看）
  const tPts = S.y > 2.5 && inCity(S.x, S.z) ? pts.map((p) => ({ ...p, x: p.x + 5000 })) : pts;
  traffic.update(dt, S.time, tPts, env.state.night > 0.3);
  updateDispatchFleet(dt);
  traffic.updateFleet(save.company.fleetUnits, dt, S.time, save.company.name);
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
  updateCabScreens();
  const fov = baseFov(); if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (post) {
    // 太慢（平均一格超過 30 毫秒）：先關掉角落陰影
    if (S.time > 8) post.slow = post.slow * 0.99 + (dt > 0.03 ? 1 : 0) * 0.01; // 開始玩 8 秒後才算，載入時的卡頓不算
    if (post.slow > 0.75 && post.gtao.enabled) { post.gtao.enabled = false; console.info('畫面太慢，關掉環境光遮蔽'); }
    post.composer.render(dt);
  } else renderer.render(scene, camera);
  renderMirrors();
}

// ================= 開始 =================
window.__truck = { S, get save() { return save; }, hit: () => hitTest(S.x, S.z, S.heading, S.trailerHeading), boxes, input,
  step(n = 60) { for (let i = 0; i < n; i++) frame(1 / 60); }, get post() { return post; }, applyEnv, openGarage, closeGarage, traffic, dispatchUnit };
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
