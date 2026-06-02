# Design System — Warm Parchment UI

Use this as a reference prompt when starting a new web project to reproduce this design exactly.

---

## The Prompt

> Design a web application using a warm parchment / kraft-paper aesthetic — not cold or clinical, not dark-mode tech. The visual feel should evoke a well-organized financial notebook: cream backgrounds, warm brown text hierarchy, clean white cards with soft borders, and restrained use of color only for semantic meaning (green for gains, amber for caution, red for losses). Use Tailwind CSS. Use Lucide icons throughout. No drop shadows on cards — borders only. No heavy gradients. Generous whitespace but data-dense when needed.
>
> **Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Lucide React.

---

## Color Palette

Every color must come from this palette. Do not introduce new colors.

### Backgrounds
| Role | Value |
|------|-------|
| Page background | `#f7f2eb` |
| Card / panel background | `white` |
| Hover / subtle fill | `#ede8df` |
| Modal section fill | `#f0ebe1` |

### Text
| Role | Class / Value |
|------|---------------|
| Primary (headings, key numbers) | `text-[#1c1612]` |
| Headings (nav, card titles) | `text-[#2d2218]` |
| Body / labels | `text-[#4a3d33]` |
| Secondary / subdued labels | `text-[#6e5f52]` |
| Muted / metadata | `text-[#9e9087]` |
| Very muted / timestamps | `text-[#b8ad9e]` |

### Borders
| Role | Value |
|------|-------|
| Card borders, dividers | `#e5ddd3` |
| Input borders, secondary UI | `#d4c9bc` |
| Focus / accent ring | `#da7756` (warm orange-red) |

### Semantic Colors (Tailwind)
| Meaning | Text | Background | Border |
|---------|------|-----------|--------|
| Positive / gain | `text-emerald-400` | `bg-emerald-50` | `border-emerald-400` |
| Gain (darker text) | `text-emerald-500` or `text-emerald-600` | — | — |
| Warning / caution | `text-amber-300` or `text-amber-400` | `bg-amber-50` | `border-amber-400` |
| Caution label | `text-amber-700` | — | — |
| Negative / loss | `text-red-400` | — | — |
| Loss label | `text-red-500` or `text-red-600` | — | — |
| Primary action | `bg-blue-600`, hover `bg-blue-500` | — | — |

---

## Typography

All text is tight and information-dense. Never use large decorative type.

| Role | Classes |
|------|---------|
| Category / section label | `text-[10px] text-[#9e9087] uppercase tracking-wide` |
| Badge / tag text | `text-[10px] font-medium` |
| Helper / timestamp | `text-[10px] text-[#b8ad9e]` |
| Input label | `text-[10px] text-[#9e9087] uppercase tracking-wide mb-1` |
| Body, form fields, nav links | `text-sm` (14px) |
| Card body text | `text-sm font-semibold text-[#4a3d33]` |
| Item name / title | `text-base font-bold text-[#1c1612]` |
| Large metric number | `text-2xl font-bold` |
| Modal / section heading | `text-sm font-semibold text-[#1c1612]` |

---

## Layout

### Page Shell
```jsx
<div className="flex min-h-screen flex-col bg-[#f7f2eb]">
  <header>...</header>
  <main className="flex-1 px-3 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-5 max-w-5xl mx-auto w-full">
    ...
  </main>
</div>
```

### Header / Nav Bar
```jsx
<header className="flex items-center justify-between border-b border-[#e5ddd3] px-3 py-2 sm:px-6 sm:py-3">
  {/* Left: logo + nav */}
  <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
    <Icon className="h-5 w-5 text-blue-400 flex-shrink-0" />
    <span className="text-sm sm:text-base font-semibold text-[#1c1612] whitespace-nowrap">App Name</span>
    <nav className="ml-1 sm:ml-3 flex items-center gap-0.5 overflow-x-auto">
      {/* inactive nav link */}
      <button className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0">
        <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">Label</span>
      </button>
      {/* active nav link */}
      <span className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#4a3d33] bg-[#ede8df] flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-orange-400" /><span className="hidden sm:inline">Active</span>
      </span>
    </nav>
  </div>
  {/* Right: controls */}
  <div className="flex items-center gap-3 text-xs">...</div>
</header>
```

