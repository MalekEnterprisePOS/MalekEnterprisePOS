import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** The platform is deliberately locked to South African rand. */
export const CURRENCY = "ZAR" as const;

/**
 * Always "R 1,207.50", on the server and in every browser. Intl.NumberFormat("en-ZA") was NOT used because Node and
 * Chrome ship different locale data (Node: "R 1 207,50", Chrome: "R 1,207.50"), which made invoice emails and web
 * pages show amounts in different styles and caused React hydration mismatches.
 */
export const formatZAR = (amount: number): string => {
  if (!Number.isFinite(amount)) return "R 0.00";
  const [whole = "0", cents = "00"] = Math.abs(amount).toFixed(2).split(".");
  return `${amount < 0 ? "-" : ""}R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function monthKey(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 7);
}

export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** "5 minutes ago", "yesterday", "12 Sept". */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "never";
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return "never";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}
