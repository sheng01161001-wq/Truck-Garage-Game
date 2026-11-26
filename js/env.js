// 天空、時間（白天／黃昏／晚上／自動日夜循環）、天氣（晴／雨／霧／雪）、雨滴、雪花
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { rng } from './util.js';

const TIMES = {
  day: { elev: 50, azim: 140, lightElev: 50, sunColor: 0xfff3e2, sunI: 3.0, hemiSky: 0xbcd6ff, hemiGround: 0x4f5a3c, hemiI: 1.0, turb: 3, ray: 1.1, mie: 0.004, mieG: 0.8, exposure: 0.62, fog: 0xbfd0df, envI: 1.0, night: 0 },
  dusk: { elev: 2.5, azim: 250, lightElev: 12, sunColor: 0xffa060, sunI: 3.4, hemiSky: 0xa58fb8, hemiGround: 0x4a3a30, hemiI: 0.8, turb: 9, ray: 3, mie: 0.012, mieG: 0.95, exposure: 0.75, fog: 0xd0a080, envI: 0.85, night: 0.45 },
  night: { elev: -14, azim: 200, lightElev: 42, sunColor: 0x9fb4ff, sunI: 0.32, hemiSky: 0x2a3658, hemiGround: 0x0c0e12, hemiI: 0.45, turb: 1.5, ray: 0.4, mie: 0.003, mieG: 0.7, exposure: 0.75, fog: 0x0c1322, envI: 0.25, night: 1 },
};

