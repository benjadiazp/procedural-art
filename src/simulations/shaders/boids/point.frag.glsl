uniform vec3 uColorSlow;
uniform vec3 uColorFast;
uniform float uBrightness;

varying float vSpeed;
varying float vActive;

void main() {
  if (vActive < 0.5) discard;
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;

  float alpha = 1.0 - smoothstep(0.1, 0.5, d);
  vec3 col = mix(uColorSlow, uColorFast, vSpeed) * uBrightness;
  col += exp(-d * 8.0) * uBrightness * 0.3;  // subtle hot center for bloom

  gl_FragColor = vec4(col, alpha);
}
