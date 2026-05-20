# Chip Drag-to-Reorder Design

**Date:** 2026-05-20
**Status:** Approved

## Overview

Allow users to drag filter chips in the `ChipBar` to reorder them by priority. That order is reflected in the candidate cards so recruiters can scan by their most important attribute first.

## Dependencies

Add three `@dnd-kit` packages:
- `@dnd-kit/core` — drag context and sensors
- `@dnd-kit/sortable` — `useSortable` hook and `SortableContext`
- `@dnd-kit/utilities` — `arrayMove` helper

## State

Add `categoryOrder: FilterCategory[]` to the main page component, initialized from the existing `CATEGORY_ORDER` keys in their default sequence:

```
["TITLE", "SKILL", "EXPERIENCE", "CITY", "WORK PREF", "INDUSTRY", "LANGUAGE", "LAST ACTIVE", "SENIORITY", "INFERRED"]
```

This replaces all three places that currently sort by the static `CATEGORY_ORDER` constant:
1. `ChipBar` chip list
2. `CandidateFilterChips` (candidate card chips)
3. Last-search banner chip list

The order persists across searches within a session — if the user sets SKILL as priority 1, it stays after running a new search.

## ChipBar changes

Wrap the chip list in `<DndContext sensors={sensors} onDragEnd={handleDragEnd}>` and `<SortableContext items={orderedCategories} strategy={horizontalListSortingStrategy}>`.

Introduce a thin `SortableChipWrapper` component that calls `useSortable({ id: category })` and renders the existing `FilterChip` / `GroupedFilterChip` unchanged inside it. No changes to the chip components themselves.

The `AddFilterChip` is rendered outside `SortableContext` so it is never a drag target and always stays last.

`onDragEnd` calls `arrayMove` on `categoryOrder` and updates state in the page component via a new `onReorder` prop passed to `ChipBar`.

## Sensors / activation

```ts
const sensors = useSensors(
  useSensor(MouseSensor,  { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor,  { activationConstraint: { delay: 250, tolerance: 5 } }),
);
```

- **Mouse**: click-and-release opens the dropdown as before; click-and-move-5px begins drag.
- **Touch**: tap is a tap; hold 250ms begins drag.

No pointer-capture conflict with the dropdown trigger because the drag activates only after movement/delay.

## Visual feedback

- **Dragging chip slot**: renders at `opacity-30` in its original position (ghost placeholder).
- **DragOverlay**: renders a floating copy of the chip at full opacity with `shadow-lg`, following the cursor.
- No grip icon — the distance/delay constraints make drag discoverable without cluttering chips that already have dropdown + dismiss controls.

## Candidate card changes

`CandidateFilterChips` receives `categoryOrder: FilterCategory[]` as a prop and sorts matched chips by index in that array instead of `CATEGORY_ORDER`. No other changes to the component.

## Last-search banner

Same change — sorted by `categoryOrder` rather than the static constant.

## What does not change

- `FilterChip`, `GroupedFilterChip`, `AddFilterChip` — internals untouched.
- `CandidateFilterChips` chip rendering logic — only the sort key changes.
- `CATEGORY_ORDER` const — kept as the initializer for `categoryOrder` state; no longer used for sorting at runtime.
- No reset on new search — priority order is session-persistent.
