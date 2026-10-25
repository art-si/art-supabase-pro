/**
 * 提交前校验 ArtForm。Element Plus 收到回调时会返回 false 而不是拒绝字段错误，
 * 因此调用方可以只对真正的提交异常显示全局提示。
 */
export async function validateArtFormForSubmit(
  form:
    | {
        validate: (callback: (isValid: boolean) => void) => Promise<boolean | void> | boolean | void
      }
    | null
    | undefined
): Promise<boolean> {
  if (!form) return false
  return (await form.validate(() => undefined)) === true
}
