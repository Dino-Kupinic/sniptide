import { LoadingScreen } from "@/components/loading/status"
import { SecretListLoading } from "@/components/secrets/secret-list"

export default function Loading() {
  return (
    <LoadingScreen>
      <SecretListLoading />
    </LoadingScreen>
  )
}
