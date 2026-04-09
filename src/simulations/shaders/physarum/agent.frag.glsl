uniform float uSensorAngle;
uniform float uSensorDist;
uniform float uTurnSpeed;
uniform float uMoveSpeed;
uniform float uActiveCount;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float index = gl_FragCoord.y * resolution.x + gl_FragCoord.x;

  vec4 agent = texture2D(textureAgents, uv);

  if (index >= uActiveCount) {
    gl_FragColor = agent;
    return;
  }

  vec2 pos = agent.xy;
  float heading = agent.z;

  // Sensor distance in UV space
  float sDist = uSensorDist / resolution.x;

  // Sample trail at three sensor positions
  vec2 dirL = vec2(cos(heading + uSensorAngle), sin(heading + uSensorAngle));
  vec2 dirF = vec2(cos(heading), sin(heading));
  vec2 dirR = vec2(cos(heading - uSensorAngle), sin(heading - uSensorAngle));

  float valL = texture2D(textureTrail, pos + dirL * sDist).r;
  float valF = texture2D(textureTrail, pos + dirF * sDist).r;
  float valR = texture2D(textureTrail, pos + dirR * sDist).r;

  // Pseudo-random per agent per frame
  float r = hash(uv * 1000.0 + vec2(uTime * 0.137, uTime * 0.291));

  // Steering logic
  if (valF > valL && valF > valR) {
    // Front is strongest — go straight
  } else if (valF < valL && valF < valR) {
    // Both sides stronger — turn randomly
    heading += (r > 0.5 ? 1.0 : -1.0) * uTurnSpeed;
  } else if (valL > valR) {
    heading += uTurnSpeed;
  } else if (valR > valL) {
    heading -= uTurnSpeed;
  }

  // Move forward
  float moveStep = uMoveSpeed / resolution.x;
  vec2 newPos = fract(pos + vec2(cos(heading), sin(heading)) * moveStep);

  gl_FragColor = vec4(newPos, heading, 1.0);
}
