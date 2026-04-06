import "./globals.css";
import type { ReactNode } from "react";
import { Sidebar } from "../components/sidebar";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
