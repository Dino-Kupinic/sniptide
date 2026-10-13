import { describe, expect, test } from "bun:test"
import { parseDotenv, serializeDotenv } from "../src/env"

describe(".env files", () => {
  test("parse dotenv syntax", () => {
    expect(
      parseDotenv(
        [
          "﻿# a comment",
          "",
          "export A=1",
          "B = spaced value  # trailing comment",
          "C='single $HOME # not a comment'",
          'D="double\\nline \\"quoted\\" \\\\ back"',
          'E="real',
          'newline"',
          "F=",
          "G=a#b",
          "A=2",
        ].join("\r\n"),
      ),
    ).toEqual([
      { name: "A", value: "2" },
      { name: "B", value: "spaced value" },
      { name: "C", value: "single $HOME # not a comment" },
      { name: "D", value: 'double\nline "quoted" \\ back' },
      { name: "E", value: "real\nnewline" },
      { name: "F", value: "" },
      { name: "G", value: "a#b" },
    ])
  })

  test("reject lines that aren't assignments and unclosed quotes", () => {
    expect(() => parseDotenv("just words")).toThrow("line 1")
    expect(() => parseDotenv('A=1\nB="open')).toThrow("Unclosed quote in line 2")
    expect(() => parseDotenv('A="x" trailing')).toThrow("after a quoted value")
  })

  test("serialize values so they parse back unchanged", () => {
    const variables = [
      { name: "PLAIN", value: "postgres://u:p@h:5432/db?x=1" },
      { name: "SPACES", value: "two words" },
      { name: "QUOTES", value: `it's "quoted" \\ ok` },
      { name: "LINES", value: "a\nb\r\nc" },
      { name: "HASH", value: "x #y" },
      { name: "EMPTY", value: "" },
      { name: "DOLLAR", value: "$HOME" },
    ]
    expect(parseDotenv(serializeDotenv(variables))).toEqual(variables)
  })
})
