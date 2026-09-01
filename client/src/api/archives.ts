import { apiDelete, apiGet, apiPost } from "./client";
import type { ArchivedSeason } from "./types";

export const archivesApi = {
  list: () => apiGet<ArchivedSeason[]>("/archives"),
  create: (input: { name: string; clearCurrentSeason: boolean }) =>
    apiPost<ArchivedSeason>("/archives", input),
  restore: (id: string) => apiPost<void>(`/archives/${id}/restore`),
  remove: (id: string) => apiDelete<void>(`/archives/${id}`),
};
