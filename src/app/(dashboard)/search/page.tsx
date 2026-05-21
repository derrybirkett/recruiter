"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ArrowRight, MapPin, Clock, Pencil, X, Loader2, Plus, Briefcase, Star, Home, Building2, Languages, Sparkles, Check, TrendingUp, CalendarDays, Bookmark, List, Table2, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  extractFilters,
  buildSegments,
  type ExtractedFilter,
  type FilterCategory,
} from "@/lib/extract-filters";
import { CANDIDATES, SUGGESTED_PROMPTS, type Candidate } from "@/lib/data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { arrayMove } from "@dnd-kit/sortable";
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

// ─── scoring ─────────────────────────────────────────────────────────────────

interface ScoredCandidate {
  candidate: Candidate;
  score: number;
  matchedTerms: string[];
}

function extractTerms(prompt: string): string[] {
  const stopwords = new Set([
    "a", "an", "the", "and", "or", "with", "for", "in", "at", "to",
    "of", "on", "is", "are", "be", "years", "year", "experience",
    "developer", "engineer", "based", "looking", "need", "want", "open",
  ]);
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopwords.has(t));
}

function scoreCandidate(candidate: Candidate, terms: string[]): ScoredCandidate {
  const matchedTerms: string[] = [];
  let score = 0;
  const searchable = [
    candidate.name, candidate.role, candidate.location,
    ...candidate.skills, candidate.summary,
  ].join(" ").toLowerCase();

  for (const term of terms) {
    if (searchable.includes(term)) {
      matchedTerms.push(term);
      if (candidate.skills.some((s) => s.toLowerCase().includes(term))) score += 20;
      else if (candidate.role.toLowerCase().includes(term)) score += 15;
      else if (candidate.location.toLowerCase().includes(term)) score += 8;
      else score += 5;
    }
  }
  score += candidate.matchScore * 0.3;
  return { candidate, score, matchedTerms };
}

// ─── summary highlighting ─────────────────────────────────────────────────────

function highlightSummary(text: string, terms: string[]): React.ReactNode[] {
  if (!terms.length) return [<span key={0}>{text}</span>];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last)
      nodes.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    nodes.push(
      <mark key={key++} className="bg-yellow-100 dark:bg-yellow-900/40 rounded-sm px-0.5 not-italic">
        {match[0]}
      </mark>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>);
  return nodes;
}

// ─── candidate filter matching ────────────────────────────────────────────────

function candidateMatchesFilter(candidate: Candidate, filter: ExtractedFilter): boolean {
  const v = filter.value.toLowerCase();
  switch (filter.category) {
    case "SKILL":
      return candidate.skills.some(
        (s) => s.toLowerCase().includes(v) || v.includes(s.toLowerCase())
      );
    case "TITLE": {
      const keywords = v.split(/\s+/).filter((w) => w.length > 3);
      return keywords.some((w) => candidate.role.toLowerCase().includes(w));
    }
    case "CITY":
      return candidate.location.toLowerCase().includes(v.split(",")[0].trim());
    case "WORK PREF":
      return v.includes("remote") && candidate.location.toLowerCase() === "remote";
    case "SENIORITY":
      return (
        candidate.role.toLowerCase().includes(v) ||
        candidate.summary.toLowerCase().includes(v)
      );
    case "EXPERIENCE": {
      const plus = v.match(/(\d+)\+/);
      if (plus) return candidate.experienceYears >= parseInt(plus[1]);
      const range = v.match(/(\d+)[–\-](\d+)/);
      if (range) {
        const [, min, max] = range;
        return candidate.experienceYears >= parseInt(min) && candidate.experienceYears <= parseInt(max);
      }
      return false;
    }
    case "INFERRED": {
      const m = v.match(/(\d+)/);
      return m ? candidate.experienceYears >= parseInt(m[1]) : false;
    }
    case "LAST ACTIVE":
      return true; // no last-active field in dummy data — treat all as matching
    default:
      return false;
  }
}

const DEFAULT_CATEGORY_ORDER: FilterCategory[] = [
  "TITLE", "SKILL", "EXPERIENCE", "CITY",
  "WORK PREF", "INDUSTRY", "LANGUAGE", "LAST ACTIVE", "SENIORITY", "INFERRED",
];

function CandidateFilterChips({
  filters,
  candidate,
  onAdd,
  onDismiss,
  categoryOrder,
}: {
  filters: ExtractedFilter[];
  candidate: Candidate;
  onAdd: (filter: ExtractedFilter) => void;
  onDismiss: (id: string) => void;
  categoryOrder: FilterCategory[];
}) {
  const [expanded, setExpanded] = useState(false);

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

  const skillFilters = filters.filter((f) => f.category === "SKILL");
  const extraSkills = candidate.skills.filter(
    (skill) =>
      !skillFilters.some(
        (f) =>
          skill.toLowerCase().includes(f.value.toLowerCase()) ||
          f.value.toLowerCase().includes(skill.toLowerCase())
      )
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {grouped.map(([category, group]) => {
        const g = group!;
        const cat = category as FilterCategory;
        const anyMatch = g.some((f) => candidateMatchesFilter(candidate, f));
        const shown = g.slice(0, 2).map((f) => f.value).join(", ");
        const extra = g.length > 2 ? g.length - 2 : 0;
        const activeValues = new Set(g.map((f) => f.value));
        const availableOptions = (FILTER_VALUE_OPTIONS[cat] ?? []).filter((v) => !activeValues.has(v));

        return (
          <DropdownMenu key={category}>
            <DropdownMenuTrigger
              render={
                <button
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-75",
                    anyMatch
                      ? "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                      : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"
                  )}
                >
                  {anyMatch ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                  <span>{shown}</span>
                  {extra > 0 && <span className="opacity-60">+{extra}</span>}
                </button>
              }
            />
            <DropdownMenuContent>
              {g.map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => onDismiss(f.id)}>
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  {f.value}
                </DropdownMenuItem>
              ))}
              {availableOptions.map((value) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() =>
                    onAdd({
                      id: `chip-${Date.now()}-${Math.random()}`,
                      category: cat,
                      value,
                      matchedText: "",
                      confidence: "high",
                      confirmed: true,
                      start: 0,
                      end: 0,
                    })
                  }
                >
                  <span className="w-3.5 shrink-0" />
                  {value}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}

      {!filters.some((f) => f.category === "CITY") && (
        <div className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          {candidate.location}
        </div>
      )}
      {!filters.some((f) => f.category === "EXPERIENCE" || f.category === "INFERRED") && (
        <div className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          {candidate.experienceYears}y exp
        </div>
      )}

      {extraSkills.length > 0 && (
        expanded ? (
          <>
            {extraSkills.map((skill, i) => (
              <Badge
                key={skill}
                variant="secondary"
                className="text-xs font-normal animate-in fade-in-0 zoom-in-95 duration-150"
                style={{ animationDelay: `${i * 30}ms`, animationFillMode: "both" }}
              >
                {skill}
              </Badge>
            ))}
            <button
              onClick={() => setExpanded(false)}
              className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              less
            </button>
          </>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
          >
            +{extraSkills.length} skills
          </button>
        )
      )}
    </div>
  );
}

