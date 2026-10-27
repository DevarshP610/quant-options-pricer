import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  Cpu,
  Server,
  TrendingUp,
  TrendingDown,
  Zap,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

// --- Local Fallback Math (Only used when "Local Sandbox Mode" is active) ---
function normCDF(x) {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2.0);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}

function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function calculateLocalOption(S, K, T, r, sigma, optionType, simulations = 2000) {
  const safeT = Math.max(T, 0.0001);
  const sqrtT = Math.sqrt(safeT);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * safeT) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const isCall = optionType === "call";
  const bsPrice = isCall
    ? S * normCDF(d1) - K * Math.exp(-r * safeT) * normCDF(d2)
    : K * Math.exp(-r * safeT) * normCDF(-d2) - S * normCDF(-d1);

  const delta = isCall ? normCDF(d1) : normCDF(d1) - 1;
  const gamma = normPDF(d1) / (S * sigma * sqrtT);
  const vega = (S * normPDF(d1) * sqrtT) / 100; // per 1% vol change
  const theta =
    isCall
      ? (-(S * normPDF(d1) * sigma) / (2 * sqrtT) -
          r * K * Math.exp(-r * safeT) * normCDF(d2)) /
        365
      : (-(S * normPDF(d1) * sigma) / (2 * sqrtT) +
          r * K * Math.exp(-r * safeT) * normCDF(-d2)) /
        365;
  const rho =
    isCall
      ? (K * safeT * Math.exp(-r * safeT) * normCDF(d2)) / 100
      : (-K * safeT * Math.exp(-r * safeT) * normCDF(-d2)) / 100;

  // Quick Box-Muller Monte Carlo
  let payoffSum = 0;
  for (let i = 0; i < simulations; i++) {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const ST =
      S * Math.exp((r - 0.5 * sigma * sigma) * safeT + sigma * sqrtT * z);
    const payoff = isCall ? Math.max(ST - K, 0) : Math.max(K - ST, 0);
    payoffSum += payoff;
  }
  const mcPrice = Math.exp(-r * safeT) * (payoffSum / simulations);

  // Payoff Curve across Spot Range
  const payoffSeries = [];
  const minSpot = Math.max(10, Math.round(K * 0.5));
  const maxSpot = Math.round(K * 1.5);
  const step = Math.max(1, Math.round((maxSpot - minSpot) / 40));

  for (let spot = minSpot; spot <= maxSpot; spot += step) {
    const d1_s =
      (Math.log(spot / K) + (r + 0.5 * sigma * sigma) * safeT) /
      (sigma * sqrtT);
    const d2_s = d1_s - sigma * sqrtT;
    const theoValue = isCall
      ? spot * normCDF(d1_s) - K * Math.exp(-r * safeT) * normCDF(d2_s)
      : K * Math.exp(-r * safeT) * normCDF(-d2_s) - spot * normCDF(-d1_s);
    const intrinsic = isCall ? Math.max(spot - K, 0) : Math.max(K - spot, 0);

    payoffSeries.push({
      spot: Number(spot.toFixed(2)),
      expirationPayoff: Number(intrinsic.toFixed(2)),
      currentTheoreticalValue: Number(theoValue.toFixed(2)),
      netProfitAtExpiry: Number((intrinsic - bsPrice).toFixed(2)),
    });
  }

  return {
    blackScholesPrice: bsPrice,
    monteCarloPrice: mcPrice,
    delta,
    gamma,
    vega,
    theta,
    rho,
    payoffCurve: payoffSeries,
  };
}

