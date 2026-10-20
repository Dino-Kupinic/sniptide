export class CliError extends Error {
  constructor(
    message: string,
    public code = "INVALID_INPUT",
    public exitCode = 2,
  ) {
    super(message)
  }
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
