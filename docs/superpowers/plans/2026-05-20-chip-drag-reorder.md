# Chip Drag-to-Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag filter chips in the ChipBar to set a priority order that is reflected in the candidate card chips.

**Architecture:** Add `categoryOrder: FilterCategory[]` state to the page component; replace all three static `CATEGORY_ORDER` sort sites with an index lookup against this array; wrap the ChipBar chip list in @dnd-kit sortable context with a thin `SortableChipWrapper` that leaves existing chip components untouched.

**Tech Stack:** @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, React 19, Next.js App Router

> **Note:** No test suite is configured in this project (see CLAUDE.md). TDD steps are replaced with manual verification via `npm run dev`.

---

### Task 1: Install @dnd-kit packages

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the three @dnd-kit packages**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected output: three packages added with no peer-dep warnings (they support React 19).

- [ ] **Step 2: Verify the packages are resolvable**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors (just a clean exit or pre-existing errors unrelated to dnd-kit).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @dnd-kit/core, sortable, utilities"
```

---

### Task 2: Add `categoryOrder` state and plumb it to consumers

**Files:**
- Modify: `src/app/(dashboard)/search/page.tsx` — add state, handler, and update three call sites

This task wires the new `categoryOrder` prop through without yet implementing DnD. The page will still sort correctly after this task (using the initial default order).

- [ ] **Step 1: Import `arrayMove` at the top of the file**

In `src/app/(dashboard)/search/page.tsx`, add to the existing imports:

```tsx
import { arrayMove } from "@dnd-kit/sortable";
```

- [ ] **Step 2: Add `categoryOrder` state after the existing state declarations**

Find the block of `useState` calls in the page component (around the `prompt`, `filters`, `results` declarations) and add:

```tsx
const DEFAULT_CATEGORY_ORDER: FilterCategory[] = [
  "TITLE", "SKILL", "EXPERIENCE", "CITY",
  "WORK PREF", "INDUSTRY", "LANGUAGE", "LAST ACTIVE", "SENIORITY", "INFERRED",
];
const [categoryOrder, setCategoryOrder] = useState<FilterCategory[]>(DEFAULT_CATEGORY_ORDER);
```

Place the const outside the component (alongside `CATEGORY_ORDER` at line ~138), and the `useState` inside the component body.

- [ ] **Step 3: Add the reorder handler inside the component**

After the `categoryOrder` useState line, add:

```tsx
function handleReorder(activeId: FilterCategory, overId: FilterCategory) {
  setCategoryOrder((prev) => {
    const from = prev.indexOf(activeId);
    const to = prev.indexOf(overId);
    return from === -1 || to === -1 ? prev : arrayMove(prev, from, to);
  });
}
```

- [ ] **Step 4: Pass `categoryOrder` + `onReorder` to ChipBar**

Find the `<ChipBar ...>` JSX (around line 1091) and add two props:

```tsx
<ChipBar
  filters={filters}
  confirmed={confirmed}
  categoryOrder={categoryOrder}
  onReorder={handleReorder}
  onDismiss={handleDismissFilter}
  onConfirm={(id) => setFilters((f) => f.map((x) => x.id === id ? { ...x, confirmed: true } : x))}
  onUpdate={handleUpdate}
  onAdd={handleAddFilter}
  onConfirmAll={() => { setFilters((f) => f.map((x) => ({ ...x, confirmed: true }))); setConfirmed(true); }}
  onDismissAll={() => setFilters([])}
/>
```

- [ ] **Step 5: Pass `categoryOrder` to `LastSearchBanner`**

Find the `<LastSearchBanner ...>` JSX and add the prop:

```tsx
<LastSearchBanner
  lastSearch={lastSearch}
  categoryOrder={categoryOrder}
  onResume={handleResume}
/>
```

- [ ] **Step 6: Pass `categoryOrder` to `CandidateFilterChips` in the results list**

Find the `<CandidateFilterChips ...>` JSX (around line 1207) and add the prop:

```tsx
<CandidateFilterChips
  filters={filters}
  candidate={candidate}
  categoryOrder={categoryOrder}
  onAdd={handleAddFilter}
  onDismiss={handleDismissFilter}