Notes:
- Nav labels are hidden on mobile (`hidden sm:inline`), icons always visible.
- Active page uses `bg-[#ede8df]` fill and `text-[#4a3d33]`. No underline, no border-bottom.
- Icon for the active page gets a semantic accent color (e.g. `text-orange-400` for real estate, `text-blue-400` for dashboard).

---

## Components

### Card
```jsx
<div className="rounded-xl border border-[#e5ddd3] bg-white overflow-hidden">
  {/* Optional card header */}
  <div className="px-5 py-4 border-b border-[#e5ddd3]">
    <h2 className="text-sm font-semibold text-[#1c1612]">Title</h2>
  </div>
  {/* Card body */}
  <div className="px-5 py-4">
    ...
  </div>
</div>
```

### Metric Grid (summary stats across top of a page)
```jsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
  <div className="rounded-xl border border-[#e5ddd3] bg-white px-4 py-3">
    <div className="text-xs text-[#9e9087]">Label</div>
    <div className="text-2xl font-bold text-[#1c1612] mt-1">$1.2M</div>
    <div className="text-xs text-[#b8ad9e] mt-0.5">sub-label</div>
  </div>
</div>
```
- Metric numbers use semantic color when they carry meaning: `text-emerald-400` for positive, `text-red-400` for negative, `text-amber-400` for caution.
- Always include a muted sub-label beneath the number.

### Section Label + Value Row
```jsx
<div>
  <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">LABEL</div>
  <div className="text-sm font-semibold text-[#4a3d33] mt-0.5">Value</div>
  <div className="text-[10px] text-[#b8ad9e]">helper text</div>
</div>
```

### Badge / Tag
```jsx
{/* Status badge — semantic color per state */}
<span className="text-[10px] rounded-full border px-2 py-0.5 font-medium border-emerald-400 bg-emerald-50 text-emerald-700">
  Owned
</span>
<span className="text-[10px] rounded-full border px-2 py-0.5 font-medium border-amber-400 bg-amber-50 text-amber-700">
  Mortgage
</span>
{/* Neutral info badge (e.g. currency) */}
<span className="text-[10px] rounded border border-[#d4c9bc] bg-white px-2 py-0.5 text-[#6e5f52]">
  SGD
</span>
```

### Buttons
```jsx
{/* Primary action */}
<button className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors">
  <Icon className="h-3.5 w-3.5" /> Action
</button>

{/* Secondary / outline */}
<button className="rounded-lg border border-[#d4c9bc] px-4 py-2 text-xs text-[#6e5f52] hover:bg-[#ede8df] transition-colors">
  Cancel
</button>

{/* Icon-only action (edit, delete) */}
<button className="rounded p-1.5 text-[#b8ad9e] hover:text-[#4a3d33] hover:bg-[#ede8df] transition-colors">
  <Edit2 className="h-3.5 w-3.5" />
</button>
{/* Destructive icon */}
<button className="rounded p-1.5 text-[#b8ad9e] hover:text-red-400 hover:bg-[#ede8df] transition-colors">
  <Trash2 className="h-3.5 w-3.5" />
</button>

{/* Add button in header */}
<button className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] bg-white px-3 py-1.5 text-[#4a3d33] hover:bg-[#ede8df] transition-colors">
  <Plus className="h-3.5 w-3.5" /> Add Item
</button>
```

### Form Input
```jsx
{/* Label */}
<label className="block text-[10px] text-[#9e9087] uppercase tracking-wide mb-1">Field Name</label>
{/* Input */}
<input
  className="w-full rounded bg-white border border-[#d4c9bc] px-2 py-1.5 text-sm text-[#2d2218] placeholder-zinc-600 focus:outline-none focus:border-[#da7756]"
/>
{/* Select */}
<select className="w-full rounded bg-white border border-[#d4c9bc] px-2 py-1.5 text-sm text-[#2d2218] focus:outline-none focus:border-[#da7756]">
  ...
</select>
```

