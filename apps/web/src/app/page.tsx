import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main style={{ textAlign: "center", paddingTop: 96 }}>
      <h1>proto-recall.ai</h1>
      <p>Google Meet にボイスエージェントを送り込むプロトタイプ</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button
          type="submit"
          style={{
            padding: "12px 24px",
            borderRadius: 8,
            border: "1px solid #ccd",
            background: "#fff",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          Google でログイン
        </button>
      </form>
    </main>
  );
}
