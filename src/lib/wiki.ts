// Shared constants for the partner Guide (wiki). The Guide content lives in the
// `wiki_sections` table; this module is the single source of truth for the
// allowlisted section icons so the admin editor, the partner page, and the
// sidebar all agree. Icons are lucide-react components looked up by name — only
// names in this map are valid; anything else falls back to DEFAULT_WIKI_ICON.

import {
  BookOpen,
  LogIn,
  FileText,
  FileEdit,
  Workflow,
  PenLine,
  MessageSquare,
  Contact,
  Printer,
  Sparkles,
  Library,
  HelpCircle,
  Home,
  Settings,
  Users,
  Calendar,
  BarChart3,
  Target,
  Flag,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Rocket,
  Compass,
  Map,
  Folder,
  Link2,
  Mail,
  Shield,
  type LucideIcon,
} from "lucide-react";

export const WIKI_ICONS = {
  BookOpen,
  LogIn,
  FileText,
  FileEdit,
  Workflow,
  PenLine,
  MessageSquare,
  Contact,
  Printer,
  Sparkles,
  Library,
  HelpCircle,
  Home,
  Settings,
  Users,
  Calendar,
  BarChart3,
  Target,
  Flag,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Rocket,
  Compass,
  Map,
  Folder,
  Link2,
  Mail,
  Shield,
} as const satisfies Record<string, LucideIcon>;

export type WikiIconName = keyof typeof WIKI_ICONS;

export const WIKI_ICON_NAMES = Object.keys(WIKI_ICONS) as WikiIconName[];

export const DEFAULT_WIKI_ICON: WikiIconName = "BookOpen";

/** Resolve a stored icon name to a lucide component, falling back to the default. */
export function wikiIcon(name?: string | null): LucideIcon {
  if (name && name in WIKI_ICONS) return WIKI_ICONS[name as WikiIconName];
  return WIKI_ICONS[DEFAULT_WIKI_ICON];
}
