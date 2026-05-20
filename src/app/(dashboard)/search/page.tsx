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
    default:
      return false;
  }
}

const CATEGORY_ORDER: Partial<Record<FilterCategory, number>> = {
  TITLE: 0, SENIORITY: 1, SKILL: 2, CITY: 3,
  EXPERIENCE: 4, "WORK PREF": 5, INDUSTRY: 6, LANGUAGE: 7, INFERRED: 8,
};

type ChipData =
  | { kind: "filter"; filter: ExtractedFilter; matched: boolean; sortKey: number }
  | { kind: "info"; icon: React.ElementType; label: string; sortKey: number };

function CandidateFilterChips({
  filters,
  candidate,
}: {
  filters: ExtractedFilter[];
  candidate: Candidate;
}) {
  const [expanded, setExpanded] = useState(false);

  const skillFilters = filters.filter((f) => f.category === "SKILL");
  const extraSkills = candidate.skills.filter(
    (skill) =>
      !skillFilters.some(
        (f) =>
          skill.toLowerCase().includes(f.value.toLowerCase()) ||
          f.value.toLowerCase().includes(skill.toLowerCase())
      )
  );

  const chips: ChipData[] = filters.map((filter) => ({
    kind: "filter",
    filter,
    matched: candidateMatchesFilter(candidate, filter),
    sortKey: CATEGORY_ORDER[filter.category] ?? 99,
  }));

  if (!filters.some((f) => f.category === "CITY"))
    chips.push({ kind: "info", icon: MapPin, label: candidate.location, sortKey: CATEGORY_ORDER.CITY! });

  if (!filters.some((f) => f.category === "EXPERIENCE" || f.category === "INFERRED"))
    chips.push({ kind: "info", icon: Clock, label: `${candidate.experienceYears}y exp`, sortKey: CATEGORY_ORDER.EXPERIENCE! });

  chips.sort((a, b) => a.sortKey - b.sortKey);

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip, i) => {
        if (chip.kind === "info") {
          const Icon = chip.icon;
          return (
            <div key={`info-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
              <Icon className="h-3 w-3 shrink-0" />
              {chip.label}
            </div>
          );
        }
        const { filter, matched } = chip;
        return (
          <div
            key={filter.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              matched
                ? "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"
            )}
          >
            {matched ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
            {filter.value}
          </div>
        );
      })}

      {extraSkills.length > 0 && (
        expanded ? (
          <>
            {extraSkills.map((skill) => (
              <Badge key={skill} variant="secondary" className="text-xs font-normal">
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
  TITLE:        ["Senior", "Mid-level", "Junior", "Lead", "Principal", "Staff"],
  SKILL:        ["React", "TypeScript", "Python", "Node.js", "GraphQL", "AWS", "Vue", "Swift"],
  CITY:         ["London", "New York", "Berlin", "Amsterdam", "Toronto", "Remote"],
  "WORK PREF":  ["Remote", "Hybrid", "On-site"],
  INDUSTRY:     ["FinTech", "HealthTech", "SaaS", "E-commerce", "Gaming", "Enterprise"],
  LANGUAGE:     ["English", "Spanish", "French", "German", "Mandarin", "Portuguese"],
  SENIORITY:    ["Associate", "Junior", "Mid-level", "Senior", "Staff", "Principal", "Director"],
  EXPERIENCE:   ["0–1 yrs", "2–4 yrs", "5–7 yrs", "8–10 yrs", "10+ yrs"],
  INFERRED:     [],
};

const FILTER_OPTIONS: { category: FilterCategory; label: string; icon: React.ElementType }[] = [
  { category: "TITLE",      label: "Title",           icon: Briefcase    },
  { category: "SKILL",      label: "Skill",           icon: Star         },
  { category: "CITY",       label: "Location",        icon: MapPin       },
  { category: "WORK PREF",  label: "Work Preference", icon: Home         },
  { category: "INDUSTRY",   label: "Industry",        icon: Building2    },
  { category: "LANGUAGE",   label: "Language",        icon: Languages    },
  { category: "SENIORITY",  label: "Seniority",       icon: TrendingUp   },
  { category: "EXPERIENCE", label: "Experience",      icon: CalendarDays },
];

function AddFilterChip({ onAdd }: { onAdd: (filter: ExtractedFilter) => void }) {
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
              {FILTER_VALUE_OPTIONS[category].map((value) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() =>
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
                >
                  {value}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── chip bar ─────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<FilterCategory, string> = {
  TITLE: "TITLE",
  SKILL: "SKILL",
  CITY: "CITY",
  INDUSTRY: "INDUSTRY",
  "WORK PREF": "WORK PREF",
  LANGUAGE: "LANGUAGE",
  SENIORITY: "SENIORITY",
  EXPERIENCE: "EXPERIENCE",
  INFERRED: "INFERRED · LOW CONF",
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
        {filters.map((f) => (
          <FilterChip key={f.id} filter={f} onDismiss={onDismiss} onConfirm={onConfirm} onUpdate={onUpdate} />
        ))}
        <AddFilterChip onAdd={onAdd} />
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
      </button>
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
      if (e.key === "Escape") handleReset();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
    timers.current.push(setTimeout(() => {
      setFilters(extractFilters(text));
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

  const hasResults = results !== null;
  const isSearching = chipsLoading || resultsLoading;

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <div className="max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-4">

        {/* Prompt area */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Prompt
            </span>
            <span className="text-[11px] text-muted-foreground">
              {editMode ? "⌘↵ to search" : "⌘E to edit · Esc to clear"}
            </span>
          </div>

          {editMode ? (
            <div className="flex gap-2 items-start animate-in fade-in-0 duration-200">
              <Textarea
                ref={textareaRef}
                placeholder="Describe the candidate you're looking for… e.g. Senior React developer with TypeScript, 5+ years, based in London"
                className="min-h-[3.5rem] max-h-40 resize-none text-sm"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button
                onClick={handleSearch}
                disabled={!prompt.trim()}
                className="shrink-0"
              >
                Search →
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
                onDismiss={(id) => setFilters((f) => f.filter((x) => x.id !== id))}
                onConfirm={(id) => setFilters((f) => f.map((x) => x.id === id ? { ...x, confirmed: true } : x))}
                onUpdate={handleUpdate}
                onAdd={(filter) => {
                  const sep = ", ";
                  const start = prompt.length + sep.length;
                  const end = start + filter.value.length;
                  setPrompt((p) => p + sep + filter.value);
                  setFilters((f) => [...f, {
                    ...filter,
                    confirmed: true,
                    confidence: "high",
                    matchedText: filter.value,
                    start,
                    end,
                  }]);
                }}
                onConfirmAll={() => { setFilters((f) => f.map((x) => ({ ...x, confirmed: true }))); setConfirmed(true); }}
                onDismissAll={() => setFilters([])}
              />
            </div>
          )
        )}

        {/* Suggested prompts — only before first search */}
        {!hasResults && !isSearching && (
          <div className="flex flex-col gap-2 pt-2">
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
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Clear
              </Button>
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
                    className="cursor-pointer hover:bg-accent/50 transition-colors animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
                    style={{ animationDelay: `${index * 40}ms`, animationFillMode: "both" }}
                  >
                    <CardHeader className="pb-2 pt-4 px-4">
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
                          <Badge variant="outline">{candidate.status}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 flex flex-col gap-3">
                      <p className="text-sm text-muted-foreground">{highlightSummary(candidate.summary, matchedTerms)}</p>

                      <CandidateFilterChips filters={filters} candidate={candidate} />

                      <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" variant="outline">View profile</Button>
                        <Button size="sm">Shortlist</Button>
                      </div>
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
