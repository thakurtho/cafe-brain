import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Outlet Brain",
  description: "Voice-first knowledge and operations app for cafés.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
