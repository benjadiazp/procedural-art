uniform float uDelta;
uniform float uTime;
uniform float uActiveCount;
uniform float uSeparationWeight;
uniform float uAlignmentWeight;
uniform float uCohesionWeight;
uniform float uMaxSpeed;
uniform float uPerceptionRadius;
uniform float uSeparationRadius;
uniform float uBoundarySize;
uniform int uPredatorCount;
uniform vec3 uPredators[MAX_PREDATORS];
uniform float uFleeRadius;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float index = gl_FragCoord.y * resolution.x + gl_FragCoord.x;

  if (index >= uActiveCount) {
    gl_FragColor = texture2D(textureVelocity, uv);
    return;
  }

  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  vec3 separation = vec3(0.0);
  vec3 alignment  = vec3(0.0);
  vec3 cohesion   = vec3(0.0);
  float sepW  = 0.0;
  float aliW  = 0.0;
  float cohW  = 0.0;

  // Scale factors for Cauchy-Lorentz weighting (no hard cutoffs)
  float percSq = uPerceptionRadius * uPerceptionRadius;
  float sepSq  = uSeparationRadius * uSeparationRadius;
  float maxForce = uMaxSpeed * 0.5;

  // Stochastic sampling — every sample contributes via distance weighting
  for (int i = 0; i < 32; i++) {
    float fi = float(i);
    vec2 seed = uv * 1000.0 + vec2(fi * 1.13, fract(uTime * 0.1) * 100.0 + fi * 0.37);
    vec2 r = hash2(seed);
    float idx = floor(r.x * uActiveCount);
    vec2 sampleUV = (vec2(mod(idx, resolution.x), floor(idx / resolution.x)) + 0.5) / resolution.xy;

    vec3 oPos = texture2D(texturePosition, sampleUV).xyz;
    vec3 oVel = texture2D(textureVelocity, sampleUV).xyz;

    vec3 diff = pos - oPos;
    float dSq = dot(diff, diff);
    if (dSq < 0.0001) continue;  // skip self

    // Cauchy weight: 1 at d=0, 0.5 at d=percRad, smooth fall-off — never 0
    float wPerc = percSq / (percSq + dSq);
    alignment += oVel * wPerc;   aliW += wPerc;
    cohesion  += oPos * wPerc;   cohW += wPerc;

    // Separation: sharper weight, repel inversely by distance
    float wSep = sepSq / (sepSq + dSq);
    float d = sqrt(dSq);
    separation += (diff / d) * wSep / d;
    sepW += wSep;
  }

  vec3 accel = vec3(0.0);

  if (sepW > 0.0001) {
    separation /= sepW;
    float sl = length(separation);
    if (sl > 0.0001) {
      separation = separation / sl * uMaxSpeed - vel;
      sl = length(separation);
      if (sl > maxForce) separation *= maxForce / sl;
      accel += separation * uSeparationWeight;
    }
  }
  if (aliW > 0.0001) {
    alignment /= aliW;
    float al = length(alignment);
    if (al > 0.0001) {
      alignment = alignment / al * uMaxSpeed - vel;
      al = length(alignment);
      if (al > maxForce) alignment *= maxForce / al;
      accel += alignment * uAlignmentWeight;
    }
  }
  if (cohW > 0.0001) {
    cohesion /= cohW;
    vec3 steer = cohesion - pos;
    float cl = length(steer);
    if (cl > 0.0001) {
      steer = steer / cl * uMaxSpeed - vel;
      cl = length(steer);
      if (cl > maxForce) steer *= maxForce / cl;
      accel += steer * uCohesionWeight;
    }
  }

  // Flee from predators (Cauchy-weighted, no hard cutoff)
  float fleeSq = uFleeRadius * uFleeRadius;
  for (int i = 0; i < MAX_PREDATORS; i++) {
    if (i >= uPredatorCount) break;
    vec3 dd = pos - uPredators[i];
    float dSq = dot(dd, dd);
    if (dSq > 0.0001) {
      float wFlee = fleeSq / (fleeSq + dSq);
      vec3 flee = normalize(dd) * uMaxSpeed - vel;
      float fl = length(flee);
      if (fl > maxForce * 2.0) flee *= maxForce * 2.0 / fl;
      accel += flee * wFlee * 4.0;
    }
  }

  // Soft boundary steering
  float threshold = uBoundarySize * 0.8;
  float edge = uBoundarySize - threshold;
  for (int a = 0; a < 3; a++) {
    float p = a == 0 ? pos.x : (a == 1 ? pos.y : pos.z);
    float ap = abs(p);
    if (ap > threshold) {
      float o = (ap - threshold) / edge;
      float f = -sign(p) * o * o * uMaxSpeed;
      if (a == 0) accel.x += f;
      else if (a == 1) accel.y += f;
      else accel.z += f;
    }
  }

  vel += accel * uDelta;
  float speed = length(vel);
  if (speed > uMaxSpeed) vel *= uMaxSpeed / speed;
  if (speed < uMaxSpeed * 0.05) vel += vec3(0.001, 0.0, 0.0);

  gl_FragColor = vec4(vel, 1.0);
}
