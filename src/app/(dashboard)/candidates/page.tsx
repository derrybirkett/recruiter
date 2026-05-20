"use client";

import { useState, useMemo } from "react";
import { Search, MoreHorizontal, PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CANDIDATES, type CandidateStatus } from "@/lib/data";

const STATUS_VARIANT: Record<
  CandidateStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  New: "outline",
  Shortlisted: "secondary",
  Interview: "default",
  Offer: "default",
  Rejected: "destructive",
};

export default function CandidatesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [expFilter, setExpFilter] = useState("all");

  const roles = useMemo(
    () => [...new Set(CANDIDATES.map((c) => c.role))].sort(),
    []
  );
  const locations = useMemo(
    () => [...new Set(CANDIDATES.map((c) => c.location))].sort(),
    []
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return CANDIDATES.filter((c) => {
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !c.role.toLowerCase().includes(q) &&
        !c.skills.some((s) => s.toLowerCase().includes(q))
      )
        return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (roleFilter !== "all" && c.role !== roleFilter) return false;
      if (locationFilter !== "all" && c.location !== locationFilter) return false;
      if (expFilter === "0-2" && c.experienceYears > 2) return false;
      if (
        expFilter === "3-5" &&
        (c.experienceYears < 3 || c.experienceYears > 5)
      )
        return false;
      if (
        expFilter === "6-10" &&
        (c.experienceYears < 6 || c.experienceYears > 10)
      )
        return false;
      if (expFilter === "10+" && c.experienceYears <= 10) return false;
      return true;
    });
  }, [search, statusFilter, roleFilter, locationFilter, expFilter]);

  const hasFilters =
    search ||
    statusFilter !== "all" ||
    roleFilter !== "all" ||
    locationFilter !== "all" ||
    expFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setRoleFilter("all");
    setLocationFilter("all");
    setExpFilter("all");
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="border-b px-6 py-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold">Candidates</h1>
            <p className="text-sm text-muted-foreground">
              {filtered.length} of {CANDIDATES.length} candidates
            </p>
          </div>
          <Button size="sm">
            <PlusCircle className="h-4 w-4 mr-1.5" />
            Add Candidate
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search name, role, skills…"
              className="pl-8 w-52"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Shortlisted">Shortlisted</SelectItem>
              <SelectItem value="Interview">Interview</SelectItem>
              <SelectItem value="Offer">Offer</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? "all")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={locationFilter} onValueChange={(v) => setLocationFilter(v ?? "all")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={expFilter} onValueChange={(v) => setExpFilter(v ?? "all")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Experience" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any experience</SelectItem>
              <SelectItem value="0-2">0–2 years</SelectItem>
              <SelectItem value="3-5">3–5 years</SelectItem>
              <SelectItem value="6-10">6–10 years</SelectItem>
              <SelectItem value="10+">10+ years</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-52">Candidate</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Exp.</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-16 text-muted-foreground"
                >
                  No candidates match the current filters
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((candidate) => (
                <TableRow key={candidate.id} className="cursor-pointer">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-xs">
                          {candidate.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">
                        {candidate.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {candidate.role}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {candidate.location}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {candidate.experienceYears}y
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {candidate.skills.slice(0, 3).map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="text-xs font-normal"
                        >
                          {s}
                        </Badge>
                      ))}
                      {candidate.skills.length > 3 && (
                        <Badge variant="outline" className="text-xs font-normal">
                          +{candidate.skills.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[candidate.status]}>
                      {candidate.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">
                      {candidate.matchScore}%
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {candidate.appliedDate}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="h-7 w-7" />
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View profile</DropdownMenuItem>
                        <DropdownMenuItem>Move to shortlist</DropdownMenuItem>
                        <DropdownMenuItem>Schedule interview</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                          Reject
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
