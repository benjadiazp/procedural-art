uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uStrength;
uniform float uDt;
varying vec2 vUv;

void main() {
  float cR = abs(texture2D(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x);
  float cL = abs(texture2D(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x);
  float cT = abs(texture2D(uCurl, vUv + vec2(0.0, uTexelSize.y)).x);
  float cB = abs(texture2D(uCurl, vUv - vec2(0.0, uTexelSize.y)).x);
  float c = texture2D(uCurl, vUv).x;

  vec2 N = vec2(cR - cL, cT - cB);
  N /= length(N) + 1e-5;
  vec2 force = uStrength * c * vec2(N.y, -N.x);

  vec2 vel = texture2D(uVelocity, vUv).xy + force * uDt;
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
