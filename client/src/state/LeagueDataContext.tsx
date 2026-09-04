import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { teamsApi } from "../api/teams";
import { fixturesApi } from "../api/fixtures";
import { matchesApi } from "../api/matches";
import { scoreReportsApi } from "../api/scoreReports";
import { archivesApi } from "../api/archives";
import { settingsApi } from "../api/settings";
import { groupsApi } from "../api/groups";
import type { ArchivedSeason, Fixture, Group, MatchResult, ScoreReport, Team, TournamentSettings } from "../api/types";
import { DEFAULT_TOURNAMENT_SETTINGS } from "../logic/leagueSnapshot";
import { useAuth } from "./AuthContext";

interface LeagueDataContextValue {
  teams: Team[];
  groups: Group[];
  fixtures: Fixture[];
  matches: MatchResult[];
  scoreReports: ScoreReport[];
  archives: ArchivedSeason[];
  tournamentSettings: TournamentSettings;
  isLoading: boolean;
  refetchAll: () => Promise<void>;
  refetchTeams: () => Promise<void>;
  refetchGroups: () => Promise<void>;
  refetchFixtures: () => Promise<void>;
  refetchMatches: () => Promise<void>;
  refetchScoreReports: () => Promise<void>;
  refetchArchives: () => Promise<void>;
  refetchSettings: () => Promise<void>;
}

const LeagueDataContext = createContext<LeagueDataContextValue | null>(null);

export function LeagueDataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [scoreReports, setScoreReports] = useState<ScoreReport[]>([]);
  const [archives, setArchives] = useState<ArchivedSeason[]>([]);
  const [tournamentSettings, setTournamentSettings] = useState<TournamentSettings>(DEFAULT_TOURNAMENT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const refetchTeams = useCallback(async () => setTeams(await teamsApi.list()), []);
  const refetchGroups = useCallback(async () => setGroups(await groupsApi.list()), []);
  // Fixtures live per-group -- fetch every group's fixture list (already joined with
  // that group's match results) and flatten into one array, same shape screens
  // already expect, with `.groupId` on each fixture for screens that need to scope
  // to a single group.
  const refetchFixtures = useCallback(async () => {
    const currentGroups = await groupsApi.list();
    const perGroup = await Promise.all(currentGroups.map((g) => fixturesApi.list(g.id)));
    setFixtures(perGroup.flat());
  }, []);
  const refetchMatches = useCallback(async () => setMatches(await matchesApi.list()), []);
  const refetchScoreReports = useCallback(async () => setScoreReports(await scoreReportsApi.list()), []);
  const refetchArchives = useCallback(async () => setArchives(await archivesApi.list()), []);
  const refetchSettings = useCallback(async () => setTournamentSettings(await settingsApi.get()), []);

  const refetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        refetchTeams(),
        refetchGroups(),
        refetchFixtures(),
        refetchMatches(),
        refetchScoreReports(),
        refetchArchives(),
        refetchSettings(),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [refetchTeams, refetchGroups, refetchFixtures, refetchMatches, refetchScoreReports, refetchArchives, refetchSettings]);

  useEffect(() => {
    if (profile) {
      refetchAll();
    } else {
      setTeams([]);
      setGroups([]);
      setFixtures([]);
      setMatches([]);
      setScoreReports([]);
      setArchives([]);
      setTournamentSettings(DEFAULT_TOURNAMENT_SETTINGS);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  return (
    <LeagueDataContext.Provider
      value={{
        teams,
        groups,
        fixtures,
        matches,
        scoreReports,
        archives,
        tournamentSettings,
        isLoading,
        refetchAll,
        refetchTeams,
        refetchGroups,
        refetchFixtures,
        refetchMatches,
        refetchScoreReports,
        refetchArchives,
        refetchSettings,
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
