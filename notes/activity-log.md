## 2026-05-20 | Session Wrap-Up (5)

**Version:** v1.7.0
**Commits:**
- feat: hero header, near-miss panel with try-without chips, sidebar polish, and hard filter matching for tighten/loosen

Polish and zero-results intelligence session. Removed the breadcrumb bar and sidebar drawer toggle from the dashboard layout, and stripped the sidebar rail's dividing border and grey background for a cleaner chrome-free look. Added a hero header to the search page ("FIND CANDIDATES / Who are you looking for?") that appears only in the idle state. Fixed tighten/loosen so the result count actually changes — `rerunResults` and the chip-edit `useEffect` now apply `candidateMatchesFilter` as a hard gate alongside scoring. Built a full zero-results experience: a `ZeroResultsPanel` replaces the empty-state card when matches = 0, showing a "0 perfect matches — N candidates are 1 criterion away" banner, "Try without" chips per filter with a live +N candidate count, and a 2-column near-miss grid of candidates who miss exactly one criterion — each card shows a "MISSED BY" label and ✓/✗ chips with actual/required values (e.g. `YEARS · 4 / 5+`, `CITY · Munich / Berlin`).

---

## 2026-05-20 | Session Wrap-Up (4)

**Version:** v1.6.0
**Commits:**
- feat: sort dropdown and quick filter toggle for search results
- feat: view toggles, rank badges, AI summary dialog, semantic skill tags, and bookmark on search results

Heavy UI session on the search results area. Added a sort dropdown (Relevance / Match score / Experience / Name) and a segmented Top Pick / Top 3 / Top 5 quick filter toggle. Added a list / table / grid view switcher with icon buttons. Rank badges (Top Pick with star, Top 3, Top 5) appear on candidates in all three views. A purple "Summarise" button triggers an AI Analysis dialog per candidate with an overview, strengths, considerations, and a recommendation — all template-generated from the candidate's real data. Skill badges in table and grid views use semantic green colouring for matched skills. A bookmark toggle button sits next to the match score. Manually selecting a filter chip value now confirms it (turns white). Card group py-0 to remove default vertical padding.

---

## 2026-05-20 | Session Wrap-Up (3)

**Version:** v1.4.0
**Commits:**
- docs: add chip drag-reorder design spec
- docs: add chip drag-reorder implementation plan
- chore: install @dnd-kit/core, sortable, utilities
- feat: thread categoryOrder state through search page
- feat: sort candidate card chips by user-defined categoryOrder
- feat: add dnd-kit imports for drag-to-reorder
- fix: restore onReorder to ChipBar and correct indexOf sort pattern
- feat: drag-to-reorder filter chips with @dnd-kit, reflect order in candidate cards
- refactor: remove dead CATEGORY_ORDER const, wrap handleReorder in useCallback

Added drag-to-reorder for filter chips. Users hold and drag a chip in the chip bar to set priority order; the order persists across searches in the session. Candidate cards and the last-search banner both respect the same `categoryOrder` array, so the most important attribute is always leftmost for quick scanning. Used @dnd-kit with a `distance: 5` mouse sensor (click still opens dropdowns) and `delay: 250ms` touch sensor. A `DragOverlay` provides a shadow-elevated ghost following the cursor while the original slot fades to 30% opacity. Went through a full brainstorm → design spec → plan → subagent-driven execution cycle.

---

## 2026-05-20 | Session Wrap-Up (2)

**Version:** v1.3.0
**Commits:**
- feat: overhaul search UX with grouped chips, last search banner, and filter interactivity
- feat: add tighten/loosen controls with ⌘[/⌘] keyboard shortcuts and results re-animation

Heavy UX session on the candidate search page. Grouped same-category filter chips in both the chip bar and candidate cards (2 max + +N), made candidate chips interactive (click to edit via dropdown), greyed out active values in the Add filter menu, added a last search banner with localStorage persistence and a seed for first-open, added auto re-ranking when chips change, embedded the Search button inside the textarea, updated the filter criteria to match product spec (added Last active, removed Seniority from the menu), added a green border on >90% match cards, removed action buttons from cards, and shipped Tighten/Loosen controls with ⌘]/⌘[ shortcuts that adjust experience and last-active thresholds with the existing loading animation.

---

## 2026-05-20 | Session Wrap-Up

**Version:** v1.1.0
**Commits:** feat: build live candidate search with filter chips, prompt sync, and match highlighting

Built out the full live search UX on the `/search` page: staged loading (prompt highlights → chip extraction → candidate results) with spinner animations, a yellow chip bar for extracted filters that syncs bidirectionally with the prompt text, per-chip editing via dropdown, manual filter addition, green/red candidate skill matching against active filters, summary text highlighting, and always-present location/experience chips sorted by a fixed category order. Filter categories expanded to include Seniority, Experience, and Language. The prompt and chip bar are kept in sync at all times — adding, changing, or removing a chip updates the prompt text at the correct character position.
