uniform sampler2D tDeposit;
uniform float uDecay;
uniform float uDiffuseWeight;
uniform vec4 uBrush;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 tx = 1.0 / resolution.xy;

  float current = texture2D(textureTrail, uv).r;

  // 3x3 box blur
  float sum = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      sum += texture2D(textureTrail, uv + vec2(float(dx), float(dy)) * tx).r;
    }
  }
  float blurred = sum / 9.0;

  // Mix, decay, then add deposits
  float result = mix(current, blurred, uDiffuseWeight) * uDecay;
  result += texture2D(tDeposit, uv).r;

  // Brush: click to add pheromone
  if (uBrush.w > 0.5) {
    vec2 d = abs(uv - uBrush.xy);
    d = min(d, 1.0 - d);
    float dist = length(d);
    if (dist < uBrush.z) {
      result += smoothstep(uBrush.z, 0.0, dist) * 5.0;
    }
  }

  gl_FragColor = vec4(min(result, 50.0), 0.0, 0.0, 1.0);
}
