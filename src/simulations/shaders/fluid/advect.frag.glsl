uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;
varying vec2 vUv;

void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * vel * uTexelSize;
  gl_FragColor = vec4(uDissipation * texture2D(uSource, coord).xyz, 1.0);
}
