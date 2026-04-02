export default function Page() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Strategies</h1>
      <p className="text-slate-300">Contract registry placeholder (no production strategies yet).</p>
      <div className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-semibold">Registered Modules</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
          <li>demo-shape (mock contract validation strategy)</li>
        </ul>
      </div>
    </section>
  );
}
