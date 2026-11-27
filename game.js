// 卡車改裝王 v31（寫實版）— 主程式：存檔、操作、重車物理、送貨任務、鏡頭、儀表、改裝車庫
import * as THREE from 'three';
import {
  buildWorld, boxes, DEPOTS, GAS, GARAGE_BLD, SPAWN, SHOWROOM, WORLD, surfaceAt,
  setWet, setSnow, setNight, lampPositions, updateTrafficLights, updateWorldAnim, setShowroomLights, ROADS, hasLight, lightState,
} from './js/world.js';
import { buildRig, setTruckLights, loadTruckGLB, setTruckGLB } from './js/truck.js';
import { createEnv } from './js/env.js';
import { createTraffic } from './js/traffic.js';
import { Snd } from './js/audio.js';
import { drawCluster, drawMinimap, computeRoute, drawWorldMap, mapBounds } from './js/hud.js';
import { clamp, wrapAngle } from './js/util.js';
import { groundAt, surfaceY, hwBlocked, hwProject, inCity, inTunnel, nearTunnel, updateHighway, speedLimitAt, restZoneAt, nearRest, isEtcLane, TOLL_S, TUNNEL_LAMPS, PTS as HW_PTS } from './js/highway.js';

const VERSION = 'v41';
const $ = (s) => document.querySelector(s);
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');

