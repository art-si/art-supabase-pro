/** Temporarily enable startup theme transitions until the initial layout settles. */
export const toggleTransition = (enable: boolean): void => {
  const body = document.body
  if (enable) {
    body.classList.add('theme-change')
  } else {
    setTimeout(() => body.classList.remove('theme-change'), 300)
  }
}
