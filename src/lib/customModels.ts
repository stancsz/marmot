import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import { ModelSpec } from '../types'
import { CATALOG, getModel } from '../models/catalog'
import { customModelFromFile, MIN_GGUF_BYTES } from './customModelParse'
import { modelPath } from './downloads'
import { engine } from './engine'

const CUSTOM_KEY = 'marmot.customModels.v1'

/**
 * User-imported .gguf models. The file is copied into the same models
 * directory as catalog downloads (modelPath(id)), so the engine loads them
 * identically. A module-level cache lets synchronous call sites
 * (chat badges, share headers) resolve names after any screen hydrates it.
 */
let cache: ModelSpec[] = []

export function customModelsCache(): ModelSpec[] {
  return cache
}

/** catalog first, then imported models (cache must be hydrated) */
export function resolveModel(id: string | null | undefined): ModelSpec | undefined {
  return getModel(id) ?? cache.find((m) => m.id === id)
}

export async function loadCustomModels(): Promise<ModelSpec[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_KEY)
    cache = raw ? (JSON.parse(raw) as ModelSpec[]) : []
  } catch {
    cache = []
  }
  return cache
}

async function save(models: ModelSpec[]): Promise<void> {
  cache = models
  await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(models))
}

export async function importModelFile(sourceUri: string, filename: string): Promise<ModelSpec> {
  const existing = await loadCustomModels()
  const existingIds = [...existing.map((m) => m.id), ...CATALOG.map((m) => m.id)]

  // validate name/extension first with a placeholder size; the real size is
  // only knowable after the copy (content:// providers may not report it)
  const draft = customModelFromFile(filename, Number.MAX_SAFE_INTEGER, existingIds)
  const dest = modelPath(draft.id)

  await FileSystem.copyAsync({ from: sourceUri, to: dest })
  const info = await FileSystem.getInfoAsync(dest)
  const sizeBytes = info.exists && 'size' in info ? info.size ?? 0 : 0
  if (sizeBytes < MIN_GGUF_BYTES) {
    await FileSystem.deleteAsync(dest, { idempotent: true })
    throw new Error('That file is too small to be a usable model.')
  }

  const spec = { ...draft, sizeBytes }
  await save([...existing, spec])
  return spec
}

export async function removeCustomModel(id: string): Promise<void> {
  if (engine.getLoadedModelId() === id) await engine.unload()
  await FileSystem.deleteAsync(modelPath(id), { idempotent: true })
  const existing = await loadCustomModels()
  await save(existing.filter((m) => m.id !== id))
}
