import * as Device from 'expo-device'
import type { ModelSpec, RamFit } from '../types'
import { totalDownloadBytes } from '../models/catalog'

export type DeviceFitModel = Pick<ModelSpec, 'id' | 'name' | 'params' | 'sizeBytes' | 'projector'>

export interface RamFitDescription {
  label: string
  rationale: string
}

export interface DeviceFitRecommendation<T extends DeviceFitModel = DeviceFitModel> {
  model: T
  fit: RamFit
  fitLabel: string
  rationale: string
  ramLabel: string
}

/**
 * Rough heuristic for whether a model of a given file size will run
 * comfortably given total device RAM. Mobile OSes only let an app use a
 * fraction of physical memory, and inference needs the weights plus KV cache
 * headroom, so we key off the total-RAM to model-size ratio.
 */
export function ramFitForMemory(
  modelSizeBytes: number,
  totalMemory: number | null | undefined
): RamFit {
  if (!Number.isFinite(modelSizeBytes) || modelSizeBytes <= 0 || !totalMemory || totalMemory <= 0) {
    return 'unknown'
  }
  const ratio = totalMemory / modelSizeBytes
  if (ratio >= 4.5) return 'great'
  if (ratio >= 2.8) return 'ok'
  return 'risky'
}

export function ramFit(modelSizeBytes: number): RamFit {
  return ramFitForMemory(modelSizeBytes, Device.totalMemory)
}

export function ramFitLabel(fit: RamFit): string {
  switch (fit) {
    case 'great':
      return 'Runs great'
    case 'ok':
      return 'Should run'
    case 'risky':
      return 'May be too big'
    default:
      return 'RAM unavailable'
  }
}

export function describeRamFit(fit: RamFit): RamFitDescription {
  switch (fit) {
    case 'great':
      return {
        label: ramFitLabel(fit),
        rationale: 'Leaves the most headroom for the app and longer conversations.',
      }
    case 'ok':
      return {
        label: ramFitLabel(fit),
        rationale: 'The largest catalog model expected to fit; a moderate context keeps memory pressure lower.',
      }
    case 'risky':
      return {
        label: ramFitLabel(fit),
        rationale: 'Larger models may load slowly or be closed when the phone is low on memory.',
      }
    default:
      return {
        label: ramFitLabel(fit),
        rationale: 'Device RAM is unavailable, so start with the smallest download and verify performance on-device.',
      }
  }
}

export function ramLabelForMemory(totalMemory: number | null | undefined): string {
  if (!totalMemory || totalMemory <= 0) return 'Device RAM unavailable'
  const gigabytes = totalMemory / 1_000_000_000
  const displayValue = gigabytes < 10 ? Math.round(gigabytes * 10) / 10 : Math.round(gigabytes)
  return `${displayValue} GB RAM`
}

/**
 * Selects the largest catalog tier with a non-risky RAM fit. The function is
 * pure when the memory value is supplied, which keeps the recommendation
 * deterministic and easy to test without pretending to know hardware.
 */
export function recommendModelForMemory<T extends DeviceFitModel>(
  models: readonly T[],
  totalMemory: number | null | undefined
): DeviceFitRecommendation<T> | null {
  const candidates = models
    .filter((model) => Number.isFinite(model.sizeBytes) && model.sizeBytes > 0)
    .map((model) => ({ model, fit: ramFitForMemory(totalDownloadBytes(model), totalMemory) }))
    .sort((a, b) => totalDownloadBytes(a.model) - totalDownloadBytes(b.model))

  if (candidates.length === 0) return null

  const fitted = candidates.filter(({ fit }) => fit === 'great' || fit === 'ok')
  // With a known fit, take the largest safe tier. Without one, choose the
  // smallest download rather than making a hardware claim from no data.
  const selected = fitted.length > 0 ? fitted[fitted.length - 1] : candidates[0]
  const description = describeRamFit(selected.fit)

  return {
    model: selected.model,
    fit: selected.fit,
    fitLabel: description.label,
    rationale: description.rationale,
    ramLabel: ramLabelForMemory(totalMemory),
  }
}

export function recommendModelForDevice<T extends DeviceFitModel>(
  models: readonly T[]
): DeviceFitRecommendation<T> | null {
  return recommendModelForMemory(models, Device.totalMemory)
}

export function totalRamLabel(): string {
  const total = Device.totalMemory
  return total ? ramLabelForMemory(total) : ''
}
