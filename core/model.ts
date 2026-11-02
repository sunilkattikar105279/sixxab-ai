// Claude client over the Messages REST API (no SDK dependency), with tiered model routing.
import type { ModelClient, ModelRequest, ModelResponse, ModelTier } from './types.js';

export interface AnthropicConfig {
  apiKey: string;
  models?: Partial<Record<ModelTier, string>>;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Defaults follow SIXXAB's routing pattern: a small model routes, a mid model works, the largest plans. */
export const DEFAULT_MODELS: Record<ModelTier, string> = {
  router: 'claude-haiku-5-5',
  worker: 'claude-sonnet-5-5',
  planner: 'claude-opus-5-5',
};

export class AnthropicClient implements ModelClient {
  private readonly models: Record<ModelTier, string>;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: AnthropicConfig) {
    if (!cfg.apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    this.models = { ...DEFAULT_MODELS, ...(cfg.models ?? {}) };
    this.baseUrl = cfg.baseUrl ?? 'https://api.anthropic.com';
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.models[req.tier],
        max_tokens: req.maxTokens ?? 2048,
        system: req.system,
        messages: req.messages,
        ...(req.tools && req.tools.length ? { tools: req.tools } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Claude API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { content: ModelResponse['content']; stop_reason: string };
    return { content: json.content, stopReason: json.stop_reason };
  }
}

export function modelsFromEnv(env: Record<string, string | undefined>): Partial<Record<ModelTier, string>> {
  const out: Partial<Record<ModelTier, string>> = {};
  if (env.SIXXAB_MODEL_ROUTER) out.router = env.SIXXAB_MODEL_ROUTER;
  if (env.SIXXAB_MODEL_WORKER) out.worker = env.SIXXAB_MODEL_WORKER;
  if (env.SIXXAB_MODEL_PLANNER) out.planner = env.SIXXAB_MODEL_PLANNER;
  return out;
}
