import { createAuthClient } from "better-auth/react";

/**
 * Same-origin client: cookies carry the session. better-auth requires an
 * absolute baseURL, so resolve from the browser origin (SSR fallback is
 * inert — no requests fire server-side).
 */
const baseURL =
  typeof window !== "undefined" ? `${window.location.origin}/api/auth` : "http://localhost:4321/api/auth";

export const authClient = createAuthClient({ baseURL });

export const { signUp, signIn, signOut, useSession } = {
  signUp: authClient.signUp,
  signIn: authClient.signIn,
  signOut: authClient.signOut,
  useSession: authClient.useSession,
};
