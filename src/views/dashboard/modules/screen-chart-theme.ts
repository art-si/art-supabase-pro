export function useScreenChartTheme() {
  const rootRef = ref<HTMLElement | null>(null)

  const readScreenColor = (name: string, fallback: string) => {
    if (!rootRef.value) return fallback
    const rawColor = getComputedStyle(rootRef.value).getPropertyValue(name).trim() || fallback
    const probe = rootRef.value.ownerDocument.createElement('span')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.color = rawColor
    rootRef.value.appendChild(probe)
    const resolvedColor = getComputedStyle(probe).color
    probe.remove()
    return resolvedColor || fallback
  }

  return { rootRef, readScreenColor }
}
