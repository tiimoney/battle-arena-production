import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { MatchResult } from "./types";

export interface MatchInput {
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  date: string;
  fixtureId?: string | null;
}

export const matchesApi = {
  list: () => apiGet<MatchResult[]>("/matches"),
  create: (input: MatchInput) => apiPost<MatchResult>("/matches", input),
  update: (id: string, input: MatchInput) => apiPut<MatchResult>(`/matches/${id}`, input),
  remove: (id: string) => apiDelete<void>(`/matches/${id}`),
};
