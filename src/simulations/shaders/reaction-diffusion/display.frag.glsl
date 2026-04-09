uniform sampler2D tChemicals;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform float uBrightness;

varying vec2 vUv;

void main() {
  vec4 chem = texture2D(tChemicals, vUv);
  float v = chem.g;
  float u = chem.r;

  // Multi-stop gradient driven by V concentration
  vec3 color;
  float t1 = 0.08, t2 = 0.25;
  if (v < t1) {
    color = mix(uColor1, uColor2, v / t1);
  } else if (v < t2) {
    color = mix(uColor2, uColor3, (v - t1) / (t2 - t1));
  } else {
    color = mix(uColor3, uColor4, clamp((v - t2) / (1.0 - t2), 0.0, 1.0));
  }

  // Subtle depth shading from U chemical
  color *= 0.82 + 0.18 * u;
  color *= uBrightness;

  gl_FragColor = vec4(color, 1.0);
}
