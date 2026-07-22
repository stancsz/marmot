import { ModelSpec } from '../types'

/**
 * One hand-picked model per weight class — the highest-rated open model at
 * each size that phones can run, as of July 2026 (Artificial Analysis /
 * LMArena / per-tier benchmark comparisons). All are GGUF builds hosted on
 * Hugging Face (including a ggml-org vision build). Sizes are exact byte counts verified
 * against the hosted files via the HF API.
 */
export const CATALOG: ModelSpec[] = [
  {
    id: 'smolvlm-256m',
    name: 'SmolVLM 256M Vision',
    family: 'HuggingFace SmolVLM',
    params: '0.2B',
    quant: 'Q8_0',
    sizeBytes: 175_054_528,
    url: 'https://huggingface.co/ggml-org/SmolVLM-256M-Instruct-GGUF/resolve/main/SmolVLM-256M-Instruct-Q8_0.gguf',
    projector: {
      url: 'https://huggingface.co/ggml-org/SmolVLM-256M-Instruct-GGUF/resolve/main/mmproj-SmolVLM-256M-Instruct-f16.gguf',
      sizeBytes: 190_031_616,
      modalities: ['vision'],
    },
    description:
      'Small vision starter. Reads screenshots and receipts on-device with a paired projector; a fast, low-memory way to try private image understanding.',
    license: 'Apache 2.0',
    thinking: false,
  },
  {
    id: 'qwen3.5-0.8b',
    name: 'Qwen3.5 0.8B',
    family: 'Alibaba Qwen',
    params: '0.8B',
    quant: 'Q4_K_M',
    sizeBytes: 532_517_120,
    url: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf',
    description:
      'Featherweight class. Instant responses on any phone, 200+ languages, optional reasoning — rated well above every other sub-1B model.',
    license: 'Apache 2.0',
    thinking: true,
  },
  {
    id: 'qwen3.5-2b',
    name: 'Qwen3.5 2B',
    family: 'Alibaba Qwen',
    params: '2B',
    quant: 'Q4_K_M',
    sizeBytes: 1_280_835_840,
    url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf',
    description:
      'Lightweight class. The top-rated ~2B model — beats Gemma 4 E2B on reasoning, GPQA, and overall intelligence benchmarks.',
    license: 'Apache 2.0',
    thinking: true,
  },
  {
    id: 'smollm3-3b',
    name: 'SmolLM3 3B',
    family: 'HuggingFace SmolLM',
    params: '3.1B',
    quant: 'Q4_K_M',
    sizeBytes: 1_915_306_528,
    url: 'https://huggingface.co/unsloth/SmolLM3-3B-GGUF/resolve/main/SmolLM3-3B-Q4_K_M.gguf',
    description:
      'Middleweight class. The strongest fully-open 3B — outperforms Llama 3.2 3B — with dual-mode reasoning. Comfortable on 6 GB phones.',
    license: 'Apache 2.0',
    thinking: true,
  },
  {
    id: 'qwen3.5-4b',
    name: 'Qwen3.5 4B',
    family: 'Alibaba Qwen',
    params: '4B',
    quant: 'Q4_K_M',
    sizeBytes: 2_740_937_888,
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
    description:
      'Cruiserweight class. The strongest dense 4B available — wins knowledge, science, and agentic benchmarks at this tier. Wants 8 GB+ of RAM.',
    license: 'Apache 2.0',
    thinking: true,
  },
  {
    id: 'gemma-4-e4b',
    name: 'Gemma 4 E4B',
    family: 'Google Gemma',
    params: '4B effective',
    quant: 'Q3_K_M',
    sizeBytes: 4_058_137_728,
    url: 'https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q3_K_M.gguf',
    description:
      'Heavyweight class. 8B raw weights at a 4B memory footprint — the closest to cloud-chatbot quality a phone can run. Needs a 12 GB+ flagship.',
    license: 'Apache 2.0',
  },
]

export function getModel(id: string | null | undefined): ModelSpec | undefined {
  return CATALOG.find((m) => m.id === id)
}

export function totalDownloadBytes(model: Pick<ModelSpec, 'sizeBytes' | 'projector'>): number {
  return model.sizeBytes + (model.projector?.sizeBytes ?? 0)
}

export function hasVision(model: Pick<ModelSpec, 'projector'>): boolean {
  return model.projector?.modalities.includes('vision') ?? false
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`
  return `${Math.round(bytes / 1000)} KB`
}
