import { describe, expect, test } from "bun:test"
import { pageStructuredData, serializeJsonLd } from "./structured-data"

const page = {
  title: "Pastes",
  description: "What a paste holds.",
  url: "/core-concepts/pastes",
  slugs: ["core-concepts", "pastes"],
}
const crumbs = [
  { name: "Sniptide docs", path: "/" },
  { name: "Core concepts", path: "/core-concepts" },
  { name: "Pastes", path: "/core-concepts/pastes" },
]

describe("page structured data", () => {
  const graph = pageStructuredData(page, crumbs)["@graph"]

  test("describes the article with absolute URLs", () => {
    expect(graph[0]).toMatchObject({
      "@type": "TechArticle",
      headline: "Pastes",
      url: "https://docs.sniptide.com/core-concepts/pastes",
      image: "https://docs.sniptide.com/og/core-concepts/pastes/image.png",
    })
  })

  test("numbers the breadcrumbs from the home page", () => {
    const list = graph[1] as { itemListElement: { position: number; item: string }[] }
    expect(list.itemListElement.map((entry) => entry.position)).toEqual([1, 2, 3])
    expect(list.itemListElement[0]?.item).toBe("https://docs.sniptide.com")
  })

  test("serializes to JSON that can't close a script tag", () => {
    const json = serializeJsonLd({ name: "</script><script>alert(1)</script>" })
    expect(json).not.toContain("<")
    expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)</script>" })
  })
})