export default function App() {
  // --- Option Input State ---
  const [spotPrice, setSpotPrice] = useState(100);
  const [strikePrice, setStrikePrice] = useState(100);
  const [daysToExpiry, setDaysToExpiry] = useState(90);
  const [volatility, setVolatility] = useState(25); // in %
  const [riskFreeRate, setRiskFreeRate] = useState(4.5); // in %
  const [optionType, setOptionType] = useState("call");
  const [mcSimulations, setMcSimulations] = useState(10000);

  // --- Backend Connection State ---
  const [useLiveBackend, setUseLiveBackend] = useState(false);
  const [apiUrl, setApiUrl] = useState(
  import.meta.env.VITE_CSHARP_API_URL || "http://localhost:5000/api/options/price"
);
  const [apiData, setApiData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  const timeInYears = daysToExpiry / 365;
  const volDecimal = volatility / 100;
  const rateDecimal = riskFreeRate / 100;

  // --- Calculate Local Data ---
  const localResult = useMemo(() => {
    return calculateLocalOption(
      spotPrice,
      strikePrice,
      timeInYears,
      rateDecimal,
      volDecimal,
      optionType,
      Math.min(mcSimulations, 5000)
    );
  }, [spotPrice, strikePrice, timeInYears, rateDecimal, volDecimal, optionType, mcSimulations]);

  // --- Fetch from C# + Python Backend when Live Mode is Enabled ---
  useEffect(() => {
    if (!useLiveBackend) {
      setApiError(null);
      return;
    }

    const controller = new AbortController();
    const fetchFromBackend = async () => {
      setLoading(true);
      setApiError(null);
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spotPrice: Number(spotPrice),
            strikePrice: Number(strikePrice),
            timeToExpiry: Number(timeInYears),
            riskFreeRate: Number(rateDecimal),
            volatility: Number(volDecimal),
            optionType: optionType,
            simulations: Number(mcSimulations),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`C# API returned HTTP ${response.status}`);
        }
        const json = await response.json();
        setApiData({
          ...json,
          payoffCurve: json.payoffCurve || localResult.payoffCurve,
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          setApiError(err.message || "Failed to connect to C# API on Port 5000");
        }
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchFromBackend, 120);
    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [
    useLiveBackend,
    apiUrl,
    spotPrice,
    strikePrice,
    timeInYears,
    rateDecimal,
    volDecimal,
    optionType,
    mcSimulations,
    localResult.payoffCurve,
  ]);

  const activeData = useLiveBackend && apiData && !apiError ? apiData : localResult;
  const mcDiff = Math.abs(
    activeData.blackScholesPrice - activeData.monteCarloPrice
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">
      {/* Top Header */}
      <header className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Activity className="w-6 h-6" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              QuantDesk{" "}
              <span className="text-emerald-400 font-mono text-lg font-normal">
                v1.0 // Black-Scholes & Monte Carlo Engine
              </span>
            </h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            React Visualization Layer → C# ASP.NET Core Gateway → Python
            SciPy/NumPy Pricing Engine
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-900/90 p-2 rounded-xl border border-slate-800">
          <button
            onClick={() => setUseLiveBackend(false)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              !useLiveBackend
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-4 h-4" />
            Local Sandbox Mode
          </button>

          <button
            onClick={() => setUseLiveBackend(true)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              useLiveBackend
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Server className="w-4 h-4" />
            Live C# + Python API
          </button>
        </div>
      </header>

      {/* Connection Banner when Live Mode is active */}
      {useLiveBackend && (
        <div className="max-w-7xl mx-auto mt-4">
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 rounded-xl border text-xs ${
              apiError
                ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
                : "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              ) : apiError ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>
                {loading
                  ? "Querying C# Gateway -> Python Engine..."
                  : apiError
                  ? `Backend Offline (${apiError}) — Showing Local Fallback Math until you boot C# & Python!`
                  : "Connected live to C# Gateway & Python FastAPI Engine!"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Endpoint:</span>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs w-64"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Controls & Sliders (4 cols) */}
        <section className="lg:col-span-4 bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Contract Parameters
            </h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              T = {timeInYears.toFixed(3)} yrs
            </span>
          </div>

          {/* Call / Put Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => setOptionType("call")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                optionType === "call"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              CALL OPTION
            </button>
            <button
              onClick={() => setOptionType("put")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                optionType === "put"
                  ? "bg-rose-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              PUT OPTION
            </button>
          </div>

          {/* Parameter Sliders */}
          <div className="space-y-4">
            {/* Spot Price */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Spot Price (S)</span>
                <span className="font-mono font-bold text-emerald-400">
                  ${spotPrice.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                step="1"
                value={spotPrice}
                onChange={(e) => setSpotPrice(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Strike Price */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Strike Price (K)</span>
                <span className="font-mono font-bold text-indigo-400">
                  ${strikePrice.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                step="1"
                value={strikePrice}
                onChange={(e) => setStrikePrice(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Volatility */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Implied Volatility (σ)</span>
                <span className="font-mono font-bold text-amber-400">
                  {volatility.toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="120"
                step="0.5"
                value={volatility}
                onChange={(e) => setVolatility(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Days to Expiry */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Days to Expiry (T)</span>
                <span className="font-mono font-bold text-cyan-400">
                  {daysToExpiry} days
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="730"
                step="1"
                value={daysToExpiry}
                onChange={(e) => setDaysToExpiry(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Risk-Free Rate */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Risk-Free Rate (r)</span>
                <span className="font-mono font-bold text-purple-400">
                  {riskFreeRate.toFixed(2)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                step="0.25"
                value={riskFreeRate}
                onChange={(e) => setRiskFreeRate(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            {/* Monte Carlo Paths */}
            <div className="pt-2 border-t border-slate-800">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Monte Carlo Paths (N)</span>
                <span className="font-mono font-bold text-slate-200">
                  {mcSimulations.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min="500"
                max="100000"
                step="500"
                value={mcSimulations}
                onChange={(e) => setMcSimulations(Number(e.target.value))}
                className="w-full accent-slate-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Moneyness Badge */}
          <div className="mt-auto p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Contract Status:</span>
            <span className="font-mono font-bold uppercase px-2.5 py-1 rounded bg-slate-800 text-white">
              {spotPrice === strikePrice
                ? "At-The-Money (ATM)"
                : (optionType === "call" && spotPrice > strikePrice) ||
                  (optionType === "put" && spotPrice < strikePrice)
                ? "In-The-Money (ITM)"
                : "Out-Of-The-Money (OTM)"}
            </span>
          </div>
        </section>

        {/* RIGHT COLUMN: Pricing Cards, Greeks & Charts (8 cols) */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          {/* Top Pricing Comparison Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
              <span className="text-xs uppercase tracking-wider text-slate-400">
                Black-Scholes Price
              </span>
              <div className="text-3xl font-mono font-bold text-emerald-400 mt-1">
                ${activeData.blackScholesPrice.toFixed(4)}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                Exact analytical solution
              </span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
              <span className="text-xs uppercase tracking-wider text-slate-400">
                Monte Carlo Price
              </span>
              <div className="text-3xl font-mono font-bold text-indigo-400 mt-1">
                ${activeData.monteCarloPrice.toFixed(4)}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                Simulated ({mcSimulations.toLocaleString()} random paths)
              </span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
              <span className="text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Convergence Error
              </span>
              <div className="text-3xl font-mono font-bold text-amber-400 mt-1">
                ${mcDiff.toFixed(4)}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                |Black-Scholes − Monte Carlo|
              </span>
            </div>
          </div>

          {/* The 5 Greeks Grid */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              First & Second-Order Sensitivities (The Greeks)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                {
                  name: "Delta (Δ)",
                  val: activeData.delta,
                  desc: "dV / dS (per $1 spot)",
                  color: "text-emerald-400",
                },
                {
                  name: "Gamma (Γ)",
                  val: activeData.gamma,
                  desc: "d²V / dS² (convexity)",
                  color: "text-cyan-400",
                },
                {
                  name: "Vega (ν)",
                  val: activeData.vega,
                  desc: "dV / dσ (per 1% vol)",
                  color: "text-amber-400",
                },
                {
                  name: "Theta (Θ)",
                  val: activeData.theta,
                  desc: "dV / dt (daily decay)",
                  color: "text-rose-400",
                },
                {
                  name: "Rho (ρ)",
                  val: activeData.rho,
                  desc: "dV / dr (per 1% rate)",
                  color: "text-purple-400",
                },
              ].map((g) => (
                <div
                  key={g.name}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5"
                >
                  <div className="text-xs text-slate-400 font-medium">
                    {g.name}
                  </div>
                  <div className={`text-xl font-mono font-bold mt-1 ${g.color}`}>
                    {g.val >= 0 ? `+${g.val.toFixed(4)}` : g.val.toFixed(4)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{g.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Payoff & Theoretical Value Chart */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex-1 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Option Valuation & Expiration Payoff Diagram
                </h3>
                <p className="text-xs text-slate-400">
                  Compare curved Black-Scholes value today vs. hockey-stick
                  intrinsic value at expiration
                </p>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeData.payoffCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="spot"
                    stroke="#94a3b8"
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis stroke="#94a3b8" tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "0.75rem",
                    }}
                  />
                  <Legend />
                  <ReferenceLine
                    x={strikePrice}
                    stroke="#6366f1"
                    strokeDasharray="4 4"
                    label={{
                      value: `Strike $${strikePrice}`,
                      fill: "#818cf8",
                      fontSize: 11,
                    }}
                  />
                  <ReferenceLine
                    x={spotPrice}
                    stroke="#10b981"
                    strokeDasharray="2 2"
                    label={{
                      value: `Spot $${spotPrice}`,
                      fill: "#34d399",
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentTheoreticalValue"
                    name="Black-Scholes Value Today"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="expirationPayoff"
                    name="Intrinsic Value at Expiry"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}