// 橫向電影模式的「電影濾鏡」：把 2D 畫面當貼圖丟給 WebGL，用自訂著色器（Fragment Shader）做
// 色差（Chromatic Aberration）、電影感冷暖調色（Teal & Orange）、暗角、底片顆粒、鏡頭上的雨滴折射。
// 不支援 WebGL 的裝置會自動回到一般 2D 畫面。

const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision mediump float;
uniform sampler2D tex; uniform vec2 res; uniform float time, ca, rain, grade, vign, warm;
varying vec2 uv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// 鏡頭上的雨滴：每一格放一顆會慢慢往下滑的水珠，水珠裡面的畫面會折射（往外推）
vec2 drops(vec2 st, float t, float scale){
  vec2 g = st * scale; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float h = hash(id); if (h < 0.55) return vec2(0.0);
  float slide = fract(t * (0.05 + h * 0.08) + h);
  vec2 c = vec2((hash(id + 3.1) - 0.5) * 0.6, 0.45 - slide * 0.9);
  vec2 d = f - c; d.x *= 1.4; float r = 0.08 + hash(id + 7.7) * 0.12; float L = length(d);
  if (L > r) return vec2(0.0);
  float k = 1.0 - L / r; return -normalize(d + 1e-4) * k * k * 0.035;
}
void main(){
  vec2 st = uv; vec2 asp = vec2(res.x / res.y, 1.0);
  if (rain > 0.0) st += (drops(uv * asp, time, 7.0) + drops(uv * asp + 0.37, time * 1.3, 12.0) * 0.7) * rain;
  vec2 d = st - 0.5; float r2 = dot(d, d);
  float c = ca * (0.35 + r2 * 2.5);
  vec3 col = vec3(texture2D(tex, st + d * c).r, texture2D(tex, st).g, texture2D(tex, st - d * c).b);
  // 電影感調色：暗部偏青藍、亮部偏橘，降一點飽和、拉一點對比
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 tint = mix(vec3(0.05, 0.42, 0.52), vec3(1.0, 0.6, 0.28) * (0.9 + warm * 0.2), smoothstep(0.12, 0.82, l));
  vec3 g2 = col + grade * (tint - vec3(0.45)) * 0.16;
  g2 = mix(vec3(l), g2, 1.0 - 0.1 * grade);
  g2 = (g2 - 0.5) * (1.0 + 0.14 * grade) + 0.5;
  g2 *= 1.0 - vign * smoothstep(0.32, 0.92, length(d * asp) * 1.15);
  g2 += (hash(uv * res + fract(time) * 917.0) - 0.5) * 0.045;
  gl_FragColor = vec4(clamp(g2, 0.0, 1.0), 1.0);
}`;

export function createPost(srcCanvas) {
  const gc = document.createElement('canvas');
  gc.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;';
  const gl = gc.getContext('webgl', { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('電影濾鏡著色器編譯失敗，用一般畫面：', e); return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const U = {}; for (const n of ['res', 'time', 'ca', 'rain', 'grade', 'vign', 'warm']) U[n] = gl.getUniformLocation(prog, n);
  return {
    canvas: gc,
    render(p) {
      if (gc.width !== srcCanvas.width || gc.height !== srcCanvas.height) { gc.width = srcCanvas.width; gc.height = srcCanvas.height; }
      gl.viewport(0, 0, gc.width, gc.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      gl.uniform2f(U.res, gc.width, gc.height); gl.uniform1f(U.time, p.time); gl.uniform1f(U.ca, p.ca);
      gl.uniform1f(U.rain, p.rain); gl.uniform1f(U.grade, p.grade); gl.uniform1f(U.vign, p.vign); gl.uniform1f(U.warm, p.warm);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
