uniform float uDelta;
uniform float uActiveCount;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float index = gl_FragCoord.y * resolution.x + gl_FragCoord.x;
  vec3 pos = texture2D(texturePosition, uv).xyz;

  if (index >= uActiveCount) {
    gl_FragColor = vec4(pos, 1.0);
    return;
  }

  vec3 vel = texture2D(textureVelocity, uv).xyz;
  gl_FragColor = vec4(pos + vel * uDelta, 1.0);
}
