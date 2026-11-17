import { LoadingScreen } from "@/components/loading/status"
import { TemplateCatalogLoading } from "@/components/templates/template-catalog-loading"

export default function Loading() {
  return (
    <LoadingScreen>
      <TemplateCatalogLoading />
    </LoadingScreen>
  )
}
