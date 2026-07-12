import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertUser } from "@/lib/db";

/**
 * Auth.js v5。AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET /
 * AUTH_TRUST_HOST は環境変数から自動で読まれる（infra/runtime が注入）。
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    async jwt({ token, profile }) {
      // 初回サインイン時のみ profile が来る。users へ upsert して内部 ID を JWT に持たせる
      if (profile?.sub) {
        const userId = await upsertUser({
          googleSub: profile.sub,
          email: profile.email ?? "",
          name: profile.name ?? null,
        });
        token.userId = userId;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.userId === "string") {
        (session.user as { id?: string }).id = token.userId;
      }
      return session;
    },
  },
});
