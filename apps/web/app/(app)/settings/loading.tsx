import { LoadingScreen } from "@/components/loading/status"
import { SettingsLoading } from "@/components/settings/settings-view"

export default function Loading() {
  return (
    <LoadingScreen>
      <SettingsLoading />
    </LoadingScreen>
  )
}
