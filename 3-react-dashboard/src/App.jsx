import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
  Compass,
  BarChart3,
  Activity,
  Play,
} from "lucide-react";

const PATH_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea",
  "#0891b2", "#db2777", "#4f46e5", "#ca8a04", "#0d9488",
  "#e11d48", "#7c3aed", "#0284c7", "#65a30d", "#ea580c",
];

const SANDBOX_TICKERS = {
  SPY: { spotPrice: 582.4, annualizedVolatility: 0.145, suggestedStrike: 580, tradingDaysSampled: 252 },
  NVDA: { spotPrice: 186.64, annualizedVolatility: 0.384, suggestedStrike: 185, tradingDaysSampled: 250 },
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

function bsPriceJS(S, K, T, r, sigma, optionType) {
  const safeT = Math.max(T, 1e-6);
  const sqrtT = Math.sqrt(safeT);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * safeT) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discount = Math.exp(-r * safeT);
  return optionType === "call"
    ? S * normCDF(d1) - K * discount * normCDF(d2)
    : K * discount * normCDF(-d2) - S * normCDF(-d1);
}

function solveIVLocal(marketPrice, S, K, T, r, optionType) {
  const safeT = Math.max(T, 1e-6);
  const sqrtT = Math.sqrt(safeT);
  const discount = Math.exp(-r * safeT);
  const intrinsic =
    optionType === "call"
      ? Math.max(S - K * discount, 0)
      : Math.max(K * discount - S, 0);

  if (marketPrice <= intrinsic) {
    throw new Error(`Price must exceed intrinsic value ($${intrinsic.toFixed(2)})`);
  }

  let sigma = 0.3;
  for (let i = 1; i <= 100; i++) {
    const theo = bsPriceJS(S, K, safeT, r, sigma, optionType);
    const diff = theo - marketPrice;
    if (Math.abs(diff) < 1e-5) {
      return {
        impliedVolatility: sigma,
        iterations: i,
        converged: true,
        pricingError: Math.abs(diff),
      };
    }
    const d1 =
      (Math.log(S / K) + (r + 0.5 * sigma * sigma) * safeT) / (sigma * sqrtT);
    const rawVega = S * normPDF(d1) * sqrtT;
    if (rawVega < 1e-8) break;
    sigma = Math.max(0.01, Math.min(sigma - diff / rawVega, 5.0));
  }
  return {
    impliedVolatility: sigma,
    iterations: 100,
    converged: false,
    pricingError: Math.abs(bsPriceJS(S, K, safeT, r, sigma, optionType) - marketPrice),
  };
}

