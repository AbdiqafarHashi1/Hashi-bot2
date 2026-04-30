import "./globals.css";
import type { ReactNode } from "react";
import { Sidebar } from "../components/sidebar";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="overflow-x-hidden bg-slate-950 text-slate-100">
        <div className="flex min-h-screen max-w-full flex-col md:flex-row">
          <Sidebar />
          <main className="min-w-0 max-w-full flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
