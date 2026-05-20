"use client";

import { useState, useCallback } from "react";
import { Sparkles, Search, ArrowRight, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { CANDIDATES, SUGGESTED_PROMPTS, type Candidate } from "@/lib/data";

interface ScoredCandidate {
  candidate: Candidate;
  score: number;
  matchedTerms: string[];
}

function scoreCandidate(candidate: Candidate, terms: string[]): ScoredCandidate {
  const matchedTerms: string[] = [];
  let score = 0;

  const searchableText = [
    candidate.name,
    candidate.role,
    candidate.location,
    ...candidate.skills,
    candidate.summary,
  ]
    .join(" ")
    .toLowerCase();

  for (const term of terms) {
    if (searchableText.includes(term)) {
      matchedTerms.push(term);
      // Weight skills/role matches higher
      if (candidate.skills.some((s) => s.toLowerCase().includes(term))) {
        score += 20;
      } else if (candidate.role.toLowerCase().includes(term)) {
        score += 15;
      } else if (candidate.location.toLowerCase().includes(term)) {
        score += 8;
      } else {
        score += 5;
      }
    }
  }

  // Boost by existing match score
  score += candidate.matchScore * 0.3;

  return { candidate, score, matchedTerms };
}

function extractTerms(prompt: string): string[] {
  const stopwords = new Set([
    "a", "an", "the", "and", "or", "with", "for", "in", "at", "to",
    "of", "on", "is", "are", "be", "years", "year", "experience",
    "developer", "engineer", "based", "looking", "need", "want", "open",
  ]);
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s+]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopwords.has(t));
}

export default function SearchPage() {
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<ScoredCandidate[] | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = useCallback((text: string) => {
    if (!text.trim()) return;
    const terms = extractTerms(text);
    const scored = CANDIDATES.map((c) => scoreCandidate(c, terms))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    setResults(scored);
    setHasSearched(true);
  }, []);

  function handleReset() {
    setPrompt("");
    setResults(null);
    setHasSearched(false);
  }

  function handleSearch() {
    runSearch(prompt);
  }

  function handleSuggest(suggestion: string) {
    setPrompt(suggestion);
    runSearch(suggestion);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSearch();
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <div className="max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Prompt input */}
        <div className="flex flex-col gap-3">
          <Textarea
            placeholder="Describe the candidate you're looking for…&#10;e.g. Senior React developer with TypeScript, 5+ years, based in London"
            className="min-h-28 resize-none text-sm"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              ⌘ + Enter to search
            </span>
            <Button
              onClick={handleSearch}
              disabled={!prompt.trim()}
              size="sm"
            >
              <Search className="h-4 w-4 mr-1.5" />
              Search candidates
            </Button>
          </div>
        </div>

        {/* Suggested prompts */}
        {!hasSearched && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Suggested searches
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTED_PROMPTS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggest(suggestion)}
                  className="flex items-center gap-2 text-sm text-left px-3 py-2 rounded-md border hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {hasSearched && results !== null && (
          <div className="flex flex-col gap-4">
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {results.length === 0
                  ? "No matches found"
                  : `${results.length} candidate${results.length === 1 ? "" : "s"} found`}
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
                            <p className="font-medium text-sm">
                              {candidate.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {candidate.role}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={
                              candidate.matchScore >= 85
                                ? "default"
                                : "secondary"
                            }
                            className="font-mono"
                          >
                            {candidate.matchScore}% match
                          </Badge>
                          <Badge variant="outline">{candidate.status}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 flex flex-col gap-3">
                      <p className="text-sm text-muted-foreground">
                        {candidate.summary}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {candidate.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {candidate.experienceYears}y experience
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {candidate.skills.map((skill) => (
                          <Badge
                            key={skill}
                            variant={
                              matchedTerms.some((t) =>
                                skill.toLowerCase().includes(t)
                              )
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
                        <Button size="sm" variant="outline">
                          View profile
                        </Button>
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
