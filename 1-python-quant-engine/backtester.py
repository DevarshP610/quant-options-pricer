import warnings
from typing import Any
import numpy as np
import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", message=".*inplace.*")

def run_sma_backtest( ticker: str, fast_window: int = 20, slow_window: int = 50, initial_capital: float = 10000.0, period: str = "2y",) -> dict[str,Any]:
    clean_ticker = ticker.strip().upper()
    if fast_window >= slow_window:
        raise ValueError("Fast SMA window must be smaller than Slow SMA window.")

    stock = yf.Ticker(clean_ticker)
    hist = stock.history(period=period)

    if hist.empty or len(hist) <= slow_window + 5:
        raise ValueError(f"Not enough historical data for '{clean_ticker}' over period '{period}'")

    df = hist[["Close"]].copy()

    df["fast_sma"] = df["Close"].rolling(fast_window).mean()
    df["slow_sma"] = df["Close"].rolling(slow_window).mean()

    # Drop the initial warmup rows where slow_sma is NaN
    df = df.dropna().copy()

    # Fixed: "slow_sma" (not "small_sma") and 1.0 (not 11.0)
    df["signal"] = np.where(df["fast_sma"] > df["slow_sma"], 1.0, 0.0)

    df["position"] = df["signal"].shift(1).fillna(0.0)

    df["market_return"] = df["Close"].pct_change().fillna(0.0)
    df["strategy_return"] = df["position"] * df["market_return"]

    # Fixed: multiply (*) initial_capital by the cumulative product
    df["buy_hold_equity"] = initial_capital * (1.0 + df["market_return"]).cumprod()
    df["strategy_equity"] = initial_capital * (1.0 + df["strategy_return"]).cumprod()

    # 6. Calculate Running Peak and Percentage Drawdown
    df["strategy_peak"] = df["strategy_equity"].cummax()
    df["drawdown_pct"] = ((df["strategy_equity"] - df["strategy_peak"]) / df["strategy_peak"]) * 100.0

    # 7. Calculate Hedge Fund Performance Metrics
    final_strategy = float(df["strategy_equity"].iloc[-1])
    final_buy_hold = float(df["buy_hold_equity"].iloc[-1])

    total_return_pct = ((final_strategy - initial_capital) / initial_capital) * 100.0
    buy_hold_return_pct = ((final_buy_hold - initial_capital) / initial_capital) * 100.0

    # Annualized Sharpe Ratio (assuming 0% cash rate on uninvested days)
    strat_std = float(np.std(df["strategy_return"], ddof=1))
    if strat_std > 1e-8:
        # TODO 4: Calculate Sharpe Ratio: (np.mean(df["strategy_return"]) / strat_std) * np.sqrt(252)
        sharpe_ratio = float(np.mean(df["strategy_return"]) / strat_std) * np.sqrt(252)
    else:
        sharpe_ratio = 0.0

    max_drawdown_pct = float(df["drawdown_pct"].min())

    # Win Rate on active market days when position == 1.0
    active_days = df[df["position"] == 1.0]["strategy_return"]
    win_rate_pct = (
        float((active_days > 0).sum() / len(active_days) * 100.0)
        if len(active_days) > 0
        else 0.0
    )

    # Count total crossover trade entries (where position changes from 0 to 1)
    total_trades = int(((df["position"] == 1.0) & (df["position"].shift(1) == 0.0)).sum())

    # 8. Downsample equity curve to ~120 points so JSON and React charts stay lightning-fast
    step = max(1, len(df) // 120)
    sampled_df = df.iloc[::step]

    equity_curve = []
    for date_idx, row in sampled_df.iterrows():
        equity_curve.append({
            "date": str(date_idx)[:10],
            "spot": round(float(row["Close"]), 2),
            "fastSma": round(float(row["fast_sma"]), 2),
            "slowSma": round(float(row["slow_sma"]), 2),
            "strategyEquity": round(float(row["strategy_equity"]), 2),
            "buyHoldEquity": round(float(row["buy_hold_equity"]), 2),
            "drawdownPct": round(float(row["drawdown_pct"]), 2),
        })

    return {
        "ticker": clean_ticker,
        "totalReturnPct": round(total_return_pct, 2),
        "buyHoldReturnPct": round(buy_hold_return_pct, 2),
        "finalEquity": round(final_strategy, 2),
        "finalBuyHoldEquity": round(final_buy_hold, 2),
        "sharpeRatio": round(sharpe_ratio, 2),
        "maxDrawdownPct": round(max_drawdown_pct, 2),
        "winRatePct": round(win_rate_pct, 1),
        "totalTrades": total_trades,
        "equityCurve": equity_curve,
    }


if __name__ == "__main__":
    res = run_sma_backtest("NVDA", fast_window=20, slow_window=50, initial_capital=10000, period="2y")
    print(
        f"NVDA Backtest -> Final Equity: ${res['finalEquity']} ({res['totalReturnPct']}%) | "
        f"Sharpe: {res['sharpeRatio']} | Max DD: {res['maxDrawdownPct']}% | Trades: {res['totalTrades']}"
    )