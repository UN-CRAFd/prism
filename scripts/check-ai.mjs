// Check that the AI connection used by Report Import works, without starting
// the app. Sends one tiny request ("Reply with OK") using the same settings the
// extraction endpoint reads, and prints which provider and model answered.
//
// From the repo root:
//   node --env-file=.env scripts/check-ai.mjs
//
// Microsoft Foundry: ANTHROPIC_FOUNDRY_API_KEY + ANTHROPIC_FOUNDRY_RESOURCE
// (or ANTHROPIC_FOUNDRY_BASE_URL), optional ANTHROPIC_FOUNDRY_DEPLOYMENT.
// Anthropic API:      ANTHROPIC_API_KEY.

import Anthropic from "@anthropic-ai/sdk";
import AnthropicFoundry from "@anthropic-ai/foundry-sdk";

const env = process.env;
let client;
let model = "claude-opus-5-5";
let provider;

if (env.ANTHROPIC_FOUNDRY_API_KEY && (env.ANTHROPIC_FOUNDRY_RESOURCE || env.ANTHROPIC_FOUNDRY_BASE_URL)) {
  client = new AnthropicFoundry();
  model = env.ANTHROPIC_FOUNDRY_DEPLOYMENT?.trim() || model;
  provider = `Microsoft Foundry (${env.ANTHROPIC_FOUNDRY_RESOURCE || env.ANTHROPIC_FOUNDRY_BASE_URL})`;
} else if (env.ANTHROPIC_API_KEY) {
  client = new Anthropic();
  provider = "Anthropic API";
} else {
  console.error("No AI settings found. Set ANTHROPIC_FOUNDRY_API_KEY and ANTHROPIC_FOUNDRY_RESOURCE in .env.");
  process.exit(1);
}

console.log(`Provider: ${provider}\nModel / deployment: ${model}`);
try {
  const msg = await client.messages.create({
    model,
    max_tokens: 256,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "Reply with OK." }],
  });
  const text = msg.content.find((b) => b.type === "text")?.text ?? "";
  console.log(`Answer: ${text.trim()}\nConnection works.`);
} catch (err) {
  console.error(`Connection failed: ${err?.status ?? ""} ${err?.message ?? err}`);
  if (err?.status === 401) console.error("→ Check the key (Foundry portal › Build › Models › your deployment › Details › Key).");
  if (err?.status === 403) console.error("→ Your Azure account needs a role such as Foundry User or Cognitive Services User on the resource.");
  if (err?.status === 404) console.error("→ Check the resource name and that ANTHROPIC_FOUNDRY_DEPLOYMENT matches the deployment name exactly.");
  process.exit(1);
}