// ================= 存檔 =================
const SAVE_KEY = 'truckGarage_save_v1';
const SAVE_VER = 3; // v38：存檔版本（之後改格式時依版本轉換，舊存檔照樣讀得到）
const DEFAULT_TRUCK = {
  cabStyle: 'euro', trailerType: 'box',
  cabColor: '#b71c1c', cabColor2: '#ffb000', cabGradient: 'off', paint: 'normal', pattern: 'none', patternColor: '#ffd60a',
  rims: 'std', bumper: 'std', lightbar: 'off', stacks: 'off', visor: 'off', spoiler: 'off',
  horn: 'normal', glow: 'off',
  tires: 'std', brakes: 'std', suspension: 'std', chassis: 'std', skirts: 'off', tanks: 'alu', interior: 'black', ambient: 'off', headlight: 'white',
  engine: 'e450', gbx: 'g12', sidelights: 'off', cabacc: 'none',
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
    { id: 'flat', name: '平板車', icon: '🚚', price: 200 },
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
    { id: 'chromeb', name: '電鍍', icon: '✨', price: 120 },
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
  // v26：性能零件（真的會影響開車）
  tires: { title: '輪胎', items: [
    { id: 'std', name: '一般輪胎', icon: '⚫', price: 0 },
    { id: 'allweather', name: '全天候輪胎（雨天不容易滑）', icon: '🌧', price: 260 },
    { id: 'sport', name: '高抓地輪胎（轉彎更穩）', icon: '🏁', price: 380 },
  ] },
  brakes: { title: '煞車', items: [
    { id: 'std', name: '一般煞車', icon: '🛑', price: 0 },
    { id: 'ceramic', name: '陶瓷煞車（煞得快、不怕燙）', icon: '🔥', price: 420 },
  ] },
  suspension: { title: '懸吊', items: [
    { id: 'std', name: '鋼板彈簧', icon: '〰️', price: 0 },
    { id: 'air', name: '氣壓懸吊（更平穩、比較不晃）', icon: '💨', price: 350 },
  ] },
  // v26：車架與外觀零件
  chassis: { title: '車身高度', items: [
    { id: 'std', name: '原廠高度', icon: '🚛', price: 0 },
    { id: 'low', name: '低趴', icon: '⬇️', price: 220 },
    { id: 'lift', name: '加高', icon: '⬆️', price: 220 },
  ] },
  skirts: { title: '側裙（車頭＋拖車）', items: [{ id: 'off', name: '不裝', icon: '✖️', price: 0 }, { id: 'on', name: '空力側裙', icon: '🛡️', price: 200 }] },
  tanks: { title: '油箱', items: [{ id: 'alu', name: '鋁油箱', icon: '🛢️', price: 0 }, { id: 'chrome', name: '電鍍鏡面油箱', icon: '💎', price: 160 }] },
  headlight: { title: '大燈顏色', items: [
    { id: 'white', name: '白光 LED', icon: '⚪', price: 0 },
    { id: 'warm', name: '黃光', icon: '🟡', price: 60 },
    { id: 'blue', name: '冰藍光', icon: '🔵', price: 120 },
  ] },
  // v37：引擎、變速箱（真的會影響開車）
  engine: { title: '引擎', items: [
    { id: 'e450', name: '原廠 450 匹', icon: '⚙️', price: 0 },
    { id: 'e550', name: '強化 550 匹（爬坡有力）', icon: '🔥', price: 900 },
    { id: 'e650', name: '旗艦 650 匹（最快、最有力）', icon: '🚀', price: 2200 },
  ] },
  gbx: { title: '變速箱', items: [
    { id: 'g12', name: '12 速', icon: '🕹️', price: 0 },
    { id: 'g14', name: '14 速超速檔（高速省油、轉速低）', icon: '⚡', price: 700 },
  ] },
  sidelights: { title: '車側燈（晚上會亮）', items: [
    { id: 'off', name: '不裝', icon: '✖️', price: 0 },
    { id: 'amber', name: '琥珀色 LED', icon: '🟠', price: 150 },
    { id: 'white', name: '白色 LED', icon: '⚪', price: 150 },
    { id: 'blue', name: '藍色 LED', icon: '🔵', price: 180 },
  ] },
  cabacc: { title: '駕駛室配件', items: [
    { id: 'none', name: '不裝', icon: '✖️', price: 0 },
    { id: 'toy', name: '儀表板小卡車模型', icon: '🚚', price: 80 },
    { id: 'charm', name: '後照鏡吊飾＋香氛', icon: '🌲', price: 60 },
    { id: 'curtain', name: '臥鋪窗簾＋小冰箱', icon: '🛏️', price: 200 },
  ] },
  // v26：內裝（駕駛座視角看得到）
  interior: { title: '座艙內裝', items: [
    { id: 'black', name: '黑色', icon: '⬛', price: 0 },
    { id: 'beige', name: '米色真皮', icon: '🟫', price: 240 },
    { id: 'red', name: '紅色跑車', icon: '🟥', price: 300 },
  ] },
  ambient: { title: '車內氣氛燈', items: [
    { id: 'off', name: '不裝', icon: '✖️', price: 0 },
    { id: 'blue', name: '藍色', icon: '💙', price: 120 },
    { id: 'pink', name: '粉紅', icon: '💗', price: 120 },
    { id: 'gold', name: '金色', icon: '💛', price: 150 },
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
const ITEM_KEYS = ['cabStyle', 'trailerType', 'paint', 'pattern', 'bumper', 'rims', 'stacks', 'lightbar', 'visor', 'spoiler', 'horn', 'glow', 'trailerPattern', 'tires', 'brakes', 'suspension', 'chassis', 'skirts', 'tanks', 'headlight', 'interior', 'ambient', 'engine', 'gbx', 'sidelights', 'cabacc'];
const COLOR_KEYS = ['cabColor', 'cabColor2', 'patternColor', 'trailerColor', 'trailerColor2', 'trailerPatColor'];
const PALETTE = ['#b71c1c', '#e65100', '#f9a825', '#2e7d32', '#00695c', '#0277bd', '#1a237e', '#4a148c',
  '#ad1457', '#f5f5f5', '#9e9e9e', '#37474f', '#111111', '#5d4037', '#c0a062', '#00e5ff'];

function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  const out = { coins: 500, owned: [], deliveries: 0, truck: { ...DEFAULT_TRUCK }, fleet: [], company: { name: '小棒槌物流', trucks: 1, engineLevel: 0, fuelLevel: 0, revenue: 0, expenses: 0, contracts: 0, wages: 0, maintenance: 0, fuelCost: 0, fleetLog: [], queuedCargo: null, fleetUnits: [] }, fuel: 1, damage: 0, dirt: 0.15,
    settings: { time: 'day', weather: 'clear', quality: IS_TOUCH ? 'mid' : 'high', traffic: 'normal', volume: 1, post: true, mirrors: true, fps: false, glb: true, gearbox: 'auto', steer: 'normal', shake: true, autoLights: true }, odo: 0, loan: 0, loanT: 0, ledger: [], xp: 0, ver: SAVE_VER, ach: [], flags: {} };
  if (s && typeof s === 'object') {
    if (Number.isFinite(s.coins) && s.coins >= 0) out.coins = Math.floor(s.coins);
    if (Array.isArray(s.owned)) out.owned = s.owned.filter((x) => typeof x === 'string');
    if (Array.isArray(s.fleet)) out.fleet = s.fleet.filter((v) => v && typeof v.id === 'string' && v.truck && typeof v.truck === 'object').slice(0, 8).map((v) => ({ id: v.id.slice(0, 40), name: String(v.name || '我的卡車').slice(0, 16), truck: { ...DEFAULT_TRUCK, ...v.truck }, photo: typeof v.photo === 'string' && v.photo.startsWith('data:image/') ? v.photo : '', savedAt: Number.isFinite(v.savedAt) ? v.savedAt : Date.now(), bought: Number.isFinite(v.bought) ? clamp(Math.round(v.bought), 0, 100000) : 0 }));
    if (s.company && typeof s.company === 'object') {
      const c = s.company;
      if (typeof c.name === 'string') out.company.name = c.name.slice(0, 20);
      if (Number.isFinite(c.trucks)) out.company.trucks = clamp(Math.floor(c.trucks), 1, 8);
      if (Number.isFinite(c.warehouse)) out.company.warehouse = clamp(Math.floor(c.warehouse), 0, 3);
      if (Array.isArray(c.history)) out.company.history = c.history.slice(-12).filter((v) => v && Number.isFinite(v.v)).map((v) => ({ n: String(v.n || '').slice(0, 6), v: Math.round(v.v) }));
      if (Number.isFinite(c.engineLevel)) out.company.engineLevel = clamp(Math.floor(c.engineLevel), 0, 3);
      if (Number.isFinite(c.fuelLevel)) out.company.fuelLevel = clamp(Math.floor(c.fuelLevel), 0, 3);
      for (const k of ['revenue', 'expenses', 'contracts', 'wages', 'maintenance', 'fuelCost']) if (Number.isFinite(c[k])) out.company[k] = Math.max(0, Math.floor(c[k]));
      if (Number.isInteger(c.queuedCargo) && c.queuedCargo >= 0 && c.queuedCargo < 12) out.company.queuedCargo = c.queuedCargo;
      if (Array.isArray(c.fleetLog)) out.company.fleetLog = c.fleetLog.slice(0,20).filter(v=>v&&typeof v.message==='string').map(v=>({time:Number.isFinite(v.time)?v.time:Date.now(),message:String(v.message).slice(0,100)}));
      if (Array.isArray(c.fleetUnits)) out.company.fleetUnits = c.fleetUnits.slice(0, 7).filter(u => u && typeof u.id === 'string').map((u,i) => ({ id:u.id.slice(0,48), name:String(u.name||`車隊 ${i+1}`).slice(0,16), driver:String(u.driver||'待指派司機').slice(0,16), paint:/^#[0-9a-f]{6}$/i.test(u.paint)?u.paint:['#b71c1c','#145da0','#d18a16','#315b45'][i%4], plate:String(u.plate||`BK-${String(i+1).padStart(3,'0')}`).replace(/[^a-zA-Z0-9-]/g,'').slice(0,10), status:['idle','outbound','returning'].includes(u.status)?u.status:'idle', progress:clamp(Number(u.progress)||0,0,1), duration:clamp(Number(u.duration)||90,45,180), fuel:clamp(Number(u.fuel??1),0,1), condition:clamp(Number(u.condition??1),0,1), cargoIndex:Number.isInteger(u.cargoIndex)?clamp(u.cargoIndex,0,11):null, origin:Number.isInteger(u.origin)?clamp(u.origin,0,DEPOTS.length-1):null, destination:Number.isInteger(u.destination)?clamp(u.destination,0,DEPOTS.length-1):null, reward:Math.max(0,Math.floor(Number(u.reward)||0)), earned:Math.max(0,Math.floor(Number(u.earned)||0)), phase:['outbound','unloading','returning'].includes(u.phase)?u.phase:'outbound', stopTimer:clamp(Number(u.stopTimer)||0,0,20), driverState:String(u.driverState||'待命').slice(0,16), fatigue:clamp(Number(u.fatigue)||0,0,1), incidents:Math.max(0,Math.floor(Number(u.incidents)||0)), lastEvent:String(u.lastEvent||'車輛已完成檢查').slice(0,48), eventChecked:!!u.eventChecked, model:['light','std','heavy'].includes(u.model)?u.model:'std', skill:clamp(Math.floor(Number(u.skill)||1),1,3) }));
    }
    if (Number.isFinite(s.deliveries)) out.deliveries = s.deliveries;
    if (Array.isArray(s.ach)) out.ach = s.ach.filter((x) => typeof x === 'string').slice(0, 60); // v31 成就
    if (s.flags && typeof s.flags === 'object') { out.flags = {}; for (const [k, v] of Object.entries(s.flags)) if (typeof v === 'boolean' || Number.isFinite(v)) out.flags[k] = v; }
    if (s.jobs && typeof s.jobs === 'object') out.jobs = { done: Math.max(0, Math.floor(Number(s.jobs.done) || 0)), stars: Math.max(0, Math.floor(Number(s.jobs.stars) || 0)) }; // v28 任務評價紀錄
    for (const k of ['fuel', 'damage', 'dirt']) if (Number.isFinite(s[k])) out[k] = clamp(s[k], 0, 1);
    if (Number.isFinite(s.odo)) out.odo = Math.max(0, s.odo);
    if (Number.isFinite(s.loan)) out.loan = clamp(Math.round(s.loan), 0, 50000);
    if (Number.isFinite(s.xp)) out.xp = Math.max(0, Math.round(s.xp));
    else if (Number.isFinite(s.deliveries)) out.xp = Math.round(s.deliveries * 120); // 舊存檔：照送貨次數補經驗值
    if (Number.isFinite(s.loanT)) out.loanT = Math.max(0, s.loanT);
    if (Array.isArray(s.ledger)) out.ledger = s.ledger.filter((e) => e && Number.isFinite(e.v) && typeof e.cat === 'string').slice(0, 200).map((e) => ({ t: Number(e.t) || 0, cat: e.cat.slice(0, 12), note: String(e.note || '').slice(0, 40), v: Math.round(e.v) }));
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
      if (['day', 'dusk', 'night', 'dawn', 'auto'].includes(s.settings.time)) out.settings.time = s.settings.time;
      if (['clear', 'overcast', 'rain', 'storm', 'fog', 'snow'].includes(s.settings.weather)) out.settings.weather = s.settings.weather;
      if (['high', 'mid', 'low'].includes(s.settings.quality)) out.settings.quality = s.settings.quality;
      if (typeof s.settings.glb === 'boolean') out.settings.glb = s.settings.glb;
      if (typeof s.settings.music === 'boolean') out.settings.music = s.settings.music;
      if (['auto', 'manual'].includes(s.settings.gearbox)) out.settings.gearbox = s.settings.gearbox;
      if (['low', 'normal', 'high'].includes(s.settings.steer)) out.settings.steer = s.settings.steer;
      for (const k of ['shake', 'autoLights']) if (typeof s.settings[k] === 'boolean') out.settings[k] = s.settings[k];
      if (['few', 'normal', 'many'].includes(s.settings.traffic)) out.settings.traffic = s.settings.traffic;
      if (Number.isFinite(s.settings.volume)) out.settings.volume = clamp(s.settings.volume, 0, 1);
      for (const k of ['post', 'mirrors', 'fps']) if (typeof s.settings[k] === 'boolean') out.settings[k] = s.settings[k];
    }
  }
  return out;
}
let save = loadSave();
const FLEET_DRIVERS = ['阿哲','志明','小宇','建宏','阿凱','家豪'];
function createFleetUnit(index, model = 'std') { return { model, skill: 1, id:`fleet-${Date.now()}-${index}-${Math.random().toString(36).slice(2,6)}`, name:`物流車 ${index+1}`, driver:FLEET_DRIVERS[index % FLEET_DRIVERS.length], paint:['#b71c1c','#145da0','#d18a16','#315b45'][index%4], plate:`BK-${String(index+1).padStart(3,'0')}`, driverState:'待命', fatigue:0, incidents:0, lastEvent:'車輛已完成檢查', eventChecked:false, status:'idle', progress:0, duration:90, fuel:1, condition:1, cargoIndex:null, origin:null, destination:null, reward:0, earned:0, phase:'outbound' }; }
// v29：車款（價錢、運費倍數、速度）、司機技術、倉庫
const TRUCK_MODELS = { light: { name: '小型貨車', price: 5000, mult: 0.75, speed: 1.1 }, std: { name: '標準聯結車', price: 9000, mult: 1, speed: 1 }, heavy: { name: '重型聯結車', price: 15000, mult: 1.4, speed: 0.92 } };
const WAREHOUSE = [{ name: '沒有倉庫', income: 0 }, { name: '小倉庫', income: 40, cost: 4000 }, { name: '物流倉庫', income: 90, cost: 9000 }, { name: '大型物流中心', income: 160, cost: 18000 }];
const fleetCap = () => 5 + (save.company.warehouse || 0);
const truckPrice = (model) => Math.round(TRUCK_MODELS[model].price * (1 + 0.25 * Math.max(0, save.company.trucks - 1)) / 100) * 100;
const DRIVER_NAMES = ['阿哲', '志明', '小宇', '建宏', '阿凱', '家豪', '美玲', '雅婷', '大雄', '阿明', '小芳', '俊傑'];
let driverPool = null;
function makeDrivers() { driverPool = [0, 1, 2].map(() => { const skill = 1 + Math.floor(Math.random() * 3); return { name: DRIVER_NAMES[Math.floor(Math.random() * DRIVER_NAMES.length)], skill, fee: skill * 350 + Math.floor(Math.random() * 6) * 20 }; }); }
function addHistory(n, v) { save.company.history = (save.company.history || []).concat([{ n, v: Math.round(v) }]).slice(-12); }
function companyExtraHtml() {
  const c = save.company; if (!driverPool) makeDrivers();
  const wl = c.warehouse || 0, next = WAREHOUSE[wl + 1];
  const hist = c.history || [], mx = Math.max(50, ...hist.map((h) => Math.abs(h.v)));
  const units = c.fleetUnits.filter((u) => u.status === 'idle');
  return `<div class="company-section"><b>👷 司機招募</b><small>技術越好（星星越多）跑得越快、越少出事，但每趟薪水比較高（30＋15×星）。雇用後會換掉一台待命車的司機。</small>
    ${c.fleetUnits.length ? `<div class="contract-grid">${driverPool.map((d, i) => `<article class="contract-card"><div><b>${escapeHtml(d.name)}</b><span>${'⭐'.repeat(d.skill)}</span></div><small>簽約金 💰 ${d.fee}</small>${units.length ? `<label class="dispatch-pick">派到<select data-hire-unit="${i}">${units.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}（現在 ${'⭐'.repeat(u.skill || 1)}）</option>`).join('')}</select></label><button data-hire="${i}">雇用</button>` : '<small>車都出去送貨了，回來才能換司機</small>'}</article>`).join('')}</div><button class="dispatch-go" data-hire-refresh>🔄 看看其他人（💰 50）</button>` : '<small>先買一台營運卡車才需要司機。</small>'}</div>
    <div class="company-section"><b>🏬 倉庫</b><small>現在：${WAREHOUSE[wl].name}${wl ? `｜每 2 分鐘倉儲收入 💰 ${WAREHOUSE[wl].income}` : ''}｜車隊上限 ${fleetCap()} 台</small>
    ${next ? `<div class="company-upgrade"><span>升級成「${next.name}」<br><small>每 2 分鐘收入 ${next.income}、車隊上限 +1</small></span><button data-company-action="warehouse">升級｜💰 ${next.cost}</button></div>` : '<small>已經是最大的物流中心了！</small>'}</div>
    <div class="company-section"><b>📈 最近 12 筆收支</b><small>綠色是賺、紅色是賠（送貨、車隊、倉庫都算）。</small>
    <div class="fin-bars">${hist.length ? hist.map((h) => `<div class="fin-bar" title="${escapeHtml(h.n)} ${h.v}"><i class="${h.v >= 0 ? 'up' : 'down'}" style="height:${Math.max(3, Math.round(Math.abs(h.v) / mx * 70))}px"></i><small>${escapeHtml(h.n)}</small></div>`).join('') : '<small>還沒有紀錄，送一趟貨就會出現。</small>'}</div></div>`;
}
function logFleetEvent(message) { save.company.fleetLog.unshift({ time: Date.now(), message: String(message).slice(0,100) }); save.company.fleetLog = save.company.fleetLog.slice(0,20); }
while (save.company.fleetUnits.length < Math.max(0, save.company.trucks - 1)) save.company.fleetUnits.push(createFleetUnit(save.company.fleetUnits.length));
save.company.fleetUnits = save.company.fleetUnits.slice(0, Math.max(0, save.company.trucks - 1));
for (const k of ITEM_KEYS) if (!isOwned(k, save.truck[k])) save.truck[k] = DEFAULT_TRUCK[k];
// v35：收支帳本（每一筆收入、支出都記下來，最多 200 筆）
function money(amount, cat, note = '') {
  amount = Math.round(amount); if (!amount) return;
  if (amount < 0) amount = -Math.min(save.coins, -amount); // 錢不夠就扣到 0
  save.coins += amount;
  const L0 = save.ledger && save.ledger[0];
  if (L0 && L0.cat === cat && L0.note === note && Date.now() - L0.t < 60000 && Math.sign(L0.v) === Math.sign(amount)) { L0.v += amount; L0.t = Date.now(); } // 加油這種一點一點扣的合成一筆
  else save.ledger = [{ t: Date.now(), cat, note, v: amount }, ...(save.ledger || [])].slice(0, 200);
  if (typeof updateCoins === 'function' && document.getElementById('coinNum')) updateCoins();
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch (e) { return false; } }
let draft = { ...save.truck };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ================= 3D =================
// v32：舊存檔的「順」等於現在的「中」（保留陰影），只轉換一次
save.flags = save.flags || {};
if (!save.flags.q32) { if (save.settings.quality === 'low') save.settings.quality = 'mid'; save.flags.q32 = true; persist(); }
// v32：畫質三段　高＝全部效果／中＝柔和陰影＋發光暗角（不做角落陰影）／低＝不做後製、不做陰影
const QUAL = save.settings.quality, HIGH = QUAL === 'high', LOWQ = QUAL === 'low';
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, HIGH ? 2 : LOWQ ? 1 : 1.5)); // 手機最高 2 倍
renderer.shadowMap.enabled = !LOWQ;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 柔和陰影
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 3000);
const env = createEnv(renderer, scene);
if (!HIGH) env.sun.shadow.mapSize.set(1024, 1024);
if (LOWQ) env.sun.castShadow = false;
buildWorld(scene, HIGH ? 'high' : 'low');
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
  cam: 0, camYaw: 0, camYawT: 0, shake: 0, cine: null, retarder: true, slip: 0, jackT: 0,
  gAng: 0.9, gDrag: null, gTab: 'model', pending: null, gRadius: 11, gHeight: 4.2, gAutoRotate: true, gFocus: { x: 0, y: 2.4, z: 0 },
  mission: null, hint: '', time: 0, temp: 0.5, hornT: 0, bumpsThisJob: 0, loadT: 0,
  route: null, routeT: 0, dirtDrawn: save.dirt, fuelCoinAcc: 0, wasStopped: true, lastSurface: 'road',
  y: 0, yA: 0, grade: 0, tunNear: false, tollSide: null,
  freeYaw: 2.4, freePitch: 0.35, camH: 1, dome: false,
  engineOn: true, crank: 0, cruise: 0, highBeam: false, troll: 0, trollV: 0, physAcc: 0, // v40：引擎發動、定速、遠燈、拖車側傾、物理固定步長
  handbrake: false, air: 1, paused: false, coupled: false, parked: null, pendingPark: null, canCouple: false, camDist: 1, camPitch: 0, // v33：手煞車、氣壓（1＝10 bar）、暫停；v34 鏡頭距離
};
let rig = null;
function rebuildRig(cfg) {
  if (rig) rig.dispose();
  S.builtTrailer = inGarage() ? cfg.trailerType : curTrailer();
  GEARS = save.truck.gbx === 'g14' ? GEARS14 : GEARS12; if (S.gear > GEARS.length) S.gear = GEARS.length;
  rig = buildRig(inGarage() ? cfg : { ...cfg, trailerType: curTrailer() }, save.dirt); // v36：開車時拖的是任務的拖車
  S.rigCfg = JSON.stringify(cfg);
  scene.add(rig.tractor, rig.trailer);
  // v39：駕駛室車內燈（O）
  const dome = new THREE.PointLight(0xffe2b0, 0, 3.4, 1.4); dome.position.copy(rig.camLocal).add(new THREE.Vector3(-0.55, 0.6, -0.2)); rig.cabInner.add(dome); rig.dome = dome;
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
  rig.trailerBody.rotation.set(0, 0, S.roll * 0.3 + S.troll);
  // v36：還沒連接的拖車停在裝貨點（沒有就不顯示）
  const loose = S.mode === 'drive' && !S.coupled; // 主選單、改裝廠：顯示接好的樣子
  rig.trailer.visible = !loose || !!S.parked;
  if (loose && S.parked) { const P = S.parked; rig.trailer.position.set(P.x, P.y ?? 0, P.z); rig.trailer.rotation.set(0, P.h, 0); rig.trailerBody.rotation.set(0, 0, 0); }
}

// ================= 送貨任務 =================
const CARGOS = [
  // fragile＝易碎（怕撞、怕急煞）；fresh＝生鮮（時間比較趕）
  // v36：cat＝貨物種類、tr＝要用的拖車（box 廂型／flat 平板／dump 砂石斗）；danger＝危險品、heavy＝重型機械
  { n: '🍌 香蕉', t: 14, fresh: true, cat: '冷凍貨物', tr: 'box' }, { n: '🚗 小汽車', t: 10, fragile: true, cat: '一般貨物', tr: 'flat' }, { n: '🍦 冰淇淋', t: 12, fresh: true, cat: '冷凍貨物', tr: 'box' }, { n: '🔩 鋼筋', t: 24, cat: '鋼材', tr: 'flat' }, { n: '🧱 水泥', t: 22, cat: '建築材料', tr: 'box' },
  { n: '🧸 玩具', t: 6, cat: '一般貨物', tr: 'box' }, { n: '🍉 西瓜', t: 16, fragile: true, cat: '一般貨物', tr: 'box' }, { n: '🦖 恐龍蛋', t: 8, fragile: true, cat: '一般貨物', tr: 'box' }, { n: '🏗️ 砂石', t: 26, cat: '建築材料', tr: 'dump' }, { n: '🎁 禮物', t: 5, fragile: true, cat: '一般貨物', tr: 'box' },
  { n: '🌲 木頭', t: 20, cat: '木材', tr: 'flat' }, { n: '🐟 魚', t: 15, fresh: true, cat: '冷凍貨物', tr: 'box' },
  { n: '📦 貨櫃', t: 18, cat: '貨櫃', tr: 'flat' }, { n: '🚜 挖土機', t: 28, heavy: true, cat: '重型機械', tr: 'flat' }, { n: '⛽ 汽油', t: 20, danger: true, cat: '危險品', tr: 'box' },
  { n: '🧪 化學原料', t: 16, danger: true, cat: '危險品', tr: 'box' }, { n: '🏗️ H 型鋼樑', t: 26, cat: '鋼材', tr: 'flat' }, { n: '🥩 冷凍肉品', t: 17, fresh: true, cat: '冷凍貨物', tr: 'box' },
  { n: '🌳 原木', t: 24, cat: '木材', tr: 'flat' }, { n: '🚧 水泥管', t: 22, cat: '建築材料', tr: 'flat' }, { n: '🏭 發電機組', t: 26, heavy: true, cat: '重型機械', tr: 'flat' }, { n: '📦 雙櫃貨櫃', t: 24, cat: '貨櫃', tr: 'flat' },
];
const CARGO_CATS = { '一般貨物': '📦', '貨櫃': '🚢', '鋼材': '🔩', '木材': '🌲', '建築材料': '🧱', '重型機械': '🚜', '冷凍貨物': '❄️', '危險品': '⚠️' };
const TRAILER_N = { box: '廂型拖車', flat: '平板拖車', dump: '砂石斗' };
const cargoRule = (j) => j.danger ? '不能進隧道、限速 80' : j.heavy ? '超重、限速 60' : j.fresh ? '要準時，遲到會壞' : j.fragile ? '易碎，輕輕開' : '';
// v38：職業等級（經驗值每級需要越來越多）、高等級才能接的貨
const levelOf = (xp) => { let lv = 1, need = 500, left = xp; while (left >= need && lv < 50) { left -= need; lv++; need = Math.round(need * 1.18); } return { lv, cur: left, need }; };
const CAT_LEVEL = { '危險品': 3, '重型機械': 4, '貨櫃': 2 };
// 目前拖的拖車種類：有任務就用任務的拖車，不然用自己改裝的
const curTrailer = () => (S.mission && S.mission.tr) || save.truck.trailerType;
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
  u.status='outbound';u.phase='outbound';u.stopTimer=0;u.driverState='執勤中';u.fatigue=clamp(u.fatigue+0.28,0,1);u.eventChecked=false;u.lastEvent='已出車，依導航前往目的地';u.progress=0;const TM=TRUCK_MODELS[u.model||'std'];u.duration=clamp((58+dist*.12)*(1-save.company.engineLevel*.04)*(1-0.08*((u.skill||1)-1))/TM.speed,45,160);u.cargoIndex=cargoIndex;u.origin=a;u.destination=b;u.reward=Math.round(base*(ct?ct.multiplier:1)*TM.mult);
  logFleetEvent(`${u.name} 派遣：${A.name} → ${B.name}｜${cargo.n}`);persist();traffic.syncFleet(save.company.fleetUnits,save.company.name);renderGarage();toast(`${u.name} 已出車：${A.name} → ${B.name}`);Snd.buy();
}
function serviceFleetUnit(id, kind) {
  const u=save.company.fleetUnits.find(v=>v.id===id);if(!u||u.status!=='idle')return;
  const cost=kind==='fuel'?180:kind==='repair'?260:90;if(save.coins<cost){toast(`金幣不足，還差 ${cost-save.coins} 金幣`);return;}
  money(-cost,'車隊',kind==='fuel'?'車隊加油':kind==='repair'?'車隊維修':'司機休息');save.company.expenses+=cost;logFleetEvent(`${u.name} ${kind==='fuel'?'燃油補給':kind==='repair'?'車輛維修':'司機休息'}｜支出 ${cost}`);if(kind==='fuel')u.fuel=1;else if(kind==='repair')u.condition=1;else {u.fatigue=0;u.driverState='待命';u.lastEvent='司機已完成休息';}
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
        if(!u.eventChecked){u.eventChecked=true;if(Math.random()<0.16*(1-0.3*((u.skill||1)-1))+(u.condition<0.35?0.15:0)){u.incidents=(u.incidents||0)+1;u.condition=clamp(u.condition-0.08,0,1);u.lastEvent='途中輪胎／路況異常，已扣除車況並完成安全處置';logFleetEvent(`${u.name} 發生道路事件，車況下降`);toast(`⚠️ ${u.name} 發生道路事件，車隊已通報`);}else{u.lastEvent='貨物安全送達，沒有事故紀錄';}}

        const cargo=CARGOS[u.cargoIndex]||CARGOS[0],origin=DEPOTS[u.origin],dest=DEPOTS[u.destination];
        const payout=Math.max(0,u.reward-35);money(payout,'車隊','車隊送貨淨收入');addHistory('車隊',payout);save.company.revenue+=u.reward;save.company.contracts++;u.earned+=u.reward;
        save.company.expenses+=35;save.company.fuelCost=(save.company.fuelCost||0)+35;u.fuel=clamp(u.fuel-.16*(1-save.company.fuelLevel*.1),0,1);u.condition=clamp(u.condition-.025,0,1);
        u.phase='unloading';u.stopTimer=4;u.driverState='裝卸作業';u.progress=1;u.lastEvent=`已抵達 ${dest.name}，正在卸貨`;logFleetEvent(`${u.name} 已抵達 ${dest.name}，完成 ${cargo.n} 交付`);
        toast(`🚛 ${u.name} 已送達 ${dest.name}｜${cargo.n} 淨入帳 +${payout}`);popup(`車隊淨收益 +${payout}`);Snd.coin();
      }else{
        const wage=30+15*(u.skill||1), maintenance=u.condition<0.5?60:25; addHistory('薪資',-(wage+maintenance)); save.company.wages=(save.company.wages||0)+wage; save.company.maintenance=(save.company.maintenance||0)+maintenance; save.company.expenses+=wage+maintenance; save.coins=Math.max(0,save.coins-wage-maintenance); u.status='idle';u.driverState=u.fatigue>0.72?'需要休息':'待命';u.progress=0;u.cargoIndex=null;u.origin=null;u.destination=null;u.reward=0;u.phase='outbound';u.lastEvent=`已返抵物流中心｜司機薪資 ${wage}、保養 ${maintenance}`;u.eventChecked=false;logFleetEvent(`${u.name} 完成往返任務｜薪資 ${wage}、保養 ${maintenance}`);toast(`🚛 ${u.name} 已返抵｜薪資與保養支出 ${wage+maintenance}`);
      }
      changed=true;
    }
  }
  // v29：倉庫每 2 分鐘的倉儲收入
  const wl=save.company.warehouse||0; if(wl){ save.company.whT=(save.company.whT||0)+dt; if(save.company.whT>=120){ save.company.whT=0; const inc=WAREHOUSE[wl].income; money(inc,'倉庫','倉儲收入'); save.company.revenue+=inc; addHistory('倉庫',inc); logFleetEvent(`${WAREHOUSE[wl].name} 倉儲收入 +${inc}`); toast(`🏬 倉儲收入 +${inc}`,1400); changed=true; } }
  dispatchSaveT+=dt;dispatchUiT+=dt;
  if(changed||dispatchSaveT>=5){dispatchSaveT=0;persist();updateCoins();}
  if(dispatchUiT>=1.2){dispatchUiT=0;if(inGarage()&&S.gTab==='company'&&!$('#gBody').contains(document.activeElement))renderGarage();} // 正在選貨物／改車牌時不要重畫，不然選單會被關掉
}
// v28：一張訂單（起點、終點、貨物、時限、運費）
function makeJob(fromIdx = null, cargoIdx = null) {
  const r = Math.random;
  const ci = cargoIdx == null ? Math.floor(r() * CARGOS.length) : clamp(cargoIdx, 0, CARGOS.length - 1);
  const c0 = CARGOS[ci], noTunnel = (i) => !(c0.danger && DEPOTS[i].kind === 'lumber'); // 危險品不能進隧道：不接林場的單
  let a = fromIdx ?? Math.floor(r() * DEPOTS.length);
  if (!noTunnel(a)) a = (a + 1) % DEPOTS.length;
  let b, guard = 0; do { b = Math.floor(r() * DEPOTS.length); } while ((b === a || !noTunnel(b)) && guard++ < 50);
  const A = DEPOTS[a], B = DEPOTS[b], c = CARGOS[ci];
  const contract = CONTRACTS.find(v => CARGOS[v.cargo] === c) || null;
  const routeLen = computeRoute({ x: A.x, z: A.z, y: 0 }, B).len;
  const toPick = computeRoute({ x: S.x, z: S.z, y: S.y }, A).len;
  const urgent = !!c.fresh || r() < 0.25;
  const base = Math.round((80 + routeLen * 0.4 + c.t * 4) / 10) * 10;
  const reward = Math.round(base * (contract ? contract.multiplier : 1) * (urgent ? 1.2 : 1) * (c.danger ? 1.6 : c.heavy ? 1.45 : 1));
  // 時限：照平均時速約 30 公里估，再多給一些時間（急件給得少）
  const deadline = Math.round(((toPick + routeLen) / 8.5 + 30) * (urgent ? 1.35 : 1.8));
  return { from: a, to: b, cargoIdx: ci, cargo: c.n, tons: c.t, fragile: !!c.fragile, fresh: !!c.fresh, danger: !!c.danger, heavy: !!c.heavy, cat: c.cat, tr: c.tr, urgent, reward, baseReward: base, contractType: contract ? contract.type : urgent ? '急件' : c.cat, deadline, routeLen };
}
function newMission(fromIdx = null, cargoIdx = null, job = null) {
  if (cargoIdx == null && !job && Number.isInteger(save.company.queuedCargo)) cargoIdx = save.company.queuedCargo;
  save.company.queuedCargo = null;
  const j = job || makeJob(fromIdx, cargoIdx);
  S.mission = { ...j, stage: 'pickup', wait: 0, elapsed: 0, cargoDmg: 0, fuel0: save.fuel, redLights: 0, speeding: 0 };
  S.loadT = 0; S.route = null;
  // v36：任務的拖車停在裝貨點，要自己開過去倒車連接（如果剛卸下的拖車就在這裡，就用同一台）
  const pose = depotTrailerPose(j.from);
  if (!S.parked || Math.hypot(S.parked.x - pose.x, S.parked.z - pose.z) < 30) { S.parked = pose; S.pendingPark = null; }
  else S.pendingPark = pose; // 走遠了才把拖車移過去（不會在眼前消失）
  if (rig) { if (S.builtTrailer !== curTrailer() && !inGarage()) rebuildRig(save.truck); else rig.setLoaded(false); }
}
// 裝貨點的拖車位置：車尾朝建築、車頭（大栓）朝路
function depotTrailerPose(i) {
  const D = DEPOTS[i]; let fx = D.x - (D.bx ?? D.x), fz = D.z - (D.bz ?? D.z - 1); const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
  const x = D.x + fx * 4, z = D.z + fz * 4;
  return { x, z, h: Math.atan2(fx, fz), y: groundAt(x, z, D.y ?? null) };
}
// v36：倒車連接拖車（F）
function coupleTrailer() {
  if (S.coupled) { toast('拖車已經接好了；送到目的地的卸貨區停好就會自動卸貨', 2200); return; }
  if (!S.canCouple) { toast(S.parked && S.mission && S.mission.stage === 'pickup' ? '車頭要對齊拖車，慢慢倒車到拖車前面下方再按 F' : '附近沒有可以接的拖車', 2000); return; }
  const P = S.parked;
  S.coupled = true; S.trailerHeading = P.h; S.x = P.x - Math.sin(S.heading) * 0.15; S.z = P.z - Math.cos(S.heading) * 0.15; S.v = 0;
  S.parked = null; S.canCouple = false; Snd.thud(0.35); Snd.airBrake();
  const m = S.mission;
  if (m && m.stage === 'pickup') {
    m.stage = 'deliver'; S.bumpsThisJob = 0; rig.setLoaded(true); S.route = null;
    Snd.coin(); popup(`🔗 拖車接好了！${m.cargo.split(' ')[0]} ${m.tons} 噸`);
    toast(m.danger ? '⚠️ 危險品：不能開進隧道、時速不要超過 80' : m.heavy ? '🚜 超重貨物：時速不要超過 60，轉彎慢慢來' : m.tons >= 20 ? `載了 ${m.tons} 噸：煞車距離會變長，下坡用排氣煞車` : '跟著導航線把貨送到目的地', 3000);
  }
}
// 接單板：送完貨（或按 📋）挑下一張訂單；第一張一定是「就在這裡裝貨」的
let jobOffers = [], jobReceipt = null, jobHere = null;
const jobFilter = { cat: '全部', from: -1, to: -1, sort: 'pay' };
// v36：貨運市場（12 張單、每種貨物至少一張，可以篩選種類、出發地、目的地）
function showJobBoard(receipt = null, hereIdx = null) {
  jobReceipt = receipt; jobHere = hereIdx;
  jobOffers = [makeJob(hereIdx)];
  for (const cat of Object.keys(CARGO_CATS)) { const idx = CARGOS.map((g, i) => (g.cat === cat ? i : -1)).filter((i) => i >= 0); jobOffers.push(makeJob(null, idx[Math.floor(Math.random() * idx.length)])); }
  while (jobOffers.length < 12) jobOffers.push(makeJob());
  renderJobBoard();
}
function renderJobBoard() {
  const receipt = jobReceipt, hereIdx = jobHere;
  const st = (n) => '⭐'.repeat(n) + '☆'.repeat(5 - n);
  const mmss = (s) => `${Math.floor(s / 60)} 分 ${String(Math.round(s % 60)).padStart(2, '0')} 秒`;
  let h = `<div class="jb-head"><span>${receipt ? '✅ 送達！' : '📋 貨運市場'}</span><button id="jbClose">${receipt ? '先不接' : '關閉'}</button></div>`;
  if (receipt) {
    h += `<div class="receipt"><div class="stars">${st(receipt.stars)}</div>
      <div class="row"><span>運費（${escapeHtml(receipt.cargo)}）</span><b>${receipt.reward}</b></div>
      ${receipt.timeBonus ? `<div class="row"><span>準時獎金</span><b class="pos">+${receipt.timeBonus}</b></div>` : ''}
      ${receipt.latePenalty ? `<div class="row"><span>遲到扣款</span><b class="neg">−${receipt.latePenalty}</b></div>` : ''}
      ${receipt.dmgPenalty ? `<div class="row"><span>貨物損傷 ${receipt.dmgPct}%</span><b class="neg">−${receipt.dmgPenalty}</b></div>` : ''}
      ${receipt.bonus ? `<div class="row"><span>零碰撞獎金</span><b class="pos">+${receipt.bonus}</b></div>` : ''}
      ${receipt.fleet ? `<div class="row"><span>車隊營收</span><b class="pos">+${receipt.fleet}</b></div>` : ''}
      <div class="row"><span>花了 ${mmss(receipt.elapsed)}（時限 ${mmss(receipt.deadline)}）</span><b>${receipt.elapsed <= receipt.deadline ? '準時' : '遲到'}</b></div>
      <div class="row"><span>這趟用掉的油（加油時才付）</span><b>約 ${receipt.fuelCost}</b></div>
      ${receipt.notes.length ? `<div class="row"><span>${receipt.notes.join('、')}</span><b></b></div>` : ''}
      <div class="row total"><span>實拿</span><span>💰 ${receipt.payout}</span></div></div>`;
  }
  const depOpt = (sel) => `<option value="-1">全部</option>` + DEPOTS.map((d, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${d.emoji} ${d.name}</option>`).join('');
  h += `<div class="jb-filter">${['全部', ...Object.keys(CARGO_CATS)].map((c) => `<button class="${jobFilter.cat === c ? 'sel' : ''}" data-jcat="${c}">${c === '全部' ? '全部' : CARGO_CATS[c] + ' ' + c}</button>`).join('')}</div>
    <div class="jb-sel"><label>出發地 <select data-jsel="from">${depOpt(jobFilter.from)}</select></label><label>目的地 <select data-jsel="to">${depOpt(jobFilter.to)}</select></label>
      <label>排序 <select data-jsel="sort"><option value="pay" ${jobFilter.sort === 'pay' ? 'selected' : ''}>運費高到低</option><option value="near" ${jobFilter.sort === 'near' ? 'selected' : ''}>離我近</option><option value="short" ${jobFilter.sort === 'short' ? 'selected' : ''}>路程短</option></select></label>
      <button data-jrefresh>🔄 換一批</button></div>`;
  const list = jobOffers.map((j, i) => ({ j, i })).filter(({ j }) => (jobFilter.cat === '全部' || j.cat === jobFilter.cat) && (jobFilter.from < 0 || j.from === jobFilter.from) && (jobFilter.to < 0 || j.to === jobFilter.to));
  const near = (j) => Math.hypot(DEPOTS[j.from].x - S.x, DEPOTS[j.from].z - S.z);
  list.sort((a, b) => jobFilter.sort === 'pay' ? b.j.reward - a.j.reward : jobFilter.sort === 'near' ? near(a.j) - near(b.j) : a.j.routeLen - b.j.routeLen);
  h += `<div class="jobs">${list.map(({ j, i }) => {
    const A = DEPOTS[j.from], B = DEPOTS[j.to], km = j.routeLen >= 1000 ? (j.routeLen / 1000).toFixed(1) + ' 公里' : Math.round(j.routeLen) + ' 公尺';
    const tags = [`${CARGO_CATS[j.cat] || '📦'} ${j.cat || '一般貨物'}`, j.urgent ? '⏱ 急件' : '', j.fragile ? '🥚 易碎' : '', j.fresh ? '🧊 生鮮' : '', j.heavy ? '🏋️ 超重' : j.tons >= 20 ? '🏋️ 重貨' : ''].filter(Boolean).map((t) => `<span>${t}</span>`).join('');
    const rule = cargoRule(j);
    const needLv = CAT_LEVEL[j.cat] || 1, locked = levelOf(save.xp || 0).lv < needLv;
    return `<div class="job ${j.danger ? 'danger' : ''} ${locked ? 'locked' : ''}"><div class="cg">${j.cargo}</div><small>${j.tons} 噸｜${TRAILER_N[j.tr] || '拖車'}｜${km}</small><small>${A.emoji} ${A.name} → ${B.emoji} ${B.name}</small><div class="tags">${tags}</div>${rule ? `<small class="rule">📌 ${rule}</small>` : ''}<small>時限 ${mmss(j.deadline)}｜預估運費</small><div class="pay">💰 ${j.reward}</div><button data-job="${i}" ${locked ? 'disabled' : ''}>${locked ? `🔒 等級 ${needLv} 解鎖` : i === 0 && hereIdx != null ? '就在這裡裝貨' : '接這張'}</button></div>`;
  }).join('') || '<div class="studio-note">沒有符合條件的訂單，換個篩選條件或按「換一批」</div>'}</div>`;
  $('#jobBody').innerHTML = h;
  $('#jobPanel').classList.remove('hidden');
}
function closeJobBoard() { $('#jobPanel').classList.add('hidden'); }
$('#jobBody').addEventListener('change', (e) => { const sel = e.target.closest('[data-jsel]'); if (!sel) return; const k = sel.dataset.jsel; jobFilter[k] = k === 'sort' ? sel.value : Number(sel.value); renderJobBoard(); });
$('#jobBody').addEventListener('click', (e) => {
  if (e.target.closest('#jbClose')) { closeJobBoard(); Snd.click(); return; }
  const fc = e.target.closest('[data-jcat]'); if (fc) { jobFilter.cat = fc.dataset.jcat; renderJobBoard(); Snd.click(); return; }
  if (e.target.closest('[data-jrefresh]')) { showJobBoard(null, jobHere); Snd.click(); return; }
  const b = e.target.closest('[data-job]'); if (!b) return;
  const j = jobOffers[Number(b.dataset.job)]; if (!j) return;
  if (levelOf(save.xp || 0).lv < (CAT_LEVEL[j.cat] || 1)) { toast(`職業等級 ${CAT_LEVEL[j.cat]} 才能接「${j.cat}」`, 1600); return; }
  newMission(null, null, j); closeJobBoard(); Snd.buy(); toast(`📋 接單：${j.cargo}，先到「${DEPOTS[j.from].name}」接${TRAILER_N[j.tr] || '拖車'}，再送到「${DEPOTS[j.to].name}」`, 3200);
});
if ($('#bJobs')) $('#bJobs').onclick = () => { if (S.mission && S.mission.stage === 'deliver') { toast('貨還在車上，先送到再接新的單', 1600); return; } showJobBoard(); };
function missionTarget() { const m = S.mission; return DEPOTS[m.stage === 'pickup' ? m.from : m.to]; }
// 車斗：空車重量（噸）、重心係數（廂型車斗高、平板車低）
const TRAILER_PHYS = { box: { empty: 7.5, cg: 1.1 }, flat: { empty: 6, cg: 0.85 }, dump: { empty: 9, cg: 1.0 } };
function cargoTons() { return S.mission && S.mission.stage === 'deliver' ? S.mission.tons : 0; }
function checkMission(dt) {
  const m = S.mission; if (!m) return;
  m.elapsed = (m.elapsed || 0) + dt;
  if (Math.abs(S.v) * 3.6 > S.speedLimit + 8) m.speeding = (m.speeding || 0) + dt;
  // 貨物損傷：急煞、碎石路高速顛簸（易碎貨更怕）
  if (m.stage === 'deliver') {
    const fr = m.fragile ? 2.2 : 1;
    const decel = -((S.v - (S.prevV ?? S.v)) / Math.max(dt, 1e-3)); S.prevV = S.v;
    if (decel > 4.5) m.cargoDmg = Math.min(1, m.cargoDmg + dt * 0.02 * fr);
    if (S.lastSurface !== 'road' && Math.abs(S.v) > 8) m.cargoDmg = Math.min(1, m.cargoDmg + dt * 0.006 * fr);
    if (S.rollover) m.cargoDmg = 1;
  }
  if (m.stage === 'deliver') {
    if (m.fresh && m.elapsed > m.deadline) m.cargoDmg = Math.min(1, m.cargoDmg + dt * 0.003); // 生鮮遲到慢慢壞掉
    if (m.danger && !m.tunFined && inTunnel(S.x, S.y + 1, S.z)) { m.tunFined = true; m.redLights = (m.redLights || 0) + 1; money(-500, '罰款', '危險品進隧道'); persist(); toast('⚠️ 危險品不能進隧道！罰款 500 金幣', 3000); Snd.no(); }
  }
  if (m.wait > 0) { m.wait -= dt; return; }
  if (m.stage === 'pickup') return; // v36：裝貨＝到裝貨點倒車連接拖車（coupleTrailer）
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
      const TRp = TRAILER_PHYS[curTrailer()] || TRAILER_PHYS.box;
      toast(m.tons >= 20 || TRp.cg > 1.05 ? `載了 ${m.tons} 噸、重心比較高：轉彎和下坡要慢慢開` : `載了 ${m.tons} 噸：煞車距離會變長喔`, 2600);
    } else {
      // v28：結算（準時、損傷、評價）
      const bonus = S.bumpsThisJob === 0 && m.cargoDmg < 0.02 ? Math.round(m.reward * 0.15) : 0;
      const late = Math.max(0, m.elapsed - m.deadline), early = m.elapsed <= m.deadline;
      const timeBonus = early && m.urgent ? Math.round(m.reward * 0.15) : 0;
      const latePenalty = Math.round(m.reward * Math.min(0.5, late / 10 * 0.03));
      const dmgPenalty = Math.round(m.reward * Math.min(0.9, m.cargoDmg));
      const fleetGross = Math.max(0, save.company.trucks - 1) * 120;
      const fleetCost = Math.max(0, save.company.trucks - 1) * 45;
      const payout = Math.max(0, m.reward + bonus + timeBonus - latePenalty - dmgPenalty + fleetGross - fleetCost);
      let stars = 5; const notes = [];
      if (!early) { stars--; if (late > 60) stars--; }
      if (m.cargoDmg > 0.4) stars -= 2; else if (m.cargoDmg > 0.1) stars--;
      if (m.redLights > 0) { stars--; notes.push(`闖紅燈 ${m.redLights} 次`); }
      if (m.speeding > 10) { stars--; notes.push(`超速 ${Math.round(m.speeding)} 秒`); }
      stars = clamp(stars, 1, 5);
      money(payout, '送貨', m.cargo); save.deliveries++;
      const lv0 = levelOf(save.xp || 0).lv, gain = Math.round(60 + m.reward / 8 + stars * 25 + (m.danger || m.heavy ? 60 : 0));
      save.xp = (save.xp || 0) + gain; const lv1 = levelOf(save.xp).lv;
      setTimeout(() => toast(lv1 > lv0 ? `🎖 升級了！職業等級 ${lv1}${Object.entries(CAT_LEVEL).filter(([, l]) => l === lv1).map(([c]) => `，解鎖「${c}」`).join('')}` : `🎖 經驗值 +${gain}`, 2600), 900);
      save.jobs = save.jobs || { done: 0, stars: 0 }; save.jobs.done++; save.jobs.stars += stars; addHistory('送貨', payout);
      // v31：成就用的紀錄
      const fl = save.flags = save.flags || {}, dk = DEPOTS[m.to].kind;
      if (stars === 5) fl.star5 = true; if (dk === 'lumber') fl.lumber = true; if (dk === 'quay') fl.quay = true;
      if (env.state.night > 0.7) fl.night = true; if (env.state.snow) fl.snow = true; if (m.tons >= 24) fl.heavy = true;
      save.company.revenue += m.reward + bonus + timeBonus + fleetGross;
      save.company.expenses += fleetCost; save.company.contracts++;
      persist(); updateCoins();
      Snd.coin(); setTimeout(() => Snd.buy(), 350); popup(`💰 +${payout}`);
      const receipt = { cargo: m.cargo, reward: m.reward, timeBonus, latePenalty, dmgPenalty, dmgPct: Math.round(m.cargoDmg * 100), bonus, fleet: fleetGross - fleetCost, payout, stars, elapsed: m.elapsed, deadline: m.deadline, fuelCost: Math.max(0, Math.round((m.fuel0 - save.fuel) * 60)), notes };
      const here = m.to;
      // v36：卸完貨把拖車留在卸貨區（拖車大栓在第五輪的位置），換成空車頭
      S.coupled = false; S.parked = { x: S.x + Math.sin(S.heading) * 0.15, z: S.z + Math.cos(S.heading) * 0.15, h: S.trailerHeading, y: S.y }; S.trailerHeading = S.heading; S.yA = S.y;
      rig.setLoaded(false); toast('拖車已經放下，接下一張單後去裝貨點接新的拖車', 2600);
      newMission(here); S.mission.wait = 2.2;
      showJobBoard(receipt, here);
    }
  } else S.loadT = 0;
}

// ================= 輸入 =================
const input = { up: false, down: false, left: false, right: false };
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
window.addEventListener('keydown', (e) => {
  if (inGarage() && e.code === 'Escape') { closeGarage(); return; }
  if (e.target && e.target.tagName === 'INPUT') return;
  // v33：地圖、選單（開著時遊戲暫停）
  if (e.code === 'KeyM' && !e.repeat && S.mode !== 'garage') { toggleMap(); e.preventDefault(); return; }
  if (e.code === 'Escape' && !e.repeat) {
    if (!$('#mapPanel').classList.contains('hidden')) { toggleMap(false); return; }
    if (!$('#jobPanel').classList.contains('hidden')) { closeJobBoard(); return; }
    if (!$('#menuPanel').classList.contains('hidden')) { closeMenu(); return; }
    if (S.mode === 'drive') { openMenu('pause'); return; }
  }
  if (S.paused) return;
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'Backspace') e.preventDefault();
  if (e.repeat || S.mode !== 'drive') return;
  const k = e.code;
  if (k === 'KeyH') honk();
  else if (k === 'KeyL') toggleLights();
  else if (k === 'KeyC') switchCam();
  else if (k === 'Backspace') resetTruck();
  else if (k === 'Space') toggleHandbrake();
  else if (k === 'KeyR') toggleGearbox();
  else if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'PageUp') manualShift(1);
  else if (k === 'ControlLeft' || k === 'ControlRight' || k === 'PageDown') manualShift(-1);
  else if (k === 'KeyN') toggleSound();
  else if (k === 'KeyF') coupleTrailer();
  else if (k === 'KeyI') toggleEngine();
  else if (k === 'KeyV') toggleCruise();
  else if (k === 'BracketLeft') S.camH = clamp(S.camH - 0.15, 0.4, 2.2);
  else if (k === 'BracketRight') S.camH = clamp(S.camH + 0.15, 0.4, 2.2);
  else if (k === 'KeyO') { S.dome = !S.dome; Snd.click(); toast(S.dome ? '💡 車內燈：開' : '車內燈：關', 900); }
  else if (k === 'Equal' || k === 'NumpadAdd') S.camDist = clamp(S.camDist / 1.15, 0.55, 2.2);
  else if (k === 'Minus' || k === 'NumpadSubtract') S.camDist = clamp(S.camDist * 1.15, 0.55, 2.2);
  else if (k === 'KeyG') openGarage();
  else if (k === 'KeyQ') setIndicator('L');
  else if (k === 'KeyE') setIndicator('R');
  else if (k === 'KeyX') setIndicator('H');
  else if (k === 'KeyK') toggleWipers();
  else if (k === 'KeyT') cycleEnv('time');
  else if (k === 'KeyY') cycleEnv('weather');
  else if (k === 'KeyJ') toggleRetarder();
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
// v34：兩根手指捏合＝鏡頭遠近（手機平板）
const touchPts = new Map(); let pinch0 = 0, pinchDist0 = 1;
canvas.addEventListener('pointerdown', (e) => {
  touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touchPts.size === 2) { const [a, b] = [...touchPts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchDist0 = inGarage() ? S.gRadius : S.camDist; S.gDrag = null; return; }
  S.gDrag = { x: e.clientX, y: e.clientY, a: inGarage() ? S.gAng : S.camYaw, p: S.camPitch, fy: S.freeYaw, fp: S.freePitch };
});
window.addEventListener('pointermove', (e) => {
  if (touchPts.has(e.pointerId)) touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touchPts.size === 2 && pinch0 > 0) {
    const [a, b] = [...touchPts.values()], k = pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
    if (inGarage()) S.gRadius = clamp(pinchDist0 * k, 6.5, 19); else S.camDist = clamp(pinchDist0 * k, 0.55, 2.2);
    return;
  }
  if (!S.gDrag) return;
  const v = S.gDrag.a - (e.clientX - S.gDrag.x) * 0.008;
  if (inGarage()) S.gAng = v;
  else {
    if (S.cam === 6) { S.freeYaw = S.gDrag.fy - (e.clientX - S.gDrag.x) * 0.008; S.freePitch = clamp(S.gDrag.fp + (e.clientY - S.gDrag.y) * 0.005, 0.05, 1.3); return; }
    S.camYaw = v; S.camYawT = 2.5;
    if (S.cam === 2) S.camPitch = clamp(S.gDrag.p - (e.clientY - S.gDrag.y) * 0.004, -0.6, 0.45); // 駕駛座：上下看
  }
});
const endPtr = (e) => { touchPts.delete(e.pointerId); if (touchPts.size < 2) pinch0 = 0; S.gDrag = null; };
window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);

