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
