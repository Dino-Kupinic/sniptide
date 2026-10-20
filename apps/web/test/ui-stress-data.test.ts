import { describe, expect, test } from "bun:test"
import { MAX_COLLECTIONS, MAX_NAME_LENGTH } from "@/lib/collections/types"
import { datasets, stressData } from "@/lib/dev/ui-stress-data"
import { pasteSchema } from "@/lib/pastes/schema"

describe("UI stress fixtures", () => {
  test("uses valid titles, files and collection limits in every state", () => {
    for (const dataset of datasets) {
      const data = stressData(dataset)
      expect(data.collections.length).toBeLessThanOrEqual(MAX_COLLECTIONS)
      for (const collection of data.collections) {
        expect(collection.name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
        expect(collection.name.trim().length).toBeGreaterThan(0)
      }
      for (const row of data.rows) {
        expect(row.title.length).toBeLessThanOrEqual(120)
        expect(row.owner?.username.length ?? 0).toBeLessThanOrEqual(30)
      }
      if (dataset !== "empty") {
        expect(pasteSchema.safeParse({ ...data.editor, password: null }).success).toBe(true)
      }
    }
  })
})
