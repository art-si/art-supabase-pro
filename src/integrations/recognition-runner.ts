import type { Component } from 'vue'

export type RecognitionFeature = Api.IntelligentRecognition.Feature

const recognitionRunners = new Map<RecognitionFeature, Component>()

/** Register a business-owned recognition runner with the shared platform shell. */
export function registerRecognitionRunner(
  features: readonly RecognitionFeature[],
  component: Component
): void {
  features.forEach((feature) => recognitionRunners.set(feature, component))
}

/** Resolve an optional runner without making the platform depend on business source code. */
export function resolveRecognitionRunner(feature: RecognitionFeature): Component | undefined {
  return recognitionRunners.get(feature)
}
