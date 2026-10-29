"use client";

import { useReducedMotion } from "framer-motion";
import { Check, ClipboardCheck, PackageCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn, formatZAR, round2 } from "@/lib/utils";

const COST = 84;

/** Price maintenance: drag markup or gross profit and watch the other one, and the price, follow. */
export function PriceLab() {
  const [mode, setMode] = useState<"markup" | "gp">("markup");
  const [value, setValue] = useState(35);
  const markup = mode === "markup" ? value : (value / (100 - value)) * 100;
  const gp = mode === "gp" ? value : (value / (100 + value)) * 100;
  const sell = round2(COST * (1 + markup / 100));
  const profit = round2(sell - COST);
  const max = mode === "markup" ? 120 : 55;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl3 bg-ink-900 p-6 text-white shadow-lift sm:p-8">
      <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 opacity-60" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 font-receipt text-[11px] font-semibold text-accent">
          Landed WAC · Markup % ↔ GP % · Below-Cost Guard
        </div>
        <h3 className="display-wide text-2xl font-bold sm:text-[28px]">Set prices by Landed WAC & live margin, not guesswork.</h3>
        <p className="mt-2 max-w-lg text-[15px] text-ink-200">
          Automatically recalculates Landed Weighted Average Cost across batches (with negative-stock reset protection). Type a Markup % or Gross Profit % during GRV or price maintenance and watch the other update live.
        </p>
      </div>

      <div className="relative mt-6 grid gap-5 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 sm:grid-cols-[1fr_auto] sm:p-5">
        <div>
          <div role="tablist" aria-label="Price by" className="mb-4 inline-flex rounded-lg bg-black/25 p-0.5 text-xs font-semibold">
            {(["markup", "gp"] as const).map((m) => (
              <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => { setMode(m); setValue(m === "markup" ? 35 : 26); }}
                className={cn("rounded-md px-3 py-1.5 transition", mode === m ? "bg-accent text-accent-ink" : "text-ink-200 hover:text-white")}>{m === "markup" ? "Markup %" : "Gross profit %"}</button>
            ))}
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <label htmlFor="price-lab" className="text-ink-200">{mode === "markup" ? "Markup" : "Gross profit"}</label>
            <span className="font-display text-3xl font-extrabold tabular">{Math.round(value)}%</span>
          </div>
          <input id="price-lab" type="range" min={5} max={max} step={1} value={value} onChange={(e) => setValue(Number(e.target.value))}
            className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[#FFC72C]" />
          <div className="mt-2 flex justify-between text-[11px] text-ink-400"><span>5%</span><span>{max}%</span></div>
        </div>
        <dl className="grid min-w-[180px] grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-1">
          <div><dt className="text-ink-300">Landed WAC</dt><dd className="tabular font-semibold">{formatZAR(COST)}</dd></div>
          <div><dt className="text-ink-300">{mode === "markup" ? "Gross profit" : "Markup"}</dt><dd className="tabular font-semibold">{(mode === "markup" ? gp : markup).toFixed(1)}%</dd></div>
          <div><dt className="text-ink-300">Profit per unit</dt><dd className="tabular font-semibold text-live">{formatZAR(profit)}</dd></div>
          <div className="col-span-2 rounded-lg bg-accent px-3 py-2 text-accent-ink sm:col-span-1"><dt className="text-[11px] font-semibold">Selling price (incl.)</dt><dd className="font-display text-2xl font-extrabold tabular">{formatZAR(sell)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

const TILLS = ["Front till", "Trade counter", "Till 3 (Yard)"];

/** Every till talks to one server with auto-discovery and admin device approval. */
export function TillLink() {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full flex-col rounded-xl3 bg-surface p-6 shadow-card ring-1 ring-line sm:p-7">
      <div className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-0.5 font-receipt text-[11px] font-semibold text-ink-800">
        <ShieldCheck className="h-3.5 w-3.5 text-ok" aria-hidden />
        LAN Auto-Discovery · Admin Approval Gate
      </div>
      <h3 className="display-wide text-xl font-bold">2-step local LAN setup with device approval.</h3>
      <p className="mt-1.5 text-sm text-muted">
        Client tills find the Shop Server automatically over your LAN, wait in Pending Device Requests until approved by an Admin, and maintain a live 90-second heartbeat.
      </p>
      <svg viewBox="0 0 320 170" className="mt-4 h-auto w-full" role="img" aria-label="Three approved tills connected to one shop server">
        {TILLS.map((t, i) => {
          const y = 14 + i * 50;
          const path = `M108 ${y + 17} C 152 ${y + 17}, 152 85, 196 85`;
          return (
            <g key={t}>
              <rect x="6" y={y} width="102" height="34" rx="9" className="fill-ink-100" />
              <circle cx="18" cy={y + 17} r="3.5" className="fill-live" />
              <text x="27" y={y + 21} className="fill-ink-800 text-[10.5px] font-semibold">{t}</text>
              <path d={path} className="fill-none stroke-ink-300" strokeWidth="1.5" strokeDasharray="3 4" />
              {!reduce && <circle r="3" className="fill-accent-strong"><animateMotion dur={`${2.2 + i * 0.5}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" path={path} /></circle>}
            </g>
          );
        })}
        <rect x="196" y="52" width="118" height="66" rx="12" className="fill-ink-900" />
        <text x="255" y="76" textAnchor="middle" className="fill-white text-[12px] font-bold">Shop Server</text>
        <text x="255" y="92" textAnchor="middle" className="fill-accent text-[9.5px] font-semibold">PostgreSQL · LAN</text>
        <text x="255" y="106" textAnchor="middle" className="fill-ink-300 text-[8.5px]">90s Heartbeat Gate</text>
      </svg>
    </div>
  );
}

/** Goods received vouchers, break-bulk UOM & barcode labels. */
export function GrvCard() {
  const rows = [
    ["GRV-0142", "Break-bulk · WAC + Labels", "Approved", true],
    ["GRV-0141", "PO-0089 · Hardware Depot", "Approved", true],
    ["GRV-0140", "Cement & Timber Supply", "Pending", false],
  ] as const;
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl3 bg-accent p-6 text-accent-ink shadow-lift sm:p-7">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full border-[18px] border-white/25" />
      <ClipboardCheck className="relative h-6 w-6" aria-hidden />
      <h3 className="display-wide relative mt-3 text-xl font-bold">PO to GRV, Break-Bulk UOM & Shelf Labels.</h3>
      <p className="relative mt-1.5 text-[13.5px] leading-snug text-ink-800">
        Receive cases into individual units (Each, m, kg), review Pending vs. Processed GRVs, and print barcode labels immediately.
      </p>
      <ul className="relative mt-4 space-y-2">
        {rows.map(([n, s, status, done]) => (
          <li key={n} className="flex items-center gap-2.5 rounded-xl bg-white/55 px-3 py-2 text-[12.5px] backdrop-blur-sm">
            <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", done ? "bg-ink-900 text-accent" : "border-2 border-dashed border-ink-900/40")}>{done && <Check className="h-3.5 w-3.5" aria-hidden />}</span>
            <span className="font-receipt text-[11.5px] font-semibold">{n}</span>
            <span className="min-w-0 flex-1 truncate text-ink-800">{s}</span>
            <span className="font-semibold text-ink-900">{status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Live Available-to-Sell (ATS) Stock Engine. */
export function StockCard() {
  const rows = [
    { name: "NPC Cement 50kg", soh: 120, yard: 35, layby: 15, ats: 70 },
    { name: "Meranti Timber 3.6m", soh: 64, yard: 24, layby: 0, ats: 40 },
    { name: "Twin & Earth Cable (m)", soh: 250, yard: 50, layby: 25, ats: 175 },
  ] as const;
  return (
    <div className="flex h-full flex-col rounded-xl3 bg-surface p-6 shadow-card ring-1 ring-line sm:p-7">
      <PackageCheck className="h-6 w-6 text-ink-700" aria-hidden />
      <h3 className="display-wide mt-3 text-xl font-bold">Live Available-to-Sell (ATS) Stock.</h3>
      <p className="mt-1.5 text-[13.5px] leading-snug text-muted">
        Separates Physical SOH, Yard Held (awaiting collection/delivery), and Layby Locked so cashiers never oversell committed stock.
      </p>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <li key={r.name} className="rounded-xl border border-line bg-paper px-3 py-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-ink-900">
              <span className="truncate">{r.name}</span>
              <span className="rounded bg-ok/15 px-1.5 py-0.5 font-receipt text-[11px] font-bold text-ok">ATS: {r.ats}</span>
            </div>
            <div className="mt-1 flex justify-between font-receipt text-[11px] text-muted">
              <span>SOH: {r.soh}</span>
              <span>Yard Held: {r.yard}</span>
              <span>Layby: {r.layby}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Unified Enquiries: 12-Month GP Matrix, Bin Card, Debtors & Creditors 5-Bucket Aging. */
export function ReportCard() {
  const pts = [22, 30, 26, 38, 34, 46, 44, 58];
  const w = 240, h = 76;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - (v / 64) * h] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <div className="flex h-full flex-col rounded-xl3 bg-ink-800 p-6 text-white shadow-lift sm:p-7">
      <h3 className="display-wide text-xl font-bold">12-Mo GP Matrix, Bin Card & 5-Bucket Aging.</h3>
      <p className="mt-1.5 text-[13.5px] leading-snug text-ink-200">
        Inspect product Bin Cards, &ldquo;Customers Who Bought It&rdquo;, and full Debtors &amp; Creditors ledgers aged across 0–30 to 120+ Days.
      </p>
      <svg viewBox={`0 0 ${w} ${h + 6}`} className="mt-4 h-auto w-full" role="img" aria-label="12-month sales and gross profit trend">
        <defs><linearGradient id="rep-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFC72C" stopOpacity="0.4" /><stop offset="1" stopColor="#FFC72C" stopOpacity="0" /></linearGradient></defs>
        <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#rep-g)" />
        <path d={line} fill="none" stroke="#FFC72C" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={xy.at(-1)![0]} cy={xy.at(-1)![1]} r="4" fill="#FFC72C" />
      </svg>
      <div className="mt-auto grid grid-cols-5 gap-1 pt-3 text-center font-receipt text-[10px] text-ink-200">
        {["0-30d", "31-60d", "61-90d", "91-120d", "120+d"].map((b) => (
          <span key={b} className="rounded bg-white/10 py-1">{b}</span>
        ))}
      </div>
    </div>
  );
}
