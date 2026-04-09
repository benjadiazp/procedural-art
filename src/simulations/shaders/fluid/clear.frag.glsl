uniform sampler2D uTexture;
uniform float uDissipation;
varying vec2 vUv;

void main() {
  gl_FragColor = uDissipation * texture2D(uTexture, vUv);
}
