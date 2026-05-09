export class LoggedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LoggedError'
    this.message = message
    this.alreadyLogged = true
  }
}