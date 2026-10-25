type ValidationCallback = (error?: Error) => void

interface LatestUniqueValidationOptions {
  check: (value: string) => Promise<boolean>
  duplicateMessage: string
  errorMessage: (error: unknown) => string
  delay: number
}

/** Settle superseded validations so form submission never waits on a cancelled debounce. */
export function createLatestUniqueValidation(
  options: LatestUniqueValidationOptions
): (value: unknown, callback: ValidationCallback) => void {
  let revision = 0
  let pendingCallback: ValidationCallback | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  return (value: unknown, callback: ValidationCallback): void => {
    revision += 1
    const currentRevision = revision
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined

    const supersededCallback = pendingCallback
    pendingCallback = null
    supersededCallback?.()
    if (currentRevision !== revision) {
      callback()
      return
    }

    if (typeof value !== 'string' || !value.trim()) {
      callback()
      return
    }

    pendingCallback = callback
    timer = setTimeout(
      async () => {
        timer = undefined
        let validationError: Error | undefined
        try {
          const exists = await options.check(value)
          if (exists) validationError = new Error(options.duplicateMessage)
        } catch (error: unknown) {
          validationError = new Error(options.errorMessage(error))
        }
        if (currentRevision !== revision) return
        pendingCallback = null
        callback(validationError)
      },
      Math.max(0, options.delay)
    )
  }
}
