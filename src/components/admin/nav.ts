import {
  BarChart3, Bell, BookOpen, CreditCard, FileText, KeyRound, LayoutDashboard, Monitor, Rocket, ScrollText, Settings, ShieldCheck, Tag, UserCog, UserRoundSearch, Users, Wallet, type LucideIcon,
} from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; exact?: boolean }
export interface NavGroup { label: string | null; items: NavItem[] }

export const ADMIN_NAV: NavGroup[] = [
  { label: null, items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  { label: "Business", items: [
    { href: "/admin/users", label: "Users and logins", icon: UserRoundSearch },
    { href: "/admin/customers", label: "Customers", icon: Users },
    { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
    { href: "/admin/invoices", label: "Invoices", icon: FileText },
    { href: "/admin/payments", label: "Payments", icon: Wallet },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  ] },
  { label: "Licensing", items: [
    { href: "/admin/access", label: "Access control", icon: ShieldCheck },
    { href: "/admin/licenses", label: "Licences", icon: KeyRound },
    { href: "/admin/terminals", label: "Devices", icon: Monitor },
  ] },
  { label: "Product", items: [
    { href: "/admin/releases", label: "Releases", icon: Rocket },
    { href: "/admin/pricing", label: "Pricing", icon: Tag },
    { href: "/admin/setup", label: "Setup guide", icon: BookOpen },
  ] },
  { label: "Workspace", items: [
    { href: "/admin/notifications", label: "Notifications", icon: Bell },
    { href: "/admin/team", label: "Team", icon: UserCog },
    { href: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ] },
];