// ─── add filter ───────────────────────────────────────────────────────────────

const FILTER_VALUE_OPTIONS: Record<FilterCategory, string[]> = {
  TITLE:          ["Software Engineer", "Frontend Developer", "Backend Developer", "Full-stack Developer", "Engineering Manager", "Product Manager", "Product Designer", "Data Scientist", "DevOps Engineer"],
  SKILL:          ["React", "TypeScript", "Python", "Node.js", "GraphQL", "AWS", "Go", "Kubernetes", "Figma", "SQL"],
  EXPERIENCE:     ["0–1 yrs", "2–4 yrs", "5–7 yrs", "8–10 yrs", "10+ yrs"],
  CITY:           ["London", "New York", "Berlin", "Amsterdam", "Toronto", "Singapore", "Remote"],
  "WORK PREF":    ["Remote", "Hybrid", "On-site"],
  INDUSTRY:       ["FinTech", "HealthTech", "SaaS", "E-commerce", "AI / ML", "Enterprise", "Gaming"],
  LANGUAGE:       ["English", "Spanish", "French", "German", "Mandarin", "Portuguese", "Arabic"],
  "LAST ACTIVE":  ["Past week", "Past month", "Past 3 months", "Past 6 months"],
  SENIORITY:      [],
  INFERRED:       [],
};

const FILTER_OPTIONS: { category: FilterCategory; label: string; icon: React.ElementType }[] = [
  { category: "TITLE",       label: "Title",           icon: Briefcase    },
  { category: "SKILL",       label: "Skills",          icon: Star         },
  { category: "EXPERIENCE",  label: "Experience",      icon: CalendarDays },
  { category: "CITY",        label: "Location",        icon: MapPin       },
  { category: "WORK PREF",   label: "Work preference", icon: Home         },
  { category: "INDUSTRY",    label: "Industry",        icon: Building2    },
  { category: "LANGUAGE",    label: "Languages",       icon: Languages    },
  { category: "LAST ACTIVE", label: "Last active",     icon: Clock        },
];

