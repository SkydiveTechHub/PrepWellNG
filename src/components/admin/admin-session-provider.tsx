"use client";

import { SessionProvider } from "next-auth/react";
import { ADMIN_AUTH_BASE_PATH } from "@/lib/admin-route";

/**
 * Points the next-auth React client at the admin instance.
 *
 * Without this, signIn()/signOut() post to the default /api/auth — the student
 * instance — because SignInOptions has no basePath field. Wrap every admin
 * client component that calls them.
 */
export function AdminSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider basePath={ADMIN_AUTH_BASE_PATH}>{children}</SessionProvider>
  );
}
