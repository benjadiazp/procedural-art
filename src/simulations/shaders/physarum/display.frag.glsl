uniform sampler2D tTrail;
uniform float uExposure;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform float uBrightness;

varying vec2 vUv;

void main() {
  float trail = texture2D(tTrail, fract(vUv)).r;

  // Exponential tone-mapping for HDR trail values
  float t = 1.0 - exp(-trail * uExposure);

  // Multi-stop gradient
  vec3 color;
  float s1 = 0.1, s2 = 0.4;
  if (t < s1) {
    color = mix(uColor1, uColor2, t / s1);
  } else if (t < s2) {
    color = mix(uColor2, uColor3, (t - s1) / (s2 - s1));
  } else {
    color = mix(uColor3, uColor4, clamp((t - s2) / (1.0 - s2), 0.0, 1.0));
  }

  color *= uBrightness;
  gl_FragColor = vec4(color, 1.0);
}