function AddFilterChip({
  onAdd,
  activeFilters,
}: {
  onAdd: (filter: ExtractedFilter) => void;
  activeFilters: ExtractedFilter[];
}) {
  const activeValues = new Set(activeFilters.map((f) => f.value));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-foreground/40 px-3 py-1 text-xs hover:bg-foreground/5 transition-colors cursor-pointer">
            <Plus className="h-3 w-3" />
            <span className="font-medium">Add filter</span>
          </button>
        }
      />
      <DropdownMenuContent>
        {FILTER_OPTIONS.map(({ category, label, icon: Icon }) => (
          <DropdownMenuSub key={category + label}>
            <DropdownMenuSubTrigger>
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {FILTER_VALUE_OPTIONS[category].map((value) => {
                const isActive = activeValues.has(value);
                return (
                  <DropdownMenuItem
                    key={value}
                    onClick={() =>
                      !isActive &&
                      onAdd({
                        id: `manual-${Date.now()}-${Math.random()}`,
                        category,
                        value,
                        matchedText: "",
                        confidence: "high",
                        confirmed: false,
                        start: 0,
                        end: 0,
                      })
                    }
                    className={cn(isActive && "opacity-40 pointer-events-none")}
                  >
                    {value}
                    {isActive && <Check className="ml-auto h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── chip bar ─────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<FilterCategory, string> = {
  TITLE:          "TITLE",
  SKILL:          "SKILL",
  CITY:           "LOCATION",
  INDUSTRY:       "INDUSTRY",
  "WORK PREF":    "WORK PREF",
  LANGUAGE:       "LANGUAGE",
  SENIORITY:      "SENIORITY",
  EXPERIENCE:     "EXPERIENCE",
  "LAST ACTIVE":  "LAST ACTIVE",
  INFERRED:       "INFERRED · LOW CONF",
};

function FilterChip({
  filter,
  onDismiss,
  onConfirm,
  onUpdate,
}: {
  filter: ExtractedFilter;
  onDismiss: (id: string) => void;
  onConfirm: (id: string) => void;
  onUpdate: (id: string, newValue: string) => void;
}) {
  const inferred = !filter.confirmed;
  const options = FILTER_VALUE_OPTIONS[filter.category];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border text-xs transition-colors duration-300",
        inferred
          ? "bg-yellow-100 border-yellow-300 dark:bg-yellow-900/40 dark:border-yellow-700/50"
          : "bg-background border-border",
        filter.confidence === "low" && "border-dashed"
      )}
    >
      {inferred && (
        <button
          onClick={(e) => { e.stopPropagation(); onConfirm(filter.id); }}
          className="group/confirm pl-3 py-1 shrink-0 transition-colors text-yellow-500 hover:text-foreground"
          aria-label={`Confirm ${filter.value}`}
        >
          <Sparkles className="h-3 w-3 group-hover/confirm:hidden" />
          <Check className="h-3 w-3 hidden group-hover/confirm:block" />
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className={cn(
              "inline-flex items-center gap-1.5 py-1 hover:opacity-70 transition-opacity",
              inferred ? "pr-1" : "pl-3 pr-1"
            )}>
              <span className={cn(
                "text-[10px] font-semibold uppercase tracking-wide shrink-0",
                inferred ? "text-yellow-700 dark:text-yellow-500" : "text-muted-foreground"
              )}>
                {CATEGORY_LABEL[filter.category]}
              </span>
              <span className="font-medium text-foreground">{filter.value}</span>
            </button>
          }
        />
        {options.length > 0 && (
          <DropdownMenuContent>
            {options.map((value) => (
              <DropdownMenuItem
                key={value}
                onClick={() => onUpdate(filter.id, value)}
              >
                {value}
                {value === filter.value && <Check className="ml-auto h-3.5 w-3.5 opacity-40" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        )}
      </DropdownMenu>

      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(filter.id); }}
        className="pl-0.5 pr-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Remove ${filter.value}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function GroupedFilterChip({
  filters,
  onDismiss,
  onConfirm,
  onUpdate,
  onAdd,
}: {
  filters: ExtractedFilter[];
  onDismiss: (id: string) => void;
  onConfirm: (id: string) => void;
  onUpdate: (id: string, newValue: string) => void;
  onAdd: (filter: ExtractedFilter) => void;
}) {
  const anyUnconfirmed = filters.some((f) => !f.confirmed);
  const cat = filters[0].category;
  const options = FILTER_VALUE_OPTIONS[cat] ?? [];
  const activeValues = new Set(filters.map((f) => f.value));
  const availableOptions = options.filter((v) => !activeValues.has(v));
  const shown = filters.slice(0, 2).map((f) => f.value).join(", ");
  const extra = filters.length > 2 ? filters.length - 2 : 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border text-xs transition-colors duration-300",
        anyUnconfirmed
          ? "bg-yellow-100 border-yellow-300 dark:bg-yellow-900/40 dark:border-yellow-700/50"
          : "bg-background border-border",
      )}
    >
      {anyUnconfirmed && (
        <button
          onClick={() => filters.forEach((f) => !f.confirmed && onConfirm(f.id))}
          className="group/confirm pl-3 py-1 shrink-0 transition-colors text-yellow-500 hover:text-foreground"
        >
          <Sparkles className="h-3 w-3 group-hover/confirm:hidden" />
          <Check className="h-3 w-3 hidden group-hover/confirm:block" />
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className={cn(
              "inline-flex items-center gap-1.5 py-1 hover:opacity-70 transition-opacity",
              anyUnconfirmed ? "pr-1" : "pl-3 pr-1"
            )}>
              <span className={cn(
                "text-[10px] font-semibold uppercase tracking-wide shrink-0",
                anyUnconfirmed ? "text-yellow-700 dark:text-yellow-500" : "text-muted-foreground"
              )}>
                {CATEGORY_LABEL[cat]}
              </span>
              <span className="font-medium text-foreground">{shown}</span>
              {extra > 0 && <span className="text-muted-foreground font-normal">+{extra}</span>}
            </button>
          }
        />
        <DropdownMenuContent>
          {filters.map((f) => (
            <DropdownMenuSub key={f.id}>
              <DropdownMenuSubTrigger>{f.value}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {options.map((value) => (
                  <DropdownMenuItem key={value} onClick={() => onUpdate(f.id, value)}>
                    {value}
                    {value === f.value && <Check className="ml-auto h-3.5 w-3.5 opacity-40" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => onDismiss(f.id)} className="text-destructive focus:text-destructive">
                  Remove
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
          {availableOptions.map((value) => (
            <DropdownMenuItem
              key={value}
              onClick={() =>
                onAdd({
                  id: `manual-${Date.now()}-${Math.random()}`,
                  category: cat,
                  value,
                  matchedText: "",
                  confidence: "high",
                  confirmed: false,
                  start: 0,
                  end: 0,
                })
              }
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {value}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        onClick={() => filters.forEach((f) => onDismiss(f.id))}
        className="pl-0.5 pr-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

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
  const [activeCategory, setActiveCategory] = useState<FilterCategory | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const groupedByCategory = filters.reduce<Partial<Record<FilterCategory, ExtractedFilter[]>>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  const orderedCategories = categoryOrder.filter((cat) => cat in groupedByCategory);

  if (filters.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 flex flex-col gap-2.5">
      {!confirmed && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            + We extracted {filters.length} thing{filters.length !== 1 ? "s" : ""} — confirm or edit
          </p>
          <div className="flex items-center gap-2 text-xs shrink-0">
            <button
              onClick={onConfirmAll}
              className="hover:underline text-foreground"
            >
              Confirm all
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={onDismissAll}
              className="hover:underline text-muted-foreground"
            >
              Dismiss extracted
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}

// ─── highlighted prompt display ───────────────────────────────────────────────

function HighlightedPrompt({
  text,
  filters,
  dismissedFilters,
  highlightsReady,
  onEdit,
}: {
  text: string;
  filters: ExtractedFilter[];
  dismissedFilters: ExtractedFilter[];
  highlightsReady: boolean;
  onEdit: () => void;
}) {
  const segments = buildSegments(text, filters, dismissedFilters);

  return (
    <div className="relative rounded-lg border bg-background px-4 py-3 text-sm leading-7">
      <p className="pr-20">
        {segments.map((seg, i) =>
          seg.highlighted && highlightsReady ? (
            <mark
              key={i}
              className="bg-yellow-100 dark:bg-yellow-900/40 rounded-sm px-0.5 not-italic animate-in fade-in-0 duration-500"
            >
              {seg.text}
            </mark>
          ) : seg.dismissed ? (
            <span key={i} className="text-foreground/25">{seg.text}</span>
          ) : (
            <span key={i} className={highlightsReady ? "text-muted-foreground" : ""}>{seg.text}</span>
          )
        )}
      </p>
      <button
        onClick={onEdit}
        className="absolute right-3 top-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Edit prompt"
      >
        <Pencil className="h-3 w-3" />
        Edit
        <kbd className="text-[10px] opacity-60 font-sans">⌘E</kbd>
      </button>
    </div>
  );
}

// ─── last search persistence ─────────────────────────────────────────────────

interface LastSearch {
  prompt: string;
  filters: ExtractedFilter[];
  resultCount: number;
  timestamp: number;
}

const LAST_SEARCH_KEY = "fn-last-search";

const _yesterday = new Date();
_yesterday.setDate(_yesterday.getDate() - 1);
_yesterday.setHours(14, 12, 0, 0);

const SEED_LAST_SEARCH: LastSearch = {
  prompt: "Senior frontend developer with React and TypeScript, based in London",
  filters: [
    { id: "seed-1", category: "SENIORITY", value: "Senior",     matchedText: "Senior",     confidence: "high", confirmed: true,  start: 0,  end: 6  },
    { id: "seed-2", category: "SKILL",     value: "React",      matchedText: "React",      confidence: "high", confirmed: true,  start: 28, end: 33 },
    { id: "seed-3", category: "SKILL",     value: "TypeScript", matchedText: "TypeScript", confidence: "high", confirmed: false, start: 38, end: 48 },
    { id: "seed-4", category: "CITY",      value: "London",     matchedText: "London",     confidence: "high", confirmed: true,  start: 57, end: 63 },
  ],
  resultCount: 4,
  timestamp: _yesterday.getTime(),
};

function saveLastSearch(data: LastSearch) {
  try { localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(data)); } catch {}
}

function loadLastSearch(): LastSearch | null {
  try {
    const raw = localStorage.getItem(LAST_SEARCH_KEY);
    return raw ? (JSON.parse(raw) as LastSearch) : null;
  } catch { return null; }
}

function formatSearchTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yestStart = new Date(todayStart.getTime() - 86400000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (d >= todayStart) return `TODAY · ${time}`;
  if (d >= yestStart) return `YESTERDAY · ${time}`;
  return `${d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} · ${time}`;
}

function LastSearchBanner({
  lastSearch,
  categoryOrder,
  onResume,
}: {
  lastSearch: LastSearch;
  categoryOrder: FilterCategory[];
  onResume: () => void;
}) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3 flex flex-col gap-2.5 animate-in fade-in-0 duration-200">
      <div className="flex items-start justify-between gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Last search · {formatSearchTime(lastSearch.timestamp)}
        </span>
        <Button variant="outline" size="sm" onClick={onResume}>Resume</Button>
      </div>
      <p className="text-sm">"{lastSearch.prompt}"</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(
          lastSearch.filters.reduce<Partial<Record<FilterCategory, ExtractedFilter[]>>>((acc, f) => {
            (acc[f.category] ??= []).push(f);
            return acc;
          }, {})
        )
          .sort(([a], [b]) => {
            const ai = categoryOrder.indexOf(a as FilterCategory);
            const bi = categoryOrder.indexOf(b as FilterCategory);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          })
          .map(([category, group]) => {
            const g = group!;
            const unconfirmed = g.some((f) => !f.confirmed);
            const shown = g.slice(0, 2).map((f) => f.value).join(", ");
            const extra = g.length > 2 ? g.length - 2 : 0;
            return (
              <div
                key={category}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs",
                  unconfirmed
                    ? "bg-yellow-100 border-yellow-300 dark:bg-yellow-900/40 dark:border-yellow-700/50"
                    : "border-border"
                )}
              >
                {unconfirmed && <Sparkles className="h-3 w-3 shrink-0 text-yellow-500" />}
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {category}
                </span>
                <span className="font-medium text-foreground">{shown}</span>
                {extra > 0 && (
                  <span className="text-muted-foreground font-normal">+{extra}</span>
                )}
              </div>
            );
          })}
        {lastSearch.resultCount > 0 && (
          <span className="text-xs text-muted-foreground">
            — {lastSearch.resultCount} result{lastSearch.resultCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// Ordered loosest → tightest for each adjustable dimension
const EXPERIENCE_SCALE = FILTER_VALUE_OPTIONS.EXPERIENCE; // "0–1 yrs" … "10+ yrs"
const LAST_ACTIVE_SCALE = FILTER_VALUE_OPTIONS["LAST ACTIVE"]; // "Past week" … "Past 6 months"

function RankBadge({ index }: { index: number }) {
  if (index === 0)
    return (
      <Badge variant="default" className="text-[10px] px-1.5 h-4 gap-0.5 py-0">
        <Star className="h-2.5 w-2.5" />
        Top Pick
      </Badge>
    );
  if (index <= 2)
    return <Badge variant="secondary" className="text-[10px] px-1.5 h-4 py-0">Top 3</Badge>;
  if (index <= 4)
    return <Badge variant="outline" className="text-[10px] px-1.5 h-4 py-0">Top 5</Badge>;
  return null;
}

// ─── AI summary dialog ───────────────────────────────────────────────────────

function generateAIAnalysis(candidate: Candidate) {
  const { name, role, skills, experienceYears, location, matchScore } = candidate;
  const first = name.split(" ")[0];
  const seniority =
    experienceYears >= 8 ? "senior" : experienceYears >= 4 ? "mid-to-senior" : experienceYears >= 2 ? "mid-level" : "early-career";
  const [s1, s2, s3] = skills;

  const overview =
    matchScore >= 85
      ? `${name} is among the strongest candidates in this pipeline. Their ${experienceYears}-year track record as a ${role} puts them firmly in ${seniority} territory, and their hands-on proficiency in ${s1}${s2 ? ` and ${s2}` : ""} directly addresses the core technical requirements. Their ${location} base and current availability make them a low-friction choice to move quickly on.`
      : matchScore >= 70
      ? `${name} is a solid contender. A ${seniority} ${role} with proven ${s1} experience, they bring the kind of well-rounded technical profile that performs well across a range of engineering challenges. A few areas fall slightly outside the ideal specification, but the overall signal is clearly positive.`
      : `${name} is worth a closer look. While not a perfect match on all dimensions, their background in ${s1}${s2 ? ` and ${s2}` : ""} is genuinely relevant and their ${experienceYears} years of experience suggest they can operate with meaningful autonomy. Some ramp-up time should be expected on areas outside their core stack.`;

  const strengths: string[] = [
    `${experienceYears} years in ${role} — deep enough to handle ambiguity and contribute from day one.`,
    s1 && s2
      ? `Core proficiency in both ${s1} and ${s2}, which are direct requirements for this search.`
      : `Strong ${s1} expertise, which sits at the heart of this role's technical demands.`,
    skills.length >= 4
      ? `Broad skill surface across ${skills.slice(0, 4).join(", ")} — reduces onboarding risk and enables cross-functional collaboration.`
      : `Focused technical profile with clear depth in the areas that matter most.`,
    s3 ? `Experience with ${s3} signals versatility beyond the core requirement and suggests adaptability to the team's evolving tooling.` : `Consistent track record in a specialised domain — less likely to context-switch poorly under pressure.`,
  ];

  const considerations: string[] = [
    experienceYears < 3
      ? "Relatively early in their career — would benefit from a structured onboarding plan and clear growth milestones alongside a senior mentor."
      : experienceYears > 12
      ? "Extensive seniority may mean salary expectations exceed the advertised band. Worth a candid, early conversation to align on compensation."
      : "Experience level aligns well with the role; unlikely to be a sticking point in offer negotiations.",
    location === "Remote"
      ? "Fully remote — confirm timezone overlap hours and async communication expectations before progressing to final stages."
      : `Based in ${location}. Clarify whether hybrid attendance or occasional travel is expected to avoid late-stage misalignment.`,
  ];

  const recommendation =
    matchScore >= 85
      ? `Prioritise ${first} for a first-round interview this week. Their profile is among the strongest in the current pipeline and delay risks losing them to a competing offer.`
      : matchScore >= 70
      ? `Schedule a screening call with ${first} within the next few days. Their technical background warrants direct evaluation — a focused 30-minute call should quickly clarify fit.`
      : `Flag ${first} as a secondary candidate. They may become more relevant if the top-tier pool doesn't convert, or if the role requirements shift during the search.`;

  const verdict = matchScore >= 85 ? "Strong Match" : matchScore >= 70 ? "Good Fit" : "Backup Pick";

  return { overview, strengths, considerations, recommendation, verdict };
}

function CandidateSummaryDialog({
  candidate,
  matchedTerms: _matchedTerms,
}: {
  candidate: Candidate;
  matchedTerms: string[];
}) {
  const analysis = generateAIAnalysis(candidate);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-full bg-purple-100 border border-purple-300 text-purple-700 px-2 py-0.5 text-xs font-medium hover:bg-purple-200 transition-colors dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-800/40 shrink-0"
          />
        }
      >
        <Sparkles className="h-3 w-3" />
        Summarise
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2.5 pr-8">
            <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-purple-100 border border-purple-200 shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-purple-600" />
            </span>
            <div className="min-w-0">
              <DialogTitle>AI Analysis</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{candidate.name} · {candidate.role}</p>
            </div>
            <span className={cn(
              "ml-auto text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0",
              candidate.matchScore >= 85
                ? "bg-green-50 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                : candidate.matchScore >= 70
                ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400"
                : "bg-secondary border-border text-muted-foreground"
            )}>
              {analysis.verdict}
            </span>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <p className="text-foreground leading-relaxed">{analysis.overview}</p>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Strengths</p>
            <ul className="flex flex-col gap-1.5">
              {analysis.strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <Check className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Considerations</p>
            <ul className="flex flex-col gap-1.5">
              {analysis.considerations.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500 font-bold text-[11px] leading-none flex items-center">!</span>
                  <span className="text-muted-foreground">{c}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg bg-purple-50 border border-purple-200 dark:bg-purple-900/20 dark:border-purple-800 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400 mb-1.5">Recommendation</p>
            <p className="text-foreground leading-relaxed">{analysis.recommendation}</p>
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

// ─── near-miss panel ──────────────────────────────────────────────────────────

interface NearMiss {
  candidate: Candidate;
  score: number;
  matchedTerms: string[];
  failedFilter: ExtractedFilter;
}

function computeNearMisses(filters: ExtractedFilter[], terms: string[]): NearMiss[] {
  return CANDIDATES.flatMap((candidate) => {
    const scored = scoreCandidate(candidate, terms);
    const failed = filters.filter((f) => !candidateMatchesFilter(candidate, f));
    if (failed.length !== 1) return [];
    return [{ candidate, score: scored.score, matchedTerms: scored.matchedTerms, failedFilter: failed[0] }];
  }).sort((a, b) => b.score - a.score);
}

function computeTryWithout(
  filters: ExtractedFilter[],
  terms: string[]
): Array<{ filter: ExtractedFilter; additionalCount: number }> {
  return filters
    .map((filter) => {
      const rest = filters.filter((f) => f.id !== filter.id);
      const additionalCount = CANDIDATES.filter((c) => {
        const { score } = scoreCandidate(c, terms);
        if (score === 0) return false;
        return rest.every((f) => candidateMatchesFilter(c, f)) && !candidateMatchesFilter(c, filter);
      }).length;
      return { filter, additionalCount };
    })
    .filter((s) => s.additionalCount > 0)
    .sort((a, b) => b.additionalCount - a.additionalCount);
}

function missedByLabel(filter: ExtractedFilter, candidate: Candidate): string {
  switch (filter.category) {
    case "EXPERIENCE": {
      const req = parseInt(filter.value.match(/(\d+)/)?.[1] ?? "0");
      const diff = req - candidate.experienceYears;
      return diff > 0 ? `${diff} yr${diff !== 1 ? "s" : ""} exp` : "experience";
    }
    case "CITY": return "city";
    case "WORK PREF": return "work pref";
    case "SKILL": return filter.value.toLowerCase();
    case "SENIORITY": return "seniority";
    case "TITLE": return "title";
    default: return filter.category.toLowerCase();
  }
}

function nearMissChipText(filter: ExtractedFilter, candidate: Candidate, failed: boolean): string {
  if (!failed) {
    return filter.category === "SKILL" ? filter.value : `${CATEGORY_LABEL[filter.category]} · ${filter.value}`;
  }
  switch (filter.category) {
    case "EXPERIENCE": {
      const req = filter.value.match(/(\d+)/)?.[1] ?? "?";
      return `YEARS · ${candidate.experienceYears} / ${req}+`;
    }
    case "CITY":
      return `CITY · ${candidate.location.split(",")[0].trim()} / ${filter.value}`;
    default:
      return filter.category === "SKILL" ? filter.value : `${CATEGORY_LABEL[filter.category]} · ${filter.value}`;
  }
}

function NearMissCard({
  candidate,
  failedFilter,
  allFilters,
}: {
  candidate: Candidate;
  failedFilter: ExtractedFilter;
  allFilters: ExtractedFilter[];
}) {
  return (
    <Card className="py-0">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs">{candidate.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium text-sm">{candidate.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {candidate.role} · {candidate.location} · {candidate.experienceYears} yrs
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-red-500 mb-0.5">Missed by</p>
            <p className="text-sm font-semibold text-red-500">{missedByLabel(failedFilter, candidate)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allFilters.map((filter) => {
            const isFailed = filter.id === failedFilter.id;
            return (
              <div
                key={filter.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium",
                  isFailed
                    ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"
                    : "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                )}
              >
                {isFailed ? <X className="h-3 w-3 shrink-0" /> : <Check className="h-3 w-3 shrink-0" />}
                <span>{nearMissChipText(filter, candidate, isFailed)}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ZeroResultsPanel({
  filters,
  prompt,
  onRemoveFilter,
  onEdit,
}: {
  filters: ExtractedFilter[];
  prompt: string;
  onRemoveFilter: (id: string) => void;
  onEdit: () => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const terms = useMemo(() => {
    const promptTerms = extractTerms(prompt);
    const filterTerms = filters.flatMap((f) => f.value.toLowerCase().split(/\s+/));
    return [...new Set([...promptTerms, ...filterTerms])];
  }, [prompt, filters]);

  const nearMisses = useMemo(() => computeNearMisses(filters, terms), [filters, terms]);
  const tryWithout = useMemo(() => computeTryWithout(filters, terms), [filters, terms]);

  const SHOWN = 4;
  const displayed = showAll ? nearMisses : nearMisses.slice(0, SHOWN);
  const remaining = nearMisses.length - SHOWN;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm">
            <span className="font-semibold">0 perfect matches</span>
            {nearMisses.length > 0 && (
              <>
                <span className="text-muted-foreground">
                  {" "}— but {nearMisses.length} candidate{nearMisses.length !== 1 ? "s" : ""}{" "}
                  {nearMisses.length !== 1 ? "are" : "is"}{" "}
                </span>
                <span className="text-red-500 font-semibold">1 criterion away</span>
              </>
            )}
          </p>
          {nearMisses.length > 0 && tryWithout[0] && (
            <button
              onClick={() => onRemoveFilter(tryWithout[0].filter.id)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              Loosen criteria to see them all →
            </button>
          )}
        </div>
        {tryWithout.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">
              Try without:
            </span>
            {tryWithout.map(({ filter, additionalCount }) => (
              <button
                key={filter.id}
                onClick={() => onRemoveFilter(filter.id)}
                className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs hover:bg-accent transition-colors"
              >
                <span className="line-through text-muted-foreground">{filter.value}</span>
                <span className="text-red-500 font-semibold">+{additionalCount}</span>
              </button>
            ))}
            <button
              onClick={onEdit}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              or edit prompt
            </button>
          </div>
        )}
      </div>

      {nearMisses.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Near-misses · {nearMisses.length} candidate{nearMisses.length !== 1 ? "s" : ""} missing exactly one criterion — ranked by closeness
          </p>
          <div className="grid grid-cols-2 gap-3">
            {displayed.map(({ candidate, failedFilter }) => (
              <NearMissCard
                key={candidate.id}
                candidate={candidate}
                failedFilter={failedFilter}
                allFilters={filters}
              />
            ))}
          </div>
          {!showAll && remaining > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-sm text-left text-muted-foreground hover:text-foreground transition-colors"
            >
              + {remaining} more near-miss{remaining !== 1 ? "es" : ""}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [prompt, setPrompt] = useState("");
  const [editMode, setEditMode] = useState(true);
  const [filters, setFilters] = useState<ExtractedFilter[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [results, setResults] = useState<ScoredCandidate[] | null>(null);
  const [highlightsReady, setHighlightsReady] = useState(false);
  const [chipsLoading, setChipsLoading] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [lastSearch, setLastSearch] = useState<LastSearch | null>(() => loadLastSearch() ?? SEED_LAST_SEARCH);
  const [categoryOrder, setCategoryOrder] = useState<FilterCategory[]>(DEFAULT_CATEGORY_ORDER);
  const [sortBy, setSortBy] = useState<"relevance" | "match" | "experience" | "name">("relevance");
  const [quickFilter, setQuickFilter] = useState<"all" | "top1" | "top3" | "top5">("all");
  const [view, setView] = useState<"list" | "table" | "grid">("list");
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [dismissedFilters, setDismissedFilters] = useState<ExtractedFilter[]>([]);

  function toggleBookmark(id: string) {
    setBookmarked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const handleReorder = useCallback((activeId: FilterCategory, overId: FilterCategory) => {
    setCategoryOrder((prev) => {
      const from = prev.indexOf(activeId);
      const to = prev.indexOf(overId);
      return from === -1 || to === -1 ? prev : arrayMove(prev, from, to);
    });
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Focus textarea when switching back to edit mode
  useEffect(() => {
    if (editMode) textareaRef.current?.focus();
  }, [editMode]);

  // ⌘E to edit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "e" && !editMode) {
        e.preventDefault();
        setEditMode(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "]" && hasResults) {
        e.preventDefault();
        handleTighten();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "[" && hasResults) {
        e.preventDefault();
        handleLoosen();
      }
      if (e.key === "Escape") handleReset();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Re-score when chips are edited/added/removed after results are loaded
  useEffect(() => {
    if (results === null) return;
    const promptTerms = extractTerms(prompt);
    const filterTerms = filters.flatMap((f) => f.value.toLowerCase().split(/\s+/));
    const terms = [...new Set([...promptTerms, ...filterTerms])];
    const scored = CANDIDATES
      .map((c) => scoreCandidate(c, terms))
      .filter((r) => r.score > 0)
      .filter((r) => filters.every((f) => candidateMatchesFilter(r.candidate, f)))
      .sort((a, b) => b.score - a.score);
    setResults(scored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const runSearch = useCallback((text: string) => {
    if (!text.trim()) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];

    setFilters([]);
    setDismissedFilters([]);
    setResults(null);
    setEditMode(false);
    setConfirmed(false);
    setHighlightsReady(false);
    setChipsLoading(false);
    setResultsLoading(false);
    setQuickFilter("all");

    // 1. Highlights fade into the prompt text
    timers.current.push(setTimeout(() => setHighlightsReady(true), 350));

    // 2. Chip spinner slides in
    timers.current.push(setTimeout(() => setChipsLoading(true), 650));

    // 3. Chips resolve
    let extractedFilters: ExtractedFilter[] = [];
    timers.current.push(setTimeout(() => {
      extractedFilters = extractFilters(text);
      setFilters(extractedFilters);
      setChipsLoading(false);
    }, 1050));

    // 4. Candidates spinner slides in
    timers.current.push(setTimeout(() => setResultsLoading(true), 1200));

    // 5. Candidates cascade in
    timers.current.push(setTimeout(() => {
      const terms = extractTerms(text);
      const scored = CANDIDATES.map((c) => scoreCandidate(c, terms))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);
      setResults(scored);
      setResultsLoading(false);
      const ls: LastSearch = { prompt: text, filters: extractedFilters, resultCount: scored.length, timestamp: Date.now() };
      saveLastSearch(ls);
      setLastSearch(ls);
    }, 1650));
  }, []);

  function handleSearch() {
    runSearch(prompt);
  }

  function handleSuggest(suggestion: string) {
    setPrompt(suggestion);
    runSearch(suggestion);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSearch();
  }

  function handleUpdate(id: string, newValue: string) {
    const filter = filters.find((f) => f.id === id);
    if (!filter) return;
    const diff = newValue.length - (filter.end - filter.start);
    setPrompt((p) => p.slice(0, filter.start) + newValue + p.slice(filter.end));
    setFilters((prev) =>
      prev.map((f) => {
        if (f.id === id)
          return { ...f, value: newValue, matchedText: newValue, end: filter.start + newValue.length, confirmed: true };
        if (f.start >= filter.end)
          return { ...f, start: f.start + diff, end: f.end + diff };
        return f;
      })
    );
  }

  function handleAddFilter(filter: ExtractedFilter) {
    const sep = ", ";
    const start = prompt.length + sep.length;
    const end = start + filter.value.length;
    setPrompt((p) => p + sep + filter.value);
    setFilters((f) => [...f, { ...filter, confirmed: true, confidence: "high", matchedText: filter.value, start, end, source: "manual" as const }]);
  }

  function handleDismissFilter(id: string) {
    const filter = filters.find((f) => f.id === id);
    if (!filter) return;

    if (filter.source === "manual") {
      // Remove ", value" from prompt and shift positions of subsequent filters
      const removeStart = filter.start - 2; // the ", " separator sits before start
      const removeLen = filter.end - removeStart;
      setPrompt((p) => p.slice(0, removeStart) + p.slice(filter.end));
      const shift = (f: ExtractedFilter) =>
        f.start >= filter.end ? { ...f, start: f.start - removeLen, end: f.end - removeLen } : f;
      setFilters((prev) => prev.filter((f) => f.id !== id).map(shift));
      setDismissedFilters((prev) => prev.map(shift));
    } else {
      // Extracted from prompt — remove from active filters, grey out in prompt display
      setFilters((f) => f.filter((x) => x.id !== id));
      setDismissedFilters((prev) => [...prev, filter]);
    }
  }

  function handleReset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPrompt("");
    setFilters([]);
    setDismissedFilters([]);
    setResults(null);
    setEditMode(true);
    setConfirmed(false);
    setHighlightsReady(false);
    setChipsLoading(false);
    setResultsLoading(false);
    setQuickFilter("all");
  }

  function handleResume() {
    if (!lastSearch) return;
    const terms = extractTerms(lastSearch.prompt);
    const filterTerms = lastSearch.filters.flatMap((f) => f.value.toLowerCase().split(/\s+/));
    const allTerms = [...new Set([...terms, ...filterTerms])];
    const scored = CANDIDATES
      .map((c) => scoreCandidate(c, allTerms))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    setPrompt(lastSearch.prompt);
    setFilters(lastSearch.filters);
    setConfirmed(true);
    setEditMode(false);
    setHighlightsReady(true);
    setResults(scored);
    setChipsLoading(false);
    setResultsLoading(false);
  }

  function rerunResults(newFilters: ExtractedFilter[]) {
    setResultsLoading(true);
    setFilters(newFilters);
    const t = setTimeout(() => {
      const promptTerms = extractTerms(prompt);
      const filterTerms = newFilters.flatMap((f) => f.value.toLowerCase().split(/\s+/));
      const terms = [...new Set([...promptTerms, ...filterTerms])];
      const scored = CANDIDATES
        .map((c) => scoreCandidate(c, terms))
        .filter((r) => r.score > 0)
        .filter((r) => newFilters.every((f) => candidateMatchesFilter(r.candidate, f)))
        .sort((a, b) => b.score - a.score);
      setResults(scored);
      setResultsLoading(false);
    }, 600);
    timers.current.push(t);
  }

  function handleTighten() {
    let next = [...filters];
    // Experience: move one step stricter, or add at lowest level
    const expIdx = next.findIndex((f) => f.category === "EXPERIENCE");
    if (expIdx !== -1) {
      const scale = EXPERIENCE_SCALE.indexOf(next[expIdx].value);
      const newVal = EXPERIENCE_SCALE[Math.min(EXPERIENCE_SCALE.length - 1, scale + 1)];
      next = next.map((f, i) => i === expIdx ? { ...f, value: newVal, confirmed: true } : f);
    } else {
      next = [...next, { id: `tj-exp-${Date.now()}`, category: "EXPERIENCE", value: "2–4 yrs", matchedText: "", confidence: "high" as const, confirmed: true, start: 0, end: 0 }];
    }
    // Last active: move one step stricter (toward "Past week"), or add "Past month"
    const laIdx = next.findIndex((f) => f.category === "LAST ACTIVE");
    if (laIdx !== -1) {
      const scale = LAST_ACTIVE_SCALE.indexOf(next[laIdx].value);
      const newVal = LAST_ACTIVE_SCALE[Math.max(0, scale - 1)];
      next = next.map((f, i) => i === laIdx ? { ...f, value: newVal, confirmed: true } : f);
    } else {
      next = [...next, { id: `tj-la-${Date.now()}`, category: "LAST ACTIVE", value: "Past month", matchedText: "", confidence: "high" as const, confirmed: true, start: 0, end: 0 }];
    }
    rerunResults(next);
  }

  function handleLoosen() {
    let next = [...filters];
    // Experience: move one step looser, remove at loosest
    const expIdx = next.findIndex((f) => f.category === "EXPERIENCE");
    if (expIdx !== -1) {
      const scale = EXPERIENCE_SCALE.indexOf(next[expIdx].value);
      if (scale <= 0) {
        next = next.filter((_, i) => i !== expIdx);
      } else {
        next = next.map((f, i) => i === expIdx ? { ...f, value: EXPERIENCE_SCALE[scale - 1], confirmed: true } : f);
      }
    }
    // Last active: move one step looser (toward "Past 6 months"), remove at loosest
    const laIdx = next.findIndex((f) => f.category === "LAST ACTIVE");
    if (laIdx !== -1) {
      const scale = LAST_ACTIVE_SCALE.indexOf(next[laIdx].value);
      if (scale >= LAST_ACTIVE_SCALE.length - 1) {
        next = next.filter((_, i) => i !== laIdx);
      } else {
        next = next.map((f, i) => i === laIdx ? { ...f, value: LAST_ACTIVE_SCALE[scale + 1], confirmed: true } : f);
      }
    }
    rerunResults(next);
  }

  const sortedResults = useMemo(() => {
    if (!results) return null;
    const arr = [...results];
    if (sortBy === "match") arr.sort((a, b) => b.candidate.matchScore - a.candidate.matchScore);
    else if (sortBy === "experience") arr.sort((a, b) => b.candidate.experienceYears - a.candidate.experienceYears);
    else if (sortBy === "name") arr.sort((a, b) => a.candidate.name.localeCompare(b.candidate.name));
    return arr;
  }, [results, sortBy]);

  const quickFilterLimit = quickFilter === "top1" ? 1 : quickFilter === "top3" ? 3 : quickFilter === "top5" ? 5 : undefined;
  const displayedResults = quickFilterLimit !== undefined ? sortedResults?.slice(0, quickFilterLimit) : sortedResults;

  const hasResults = results !== null;
  const isSearching = chipsLoading || resultsLoading;

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <div className="max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-4">

        {/* Hero header — idle state only */}
        {!hasResults && !isSearching && (
          <div className="text-center pt-6 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Find Candidates
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Who are you looking for?
            </h1>
          </div>
        )}

        {/* Prompt area */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-0.5">
            {!editMode && (
              <span className="text-[11px] text-muted-foreground ml-auto">
                ⌘E to edit · Esc to clear
              </span>
            )}
          </div>

          {editMode ? (
            <div className="relative animate-in fade-in-0 duration-200">
              <Textarea
                ref={textareaRef}
                placeholder="Senior React developer with TypeScript, 5+ years, based in London"
                className="min-h-[5rem] max-h-40 resize-none text-sm pb-11"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button
                onClick={handleSearch}
                disabled={!prompt.trim()}
                size="sm"
                className="absolute bottom-2 right-2 gap-2"
              >
                Search
                <kbd className="text-[10px] opacity-60 font-sans">⌘↵</kbd>
              </Button>
            </div>
          ) : (
            <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              <HighlightedPrompt
                text={prompt}
                filters={filters}
                dismissedFilters={dismissedFilters}
                highlightsReady={highlightsReady}
                onEdit={() => setEditMode(true)}
              />
            </div>
          )}
        </div>

        {/* Chip bar */}
        {(chipsLoading || hasResults) && (
          chipsLoading ? (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center gap-2 animate-in fade-in-0 duration-200">
              <Loader2 className="h-3 w-3 animate-spin shrink-0 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Extracting criteria…
              </span>
            </div>
          ) : (
            <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
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
            </div>
          )
        )}

        {/* Last search + suggested prompts — only before first search */}
        {!hasResults && !isSearching && (
          <div className="flex flex-col gap-4 pt-2">
            {lastSearch && (
              <LastSearchBanner
                lastSearch={lastSearch}
                categoryOrder={categoryOrder}
                onResume={handleResume}
              />
            )}
            <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Suggested searches
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTED_PROMPTS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggest(s)}
                  className="flex items-center gap-2 text-sm text-left px-3 py-2 rounded-md border hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {s}
                </button>
              ))}
            </div>
            </div>
          </div>
        )}

        {/* Results */}
        {(resultsLoading || hasResults) && (
          <div className="flex flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-3 duration-300">
            <Separator />

            {resultsLoading ? (
              <div className="flex items-center gap-2.5 py-3 text-sm text-muted-foreground animate-in fade-in-0 duration-200">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Searching candidates…
              </div>
            ) : (
            <>
            {results!.length > 0 && (
            <div className="flex items-center justify-between animate-in fade-in-0 duration-300">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{results!.length} found</p>
                <Select value={sortBy} onValueChange={(v) => setSortBy((v ?? "relevance") as typeof sortBy)}>
                  <SelectTrigger className="h-7 text-xs w-36 gap-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Relevance</SelectItem>
                    <SelectItem value="match">Match score</SelectItem>
                    <SelectItem value="experience">Experience</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                  </SelectContent>
                </Select>
                <div className="inline-flex rounded-md border overflow-hidden shrink-0">
                  {(["list", "table", "grid"] as const).map((v, i) => {
                    const Icon = v === "list" ? List : v === "table" ? Table2 : LayoutGrid;
                    return (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={cn(
                          "px-2 py-1 transition-colors",
                          i > 0 && "border-l",
                          view === v
                            ? "bg-secondary text-secondary-foreground"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                        aria-label={`${v} view`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="inline-flex rounded-md border text-xs overflow-hidden shrink-0">
                  {(["top1", "top3", "top5"] as const).map((v, i) => (
                    <button
                      key={v}
                      onClick={() => setQuickFilter((prev) => prev === v ? "all" : v)}
                      className={cn(
                        "px-2.5 py-1 transition-colors",
                        i > 0 && "border-l",
                        quickFilter === v
                          ? "bg-secondary text-secondary-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {v === "top1" ? "Top Pick" : v === "top3" ? "Top 3" : "Top 5"}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={handleLoosen} className="gap-1.5 text-muted-foreground">
                  Loosen
                  <kbd className="text-[10px] opacity-50 font-sans">⌘[</kbd>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleTighten} className="gap-1.5 text-muted-foreground">
                  Tighten
                  <kbd className="text-[10px] opacity-50 font-sans">⌘]</kbd>
                </Button>
              </div>
            </div>
            )}

            {results!.length === 0 ? (
              <ZeroResultsPanel
                filters={filters}
                prompt={prompt}
                onRemoveFilter={handleDismissFilter}
                onEdit={() => setEditMode(true)}
              />
            ) : view === "table" ? (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-56">Candidate</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Exp</TableHead>
                      <TableHead>Skills</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedResults!.map(({ candidate, matchedTerms }, index) => {
                      const skillFilters = filters.filter((f) => f.category === "SKILL");
                      const isSkillMatched = (skill: string) =>
                        matchedTerms.some((t) => skill.toLowerCase().includes(t)) ||
                        skillFilters.some(
                          (f) =>
                            skill.toLowerCase().includes(f.value.toLowerCase()) ||
                            f.value.toLowerCase().includes(skill.toLowerCase())
                        );
                      return (
                      <TableRow key={candidate.id} className="cursor-pointer">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className="text-xs">{candidate.initials}</AvatarFallback>
                            </Avatar>
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="font-medium text-sm">{candidate.name}</span>
                              <RankBadge index={index} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{candidate.role}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{candidate.location}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{candidate.experienceYears}y</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {candidate.skills.slice(0, 2).map((s) => (
                              <Badge
                                key={s}
                                variant="outline"
                                className={cn(
                                  "text-xs font-normal",
                                  isSkillMatched(s)
                                    ? "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                                    : "text-muted-foreground"
                                )}
                              >
                                {s}
                              </Badge>
                            ))}
                            {candidate.skills.length > 2 && (
                              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">+{candidate.skills.length - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <CandidateSummaryDialog candidate={candidate} matchedTerms={matchedTerms} />
                            <Badge variant="outline" className="font-mono bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400">
                              {candidate.matchScore}%
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleBookmark(candidate.id); }}
                            className={cn("h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-accent", bookmarked.has(candidate.id) ? "text-foreground" : "text-muted-foreground")}
                            aria-label={bookmarked.has(candidate.id) ? "Remove bookmark" : "Bookmark"}
                          >
                            <Bookmark className={cn("h-3.5 w-3.5", bookmarked.has(candidate.id) && "fill-current")} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ); })}
                  </TableBody>
                </Table>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-2 gap-3">
                {displayedResults!.map(({ candidate, matchedTerms }, index) => {
                  const skillFilters = filters.filter((f) => f.category === "SKILL");
                  const isSkillMatched = (skill: string) =>
                    matchedTerms.some((t) => skill.toLowerCase().includes(t)) ||
                    skillFilters.some(
                      (f) =>
                        skill.toLowerCase().includes(f.value.toLowerCase()) ||
                        f.value.toLowerCase().includes(skill.toLowerCase())
                    );
                  return (
                  <Card
                    key={candidate.id}
                    className={cn(
                      "cursor-pointer hover:bg-accent/50 transition-colors animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
                      candidate.matchScore > 90 && "border-green-400 dark:border-green-600"
                    )}
                    style={{ animationDelay: `${index * 40}ms`, animationFillMode: "both" }}
                  >
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-sm">{candidate.initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-sm">{candidate.name}</p>
                              <RankBadge index={index} />
                            </div>
                            <p className="text-xs text-muted-foreground">{candidate.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <CandidateSummaryDialog candidate={candidate} matchedTerms={matchedTerms} />
                          <Badge variant="outline" className="font-mono text-xs bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400">
                            {candidate.matchScore}%
                          </Badge>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleBookmark(candidate.id); }}
                            className={cn("h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-accent", bookmarked.has(candidate.id) ? "text-foreground" : "text-muted-foreground")}
                            aria-label={bookmarked.has(candidate.id) ? "Remove bookmark" : "Bookmark"}
                          >
                            <Bookmark className={cn("h-3.5 w-3.5", bookmarked.has(candidate.id) && "fill-current")} />
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {candidate.skills.slice(0, 3).map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className={cn(
                              "text-xs font-normal",
                              isSkillMatched(s)
                                ? "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {s}
                          </Badge>
                        ))}
                        {candidate.skills.length > 3 && (
                          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">+{candidate.skills.length - 3}</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  ); })}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {displayedResults!.map(({ candidate, matchedTerms }, index) => (
                  <Card
                    key={candidate.id}
                    className={cn(
                      "cursor-pointer hover:bg-accent/50 transition-colors animate-in fade-in-0 slide-in-from-bottom-2 duration-300 py-0",
                      candidate.matchScore > 90 && "border-green-400 dark:border-green-600"
                    )}
                    style={{ animationDelay: `${index * 40}ms`, animationFillMode: "both" }}
                  >
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="text-sm">
                              {candidate.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-sm">{candidate.name}</p>
                              <RankBadge index={index} />
                            </div>
                            <p className="text-sm text-muted-foreground">{candidate.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <CandidateSummaryDialog candidate={candidate} matchedTerms={matchedTerms} />
                          <Badge
                            variant="outline"
                            className="font-mono bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                          >
                            {candidate.matchScore}%
                          </Badge>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleBookmark(candidate.id); }}
                            className={cn(
                              "h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-accent",
                              bookmarked.has(candidate.id) ? "text-foreground" : "text-muted-foreground"
                            )}
                            aria-label={bookmarked.has(candidate.id) ? "Remove bookmark" : "Bookmark candidate"}
                          >
                            <Bookmark className={cn("h-3.5 w-3.5", bookmarked.has(candidate.id) && "fill-current")} />
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 flex flex-col gap-3">
                      <p className="text-sm text-foreground">{highlightSummary(candidate.summary, matchedTerms)}</p>
                      <CandidateFilterChips
                        filters={filters}
                        candidate={candidate}
                        categoryOrder={categoryOrder}
                        onAdd={handleAddFilter}
                        onDismiss={handleDismissFilter}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
