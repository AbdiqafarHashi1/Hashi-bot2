import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = (await searchParams) ?? {};
  const next = Array.isArray(resolved.next) ? resolved.next[0] : resolved.next;
  const error = Array.isArray(resolved.error) ? resolved.error[0] : resolved.error;
  const nextPath = typeof next === "string" && next.length > 0
    ? next
    : "/dashboard";
  const initialError = typeof error === "string" ? error : null;

  return (
    <section className="mx-auto mt-16 w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl">
      <h1 className="text-2xl font-semibold text-slate-100">Dashboard Login</h1>
      <p className="mt-1 text-sm text-slate-400">Authentication is required to access operator controls.</p>
      <LoginForm nextPath={nextPath} initialError={initialError} />
    </section>
  );
}
