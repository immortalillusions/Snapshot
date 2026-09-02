import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Snapshot | Your day, in focus.", description: "A clear view of what is due next." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}