### Segmented Toggle (e.g. ownership type)
```jsx
<div className="flex gap-3">
  {options.map(opt => (
    <button
      key={opt}
      onClick={() => setSelected(opt)}
      className={`flex-1 rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
        selected === opt
          ? 'border-emerald-700 bg-emerald-50 text-emerald-300'  // active: use semantic color
          : 'border-[#d4c9bc] text-[#9e9087] hover:border-[#da7756]'
      }`}
    >
      {opt}
    </button>
  ))}
</div>
```

### Modal / Drawer
```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
  <div className="w-full max-w-2xl rounded-2xl border border-[#d4c9bc] bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
    {/* Header */}
    <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5ddd3]">
      <h2 className="text-sm font-semibold text-[#1c1612]">Modal Title</h2>
      <button onClick={onClose} className="text-[#b8ad9e] hover:text-[#4a3d33]">
        <X className="h-4 w-4" />
      </button>
    </div>
    {/* Body */}
    <div className="px-6 py-5 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        ...
      </div>
    </div>
    {/* Footer */}
    <div className="flex gap-2 px-6 py-4 border-t border-[#e5ddd3]">
      <button className="...primary...">Save</button>
      <button className="...secondary...">Cancel</button>
    </div>
  </div>
</div>
```

### Nested Sub-section inside a Card (e.g. mortgage details)
```jsx
<div className="px-5 py-3 border-t border-[#e5ddd3] bg-[#f0ebe1]/60 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
  {/* Use amber tones for cautionary sub-data */}
  <div>
    <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">Sub Label</div>
    <div className="text-xs font-semibold text-amber-400 mt-0.5">Value</div>
  </div>
</div>
```

### Clickable Section Card (with navigate arrow)
```jsx
<div className="rounded-xl border border-[#e5ddd3] bg-white overflow-hidden">
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between px-5 py-3 border-b border-[#e5ddd3] hover:bg-[#ede8df]/40 transition-colors"
  >
    <div className="flex items-center gap-2 text-sm font-semibold text-[#2d2218]">
      <Icon className="h-4 w-4" /> Section Title
    </div>
    <ChevronRight className="h-4 w-4 text-[#b8ad9e]" />
  </button>
  <div className="px-5 divide-y divide-[#e5ddd3]">
    {/* rows */}
  </div>
</div>
```

### Data Row (label + value in a list)
```jsx
<div className="flex items-center justify-between py-2">
  <div>
    <div className="text-sm text-[#4a3d33] font-medium">Label</div>
    <div className="text-xs text-[#b8ad9e] mt-0.5">sub-label</div>
  </div>
  <div className="text-sm font-semibold text-[#1c1612]">Value</div>
</div>
```

### Empty State
```jsx
<div className="rounded-xl border border-[#e5ddd3] bg-white px-6 py-16 text-center">
  <Icon className="h-10 w-10 text-[#c8c0b5] mx-auto mb-4" />
  <p className="text-base font-semibold text-[#4a3d33] mb-2">Nothing here yet</p>
  <p className="text-sm text-[#9e9087] mb-6">Descriptive helper text explaining what to add.</p>
  <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
    <Plus className="h-4 w-4" /> Add First Item
  </button>
</div>
```

---

## Mobile & Responsive Patterns

Everything is mobile-first. Desktop enhancements use the `sm:` breakpoint only — no `md:`, `lg:`, or larger breakpoints. If it works at 375px, it works everywhere.

---

### Setup: globals.css

Two global rules that apply site-wide. Add these to `globals.css` before any component styles:

```css
/* Thin, warm-toned scrollbars — matches the parchment palette */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #d4c9bc; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #c4bdb0; }
```

Tailwind v4 provides `scrollbar-hide` as a built-in utility. For v3, install `tailwindcss-scrollbar-hide` and add it to plugins.

---

### Header / Nav — Mobile Behavior

The header is the hardest surface to get right on mobile. Follow this pattern exactly:

