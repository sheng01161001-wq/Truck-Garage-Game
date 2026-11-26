// 精靈圖（Sprite Sheet）序列幀：可以換成自己做的 PNG（Midjourney、Leonardo.ai、Kenney、itch.io 去背素材都行）
// 放法：assets/side/sheets/<名字>.png（一格一格排好的序列幀）＋ <名字>.json（說明每格多大、有哪些動作）
// 例：walker.json  { "frameW": 64, "frameH": 128, "fps": 10, "anims": { "walk": { "from": 0, "to": 7 }, "idle": { "from": 8, "to": 11 }, "umbrella": { "from": 12, "to": 19 } } }
// 播放：相鄰兩格之間「淡入淡出」（看起來比較順），換動作時舊動作會慢慢淡掉（動作混合）。
// 沒有放圖就用程式畫的人物（有光影、會走路擺手）。

export class SpriteSheet {
  constructor(name) {
    this.name = name; this.ready = false; this.img = null; this.meta = null;
    const img = new Image();
    img.onload = () => {
      this.img = img;
      fetch(`assets/side/sheets/${name}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((m) => {
        const fh = m?.frameH || img.height, fw = m?.frameW || fh;
        const cols = Math.max(1, Math.floor(img.width / fw)), count = cols * Math.max(1, Math.floor(img.height / fh));
        this.meta = { frameW: fw, frameH: fh, cols, fps: m?.fps || 10, anims: m?.anims || { walk: { from: 0, to: count - 1 }, idle: { from: 0, to: 0 } } };
        this.ready = true;
      });
    };
    img.src = `assets/side/sheets/${name}.png`;
  }
  frameRect(i) { const m = this.meta, c = i % m.cols, r = Math.floor(i / m.cols); return [c * m.frameW, r * m.frameH, m.frameW, m.frameH]; }
}

export class Animator {
  constructor(sheet, anim = 'walk') { this.sheet = sheet; this.anim = anim; this.t = Math.random() * 10; this.prev = null; this.prevT = 0; this.blend = 1; }
  play(anim, fade = 0.3) {
    if (anim === this.anim) return;
    this.prev = this.anim; this.prevT = this.t; this.anim = anim; this.t = 0; this.blend = 0; this.fade = fade;
  }
  update(dt, speed = 1) { this.t += dt * speed; this.prevT += dt * speed; if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / (this.fade || 0.3)); }
  // 回傳 { frames: [[index, alpha], ...] } 給畫的人用；沒有精靈圖時回傳 null
  frames() {
    const sh = this.sheet; if (!sh || !sh.ready) return null;
    const m = sh.meta, out = [];
    const add = (anim, t, w) => {
      const a = m.anims[anim] || m.anims.walk || Object.values(m.anims)[0]; if (!a) return;
      const n = a.to - a.from + 1, f = t * (a.fps || m.fps), i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, k = f - Math.floor(f);
      out.push([a.from + i0, w * (1 - k)], [a.from + i1, w * k]); // 相鄰兩格淡入淡出
    };
    add(this.anim, this.t, this.blend);
    if (this.prev && this.blend < 1) add(this.prev, this.prevT, 1 - this.blend);
    return out;
  }
  draw(g, x, y, w, h, flip = false) {
    const fr = this.frames(); if (!fr) return false;
    const img = this.sheet.img;
    g.save(); if (flip) { g.translate(x + w, y); g.scale(-1, 1); x = 0; y = 0; }
    const a0 = g.globalAlpha;
    for (const [i, a] of fr) { if (a < 0.01) continue; const [sx, sy, sw, shh] = this.sheet.frameRect(i); g.globalAlpha = a0 * a; g.drawImage(img, sx, sy, sw, shh, x, y, w, h); }
    g.globalAlpha = a0; g.restore();
    return true;
  }
}

// 沒有精靈圖時的人物（有身體受光面、走路擺手擺腳、下雨撐傘）
export function drawPerson(g, x, y, h, phase, look, opts = {}) {
  const s = h / 100, walk = opts.walking ? Math.sin(phase) : 0, walk2 = opts.walking ? Math.sin(phase + Math.PI) : 0;
  g.save(); g.translate(x, y); g.scale(opts.flip ? -s : s, s);
  // 腳
  for (const [sw, c] of [[walk2, look.pants2], [walk, look.pants]]) { g.save(); g.translate(0, -48); g.rotate(sw * 0.45); g.fillStyle = c; g.fillRect(-4, 0, 8, 46); g.fillStyle = '#1b1b1d'; g.fillRect(-4, 42, 12, 6); g.restore(); }
  // 身體（受光面亮、背光面暗）
  const bg = g.createLinearGradient(-12, 0, 12, 0); bg.addColorStop(0, look.shirtHi); bg.addColorStop(1, look.shirt);
  g.fillStyle = bg; g.beginPath(); g.moveTo(-11, -84); g.quadraticCurveTo(0, -90, 11, -84); g.lineTo(9, -46); g.lineTo(-9, -46); g.closePath(); g.fill();
  if (look.bag) { g.fillStyle = look.bag; g.fillRect(-15, -74, 7, 22); }
  // 手（擺動）
  for (const [sw, dx] of [[walk, -9], [walk2, 9]]) { g.save(); g.translate(dx, -82); g.rotate(sw * -0.5 + (opts.umbrella && dx > 0 ? -2.3 : 0)); g.fillStyle = look.shirt; g.fillRect(-3, 0, 6, 26); g.fillStyle = look.skin; g.fillRect(-3, 24, 6, 6); g.restore(); }
  // 頭、頭髮
  const hg = g.createRadialGradient(-2, -98, 1, 0, -96, 10); hg.addColorStop(0, look.skinHi); hg.addColorStop(1, look.skin);
  g.fillStyle = hg; g.beginPath(); g.arc(0, -96, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = look.hair; g.beginPath(); g.arc(0, -99, 9.5, Math.PI * 1.05, Math.PI * 2.0); g.fill();
  if (look.longHair) g.fillRect(-9, -99, 5, 14);
  // 雨傘
  if (opts.umbrella) {
    g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, -104); g.lineTo(12, -150); g.stroke();
    const ug = g.createLinearGradient(-20, -170, 40, -140); ug.addColorStop(0, shadeC(look.umb, 0.25)); ug.addColorStop(1, look.umb);
    g.fillStyle = ug; g.beginPath(); g.moveTo(-22, -146); g.quadraticCurveTo(12, -182, 46, -146); g.closePath(); g.fill();
  }
  g.restore();
}
function shadeC(hex, f) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; return `rgb(${r | 0},${g | 0},${b | 0})`; }
const SHIRTS = [['#c0392b', '#e57366'], ['#2c3e50', '#5d7a96'], ['#16a085', '#4fd1b5'], ['#8e44ad', '#b67fd0'], ['#d35400', '#f08a4b'], ['#7f8c8d', '#b2bec3'], ['#f1c40f', '#f9e27c'], ['#ecf0f1', '#ffffff']];
export function randomLook(R) {
  const [shirt, shirtHi] = SHIRTS[Math.floor(R() * SHIRTS.length)];
  const skins = [['#c68642', '#e0a86c'], ['#f1c27d', '#ffe0b2'], ['#8d5524', '#b07440'], ['#e0ac69', '#f6cf9a']], [skin, skinHi] = skins[Math.floor(R() * skins.length)];
  return { shirt, shirtHi, skin, skinHi, pants: ['#2d3436', '#1e3a5f', '#4b4b4b', '#5c4033'][Math.floor(R() * 4)], pants2: '#202326', hair: ['#1b1b1b', '#3b2a1e', '#5a3d22', '#8b6b4a'][Math.floor(R() * 4)], longHair: R() < 0.4, bag: R() < 0.3 ? '#6d4c41' : null, umb: ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#2c3e50'][Math.floor(R() * 5)] };
}
