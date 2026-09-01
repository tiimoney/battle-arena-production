import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { Fixture } from "./types";

export interface GenerateFixturesInput {
  startDate: string;
  daysBetweenRounds: number;
  isDoubleRoundRobin: boolean;
}

export interface UpdateFixtureInput {
  round: number;
  teamAId: string;
  teamBId: string;
  date: string;
}

export const fixturesApi = {
  list: () => apiGet<Fixture[]>("/fixtures"),
  generate: (input: GenerateFixturesInput) => apiPost<{ count: number }>("/fixtures/generate", input),
  clear: () => apiPost<void>("/fixtures/clear"),
  shift: (days: number) => apiPost<void>("/fixtures/shift", { days }),
  update: (id: string, input: UpdateFixtureInput) => apiPut<Fixture>(`/fixtures/${id}`, input),
  remove: (id: string, deleteLinkedMatch: boolean) =>
    apiDelete<void>(`/fixtures/${id}?deleteLinkedMatch=${deleteLinkedMatch}`),
};
