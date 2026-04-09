uniform float uFeedRate;
uniform float uKillRate;
uniform float uDiffusionU;
uniform float uDiffusionV;
uniform float uTimestep;
uniform vec4 uBrush; // xy = position (0-1), z = radius, w = active

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 tx = 1.0 / resolution.xy;

  vec4 c = texture2D(textureChemicals, uv);
  float U = c.r;
  float V = c.g;

  // 9-point weighted Laplacian (wrap handled by RepeatWrapping)
  float lapU = -U, lapV = -V;
  vec4 s;

  // Cardinals (weight 0.2)
  s = texture2D(textureChemicals, uv + vec2( tx.x, 0.0)); lapU += s.r * 0.2; lapV += s.g * 0.2;
  s = texture2D(textureChemicals, uv + vec2(-tx.x, 0.0)); lapU += s.r * 0.2; lapV += s.g * 0.2;
  s = texture2D(textureChemicals, uv + vec2(0.0,  tx.y)); lapU += s.r * 0.2; lapV += s.g * 0.2;
  s = texture2D(textureChemicals, uv + vec2(0.0, -tx.y)); lapU += s.r * 0.2; lapV += s.g * 0.2;

  // Diagonals (weight 0.05)
  s = texture2D(textureChemicals, uv + vec2( tx.x,  tx.y)); lapU += s.r * 0.05; lapV += s.g * 0.05;
  s = texture2D(textureChemicals, uv + vec2(-tx.x,  tx.y)); lapU += s.r * 0.05; lapV += s.g * 0.05;
  s = texture2D(textureChemicals, uv + vec2( tx.x, -tx.y)); lapU += s.r * 0.05; lapV += s.g * 0.05;
  s = texture2D(textureChemicals, uv + vec2(-tx.x, -tx.y)); lapU += s.r * 0.05; lapV += s.g * 0.05;

  // Gray-Scott reaction-diffusion
  float uvv = U * V * V;
  float newU = U + (uDiffusionU * lapU - uvv + uFeedRate * (1.0 - U)) * uTimestep;
  float newV = V + (uDiffusionV * lapV + uvv - (uFeedRate + uKillRate) * V) * uTimestep;

  // Brush seeding
  if (uBrush.w > 0.5) {
    vec2 d = abs(uv - uBrush.xy);
    d = min(d, 1.0 - d); // wrap-aware distance
    float dist = length(d);
    if (dist < uBrush.z) {
      float t = smoothstep(uBrush.z, uBrush.z * 0.2, dist);
      newV = mix(newV, 1.0, t);
      newU = mix(newU, 0.0, t * 0.5);
    }
  }

  gl_FragColor = vec4(clamp(newU, 0.0, 1.0), clamp(newV, 0.0, 1.0), 0.0, 1.0);
}
