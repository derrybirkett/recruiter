"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, ArrowRight, MapPin, Clock, Pencil, X } from "lucide-react";
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

// ─── chip bar ─────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<FilterCategory, string> = {
  TITLE: "TITLE",
  SKILL: "SKILL",
  CITY: "CITY",
  INDUSTRY: "INDUSTRY",
  "WORK PREF": "WORK PREF",
  INFERRED: "INFERRED · LOW CONF",
};

function FilterChip({
  filter,
  onDismiss,
}: {
  filter: ExtractedFilter;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
        "bg-destructive/10 border-destructive/25",
        filter.confidence === "low" && "border-dashed"
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive/70 shrink-0">
        {CATEGORY_LABEL[filter.category]}
      </span>
      <span className="font-medium text-foreground">{filter.value}</span>
      <button
        onClick={() => onDismiss(filter.id)}
        className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
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
  onConfirmAll,
  onDismissAll,
}: {
  filters: ExtractedFilter[];
  confirmed: boolean;
  onDismiss: (id: string) => void;
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
          <FilterChip key={f.id} filter={f} onDismiss={onDismiss} />
        ))}
      </div>

      {!confirmed && (
        <p className="text-xs text-muted-foreground">
          Tip — anything wrong? Click × to remove a chip, or{" "}
          <button className="underline underline-offset-2">
            add a filter the prompt didn&apos;t catch
          </button>
          .
        </p>
      )}
    </div>
  );
}

// ─── highlighted prompt display ───────────────────────────────────────────────

function HighlightedPrompt({
  text,
  filters,
  onEdit,
}: {
  text: string;
  filters: ExtractedFilter[];
  onEdit: () => void;
}) {
  const segments = buildSegments(text, filters);

  return (
    <div className="relative rounded-lg border bg-background px-4 py-3 text-sm leading-7">
      <p className="pr-20">
        {segments.map((seg, i) =>
          seg.highlighted ? (
            <mark
              key={i}
              className="bg-yellow-100 dark:bg-yellow-900/40 rounded-sm px-0.5 not-italic"
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    const extracted = extractFilters(text);
    const terms = extractTerms(text);
    const scored = CANDIDATES.map((c) => scoreCandidate(c, terms))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    setFilters(extracted);
    setResults(scored);
    setEditMode(false);
    setConfirmed(false);
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

  function handleReset() {
    setPrompt("");
    setFilters([]);
    setResults(null);
    setEditMode(true);
    setConfirmed(false);
  }

  const hasResults = results !== null;

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
            <div className="flex gap-2 items-start">
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
            <HighlightedPrompt
              text={prompt}
              filters={filters}
              onEdit={() => setEditMode(true)}
            />
          )}
        </div>

        {/* Chip bar */}
        {hasResults && (
          <ChipBar
            filters={filters}
            confirmed={confirmed}
            onDismiss={(id) => setFilters((f) => f.filter((x) => x.id !== id))}
            onConfirmAll={() => setConfirmed(true)}
            onDismissAll={() => setFilters([])}
          />
        )}

        {/* Suggested prompts — only before first search */}
        {!hasResults && (
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
        {hasResults && (
          <div className="flex flex-col gap-4">
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {results.length === 0
                  ? "No matches found"
                  : `${results.length} candidate${results.length !== 1 ? "s" : ""} found`}
              </p>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Clear
              </Button>
            </div>

            {results.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground text-sm">
                  Try broadening your search — fewer keywords often return more results.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {results.map(({ candidate, matchedTerms }) => (
                  <Card
                    key={candidate.id}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
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
                            variant={candidate.matchScore >= 85 ? "default" : "secondary"}
                            className="font-mono"
                          >
                            {candidate.matchScore}%
                          </Badge>
                          <Badge variant="outline">{candidate.status}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 flex flex-col gap-3">
                      <p className="text-sm text-muted-foreground">{candidate.summary}</p>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {candidate.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {candidate.experienceYears}y exp
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {candidate.skills.map((skill) => (
                          <Badge
                            key={skill}
                            variant={
                              matchedTerms.some((t) => skill.toLowerCase().includes(t))
                                ? "default"
                                : "secondary"
                            }
                            className="text-xs font-normal"
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" variant="outline">View profile</Button>
                        <Button size="sm">Shortlist</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
