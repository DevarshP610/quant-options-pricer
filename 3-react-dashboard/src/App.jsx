import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Terminal,
  BookOpen,
  RefreshCw,
  Server,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Layers,
  Shuffle,
  TrendingUp,
  TrendingDown,
  Info,
  Search,
  Radio,
} from "lucide-react";

const PATH_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea",
  "#0891b2", "#db2777", "#4f46e5", "#ca8a04", "#0d9488",
  "#e11d48", "#7c3aed", "#0284c7", "#65a30d", "#ea580c",
];

// Fallback presets if testing in Offline Sandbox Mode
const SANDBOX_TICKERS = {
  SPY: { spotPrice: 582.4, annualizedVolatility: 0.145, suggestedStrike: 580, tradingDaysSampled: 252 },
  NVDA: { spotPrice: 138.6, annualizedVolatility: 0.485, suggestedStrike: 140, tradingDaysSampled: 252 },
  AAPL: { spotPrice: 231.2, annualizedVolatility: 0.224, suggestedStrike: 230, tradingDaysSampled: 252 },
  TSLA: { spotPrice: 254.8, annualizedVolatility: 0.562, suggestedStrike: 255, tradingDaysSampled: 252 },
  MSFT: { spotPrice: 428.5, annualizedVolatility: 0.215, suggestedStrike: 430, tradingDaysSampled: 252 },
};

function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
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

function computeQuantAnalytics(S, K, T, r, sigma, optionType, simulations) {
  const safeT = Math.max(T, 1e-6);
  const sqrtT = Math.sqrt(safeT);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * safeT) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const isCall = optionType === "call";

  const bsPrice = isCall
    ? S * normCDF(d1) - K * Math.exp(-r * safeT) * normCDF(d2)
    : K * Math.exp(-r * safeT) * normCDF(-d2) - S * normCDF(-d1);

  const delta = isCall ? normCDF(d1) : normCDF(d1) - 1.0;
  const gamma = normPDF(d1) / (S * sigma * sqrtT);
  const vega = (S * normPDF(d1) * sqrtT) / 100.0;
  const theta =
    isCall
      ? (-(S * normPDF(d1) * sigma) / (2 * sqrtT) -
          r * K * Math.exp(-r * safeT) * normCDF(d2)) /
        365.0
      : (-(S * normPDF(d1) * sigma) / (2 * sqrtT) +
          r * K * Math.exp(-r * safeT) * normCDF(-d2)) /
        365.0;
  const rho =
    isCall
      ? (K * safeT * Math.exp(-r * safeT) * normCDF(d2)) / 100.0
      : (-K * safeT * Math.exp(-r * safeT) * normCDF(-d2)) / 100.0;

  const probITM = (isCall ? normCDF(d2) : normCDF(-d2)) * 100;

  const nSims = Math.min(Math.max(simulations, 500), 50000);
  let sumPayoffs = 0;
  let sumSqPayoffs = 0;
  const discount = Math.exp(-r * safeT);

  for (let i = 0; i < nSims; i++) {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const ST =
      S * Math.exp((r - 0.5 * sigma * sigma) * safeT + sigma * sqrtT * z);
    const payoff = discount * (isCall ? Math.max(ST - K, 0) : Math.max(K - ST, 0));
    sumPayoffs += payoff;
    sumSqPayoffs += payoff * payoff;
  }

  const mcPrice = sumPayoffs / nSims;
  const variance = Math.max(0, sumSqPayoffs / nSims - mcPrice * mcPrice);
  const stdError = Math.sqrt(variance / nSims);

  const payoffCurve = [];
  const minSpot = Math.max(5, Math.round(K * 0.55));
  const maxSpot = Math.round(K * 1.45);
  const step = Math.max(1, Math.round((maxSpot - minSpot) / 45));

  for (let s = minSpot; s <= maxSpot; s += step) {
    const d1_s =
      (Math.log(s / K) + (r + 0.5 * sigma * sigma) * safeT) / (sigma * sqrtT);
    const d2_s = d1_s - sigma * sqrtT;
    const theo = isCall
      ? s * normCDF(d1_s) - K * discount * normCDF(d2_s)
      : K * discount * normCDF(-d2_s) - s * normCDF(-d1_s);
    const intrinsic = isCall ? Math.max(s - K, 0) : Math.max(K - s, 0);
    const spotDelta = isCall ? normCDF(d1_s) : normCDF(d1_s) - 1.0;
    const spotGamma = normPDF(d1_s) / (s * sigma * sqrtT);

    payoffCurve.push({
      spot: Number(s.toFixed(2)),
      expirationPayoff: Number(intrinsic.toFixed(2)),
      currentTheoreticalValue: Number(theo.toFixed(2)),
      netProfitAtExpiry: Number((intrinsic - bsPrice).toFixed(2)),
      delta: Number(spotDelta.toFixed(4)),
      gamma: Number(spotGamma.toFixed(4)),
    });
  }

  return {
    blackScholesPrice: bsPrice,
    monteCarloPrice: mcPrice,
    stdError,
    ci95Low: mcPrice - 1.96 * stdError,
    ci95High: mcPrice + 1.96 * stdError,
    d1,
    d2,
    probITM,
    delta,
    gamma,
    vega,
    theta,
    rho,
    payoffCurve,
  };
}

