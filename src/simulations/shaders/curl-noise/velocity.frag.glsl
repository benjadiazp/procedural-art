uniform float uDelta;
uniform float uTime;
uniform float uActiveCount;
uniform float uNoiseScale;
uniform float uNoiseSpeed;
uniform float uFlowStrength;
uniform float uDamping;
uniform float uBoundarySize;
uniform float uTurbulence;
uniform int uOctaves;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float index = gl_FragCoord.y * resolution.x + gl_FragCoord.x;

  if (index >= uActiveCount) {
    gl_FragColor = texture2D(textureVelocity, uv);
    return;
  }

  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  // Multi-octave curl noise
  vec3 noisePos = pos * uNoiseScale + vec3(0.0, 0.0, uTime * uNoiseSpeed);
  vec3 curl = vec3(0.0);
  float amplitude = 1.0;
  float frequency = 1.0;
  float totalAmp = 0.0;

  for (int i = 0; i < 4; i++) {
    if (i >= uOctaves) break;
    curl += curlNoise(noisePos * frequency) * amplitude;
    totalAmp += amplitude;
    amplitude *= uTurbulence;
    frequency *= 2.0;
  }
  curl /= totalAmp;

  // Apply curl force
  vec3 force = curl * uFlowStrength;

  // Soft boundary — push particles back toward center
  float dist = length(pos);
  if (dist > uBoundarySize * 0.7) {
    float overshoot = (dist - uBoundarySize * 0.7) / (uBoundarySize * 0.3);
    force -= normalize(pos) * overshoot * overshoot * uFlowStrength * 2.0;
  }

  vel += force * uDelta;
  vel *= (1.0 - uDamping * uDelta);

  // Speed cap
  float speed = length(vel);
  float maxSpeed = uFlowStrength * 2.0;
  if (speed > maxSpeed) vel *= maxSpeed / speed;

  gl_FragColor = vec4(vel, 1.0);
}