```jsx
<header className="flex items-center justify-between border-b border-[#e5ddd3] px-3 py-2 sm:px-6 sm:py-3">
  {/* LEFT: logo + scrollable nav — min-w-0 lets it shrink so the right controls don't get pushed off */}
  <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
    <Icon className="h-5 w-5 text-blue-400 flex-shrink-0" />
    {/* App name: never wraps, slightly smaller on mobile */}
    <span className="text-sm sm:text-base font-semibold text-[#1c1612] whitespace-nowrap">App Name</span>

    {/* Nav: scrolls horizontally on mobile, scrollbar is invisible */}
    <nav className="ml-1 sm:ml-3 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">

      {/* Inactive nav item: tighter padding on mobile, label hidden */}
      <button className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0">
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Full Label</span>
      </button>

      {/* Active nav item: same sizing, filled background */}
      {/* Option A — label fully hidden on mobile (icon only) */}
      <span className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#4a3d33] bg-[#ede8df] flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-orange-400" />
        <span className="hidden sm:inline">Active Page</span>
      </span>

      {/* Option B — show abbreviated label on mobile (for pages where icon alone is ambiguous) */}
      <span className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 text-xs font-medium text-[#4a3d33] bg-[#ede8df] whitespace-nowrap flex-shrink-0">
        <span className="hidden sm:inline">Dashboard</span>
        <span className="sm:hidden text-[10px]">Dash</span>
      </span>

    </nav>
  </div>

  {/* RIGHT: action controls — flex-shrink-0 prevents them from being compressed */}
  <div className="flex items-center gap-2 flex-shrink-0">
    <button className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] bg-white px-3 py-1.5 text-xs text-[#4a3d33] hover:bg-[#ede8df] transition-colors">
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Button Label</span>
    </button>
  </div>
</header>
```

Key rules for the header:
- `min-w-0` on the left flex container — without this, long app names push right controls off-screen.
- `flex-shrink-0` on every nav item — prevents items from collapsing when the nav is tight.
- `whitespace-nowrap` on the app name — never allow it to wrap onto two lines.
- `overflow-x-auto scrollbar-hide` on `<nav>` — swipeable on mobile, no scrollbar visible.
- Button labels: always `hidden sm:inline`. Icon is the only visible element on mobile.
- Active page: use Option A (icon only) when the icon is unambiguous; use Option B (abbreviated text) when it might be confused with another icon.

---

### Sub-header Status Bar

A second row below the header for metadata, filters, or status chips. On mobile it wraps naturally:

```jsx
<div className="flex flex-wrap items-center gap-2 border-t border-[#e5ddd3]/60 px-3 py-2 sm:px-6 text-xs text-[#9e9087]">
  <span>Last updated: 2 min ago</span>
  <span className="text-[#d4c9bc]">·</span>
  <span>Live prices</span>
  {/* chips, filters, etc. */}
</div>
```

---

### Main Content Area

```jsx
<main className="flex-1 px-3 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-5 max-w-5xl mx-auto w-full">
  ...
</main>
```

- Horizontal padding: `px-3` mobile → `px-6` desktop.
- Vertical padding: `py-4` mobile → `py-5` desktop.
- Section spacing: `space-y-4` mobile → `space-y-5` desktop.
- Max width `max-w-5xl` with `mx-auto w-full` — never full bleed on large screens.

---

### Metric / Summary Cards Grid

Always 2 columns on mobile, 4 on desktop:

```jsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
  <div className="rounded-xl border border-[#e5ddd3] bg-white px-4 py-3">
    <div className="text-xs text-[#9e9087]">Label</div>
    <div className="text-2xl font-bold text-[#1c1612] mt-1">$1.2M</div>
    <div className="text-xs text-[#b8ad9e] mt-0.5">sub-label</div>
  </div>
</div>
```

---

### Card Metrics Grid (inside a card, not a page-level summary)

2 columns on mobile, 4 on desktop, with asymmetric gap (wider horizontal, tighter vertical):

```jsx
<div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
  ...
</div>
```

---

### Hero Number (Net Worth / single big stat)

Scale the font size for the primary hero figure:

```jsx
<div className="rounded-2xl border border-[#d4c9bc] bg-white px-5 py-5 sm:px-8 sm:py-6">
  <div className="text-xs text-[#9e9087] uppercase tracking-wide mb-2">Net Worth</div>
  <div className="text-4xl sm:text-5xl font-bold text-[#1c1612]">$2.4M</div>
</div>
```

