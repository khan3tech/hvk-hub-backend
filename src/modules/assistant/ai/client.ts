// 030 R2/R3: the model provider. Claude on Amazon Bedrock through the Mantle (Messages API)
// endpoint, authenticated by the AWS credential chain — the EC2 instance role in production, so
// no key is stored anywhere. A refusal falls back once to an older Opus via the SDK middleware
// (Bedrock has no server-side `fallbacks`).
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { betaRefusalFallbackMiddleware, type Anthropic } from "@anthropic-ai/sdk";

export type MessageParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type ModelMessage = Anthropic.Beta.Messages.BetaMessage;

export interface ModelClient {
  create(params: MessageParams): Promise<ModelMessage>;
}

export interface AiConfig {
  enabled: boolean;
  model: string;
  effort: "low" | "medium" | "high";
  region: string;
}

export function aiConfig(): AiConfig {
  const effort = process.env.ASSISTANT_EFFORT;
  return {
    enabled: process.env.ASSISTANT_PROVIDER === "bedrock",
    model: process.env.ASSISTANT_MODEL || "anthropic.claude-opus-5-5",
    effort: effort === "low" || effort === "high" ? effort : "medium",
    region: process.env.ASSISTANT_AWS_REGION || process.env.AWS_REGION || "ap-south-1",
  };
}

const FALLBACK_MODEL = "anthropic.claude-opus-4-8";

let override: ModelClient | null = null;
let cached: ModelClient | null = null;

// Tests (and local verification) swap in a fake model.
export function setModelClient(client: ModelClient | null): void {
  override = client;
}

export function modelClient(): ModelClient {
  if (override) return override;
  if (!cached) {
    const client = new AnthropicBedrockMantle({
      awsRegion: aiConfig().region,
      timeout: 60_000,
      maxRetries: 2,
      middleware: [betaRefusalFallbackMiddleware([{ model: FALLBACK_MODEL }])],
    });
    cached = { create: (params) => client.beta.messages.create(params) };
  }
  return cached;
}
