import { apiGet, apiPost } from "./client";
import type { LeagueExport } from "./types";

export const leagueApi = {
  export: () => apiGet<LeagueExport>("/league/export"),
  import: (data: unknown, mode: "merge" | "replace") =>
    apiPost<void>(`/league/import?mode=${mode}`, data),
  reset: () => apiPost<void>("/league/reset"),
};
