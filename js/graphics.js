// GraphicsManager：畫面品質集中管理（渲染器、色調映射、色彩管理、陰影、抗鋸齒、後製：SSAO／Bloom／景深／暗角、畫質分級）
// 畫質：ultra（極致）／high（高）／mid（中）／low（低）。HDRI 環境光在 js/env.js（每個時段自己的 HDRI）。
import * as THREE from 'three';

export const QUALITY = {
  ultra: { pr: 2, shadow: 4096, ssao: true, ssaoSamples: 16, ssaoBlend: 0.75, bloom: true, dof: true, msaa: 4, postPR: 2, label: 'ULTRA' },
  high: { pr: 2, shadow: 2048, ssao: true, ssaoSamples: 12, ssaoBlend: 0.6, bloom: true, dof: false, msaa: 4, postPR: 1.5, label: 'HIGH' },
  mid: { pr: 1.5, shadow: 1024, ssao: false, bloom: true, dof: false, msaa: 2, postPR: 1.25, label: 'MEDIUM' },
  low: { pr: 1, shadow: 0, ssao: false, bloom: false, dof: false, msaa: 0, postPR: 1, label: 'LOW' },
};

export function createRenderer(canvas, quality) {
  const Q = QUALITY[quality] || QUALITY.high;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pr)); // 最高 2 倍
  renderer.shadowMap.enabled = Q.shadow > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 柔和陰影
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // 色調映射（曝光由 env.js 依時段調整 toneMappingExposure）
  renderer.outputColorSpace = THREE.SRGBColorSpace;   // 色彩管理
  return { renderer, Q };
}

// 太陽陰影解析度
export function setupShadows(sun, Q) {
  if (!Q.shadow) { sun.castShadow = false; return; }
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  if (Q.shadow >= 4096) sun.shadow.radius = 2;
}

// 後製：RenderPass → SSAO(GTAO) → Bloom → 景深 → OutputPass → 暗角
export async function createPost(renderer, scene, camera, Q) {
  if (!Q.bloom) return null;
  const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }, { VignetteShader }] = await Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/GTAOPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'), import('three/addons/postprocessing/ShaderPass.js'),
    import('three/addons/shaders/VignetteShader.js'),
  ]);
  const w = window.innerWidth, h = window.innerHeight;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(Math.min(renderer.getPixelRatio(), Q.postPR));
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (Q.ssao) { // 環境光遮蔽（角落、車底、輪拱比較暗）
    gtao = new GTAOPass(scene, camera, w, h);
    gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.6, thickness: 2.0, scale: 1.0, samples: Q.ssaoSamples });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = Q.ssaoBlend;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.45, 1.6); // 車燈、路燈這種很亮的東西會發光
  composer.addPass(bloom);
  let bokeh = null;
  if (Q.dof) { // 景深：對焦在卡車，遠景稍微柔一點（駕駛座不開）
    const { BokehPass } = await import('three/addons/postprocessing/BokehPass.js');
    bokeh = new BokehPass(scene, camera, { focus: 20, aperture: 0.00012, maxblur: 0.006 }); composer.addPass(bokeh);
  }
  composer.addPass(new OutputPass());
  const vignette = new ShaderPass(VignetteShader); // 暗角：畫面四周稍微暗一點，像電影鏡頭
  vignette.uniforms.offset.value = 1.0; vignette.uniforms.darkness.value = 1.15;
  composer.addPass(vignette);
  return { composer, gtao, bloom, vignette, bokeh, slow: 0, setSize(a, b) { composer.setSize(a, b); } };
}

// 每一格更新後製參數（晚上光暈強一點、景深對焦距離）
export function updatePost(post, { night, focusDist, cabView }) {
  post.bloom.strength = 0.3 + night * 0.55;
  if (post.bokeh) { const u = post.bokeh.uniforms; u.focus.value = focusDist || 20; u.maxblur.value = cabView ? 0 : 0.006; }
}
