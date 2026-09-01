// Pure transform: raw Firestore dump -> a plan of Prisma upserts. No I/O here, so it's
// unit-testable without touching Firebase or Postgres -- see test/transform.test.ts.
//
// Every migrated User gets passwordHash = null (an "unclaimed" placeholder): Firebase
// never exposes the original password, so returning users re-register via sign-up,
// which "claims" the matching placeholder by email instead of creating a fresh row.
// See server/src/routes/auth.ts and migration/README.md.

export interface FirestoreProfile {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "competitor";
  teamId?: string | null;
}

export interface FirestoreTeamMember {
  id: string;
  name: string;
  linkedUserId?: string | null;
}

export interface FirestoreTeam {
  id: string;
  name: string;
  teamSize: number;
  entryType: "individual" | "team";
  members: FirestoreTeamMember[];
}

export interface FirestoreFixture {
  id: string;
  round: number;
  leg: number;
  teamAId: string;
  teamBId: string;
  date: string;
}

export interface FirestoreMatch {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  date: string;
  fixtureId?: string | null;
}

export interface FirestoreScoreReport {
  id: string;
  fixtureId: string;
  teamAId: string;
  teamBId: string;
  reporterUserId: string;
  reporterTeamId: string;
  teamAScore: number;
  teamBScore: number;
  reportedAt: string;
}

export interface FirestoreArchivedSeason {
  id: string;
  name: string;
  archivedAt: string;
  teams: FirestoreTeam[];
  fixtures: FirestoreFixture[];
  matches: FirestoreMatch[];
}

export interface FirestoreDump {
  profiles: FirestoreProfile[];
  leagueState: {
    teams: FirestoreTeam[];
    fixtures: FirestoreFixture[];
    archivedSeasons: FirestoreArchivedSeason[];
  };
  approvedResults: FirestoreMatch[];
  scoreReports: FirestoreScoreReport[];
}

export interface MigrationPlan {
  users: { id: string; email: string; displayName: string; role: "admin" | "competitor" }[];
  teams: {
    id: string;
    name: string;
    teamSize: number;
    entryType: "individual" | "team";
    members: { id: string; name: string; linkedUserId: string | null }[];
  }[];
  userTeamAssignments: { userId: string; teamId: string }[];
  fixtures: FirestoreFixture[];
  matches: FirestoreMatch[];
  scoreReports: FirestoreScoreReport[];
  archivedSeasons: FirestoreArchivedSeason[];
  warnings: string[];
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeName(name: string): string {
  return cleanName(name).toLowerCase();
}

export function buildMigrationPlan(dump: FirestoreDump): MigrationPlan {
  const warnings: string[] = [];
  const profileIds = new Set(dump.profiles.map((p) => p.id));
  const teamIds = new Set(dump.leagueState.teams.map((t) => t.id));

  // Display names are unique in the new schema (they double as a login identifier),
  // but Firestore never enforced that -- disambiguate any collisions among the
  // migrated profiles rather than let the later upsert fail outright.
  const seenDisplayNames = new Set<string>();
  const users = dump.profiles.map((p) => {
    let displayName = cleanName(p.displayName);
    let normalized = normalizeName(displayName);
    let suffix = 2;
    while (seenDisplayNames.has(normalized)) {
      displayName = `${cleanName(p.displayName)} (${suffix})`;
      normalized = normalizeName(displayName);
      suffix += 1;
    }
    if (normalized !== normalizeName(p.displayName)) {
      warnings.push(
        `Profile ${p.id} (${p.email}) display name "${p.displayName}" collides with another migrated profile; renamed to "${displayName}".`,
      );
    }
    seenDisplayNames.add(normalized);
    return { id: p.id, email: p.email, displayName, role: p.role };
  });

  const userTeamAssignments: { userId: string; teamId: string }[] = [];
  for (const profile of dump.profiles) {
    if (!profile.teamId) continue;
    if (!teamIds.has(profile.teamId)) {
      warnings.push(
        `Profile ${profile.id} (${profile.email}) references missing team ${profile.teamId}; skipping team assignment.`,
      );
      continue;
    }
    userTeamAssignments.push({ userId: profile.id, teamId: profile.teamId });
  }

  const teams = dump.leagueState.teams.map((team) => ({
    id: team.id,
    name: team.name,
    teamSize: team.teamSize,
    entryType: team.entryType,
    members: team.members.map((member) => {
      let linkedUserId = member.linkedUserId ?? null;
      if (linkedUserId && !profileIds.has(linkedUserId)) {
        warnings.push(
          `Team ${team.id} member ${member.id} links to missing profile ${linkedUserId}; dropping the link.`,
        );
        linkedUserId = null;
      }
      return { id: member.id, name: member.name, linkedUserId };
    }),
  }));

  const fixtures = dump.leagueState.fixtures.filter((fixture) => {
    const ok = teamIds.has(fixture.teamAId) && teamIds.has(fixture.teamBId);
    if (!ok) {
      warnings.push(`Fixture ${fixture.id} references a missing team; skipping.`);
    }
    return ok;
  });
  const fixtureIds = new Set(fixtures.map((f) => f.id));

  const matches = dump.approvedResults
    .map((match) => {
      if (match.fixtureId && !fixtureIds.has(match.fixtureId)) {
        warnings.push(`Match ${match.id} references missing fixture ${match.fixtureId}; importing as unlinked.`);
        return { ...match, fixtureId: null };
      }
      return match;
    })
    .filter((match) => {
      const ok = teamIds.has(match.teamAId) && teamIds.has(match.teamBId);
      if (!ok) {
        warnings.push(`Match ${match.id} references a missing team; skipping.`);
      }
      return ok;
    });

  const scoreReports = dump.scoreReports.filter((report) => {
    if (!fixtureIds.has(report.fixtureId)) {
      warnings.push(`Score report ${report.id} references missing fixture ${report.fixtureId}; skipping.`);
      return false;
    }
    if (!profileIds.has(report.reporterUserId)) {
      warnings.push(`Score report ${report.id} references missing profile ${report.reporterUserId}; skipping.`);
      return false;
    }
    return true;
  });

  return {
    users,
    teams,
    userTeamAssignments,
    fixtures,
    matches,
    scoreReports,
    archivedSeasons: dump.leagueState.archivedSeasons,
    warnings,
  };
}
