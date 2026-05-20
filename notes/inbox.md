## Handover — 2026-05-20

**From this session:**
Major search UX overhaul — grouped filter chips (same category collapses into one chip with +N), interactive candidate chips (click to edit/add filters from the card), last search banner with seed data and localStorage, auto re-ranking on chip changes, Tighten/Loosen controls (⌘]/⌘[) that adjust experience and last-active thresholds with the loading animation.

**Next steps:**
- [ ] "Tighter by default" — initial search should start with tighter criteria applied (the user mentioned this before we implemented tighten/loosen; define what the default tightness level should be)
- [ ] Location radius in tighten/loosen — currently only EXPERIENCE and LAST ACTIVE are adjustable; CITY/location radius would be a natural third dimension
- [ ] Persist active search state across page reload — the last search banner covers the "resume" case, but the current in-progress search (prompt + chips + results) still resets on refresh

---
