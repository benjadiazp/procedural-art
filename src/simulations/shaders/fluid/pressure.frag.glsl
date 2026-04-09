uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float div = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((R + L + T + B - div) * 0.25, 0.0, 0.0, 1.0);
}
