import type { Locator } from '@playwright/test'

export async function contrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    const channels = (value: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
      return [red, green, blue, alpha / 255]
    }
    let background = [255, 255, 255]
    const ancestors: Element[] = []
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      ancestors.unshift(parent)
    }
    for (const ancestor of ancestors) {
      const color = channels(getComputedStyle(ancestor).backgroundColor)
      const alpha = color[3] ?? 1
      background = background.map(
        (channel, index) => (color[index] ?? 0) * alpha + channel * (1 - alpha)
      )
    }
    const foreground = channels(getComputedStyle(element).color)
    const luminance = (color: number[]) =>
      color.slice(0, 3).reduce((sum, channel, index) => {
        const value = channel / 255
        return (
          sum +
          (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
            [0.2126, 0.7152, 0.0722][index]
        )
      }, 0)
    const a = luminance(foreground)
    const b = luminance(background)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
}