// Local Fallback Backtest Generator (when Sandbox Mode is active)
function generateLocalBacktest(ticker, fastWindow, slowWindow, initialCapital) {
  const days = 350;
  const prices = [100];
  let seed = ticker.charCodeAt(0) * 17 + fastWindow;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 1; i < days; i++) {
    const z = (rand() + rand() + rand() - 1.5) * 1.6;
    prices.push(prices[i - 1] * Math.exp(0.0007 + 0.021 * z));
  }

  let stratEq = initialCapital;
  let bhEq = initialCapital;
  let peak = initialCapital;
  let maxDD = 0;
  let wins = 0;
  let activeDays = 0;
  let trades = 0;
  let prevPos = 0;
  const stratReturns = [];
  const curve = [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  for (let i = slowWindow; i < days; i++) {
    const fastSlice = prices.slice(i - fastWindow + 1, i + 1);
    const slowSlice = prices.slice(i - slowWindow + 1, i + 1);
    const fastSma = fastSlice.reduce((a, b) => a + b, 0) / fastWindow;
    const slowSma = slowSlice.reduce((a, b) => a + b, 0) / slowWindow;

    const mktRet = (prices[i] - prices[i - 1]) / prices[i - 1];
    const stratRet = prevPos * mktRet;
    stratReturns.push(stratRet);

    bhEq *= 1 + mktRet;
    stratEq *= 1 + stratRet;
    if (stratEq > peak) peak = stratEq;
    const dd = ((stratEq - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;

    if (prevPos === 1) {
      activeDays++;
      if (stratRet > 0) wins++;
    }

    const signal = fastSma > slowSma ? 1 : 0;
    if (signal === 1 && prevPos === 0) trades++;
    prevPos = signal;

    if (i % 2 === 0) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      curve.push({
        date: d.toISOString().slice(0, 10),
        spot: Number(prices[i].toFixed(2)),
        fastSma: Number(fastSma.toFixed(2)),
        slowSma: Number(slowSma.toFixed(2)),
        strategyEquity: Number(stratEq.toFixed(2)),
        buyHoldEquity: Number(bhEq.toFixed(2)),
        drawdownPct: Number(dd.toFixed(2)),
      });
    }
  }

  const meanRet = stratReturns.reduce((a, b) => a + b, 0) / stratReturns.length;
  const variance =
    stratReturns.reduce((a, b) => a + (b - meanRet) ** 2, 0) /
    (stratReturns.length - 1);
  const sharpe =
    variance > 0 ? (meanRet / Math.sqrt(variance)) * Math.sqrt(252) : 0;

  return {
    ticker,
    totalReturnPct: Number((((stratEq - initialCapital) / initialCapital) * 100).toFixed(2)),
    buyHoldReturnPct: Number((((bhEq - initialCapital) / initialCapital) * 100).toFixed(2)),
    finalEquity: Number(stratEq.toFixed(2)),
    finalBuyHoldEquity: Number(bhEq.toFixed(2)),
    sharpeRatio: Number(sharpe.toFixed(2)),
    maxDrawdownPct: Number(maxDD.toFixed(2)),
    winRatePct: activeDays > 0 ? Number(((wins / activeDays) * 100).toFixed(1)) : 0,
    totalTrades: trades,
    equityCurve: curve,
  };
}

function computeQuantAnalytics(S, K, T, r, sigma, optionType, simulations) {
  const safeT = Math.max(T, 1e-6);
  const sqrtT = Math.sqrt(safeT);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * safeT) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const isCall = optionType === "call";
  const discount = Math.exp(-r * safeT);

  const bsPrice = isCall
    ? S * normCDF(d1) - K * discount * normCDF(d2)
    : K * discount * normCDF(-d2) - S * normCDF(-d1);

  const delta = isCall ? normCDF(d1) : normCDF(d1) - 1.0;
  const gamma = normPDF(d1) / (S * sigma * sqrtT);
  const vega = (S * normPDF(d1) * sqrtT) / 100.0;
  const theta =
    isCall
      ? (-(S * normPDF(d1) * sigma) / (2 * sqrtT) -
          r * K * discount * normCDF(d2)) /
        365.0
      : (-(S * normPDF(d1) * sigma) / (2 * sqrtT) +
          r * K * discount * normCDF(-d2)) /
        365.0;
  const rho =
    isCall
      ? (K * safeT * discount * normCDF(d2)) / 100.0
      : (-K * safeT * discount * normCDF(-d2)) / 100.0;

  const probITM = (isCall ? normCDF(d2) : normCDF(-d2)) * 100;

  const nSims = Math.min(Math.max(simulations, 500), 50000);
  let sumPayoffs = 0;
  let sumSqPayoffs = 0;

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

  const smileCurve = [];
  const minStrike = Math.max(10, Math.round(S * 0.7));
  const maxStrike = Math.round(S * 1.3);
  const kStep = Math.max(1, Math.round((maxStrike - minStrike) / 25));

  for (let kPt = minStrike; kPt <= maxStrike; kPt += kStep) {
    const m = Math.log(kPt / S);
    const baseVol = sigma * 100;
    const iv30d = Math.max(5, baseVol * (1 - 0.38 * m + 1.85 * m * m));
    const iv60d = Math.max(5, baseVol * (1 - 0.28 * m + 1.25 * m * m));
    const iv180d = Math.max(5, baseVol * (1 - 0.18 * m + 0.75 * m * m));

    smileCurve.push({
      strike: kPt,
      iv30d: Number(iv30d.toFixed(2)),
      iv60d: Number(iv60d.toFixed(2)),
      iv180d: Number(iv180d.toFixed(2)),
      flatBSVol: Number(baseVol.toFixed(2)),
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
    smileCurve,
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
  // --- Top-Level Module Switcher: "options" (Module 1) vs "backtest" (Module 2) ---
  const [activeModule, setActiveModule] = useState("options");

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

  // --- Phase 3: Implied Volatility Newton-Raphson Solver State ---
  const [targetMarketPrice, setTargetMarketPrice] = useState(4.5);
  const [ivResult, setIvResult] = useState(null);
  const [ivError, setIvError] = useState(null);
  const [ivLoading, setIvLoading] = useState(false);

  // --- Module 2: Strategy Backtester State ---
  const [btTicker, setBtTicker] = useState("NVDA");
  const [fastWindow, setFastWindow] = useState(20);
  const [slowWindow, setSlowWindow] = useState(50);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [btPeriod, setBtPeriod] = useState("2y");
  const [btData, setBtData] = useState(() =>
    generateLocalBacktest("NVDA", 20, 50, 10000)
  );
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState(null);
  const [btChartTab, setBtChartTab] = useState("equity"); // "equity" | "drawdown" | "signals"

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

  // --- Fetch Live Stock Price & Historical Volatility ---
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
          volPct: Number((data.annualizedVolatility * 100).toFixed(1)),
          days: data.tradingDaysSampled,
        });
      } else {
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
          volPct: Number((fallback.annualizedVolatility * 100).toFixed(1)),
          days: fallback.tradingDaysSampled,
        });
      }
    } catch (err) {
      setTickerError(`Could not load '${sym}' — check ticker or backend.`);
    } finally {
      setTickerLoading(false);
    }
  };

  // --- Solve Implied Volatility via Newton-Raphson ---
  const handleSolveImpliedVol = async (e) => {
    if (e) e.preventDefault();
    setIvLoading(true);
    setIvError(null);

    const baseGatewayUrl = apiUrl.replace(/\/price$/, "");
    try {
      if (useLiveBackend) {
        const res = await fetch(`${baseGatewayUrl}/implied-vol`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketPrice: Number(targetMarketPrice),
            spotPrice: Number(spotPrice),
            strikePrice: Number(strikePrice),
            timeToExpiry: Number(timeInYears),
            riskFreeRate: Number(rateDecimal),
            optionType,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "IV Solver rejected input");
        }
        const data = await res.json();
        setIvResult(data);
      } else {
        const localIv = solveIVLocal(
          Number(targetMarketPrice),
          Number(spotPrice),
          Number(strikePrice),
          Number(timeInYears),
          Number(rateDecimal),
          optionType
        );
        setIvResult(localIv);
      }
    } catch (err) {
      setIvError(err.message || "Failed to solve Implied Volatility");
      setIvResult(null);
    } finally {
      setIvLoading(false);
    }
  };

  // --- Module 2: Run SMA Strategy Backtest ---
  const handleRunBacktest = async (overrideTicker) => {
    const sym = (overrideTicker || btTicker).trim().toUpperCase();
    if (!sym) return;
    setBtTicker(sym);
    setBtLoading(true);
    setBtError(null);

    if (Number(fastWindow) >= Number(slowWindow)) {
      setBtError("Fast SMA Window must be smaller than Slow SMA Window.");
      setBtLoading(false);
      return;
    }

    const baseGatewayUrl = apiUrl.replace(/\/price$/, "");
    try {
      if (useLiveBackend) {
        const res = await fetch(`${baseGatewayUrl}/backtest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: sym,
            fastWindow: Number(fastWindow),
            slowWindow: Number(slowWindow),
            initialCapital: Number(initialCapital),
            period: btPeriod,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "Backtest request failed");
        }
        const json = await res.json();
        setBtData(json);
      } else {
        setBtData(
          generateLocalBacktest(
            sym,
            Number(fastWindow),
            Number(slowWindow),
            Number(initialCapital)
          )
        );
      }
    } catch (err) {
      setBtError(
        `Live API Error (${err.message}) — Showing Sandbox Simulation.`
      );
      setBtData(
        generateLocalBacktest(
          sym,
          Number(fastWindow),
          Number(slowWindow),
          Number(initialCapital)
        )
      );
    } finally {
      setBtLoading(false);
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

  const strategyAlpha = btData.totalReturnPct - btData.buyHoldReturnPct;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans antialiased">
      {/* Top Institutional Command Bar */}
      <header className="border-b border-zinc-800 bg-[#0c0c0f] px-4 lg:px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-5 bg-amber-500 rounded-xs" />
              <span className="font-mono font-bold tracking-tight text-sm uppercase text-zinc-100">
                QUANTDESK
              </span>
            </div>

            {/* MODULE NAVIGATION SWITCHER */}
            <div className="flex items-center bg-zinc-900 p-0.5 rounded border border-zinc-800 text-xs font-mono">
              <button
                onClick={() => setActiveModule("options")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs font-semibold transition cursor-pointer ${
                  activeModule === "options"
                    ? "bg-amber-500 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                1. Options Pricer & Greeks
              </button>
              <button
                onClick={() => {
                  setActiveModule("backtest");
                  handleRunBacktest(btTicker);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs font-semibold transition cursor-pointer ${
                  activeModule === "backtest"
                    ? "bg-amber-500 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                2. Strategy Backtester
              </button>
            </div>

            <div className="hidden xl:flex items-center gap-2 text-xs font-mono border-l border-zinc-800 pl-4">
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs font-medium transition cursor-pointer ${
                  uiMode === "guided"
                    ? "bg-zinc-700 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Guided Mode
              </button>
              <button
                onClick={() => setUiMode("pro")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs font-medium transition cursor-pointer ${
                  uiMode === "pro"
                    ? "bg-zinc-700 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                Pro Desk
              </button>
            </div>

            <div className="flex items-center bg-zinc-900 p-0.5 rounded border border-zinc-800 text-xs font-mono">
              <button
                onClick={() => setUseLiveBackend(false)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xs transition cursor-pointer ${
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
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xs transition cursor-pointer ${
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

      {/* =====================================================================
          MODULE 1: OPTIONS PRICER & GREEKS VISUALIZER
         ===================================================================== */}
      {activeModule === "options" && (
        <main className="max-w-[1440px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <aside
            className={`${
              uiMode === "pro" ? "lg:col-span-3" : "lg:col-span-4"
            } bg-[#111114] border border-zinc-800/90 rounded flex flex-col justify-between`}
          >
            <div className="p-4 space-y-4">
              {/* LIVE MARKET TICKER FEED BOX */}
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
                    onChange={(e) =>
                      setTickerInput(e.target.value.toUpperCase())
                    }
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

              {/* NEWTON-RAPHSON IMPLIED VOLATILITY SOLVER */}
              <div className="bg-[#09090b] border border-zinc-800 rounded p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" />
                    Implied Vol Solver (Newton)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setTargetMarketPrice(
                        Number(active.blackScholesPrice.toFixed(2))
                      )
                    }
                    className="text-[10px] font-mono text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
                  >
                    Use Theo (${active.blackScholesPrice.toFixed(2)})
                  </button>
                </div>

                <form onSubmit={handleSolveImpliedVol} className="flex gap-1.5">
                  <div className="flex-1 flex items-center bg-[#111114] border border-zinc-800 rounded px-2.5 py-1">
                    <span className="text-xs font-mono text-zinc-500 mr-1">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.01"
                      value={targetMarketPrice}
                      onChange={(e) => setTargetMarketPrice(e.target.value)}
                      className="w-full bg-transparent text-xs font-mono text-white focus:outline-none tabular-nums"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={ivLoading}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-semibold text-xs transition cursor-pointer"
                  >
                    {ivLoading ? "..." : "Solve IV"}
                  </button>
                </form>

                {ivError && (
                  <div className="text-[11px] font-mono text-rose-400">
                    {ivError}
                  </div>
                )}

                {ivResult && !ivError && (
                  <div className="border-t border-zinc-800 pt-2 space-y-1.5 text-[11px] font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Solved Implied Vol:</span>
                      <span className="text-emerald-400 font-bold text-sm">
                        {(ivResult.impliedVolatility * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-500">
                      <span>Newton Iterations: {ivResult.iterations}</span>
                      <span>Err: ${ivResult.pricingError.toFixed(5)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setVolatility(
                          Number(
                            Math.min(
                              150,
                              Math.max(2, ivResult.impliedVolatility * 100)
                            ).toFixed(1)
                          )
                        )
                      }
                      className="w-full mt-1 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-amber-400 text-[11px] font-mono cursor-pointer"
                    >
                      Apply {(ivResult.impliedVolatility * 100).toFixed(1)}% IV
                      to Sliders →
                    </button>
                  </div>
                )}
              </div>

              {/* Call / Put Selector */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#09090b] rounded border border-zinc-800">
                <button
                  onClick={() => setOptionType("call")}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xs font-mono text-xs font-semibold transition cursor-pointer ${
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
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xs font-mono text-xs font-semibold transition cursor-pointer ${
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
              <div className="space-y-3">
                {[
                  {
                    label: "Underlying Spot (S)",
                    val: spotPrice,
                    setter: setSpotPrice,
                    min: 10,
                    max: 1000,
                    step: 1,
                    prefix: "$",
                  },
                  {
                    label: "Strike Price (K)",
                    val: strikePrice,
                    setter: setStrikePrice,
                    min: 10,
                    max: 1000,
                    step: 1,
                    prefix: "$",
                  },
                  {
                    label: "Annual Volatility (σ)",
                    val: volatility,
                    setter: setVolatility,
                    min: 2,
                    max: 150,
                    step: 0.5,
                    suffix: "%",
                  },
                  {
                    label: "Time to Expiry (Days)",
                    val: daysToExpiry,
                    setter: setDaysToExpiry,
                    min: 1,
                    max: 730,
                    step: 1,
                    suffix: "d",
                  },
                  {
                    label: "Risk-Free Rate (r)",
                    val: riskFreeRate,
                    setter: setRiskFreeRate,
                    min: 0,
                    max: 15,
                    step: 0.25,
                    suffix: "%",
                  },
                  {
                    label: "MC Simulations (N)",
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
                              Math.max(
                                item.min,
                                Number(e.target.value) || item.min
                              )
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

          <section
            className={`${
              uiMode === "pro" ? "lg:col-span-9" : "lg:col-span-8"
            } flex flex-col gap-5`}
          >
            {/* TOP TELEMETRY STRIP */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
                <div className="text-[11px] font-mono uppercase text-zinc-400">
                  European Black-Scholes
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
                  American CRR Binomial
                </div>
                <div className="text-2xl font-mono font-bold text-amber-400 tabular-nums mt-1">
                  $
                  {(
                    active.americanPrice || active.blackScholesPrice
                  ).toFixed(4)}
                </div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">
                  Early Ex. Premium: +$
                  {(active.earlyExercisePremium || 0).toFixed(4)}
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
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  {
                    sym: "DELTA (Δ)",
                    val: active.delta,
                    desc: "∂V / ∂S (Hedge Ratio)",
                  },
                  {
                    sym: "GAMMA (Γ)",
                    val: active.gamma,
                    desc: "∂²V / ∂S² (Convexity)",
                  },
                  {
                    sym: "VEGA (ν)",
                    val: active.vega,
                    desc: "∂V / ∂σ (per 1% Vol)",
                  },
                  {
                    sym: "THETA (Θ)",
                    val: active.theta,
                    desc: "∂V / ∂t (Daily Carry)",
                  },
                  {
                    sym: "RHO (ρ)",
                    val: active.rho,
                    desc: "∂V / ∂r (per 1% Rate)",
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
                      {g.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MULTI-TAB VISUALIZATION WORKSTATION */}
            <div className="bg-[#111114] border border-zinc-800 rounded p-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setActiveTab("spaghetti")}
                    className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition cursor-pointer ${
                      activeTab === "spaghetti"
                        ? "bg-amber-500 text-zinc-950 font-semibold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    1. Monte Carlo Paths
                  </button>
                  <button
                    onClick={() => setActiveTab("payoff")}
                    className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition cursor-pointer ${
                      activeTab === "payoff"
                        ? "bg-amber-500 text-zinc-950 font-semibold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    2. Payoff Diagram
                  </button>
                  <button
                    onClick={() => setActiveTab("smile")}
                    className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition cursor-pointer ${
                      activeTab === "smile"
                        ? "bg-amber-500 text-zinc-950 font-semibold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    3. Volatility Smile Surface
                  </button>
                </div>

                {activeTab === "spaghetti" && (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <select
                      value={spaghettiCount}
                      onChange={(e) =>
                        setSpaghettiCount(Number(e.target.value))
                      }
                      className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-300"
                    >
                      <option value={30}>30 Paths</option>
                      <option value={80}>80 Paths</option>
                      <option value={150}>150 Paths</option>
                    </select>
                    <button
                      onClick={() => setWhitePaperPlot(!whitePaperPlot)}
                      className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 cursor-pointer"
                    >
                      {whitePaperPlot ? "Dark Terminal" : "Classic White Plot"}
                    </button>
                    <button
                      onClick={() => setPathSeed((s) => s + 1)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      Resimulate
                    </button>
                  </div>
                )}
              </div>

              {activeTab === "spaghetti" && (
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
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {activeTab === "smile" && (
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={localAnalytics.smileCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f24" />
                      <XAxis
                        dataKey="strike"
                        stroke="#71717a"
                        tick={{ fontSize: 11, fontFamily: "monospace" }}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <YAxis
                        stroke="#71717a"
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 11, fontFamily: "monospace" }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#09090b",
                          borderColor: "#27272a",
                          fontFamily: "monospace",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        wrapperStyle={{
                          fontFamily: "monospace",
                          fontSize: "11px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="iv30d"
                        name="30d Tenor IV Skew (%)"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="iv60d"
                        name="60d Tenor IV Skew (%)"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="iv180d"
                        name="180d Tenor IV Skew (%)"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {/* =====================================================================
          MODULE 2: ALGORITHMIC BACKTESTING ENGINE & STRATEGY DASHBOARD
         ===================================================================== */}
      {activeModule === "backtest" && (
        <main className="max-w-[1440px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LEFT PANEL: Strategy Configuration */}
          <aside className="lg:col-span-3 bg-[#111114] border border-zinc-800/90 rounded p-4 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  SMA Crossover Backtester
                </span>
              </div>

              {/* Ticker Input & Quick Pills */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-300 font-medium block">
                  Asset Ticker Symbol
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={btTicker}
                    onChange={(e) => setBtTicker(e.target.value.toUpperCase())}
                    className="flex-1 bg-[#09090b] border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-white uppercase focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRunBacktest(btTicker)}
                    disabled={btLoading}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono font-semibold text-xs transition cursor-pointer"
                  >
                    {btLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Run
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {["NVDA", "SPY", "AAPL", "TSLA", "MSFT", "QQQ"].map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => handleRunBacktest(sym)}
                      className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 cursor-pointer"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Historical Lookback Period */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-300 font-medium block">
                  Historical Lookback Horizon
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {["1y", "2y", "5y"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setBtPeriod(p)}
                      className={`py-1.5 rounded text-xs font-mono font-semibold border transition cursor-pointer ${
                        btPeriod === p
                          ? "bg-amber-500 text-zinc-950 border-amber-500"
                          : "bg-[#09090b] text-zinc-400 border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fast SMA Window */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Fast SMA Window</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {fastWindow} days
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="1"
                  value={fastWindow}
                  onChange={(e) => setFastWindow(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Slow SMA Window */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Slow SMA Window</span>
                  <span className="font-mono font-bold text-amber-400">
                    {slowWindow} days
                  </span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="250"
                  step="5"
                  value={slowWindow}
                  onChange={(e) => setSlowWindow(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              {/* Initial Capital */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Initial Capital</span>
                  <span className="font-mono font-bold text-zinc-100">
                    ${initialCapital.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="100000"
                  step="1000"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <button
                type="button"
                onClick={() => handleRunBacktest(btTicker)}
                disabled={btLoading}
                className="w-full py-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-semibold text-xs transition cursor-pointer"
              >
                {btLoading
                  ? "Running Vectorized Backtest..."
                  : "Execute Backtest in Python →"}
              </button>

              {btError && (
                <div className="text-[11px] font-mono text-amber-400 bg-amber-950/30 border border-amber-500/30 rounded p-2">
                  {btError}
                </div>
              )}
            </div>

            <div className="p-3 bg-[#09090b] border border-zinc-800 rounded text-[11px] font-mono text-zinc-400 space-y-1">
              <div className="text-zinc-200 font-semibold">
                Execution Rule (Zero Look-Ahead):
              </div>
              <div>• Long (1.0) when Fast SMA ({fastWindow}d) &gt; Slow SMA ({slowWindow}d)</div>
              <div>• Flat Cash (0.0) when Fast SMA &le; Slow SMA</div>
              <div>• Signal shifted +1 bar: position = signal.shift(1)</div>
            </div>
          </aside>

          {/* RIGHT PANEL: Backtest Performance Cards & Equity/Drawdown Charts */}
          <section className="lg:col-span-9 flex flex-col gap-5">
            {/* Top 5 Hedge Fund KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
                <div className="text-[11px] font-mono uppercase text-zinc-400">
                  Strategy Final Equity
                </div>
                <div className="text-xl font-mono font-bold text-emerald-400 tabular-nums mt-1">
                  ${btData.finalEquity.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-zinc-400 mt-1">
                  {btData.totalReturnPct >= 0 ? "+" : ""}
                  {btData.totalReturnPct}% Total Return
                </div>
              </div>

              <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
                <div className="text-[11px] font-mono uppercase text-zinc-400">
                  Buy & Hold Benchmark
                </div>
                <div className="text-xl font-mono font-bold text-zinc-200 tabular-nums mt-1">
                  ${btData.finalBuyHoldEquity.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-zinc-500 mt-1">
                  {btData.buyHoldReturnPct >= 0 ? "+" : ""}
                  {btData.buyHoldReturnPct}% Benchmark
                </div>
              </div>

              <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
                <div className="text-[11px] font-mono uppercase text-zinc-400">
                  Annualized Sharpe
                </div>
                <div className="text-xl font-mono font-bold text-amber-400 tabular-nums mt-1">
                  {btData.sharpeRatio.toFixed(2)}
                </div>
                <div className="text-xs font-mono text-zinc-500 mt-1">
                  Alpha: {strategyAlpha >= 0 ? "+" : ""}
                  {strategyAlpha.toFixed(1)}%
                </div>
              </div>

              <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
                <div className="text-[11px] font-mono uppercase text-zinc-400">
                  Max Drawdown
                </div>
                <div className="text-xl font-mono font-bold text-rose-400 tabular-nums mt-1">
                  {btData.maxDrawdownPct.toFixed(2)}%
                </div>
                <div className="text-xs font-mono text-zinc-500 mt-1">
                  Peak-to-Trough Drop
                </div>
              </div>

              <div className="bg-[#111114] border border-zinc-800 rounded p-3.5">
                <div className="text-[11px] font-mono uppercase text-zinc-400">
                  Active Win Rate
                </div>
                <div className="text-xl font-mono font-bold text-zinc-100 tabular-nums mt-1">
                  {btData.winRatePct}%
                </div>
                <div className="text-xs font-mono text-zinc-500 mt-1">
                  {btData.totalTrades} Crossover Entries
                </div>
              </div>
            </div>

            {/* Chart Visualization Card */}
            <div className="bg-[#111114] border border-zinc-800 rounded p-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setBtChartTab("equity")}
                    className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition cursor-pointer ${
                      btChartTab === "equity"
                        ? "bg-amber-500 text-zinc-950 font-semibold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    1. Cumulative Equity Curve ($ vs Buy & Hold)
                  </button>
                  <button
                    onClick={() => setBtChartTab("drawdown")}
                    className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition cursor-pointer ${
                      btChartTab === "drawdown"
                        ? "bg-amber-500 text-zinc-950 font-semibold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    2. Underwater Drawdown (%)
                  </button>
                  <button
                    onClick={() => setBtChartTab("signals")}
                    className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition cursor-pointer ${
                      btChartTab === "signals"
                        ? "bg-amber-500 text-zinc-950 font-semibold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    3. Asset Price & Fast/Slow SMA Overlay
                  </button>
                </div>
                <span className="text-xs font-mono text-zinc-400">
                  Ticker: <strong className="text-white">{btData.ticker}</strong>
                </span>
              </div>

              {/* CHART 1: EQUITY CURVE */}
              {btChartTab === "equity" && (
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={btData.equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f24" />
                      <XAxis
                        dataKey="date"
                        stroke="#71717a"
                        tick={{ fontSize: 11, fontFamily: "monospace" }}
                      />
                      <YAxis
                        stroke="#71717a"
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 11, fontFamily: "monospace" }}
                        tickFormatter={(v) => `$${v.toLocaleString()}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#09090b",
                          borderColor: "#27272a",
                          fontFamily: "monospace",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        wrapperStyle={{
                          fontFamily: "monospace",
                          fontSize: "12px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="strategyEquity"
                        name={`SMA (${fastWindow}/${slowWindow}) Strategy ($)`}
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="buyHoldEquity"
                        name={`Buy & Hold ${btData.ticker} ($)`}
                        stroke="#6366f1"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* CHART 2: UNDERWATER DRAWDOWN */}
              {btChartTab === "drawdown" && (
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={btData.equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f24" />
                      <XAxis
                        dataKey="date"
                        stroke="#71717a"
                        tick={{ fontSize: 11, fontFamily: "monospace" }}
                      />
                      <YAxis
                        stroke="#71717a"
                        tick={{ fontSize: 11, fontFamily: "monospace" }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#09090b",
                          borderColor: "#27272a",
                          fontFamily: "monospace",
                          fontSize: "12px",
                        }}
                      />
                      <ReferenceLine y={0} stroke="#52525b" />
                      <Area
                        type="monotone"
                        dataKey="drawdownPct"
                        name="Strategy Drawdown (%)"
                        stroke="#f43f5e"
                        fill="#f43f5e"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* CHART 3: SPOT + FAST/SLOW SMA OVERLAY */}
              {btChartTab === "signals" && (
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={btData.equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f24" />
                      <XAxis
                        dataKey="date"
                        stroke="#71717a"
                        tick={{ fontSize: 11, fontFamily: "monospace" }}
                      />
                      <YAxis
                        stroke="#71717a"
                        domain={["auto", "auto"]}
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
                      <Legend
                        wrapperStyle={{
                          fontFamily: "monospace",
                          fontSize: "12px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="spot"
                        name={`${btData.ticker} Close Price`}
                        stroke="#a1a1aa"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="fastSma"
                        name={`Fast SMA (${fastWindow}d)`}
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="slowSma"
                        name={`Slow SMA (${slowWindow}d)`}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}