export function createEnv(renderer, scene) {
  const sky = new Sky(); sky.scale.setScalar(2000); sky.renderOrder = -2; scene.add(sky);
  const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(2000); envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  // 實拍天空（Poly Haven，CC0）：背景載入，載到前先用程式天空；載不到就一直用程式天空
  let hdrEnv = null;
  import('three/addons/loaders/RGBELoader.js')
    .then(({ RGBELoader }) => new RGBELoader().loadAsync('textures/sky_partly_cloudy_1k.hdr'))
    .then((hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      hdrEnv = pmrem.fromEquirectangular(hdr).texture; hdr.dispose();
      if (state.time) apply(state.time, state.weather);
    })
    .catch((e) => console.warn('實拍天空載入失敗，用程式天空：', e));

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(), lightDir = new THREE.Vector3();

  // 星星
  const r = rng(99), sp = [];
  for (let i = 0; i < 1600; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95);
    sp.push(Math.sin(ph) * Math.cos(th) * 2500, Math.cos(ph) * 2500, Math.sin(ph) * Math.sin(th) * 2500);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false }));
  stars.frustumCulled = false; stars.renderOrder = -1; scene.add(stars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf2f0e6, fog: false, depthWrite: false }));
  moon.renderOrder = -1;
  scene.add(moon);

  // 雨
  const RAIN = 2600;
  const rp = new Float32Array(RAIN * 6), rv = new Float32Array(RAIN);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.45 }));
  // 駕駛座視角：鏡頭附近（駕駛室裡面）的雨滴不要畫
  const nearClip = { value: 0 };
  const clipNear = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNearClip = nearClip;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying float vCamDist;\nvoid main() {').replace('#include <project_vertex>', '#include <project_vertex>\n  vCamDist = -mvPosition.z;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uNearClip;\nvarying float vCamDist;\nvoid main() {\n  if (vCamDist < uNearClip) discard;');
    };
  };
  clipNear(rain.material);
  // 雪花
  const SNOW = 2200, snp = new Float32Array(SNOW * 3), snv = new Float32Array(SNOW);
  const sng = new THREE.BufferGeometry(); sng.setAttribute('position', new THREE.BufferAttribute(snp, 3));
  const snowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 1, 16, 16, 15); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); return t; })();
  const snow = new THREE.Points(sng, new THREE.PointsMaterial({ map: snowTex, size: 0.32, transparent: true, depthWrite: false, opacity: 0.85, color: 0xffffff, blending: THREE.AdditiveBlending })); // 疊加發亮：雪花是白的不是灰的
  clipNear(snow.material);
  snow.frustumCulled = false; snow.visible = false; scene.add(snow);
  const resetFlake = (i, cx, cy, cz, anyY) => { snp[i * 3] = cx + (r() - 0.5) * 70; snp[i * 3 + 1] = anyY ? cy - 10 + r() * 40 : cy + 22 + r() * 6; snp[i * 3 + 2] = cz + (r() - 0.5) * 70; snv[i] = 1.2 + r() * 1.3; };
  rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  const resetDrop = (i, cx, cy, cz, anyY) => {
    const x = cx + (r() - 0.5) * 70, z = cz + (r() - 0.5) * 70, y = anyY ? cy - 10 + r() * 40 : cy + 25 + r() * 8;
    rp[i * 6] = x; rp[i * 6 + 1] = y; rp[i * 6 + 2] = z; rp[i * 6 + 3] = x + 0.08; rp[i * 6 + 4] = y - 0.9; rp[i * 6 + 5] = z + 0.05;
    rv[i] = 22 + r() * 8;
  };

  const state = { time: 'day', weather: 'clear', night: 0, wet: false, snow: false, indoor: false };
  const fogBase = new THREE.Fog(0xbfd0df, 300, 2600);
  scene.fog = fogBase;

  // 兩個時段之間慢慢過渡（自動日夜循環用）：k＝0 是 a、1 是 b
  function mixTimes(a, b, k) {
    const A = TIMES[a], B = TIMES[b], P = {};
    for (const key of Object.keys(A)) {
      if (['sunColor', 'hemiSky', 'hemiGround', 'fog'].includes(key)) P[key] = new THREE.Color(A[key]).lerp(new THREE.Color(B[key]), k).getHex();
      else if (key === 'azim') { let d = B.azim - A.azim; if (d > 180) d -= 360; if (d < -180) d += 360; P.azim = A.azim + d * k; }
      else P[key] = A[key] + (B[key] - A[key]) * k;
    }
    return P;
  }
  function apply(time, weather, mix = null, regen = true) {
    state.time = time; state.weather = weather;
    const P = mix || TIMES[time];
    const rainy = weather === 'rain', foggy = weather === 'fog', snowy = weather === 'snow';
    const u = sky.material.uniforms;
    for (const s of [sky, envSky]) {
      const uu = s.material.uniforms;
      uu.turbidity.value = P.turb + (rainy ? 10 : foggy ? 6 : snowy ? 8 : 0);
      uu.rayleigh.value = rainy || snowy ? P.ray * 0.4 : P.ray;
      uu.mieCoefficient.value = P.mie * (rainy || foggy || snowy ? 3 : 1);
      uu.mieDirectionalG.value = P.mieG;
    }
    const phi = THREE.MathUtils.degToRad(90 - P.elev), th = THREE.MathUtils.degToRad(P.azim);
    sunDir.setFromSphericalCoords(1, phi, th);
    u.sunPosition.value.copy(sunDir); envSky.material.uniforms.sunPosition.value.copy(sunDir);
    lightDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - P.lightElev), th + (time === 'night' ? 1.2 : 0));
    sun.color.set(P.sunColor);
    sun.intensity = P.sunI * (rainy ? 0.25 : foggy ? 0.45 : snowy ? 0.4 : 1);
    hemi.color.set(P.hemiSky); hemi.groundColor.set(P.hemiGround);
    hemi.intensity = P.hemiI * (rainy ? 0.85 : snowy ? 1.25 : 1);
    renderer.toneMappingExposure = P.exposure * (rainy ? 0.85 : 1);
    const fc = new THREE.Color(P.fog);
    if (rainy) fc.lerp(new THREE.Color(time === 'night' ? 0x0a0d12 : 0x7d8792), 0.6);
    if (foggy) fc.lerp(new THREE.Color(time === 'night' ? 0x1a1e24 : 0xc4c8cc), 0.75);
    if (snowy) fc.lerp(new THREE.Color(time === 'night' ? 0x1c2230 : 0xdfe5ec), 0.7);
    fogBase.color.copy(fc);
    fogBase.near = foggy ? 4 : rainy ? 25 : snowy ? 20 : 300;
    fogBase.far = foggy ? 120 : rainy ? 420 : snowy ? 520 : 2600;
    const nightish = P.night > 0.7;
    sky.visible = !nightish;
    scene.background = nightish ? fc.clone() : null;
    stars.visible = nightish && !rainy && !foggy && !snowy;
    moon.visible = nightish && !rainy && !foggy && !snowy;
    moon.position.copy(lightDir).multiplyScalar(2400);
    rain.visible = rainy; snow.visible = snowy;
    state.night = Math.min(1, P.night * (rainy || snowy ? 1.2 : 1));
    state.wet = rainy; state.snow = snowy;
    // 反射用環境光：白天晴天用實拍天空（烤漆、電鍍才有真的雲和光），其他時候用程式算的天空
    if (regen) {
      if (envRT) envRT.dispose();
      envRT = null;
      if (time === 'day' && !mix && !rainy && !foggy && !snowy && hdrEnv) scene.environment = hdrEnv;
      else {
        envSky.visible = true;
        envRT = pmrem.fromScene(envScene, 0, 0.1, 3000);
        scene.environment = envRT.texture;
      }
    }
    scene.environmentIntensity = P.envI * (rainy ? 0.7 : 1);
    state.hemiBase = hemi.intensity; state.envBase = scene.environmentIntensity;
    if (regen) { for (let i = 0; i < RAIN; i++) resetDrop(i, 0, 0, 0, true); for (let i = 0; i < SNOW; i++) resetFlake(i, 0, 0, 0, true); }
    return state;
  }

  // covered＝鏡頭在隧道裡：天空光變暗、不下雨
  function update(dt, focus, cam, covered = false) {
    sun.position.copy(focus).addScaledVector(lightDir, 200);
    sun.target.position.copy(focus);
    const c0 = state.cov || 0;
    state.cov = c0 + ((covered ? 1 : 0) - c0) * Math.min(1, dt * 3);
    if (state.hemiBase !== undefined) {
      hemi.intensity = state.hemiBase * (1 - 0.75 * state.cov);
      scene.environmentIntensity = state.envBase * (1 - 0.75 * state.cov);
    }
    if (!state.indoor) { rain.visible = state.weather === 'rain' && state.cov < 0.5; snow.visible = state.weather === 'snow' && state.cov < 0.5; }
    if (snow.visible) {
      const tt = performance.now() / 1000;
      for (let i = 0; i < SNOW; i++) {
        snp[i * 3 + 1] -= snv[i] * dt; snp[i * 3] += Math.sin(tt * 0.8 + i) * 0.6 * dt; snp[i * 3 + 2] += Math.cos(tt * 0.6 + i * 1.3) * 0.5 * dt;
        if (snp[i * 3 + 1] < cam.y - 12 || Math.abs(snp[i * 3] - cam.x) > 40 || Math.abs(snp[i * 3 + 2] - cam.z) > 40) resetFlake(i, cam.x, cam.y, cam.z, false);
      }
      sng.attributes.position.needsUpdate = true;
    }
    if (rain.visible) {
      for (let i = 0; i < RAIN; i++) {
        const dy = rv[i] * dt;
        rp[i * 6 + 1] -= dy; rp[i * 6 + 4] -= dy;
        if (rp[i * 6 + 4] < cam.y - 12 || Math.abs(rp[i * 6] - cam.x) > 40 || Math.abs(rp[i * 6 + 2] - cam.z) > 40) resetDrop(i, cam.x, cam.y, cam.z, false);
      }
      rg.attributes.position.needsUpdate = true;
    }
  }

  function setIndoor(on) {
    state.indoor = on;
    scene.fog = on ? null : fogBase;
    rain.visible = !on && state.weather === 'rain'; snow.visible = !on && state.weather === 'snow';
  }
  // 駕駛座：駕駛室裡面不要有雨雪
  function setCabClip(on) { nearClip.value = on ? 3.6 : 0; }

  return { apply, update, setIndoor, setCabClip, mixTimes, state, sun, hemi };
}
