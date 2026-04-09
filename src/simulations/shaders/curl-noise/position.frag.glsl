uniform float uDelta;
uniform float uActiveCount;
uniform float uBoundarySize;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float index = gl_FragCoord.y * resolution.x + gl_FragCoord.x;
  vec4 posData = texture2D(texturePosition, uv);
  vec3 pos = posData.xyz;
  float life = posData.w;

  if (index >= uActiveCount) {
    gl_FragColor = vec4(pos, life);
    return;
  }

  vec3 vel = texture2D(textureVelocity, uv).xyz;
  pos += vel * uDelta;

  // Age the particle
  life -= uDelta;

  // Respawn if out of bounds or life expired
  if (life <= 0.0 || length(pos) > uBoundarySize * 1.2) {
    // Hash-based respawn position
    float seed = index * 1.37 + fract(uDelta * 100.0) * 4871.0;
    float phi = fract(sin(seed * 12.9898) * 43758.5453) * 6.2831853;
    float cosTheta = fract(sin(seed * 78.233) * 28001.8384) * 2.0 - 1.0;
    float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
    float r = pow(fract(sin(seed * 45.164) * 17539.2947), 0.333) * uBoundarySize * 0.8;
    pos = vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta) * r;
    life = 3.0 + fract(sin(seed * 93.989) * 63841.1937) * 7.0;
  }

  gl_FragColor = vec4(pos, life);
}