/>
```

- [ ] **Step 7: Commit (will have TS errors until Tasks 3–4 update the component signatures — that's fine)**

```bash
git add src/app/(dashboard)/search/page.tsx
git commit -m "feat: thread categoryOrder state through search page"
```

---

### Task 3: Update `CandidateFilterChips` to sort by `categoryOrder`

**Files:**
- Modify: `src/app/(dashboard)/search/page.tsx` — `CandidateFilterChips` function

- [ ] **Step 1: Add `categoryOrder` to the component props**

Find the `CandidateFilterChips` function signature (line ~143) and add the prop:

```tsx
function CandidateFilterChips({
  filters,
  candidate,
  categoryOrder,
  onAdd,
  onDismiss,
}: {
  filters: ExtractedFilter[];
  candidate: Candidate;
  categoryOrder: FilterCategory[];
  onAdd: (filter: ExtractedFilter) => void;
  onDismiss: (id: string) => void;
}) {
```

- [ ] **Step 2: Replace the static `CATEGORY_ORDER` sort with a `categoryOrder` index lookup**

Find the `grouped` computation (line ~156–161):

```tsx
const grouped = Object.entries(
  filters.reduce<Partial<Record<FilterCategory, ExtractedFilter[]>>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {})
).sort(([a], [b]) => (CATEGORY_ORDER[a as FilterCategory] ?? 99) - (CATEGORY_ORDER[b as FilterCategory] ?? 99));
```

Replace the `.sort(...)` call with:

```tsx
const grouped = Object.entries(
  filters.reduce<Partial<Record<FilterCategory, ExtractedFilter[]>>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {})
).sort(([a], [b]) => {
  const ai = categoryOrder.indexOf(a as FilterCategory);
  const bi = categoryOrder.indexOf(b as FilterCategory);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
});
```

- [ ] **Step 3: Verify TypeScript is happy**

```bash
npx tsc --noEmit 2>&1 | grep -i "error"
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/search/page.tsx
git commit -m "feat: sort candidate card chips by user-defined categoryOrder"
```

---

### Task 4: Update `LastSearchBanner` to sort by `categoryOrder`

**Files:**
- Modify: `src/app/(dashboard)/search/page.tsx` — `LastSearchBanner` function

- [ ] **Step 1: Add `categoryOrder` to `LastSearchBanner` props**

Find the `LastSearchBanner` function signature (line ~727):

```tsx
function LastSearchBanner({
  lastSearch,
  categoryOrder,
  onResume,
}: {
  lastSearch: LastSearch;
  categoryOrder: FilterCategory[];
  onResume: () => void;
}) {
```

- [ ] **Step 2: Replace the static sort inside `LastSearchBanner`**

Find the `.sort(([a], [b]) => (CATEGORY_ORDER[a as FilterCategory] ?? 99) - ...)` at line ~750 and replace with:

```tsx
.sort(([a], [b]) => {
  const ai = categoryOrder.indexOf(a as FilterCategory);
  const bi = categoryOrder.indexOf(b as FilterCategory);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
})
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i "error"
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/search/page.tsx
git commit -m "feat: sort last-search banner chips by categoryOrder"
```

---

### Task 5: Wire @dnd-kit into `ChipBar` with `SortableChipWrapper`

**Files:**
- Modify: `src/app/(dashboard)/search/page.tsx` — `ChipBar` function + new `SortableChipWrapper` component

This is the main task. It adds drag-and-drop to the chip bar.

- [ ] **Step 1: Add dnd-kit imports to the top of the file**

Add these imports alongside the existing React/lucide imports:

```tsx
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

- [ ] **Step 2: Add the `SortableChipWrapper` component**

Place this new component directly above the `ChipBar` function definition:

```tsx
function SortableChipWrapper({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn("touch-none", isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Update the `ChipBar` function signature to accept `categoryOrder` and `onReorder`**

Find the `ChipBar` function (line ~566) and update its props interface:

```tsx
function ChipBar({
  filters,
  confirmed,
  categoryOrder,
  onReorder,
  onDismiss,
  onConfirm,
  onUpdate,
  onAdd,
  onConfirmAll,
  onDismissAll,
}: {
  filters: ExtractedFilter[];
  confirmed: boolean;
  categoryOrder: FilterCategory[];
  onReorder: (activeId: FilterCategory, overId: FilterCategory) => void;
  onDismiss: (id: string) => void;
  onConfirm: (id: string) => void;
  onUpdate: (id: string, newValue: string) => void;
  onAdd: (filter: ExtractedFilter) => void;
  onConfirmAll: () => void;
  onDismissAll: () => void;
}) {
```

- [ ] **Step 4: Add `activeCategory` state + sensors inside `ChipBar`**

At the top of the `ChipBar` function body, add:

```tsx
const [activeCategory, setActiveCategory] = useState<FilterCategory | null>(null);

const sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
);
```

- [ ] **Step 5: Compute `orderedCategories` and `groupedByCategory` inside `ChipBar`**

Add these two derived values at the top of the `ChipBar` function body (before the return), replacing the old `Object.entries(...).sort(...)` chain:

```tsx
const groupedByCategory = filters.reduce<Partial<Record<FilterCategory, ExtractedFilter[]>>>((acc, f) => {
  (acc[f.category] ??= []).push(f);
  return acc;
}, {});

const orderedCategories = categoryOrder.filter((cat) => cat in groupedByCategory);
```

The old inline `Object.entries(...).sort(...).map(...)` inside the JSX will be removed in the next step.

- [ ] **Step 6: Replace the chip list `div` with a `DndContext` + `SortableContext` wrapped version**

Find the inner `<div className="flex flex-wrap gap-2">` (around line 612) and replace the entire block up to and including `<AddFilterChip .../>` with this:

```tsx
<DndContext
  sensors={sensors}
  onDragStart={({ active }: DragStartEvent) => setActiveCategory(active.id as FilterCategory)}
  onDragEnd={({ active, over }: DragEndEvent) => {
    setActiveCategory(null);
    if (over && active.id !== over.id) {
      onReorder(active.id as FilterCategory, over.id as FilterCategory);
    }
  }}
  onDragCancel={() => setActiveCategory(null)}
>
  <SortableContext
    items={orderedCategories}
    strategy={horizontalListSortingStrategy}
  >
    <div className="flex flex-wrap gap-2">
      {orderedCategories.map((category) => {
        const g = groupedByCategory[category];
        if (!g) return null;
        return (
          <SortableChipWrapper key={category} id={category}>
            {g.length === 1 ? (
              <FilterChip filter={g[0]} onDismiss={onDismiss} onConfirm={onConfirm} onUpdate={onUpdate} />
            ) : (
              <GroupedFilterChip filters={g} onDismiss={onDismiss} onConfirm={onConfirm} onUpdate={onUpdate} onAdd={onAdd} />
            )}
          </SortableChipWrapper>
        );
      })}
      <AddFilterChip onAdd={onAdd} activeFilters={filters} />
    </div>
  </SortableContext>

  <DragOverlay>
    {activeCategory && (() => {
      const g = groupedByCategory[activeCategory];
      if (!g) return null;
      return g.length === 1 ? (
        <div className="shadow-lg rounded-full opacity-100">
          <FilterChip filter={g[0]} onDismiss={() => {}} onConfirm={() => {}} onUpdate={() => {}} />
        </div>
      ) : (
        <div className="shadow-lg rounded-full opacity-100">
          <GroupedFilterChip filters={g} onDismiss={() => {}} onConfirm={() => {}} onUpdate={() => {}} onAdd={() => {}} />
        </div>
      );
    })()}
  </DragOverlay>
</DndContext>
```

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i "error"
```

Expected: no errors.

- [ ] **Step 8: Start the dev server and manually verify**

```bash
npm run dev
```

Open [http://localhost:3000/search](http://localhost:3000/search), run a search, then:
1. Click a chip → dropdown opens (no drag triggered).
2. Click-and-drag a chip 5px+ → drag begins; original chip fades to 30% opacity; overlay chip follows cursor with shadow.
3. Drop onto another chip → chips swap positions.
4. Verify candidate cards reflect the new chip order.
5. Run a new search → chip order is preserved.
6. Touch (if available): long-press 250ms → drag begins.

- [ ] **Step 9: Commit**

```bash
git add src/app/(dashboard)/search/page.tsx
git commit -m "feat: drag-to-reorder filter chips with @dnd-kit, reflect order in candidate cards"
```
