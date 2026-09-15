/**
 * Google's OIDC claims, reshaped into the columns our User model has.
 *
 * Auth.js hands whatever the provider's `profile()` returns straight to
 * PrismaAdapter.createUser, which passes it to `db.user.create`. The default
 * profile carries a single `name`, but User has no such column and requires
 * `firstName` and `lastName` — so without this mapping every first-time Google
 * sign-in failed inside the adapter. Pure, so it is testable without Prisma.
 */

export interface GoogleClaims {
  sub: string;
  email?: string | null;
  picture?: string | null;
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
}

export interface GoogleUser {
  /** Becomes Account.providerAccountId; Auth.js generates the User id itself. */
  id: string;
  email: string | null;
  image: string | null;
  firstName: string;
  lastName: string;
}

export function googleProfileToUser(claims: GoogleClaims): GoogleUser {
  const [nameFirst = "", ...nameRest] = (claims.name ?? "").trim().split(/\s+/);

  const firstName =
    claims.given_name?.trim() ||
    nameFirst ||
    // Google always sends an email for the `email` scope; the local part beats
    // an empty first name, which the dashboard greets the student by.
    (claims.email ?? "").split("@")[0];
  const lastName = claims.family_name?.trim() || nameRest.join(" ");

  return {
    id: claims.sub,
    email: claims.email ?? null,
    image: claims.picture ?? null,
    firstName,
    lastName,
  };
}
