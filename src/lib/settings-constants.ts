/** 클라이언트/서버 공용 — Node fs 없이 사용 */

export const HF_MODEL_PRESETS = [
  "Qwen/Qwen2.5-7B-Instruct",
  "Qwen/Qwen2.5-14B-Instruct",
  "Qwen/Qwen3.5-35B-A3B",
  "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.3",
  "google/gemma-2-9b-it",
  "microsoft/Phi-3.5-mini-instruct",
  "HuggingFaceH4/zephyr-7b-beta",
  "NousResearch/Hermes-3-Llama-3.1-8B",
] as const;

export const HF_MODEL_CUSTOM = "__custom__";
