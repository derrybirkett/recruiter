"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { ArrowRight, MapPin, Clock, Pencil, X, Loader2, Plus, Briefcase, Star, Home, Building2, Languages, Sparkles, Check, TrendingUp, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { arrayMove } from "@dnd-kit/sortable";

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

const CATEGORY_ORDER: Partial<Record<FilterCategory, number>> = {
  TITLE: 0, SKILL: 1, EXPERIENCE: 2, CITY: 3,
  "WORK PREF": 4, INDUSTRY: 5, LANGUAGE: 6, "LAST ACTIVE": 7, SENIORITY: 8, INFERRED: 9,
};

const DEFAULT_CATEGORY_ORDER: FilterCategory[] = [
  "TITLE", "SKILL", "EXPERIENCE", "CITY",
  "WORK PREF", "INDUSTRY", "LANGUAGE", "LAST ACTIVE", "SENIORITY", "INFERRED",
];

function CandidateFilterChips({
  filters,
  candidate,
  onAdd,
  onDismiss,
}: {
  filters: ExtractedFilter[];
  candidate: Candidate;
  onAdd: (filter: ExtractedFilter) => void;
  onDismiss: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const grouped = Object.entries(
    filters.reduce<Partial<Record<FilterCategory, ExtractedFilter[]>>>((acc, f) => {
      (acc[f.category] ??= []).push(f);
      return acc;
    }, {})
  ).sort(([a], [b]) => (CATEGORY_ORDER[a as FilterCategory] ?? 99) - (CATEGORY_ORDER[b as FilterCategory] ?? 99));

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

function ChipBar({
  filters,
  confirmed,
  onDismiss,
  onConfirm,
  onUpdate,
  onAdd,
  onConfirmAll,
  onDismissAll,
}: {
  filters: ExtractedFilter[];
  confirmed: boolean;
  onDismiss: (id: string) => void;
  onConfirm: (id: string) => void;
  onUpdate: (id: string, newValue: string) => void;
  onAdd: (filter: ExtractedFilter) => void;
  onConfirmAll: () => void;
  onDismissAll: () => void;
}) {
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

      <div className="flex flex-wrap gap-2">
        {Object.entries(
          filters.reduce<Partial<Record<FilterCategory, ExtractedFilter[]>>>((acc, f) => {
            (acc[f.category] ??= []).push(f);
            return acc;
          }, {})
        )
          .sort(([a], [b]) => (CATEGORY_ORDER[a as FilterCategory] ?? 99) - (CATEGORY_ORDER[b as FilterCategory] ?? 99))
          .map(([, group]) => {
            const g = group!;
            return g.length === 1 ? (
              <FilterChip key={g[0].id} filter={g[0]} onDismiss={onDismiss} onConfirm={onConfirm} onUpdate={onUpdate} />
            ) : (
              <GroupedFilterChip key={g[0].category} filters={g} onDismiss={onDismiss} onConfirm={onConfirm} onUpdate={onUpdate} onAdd={onAdd} />
            );
          })}
        <AddFilterChip onAdd={onAdd} activeFilters={filters} />
      </div>
    </div>
  );
}

// ─── highlighted prompt display ───────────────────────────────────────────────

function HighlightedPrompt({
  text,
  filters,
  highlightsReady,
  onEdit,
}: {
  text: string;
  filters: ExtractedFilter[];
  highlightsReady: boolean;
  onEdit: () => void;
}) {
  const segments = buildSegments(text, filters);

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
  onResume,
}: {
  lastSearch: LastSearch;
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
          .sort(([a], [b]) => (CATEGORY_ORDER[a as FilterCategory] ?? 99) - (CATEGORY_ORDER[b as FilterCategory] ?? 99))
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

  function handleReorder(activeId: FilterCategory, overId: FilterCategory) {
    setCategoryOrder((prev) => {
      const from = prev.indexOf(activeId);
      const to = prev.indexOf(overId);
      return from === -1 || to === -1 ? prev : arrayMove(prev, from, to);
    });
  }

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
      .sort((a, b) => b.score - a.score);
    setResults(scored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const runSearch = useCallback((text: string) => {
    if (!text.trim()) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];

    setFilters([]);
    setResults(null);
    setEditMode(false);
    setConfirmed(false);
    setHighlightsReady(false);
    setChipsLoading(false);
    setResultsLoading(false);

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
          return { ...f, value: newValue, matchedText: newValue, end: filter.start + newValue.length };
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
    setFilters((f) => [...f, { ...filter, confirmed: true, confidence: "high", matchedText: filter.value, start, end }]);
  }

  function handleDismissFilter(id: string) {
    setFilters((f) => f.filter((x) => x.id !== id));
  }

  function handleReset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPrompt("");
    setFilters([]);
    setResults(null);
    setEditMode(true);
    setConfirmed(false);
    setHighlightsReady(false);
    setChipsLoading(false);
    setResultsLoading(false);
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

  const hasResults = results !== null;
  const isSearching = chipsLoading || resultsLoading;

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <div className="max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-4">

        {/* Prompt area */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-sm text-muted-foreground">
              Describe what you are looking for
            </span>
            {!editMode && (
              <span className="text-[11px] text-muted-foreground">
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
            <div className="flex items-center justify-between animate-in fade-in-0 duration-300">
              <p className="text-sm font-medium">
                {results!.length === 0
                  ? "No matches found"
                  : `${results!.length} candidate${results!.length !== 1 ? "s" : ""} found`}
              </p>
              <div className="flex items-center gap-1">
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

            {results!.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground text-sm">
                  Try broadening your search — fewer keywords often return more results.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {results!.map(({ candidate, matchedTerms }, index) => (
                  <Card
                    key={candidate.id}
                    className={cn(
                      "cursor-pointer hover:bg-accent/50 transition-colors animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
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
                            <p className="font-medium text-sm">{candidate.name}</p>
                            <p className="text-sm text-muted-foreground">{candidate.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant="outline"
                            className="font-mono bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                          >
                            {candidate.matchScore}%
                          </Badge>
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
