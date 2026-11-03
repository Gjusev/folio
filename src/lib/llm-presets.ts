// Pure, shared between server lib and the settings UI (no server-only imports).

export type ProfileKind = "openai" | "anthropic";

/** Serialized profile as the client sees it: never contains the key itself. */
export type Profile = {
  id: string;
  label: string;
  kind: ProfileKind;
  baseUrl: string;
  hasKey: boolean;
  models: string[];
  extra: Record<string, unknown>;
  enabled: boolean;
  readonly: boolean; // the env-synthesized profile
};

export type Task = "search" | "draft" | "embed";

/** One-click presets. Manual model IDs on purpose (Paperclip rule: no auto-fetch). */
export const PRESETS: {
  id: string;
  label: string;
  kind: ProfileKind;
  baseUrl: string;
  models: string;
  extra?: Record<string, unknown>;
}[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    models: "openai/gpt-5-mini, anthropic/claude-sonnet-5.5, google/gemini-3-flash",
    // Key privacy default: providers must not train on or log the user's drafts.
    extra: { provider: { data_collection: "deny" } },
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: "gpt-5-mini, gpt-5",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    models: "claude-sonnet-5.5, claude-haiku-5.5",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: "gemini-3-flash, gemini-3-pro",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    models: "mistral-small-latest",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com",
    models: "deepseek-chat",
  },
  {
    id: "xai",
    label: "xAI Grok",
    kind: "openai",
    baseUrl: "https://api.x.ai/v1",
    models: "grok-4-fast",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai",
    baseUrl: "http://localhost:11434/v1",
    models: "qwen3:4b, qwen3:0.6b",
  },
  { id: "custom", label: "Otro (OpenAI-compatible)", kind: "openai", baseUrl: "", models: "" },
];
