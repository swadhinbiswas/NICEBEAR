/**
 * Better Auth wiring (GitHub OAuth primary, email/password secondary).
 * GitHub OAuth doubles as the asset-repo connection flow: on first OAuth
 * sign-in we persist users.github_id; connecting a repo stores
 * organizations.github_installation_id via the GitHub App install callback.
 * Full adapter config lives here once env is provided — see deployment docs.
 */
export const authConfig = {
  providers: ["github", "email-password"] as const,
  sessionCookie: { httpOnly: true, secure: true, sameSite: "lax" as const },
};
