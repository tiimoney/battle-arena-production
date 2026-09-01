import { apiGet, apiPost } from "./client";
import type { Profile, SignUpResult } from "./types";

export const authApi = {
  me: () => apiGet<Profile>("/auth/me"),
  signUp: (input: { displayName: string; email: string; password: string }) =>
    apiPost<SignUpResult>("/auth/signup", input),
  // `identifier` accepts either the account's email or its (unique) display name.
  signIn: (input: { identifier: string; password: string }) => apiPost<Profile>("/auth/login", input),
  signOut: () => apiPost<void>("/auth/logout"),
  resendVerification: (identifier: string) =>
    apiPost<{ message: string }>("/auth/resend-verification", { identifier }),
};
