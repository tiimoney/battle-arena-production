import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { EntryType, Team } from "./types";

export interface TeamMemberInput {
  name: string;
  linkedUserId?: string | null;
}

export interface TeamInput {
  name: string;
  entryType: EntryType;
  members: TeamMemberInput[];
}

export const teamsApi = {
  list: () => apiGet<Team[]>("/teams"),
  create: (input: TeamInput) => apiPost<Team>("/teams", input),
  update: (id: string, input: TeamInput) => apiPut<Team>(`/teams/${id}`, input),
  remove: (id: string) => apiDelete<void>(`/teams/${id}`),
};
