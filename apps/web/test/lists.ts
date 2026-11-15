import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage, listSharedPage } from "@/lib/pastes/lists"
import { parseSharedListQuery } from "@/lib/pastes/shared-list-query"

// The first page of each list as its screen loads it, for tests that check what a viewer sees.
const firstPage = async (mode: "mine" | "starred" | "trash") =>
  (await listPastePage({ mode }, parsePasteListQuery({}))).pastes

export const listOwnPastes = () => firstPage("mine")
export const listStarred = () => firstPage("starred")
export const listTrash = () => firstPage("trash")
export const listShared = async () => (await listSharedPage(parseSharedListQuery({}))).entries
