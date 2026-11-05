import { Step, Steps } from "fumadocs-ui/components/steps"
import { Tab, Tabs } from "fumadocs-ui/components/tabs"
import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import {
  BookOpen,
  Bot,
  ChartColumn,
  FolderTree,
  GitFork,
  History,
  KeyRound,
  Link2,
  Rocket,
  Server,
  Share2,
  Flame,
  FileCode,
  LayoutDashboard,
  Download,
  Terminal,
} from "lucide-react"
import {
  AgentLoopVisual,
  BurnAfterReadVisual,
  FirstPasteVisual,
  HowItFitsVisual,
  SelfHostVisual,
} from "@/components/visuals"

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AgentLoopVisual,
    BurnAfterReadVisual,
    SelfHostVisual,
    FirstPasteVisual,
    HowItFitsVisual,
    BookOpenIcon: BookOpen,
    BotIcon: Bot,
    ChartColumnIcon: ChartColumn,
    DownloadIcon: Download,
    FileCodeIcon: FileCode,
    FlameIcon: Flame,
    FolderTreeIcon: FolderTree,
    GitForkIcon: GitFork,
    HistoryIcon: History,
    KeyRoundIcon: KeyRound,
    LayoutDashboardIcon: LayoutDashboard,
    Link2Icon: Link2,
    RocketIcon: Rocket,
    ServerIcon: Server,
    Share2Icon: Share2,
    TerminalIcon: Terminal,
    Step,
    Steps,
    Tab,
    Tabs,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
