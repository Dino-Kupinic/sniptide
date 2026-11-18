import { parseDotenv } from "@sniptide/contracts/dotenv"
import { MAX_GROUP_BYTES, type Variable, variablesSchema } from "./inputs"

export function parseEnvFile(text: string): Variable[] {
  if (new TextEncoder().encode(text).length > MAX_GROUP_BYTES)
    throw new Error("The env file is too large.")
  return variablesSchema.parse(parseDotenv(text))
}