// ================= 介面 =================
let toastTimer = 0;
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
function popup(msg) { const p = $('#popup'); p.textContent = msg; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); }
function updateCoins() { $('#coinNum').textContent = save.coins; $('#gCoins').textContent = save.coins; }
function honk() { Snd.init(); if (S.hornT > 0) return; S.hornT = 0.4; Snd.horn(save.truck.horn); }
// v40：L 依序：關 → 近燈 → 遠燈 → 關
function toggleLights() {
  if (!S.lights) { S.lights = true; S.highBeam = false; } else if (!S.highBeam) S.highBeam = true; else { S.lights = false; S.highBeam = false; }
  S.lightsManual = true; Snd.click(); refreshButtons(); toast(!S.lights ? '大燈：關' : S.highBeam ? '💡 遠燈（對向有車記得切回近燈）' : '💡 近燈', 900);
}
// v40：引擎發動／熄火（I）、定速巡航（V）
function toggleEngine() {
  if (S.crank > 0) return;
  if (S.engineOn) { if (Math.abs(S.v) > 2) { toast('行駛中不能熄火', 1000); return; } S.engineOn = false; S.cruise = 0; Snd.click(); toast('🔑 引擎熄火（按 I 發動）', 1400); refreshButtons(); return; }
  if (save.fuel <= 0) { toast('沒油了，發不動', 1400); Snd.no(); return; }
  S.crank = 1.1; Snd.starter(); toast('🔑 發動中…', 900);
}
function updateEngine(dt) { if (S.crank > 0) { S.crank -= dt; if (S.crank <= 0) { S.crank = 0; S.engineOn = true; refreshButtons(); toast('引擎發動了', 900); } } }
function toggleCruise() {
  if (S.cruise) { S.cruise = 0; toast('定速巡航：關', 900); refreshButtons(); return; }
  if (!S.engineOn || S.v < 8) { toast('時速 30 以上才能開定速巡航', 1300); return; }
  S.cruise = S.v; toast(`🚀 定速巡航：${Math.round(S.v * 3.6)} km/h（踩煞車取消）`, 1600); refreshButtons();
}
function toggleWipers() { S.wipers = !S.wipers; Snd.click(); refreshButtons(); }
// 排氣煞車（引擎煞車）：放開油門時幫忙減速，下坡比較不用一直踩煞車
function toggleRetarder() { S.retarder = !S.retarder; Snd.click(); refreshButtons(); toast(S.retarder ? '🛑 排氣煞車：開' : '排氣煞車：關', 1000); }
// v33：手煞車（停車時拉起來，車子不會滑；拉著踩油門會提醒）
function toggleHandbrake() {
  if (!S.handbrake && Math.abs(S.v) > 3) { toast('車速太快，先踩煞車停下來再拉手煞車', 1500); return; }
  S.handbrake = !S.handbrake; Snd.airBrake(); if (!S.handbrake) S.air = Math.max(0, S.air - 0.04); refreshButtons(); toast(S.handbrake ? '🅿 手煞車：拉起' : '手煞車：放開', 900);
}
// v33：自排／手排（手排用 Shift 升檔、Ctrl 降檔，平板用畫面上的＋－）
function toggleGearbox() {
  save.settings.gearbox = save.settings.gearbox === 'manual' ? 'auto' : 'manual'; persist(); Snd.click(); refreshButtons();
  toast(save.settings.gearbox === 'manual' ? '⚙️ 手排：Shift 升檔、Ctrl 降檔（平板按 ＋ －）' : '⚙️ 自排：會自己換檔', 2200);
}
function manualShift(dir) {
  if (save.settings.gearbox !== 'manual' || S.shiftT > 0) return;
  // v40：手排 R ↔ N ↔ 1～12（倒檔、空檔要停著才換）
  if (S.gear <= 0 || (S.gear === 1 && dir < 0)) {
    const ng0 = clamp(S.gear + dir, -1, 1);
    if (ng0 === -1 && Math.abs(S.v) > 0.5) { toast('要停下來才能打倒檔', 1000); return; }
    S.gear = ng0; S.shiftT = 0.25; Snd.shift(); toast(ng0 === 0 ? '空檔 N' : ng0 < 0 ? '倒檔 R' : '1 檔', 700); return;
  }
  const ng = clamp(S.gear + dir, 1, GEARS.length); if (ng === S.gear) return;
  // 降檔後轉速太高會傷引擎：不讓降
  const nrpm = (Math.abs(S.v) / RW) * 60 / (2 * Math.PI) * GEARS[ng - 1] * FINAL;
  if (dir < 0 && nrpm > 2350) { toast('⚠️ 車速太快，降這一檔轉速會太高', 1200); Snd.no(); return; }
  S.gear = ng; S.shiftT = 0.35; Snd.shift();
}
function setIndicator(k) { S.ind = S.ind === k ? null : k; S.blinkT = 0; S.indArmed = false; refreshButtons(); }
// v39：鏡頭 0 車尾追蹤、2 駕駛座、4 車頭、5 側面、6 自由鏡頭（拖曳轉、滾輪遠近）、1 高空、3 路邊轉播
const CAM_NAMES = ['車尾追蹤', '高空鏡頭', '駕駛座', '路邊轉播', '車頭視角', '側面視角', '自由鏡頭（拖曳旋轉）'];
const CAM_ORDER = [0, 2, 4, 5, 6, 1, 3];
function switchCam() { S.followFleetId = null; S.cam = CAM_ORDER[(CAM_ORDER.indexOf(S.cam) + 1) % CAM_ORDER.length]; S.camYaw = 0; S.cine = null; toast('📷 ' + CAM_NAMES[S.cam], 1000); }
function resetTruck() {
  Object.assign(S, { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading, trailerHeading: SPAWN.heading, v: 0, steer: 0, gear: 1, y: 0, yA: 0, grade: 0, tunNear: false, tollSide: null, tollPaid: false, roll: 0, rollV: 0, rollover: false, rolloverWarned: false, tipT: 0, tipSide: 1 });
  placeRig(); toast('🔄 回到改裝廠門口', 1200);
}
function toggleSound() { Snd.init(); Snd.setMuted(!Snd.muted); $('#bSound').firstChild.textContent = Snd.muted ? '🔇' : '🔊'; }
function refreshButtons() {
  $('#cL').classList.toggle('on', S.ind === 'L'); $('#cR').classList.toggle('on', S.ind === 'R'); $('#cH').classList.toggle('on', S.ind === 'H');
  $('#cLights').classList.toggle('on', S.lights); $('#cWipers').classList.toggle('on', S.wipers);
  $('#cRet')?.classList.toggle('on', S.retarder); // 舊版網頁快取沒有這顆按鈕時不要當掉
  $('#cPark')?.classList.toggle('on', S.handbrake);
  $('#cEngine')?.classList.toggle('on', S.engineOn); $('#cCruise')?.classList.toggle('on', !!S.cruise);
  $('#cCouple')?.classList.toggle('on', S.coupled);
  const man = save.settings.gearbox === 'manual'; document.body.classList.toggle('manual', man);
  if ($('#cGbx')) $('#cGbx').innerHTML = man ? 'M<span>手排</span>' : 'A<span>自排</span>';
}
$('#bGarage').onclick = () => openGarage();
$('#bCam').onclick = () => switchCam();
$('#bReset').onclick = () => resetTruck();
$('#bSound').onclick = () => toggleSound();
$('#bEnv').onclick = () => { $('#envPanel').classList.toggle('hidden'); renderEnvPanel(); };
$('#cL').onclick = () => setIndicator('L'); $('#cR').onclick = () => setIndicator('R'); $('#cH').onclick = () => setIndicator('H');
if ($('#cPark')) { $('#cPark').onclick = () => toggleHandbrake(); $('#cGbx').onclick = () => toggleGearbox(); $('#cUp').onclick = () => manualShift(1); $('#cDown').onclick = () => manualShift(-1); }
if ($('#bMap')) $('#bMap').onclick = () => toggleMap();
if ($('#cCouple')) $('#cCouple').onclick = () => coupleTrailer();
if ($('#cEngine')) { $('#cEngine').onclick = () => toggleEngine(); $('#cCruise').onclick = () => toggleCruise(); }
$('#cLights').onclick = () => toggleLights(); $('#cWipers').onclick = () => toggleWipers(); $('#cHorn').onclick = () => honk(); if ($('#cRet')) $('#cRet').onclick = () => toggleRetarder();
let coinTaps = [];
$('#coins').addEventListener('click', () => {
  const now = performance.now(); coinTaps = coinTaps.filter((t) => now - t < 3000); coinTaps.push(now);
  if (coinTaps.length >= 7) { coinTaps = []; money(1000, '獎勵', '秘密金幣'); persist(); updateCoins(); Snd.coin(); popup('💰 +1000'); }
});

