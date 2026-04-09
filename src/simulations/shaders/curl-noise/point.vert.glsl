uniform sampler2D tPosition;
uniform sampler2D tVelocity;
uniform float uPointSize;
uniform float uActiveCount;
uniform vec2 uTexRes;
uniform float uMaxSpeed;

attribute vec2 reference;

varying float vSpeed;
varying float vLife;
varying float vActive;

void main() {
  float idx = reference.y * uTexRes.x + reference.x;
  vActive = step(idx, uActiveCount - 1.0);

  vec2 uv = (reference + 0.5) / uTexRes;
  vec4 posData = texture2D(tPosition, uv);
  vec3 pos = posData.xyz;
  vLife = posData.w;
  vec3 vel = texture2D(tVelocity, uv).xyz;
  vSpeed = clamp(length(vel) / uMaxSpeed, 0.0, 1.0);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Size attenuation
  float size = uPointSize * (300.0 / -mvPosition.z);
  gl_PointSize = vActive > 0.5 ? max(size, 0.5) : 0.0;
}
