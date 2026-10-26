const cloudbase = {
  init(): never {
    throw new Error('CloudBase SDK is unavailable outside the CloudBase deployment mode')
  }
}

export default cloudbase
