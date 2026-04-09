uniform sampler2D tDye;
uniform float uBrightness;
uniform vec3 uBackground;
varying vec2 vUv;

void main() {
  vec3 dye = texture2D(tDye, vUv).rgb;
  vec3 color = dye * uBrightness;
  float intensity = max(color.r, max(color.g, color.b));
  color = mix(uBackground, color, smoothstep(0.0, 0.05, intensity));
  gl_FragColor = vec4(color, 1.0);
}
