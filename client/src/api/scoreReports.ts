import { apiDelete, apiGet, apiPost } from "./client";
import type { ScoreReport } from "./types";

export const scoreReportsApi = {
  list: (fixtureId?: string) => apiGet<ScoreReport[]>(fixtureId ? `/score-reports?fixtureId=${fixtureId}` : "/score-reports"),
  submit: (input: { fixtureId: string; scoreA: number; scoreB: number }) =>
    apiPost<{ report: ScoreReport; approved: boolean }>("/score-reports", input),
  approve: (id: string) => apiPost<void>(`/score-reports/${id}/approve`),
  remove: (id: string) => apiDelete<void>(`/score-reports/${id}`),
};
