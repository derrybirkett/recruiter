export type FilterCategory =
  | "TITLE"
  | "SKILL"
  | "CITY"
  | "INDUSTRY"
  | "WORK PREF"
  | "LANGUAGE"
  | "SENIORITY"
  | "EXPERIENCE"
  | "INFERRED";

export interface ExtractedFilter {
  id: string;
  category: FilterCategory;
  value: string;
  matchedText: string;
  confidence: "high" | "low";
  confirmed: boolean;
  start: number;
  end: number;
}

// ─── lookup tables ───────────────────────────────────────────────────────────

const CITY_COUNTRY: Record<string, string> = {
  london: "UK", berlin: "DE", manchester: "UK", birmingham: "UK",
  edinburgh: "UK", amsterdam: "NL", paris: "FR", munich: "DE",
  barcelona: "ES", madrid: "ES", lisbon: "PT", dublin: "IE",
  zurich: "CH", singapore: "SG", toronto: "CA", sydney: "AU",
};

const SENIORITY_YEARS: Record<string, string> = {
  senior: "6+ yrs",
  junior: "0–2 yrs",
  "mid-level": "3–5 yrs",
  lead: "8+ yrs",
  principal: "10+ yrs",
  staff: "10+ yrs",
};

const SKILLS = [
  "React", "TypeScript", "JavaScript", "Python", "Node\\.js", "Go",
  "Rust", "Java", "Kotlin", "Swift", "Ruby", "PHP", "GraphQL", "SQL",
  "PostgreSQL", "MongoDB", "Redis", "Docker", "Kubernetes", "AWS", "GCP",
  "Azure", "Next\\.js", "Django", "FastAPI", "Spring", "Figma",
  "Terraform", "Kafka", "Elasticsearch", "tRPC", "Prisma",
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

let uid = 0;
function nextId() {
  return String(uid++);
}

function findAll(
  text: string,
  pattern: RegExp
): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];
  for (const m of text.matchAll(pattern)) {
    results.push({ text: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  return results;
}

// ─── extraction ───────────────────────────────────────────────────────────────

export function extractFilters(text: string): ExtractedFilter[] {
  uid = 0;
  const filters: ExtractedFilter[] = [];

  // TITLE — role phrases
  const TITLE_RE =
    /\b(?:(?:senior|junior|mid-?level|lead|principal|staff|head\s+of)\s+)?(?:backend|frontend|full[\s-]?stack|software|platform|data|ml|ai|devops|mobile|ios|android)\s+(?:engineer|developer|architect)\b|\bproduct\s+(?:manager|designer|director)\b|\bdata\s+scientist\b|\bux\s+(?:designer|researcher)\b/gi;
  for (const m of findAll(text, TITLE_RE)) {
    filters.push({
      id: nextId(),
      category: "TITLE",
      value: titleCase(m.text),
      matchedText: m.text,
      confidence: "high",
      confirmed: false,
      start: m.start,
      end: m.end,
    });
  }

  // SKILL — named technologies
  const SKILL_RE = new RegExp(`\\b(${SKILLS.join("|")})\\b`, "gi");
  for (const m of findAll(text, SKILL_RE)) {
    // Preserve original casing for well-known names
    const canonical =
      SKILLS.find((s) => s.replace("\\.", ".").toLowerCase() === m.text.toLowerCase())
        ?.replace("\\.", ".") ?? titleCase(m.text);
    filters.push({
      id: nextId(),
      category: "SKILL",
      value: canonical,
      matchedText: m.text,
      confidence: "high",
      confirmed: false,
      start: m.start,
      end: m.end,
    });
  }

  // CITY — location names
  const CITY_RE = new RegExp(`\\b(${Object.keys(CITY_COUNTRY).join("|")})\\b`, "gi");
  for (const m of findAll(text, CITY_RE)) {
    const key = m.text.toLowerCase();
    const country = CITY_COUNTRY[key] ?? "";
    filters.push({
      id: nextId(),
      category: "CITY",
      value: `${capitalize(m.text)}${country ? `, ${country}` : ""}`,
      matchedText: m.text,
      confidence: "high",
      confirmed: false,
      start: m.start,
      end: m.end,
    });
  }

  // WORK PREF — remote / hybrid / onsite
  const WORK_PREF_RE =
    /\b(?:fully\s+)?remote|hybrid|on-?site|eu[- ]remote|uk[- ]remote\b/gi;
  for (const m of findAll(text, WORK_PREF_RE)) {
    filters.push({
      id: nextId(),
      category: "WORK PREF",
      value: titleCase(m.text.replace(/-/g, " ")),
      matchedText: m.text,
      confidence: "high",
      confirmed: false,
      start: m.start,
      end: m.end,
    });
  }

  // INDUSTRY — sector keywords
  const INDUSTRY_RE =
    /\b(?:ai[- ]native|ai\/ml|fintech|healthtech|edtech|saas|b2b|startup|scale[- ]?up|enterprise)\b/gi;
  for (const m of findAll(text, INDUSTRY_RE)) {
    const normalised = m.text
      .replace(/ai[- ]native/i, "AI / ML startups")
      .replace(/ai\/ml/i, "AI / ML")
      .replace(/scale[- ]?up/i, "Scale-up");
    filters.push({
      id: nextId(),
      category: "INDUSTRY",
      value: normalised.charAt(0).toUpperCase() + normalised.slice(1),
      matchedText: m.text,
      confidence: "high",
      confirmed: false,
      start: m.start,
      end: m.end,
    });
  }

  // INFERRED — seniority level → years
  const SEN_RE = /\b(senior|junior|mid-level|lead|principal|staff)\b/gi;
  const seen = new Set<string>();
  for (const m of findAll(text, SEN_RE)) {
    const key = m.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const years = SENIORITY_YEARS[key];
    if (years) {
      filters.push({
        id: nextId(),
        category: "INFERRED",
        value: `Seniority: ${years}`,
        matchedText: m.text,
        confidence: "low",
        confirmed: false,
        start: m.start,
        end: m.end,
      });
    }
  }

  return deduplicateBySpan(filters);
}

// Remove exact-span duplicates (same start+end) keeping first occurrence
function deduplicateBySpan(filters: ExtractedFilter[]): ExtractedFilter[] {
  const seen = new Set<string>();
  return filters.filter((f) => {
    const key = `${f.start}-${f.end}-${f.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── highlight range helpers ──────────────────────────────────────────────────

export interface TextSegment {
  text: string;
  highlighted: boolean;
}

export function buildSegments(
  text: string,
  filters: ExtractedFilter[]
): TextSegment[] {
  const ranges = filters
    .map((f) => ({ start: f.start, end: f.end }))
    .sort((a, b) => a.start - b.start);

  // Merge overlapping ranges
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const segments: TextSegment[] = [];
  let pos = 0;
  for (const r of merged) {
    if (r.start > pos)
      segments.push({ text: text.slice(pos, r.start), highlighted: false });
    segments.push({ text: text.slice(r.start, r.end), highlighted: true });
    pos = r.end;
  }
  if (pos < text.length)
    segments.push({ text: text.slice(pos), highlighted: false });

  return segments;
}