---

### Form Grids

Single-column on mobile, two-column on desktop. Full-width fields use `sm:col-span-2`:

```jsx
<div className="grid gap-4 sm:grid-cols-2">
  <label className="space-y-1.5">...</label>         {/* half-width on desktop */}
  <label className="space-y-1.5">...</label>         {/* half-width on desktop */}
  <label className="space-y-1.5 sm:col-span-2">...</label>  {/* full-width on desktop */}
</div>
```

---

### Card Item Row (name + actions)

Use `min-w-0` on the text container and `flex-shrink-0` on the action buttons to prevent the buttons from being pushed off on narrow screens:

```jsx
<div className="flex items-start justify-between gap-3">
  <div className="flex-1 min-w-0">
    <span className="text-base font-bold text-[#1c1612]">{item.name}</span>
    {/* long text that should truncate rather than overflow */}
    <p className="text-xs text-[#9e9087] mt-1 truncate">{item.notes}</p>
  </div>
  <div className="flex gap-1 flex-shrink-0">
    <button className="rounded p-1.5 text-[#b8ad9e] hover:text-[#4a3d33] hover:bg-[#ede8df] transition-colors">
      <Edit2 className="h-3.5 w-3.5" />
    </button>
    <button className="rounded p-1.5 text-[#b8ad9e] hover:text-red-400 hover:bg-[#ede8df] transition-colors">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  </div>
</div>
```

---

### Tag / Filter Lists

Use `flex flex-wrap gap-2` so tags wrap onto the next line rather than overflow:

```jsx
<div className="flex flex-wrap gap-2">
  <span className="text-[10px] rounded-full border px-2 py-0.5 font-medium border-emerald-400 bg-emerald-50 text-emerald-700">Tag One</span>
  <span className="text-[10px] rounded-full border px-2 py-0.5 font-medium border-amber-400 bg-amber-50 text-amber-700">Tag Two</span>
</div>
```

---

### Modals on Mobile

Modals use `max-h-[90vh] overflow-y-auto` so they scroll on short mobile screens. The backdrop uses `px-4` to give breathing room on small viewports:

```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
  <div className="w-full max-w-2xl rounded-2xl border border-[#d4c9bc] bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
    ...
  </div>
</div>
```

For tall scrollable content inside a non-modal panel (e.g. a list within a card):

```jsx
<div className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto">
  ...
</div>
```

---

### Touch Targets

Minimum tappable area is `py-1.5` for inline items and `p-1.5` for icon buttons. Never use `py-0.5` or `py-1` for interactive elements — they are too small to tap reliably on mobile.

| Element | Min classes |
|---------|-------------|
| Nav button | `px-2 py-1.5` |
| Icon button | `p-1.5` |
| Form input | `px-2 py-1.5` |
| Primary button | `px-4 py-2` |
| Secondary button | `px-4 py-2` |

---

### The Three Layout Guards

Always apply these three classes together when a flex row might be squeezed on mobile:

| Problem | Fix |
|---------|-----|
| Right side gets pushed off screen | `flex-shrink-0` on the right container |
| Text overflows its container | `min-w-0` on the left container + `truncate` on the text |
| App name wraps to two lines | `whitespace-nowrap` on the name element |

---

## Typography — Font

Use **Geist Sans** as the primary font, loaded via `next/font/google`. It renders cleanly at small sizes, which matters because this design uses `text-xs` and `text-[10px]` extensively.

```typescript
// app/layout.tsx
import { Geist, Geist_Mono } from "next/font/google";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
```

```css
/* globals.css */
body {
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
```

Monospace (`geistMono`) is used only for `<code>` elements inside system banners. Never use it for financial numbers — financial data uses the same Geist Sans, bolded.

---

## Financial Number Conventions

This is a financial UI. Every number displayed to the user must follow these exact conventions — inconsistency here feels broken immediately.

### Format function
```typescript
function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// → "1,234.56"
```