// ---- 環境（時間、天氣、畫質） ----
const TIME_N = { dawn: '🌅 日出', day: '☀️ 白天', dusk: '🌇 黃昏', night: '🌙 晚上', auto: '🔄 自動日夜' }, WEATHER_N = { clear: '🌤 晴天', overcast: '☁️ 陰天', rain: '🌧 下雨', storm: '⛈ 大雨', fog: '🌫 濃霧', snow: '❄️ 下雪' };
const rainyW = (w) => w === 'rain' || w === 'storm';
// v30：自動日夜循環（12 分鐘一輪：白天 → 黃昏 → 晚上 → 清晨 → 白天，中間慢慢過渡）
const DAY_CYCLE = [['day', 300], ['day>dusk', 30], ['dusk', 30], ['dusk>night', 30], ['night', 240], ['night>dawn', 30], ['dawn', 30], ['dawn>day', 30]]; // v37：早上是日出（東邊、粉橘色）
const DAY_LEN = DAY_CYCLE.reduce((a, b) => a + b[1], 0);
let dayT = 0, dayKey = '', dayMixT = 0;
function dayPhase() {
  let t = dayT % DAY_LEN;
  for (const [k, len] of DAY_CYCLE) { if (t < len) return { k, f: t / len }; t -= len; }
  return { k: 'day', f: 0 };
}
function updateDayCycle(dt) {
  if (save.settings.time !== 'auto' || inGarage()) return;
  dayT += dt; dayMixT -= dt;
  const ph = dayPhase();
  if (ph.k.includes('>')) {
    if (dayMixT > 0) return; dayMixT = 0.5; // 過渡中每半秒更新一次光線
    const [a, b] = ph.k.split('>'), k = ph.f;
    const st = env.apply(k < 0.5 ? a : b, save.settings.weather, env.mixTimes(a, b, k * k * (3 - 2 * k)), false);
    setNight(st.night); dayKey = ph.k; return;
  }
  if (dayKey !== ph.k) { dayKey = ph.k; applyEnv(); }
}
function effectiveTime() { if (save.settings.time !== 'auto') return save.settings.time; const k = dayPhase().k; return k.includes('>') ? k.split('>')[1] : k; }
function applyEnv() {
  const st = env.apply(effectiveTime(), save.settings.weather);
  setNight(st.night); setWet(st.wet); setSnow(st.snow ? 1 : 0);
  if (!S.lightsManual && save.settings.autoLights !== false) S.lights = st.night > 0.3 || !['clear', 'overcast'].includes(save.settings.weather);
  S.wipers = rainyW(save.settings.weather) || save.settings.weather === 'snow';
  refreshButtons();
}
function cycleEnv(kind) {
  const list = kind === 'time' ? ['dawn', 'day', 'dusk', 'night', 'auto'] : ['clear', 'overcast', 'rain', 'storm', 'fog', 'snow'];
  save.settings[kind] = list[(list.indexOf(save.settings[kind]) + 1) % list.length];
  S.lightsManual = false; persist(); applyEnv(); renderEnvPanel();
  toast(kind === 'time' ? TIME_N[save.settings.time] : WEATHER_N[save.settings.weather], 1000);
}
function renderEnvPanel() {
  const b = (kind, id, label) => `<button class="opt ${save.settings[kind] === id ? 'sel' : ''}" data-kind="${kind}" data-id="${id}">${label}</button>`;
  $('#envBody').innerHTML = `<div class="e-sec">時間</div><div class="opts">${Object.entries(TIME_N).map(([k, v]) => b('time', k, v)).join('')}</div>
    <div class="e-sec">天氣</div><div class="opts">${Object.entries(WEATHER_N).map(([k, v]) => b('weather', k, v)).join('')}</div>
    <div class="e-sec">車流（換了會重新載入）</div><div class="opts">${b('traffic', 'few', '少')}${b('traffic', 'normal', '中')}${b('traffic', 'many', '多（會塞車）')}</div>
    <div class="e-sec">畫質（換了會重新載入）</div><div class="opts">${b('quality', 'high', '高（電腦）')}${b('quality', 'mid', '中（平板）')}${b('quality', 'low', '低（手機）')}</div>`;
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
  { id: 'parts', name: '🔧 零件' }, { id: 'perf', name: '⚙️ 性能' }, { id: 'cabin', name: '🛋️ 內裝' }, { id: 'fun', name: '📯 喇叭燈' }, { id: 'trailer', name: '📦 拖車' },
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
canvas.addEventListener('wheel', (e) => {
  if (!inGarage()) { if (S.mode !== 'drive') return; e.preventDefault(); S.camDist = clamp(S.camDist * (e.deltaY > 0 ? 1.1 : 1 / 1.1), 0.55, 2.2); return; } // v34：開車時滾輪＝鏡頭遠近
  e.preventDefault(); S.gRadius = clamp(S.gRadius + Math.sign(e.deltaY) * 1.1, 6.5, 19); S.gAutoRotate = false; $('#rotateToggle').classList.remove('active'); $('#rotateToggle').textContent = '▶ 手動旋轉'; }, { passive: false });
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
  else if (S.gTab === 'parts') h = ['bumper', 'rims', 'chassis', 'skirts', 'tanks', 'stacks', 'lightbar', 'sidelights', 'headlight', 'visor', 'spoiler'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('');
  else if (S.gTab === 'perf') h = `<div class="studio-note">這些零件會真的改變開車的感覺：輪胎影響轉彎和雨天打滑、煞車影響煞車距離和過熱、懸吊影響晃動和側傾。</div>` + ['engine', 'gbx', 'tires', 'brakes', 'suspension'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('') + '<div class="studio-note">公司的引擎調校、節能升級在「🏢 物流經營」分頁（全車隊都有效）。</div>';
  else if (S.gTab === 'cabin') h = `<div class="studio-note">內裝在駕駛座視角（📷 鏡頭 →「駕駛座」）看得到。</div>` + ['interior', 'ambient', 'cabacc'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('');
  else if (S.gTab === 'fun') h = ['horn', 'glow'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('');
  else if (S.gTab === 'trailer') {
    h = '<div class="studio-note">送貨時的拖車種類由訂單決定（廂型／平板／砂石斗），這裡的顏色和彩繪會用在你接的每一台拖車上。</div>' + secHtml('拖車顏色（免費換）') + swatchHtml('trailerColor') + secHtml('拖車彩繪（買過的圖案都能用）') + cardsHtml('trailerPattern')
      + secHtml('拖車彩繪顏色（免費換）') + swatchHtml('trailerPatColor')
      + secHtml('寫在拖車上的名字（最多 8 個字）') + `<input class="name-in" id="nameIn" maxlength="8" value="${escapeHtml(draft.name)}" placeholder="例如：小明號">`;
  }
  else if (S.gTab === 'fleet') {
    h = `<div class="fleet-intro"><b>MY TRUCKS / 我的卡車</b><small>買新卡車：整台車連零件一起買，之後隨時換開；買來的車可以用半價賣掉。</small></div>
      <div class="truck-shop">${NEW_TRUCKS.map((t) => `<article><b>${t.icon} ${t.name}</b><small>${t.desc}</small><small>💰 ${t.price.toLocaleString()}</small><button data-buy-truck="${t.id}">購買</button></article>`).join('')}</div>`;
    h += `<div class="fleet-intro"><b>TRUCK COLLECTION / 專屬卡車收藏</b><small>把目前改裝完成的卡車保存成獨立車款。載入收藏不會覆蓋其他收藏；最多保存 8 台。</small><button class="fleet-save-current" data-fleet-save>＋ 收藏目前卡車</button><div class="fleet-count">收藏數：${save.fleet.length} / 8</div></div>`;
    h += save.fleet.length ? `<div class="fleet-grid">${save.fleet.map(v => `<article class="fleet-card"><div class="fleet-photo">${v.photo ? `<img src="${v.photo}" alt="${escapeHtml(v.name)} 展示照">` : '<span>🚛</span><small>尚未拍攝展示照</small>'}</div><div class="fleet-card-info"><input class="fleet-name" maxlength="16" value="${escapeHtml(v.name)}" aria-label="卡車名稱" data-fleet-name="${v.id}"><small>${escapeHtml(v.truck.cabStyle === 'us' ? '美式長鼻' : '歐式平頭')}・${escapeHtml(v.truck.trailerType || 'box')}・${escapeHtml(v.truck.paint || 'normal')} 烤漆</small><div class="fleet-actions"><button data-fleet-load="${v.id}">載入車款</button><button data-fleet-photo="${v.id}">拍攝展示照</button>${v.bought ? `<button class="danger" data-fleet-sell="${v.id}">賣掉 💰${Math.round(v.bought / 2).toLocaleString()}</button>` : `<button class="danger" data-fleet-delete="${v.id}">刪除</button>`}</div></div></article>`).join('')}</div>` : '<div class="fleet-empty">🚛<b>車庫還沒有收藏</b><small>先完成一台喜歡的卡車，再按「收藏目前卡車」。</small></div>';
  }
  else if (S.gTab === 'company') {
    const c = save.company, engineCosts = [3200, 6800, 12500], fuelCosts = [2600, 5600, 9800];
    const truckCost = 15000 + Math.max(0, c.trucks - 1) * 8500;
    const engineLabel = c.engineLevel >= 3 ? '已達最高等級' : `升級至 Lv.${c.engineLevel + 1}｜💰 ${engineCosts[c.engineLevel]}`;
    const fuelLabel = c.fuelLevel >= 3 ? '已達最高等級' : `升級至 Lv.${c.fuelLevel + 1}｜💰 ${fuelCosts[c.fuelLevel]}`;
    const net = c.revenue - c.expenses;
    h = `<div class="company-hero"><div class="company-kicker">LOGISTICS MANAGEMENT / 物流營運中心</div><label>公司名稱<input id="companyName" maxlength="20" value="${escapeHtml(c.name)}"></label><div class="company-stats"><div><small>車隊車輛</small><b>🚛 ${c.trucks} / 5</b></div><div><small>完成趟次</small><b>${c.contracts}</b></div><div><small>累計營收</small><b>💰 ${c.revenue.toLocaleString()}</b></div><div><small>營運淨收益</small><b class="${net >= 0 ? 'positive' : 'negative'}">${net.toLocaleString()}</b></div></div></div>
      <div class="company-section"><b>🚚 車隊擴編</b><small>每完成一趟親自承運的貨運，其他車輛會同步產生營收 120 金幣，並計入 45 金幣營運成本。</small><div class="company-upgrade"><span>新增一台營運卡車<br><small>目前 ${c.trucks} 台｜最多 ${fleetCap()} 台（升級倉庫可以多放）</small></span></div>${Object.entries(TRUCK_MODELS).map(([id, tm]) => `<div class="level-row"><span>${tm.name}<b>運費 ×${tm.mult}</b></span><button data-company-action="truck" data-model="${id}" ${c.trucks >= fleetCap() ? 'disabled' : ''}>${c.trucks >= fleetCap() ? '車隊已滿' : `購買｜💰 ${truckPrice(id)}`}</button></div>`).join('')}</div>${companyExtraHtml()}
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

// v38：買新卡車（整台含零件）、賣掉買來的車
const NEW_TRUCKS = [
  { id: 'city', icon: '🚚', name: '城市配送型', price: 9000, desc: '美式長鼻、550 匹、全天候輪胎，市區好開', cfg: { cabStyle: 'us', engine: 'e550', tires: 'allweather', cabColor: '#f5f5f5', bumper: 'chromeb', name: '城市配送' } },
  { id: 'long', icon: '🚛', name: '長途旗艦型', price: 22000, desc: '歐式平頭、650 匹、14 速、氣壓懸吊、導流罩，國道長途最舒服', cfg: { cabStyle: 'euro', engine: 'e650', gbx: 'g14', suspension: 'air', spoiler: 'on', skirts: 'on', cabColor: '#1a237e', sidelights: 'white', name: '長途旗艦' } },
  { id: 'heavy', icon: '🏗️', name: '重載工程型', price: 18000, desc: '歐式平頭、650 匹、陶瓷煞車、加高底盤、鐵牛欄，重貨山路專用', cfg: { cabStyle: 'euro', engine: 'e650', brakes: 'ceramic', chassis: 'lift', bumper: 'bull', stacks: 'on', cabColor: '#f9a825', name: '重載工程' } },
];
function buyNewTruck(id) {
  const t = NEW_TRUCKS.find((x) => x.id === id); if (!t) return;
  if (save.coins < t.price) { toast(`金幣不夠，還差 ${(t.price - save.coins).toLocaleString()}`, 1800); Snd.no(); return; }
  if (save.fleet.length >= 8) { toast('收藏車庫已滿（最多 8 台），請先賣掉或刪除一台', 2000); return; }
  money(-t.price, '買車', t.name);
  for (const [k, v] of Object.entries(t.cfg)) if (ITEM_KEYS.includes(k) && !isOwned(k, v)) save.owned.push(ownKey(k, v)); // 車上的零件都算你的
  const truck = { ...DEFAULT_TRUCK, ...t.cfg };
  save.fleet.unshift({ id: `truck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: t.name, truck, photo: '', savedAt: Date.now(), bought: t.price });
  persist(); Snd.buy(); toast(`🚛 買了「${t.name}」！按「載入車款」就能開`, 2400); renderGarage();
}
function sellFleetTruck(id) {
  const i = save.fleet.findIndex((v) => v.id === id); if (i < 0 || !save.fleet[i].bought) return;
  const v = save.fleet[i], price = Math.round(v.bought / 2);
  if (!confirm(`確定用 ${price.toLocaleString()} 金幣賣掉「${v.name}」？`)) return;
  save.fleet.splice(i, 1); money(price, '賣車', v.name); persist(); Snd.coin(); toast(`💰 賣掉「${v.name}」+${price.toLocaleString()}`, 2000); renderGarage();
}
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
  const buyT=e.target.closest('[data-buy-truck]'); if(buyT){buyNewTruck(buyT.dataset.buyTruck);return;}
  const sellT=e.target.closest('[data-fleet-sell]'); if(sellT){sellFleetTruck(sellT.dataset.fleetSell);return;}
  const photoBtn=e.target.closest('[data-fleet-photo]'); if(photoBtn){captureFleetPhoto(photoBtn.dataset.fleetPhoto);return;}
  const delBtn=e.target.closest('[data-fleet-delete]'); if(delBtn){const i=save.fleet.findIndex(v=>v.id===delBtn.dataset.fleetDelete);if(i>=0){const [removed]=save.fleet.splice(i,1);if(!persist()){save.fleet.splice(i,0,removed);toast('刪除失敗，儲存空間異常');return;}renderGarage();toast('已刪除收藏車款');}return;}
});
$('#gBody').addEventListener('change', e => { const input=e.target.closest('[data-fleet-name]'); if(!input)return; const entry=save.fleet.find(v=>v.id===input.dataset.fleetName); if(!entry)return; entry.name=String(input.value||'我的卡車').slice(0,16); persist(); toast('車款名稱已更新'); });
$('#gBody').addEventListener('change', e => { const paint=e.target.closest('[data-fleet-paint]'); const plate=e.target.closest('[data-fleet-plate]'); if(paint){const u=save.company.fleetUnits.find(v=>v.id===paint.dataset.fleetPaint);if(u){u.paint=paint.value;persist();traffic.syncFleet(save.company.fleetUnits,save.company.name);toast(`${u.name} 車隊烤漆已更新`);}} if(plate){const u=save.company.fleetUnits.find(v=>v.id===plate.dataset.fleetPlate);if(u){u.plate=String(plate.value||'').replace(/[^a-zA-Z0-9-]/g,'').slice(0,10)||'BK-000';persist();traffic.syncFleet(save.company.fleetUnits,save.company.name);toast(`${u.name} 車牌已更新`);}} });


// G：物流公司、車隊擴編、貨運合約與車輛升級
$('#gBody').addEventListener('click', e => {
  if (e.target.closest('[data-hire-refresh]')) { if (save.coins < 50) { toast('金幣不夠'); return; } money(-50, '車隊', '刷新司機名單'); makeDrivers(); renderGarage(); Snd.click(); return; }
  const hire = e.target.closest('[data-hire]');
  if (hire) {
    const d = driverPool[Number(hire.dataset.hire)], sel = $(`[data-hire-unit="${hire.dataset.hire}"]`), u = save.company.fleetUnits.find((v) => v.id === sel?.value);
    if (!d || !u) return;
    if (save.coins < d.fee) { toast(`金幣不足，還差 ${d.fee - save.coins} 金幣`); return; }
    money(-d.fee, '車隊', '雇用司機'); save.company.expenses += d.fee; addHistory('簽約', -d.fee);
    logFleetEvent(`${u.name} 新司機 ${d.name}（${'⭐'.repeat(d.skill)}）上任，原司機 ${u.driver} 離職`);
    u.driver = d.name; u.skill = d.skill; u.fatigue = 0; u.driverState = '待命';
    driverPool.splice(Number(hire.dataset.hire), 1, (() => { const s2 = 1 + Math.floor(Math.random() * 3); return { name: DRIVER_NAMES[Math.floor(Math.random() * DRIVER_NAMES.length)], skill: s2, fee: s2 * 350 }; })());
    persist(); updateCoins(); renderGarage(); toast(`👷 ${d.name} 開始幫你開 ${u.name}！`); Snd.buy(); return;
  }
  const follow=e.target.closest('[data-follow-fleet]');if(follow){S.followFleetId=follow.dataset.followFleet;closeGarage();toast('📍 已切換至車隊追蹤鏡頭');return;}
  const dispatch=e.target.closest('[data-dispatch]');if(dispatch){const id=dispatch.dataset.dispatch,select=$(`[data-unit-cargo="${id}"]`);dispatchUnit(id,Number(select?.value));return;}
  const service=e.target.closest('[data-unit-service]');if(service){serviceFleetUnit(service.dataset.unitId,service.dataset.unitService);return;}
  const action = e.target.closest('[data-company-action]');
  if (action) {
    const c = save.company, kind = action.dataset.companyAction;
    const costs = { engine: [3200, 6800, 12500], fuel: [2600, 5600, 9800] };
    let cost = 0, message = '';
    if (kind === 'warehouse') {
      const next = WAREHOUSE[(c.warehouse || 0) + 1]; if (!next) return;
      if (save.coins < next.cost) { toast(`金幣不足，還差 ${next.cost - save.coins} 金幣`); return; }
      money(-next.cost, '車隊', '蓋倉庫'); c.expenses += next.cost; c.warehouse = (c.warehouse || 0) + 1; addHistory('倉庫', -next.cost);
      persist(); updateCoins(); renderGarage(); toast(`🏬 升級成「${next.name}」！`); Snd.buy(); return;
    }
    if (kind === 'truck') {
      if (c.trucks >= fleetCap()) return;
      const model = TRUCK_MODELS[action.dataset.model] ? action.dataset.model : 'std';
      cost = truckPrice(model);
      if (save.coins < cost) { toast(`金幣不足，還差 ${cost - save.coins} 金幣`); return; }
      money(-cost, '買車', '營運卡車'); c.trucks++; c.expenses += cost; addHistory('買車', -cost); c.fleetUnits.push(createFleetUnit(c.fleetUnits.length, TRUCK_MODELS[action.dataset.model] ? action.dataset.model : 'std')); traffic.syncFleet(c.fleetUnits,c.name); message = `車隊擴編完成！現在有 ${c.trucks} 台營運卡車，已新增實體車隊單位`;
    } else if (kind === 'engine' || kind === 'fuel') {
      const key = kind === 'engine' ? 'engineLevel' : 'fuelLevel';
      if (c[key] >= 3) return;
      cost = costs[kind][c[key]];
      if (save.coins < cost) { toast(`金幣不足，還差 ${cost - save.coins} 金幣`); return; }
      money(-cost, '車隊', '公司升級'); c[key]++; c.expenses += cost;
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
    money(-c, '維修', '改裝廠修車'); save.damage = 0; persist(); Snd.buy(); toast('🔧 修好了！');
  } else if (svc === 'fuel') {
    if (save.fuel >= 0.99) return;
    const c = Math.min(fuelCost(), save.coins); money(-c, '加油', '改裝廠加油'); save.fuel = 1; persist(); Snd.buy(); toast('⛽ 油加滿了');
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
  if (cat === 'glow' || cat === 'skirts' || cat === 'tanks' || cat === 'chassis' || cat === 'tires' || cat === 'brakes' || cat === 'suspension') return 'side';
  if (cat === 'headlight') return 'front';
  if (cat === 'interior' || cat === 'ambient') return 'front';
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
  money(-it.price, '改裝', it.name || p.id); save.owned.push(ownKey(p.cat, p.id)); save.truck[p.cat] = p.id; persist();
  S.pending = null; Snd.buy(); popup(`${it.icon} 買到了！`); renderGarage();
}

// ================= 重車物理 =================
const GEARS12 = [14.9, 11.7, 9.1, 7.1, 5.6, 4.4, 3.4, 2.7, 2.1, 1.6, 1.28, 1.0], GEARS14 = [...GEARS12, 0.86, 0.74], FINAL = 2.85, EFF = 0.88, RW = 0.53, R_GEAR = 13;
let GEARS = GEARS12; // v37：14 速多兩個超速檔
const ENGINE_MUL = { e450: 1, e550: 1.18, e650: 1.36 };
const L = 3.8, LT = 10.7, VMAX = 33; // v32：最高約 120 公里（真實聯結車國道約 90～110）
function torque(rpm) {
  if (rpm < 1000) return 1700 + (rpm - 600) * 2;
  if (rpm <= 1400) return 2500;
  if (rpm <= 1900) return 2500 - (rpm - 1400) * 1.2;
  return Math.max(0, 1900 - (rpm - 1900) * 9);
}
const tmpV = new THREE.Vector3();
function rigPoints(x, z, h, th) {
  const fx = Math.sin(h), fz = Math.cos(h), tx = Math.sin(th), tz = Math.cos(th);
  if (!S.coupled) return [{ x: x + fx * 2.2, z: z + fz * 2.2, r: 1.6 }, { x: x + fx * (rig.frontZ - 1.1), z: z + fz * (rig.frontZ - 1.1), r: 1.3 }];
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
    if (!S.coupled && S.parked) for (const t of [3.6, 7.2, 10.8]) { const P = S.parked, ox = P.x - Math.sin(P.h) * t, oz = P.z - Math.cos(P.h) * t; if ((p.x - ox) ** 2 + (p.z - oz) ** 2 < (p.r + 1.35) ** 2) return { wall: true }; } // 停著的拖車（車頭下面那段可以倒進去）
  }
  return null;
}
function drive(dt) {
  S.hint = '';
  if (S.rollover) { S.v = 0; S.thr = 0; S.hint = '翻車了！按 🔄（或 Backspace）回到改裝廠'; return; }
  // v25：車斗種類決定空車重量和重心高度；貨越重、重心越高
  const tons = cargoTons(), TR = TRAILER_PHYS[curTrailer()] || TRAILER_PHYS.box;
  const mass = 9000 + (S.coupled ? TR.empty * 1000 + tons * 1000 : 0); // v36：沒接拖車只有車頭的重量
  const cg = S.coupled ? TR.cg * (1 + tons / 70) : 0.8; // 1＝一般；越大越容易翻
  const surf = surfaceAt(S.x, S.z); S.lastSurface = surf;
  const wet = env.state.wet;
  const loadGrip = clamp(1 - tons * 0.0035, 0.88, 1);
  const tireT = save.truck.tires, wetMul = tireT === 'allweather' ? 0.9 : 0.78, dryMul = tireT === 'sport' ? 1.1 : 1;
  const snowMul = env.state.snow ? (tireT === 'allweather' ? 0.78 : 0.6) : 1; // 雪地很滑（全天候輪胎好一點）
  const grip = (surf === 'road' ? 1 : surf === 'gravel' ? 0.72 : 0.78) * (wet ? wetMul : 1) * snowMul * dryMul * loadGrip;
  const crr = surf === 'road' ? 0.008 : surf === 'gravel' ? 0.042 : 0.028;
  S.speedLimit = speedLimitAt(S.x, S.z, S.y);
  if (S.coupled && S.mission && S.mission.stage === 'deliver') { if (S.mission.danger) S.speedLimit = Math.min(S.speedLimit, 80); if (S.mission.heavy) S.speedLimit = Math.min(S.speedLimit, 60); } // v36：危險品、重型機械限速
  // 油門、煞車慢慢踩下去
  if (S.cruise && (input.down || S.handbrake || S.v < 5 || !S.engineOn)) { S.cruise = 0; toast('定速巡航：取消', 900); }
  const cruiseThr = S.cruise && !input.up ? clamp((S.cruise - S.v) * 0.6 + 0.25, 0, 1) : 0; // v40：定速巡航
  S.thr += ((input.up ? 1 : cruiseThr) - S.thr) * Math.min(1, dt * 4);
  const brkIn = input.down ? 1 : 0;
  const noFuel = save.fuel <= 0;
  const power = (1 - save.damage * 0.45) * (noFuel || !S.engineOn ? 0 : 1); // v40：熄火沒有動力
  // 倒車：停住後按住煞車 0.3 秒
  if (S.gear > 0 && Math.abs(S.v) < 0.3 && input.down && !input.up) { S.revHold += dt; if (S.revHold > 0.3) { S.gear = -1; Snd.shift(); } } else if (S.gear > 0) S.revHold = 0;
  if (S.gear < 0 && input.up && Math.abs(S.v) < 0.3) { S.gear = 1; S.revHold = 0; Snd.shift(); }
  const rev = S.gear < 0;
  const accelPedal = rev ? brkIn : S.thr;
  const brakePedal = rev ? (input.up ? 1 : 0) : brkIn;
  // 轉速
  const neutral = S.gear === 0; // v40：手排的空檔 N
  const ratio = rev ? R_GEAR : neutral ? 0 : GEARS[S.gear - 1];
  const wheelRpm = (Math.abs(S.v) / RW) * 60 / (2 * Math.PI);
  let rpm = wheelRpm * ratio * FINAL;
  if (neutral) rpm = 600 + accelPedal * 1600; // 空檔踩油門只會空轉
  else if (rpm < 600 + accelPedal * 700 && (rev || S.gear <= 2)) rpm = 600 + accelPedal * 700 * (1 - Math.min(1, rpm / 1300)) + rpm * 0.5; // 離合器半聯結
  rpm = Math.max(600, rpm);
  if (!S.engineOn) rpm = S.crank > 0 ? 180 + Math.sin(S.time * 40) * 60 : 0; // 熄火（發動中＝起動馬達轉）
  S.rpm += (rpm - S.rpm) * Math.min(1, dt * 8);
  // 自動排檔
  if (S.shiftT > 0) S.shiftT -= dt;
  else if (!rev && save.settings.gearbox === 'manual') {
    if (Math.abs(S.v) < 0.5 && S.gear > 2 && accelPedal > 0) { S.gear = 1; Snd.shift(); } // 手排停下來忘記降檔：自動退到 1 檔（不會熄火）
    if (neutral && accelPedal > 0.3 && !S.hint) S.hint = '現在是空檔 N：按 Shift（＋）打進 1 檔';
  }
  else if (!rev) {
    if (S.rpm > 1750 && S.gear < GEARS.length) { S.gear++; S.shiftT = 0.4; Snd.shift(); if (S.thr > 0.5) Snd.blowOff(); }
    else if (S.rpm < 1050 && S.gear > 1 && Math.abs(S.v) > 1) { S.gear--; S.shiftT = 0.3; Snd.shift(); }
    else if (Math.abs(S.v) < 1 && S.gear > 1) S.gear = 1;
  }
  let F = 0;
  // v33：氣壓（踩煞車用掉、引擎轉著會補回來）；太低時彈簧煞車會自己煞住
  // 每踩一次煞車用掉一些氣（踩住不放不會一直漏），一直連續點煞車才會不夠
  S.air = clamp(S.air - Math.max(0, brakePedal - (S.prevBrk || 0)) * 0.07 + (S.engineOn ? dt * 0.03 * Math.min(1.4, S.rpm / 1300) : 0), 0, 1); // 熄火時打氣機不會補氣 S.prevBrk = brakePedal;
  const springBrake = S.air < 0.18;
  if (S.handbrake && accelPedal > 0.3) S.hint = '🅿 手煞車還拉著！按空白鍵（平板按 🅿）放開';
  else if (springBrake) S.hint = '⚠️ 氣壓太低，煞車自己鎖住了：停著等氣壓回來';
  else if (save.settings.gearbox === 'manual' && !rev && S.rpm > 1950 && accelPedal > 0.3 && S.gear < GEARS.length) S.hint = '轉速太高了，按 Shift（＋）升檔';
  else if (save.settings.gearbox === 'manual' && !rev && S.rpm < 800 && accelPedal > 0.3 && S.gear > 1 && Math.abs(S.v) > 0.5) S.hint = '轉速太低沒力氣，按 Ctrl（－）降檔';
  if (S.shiftT <= 0 && accelPedal > 0 && !S.handbrake && !springBrake) {
    F = accelPedal * torque(S.rpm) * (1 + save.company.engineLevel * 0.08) * (ENGINE_MUL[save.truck.engine] || 1) * ratio * FINAL * EFF / RW * power;
    F = Math.min(F, 2.6 * mass * grip); // 抓地力上限
    if (!rev && S.v > VMAX + save.company.engineLevel * 0.7) F = 0;
    if (rev && S.v < -4) F = 0;
    if (rev) F = -F;
  }
  const dir = Math.sign(S.v);
  const resist = crr * mass * 9.81 + 3.3 * S.v * S.v + (accelPedal < 0.05 ? 0.035 * mass * Math.min(1, Math.abs(S.v)) : 0);
  let a = F / mass - dir * resist / mass - 9.81 * S.grade; // 上坡變慢、下坡變快
  // 排氣煞車：放開油門時在中高轉速幫忙減速（重車更明顯），下坡用它控速
  if (S.retarder && S.engineOn && !neutral && !rev && accelPedal < 0.05 && S.v > 3) a -= Math.min(1.4, 0.35 + S.rpm / 2400) * (0.6 + 0.4 * Math.min(1, tons / 20));
  // v32：不再自動壓到速限（之前市區最快只有 50）；超速只會提醒、影響送貨評價
  if (!rev && S.v > VMAX + save.company.engineLevel * 0.7 + 0.3) a -= (S.v - (VMAX + save.company.engineLevel * 0.7)) * 1.5;
  if (rev && S.v < -5) a += (-5 - S.v) * 1.5; // 倒車下坡也不會越倒越快
  // 煞車：重車煞車距離比較長
  const ceramic = save.truck.brakes === 'ceramic';
  const fade = 1 - clamp((S.brakeTemp - (ceramic ? 0.7 : 0.45)) * 0.62, 0, 0.38);
  let brakeDecel = brakePedal * (ceramic ? 6.0 : 5.2) * grip * (1 - tons / 65) * fade; // 重車煞車距離長：滿載大約是空車的 1.6 倍
  if (S.handbrake || springBrake) brakeDecel = Math.max(brakeDecel, 4.5 * grip); // 手煞車／彈簧煞車
  S.v += a * dt;
  if (brakeDecel > 0) { const dv = brakeDecel * dt; S.v = Math.abs(S.v) <= dv ? 0 : S.v - Math.sign(S.v) * dv; }
  // 長時間重煞車會累積煞車溫度；放開煞車後逐漸冷卻，熱衰退會降低制動力。
  S.brakeTemp = clamp(S.brakeTemp + (brakePedal * (Math.abs(S.v) / 24) * 0.22 * (0.7 + mass / 60000) - 0.035) * dt, 0, 1); // 越重越容易熱
  if (S.brakeTemp > 0.6 && brakePedal > 0) S.hint = S.retarder ? '🔥 煞車太燙了！放開煞車讓它涼一下' : '🔥 煞車太燙了！打開「排氣煞車」下坡比較不用踩煞車';
  if (Math.abs(S.v) < 0.05 && accelPedal < 0.05) S.v = 0;
  // 氣壓煞車「嘶」：剛停下來
  const stopped = Math.abs(S.v) < 0.05;
  if (stopped && !S.wasStopped && brakePedal > 0) Snd.airBrake();
  S.wasStopped = stopped;

  // 轉向：方向盤慢慢轉，車速越快能轉的角度越小
  const target = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * (0.6 / (1 + Math.abs(S.v) * 0.07));
  const sk = { low: 0.7, normal: 1, high: 1.4 }[save.settings.steer] || 1; // v38：方向盤靈敏度
  const rate = (target === 0 ? 1.8 : 1.1) * sk;
  S.steer += clamp(target - S.steer, -rate * dt, rate * dt);

  const px = S.x, pz = S.z, ph = S.heading, pth = S.trailerHeading;
  // 輪胎抓地力有上限：太快轉太急會推頭打滑（下雨、碎石路、載重時更早打滑）
  let yawRate = (S.v / L) * Math.tan(S.steer) * grip;
  const latMax = 7.5 * grip * (S.coupled ? 1 - Math.min(0.18, tons / 160) : 1.05); // 公尺/秒²；v40：拖車重壓在第五輪，前輪抓地比例變少（重載容易推頭）
  const latNow = Math.abs(yawRate * S.v);
  S.slip = latNow > latMax ? Math.min(1, (latNow - latMax) / latMax) : Math.max(0, S.slip - dt * 2);
  if (latNow > latMax && Math.abs(S.v) > 1) yawRate *= latMax / latNow;
  if (S.slip > 0.15 && !S.hint) S.hint = wet ? '🌧 路滑打滑了！慢一點再轉' : '輪胎打滑了！慢一點再轉';
  S.heading += yawRate * dt; S.yawRate = yawRate;
  S.x += Math.sin(S.heading) * S.v * dt; S.z += Math.cos(S.heading) * S.v * dt;
  if (S.coupled) S.trailerHeading += (S.v / LT) * Math.sin(S.heading - S.trailerHeading) * dt; else S.trailerHeading = S.heading;
  // 折刀（拖車甩尾）：濕地或打滑時重踩煞車又在轉彎，拖車會往外甩
  const relJ = wrapAngle(S.heading - S.trailerHeading);
  if (S.coupled && brakePedal > 0.6 && Math.abs(S.v) > 11 && grip < 0.9 && Math.abs(S.steer) > 0.08) {
    S.jackT += dt; S.trailerHeading -= Math.sign(relJ || S.steer) * 0.5 * Math.min(1, S.jackT) * dt;
    if (S.jackT > 0.6 && !S.hint) S.hint = '⚠️ 拖車快甩尾了！放開煞車、把方向盤回正';
  } else S.jackT = Math.max(0, S.jackT - dt * 2);
  // v40：拖車自己的側傾（跟著拖車的轉彎離心力，載越重越傾）
  { const tyr = wrapAngle(S.trailerHeading - pth) / Math.max(dt, 1e-3), aT = S.coupled ? tyr * S.v : 0, tT = clamp(aT * 0.02 * (1 + tons / 30) * (save.truck.suspension === 'air' ? 0.7 : 1), -0.12, 0.12);
    S.trollV += ((tT - S.troll) * 40 - S.trollV * 7) * dt; S.troll += S.trollV * dt; }
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
      if (hit.car && impact > 4) { traffic.crash(hit.car, 25); const pay = Math.round(impact * 15); money(-pay, '賠償', '撞到別的車'); persist(); setTimeout(() => toast(`💥 肇事賠償 ${pay} 金幣`, 1800), 1300); } // 被撞的車停在路邊閃故障燈
      if (S.mission && S.mission.stage === 'deliver') S.mission.cargoDmg = Math.min(1, S.mission.cargoDmg + impact * 0.012 * (S.mission.fragile || S.mission.danger ? 2.2 : 1)); // 貨物也會撞壞
    }
    S.v = -S.v * 0.2;
  }
  // 路面高度、坡度
  {
    const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
    const y0 = S.y;
    S.y = groundAt(S.x, S.z, y0);
    S.grade = (groundAt(S.x + fx * L, S.z + fz * L, S.y, 1.5) - S.y) / L;
    S.yA = S.coupled ? clamp(groundAt(S.x - Math.sin(S.trailerHeading) * LT, S.z - Math.cos(S.trailerHeading) * LT, S.y, 1.8), S.y - 1.8, S.y + 1.8) : S.y; // 拖車尾巴超出橋面時不要往下栽
    S.tunNear = nearTunnel(S.x, S.z);
    tollCheck(S.x + fx * 4, S.z + fz * 4, fx, fz);
  }
  // v36：倒車連接拖車的提示
  if (!S.coupled && S.parked) {
    const fwx = S.x + Math.sin(S.heading) * 0.15, fwz = S.z + Math.cos(S.heading) * 0.15;
    const dP = Math.hypot(fwx - S.parked.x, fwz - S.parked.z), ang = Math.abs(wrapAngle(S.heading - S.parked.h));
    S.canCouple = dP < 4 && ang < 0.8 && Math.abs(S.v) < 1.5 && !!(S.mission && S.mission.stage === 'pickup');
    if (S.mission && S.mission.stage === 'pickup' && dP < 45 && !S.hint) S.hint = S.canCouple ? '🔗 對準了！按 F（平板按 🔗）連接拖車' : dP < 16 ? `車頭對齊拖車方向，慢慢倒車到拖車前面下方（還差 ${dP.toFixed(1)} 公尺）` : '拖車在前面的裝貨區：開過去，車頭跟拖車同方向再倒車';
  } else S.canCouple = false;
  const dist = Math.abs(S.v) * dt;
  S.travelled += dist; S.wheelAngle += (S.v * dt) / RW;
  save.odo = (save.odo || 0) + Math.abs(dist);
  // 車身側傾、點頭（彈簧＋阻尼）
  const aLat = (S.yawRate || 0) * S.v; // 實際的側向力（打滑時輪胎抓不住，力量有上限：空車會滑、不會翻）
  const aLong = (S.v - S.lastV) / Math.max(dt, 1e-3); S.lastV = S.v;
  // 翻車：轉彎太快（載越重越容易）先提醒，持續太快才會翻；車身只微微側傾
  const risk = Math.abs(aLat) * (1 + tons / 40) * cg;
  S.tipT = risk > 14 ? (S.tipT || 0) + dt : Math.max(0, (S.tipT || 0) - dt * 2);
  if (risk > 10) S.hint = '轉彎太快了，慢一點，小心翻車！';
  const airSus = save.truck.suspension === 'air';
  const rollT = clamp(aLat * (airSus ? 0.011 : 0.016) * (1 + tons / 40), -0.1, 0.1) * (1 + S.tipT * 2), pitchT = clamp(-aLong * (airSus ? 0.005 : 0.008), -0.05, 0.05);
  S.rollV += ((rollT - S.roll) * 70 - S.rollV * 9) * dt; S.roll += S.rollV * dt;
  if (S.tipT > 0.7 && !S.rollover) { S.rollover = true; S.tipSide = Math.sign(aLat) || 1; S.v = 0; S.rolloverWarned = true; Snd.thud(1); S.shake = 1.2; toast('⚠️ 轉太快翻車了！按 🔄（或 Backspace）回到改裝廠', 4200); }
  S.pitchV += ((pitchT - S.pitch) * 70 - S.pitchV * 9) * dt; S.pitch += S.pitchV * dt;
  const amp = surf === 'road' ? 0.018 : surf === 'gravel' ? 0.075 : 0.055;
  const roughness = Math.min(1.8, Math.abs(S.v) / 12);
  S.bump = Math.sin(S.travelled * 1.9) * Math.sin(S.travelled * 0.71) * amp * roughness;
  // N：底盤懸吊以彈簧／阻尼回應路面起伏，車速越快、碎石路越顛簸。
  const suspensionTarget = S.bump * (surf === 'road' ? 0.65 : 1.15) * (airSus ? 0.45 : 1);
  S.suspensionV += ((suspensionTarget - S.suspension) * 34 - S.suspensionV * 8.5) * dt;
  S.suspension += S.suspensionV * dt;
  // 油、水溫、髒污
  if (S.engineOn) save.fuel = clamp(save.fuel - (0.00012 + S.thr * (S.rpm / 2100) * 0.0011) * (1 - save.company.fuelLevel * 0.1) * dt, 0, 1);
  S.temp += ((0.5 + S.thr * 0.3 * (S.rpm / 2100)) - S.temp) * dt * 0.05;
  save.dirt = clamp(save.dirt + dist * (surf === 'road' ? 0.000015 : 0.00015) * (wet ? 3 : 1), 0, 1);
  if (Math.abs(save.dirt - S.dirtDrawn) > 0.06) { S.dirtDrawn = save.dirt; rig.redrawDirt(save.dirt); }
  if (noFuel && !S.noFuelWarned) { S.noFuelWarned = true; toast('⛽ 沒油了！開到加油站，或按 🔄 回改裝廠加油', 4000); }
  if (!noFuel) S.noFuelWarned = false;
  // 加油站
  if (Math.hypot(S.x + Math.sin(S.heading) * 2 - GAS.x, S.z + Math.cos(S.heading) * 2 - GAS.z) < 10 && stopped && save.fuel < 0.999) {
    const add = Math.min(1 - save.fuel, dt * 0.08); save.fuel += add; S.fuelCoinAcc += add * 60;
    if (S.fuelCoinAcc >= 1 && save.coins > 0) { money(-1, '加油', '加油站'); S.fuelCoinAcc -= 1; }
    S.hint = `加油中… ${Math.round(save.fuel * 100)}%`;
  }
  restService(dt, stopped);
  if (S.v * 3.6 > S.speedLimit + 8 && !S.hint) S.hint = `⚠️ 超過速限 ${S.speedLimit}（會影響送貨評價）`;
  if (wet && Math.abs(S.v) > 16 && !S.hint) S.hint = '🌧 下雨路滑：煞車距離變長，跟前車保持距離';
  if (env.state.snow && Math.abs(S.v) > 12 && !S.hint) S.hint = '❄️ 雪地很滑：慢慢開、提早煞車';
  redLightCheck();
  // 方向燈自動回正
  if ((S.ind === 'L' || S.ind === 'R') && Math.abs(S.steer) > 0.25) S.indArmed = true;
  if (S.indArmed && Math.abs(S.steer) < 0.05) { S.ind = null; S.indArmed = false; refreshButtons(); }
  Snd.update({ rpm: S.rpm, throttle: accelPedal, speed: S.v, surface: surf, rain: wet, running: !noFuel && S.engineOn, inside: S.cam === 2, retard: S.retarder, storm: env.state.weather === 'storm' });
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
  if (inside && S.rlCross !== key) { S.rlCross = key; if (st === 'r' && Math.abs(S.v) > 3) { money(-200, '罰款', '闖紅燈'); persist(); toast('🚦 闖紅燈！罰款 200 金幣，要等綠燈喔', 2200); Snd.no(); if (S.mission) S.mission.redLights = (S.mission.redLights || 0) + 1; } }
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
    if (save.coins >= fee) { money(-fee, '過路費', etc ? 'ETC' : '現金車道'); persist(); updateCoins(); Snd.coin(); toast(etc ? `📡 ETC 嗶！過路費 −${fee} 金幣` : `🛣️ 現金過路費 −${fee} 金幣`, 1600); }
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
    if (S.fuelCoinAcc >= 1 && save.coins > 0) { money(-1, '加油', '加油站'); S.fuelCoinAcc -= 1; }
    S.hint = `加油中… ${Math.round(save.fuel * 100)}%`;
  } else {
    if (save.damage <= 0.001) { S.hint = '車子沒有壞 🔧'; return; }
    const fix = Math.min(save.damage, dt * 0.08);
    S.repairAcc = (S.repairAcc || 0) + fix * 250;
    if (S.repairAcc >= 1) { if (save.coins <= 0) { S.hint = '金幣不夠，沒辦法修理'; return; } money(-1, '維修', '休息站維修'); S.repairAcc -= 1; updateCoins(); }
    save.damage -= fix;
    S.hint = `修理中… 車損 ${Math.round(save.damage * 100)}%`;
    if (save.damage <= 0.001) { save.damage = 0; persist(); toast('🔧 修好了！'); }
  }
}

