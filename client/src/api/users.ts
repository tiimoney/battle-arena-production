import { apiDelete, apiGet, apiPost } from "./client";
import type { Profile } from "./types";

export const usersApi = {
  list: () => apiGet<Profile[]>("/users"),
  assignTeam: (userId: string, teamId: string) => apiPost<Profile>(`/users/${userId}/team`, { teamId }),
  clearTeam: (userId: string) => apiDelete<Profile>(`/users/${userId}/team`),
};