For compact display (cards, badges — not tables):
```typescript
function fmtCompact(n: number, sym: string): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${sym}${abs.toFixed(0)}`;
}
// → "$1.2M", "$450K", "$850"
```

### Sign prefix rule
Never rely on the number itself to show the sign. Manually render `+` for positive and `-` for negative using `Math.abs()` on the value:

```typescript
// Correct
`${value >= 0 ? '+' : '-'}$${fmt(Math.abs(value))}`   // "+$1,234.56" or "-$1,234.56"
`${value >= 0 ? '+' : ''}${fmt(value)}%`               // "+12.34%" or "-3.45%"

// Wrong — double-negative risk
`$${fmt(value)}`   // becomes "$-1234.56"
```

### The "unavailable" placeholder: `—`
When a value cannot be computed (live price not connected, data loading, missing data), show the **em dash `—`** not `0`, `N/A`, or `null`. This is the universal "not yet / not applicable" signal in this design:

```typescript
value={hasLivePrice ? `+$${fmt(amount)}` : '—'}
subValue={hasLivePrice ? `${fmt(pct)}%` : 'Live prices not connected'}
```

The em dash `—` is always `text-[#1c1612]` (same as other values). The sub-label below it explaining why data is missing uses `text-[#6e5f52]` or `text-[#9e9087]`.

### Three-state coloring (`positive: boolean | null`)
Metric values are one of three states. Encode this as `boolean | null`, not ad-hoc string comparisons:

| State | `positive` | Value color | Sub-label color |
|-------|-----------|-------------|-----------------|
| Positive / gain | `true` | `text-emerald-400` | `text-emerald-400` |
| Negative / loss | `false` | `text-red-400` | `text-red-400` |
| Neutral / N/A | `null` | `text-[#1c1612]` | `text-[#6e5f52]` |

```typescript
// In a MetricCard or any display component
const valueColor = positive === null ? 'text-[#1c1612]' : positive ? 'text-emerald-400' : 'text-red-400';
const subColor   = positive === null ? 'text-[#6e5f52]' : positive ? 'text-emerald-400' : 'text-red-400';
```

Neutral is NOT muted — `text-[#6e5f52]` is the second-darkest text color. Neutral just means the number has no directional meaning (e.g. total portfolio value, cash balance).

---

## Data States

Every surface that loads async data must handle four states. Never skip any of them.

### 1. Skeleton (loading, no cache)
```typescript
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#ede8df] ${className}`} />;
}

// Usage — match the height of the real content it replaces
{loading ? (
  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
) : (
  // real content
)}

