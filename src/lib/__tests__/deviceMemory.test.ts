jest.mock('expo-device', () => ({ totalMemory: 3_000_000_000 }))

import {
  describeRamFit,
  ramLabelForMemory,
  ramFitForMemory,
  recommendModelForMemory,
} from '../deviceMemory'

const GB = 1_000_000_000

const models = [
  { id: 'small', name: 'Small', params: '1B', sizeBytes: 500_000_000 },
  { id: 'medium', name: 'Medium', params: '2B', sizeBytes: 1_200_000_000 },
  { id: 'large', name: 'Large', params: '4B', sizeBytes: 2_700_000_000 },
] as const

describe('device memory recommendations', () => {
  it('keeps the fit thresholds deterministic when memory is supplied', () => {
    expect(ramFitForMemory(500_000_000, 3 * GB)).toBe('great')
    expect(ramFitForMemory(1_200_000_000, 4 * GB)).toBe('ok')
    expect(ramFitForMemory(2_700_000_000, 3 * GB)).toBe('risky')
    expect(ramFitForMemory(500_000_000, null)).toBe('unknown')
  })

  it('chooses the largest non-risky tier for the available memory', () => {
    const recommendation = recommendModelForMemory(models, 4 * GB)

    expect(recommendation?.model.id).toBe('medium')
    expect(recommendation?.fit).toBe('ok')
    expect(recommendation?.ramLabel).toBe('4 GB RAM')
    expect(recommendation?.rationale).toMatch(/largest catalog model/i)
  })

  it('falls back to the smallest download when device RAM is unavailable', () => {
    const recommendation = recommendModelForMemory(models, undefined)

    expect(recommendation?.model.id).toBe('small')
    expect(recommendation?.fit).toBe('unknown')
    expect(recommendation?.fitLabel).toBe('RAM unavailable')
  })

  it('does not round a small device up to a larger RAM claim', () => {
    expect(ramLabelForMemory(1_536_000_000)).toBe('1.5 GB RAM')
  })

  it('describes risky fits without promising performance', () => {
    expect(describeRamFit('risky').rationale).toMatch(/may load slowly/i)
  })
})
