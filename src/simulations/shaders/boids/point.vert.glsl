uniform sampler2D tPosition;
uniform sampler2D tVelocity;
uniform float uPointSize;
uniform float uMaxSpeed;
uniform float uActiveCount;
uniform vec2 uTexRes;

attribute vec2 reference;

varying float vSpeed;
varying float vActive;

void main() {
  float idx = reference.y * uTexRes.x + reference.x;
  vActive = step(idx, uActiveCount - 1.0);

  vec2 uv = (reference + 0.5) / uTexRes;
  vec3 pos = texture2D(tPosition, uv).xyz;
  vec3 vel = texture2D(tVelocity, uv).xyz;
  vSpeed = clamp(length(vel) / uMaxSpeed, 0.0, 1.0);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uPointSize * (300.0 / max(-mv.z, 1.0)) * vActive;
  gl_Position  = projectionMatrix * mv;
}
