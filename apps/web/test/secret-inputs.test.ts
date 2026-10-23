import { describe, expect, test } from "bun:test"
import { parseEnvFile } from "@/lib/env/dotenv"
import { secretSaveSchema, variablesSchema } from "@/lib/env/inputs"

describe("secret inputs", () => {
  test("imports dotenv quotes, escapes, comments, multiline and empty values", () => {
    expect(
      parseEnvFile(String.raw`export API_KEY="quoted # value"
ESCAPES="a\"b\\c\nnext\tstop"
LITERAL='a\nb'
MULTILINE="first
second"
EMPTY=
PLAIN=value # comment
DUP=first
DUP=last
`),
    ).toEqual([
      { name: "API_KEY", value: "quoted # value" },
      { name: "ESCAPES", value: 'a"b\\c\nnext\tstop' },
      { name: "LITERAL", value: "a\\nb" },
      { name: "MULTILINE", value: "first\nsecond" },
      { name: "EMPTY", value: "" },
      { name: "PLAIN", value: "value" },
      { name: "DUP", value: "last" },
    ])
  })
  test("rejects malformed and oversized env files", () => {
    for (const source of [
      'KEY="unclosed',
      'KEY="value" trailing',
      "bad-key=value",
      `KEY=${"x".repeat(32769)}`,
    ]) {
      expect(() => parseEnvFile(source)).toThrow()
    }
  })
  test("uses utf8 size and duplicate limits", () => {
    expect(variablesSchema.safeParse([{ name: "KEY", value: "😀".repeat(8193) }]).success).toBe(
      false,
    )
    expect(
      variablesSchema.safeParse([
        { name: "KEY", value: "a" },
        { name: "KEY", value: "b" },
      ]).success,
    ).toBe(false)
    expect(
      secretSaveSchema.safeParse({
        slug: "dev",
        project: "Example",
        environment: "local",
        entries: [],
      }).success,
    ).toBe(false)
  })
})
