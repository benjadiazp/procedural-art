uniform vec3 uColorSlow;
uniform vec3 uColorFast;
uniform float uOpacity;

varying float vSpeed;
varying float vLife;
varying float vActive;

void main() {
  if (vActive < 0.5) discard;

  // Soft circle
  vec2 center = gl_PointCoord - 0.5;
  float d = length(center);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.15, d);

  // Color by speed
  vec3 color = mix(uColorSlow, uColorFast, vSpeed);

  // Fade near end of life
  float lifeFade = smoothstep(0.0, 1.5, vLife);

  gl_FragColor = vec4(color, alpha * uOpacity * lifeFade);
}