function generateSpaghettiPaths(S, T, r, sigma, numPaths = 75, numSteps = 62) {
  const safeT = Math.max(T, 1e-6);
  const dt = safeT / numSteps;
  const drift = (r - 0.5 * sigma * sigma) * dt;
  const volStep = sigma * Math.sqrt(dt);

  const paths = [];
  let minPrice = S;
  let maxPrice = S;

  for (let p = 0; p < numPaths; p++) {
    const singlePath = [S];
    let currentS = S;
    for (let step = 1; step <= numSteps; step++) {
      const u1 = Math.random() || 1e-10;
      const u2 = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      currentS = currentS * Math.exp(drift + volStep * z);
      singlePath.push(currentS);
      if (currentS < minPrice) minPrice = currentS;
      if (currentS > maxPrice) maxPrice = currentS;
    }
    paths.push(singlePath);
  }

  return { paths, minPrice, maxPrice, numSteps };
}

function MonteCarloSpaghettiCanvas({
  spotPrice,
  strikePrice,
  timeInYears,
  rateDecimal,
  volDecimal,
  numPaths,
  seed,
  whitePaperTheme,
}) {
  const canvasRef = useRef(null);

  const simData = useMemo(
    () =>
      generateSpaghettiPaths(
        spotPrice,
        timeInYears,
        rateDecimal,
        volDecimal,
        numPaths,
        62
      ),
    [spotPrice, timeInYears, rateDecimal, volDecimal, numPaths, seed]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const pad = { top: 36, right: 24, bottom: 42, left: 56 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.fillStyle = whitePaperTheme ? "#ffffff" : "#0c0c0e";
    ctx.fillRect(0, 0, width, height);

    const { paths, minPrice, maxPrice, numSteps } = simData;
    const yMin = Math.floor(Math.min(minPrice, strikePrice) * 0.96);
    const yMax = Math.ceil(Math.max(maxPrice, strikePrice) * 1.04);

    const toX = (step) => pad.left + (step / numSteps) * plotW;
    const toY = (price) =>
      pad.top + plotH - ((price - yMin) / Math.max(1e-5, yMax - yMin)) * plotH;

    ctx.strokeStyle = whitePaperTheme ? "#e5e7eb" : "#1f1f24";
    ctx.lineWidth = 1;
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const val = yMin + ((yMax - yMin) * i) / yTicks;
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();

      ctx.fillStyle = whitePaperTheme ? "#111827" : "#a1a1aa";
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(0), pad.left - 8, y + 4);
    }

    for (let step = 0; step <= numSteps; step += 10) {
      const x = toX(step);
      ctx.fillStyle = whitePaperTheme ? "#111827" : "#a1a1aa";
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(step), x, height - pad.bottom + 18);
    }

    paths.forEach((path, idx) => {
      ctx.beginPath();
      ctx.strokeStyle = PATH_COLORS[idx % PATH_COLORS.length];
      ctx.lineWidth = 1.35;
      ctx.globalAlpha = whitePaperTheme ? 0.88 : 0.82;
      for (let step = 0; step <= numSteps; step++) {
        const x = toX(step);
        const y = toY(path[step]);
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1.0;

    if (strikePrice >= yMin && strikePrice <= yMax) {
      const strikeY = toY(strikePrice);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = whitePaperTheme ? "#111827" : "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.left, strikeY);
      ctx.lineTo(width - pad.right, strikeY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = whitePaperTheme ? "#111827" : "#27272a";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    ctx.fillStyle = whitePaperTheme ? "#111827" : "#f4f4f5";
    ctx.font = "600 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `Monte-Carlo Simulation of an Asset Price (${numPaths} Paths)`,
      width / 2,
      22
    );

    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.fillText("time steps", width / 2, height - 6);

    ctx.save();
    ctx.translate(16, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Price ($)", 0, 0);
    ctx.restore();
  }, [simData, strikePrice, numPaths, whitePaperTheme]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-[340px] rounded border border-zinc-800 block"
    />
  );
}

export default function App() {
  const [uiMode, setUiMode] = useState("pro");
  const [activeTab, setActiveTab] = useState("spaghetti");
  const [whitePaperPlot, setWhitePaperPlot] = useState(false);
  const [spaghettiCount, setSpaghettiCount] = useState(80);
  const [pathSeed, setPathSeed] = useState(1);

  // --- Phase 2: Live Market Ticker State ---
  const [tickerInput, setTickerInput] = useState("NVDA");
  const [activeTicker, setActiveTicker] = useState(null);
  const [tickerLoading, setTickerLoading] = useState(false);
  const [tickerError, setTickerError] = useState(null);

  // --- Option Contract Inputs ---
  const [spotPrice, setSpotPrice] = useState(100);
  const [strikePrice, setStrikePrice] = useState(100);
  const [daysToExpiry, setDaysToExpiry] = useState(60);
  const [volatility, setVolatility] = useState(20);
  const [riskFreeRate, setRiskFreeRate] = useState(4.5);
  const [optionType, setOptionType] = useState("call");
  const [mcSimulations, setMcSimulations] = useState(25000);

  // --- Backend Connection State ---
  const [useLiveBackend, setUseLiveBackend] = useState(true);
  const [apiUrl] = useState(
    import.meta.env.VITE_CSHARP_API_URL ||
      "http://localhost:5000/api/options/price"
  );
  const [apiData, setApiData] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);

  const timeInYears = daysToExpiry / 365;
  const volDecimal = volatility / 100;
  const rateDecimal = riskFreeRate / 100;

  // --- Phase 2 Function: Fetch Live Stock Price & Historical Volatility ---
  const handleFetchMarketTicker = async (symbolToFetch) => {
    const sym = (symbolToFetch || tickerInput).trim().toUpperCase();
    if (!sym) return;
    setTickerInput(sym);
    setTickerLoading(true);
    setTickerError(null);

    const baseGatewayUrl = apiUrl.replace(/\/price$/, "");
    try {
      if (useLiveBackend) {
        const res = await fetch(`${baseGatewayUrl}/market/${sym}`);
        if (!res.ok) {
          const errMsg = await res.text();
          throw new Error(errMsg || `Ticker ${sym} not found`);
        }
        const data = await res.json();
        setSpotPrice(Number(data.spotPrice.toFixed(2)));
        setStrikePrice(Number(data.suggestedStrike.toFixed(2)));
        setVolatility(
          Number(
            Math.min(150, Math.max(5, data.annualizedVolatility * 100)).toFixed(1)
          )
        );
        setActiveTicker({
          ticker: data.ticker,
          spotPrice: data.spotPrice,
          volPct: (data.annualizedVolatility * 100).toFixed(1),
          days: data.tradingDaysSampled,
          source: "Yahoo Finance (Live)",
        });
      } else {
        // Offline Sandbox fallback
        const fallback = SANDBOX_TICKERS[sym] || {
          spotPrice: 150.0,
          annualizedVolatility: 0.3,
          suggestedStrike: 150.0,
          tradingDaysSampled: 252,
        };
        setSpotPrice(fallback.spotPrice);
        setStrikePrice(fallback.suggestedStrike);
        setVolatility(Number((fallback.annualizedVolatility * 100).toFixed(1)));
        setActiveTicker({
          ticker: sym,
          spotPrice: fallback.spotPrice,
          volPct: (fallback.annualizedVolatility * 100).toFixed(1),
          days: fallback.tradingDaysSampled,
          source: "Sandbox Preset",
        });
      }
    } catch (err) {
      setTickerError(`Could not load '${sym}' — check ticker or backend.`);
    } finally {
      setTickerLoading(false);
    }
  };

  const localAnalytics = useMemo(
    () =>
      computeQuantAnalytics(
        spotPrice,
        strikePrice,
        timeInYears,
        rateDecimal,
        volDecimal,
        optionType,
        mcSimulations
      ),
    [
      spotPrice,
      strikePrice,
      timeInYears,
      rateDecimal,
      volDecimal,
      optionType,
      mcSimulations,
    ]
  );

  useEffect(() => {
    if (!useLiveBackend) {
      setApiError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setApiError(null);
      const t0 = performance.now();
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spotPrice: Number(spotPrice),
            strikePrice: Number(strikePrice),
            timeToExpiry: Number(timeInYears),
            riskFreeRate: Number(rateDecimal),
            volatility: Number(volDecimal),
            optionType,
            simulations: Number(mcSimulations),
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setLatencyMs(Math.round(performance.now() - t0));
        setApiData(json);
      } catch (err) {
        if (err.name !== "AbortError") {
          setApiError(err.message || "Offline");
        }
      }
    }, 90);

    return () => {
      clearTimeout(timer);
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
  ]);

  const active = useMemo(() => {
    if (useLiveBackend && apiData && !apiError) {
      return {
        ...localAnalytics,
        ...apiData,
        payoffCurve:
          apiData.payoffCurve && apiData.payoffCurve.length > 0
            ? apiData.payoffCurve.map((pt, i) => ({
                ...localAnalytics.payoffCurve[i],
                ...pt,
              }))
            : localAnalytics.payoffCurve,
      };
    }
    return localAnalytics;
  }, [useLiveBackend, apiData, apiError, localAnalytics]);

  const breakEvenPrice =
    optionType === "call"
      ? strikePrice + active.blackScholesPrice
      : strikePrice - active.blackScholesPrice;

  const intrinsicNow =
    optionType === "call"
      ? Math.max(0, spotPrice - strikePrice)
      : Math.max(0, strikePrice - spotPrice);
  const extrinsicNow = Math.max(0, active.blackScholesPrice - intrinsicNow);

  const scenarioMatrix = useMemo(() => {
    const spotShifts = [-10, -5, 0, 5, 10];
    const volShifts = [-5, 0, 5];
    return volShifts.map((vShift) => {
      const testVol = Math.max(0.02, (volatility + vShift) / 100);
      return {
        volLabel: `${(testVol * 100).toFixed(0)}% Vol`,
        cells: spotShifts.map((sShift) => {
          const testSpot = Math.max(1, spotPrice * (1 + sShift / 100));
          const res = computeQuantAnalytics(
            testSpot,
            strikePrice,
            timeInYears,
            rateDecimal,
            testVol,
            optionType,
            500
          );
          const pnl = res.blackScholesPrice - active.blackScholesPrice;
          return {
            spotLabel: `${sShift >= 0 ? "+" : ""}${sShift}%`,
            theo: res.blackScholesPrice,
            pnl,
          };
        }),
      };
    });
  }, [
    spotPrice,
    strikePrice,
    timeInYears,
    rateDecimal,
    volatility,
    optionType,
    active.blackScholesPrice,
  ]);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans antialiased">
      {/* Top Institutional Command Bar */}
      <header className="border-b border-zinc-800 bg-[#0c0c0f] px-4 lg:px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-5 bg-amber-500 rounded-xs" />
              <span className="font-mono font-bold tracking-tight text-sm uppercase text-zinc-100">
                QUANTDESK
              </span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                PHASE 2 // YFINANCE LIVE FEED
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2 text-xs font-mono border-l border-zinc-800 pl-4">
              {useLiveBackend ? (
                apiError ? (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    API OFFLINE (LOCAL FALLBACK)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    C# + PYTHON CONNECTED{" "}
                    {latencyMs !== null && (
                      <span className="text-zinc-500">({latencyMs}ms)</span>
                    )}
                  </span>
                )
              ) : (
                <span className="text-zinc-400">LOCAL JS SANDBOX</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-zinc-900 p-0.5 rounded border border-zinc-800 text-xs">
              <button
                onClick={() => setUiMode("guided")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs font-medium transition ${
                  uiMode === "guided"
                    ? "bg-amber-500 text-zinc-950 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Guided Mode (Beginner)
              </button>
              <button
                onClick={() => setUiMode("pro")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs font-medium transition ${
                  uiMode === "pro"
                    ? "bg-amber-500 text-zinc-950 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                Pro Desk (Quant Sim)
              </button>
            </div>

            <div className="flex items-center bg-zinc-900 p-0.5 rounded border border-zinc-800 text-xs font-mono">
              <button
                onClick={() => setUseLiveBackend(false)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xs transition ${
                  !useLiveBackend
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                Sandbox
              </button>
              <button
                onClick={() => setUseLiveBackend(true)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xs transition ${
                  useLiveBackend
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                Live API
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workstation Container */}
      <main className="max-w-[1440px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT PANEL: Live Market Feed + Order Ticket */}
        <aside
          className={`${
            uiMode === "pro" ? "lg:col-span-3" : "lg:col-span-4"
          } bg-[#111114] border border-zinc-800/90 rounded flex flex-col justify-between`}
        >
          <div className="p-4 space-y-4">
            {/* PHASE 2: LIVE MARKET TICKER FEED BOX */}
            <div className="bg-[#09090b] border border-zinc-800 rounded p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5" />
                  Live Equity Feed (yfinance)
                </span>
                {activeTicker && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {activeTicker.ticker} ${activeTicker.spotPrice}
                  </span>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleFetchMarketTicker(tickerInput);
                }}
                className="flex gap-1.5"
              >
                <input
                  type="text"
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  placeholder="Ticker (e.g. NVDA, SPY)"
                  className="flex-1 bg-[#111114] border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-white uppercase focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={tickerLoading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono font-semibold text-xs transition cursor-pointer"
                >
                  {tickerLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  Load
                </button>
              </form>

              {/* Quick Ticker Pills */}
              <div className="flex flex-wrap gap-1">
                {["SPY", "NVDA", "AAPL", "TSLA", "MSFT"].map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleFetchMarketTicker(sym)}
                    className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 cursor-pointer"
                  >
                    {sym}
                  </button>
                ))}
              </div>

              {tickerError && (
                <div className="text-[11px] font-mono text-rose-400">
                  {tickerError}
                </div>
              )}

              {activeTicker && !tickerError && (
                <div className="text-[11px] font-mono text-zinc-400 border-t border-zinc-800/80 pt-2 flex justify-between">
                  <span>1Y Realized Vol: {activeTicker.volPct}%</span>
                  <span>({activeTicker.days}d sampled)</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                Contract Parameters
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                T = {timeInYears.toFixed(4)}y
              </span>
            </div>

            {/* Call / Put Selector */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#09090b] rounded border border-zinc-800">
              <button
                onClick={() => setOptionType("call")}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xs font-mono text-xs font-semibold transition ${
                  optionType === "call"
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                LONG CALL
              </button>
              <button
                onClick={() => setOptionType("put")}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xs font-mono text-xs font-semibold transition ${
                  optionType === "put"
                    ? "bg-rose-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                LONG PUT
              </button>
            </div>

            {/* Parameter Inputs */}
            <div className="space-y-3.5">
              {[
                {
                  label: "Underlying Spot (S)",
                  hint: "Current stock price on the market",
                  val: spotPrice,
                  setter: setSpotPrice,
                  min: 10,
                  max: 1000,
                  step: 1,
                  prefix: "$",
                },
                {
                  label: "Strike Price (K)",
                  hint: "Locked-in contract exercise price",
                  val: strikePrice,
                  setter: setStrikePrice,
                  min: 10,
                  max: 1000,
                  step: 1,
                  prefix: "$",
                },
                {
                  label: "Annual Volatility (σ)",
                  hint: "Expected annualized % swing",
                  val: volatility,
                  setter: setVolatility,
                  min: 2,
                  max: 150,
                  step: 0.5,
                  suffix: "%",
                },
                {
                  label: "Time to Expiry (Days)",
                  hint: "Calendar days until contract expires",
                  val: daysToExpiry,
                  setter: setDaysToExpiry,
                  min: 1,
                  max: 730,
                  step: 1,
                  suffix: "d",
                },
                {
                  label: "Risk-Free Rate (r)",
                  hint: "Annualized Treasury yield",
                  val: riskFreeRate,
                  setter: setRiskFreeRate,
                  min: 0,
                  max: 15,
                  step: 0.25,
                  suffix: "%",
                },
                {
                  label: "MC Simulations (N)",
                  hint: "Random pricing paths generated in Python",
                  val: mcSimulations,
                  setter: setMcSimulations,
                  min: 1000,
                  max: 100000,
                  step: 1000,
                },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 font-medium">
                      {item.label}
                    </span>
                    <div className="flex items-center bg-[#09090b] border border-zinc-800 rounded px-2 py-0.5">
                      {item.prefix && (
                        <span className="text-zinc-500 font-mono text-xs mr-0.5">
                          {item.prefix}
                        </span>
                      )}
                      <input
                        type="number"
                        min={item.min}
                        max={item.max}
                        step={item.step}
                        value={item.val}
                        onChange={(e) =>
                          item.setter(
                            Math.max(item.min, Number(e.target.value) || item.min)
                          )
                        }
                        className="w-16 bg-transparent text-right font-mono font-semibold text-amber-400 focus:outline-none tabular-nums text-xs"
                      />
                      {item.suffix && (
                        <span className="text-zinc-500 font-mono text-xs ml-0.5">
                          {item.suffix}
                        </span>
                      )}
                    </div>
                  </div>
                  {uiMode === "guided" && (
                    <p className="text-[11px] text-zinc-500">{item.hint}</p>
                  )}
                  <input
                    type="range"
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    value={item.val}
                    onChange={(e) => item.setter(Number(e.target.value))}
                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-zinc-800 bg-[#0c0c0f] space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-zinc-500">Intrinsic Value:</span>
              <span className="text-zinc-200 tabular-nums">
                ${intrinsicNow.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Extrinsic (Time) Value:</span>
              <span className="text-amber-400 tabular-nums">
                ${extrinsicNow.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-zinc-800/80">
              <span className="text-zinc-500">Break-Even at Expiry:</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                ${breakEvenPrice.toFixed(2)}
              </span>
            </div>
          </div>
        </aside>

        {/* RIGHT PANEL: Pricing Telemetry, Charts & Risk Matrices */}
        <section
          className={`${
            uiMode === "pro" ? "lg:col-span-9" : "lg:col-span-8"
          } flex flex-col gap-5`}
        >
          {uiMode === "guided" && (
            <div className="bg-[#111114] border border-amber-500/30 rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider">
                  <Info className="w-4 h-4" />
                  Plain-English Trade Summary{" "}
                  {activeTicker ? `(${activeTicker.ticker})` : ""}
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed">
                  This{" "}
                  <strong className="text-white uppercase">{optionType}</strong>{" "}
                  option costs{" "}
                  <strong className="text-emerald-400 font-mono">
                    ${active.blackScholesPrice.toFixed(2)}
                  </strong>{" "}
                  per share. At expiration in{" "}
                  <strong className="text-white">{daysToExpiry} days</strong>,
                  the stock must be{" "}
                  {optionType === "call" ? "above" : "below"}{" "}
                  <strong className="text-amber-400 font-mono">
                    ${breakEvenPrice.toFixed(2)}
                  </strong>{" "}
                  for you to make a net profit.
                </p>
              </div>
              <div className="shrink-0 bg-[#09090b] border border-zinc-800 rounded px-4 py-2.5 text-center">
                <div className="text-[11px] text-zinc-400 uppercase font-mono">
                  Prob. of Finishing ITM
                </div>
                <div className="text-2xl font-mono font-bold text-amber-400 tabular-nums mt-0.5">
                  {localAnalytics.probITM.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {/* TOP TELEMETRY STRIP */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
              <div className="text-[11px] font-mono uppercase text-zinc-400">
                Black-Scholes Theo
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-400 tabular-nums mt-1">
                ${active.blackScholesPrice.toFixed(4)}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 mt-1">
                Closed-Form Exact
              </div>
            </div>

            <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
              <div className="text-[11px] font-mono uppercase text-zinc-400">
                Monte Carlo Mean
              </div>
              <div className="text-2xl font-mono font-bold text-zinc-100 tabular-nums mt-1">
                ${active.monteCarloPrice.toFixed(4)}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 mt-1">
                95% CI: [${localAnalytics.ci95Low.toFixed(2)}, $
                {localAnalytics.ci95High.toFixed(2)}]
              </div>
            </div>

            <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
              <div className="text-[11px] font-mono uppercase text-zinc-400">
                MC Basis Error |BS - MC|
              </div>
              <div className="text-2xl font-mono font-bold text-amber-400 tabular-nums mt-1">
                $
                {Math.abs(
                  active.blackScholesPrice - active.monteCarloPrice
                ).toFixed(4)}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 mt-1">
                Std Error (SE): ±${localAnalytics.stdError.toFixed(4)}
              </div>
            </div>

            <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
              <div className="text-[11px] font-mono uppercase text-zinc-400">
                d1 / d2 Z-Scores
              </div>
              <div className="text-xl font-mono font-bold text-zinc-200 tabular-nums mt-1">
                {localAnalytics.d1.toFixed(3)}{" "}
                <span className="text-zinc-600">/</span>{" "}
                {localAnalytics.d2.toFixed(3)}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 mt-1">
                N(d2) ITM Prob: {localAnalytics.probITM.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* GREEKS STRIP */}
          <div className="bg-[#111114] border border-zinc-800 rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                First & Second-Order Sensitivities (The Greeks)
              </span>
              <span className="text-[11px] font-mono text-zinc-500">
                {uiMode === "guided"
                  ? "How your option reacts to market changes"
                  : "Partial Derivatives ∂V/∂θ"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {[
                {
                  sym: "DELTA (Δ)",
                  val: active.delta,
                  proDesc: "∂V / ∂S (Hedge Ratio)",
                  begDesc: "P&L per +$1 stock move",
                },
                {
                  sym: "GAMMA (Γ)",
                  val: active.gamma,
                  proDesc: "∂²V / ∂S² (Convexity)",
                  begDesc: "How fast Delta accelerates",
                },
                {
                  sym: "VEGA (ν)",
                  val: active.vega,
                  proDesc: "∂V / ∂σ (per 1% Vol)",
                  begDesc: "P&L per +1% volatility jump",
                },
                {
                  sym: "THETA (Θ)",
                  val: active.theta,
                  proDesc: "∂V / ∂t (Daily Carry)",
                  begDesc: "Value lost per day passing",
                },
                {
                  sym: "RHO (ρ)",
                  val: active.rho,
                  proDesc: "∂V / ∂r (per 1% Rate)",
                  begDesc: "P&L per +1% interest rate",
                },
              ].map((g) => (
                <div
                  key={g.sym}
                  className="bg-[#09090b] border border-zinc-800/80 rounded p-3"
                >
                  <div className="text-[11px] font-mono text-zinc-400">
                    {g.sym}
                  </div>
                  <div
                    className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                      g.val < 0 ? "text-rose-400" : "text-zinc-100"
                    }`}
                  >
                    {g.val >= 0 ? `+${g.val.toFixed(4)}` : g.val.toFixed(4)}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    {uiMode === "guided" ? g.begDesc : g.proDesc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MULTI-TAB VISUALIZATION WORKSTATION */}
          <div className="bg-[#111114] border border-zinc-800 rounded p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveTab("spaghetti")}
                  className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition ${
                    activeTab === "spaghetti"
                      ? "bg-amber-500 text-zinc-950 font-semibold"
                      : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                  }`}
                >
                  1. Monte Carlo Asset Paths (Spaghetti)
                </button>
                <button
                  onClick={() => setActiveTab("payoff")}
                  className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition ${
                    activeTab === "payoff"
                      ? "bg-amber-500 text-zinc-950 font-semibold"
                      : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                  }`}
                >
                  2. Payoff & Valuation Curve
                </button>
                {uiMode === "pro" && (
                  <button
                    onClick={() => setActiveTab("greeks")}
                    className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition ${
                      activeTab === "greeks"
                        ? "bg-amber-500 text-zinc-950 font-semibold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    3. Delta / Gamma Surface
                  </button>
                )}
              </div>

              {activeTab === "spaghetti" && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <select
                    value={spaghettiCount}
                    onChange={(e) => setSpaghettiCount(Number(e.target.value))}
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-300"
                  >
                    <option value={30}>30 Paths</option>
                    <option value={80}>80 Paths</option>
                    <option value={150}>150 Paths</option>
                  </select>
                  <button
                    onClick={() => setWhitePaperPlot(!whitePaperPlot)}
                    className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300"
                  >
                    {whitePaperPlot ? "Dark Terminal" : "Classic White Plot"}
                  </button>
                  <button
                    onClick={() => setPathSeed((s) => s + 1)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Resimulate
                  </button>
                </div>
              )}
            </div>

            {activeTab === "spaghetti" && (
              <div>
                <MonteCarloSpaghettiCanvas
                  spotPrice={spotPrice}
                  strikePrice={strikePrice}
                  timeInYears={timeInYears}
                  rateDecimal={rateDecimal}
                  volDecimal={volDecimal}
                  numPaths={spaghettiCount}
                  seed={pathSeed}
                  whitePaperTheme={whitePaperPlot}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-500">
                  <span>
                    Simulating {spaghettiCount} Geometric Brownian Motion paths
                    across 62 discrete time steps
                  </span>
                  <span className="text-amber-400">
                    Dashed Line = Strike Price (${strikePrice})
                  </span>
                </div>
              </div>
            )}

            {activeTab === "payoff" && (
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={active.payoffCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f24" />
                    <XAxis
                      dataKey="spot"
                      stroke="#71717a"
                      tick={{ fontSize: 11, fontFamily: "monospace" }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <YAxis
                      stroke="#71717a"
                      tick={{ fontSize: 11, fontFamily: "monospace" }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#09090b",
                        borderColor: "#27272a",
                        fontFamily: "monospace",
                        fontSize: "12px",
                      }}
                    />
                    <ReferenceLine
                      x={strikePrice}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{
                        value: `Strike $${strikePrice}`,
                        fill: "#f59e0b",
                        fontSize: 11,
                      }}
                    />
                    <ReferenceLine
                      x={spotPrice}
                      stroke="#10b981"
                      strokeDasharray="2 2"
                      label={{
                        value: `Spot $${spotPrice}`,
                        fill: "#10b981",
                        fontSize: 11,
                      }}
                    />
                    <ReferenceLine y={0} stroke="#3f3f46" />
                    <Line
                      type="monotone"
                      dataKey="currentTheoreticalValue"
                      name="Black-Scholes Value Today"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="expirationPayoff"
                      name="Intrinsic Value at Expiry"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="netProfitAtExpiry"
                      name="Net P&L at Expiry"
                      stroke="#6366f1"
                      strokeWidth={1.75}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {activeTab === "greeks" && (
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={localAnalytics.payoffCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f24" />
                    <XAxis
                      dataKey="spot"
                      stroke="#71717a"
                      tick={{ fontSize: 11, fontFamily: "monospace" }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#10b981"
                      tick={{ fontSize: 11, fontFamily: "monospace" }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#f59e0b"
                      tick={{ fontSize: 11, fontFamily: "monospace" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#09090b",
                        borderColor: "#27272a",
                        fontFamily: "monospace",
                        fontSize: "12px",
                      }}
                    />
                    <ReferenceLine
                      yAxisId="left"
                      x={strikePrice}
                      stroke="#52525b"
                      strokeDasharray="4 4"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="delta"
                      name="Delta (Δ)"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="gamma"
                      name="Gamma (Γ)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {uiMode === "pro" && (
            <div className="bg-[#111114] border border-zinc-800 rounded p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  Spot × Volatility Scenario P&L Matrix (Theo Value / Net Change)
                </span>
                <span className="text-[11px] font-mono text-zinc-500">
                  Base Premium: ${active.blackScholesPrice.toFixed(2)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="py-2 px-3 text-left">Vol \ Spot Shock</th>
                      {["-10%", "-5%", "0% (Spot)", "+5%", "+10%"].map((h) => (
                        <th key={h} className="py-2 px-3 text-right">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {scenarioMatrix.map((row) => (
                      <tr key={row.volLabel} className="hover:bg-zinc-900/40">
                        <td className="py-2.5 px-3 text-zinc-300 font-semibold">
                          {row.volLabel}
                        </td>
                        {row.cells.map((cell, i) => (
                          <td
                            key={i}
                            className="py-2.5 px-3 text-right tabular-nums"
                          >
                            <span className="text-zinc-200">
                              ${cell.theo.toFixed(2)}
                            </span>{" "}
                            <span
                              className={
                                cell.pnl >= 0
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }
                            >
                              ({cell.pnl >= 0 ? "+" : ""}
                              {cell.pnl.toFixed(2)})
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}