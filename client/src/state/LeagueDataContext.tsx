import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { teamsApi } from "../api/teams";
import { fixturesApi } from "../api/fixtures";
import { matchesApi } from "../api/matches";
import { scoreReportsApi } from "../api/scoreReports";
import { archivesApi } from "../api/archives";
import type { ArchivedSeason, Fixture, MatchResult, ScoreReport, Team } from "../api/types";
import { useAuth } from "./AuthContext";
import { computeStandings } from "./standings";

interface LeagueDataContextValue {
  teams: Team[];
  fixtures: Fixture[];
  matches: MatchResult[];
  scoreReports: ScoreReport[];
  archives: ArchivedSeason[];
  isLoading: boolean;
  standings: ReturnType<typeof computeStandings>;
  refetchAll: () => Promise<void>;
  refetchTeams: () => Promise<void>;
  refetchFixtures: () => Promise<void>;
  refetchMatches: () => Promise<void>;
  refetchScoreReports: () => Promise<void>;
  refetchArchives: () => Promise<void>;
}

const LeagueDataContext = createContext<LeagueDataContextValue | null>(null);

export function LeagueDataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [scoreReports, setScoreReports] = useState<ScoreReport[]>([]);
  const [archives, setArchives] = useState<ArchivedSeason[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetchTeams = useCallback(async () => setTeams(await teamsApi.list()), []);
  const refetchFixtures = useCallback(async () => setFixtures(await fixturesApi.list()), []);
  const refetchMatches = useCallback(async () => setMatches(await matchesApi.list()), []);
  const refetchScoreReports = useCallback(async () => setScoreReports(await scoreReportsApi.list()), []);
  const refetchArchives = useCallback(async () => setArchives(await archivesApi.list()), []);

  const refetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([refetchTeams(), refetchFixtures(), refetchMatches(), refetchScoreReports(), refetchArchives()]);
    } finally {
      setIsLoading(false);
    }
  }, [refetchTeams, refetchFixtures, refetchMatches, refetchScoreReports, refetchArchives]);

  useEffect(() => {
    if (profile) {
      refetchAll();
    } else {
      setTeams([]);
      setFixtures([]);
      setMatches([]);
      setScoreReports([]);
      setArchives([]);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const standings = useMemo(() => computeStandings(teams, matches), [teams, matches]);

  return (
    <LeagueDataContext.Provider
      value={{
        teams,
        fixtures,
        matches,
        scoreReports,
        archives,
        isLoading,
        standings,
        refetchAll,
        refetchTeams,
        refetchFixtures,
        refetchMatches,
        refetchScoreReports,
        refetchArchives,
      }}
    >
      {children}
    </LeagueDataContext.Provider>
  );
}

export function useLeagueData(): LeagueDataContextValue {
  const ctx = useContext(LeagueDataContext);
  if (!ctx) {
    throw new Error("useLeagueData must be used within a LeagueDataProvider");
  }
  return ctx;
}
