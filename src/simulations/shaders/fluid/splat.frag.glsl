uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uSplatColor;
uniform float uRadius;
varying vec2 vUv;

void main() {
  vec2 d = vUv - uPoint;
  vec3 base = texture2D(uTarget, vUv).xyz;
  vec3 splat = uSplatColor * exp(-dot(d, d) / uRadius);
  gl_FragColor = vec4(base + splat, 1.0);
}
