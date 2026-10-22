export class YoucamError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
