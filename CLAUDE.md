# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (default port 3000)
npm run build     # production build
npm run lint      # ESLint
npx tsc --noEmit  # type-check without emitting
```

No test suite is configured.

## Architecture

This is a **recruitment prototype** — dummy data only, no database or API calls.

### Stack
- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- **shadcn/ui on Base UI** (not Radix UI) — `@base-ui/react` is the primitive layer

### Route structure

```
src/app/
  page.tsx                      → redirects to /candidates
  layout.tsx                    → root layout (TooltipProvider, Geist fonts)
  (dashboard)/
    layout.tsx                  → SidebarProvider + AppSidebar + SidebarInset + AppBreadcrumb
    candidates/page.tsx         → filterable candidates table ("use client")
    search/page.tsx             → prompt-based candidate search ("use client")
```

### Key conventions

**Base UI vs Radix — critical difference.** All shadcn components here use Base UI primitives, not Radix. This means:
- Use `render={<Component />}` instead of `asChild` — `asChild` does not exist on these components
- `Select.Root`'s `onValueChange` receives `string | null`, not `string` — always null-coalesce: `(v) => setState(v ?? "default")`
- Trigger components (e.g. `DropdownMenuTrigger`) accept `render={<Button ... />}` to customise the trigger element

**Sidebar.** Uses `collapsible="icon"` — collapsed by default (`defaultOpen={false}`). Text labels in the header/footer use `group-data-[collapsible=icon]:hidden` to hide when icon-only. `SidebarMenuButton` items collapse automatically via built-in CSS; no extra classes needed on the icons or text spans inside them.

**No colours beyond semantic tokens.** Use only `default`, `secondary`, `destructive`, and `outline` badge/button variants. No custom colour values or gradients.

**Dummy data lives in `src/lib/data.ts`** — 15 `Candidate` objects plus `SUGGESTED_PROMPTS`. All filtering and scoring is computed client-side in the page components (`useMemo`/`useCallback`).

**Breadcrumbs** are rendered in the dashboard layout header via `AppBreadcrumb` (reads `usePathname`). Do not add per-page breadcrumb markup.
