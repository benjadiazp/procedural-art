uniform sampler2D tAgents;
uniform vec2 uAgentTexRes;

attribute vec2 reference;

void main() {
  vec2 agentUV = (reference + 0.5) / uAgentTexRes;
  vec4 agent = texture2D(tAgents, agentUV);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(agent.xy, 0.0, 1.0);
  gl_PointSize = 1.0;
}
