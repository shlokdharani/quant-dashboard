import { calculateBlackScholes } from "@/lib/blackScholes";

export default function Home() {
  const data = calculateBlackScholes({
    spotPrice: 24000,
    strikePrice: 24100,
    timeToExpiry: 30 / 365,
    volatility: 0.18,
  });

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-3xl font-bold text-slate-900">
          Quant Dashboard
        </h1>

        <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Black-Scholes Engine
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Real-time option pricing & Greeks calculation
            </p>
          </div>

          <pre className="overflow-auto rounded-lg bg-slate-50 p-4 text-sm font-medium text-slate-900">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}
