import type { ReactNode } from "react";

export const metadata = {
  title: "proto-recall.ai",
  description: "Google Meet に音声で会話できる AI エージェントを送り込むプロトタイプ",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#f6f7fb",
          color: "#1a2033",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>{children}</div>
      </body>
    </html>
  );
}