// For a list of rows:
{loading ? (
  <div className="space-y-2">
    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
  </div>
) : (
  // real rows
)}
```

The skeleton color `bg-[#ede8df]` matches the hover background — it reads as a warm placeholder, not a cold gray bar.

**Cache-first pattern:** If you have a cached version of the data (e.g. localStorage), show it immediately and skip the skeleton entirely. Only show skeletons when there is truly nothing to show. This prevents the page from flashing blank → skeleton → real content.

### 2. Loading indicator (refresh / re-fetch with data visible)
When data is already showing but a refresh is in progress, spin the refresh icon — don't show skeletons over live data:

```jsx
<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
```

The button itself is not disabled during a silent refresh, but is disabled during a full load:
```jsx
<button disabled={loading} ...>
```

### 3. Empty state (loaded, no data)
See the **Empty State** component in the Components section above.

For a shorter empty state inside an existing card (no icon, just text):
```jsx
<p className="py-8 text-center text-sm text-[#9e9087]">
  No holdings yet. Add your first position to start tracking.
</p>
```

### 4. Unavailable / partial data
When data loaded but some values are missing (e.g. live price unavailable for a symbol), show `—` in the value field and a descriptive sub-label. Do not hide the card.

---

## Inline Messages

### Form validation error
Rendered below the form's action buttons, not inline with the field:
```jsx
{error && <p className="mt-4 text-sm text-red-400">{error}</p>}
```
No border, no background — just red text. Keep it to one line.

### System warning banner
A full-width banner inside `<main>`, above all content cards, for non-blocking issues (e.g. live prices unavailable):
```jsx
<div className="rounded-lg border border-amber-300 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
  Live prices are unavailable for SYMBOL. Values are estimated from cost basis.
  Check that <code className="mx-1 rounded bg-black/20 px-1 py-0.5">ENV_VAR</code> is configured.
</div>
```

Rules:
- Amber palette only — never red for a warning banner (red is for losses and destructive errors).
- Use `bg-amber-500/10` not a solid amber background — it should be subtle.
- `<code>` for env vars, CLI commands, or technical strings: `rounded bg-black/20 px-1 py-0.5`.
- Place it as the first child of `<main>`, before the metric cards.

---

## Animation

Only two animation utilities are used. Do not introduce others.

| Usage | Class |
|-------|-------|
| Skeleton placeholder | `animate-pulse` on `bg-[#ede8df]` |
| Refresh / fetch in progress | `animate-spin` on the `RefreshCw` icon |

No fade-in, slide-in, or page transitions. The design relies on instant renders with the cache-first pattern rather than animated loading states.

---

## Z-Index

| Layer | Class | Used for |
|-------|-------|----------|
| Modal backdrop + panel | `z-50` | All modals and drawers |
| Everything else | default (auto) | No other z-index is set |

Modal backdrops use `bg-black/70` for blocking/important modals (e.g. add position, edit allocation). Use `bg-black/60` for lighter overlays. Never go above `z-50`.

---

## Breakpoints Used

This design uses **only two breakpoints**: `sm` and `lg`. Never introduce `md`, `xl`, or `2xl`.

| Breakpoint | When it activates | What it's used for |
|-----------|------------------|--------------------|
| `sm` (640px) | Tablet / large phone | Nav labels, padding, grid columns, font sizes — everything in the Responsive section |
| `lg` (1024px) | Desktop | **Only** the main dashboard two-column layout |

The `lg:` breakpoint appears in exactly one pattern — the primary content area of the dashboard:
```jsx
<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
  <div>  {/* main column: positions, charts */}  </div>
  <div>  {/* sidebar: allocation, advisor chat */}  </div>
</div>
```

All other pages are single-column and never use `lg:`. Use it sparingly — only when a sidebar genuinely adds value at desktop widths.

---

## Icons

Always use Lucide React. Common mappings:
- Dashboard / portfolio: `TrendingUp`, `LayoutDashboard`
- AI advisor: `Brain`
- Retirement / savings: `PiggyBank`
- Real estate: `Home`
- Other assets: `Layers`
- Net worth summary: `Wallet`
- Add: `Plus`
- Edit: `Edit2`
- Delete: `Trash2`
- Close: `X`
- Confirm: `Check`
- Navigate / drill-down: `ChevronRight`
- Location: `MapPin`
- Gain indicator: `TrendingUp`
- Loss indicator: `TrendingDown`
- Property / building: `Building2`
- Vehicle: `Car`

Icon sizes: `h-3.5 w-3.5` in nav and buttons; `h-4 w-4` in cards; `h-5 w-5` in header logo; `h-10 w-10` in empty states.

---

## Rules to Always Follow

1. **No drop shadows on cards.** Borders only (`border border-[#e5ddd3]`).
2. **No gradients** except as very subtle overlays (`bg-[#f0ebe1]/60`).
3. **All transitions** on interactive elements: `transition-colors`.
4. **`text-[10px] uppercase tracking-wide`** for every category/section label — never use a larger font for these.
5. **Semantic color use only.** Blue for primary actions. Emerald for positive. Amber for caution. Red for negative. Never decorative.
6. **Warm accent on focus.** `focus:border-[#da7756]` on all inputs. Never blue focus rings.
7. **`rounded-xl`** for cards and metric tiles. **`rounded-lg`** for buttons and inputs. **`rounded-2xl`** for modals.
8. **Page max-width is `max-w-5xl mx-auto`** — never full-bleed content.
9. **Numbers are always `font-bold` or `font-semibold`.** Labels are `font-medium` at most.
10. **Currency formatting:** `$1.2M` for millions, `$450K` for thousands, `$850` for under one thousand. Always include the currency symbol.