// ================= 鏡頭 =================
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
// v39：鏡頭防穿牆：從看的點往鏡頭走，碰到建築就停在建築前面；也不鑽到地面下
const _cv = new THREE.Vector3(); let camBoxes = null;
function camAntiClip(look, want) {
  if (!camBoxes) camBoxes = boxes.filter((b) => b.top === undefined && (b.maxx - b.minx) * (b.maxz - b.minz) > 30); // 只看建築（路燈、樹這種小東西不擋鏡頭）
  const N = 14; let lastOk = 0;
  for (let i = 1; i <= N; i++) {
    const t = i / N; _cv.lerpVectors(look, want, t);
    let hit = false;
    if (_cv.y < 30) for (const b of camBoxes) {
      if (_cv.x > b.minx - 0.6 && _cv.x < b.maxx + 0.6 && _cv.z > b.minz - 0.6 && _cv.z < b.maxz + 0.6) { hit = true; break; }
    }
    if (hit) break; lastOk = t;
  }
  if (lastOk < 1) want.lerpVectors(look, want, Math.max(0.12, lastOk));
  if (!S.tunNear) want.y = Math.max(want.y, surfaceY(want.x, want.z) + 1.2);
}
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
    if (S.camYawT <= 0 && !S.gDrag) S.camPitch *= Math.max(0, 1 - dt * 2); // 放開滑鼠後慢慢回正
    look.set(Math.sin(yaw) * 10, -0.45 + Math.tan(S.camPitch) * 10, Math.cos(yaw) * 10).applyQuaternion(q).add(want);
    if (S.shake > 0 && save.settings.shake !== false) want.add(tmpV.set((Math.random() - 0.5) * S.shake * 0.25, (Math.random() - 0.5) * S.shake * 0.25, 0));
    camPos.copy(want); camLook.copy(look);
    camera.position.copy(want); camera.lookAt(look); return;
  } else if ((S.cam === 4 || S.cam === 5 || S.cam === 6) && !S.tunNear) {
    // v39：車頭、側面、自由鏡頭
    const rx = -fz, rz = fx, mid = 0.5 * (S.coupled ? 1 : 0); // 右邊方向；有拖車時看整台車的中間
    const cx = S.x - Math.sin(S.trailerHeading) * 5 * mid, cz = S.z - Math.cos(S.trailerHeading) * 5 * mid;
    if (S.cam === 4) { want.set(S.x + fx * 13 * S.camDist + rx * 2.5, S.y + 3.2 * S.camH, S.z + fz * 13 * S.camDist + rz * 2.5); look.set(S.x + fx * 2, S.y + 2.2, S.z + fz * 2); }
    else if (S.cam === 5) { want.set(cx + rx * 14 * S.camDist, S.y + 3.0 * S.camH, cz + rz * 14 * S.camDist); look.set(cx, S.y + 2.0, cz); }
    else { const R = 20 * S.camDist; want.set(cx + Math.sin(S.freeYaw) * Math.cos(S.freePitch) * R, S.y + 2 + Math.sin(S.freePitch) * R, cz + Math.cos(S.freeYaw) * Math.cos(S.freePitch) * R); look.set(cx, S.y + 2.2, cz); }
  } else if (S.cam === 3 && !S.tunNear) {
    const d = S.cine ? Math.hypot(S.cine.x - S.x, S.cine.z - S.z) : 999;
    if (!S.cine || d > 70) { const side = Math.random() < 0.5 ? 1 : -1, cx = S.x + fx * 45 + fz * 9 * side, cz = S.z + fz * 45 - fx * 9 * side; S.cine = new THREE.Vector3(cx, surfaceY(cx, cz) + 2.2, cz); }
    want.copy(S.cine); look.set(S.x - Math.sin(S.trailerHeading) * 4, S.y + 2.5, S.z - Math.cos(S.trailerHeading) * 4);
    camPos.copy(want); camLook.lerp(look, Math.min(1, dt * 5)); camera.position.copy(camPos); camera.lookAt(camLook); return;
  } else {
    // 隧道附近鏡頭放低，才不會穿到山裡
    // 隧道附近：鏡頭比拖車頂高一點、比隧道頂低，往前看遠一點才不會被拖車擋住
    const cd = S.tunNear ? Math.min(1, S.camDist) : S.camDist; // v34：滾輪調遠近（隧道裡最多原本距離）
    const back = (S.tunNear ? 15 : S.cam === 1 ? 42 : 19) * cd, up = (S.tunNear ? 6.6 : S.cam === 1 ? 30 : 8.5) * Math.pow(cd, 0.8) * (S.tunNear ? 1 : S.camH); // v39：[ ] 調鏡頭高度
    if (S.camYawT > 0) { S.camYawT -= dt; if (S.camYawT <= 0) S.camYaw = 0; }
    const th = S.trailerHeading * 0.55 + S.heading * 0.45 + (S.camYawT > 0 ? S.camYaw : 0);
    want.set(S.x - Math.sin(th) * back + fx * 2, S.y + up, S.z - Math.cos(th) * back + fz * 2);
    if (!S.tunNear) want.y = Math.max(want.y, surfaceY(want.x, want.z) + 3); // 不要鑽進山坡
    if (S.tunNear) look.set(S.x + fx * 16, S.y + 2.2, S.z + fz * 16); else look.set(S.x + fx * 7, S.y + 2.8, S.z + fz * 7);
  }
  if (!inGarage() && S.mode !== 'title') camAntiClip(look, want); // v39：鏡頭不穿過建築、地面
  if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
  const k = inGarage() ? Math.min(1, dt * 6) : Math.min(1, dt * 3.2);
  camPos.lerp(want, k); camLook.lerp(look, k);
  camera.position.copy(camPos);
  if (S.shake > 0 && save.settings.shake !== false) camera.position.add(tmpV.set((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake, 0));
  camera.lookAt(camLook);
}

