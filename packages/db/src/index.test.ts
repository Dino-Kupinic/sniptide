import { beforeEach, expect, test } from "bun:test"

import { db, getUsers, users } from "./index"

beforeEach(async () => {
	await db.delete(users)
})

test("reads users with Drizzle", async () => {
	await db.insert(users).values({ id: "1", name: "Ada" })

  await expect(getUsers()).resolves.toEqual([{ id: "1", name: "Ada" }])
})