// ================= HUD =================
const clusterCv = $('#cluster'), mapCv = $('#minimap');
let lastMission = '', hudT = 0;
// v41：沿著導航路線找下一個轉彎（方向改變超過 30 度）
function navInfo(route) {
  if (!route || route.pts.length < 3) return { text: '' };
  const P = route.pts; let i0 = 1; while (i0 < P.length - 1 && Math.hypot(P[i0].x - S.x, P[i0].z - S.z) < 8) i0++;
  let dist = Math.hypot(P[i0].x - S.x, P[i0].z - S.z);
  for (let i = i0; i < P.length - 1; i++) {
    const a1 = Math.atan2(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z), a2 = Math.atan2(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z), d = wrapAngle(a2 - a1);
    const seg = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
    if (Math.abs(d) > 0.52 && seg > 3) { const m = dist < 1000 ? `${Math.round(dist / 10) * 10} 公尺` : `${(dist / 1000).toFixed(1)} 公里`; return { text: `${d > 0 ? '↰' : '↱'} ${m}後${d > 0 ? '左轉' : '右轉'}`, dist }; }
    dist += seg; if (dist > 2500) break;
  }
  return { text: '⬆ 直走' };
}
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
    // v41：GPS 下一個轉彎、預計抵達時間、走不走國道
    const nav = navInfo(S.route); S.navText = nav.text;
    const etaS = Math.round(S.route.len / Math.max(Math.abs(S.v), S.route.len > 1500 ? 16 : 10));
    const navRow = `<div class="m-row m-nav">${nav.text ? `<b>${nav.text}</b>　` : ''}預計 ${Math.floor(etaS / 60)}:${String(etaS % 60).padStart(2, '0')} 到${S.route.pts.some((p) => !inCity(p.x, p.z)) ? '　經 國道3號' : ''}${!inCity(S.x, S.z) ? `　（國道3號・速限 ${S.speedLimit}）` : ''}</div>`;
    const html = `<div class="m-title">${m.stage === 'pickup' ? '① 去接拖車' : '② 送貨中'}　${m.cargo} <small>${m.tons} 噸</small> <small class="m-contract">${m.contractType || '一般貨運'}</small></div>
      <div class="m-row">${m.stage === 'pickup' ? '到' : '送到'} <b>${d.emoji} ${d.name}</b>　<span class="m-dist">${km}</span>　<span class="m-pay">💰 ${m.reward}</span></div>
      <div class="m-row">${m.deadline ? (() => { const left = Math.round(m.deadline - (m.elapsed || 0)), a = Math.abs(left); return `<span class="m-time ${left < 0 ? 'late' : ''}">⏱ ${left < 0 ? '遲到 ' : '剩 '}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}</span>`; })() : ''}${m.stage === 'deliver' && m.cargoDmg > 0.005 ? `　<span class="m-dmg">📦 貨物損傷 ${Math.round(m.cargoDmg * 100)}%</span>` : ''}${m.fragile ? '　<span class="m-dmg">🥚 易碎，輕輕開</span>' : ''}</div>
      ${navRow}${S.hint ? `<div class="m-hint">${S.hint}</div>` : ''}`;
    if (html !== lastMission) { $('#missionText').innerHTML = html; lastMission = html; }
  }
  const tons = cargoTons();
  drawCluster(clusterCv, {
    rpm: S.rpm, kmh: Math.abs(S.v) * 3.6, speedLimit: S.speedLimit, brakeTemp: S.brakeTemp, rollover: S.rollover, gear: !S.engineOn ? 'OFF' : S.gear === 0 ? 'N' : S.gear < 0 ? 'R' : (Math.abs(S.v) < 0.05 && S.thr < 0.05 && save.settings.gearbox !== 'manual' ? 'N' : (save.settings.gearbox === 'manual' ? 'M' : 'A') + S.gear), handbrake: S.handbrake, air: S.air, highBeam: S.highBeam, cruise: S.cruise ? Math.round(S.cruise * 3.6) : 0, engineOff: !S.engineOn, odo: save.odo || 0, manual: save.settings.gearbox === 'manual',
    fuel: save.fuel, temp: S.temp, damage: save.damage, indL: S.ind === 'L' || S.ind === 'H', indR: S.ind === 'R' || S.ind === 'H', blink: S.blink,
    lights: S.lights, wipers: S.wipers, brake: input.down || S.handbrake, engineWarn: save.damage > 0.6 || save.fuel <= 0 || !S.engineOn, tons: Math.round(9 + (S.coupled ? (TRAILER_PHYS[curTrailer()] || TRAILER_PHYS.box).empty + tons : 0)), retarder: S.retarder,
  });
  drawMinimap(mapCv, { navText: S.mission ? S.navText : '', x: S.x, z: S.z, heading: S.heading, route: S.route, target: m ? missionTarget() : null, time: S.time, night: env.state.night > 0.5, cars: traffic.positions(), incidents: traffic.incidents(), selectedFleet: S.followFleetId ? traffic.fleetObject(S.followFleetId)?.position : null });
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
if (!LOWQ && save.settings.post !== false) {
  Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/GTAOPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'), import('three/addons/postprocessing/ShaderPass.js'),
    import('three/addons/shaders/VignetteShader.js'),
  ]).then(([{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }, { VignetteShader }]) => {
    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: HIGH ? 4 : 2 });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(Math.min(renderer.getPixelRatio(), HIGH ? 1.5 : 1.25));
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    let gtao = null;
    if (HIGH) { // 輕微的環境光遮蔽（角落、車底比較暗）
      gtao = new GTAOPass(scene, camera, w, h);
      gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.6, thickness: 2.0, scale: 1.0, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      gtao.blendIntensity = 0.6;
      composer.addPass(gtao);
    }
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.45, 1.6); // 車燈、路燈這種很亮的東西會發光（晚上會加強）
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const vignette = new ShaderPass(VignetteShader); // 暗角：畫面四周稍微暗一點，像電影鏡頭
    vignette.uniforms.offset.value = 1.0; vignette.uniforms.darkness.value = 1.15;
    composer.addPass(vignette);
    post = { composer, gtao, bloom, vignette, slow: 0, setSize(a, b) { composer.setSize(a, b); } };
  }).catch((e) => console.warn('後製效果載入失敗，用一般畫面：', e));
}
// 數位後照鏡（駕駛座視角才顯示）：畫面左右上方各一個小畫面
// 0、1＝主後照鏡；2、3＝下面的廣角鏡（看得比較寬、比較近，低畫質不畫）
const MIRROR_N = LOWQ ? 2 : 4;
const mirrorCams = [0, 1, 2, 3].slice(0, MIRROR_N).map((i) => new THREE.PerspectiveCamera(i < 2 ? 32 : 64, 1.3, 0.5, i < 2 ? (HIGH ? 600 : 250) : 160)); // 順暢模式看近一點，比較省
const mirrorFrames = mirrorCams.map(() => document.createElement('div'));
mirrorFrames.forEach((d, i) => { d.className = 'mirror-frame' + (i > 1 ? ' wide' : ''); d.innerHTML = `<span>${['左後', '右後', '左廣角', '右廣角'][i]}</span>`; document.body.appendChild(d); });
const mirrorRect = (i) => {
  const W = window.innerWidth, H = window.innerHeight, mw = Math.round(Math.min(W * 0.2, 300)), mh = Math.round(mw / 1.3);
  const top = Math.round(H * (W < 760 ? 0.2 : 0.16)), right = i % 2 === 1;
  if (i < 2) return { x: right ? W - mw - 10 : 10, y: top, w: mw, h: mh }; // 0＝左邊（駕駛座在左）、1＝右邊
  const ww = Math.round(mw * 0.62), wh = Math.round(ww / 1.3);
  return { x: right ? W - ww - 10 : 10, y: top + mh + 10, w: ww, h: wh };
};
const _mv = new THREE.Vector3(), _mf = new THREE.Vector3();
// 後照鏡先畫到小貼圖（隔幾格才重畫一次，比較省），每一格再把貼圖貼到畫面角落
const mirrorRTs = mirrorCams.map((c, i) => new THREE.WebGLRenderTarget(i < 2 ? 320 : 220, i < 2 ? 246 : 170, { samples: HIGH ? 4 : 0, type: THREE.HalfFloatType }));
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new THREE.Scene();
const quadMat = new THREE.MeshBasicMaterial(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat); // 貼到畫面時才做色調（跟主畫面一樣）
quadScene.add(quad);
let mirrorTick = 0;
const mirrorReady = [false, false, false, false];
function renderMirrors() {
  const show = S.mode === 'drive' && S.cam === 2 && !inGarage() && !S.followFleetId;
  document.body.classList.toggle('cab-view', show);
  document.body.classList.toggle('no-mirrors', save.settings.mirrors === false);
  if (!show || !rig.mirrorLocal || save.settings.mirrors === false) return;
  const H = window.innerHeight, every = HIGH ? 2 : 3;
  mirrorTick++;
  const auto = renderer.autoClear, shadowAuto = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false; // 後照鏡不用重算陰影
  const fx2 = -Math.sin(S.trailerHeading), fz2 = -Math.cos(S.trailerHeading); // 往後看（沿著拖車）
  mirrorCams.forEach((cam, i) => {
    const wide = i > 1, ev = wide ? every * 2 : every; // 廣角鏡更新得慢一點，比較省
    if ((mirrorTick + i) % ev !== 0 && mirrorReady[i]) return;
    rig.cabInner.localToWorld(_mv.copy(rig.mirrorLocal[i % 2]));
    if (wide) _mv.y -= 0.6;
    const side = i % 2 ? -1 : 1; // 車頭座標 +x＝左邊：0＝左後照鏡、1＝右後照鏡，鏡頭稍微往外看
    const out = wide ? 7 : 1.2, ox = Math.cos(S.heading) * side * out, oz = -Math.sin(S.heading) * side * out;
    cam.position.copy(_mv);
    cam.lookAt(_mf.set(_mv.x + fx2 * 30 + ox, _mv.y - (wide ? 4.5 : 1.2), _mv.z + fz2 * 30 + oz));
    cam.aspect = 1.3; cam.updateProjectionMatrix();
    renderer.setRenderTarget(mirrorRTs[i]); renderer.autoClear = true; renderer.render(scene, cam);
    mirrorReady[i] = true;
  });
  renderer.setRenderTarget(null);
  renderer.autoClear = false; renderer.setScissorTest(true);
  mirrorCams.forEach((cam, i) => {
    const r = mirrorRect(i), vy = H - r.y - r.h;
    renderer.setViewport(r.x, vy, r.w, r.h); renderer.setScissor(r.x, vy, r.w, r.h);
    quadMat.map = mirrorRTs[i].texture; renderer.render(quadScene, quadCam);
    mirrorFrames[i].style.cssText = `left:${r.x - 3}px;top:${r.y - 3}px;width:${r.w}px;height:${r.h}px`;
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.autoClear = auto; renderer.shadowMap.autoUpdate = shadowAuto;
}
// v30：駕駛座看出去的擋風玻璃雨滴（開雨刷會刷掉）
const wsCv = document.createElement('canvas'); wsCv.id = 'windshieldDrops'; document.body.appendChild(wsCv);
const wsCtx = wsCv.getContext('2d'); const drops = []; let wsWipe = 0;
function drawWindshield(dt) {
  const on = document.body.classList.contains('cab-view') && (rainyW(save.settings.weather) || save.settings.weather === 'snow') && !S.tunNear;
  wsCv.style.display = on ? 'block' : 'none';
  if (!on) { drops.length = 0; return; }
  const W = window.innerWidth, H = window.innerHeight;
  if (wsCv.width !== W || wsCv.height !== H) { wsCv.width = W; wsCv.height = H; }
  const snowy = save.settings.weather === 'snow';
  const rate = (snowy ? 14 : 40) * (1 + Math.abs(S.v) / 15);
  for (let k = Math.floor(rate * dt + Math.random()); k > 0; k--) if (drops.length < 260) drops.push({ x: Math.random() * W, y: Math.random() * H * 0.62, r: (snowy ? 2.5 : 1.5) + Math.random() * (snowy ? 4 : 3.5), a: 0 });
  // 雨刷掃過去：從左到右刷掉
  if (S.wipers) {
    wsWipe = (wsWipe + dt * 1.6) % 2;
    const sweep = wsWipe < 1 ? wsWipe : 2 - wsWipe, xw = sweep * W;
    for (let i = drops.length - 1; i >= 0; i--) if (Math.abs(drops[i].x - xw) < W * 0.08) drops.splice(i, 1);
  }
  // 開快一點，雨滴會往上往旁邊流
  for (const d of drops) { d.a = Math.min(1, d.a + dt * 4); if (!snowy && Math.abs(S.v) > 8) { d.y -= Math.abs(S.v) * dt * 2; d.x += (d.x - W / 2) * dt * 0.08; } }
  for (let i = drops.length - 1; i >= 0; i--) if (drops[i].y < -10) drops.splice(i, 1);
  wsCtx.clearRect(0, 0, W, H);
  for (const d of drops) {
    wsCtx.globalAlpha = d.a * (snowy ? 0.85 : 0.55);
    wsCtx.fillStyle = snowy ? 'rgba(245,248,255,.9)' : 'rgba(190,205,220,.35)';
    wsCtx.beginPath(); wsCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2); wsCtx.fill();
    if (!snowy) { wsCtx.fillStyle = 'rgba(255,255,255,.7)'; wsCtx.beginPath(); wsCtx.arc(d.x - d.r * 0.35, d.y - d.r * 0.35, d.r * 0.3, 0, Math.PI * 2); wsCtx.fill(); }
  }
  wsCtx.globalAlpha = 1;
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
  const raw = clock.getDelta();
  if (raw < 0.2) perfTick(raw); // 切到別的分頁回來那一格不算
  frame(Math.min(raw, 0.05));
  requestAnimationFrame(loop);
}
function frame(dt) {
  S.time += dt;
  if (S.hornT > 0) S.hornT -= dt;
  if (S.pendingPark && (!S.parked || Math.hypot(S.x - S.parked.x, S.z - S.parked.z) > 70)) { S.parked = S.pendingPark; S.pendingPark = null; }
  S.paused = S.mode === 'drive' && (!$('#menuPanel').classList.contains('hidden') || !$('#mapPanel').classList.contains('hidden'));
  if (S.paused) { releaseAll(); if (!$('#mapPanel').classList.contains('hidden')) renderMap(); }
  if (S.mode === 'drive' && !S.paused) {
    // v40：物理用固定步長（每秒 120 次），畫面快慢不影響開車手感
    const STEP = 1 / 120; S.physAcc = Math.min(S.physAcc + dt, STEP * 8);
    while (S.physAcc >= STEP) { drive(STEP); S.physAcc -= STEP; }
    checkMission(dt); updateEngine(dt);
  }
  else Snd.update({ rpm: 600, throttle: 0, speed: 0, surface: 'road', rain: false, running: S.mode !== 'title' || Snd.ctx, inside: false });
  S.shake = Math.max(0, S.shake - dt * 2.5);
  placeRig();
  // 輪子、方向盤、雨刷
  for (const w of rig.spins) w.rotation.x = S.wheelAngle;
  for (const w of rig.trailerSpins) w.rotation.x = S.wheelAngle;
  for (const f of rig.front) f.rotation.y = S.steer;
  rig.steeringWheel.rotation.z = -S.steer * 7;
  if (S.wipers) S.wiperT += dt * (env.state.weather === 'storm' ? 3.6 : 2.6); // 大雨刷快一點
  if (S.wipers && S.mode === 'drive') { const ph = Math.floor(S.wiperT / Math.PI); if (ph !== S.wiperPh) { S.wiperPh = ph; Snd.wiper(S.cam === 2); } } // v37：雨刷刷過去的聲音
  if (env.state.thunder) { env.state.thunder = false; if (S.mode !== 'title') Snd.thunder(env.state.thunderDist || 0.5); }
  const wa = S.wipers ? (1 - Math.cos(S.wiperT)) * 0.85 : Math.max(0, rig.wipers[0].rotation.z * -1 - dt * 3) ;
  rig.wipers.forEach((w) => (w.rotation.z = -wa));
  // 方向燈閃爍
  if (S.ind) { S.blinkT += dt; const b = (S.blinkT % 0.8) < 0.4; if (b !== S.blink) { S.blink = b; Snd.tick(b); } } else S.blink = false;
  const braking = S.mode === 'drive' && ((input.down && S.gear > 0) || (input.up && S.gear < 0) || Math.abs(S.v) < 0.05);
  setTruckLights({ head: S.lights, brake: braking, indL: S.blink && (S.ind === 'L' || S.ind === 'H'), indR: S.blink && (S.ind === 'R' || S.ind === 'H'), reverse: S.gear < 0 });
  const lightsOn = S.lights && !inGarage();
  rig.spots.forEach((s) => { s.intensity = lightsOn ? (S.highBeam ? 1500 : 900) : 0; s.distance = S.highBeam ? 160 : 90; s.angle = S.highBeam ? 0.42 : 0.5; });
  if (rig.dome) rig.dome.intensity = S.dome && !inGarage() ? 2.4 : 0;
  if (S.mode === 'drive' && Math.abs(S.v) > 20) S.shake = Math.max(S.shake, (Math.abs(S.v) - 20) * 0.004); // v39：高速時鏡頭輕微震動
  // v32：大燈光錐＋照在路面上的光斑（越暗越明顯；下雨霧天光錐更清楚）
  const beamK = lightsOn && S.mode === 'drive' ? clamp(env.state.night * 1.1 + (env.state.weather === 'fog' || rainyW(env.state.weather) ? 0.25 : 0), 0, 1) : 0;
  for (const b of rig.beams) { b.visible = beamK > 0.02; b.material.opacity = b.userData.base * beamK * (S.highBeam ? 1.25 : 1); b.scale.set(1, S.highBeam ? 1.5 : 1, 1); }
  if (rig.chameleon) { const c = new THREE.Color().setHSL((S.time * 0.08) % 1, 0.85, 0.5); rig.paint.color.copy(c); rig.paintPlain.color.copy(c); if (rig.rimMat) rig.rimMat.color.copy(c); }
  if (rig.rainbowGlow) { const c = new THREE.Color().setHSL((S.time * 0.5) % 1, 1, 0.55); rig.glowMat.color.copy(c); rig.glowLight.color.copy(c); }
  // 紅綠燈、車流、路燈光
  updateTrafficLights(S.time);
  updateWorldAnim(S.time, dt);
  updateDayCycle(dt);
  updateMeta(dt);
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
  env.setCabClip(document.body.classList.contains('cab-view'));
  drawWindshield(dt);
  const fov = baseFov(); if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (post) {
    // 太慢（平均一格超過 30 毫秒）：先關掉角落陰影
    if (S.time > 8) post.slow = post.slow * 0.99 + (dt > 0.03 ? 1 : 0) * 0.01; // 開始玩 8 秒後才算，載入時的卡頓不算
    if (post.slow > 0.75 && post.gtao && post.gtao.enabled) { post.gtao.enabled = false; console.info('畫面太慢，關掉環境光遮蔽'); }
    post.bloom.strength = 0.3 + env.state.night * 0.55; // 晚上車燈路燈的光暈比較明顯
    post.composer.render(dt);
  } else renderer.render(scene, camera);
  renderMirrors();
}

// ================= v31：成就、新手教學、設定／存檔選單、效能自動調整 =================
const ACH = [
  { id: 'first', ic: '🚚', n: '第一趟', d: '完成第一趟送貨', rw: 100, ok: () => save.deliveries >= 1 },
  { id: 'ten', ic: '📦', n: '小小運輸員', d: '送貨 10 趟', rw: 300, ok: () => save.deliveries >= 10 },
  { id: 'fifty', ic: '🏅', n: '運輸達人', d: '送貨 50 趟', rw: 1200, ok: () => save.deliveries >= 50 },
  { id: 'star5', ic: '⭐', n: '五星司機', d: '拿到一次五顆星評價', rw: 200, ok: () => save.flags?.star5 },
  { id: 'lumber', ic: '🌲', n: '上山送貨', d: '把貨送到山上林場（要過收費站和隧道）', rw: 300, ok: () => save.flags?.lumber },
  { id: 'quay', ic: '⚓', n: '港口卡車', d: '把貨送到貨櫃碼頭', rw: 200, ok: () => save.flags?.quay },
  { id: 'heavy', ic: '🏋️', n: '大力士', d: '載 24 噸以上送達', rw: 250, ok: () => save.flags?.heavy },
  { id: 'night', ic: '🌙', n: '夜班司機', d: '晚上送達一趟', rw: 200, ok: () => save.flags?.night },
  { id: 'snow', ic: '❄️', n: '雪地老手', d: '下雪天送達一趟', rw: 300, ok: () => save.flags?.snow },
  { id: 'cab', ic: '🚘', n: '真正的司機', d: '用駕駛座視角開 1 公里', rw: 200, ok: () => (save.flags?.cabDist || 0) >= 1000 },
  { id: 'mod', ic: '🔧', n: '改裝入門', d: '買第一個改裝零件', rw: 100, ok: () => save.owned.length >= 1 },
  { id: 'mod10', ic: '🎨', n: '改裝狂', d: '買 10 個改裝零件', rw: 500, ok: () => save.owned.length >= 10 },
  { id: 'fleet', ic: '🚛', n: '開公司', d: '買第一台營運卡車', rw: 300, ok: () => save.company.trucks >= 2 },
  { id: 'hire3', ic: '👷', n: '挖角高手', d: '雇用一位三星司機', rw: 300, ok: () => save.company.fleetUnits.some((u) => u.skill >= 3) },
  { id: 'wh', ic: '🏬', n: '物流中心', d: '蓋好倉庫', rw: 300, ok: () => (save.company.warehouse || 0) >= 1 },
  { id: 'rich', ic: '💰', n: '小富翁', d: '金幣累積到 10000', rw: 500, ok: () => save.coins >= 10000 },
];
let metaT = 0, fpsEma = 1 / 60, fpsShowT = 0, prBase = renderer.getPixelRatio(), pr = prBase, prT = 0;
function updateMeta(dt) {
  // 駕駛座里程
  if (S.mode === 'drive' && S.cam === 2) { save.flags = save.flags || {}; save.flags.cabDist = (save.flags.cabDist || 0) + Math.abs(S.v) * dt; }
  updateTutorial(dt);
  metaT += dt; if (metaT < 1.5 || S.mode !== 'drive') return; metaT = 0; // 開車時才跳成就
  if (save.loan > 0) { save.loanT = (save.loanT || 0) + 1.5; if (save.loanT >= 300) { save.loanT = 0; const it = Math.ceil(save.loan * 0.02); money(-it, '利息', '貸款利息'); persist(); toast(`🏦 貸款利息 −${it}`, 1400); } }
  save.ach = save.ach || [];
  for (const a of ACH) if (!save.ach.includes(a.id) && a.ok()) {
    save.ach.push(a.id); money(a.rw, '獎勵', '成就 ' + a.n); persist(); updateCoins(); Snd.buy();
    toast(`🏆 達成成就「${a.n}」！獎勵 +${a.rw} 金幣`, 3200); break; // 一次跳一個，比較看得清楚
  }
}
// 效能：真實的每格時間（不是遊戲的 dt），太慢就降低解析度、夠快再調回來
function perfTick(realDt) {
  fpsEma = fpsEma * 0.95 + realDt * 0.05;
  if (save.settings.fps) { fpsShowT -= realDt; if (fpsShowT <= 0) { fpsShowT = 0.5; $('#fpsBox').textContent = `${Math.round(1 / fpsEma)} FPS｜解析度 ${Math.round(pr / prBase * 100)}%`; } }
  $('#fpsBox').classList.toggle('hidden', !save.settings.fps);
  if (S.mode === 'title') return;
  prT += realDt; if (prT < 2) return;
  if (fpsEma > 1 / 28 && pr > Math.max(0.6, prBase * 0.55)) { pr = Math.max(0.6, pr - 0.1); prT = 0; applyPR(); }
  else if (fpsEma < 1 / 50 && pr < prBase && prT > 6) { pr = Math.min(prBase, pr + 0.1); prT = 0; applyPR(); }
}
function applyPR() { renderer.setPixelRatio(pr); if (post) post.composer.setPixelRatio(Math.min(pr, HIGH ? 1.5 : 1.25)); resize(); }
// ---- 新手教學 ----
const TUT = [
  { t: '按住 ↑（平板按右下「油門」）往前開', ok: () => S.v > 3 },
  { t: '按 ← →（平板按「方向盤」）轉個彎', ok: () => (S.tutTurn || 0) > 1.2 },
  { t: '按 ↓（平板按「煞車」）把車停下來', ok: () => S.tutMoved && Math.abs(S.v) < 0.3 },
  { t: '跟著橘色導航線開到裝貨區，車頭對齊拖車、慢慢倒車到拖車前面，按 F（平板按 🔗）接上拖車', ok: () => S.mission && S.mission.stage === 'deliver', sub: '上面會告訴你還差幾公尺' },
  { t: '裝好了！現在把貨送到目的地，停進黃色框就會卸貨', ok: () => save.deliveries > (S.tutStartDel ?? 0), sub: '轉彎和下坡要慢慢開，貨物才不會壞' },
];
function startTutorial() { S.tut = 0; S.tutTurn = 0; S.tutMoved = false; S.tutStartDel = save.deliveries; save.flags = save.flags || {}; save.flags.tutSeen = true; persist(); showTut(); }
function showTut() {
  const box = $('#tutBox');
  if (S.tut == null) { box.classList.add('hidden'); return; }
  const st = TUT[S.tut];
  box.innerHTML = `🎓 第 ${S.tut + 1}／${TUT.length} 步：${st.t}${st.sub ? `<small>${st.sub}</small>` : ''}<br><button id="tutSkip">跳過教學</button>`;
  box.classList.remove('hidden');
}
function updateTutorial(dt) {
  if (S.tut == null || S.mode !== 'drive') return;
  if (Math.abs(S.steer) > 0.2 && Math.abs(S.v) > 2) S.tutTurn += dt;
  if (Math.abs(S.v) > 4) S.tutMoved = true;
  if (TUT[S.tut].ok()) {
    S.tut++; Snd.coin();
    if (S.tut >= TUT.length) { S.tut = null; money(200, '獎勵', '教學完成'); persist(); updateCoins(); popup('🎓 教學完成！+200'); toast('🎉 你已經會開大卡車了！之後按上方「📋 接單」挑你想送的貨', 4000); }
    showTut();
  }
}
$('#tutBox').addEventListener('click', (e) => { if (e.target.closest('#tutSkip')) { S.tut = null; showTut(); Snd.click(); } });
// ---- 選單：成就、設定、存檔 ----
let menuTab = 'ach';
function renderTitleStats() {
  const j = save.jobs || { done: 0, stars: 0 };
  $('#tStats').textContent = save.deliveries ? `💰 ${save.coins.toLocaleString()}｜送貨 ${save.deliveries} 趟${j.done ? `｜平均 ⭐ ${(j.stars / j.done).toFixed(1)}` : ''}｜成就 ${(save.ach || []).length}／${ACH.length}` : '';
}
function openMenu(tab) { menuTab = tab; renderMenu(); $('#menuPanel').classList.remove('hidden'); Snd.click(); }
function closeMenu() { $('#menuPanel').classList.add('hidden'); renderTitleStats(); }
function renderMenu() {
  const tabs = [...(S.mode === 'drive' ? [['pause', '⏸ 暫停']] : []), ['career', '🎖 生涯'], ['money', '💰 財務'], ['drive', '🕹 駕駛'], ['settings', '⚙️ 設定'], ['save', '💾 存檔'], ['ach', '🏆 成就'], ['help', '🎓 說明']];
  if (menuTab === 'pause' && S.mode !== 'drive') menuTab = 'ach';
  let h = `<div class="mp-head"><span>選單</span><button id="mpClose">關閉</button></div><div class="mp-tabs">${tabs.map(([k, n]) => `<button data-mtab="${k}" class="${menuTab === k ? 'sel' : ''}">${n}</button>`).join('')}</div>`;
  const opt = (k, v, label) => `<button class="opt ${save.settings[k] === v ? 'sel' : ''}" data-set="${k}" data-val="${v}">${label}</button>`;
  if (menuTab === 'pause') {
    h += `<div class="studio-note">遊戲暫停中（按 Esc 繼續）</div>
      <button class="big-act gold" data-act="resume">▶ 繼續開車</button>
      <button class="big-act" data-act="jobs">📋 工作任務（接單）</button>
      <button class="big-act" data-act="map">🗺 世界地圖</button>
      <button class="big-act" data-act="money">💰 財務（貸款、收支帳本）</button>
      <button class="big-act" data-act="garage">🔧 改裝廠（要先停車）</button>
      <button class="big-act" data-act="title">🏠 回主選單</button>`;
  } else if (menuTab === 'career') {
    const L = levelOf(save.xp || 0), j = save.jobs || { done: 0, stars: 0 }, earned = (save.ledger || []).filter((e) => e.cat === '送貨').reduce((a, e) => a + e.v, 0);
    const title = L.lv >= 15 ? '傳奇運輸王' : L.lv >= 10 ? '資深老司機' : L.lv >= 6 ? '專業司機' : L.lv >= 3 ? '正式司機' : '見習司機';
    h += `<div class="career-head"><div class="career-lv">${L.lv}<small>等級</small></div><div><b style="font-size:20px">${escapeHtml(save.truck.name || '我的卡車')}｜${title}</b><div class="studio-note" style="margin:2px 0">${escapeHtml(save.company.name)}　經驗值 ${L.cur} / ${L.need}</div><div class="xpbar"><i style="width:${Math.round(L.cur / L.need * 100)}%"></i></div></div></div>
      <div class="cstats"><div><small>送貨趟數</small><b>${save.deliveries}</b></div><div><small>平均評價</small><b>${j.done ? '⭐ ' + (j.stars / j.done).toFixed(1) : '—'}</b></div><div><small>總里程</small><b>${((save.odo || 0) / 1000).toFixed(1)} 公里</b></div>
      <div><small>現金</small><b>💰 ${save.coins.toLocaleString()}</b></div><div><small>貸款</small><b>${(save.loan || 0).toLocaleString()}</b></div><div><small>公司卡車</small><b>${save.company.trucks} 台</b></div>
      <div><small>最近送貨收入</small><b>${earned.toLocaleString()}</b></div><div><small>成就</small><b>${(save.ach || []).length} / ${ACH.length}</b></div><div><small>收藏卡車</small><b>${save.fleet.length} 台</b></div></div>
      <div class="unlock"><b>等級解鎖：</b>${Object.entries(CAT_LEVEL).map(([c, l]) => `${L.lv >= l ? '✅' : '🔒'} 等級 ${l}「${c}」`).join('　')}<br>送貨經驗值：基本 60 ＋ 運費 ÷ 8 ＋ 每顆星 25（危險品、重型機械再加 60）</div>`;
  } else if (menuTab === 'drive') {
    h += `<div class="set-row"><span>變速箱（R 切換）</span><div class="opts">${opt('gearbox', 'auto', '自排')}${opt('gearbox', 'manual', '手排')}</div></div>
      <div class="set-row"><span>方向盤靈敏度</span><div class="opts">${opt('steer', 'low', '慢（穩）')}${opt('steer', 'normal', '標準')}${opt('steer', 'high', '快（靈活）')}</div></div>
      <div class="set-row"><span>鏡頭震動（高速、碰撞）</span><div class="opts">${opt('shake', true, '開')}${opt('shake', false, '關')}</div></div>
      <div class="set-row"><span>天暗自動開大燈</span><div class="opts">${opt('autoLights', true, '開')}${opt('autoLights', false, '關')}</div></div>
      <div class="set-row"><span>駕駛座後照鏡</span><div class="opts">${opt('mirrors', true, '開')}${opt('mirrors', false, '關')}</div></div>
      <div class="studio-note">鍵盤：W/S 油門煞車、A/D 轉向、C 換鏡頭、空白鍵手煞車、R 自排手排、Shift/Ctrl 升降檔、I 發動／熄火、V 定速巡航、L 大燈（再按遠燈）、X 雙黃燈。完整按鍵在「🎓 說明」。</div>`;
  } else if (menuTab === 'money') {
    const L = save.ledger || [], inc = L.filter((e) => e.v > 0).reduce((a, e) => a + e.v, 0), exp = L.filter((e) => e.v < 0).reduce((a, e) => a + e.v, 0);
    const byCat = {}; for (const e of L) byCat[e.cat] = (byCat[e.cat] || 0) + e.v;
    const tm = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    h += `<div class="fin-top"><div><small>現金</small><b>💰 ${save.coins.toLocaleString()}</b></div><div><small>貸款</small><b class="neg">${(save.loan || 0).toLocaleString()}</b></div><div><small>最近收入</small><b class="pos">+${inc.toLocaleString()}</b></div><div><small>最近支出</small><b class="neg">${exp.toLocaleString()}</b></div></div>
      <div class="studio-note">銀行貸款：每開車 5 分鐘收 2% 利息，最多借 50,000。錢夠了記得還。</div>
      <div class="opts fin-btns"><button class="opt" data-act="loan5k">借 5,000</button><button class="opt" data-act="loan20k">借 20,000</button><button class="opt" data-act="repay1k">還 1,000</button><button class="opt" data-act="repayAll">全部還清</button></div>
      <div class="studio-note">各類合計：${Object.entries(byCat).map(([k, v]) => `${k} <b class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v.toLocaleString()}</b>`).join('　') || '還沒有紀錄'}</div>
      <div class="ledger">${L.slice(0, 60).map((e) => `<div><span>${tm(e.t)}</span><span>${escapeHtml(e.cat)}</span><span>${escapeHtml(e.note)}</span><b class="${e.v >= 0 ? 'pos' : 'neg'}">${e.v >= 0 ? '+' : ''}${e.v.toLocaleString()}</b></div>`).join('') || '<div>還沒有收支紀錄，去送貨賺錢吧！</div>'}</div>`;
  } else if (menuTab === 'ach') {
    const got = save.ach || [];
    h += `<div class="studio-note">完成成就會拿到金幣獎勵（${got.length}／${ACH.length}）</div>` + ACH.map((a) => `<div class="ach ${got.includes(a.id) ? '' : 'locked'}"><span class="ic">${a.ic}</span><div><b>${a.n}${got.includes(a.id) ? ' ✅' : ''}</b><small>${a.d}</small></div><span class="rw">💰 ${a.rw}</span></div>`).join('');
  } else if (menuTab === 'settings') {
    h += `<div class="set-row"><span>音量</span><input type="range" min="0" max="100" value="${Math.round((save.settings.volume ?? 1) * 100)}" data-vol></div>
      <div class="set-row"><span>畫質（換了會重新載入）</span><div class="opts">${opt('quality', 'high', '高（電腦）')}${opt('quality', 'mid', '中（平板）')}${opt('quality', 'low', '低（手機）')}</div></div>
      <div class="set-row"><span>卡車模型</span><div class="opts">${opt('glb', true, '寫實模型')}${opt('glb', false, '簡單模型')}</div></div>
      <div class="set-row"><span>光影後製（高、中畫質才有）</span><div class="opts">${opt('post', true, '開')}${opt('post', false, '關（比較順）')}</div></div>
      <div class="set-row"><span>配樂（sounds 資料夾有放音樂才會播）</span><div class="opts">${opt('music', true, '開')}${opt('music', false, '關')}</div></div>
      <div class="set-row"><span>變速箱（R 切換）</span><div class="opts">${opt('gearbox', 'auto', '自排')}${opt('gearbox', 'manual', '手排')}</div></div>
      <div class="set-row"><span>車流</span><div class="opts">${opt('traffic', 'few', '少')}${opt('traffic', 'normal', '中')}${opt('traffic', 'many', '多')}</div></div>
      <div class="set-row"><span>駕駛座後照鏡</span><div class="opts">${opt('mirrors', true, '開')}${opt('mirrors', false, '關')}</div></div>
      <div class="set-row"><span>顯示 FPS（畫面順不順）</span><div class="opts">${opt('fps', true, '開')}${opt('fps', false, '關')}</div></div>
      <div class="studio-note">畫面太卡時，遊戲會自動把解析度調低一點，順了再調回來。</div>`;
  } else if (menuTab === 'save') {
    h += `<div class="studio-note">遊戲會自動存檔在這台裝置上。要換電腦或平板玩，先「匯出存檔」，到新的裝置再「匯入存檔」。</div>
      <button class="big-act gold" data-act="export">📤 匯出存檔（下載檔案）</button>
      <label class="big-act" style="text-align:center">📥 匯入存檔<input type="file" accept=".json,application/json" data-act="import" style="display:none"></label>
      <button class="big-act red" data-act="reset">🗑 重新開始新遊戲（全部歸零）</button>`;
  } else {
    h += `<div class="howto"><div><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 油門／煞車（停住後按住＝倒車）／方向盤</div>
      <div><kbd>I</kbd> 發動／熄火　<kbd>V</kbd> 定速巡航　<kbd>空白鍵</kbd> 手煞車　<kbd>R</kbd> 自排／手排　<kbd>Shift</kbd><kbd>Ctrl</kbd> 手排升降檔（1 檔再降＝空檔 N → 倒檔 R）</div>
      <div><kbd>Q</kbd><kbd>E</kbd> 方向燈　<kbd>X</kbd> 警示燈　<kbd>L</kbd> 大燈（再按＝遠燈）　<kbd>K</kbd> 雨刷　<kbd>H</kbd> 喇叭　<kbd>J</kbd> 排氣煞車</div>
      <div><kbd>C</kbd> 換鏡頭（車尾／駕駛座／車頭／側面／自由／高空／路邊）　<kbd>滑鼠拖曳</kbd> 轉頭看　<kbd>滾輪</kbd> 遠近　<kbd>[</kbd><kbd>]</kbd> 高低　<kbd>O</kbd> 車內燈</div>
      <div><kbd>M</kbd> 世界地圖　<kbd>Esc</kbd> 遊戲選單</div>
      <div><kbd>T</kbd> 換時間　<kbd>Y</kbd> 換天氣　<kbd>G</kbd> 改裝廠　<kbd>N</kbd> 聲音　<kbd>Backspace</kbd> 回廠</div>
      <div class="tip">平板手機用畫面上的按鈕。按「📋 接單」到貨運市場挑貨物 → 開到裝貨區倒車接拖車（F）→ 跟著橘色導航線送到卸貨區停好就會自動卸貨。</div></div>
      <button class="big-act gold" data-act="tutorial">🎓 重新開始新手教學</button>`;
  }
  $('#menuBody').innerHTML = h;
}
$('#menuBody').addEventListener('click', (e) => {
  if (e.target.closest('#mpClose')) { closeMenu(); return; }
  const tb = e.target.closest('[data-mtab]'); if (tb) { menuTab = tb.dataset.mtab; renderMenu(); Snd.click(); return; }
  const so = e.target.closest('[data-set]');
  if (so) {
    const k = so.dataset.set, raw = so.dataset.val, v = raw === 'true' ? true : raw === 'false' ? false : raw;
    if (save.settings[k] === v) return;
    save.settings[k] = v; persist(); Snd.click();
    if (k === 'music') Snd.setMusic(v);
    if (k === 'gearbox') refreshButtons();
    if (k === 'quality' || k === 'traffic' || k === 'post' || k === 'glb') { location.reload(); return; }
    renderMenu(); return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'export') {
    const blob = new Blob([JSON.stringify(save)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `卡車改裝王存檔-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('📤 存檔已下載', 1800);
  } else if (act === 'reset') {
    if (confirm('真的要全部重新開始嗎？金幣、改裝、公司都會歸零，沒辦法復原。') && confirm('再確認一次：全部歸零？')) { localStorage.removeItem(SAVE_KEY); location.reload(); }
  } else if (act === 'loan5k' || act === 'loan20k') {
    const want = act === 'loan5k' ? 5000 : 20000, can = Math.min(want, 50000 - (save.loan || 0));
    if (can <= 0) { toast('最多只能借 50,000', 1600); return; }
    save.loan = (save.loan || 0) + can; money(can, '貸款', '銀行借款'); persist(); Snd.coin(); toast(`🏦 借了 ${can.toLocaleString()} 金幣`, 1600); renderMenu();
  } else if (act === 'repay1k' || act === 'repayAll') {
    const want = act === 'repay1k' ? 1000 : (save.loan || 0), pay = Math.min(want, save.loan || 0, save.coins);
    if (pay <= 0) { toast(save.loan ? '金幣不夠' : '沒有貸款', 1400); return; }
    save.loan -= pay; money(-pay, '貸款', '還款'); persist(); Snd.buy(); toast(save.loan ? `還了 ${pay.toLocaleString()}，還欠 ${save.loan.toLocaleString()}` : '🎉 貸款全部還清了！', 1800); renderMenu();
  } else if (act === 'money') { menuTab = 'money'; renderMenu();
  } else if (act === 'resume') { closeMenu();
  } else if (act === 'jobs') { closeMenu(); openJobs();
  } else if (act === 'map') { closeMenu(); toggleMap(true);
  } else if (act === 'garage') { closeMenu(); openGarage();
  } else if (act === 'title') { closeMenu(); persist(); location.reload();
  } else if (act === 'tutorial') {
    closeMenu(); if (S.mode === 'title') startDriving(true); else startTutorial();
  }
});
$('#menuBody').addEventListener('input', (e) => { if (e.target.matches('[data-vol]')) { save.settings.volume = Number(e.target.value) / 100; Snd.setVolume(save.settings.volume); persist(); } });
$('#menuBody').addEventListener('change', (e) => {
  const f = e.target.matches('[data-act="import"]') && e.target.files && e.target.files[0]; if (!f) return;
  f.text().then((txt) => {
    let data = null; try { data = JSON.parse(txt); } catch (_) { /* 不是存檔 */ }
    if (!data || typeof data !== 'object' || !Number.isFinite(data.coins)) { toast('這個檔案不是卡車改裝王的存檔', 2200); return; }
    if (!confirm('匯入後會取代現在的進度，確定嗎？')) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(data)); location.reload(); // 重新載入時 loadSave 會檢查每個欄位
  });
});
document.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.menu; if (k === 'tutorial') startDriving(true); else openMenu(k); }));
if ($('#bMenu')) $('#bMenu').onclick = () => openMenu('ach');

// ================= 開始 =================
window.__truck = { S, get save() { return save; }, hit: () => hitTest(S.x, S.z, S.heading, S.trailerHeading), boxes, input,
  step(n = 60) { for (let i = 0; i < n; i++) frame(1 / 60); }, get post() { return post; }, get rig() { return rig; }, setDay(t) { dayT = t; dayKey = ''; dayMixT = 0; }, applyEnv, openGarage, closeGarage, traffic, dispatchUnit };
newMission();
setTruckGLB(save.settings.glb !== false);
rebuildRig(save.truck);
// v32：Blender 做的 GLB 車頭背景載入，載好換上（載不到就維持程式畫的）
if (save.settings.glb !== false) loadTruckGLB().then((ok) => { if (ok) rebuildRig(inGarage() ? draft : save.truck); });
applyEnv();
resize();
updateCoins();
$('#ver').textContent = '卡車改裝王 X ' + VERSION;
$('#startBtn').disabled = false; $('#loadMsg').textContent = '';
function startDriving(tutorial = false) {
  Snd.init(); Snd.setVolume(save.settings.volume ?? 1); Snd.setMusic(save.settings.music !== false);
  S.mode = 'drive'; camInit = false;
  $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#touch').classList.remove('hidden');
  closeMenu();
  if (tutorial || (!save.deliveries && !(save.flags && save.flags.tutSeen))) startTutorial();
  else toast('沿著橘色導航線去載貨！', 2500);
}
$('#startBtn').onclick = () => startDriving();
// v33：主選單 9 項
const hasProgress = save.deliveries > 0 || save.owned.length > 0 || (save.odo || 0) > 200;
if (!hasProgress) $('#startBtn').innerHTML = '<b>▶ 發動引擎</b><small>第一次玩從這裡開始（有新手教學）</small>';
function openJobs() { if (S.mission && S.mission.stage === 'deliver') { toast('貨還在車上，先送到再接新的單', 1800); return; } showJobBoard(); }
function goGarageTab(tab) { startDriving(); S.gTab = tab; openGarage(); }
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
  const g = b.dataset.go; Snd.init(); Snd.click();
  if (g === 'new') {
    if (hasProgress && !(confirm('開始新遊戲會把金幣、改裝、車隊全部歸零，沒辦法復原。確定嗎？') && confirm('再確認一次：全部重新開始？'))) return;
    if (hasProgress) { localStorage.removeItem(SAVE_KEY); sessionStorage.setItem('truckAutoStart', '1'); location.reload(); return; }
    startDriving(true); return;
  }
  if (g === 'jobs') { startDriving(); openJobs(); }
  else if (g === 'garage') goGarageTab('fleet');
  else if (g === 'mods') goGarageTab('parts');
  else if (g === 'fleet') goGarageTab('company');
  else if (g === 'map') toggleMap(true);
  else if (g === 'settings' || g === 'save' || g === 'career' || g === 'drive') openMenu(g);
}));
if (sessionStorage.getItem('truckAutoStart')) { sessionStorage.removeItem('truckAutoStart'); setTimeout(() => startDriving(true), 300); }

// ================= v33：世界地圖 =================
const wmCv = $('#worldMap'), WMV = { cx: 0, cz: 0, scale: 0.6, follow: true, drag: null };
function toggleMap(on) {
  const p = $('#mapPanel'), show = on ?? p.classList.contains('hidden');
  p.classList.toggle('hidden', !show);
  if (show) {
    const dpr = Math.min(2, window.devicePixelRatio || 1); wmCv.width = Math.round(innerWidth * dpr); wmCv.height = Math.round(innerHeight * dpr);
    const b = mapBounds(); WMV.min = Math.min(wmCv.width / (b.x1 - b.x0), wmCv.height / (b.z1 - b.z0)) * 0.9; WMV.max = 6 * dpr;
    WMV.scale = clamp(WMV.scale, WMV.min, WMV.max); if (WMV.scale < 0.4 * dpr) WMV.scale = 0.9 * dpr;
    WMV.follow = true; renderMap(); Snd.click();
  }
}
function renderMap() {
  if (WMV.follow) { WMV.cx = S.x; WMV.cz = S.z; }
  const t = S.mission ? missionTarget() : null;
  drawWorldMap(wmCv, { x: S.x, z: S.z, heading: S.heading, route: S.route, target: t, dpr: Math.min(2, window.devicePixelRatio || 1) }, WMV);
  const m = S.mission;
  $('#wmInfo').textContent = m ? `${m.stage === 'pickup' ? '去載貨' : '送貨中'}：${m.cargo}　→ ${t.name}${S.route ? `（${S.route.len >= 1000 ? (S.route.len / 1000).toFixed(1) + ' 公里' : Math.round(S.route.len) + ' 公尺'}）` : ''}` : '';
}
wmCv.addEventListener('pointerdown', (e) => { WMV.drag = { x: e.clientX, y: e.clientY, cx: WMV.cx, cz: WMV.cz }; WMV.follow = false; wmCv.setPointerCapture(e.pointerId); });
wmCv.addEventListener('pointermove', (e) => {
  if (!WMV.drag) return; const dpr = wmCv.width / innerWidth;
  WMV.cx = WMV.drag.cx + (e.clientX - WMV.drag.x) * dpr / WMV.scale; WMV.cz = WMV.drag.cz + (e.clientY - WMV.drag.y) * dpr / WMV.scale; renderMap();
});
wmCv.addEventListener('pointerup', () => { WMV.drag = null; });
wmCv.addEventListener('wheel', (e) => { e.preventDefault(); WMV.scale = clamp(WMV.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), WMV.min || 0.1, WMV.max || 8); renderMap(); }, { passive: false });
$('#wmIn').onclick = () => { WMV.scale = clamp(WMV.scale * 1.4, WMV.min, WMV.max); renderMap(); };
$('#wmOut').onclick = () => { WMV.scale = clamp(WMV.scale / 1.4, WMV.min, WMV.max); renderMap(); };
$('#wmFollow').onclick = () => { WMV.follow = true; renderMap(); };
$('#wmClose').onclick = () => toggleMap(false);
renderTitleStats();
requestAnimationFrame(loop);
