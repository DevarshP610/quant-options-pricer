from typing import Any
import numpy as np
import yfinance as yf
from scipy.stats import norm


def calculate_d1_d2(
    S: float, K: float, T: float, r: float, sigma: float
) -> tuple[float, float]:
    """Compute standardized Black-Scholes probability factors d1 and d2."""
    safe_T = max(T, 1e-6)
    sqrt_T = np.sqrt(safe_T)

    d1 = (np.log(S / K) + (r + 0.5 * (sigma ** 2)) * safe_T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T
    return float(d1), float(d2)


def black_scholes_price_only(
    S: float, K: float, T: float, r: float, sigma: float, option_type: str
) -> float:
    """Compute exact closed-form Black-Scholes price for a European option."""
    safe_T = max(T, 1e-6)
    d1, d2 = calculate_d1_d2(S, K, safe_T, r, sigma)
    discount = np.exp(-r * safe_T)

    if option_type.lower() == "call":
        price = S * norm.cdf(d1) - K * discount * norm.cdf(d2)
    else:
        price = K * discount * norm.cdf(-d2) - S * norm.cdf(-d1)

    return float(price)


def black_scholes_all(
    S: float, K: float, T: float, r: float, sigma: float, option_type: str
) -> dict[str, Any]:
    """Compute Black-Scholes price, all 5 Greeks, and the spot payoff curve."""
    safe_T = max(T, 1e-6)
    sqrt_T = np.sqrt(safe_T)
    d1, d2 = calculate_d1_d2(S, K, safe_T, r, sigma)
    is_call = option_type.lower() == "call"

    # Cache bell-curve and discount values once to avoid redundant C-level calls
    cdf_d1 = norm.cdf(d1)
    cdf_d2 = norm.cdf(d2)
    cdf_neg_d1 = norm.cdf(-d1)
    cdf_neg_d2 = norm.cdf(-d2)
    pdf_d1 = norm.pdf(d1)
    discount = np.exp(-r * safe_T)

    # 1. Option Price
    if is_call:
        price = S * cdf_d1 - K * discount * cdf_d2
    else:
        price = K * discount * cdf_neg_d2 - S * cdf_neg_d1

    # 2. Delta (Hedge ratio: dV / dS)
    delta = cdf_d1 if is_call else cdf_d1 - 1.0

    # 3. Gamma (Convexity: d^2V / dS^2)
    gamma = pdf_d1 / (S * sigma * sqrt_T)

    # 4. Vega (Sensitivity per 1% vol change: dV / d_sigma / 100)
    vega = (S * pdf_d1 * sqrt_T) / 100.0

    # 5. Theta (Daily calendar decay: dV / dt / 365)
    theta_common = -(S * pdf_d1 * sigma) / (2.0 * sqrt_T)
    if is_call:
        theta = (theta_common - r * K * discount * cdf_d2) / 365.0
    else:
        theta = (theta_common + r * K * discount * cdf_neg_d2) / 365.0

    # 6. Rho (Sensitivity per 1% interest rate change: dV / dr / 100)
    if is_call:
        rho = (K * safe_T * discount * cdf_d2) / 100.0
    else:
        rho = (-K * safe_T * discount * cdf_neg_d2) / 100.0

    # 7. Payoff & Theoretical Valuation Curve across Spot range
    min_spot = max(10, int(K * 0.5))
    max_spot = int(K * 1.5)
    step = max(1, int((max_spot - min_spot) / 40))

    payoff_curve = []
    for spot_pt in range(min_spot, max_spot + 1, step):
        spot_f = float(spot_pt)
        theo_val = black_scholes_price_only(spot_f, K, safe_T, r, sigma, option_type)
        intrinsic = max(spot_f - K, 0.0) if is_call else max(K - spot_f, 0.0)
        payoff_curve.append({
            "spot": spot_f,
            "expirationPayoff": round(intrinsic, 2),
            "currentTheoreticalValue": round(theo_val, 2),
            "netProfitAtExpiry": round(intrinsic - float(price), 2),
        })

    return {
        "price": float(price),
        "delta": float(delta),
        "gamma": float(gamma),
        "vega": float(vega),
        "theta": float(theta),
        "rho": float(rho),
        "payoffCurve": payoff_curve,
    }


def monte_carlo_price(
    S: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: str,
    simulations: int = 10000,
) -> float:
    """Price a European option via vectorized Geometric Brownian Motion."""
    safe_T = max(T, 1e-6)
    Z = np.random.standard_normal(simulations)

    ST = S * np.exp((r - 0.5 * (sigma ** 2)) * safe_T + sigma * np.sqrt(safe_T) * Z)

    if option_type.lower() == "call":
        payoffs = np.maximum(ST - K, 0.0)
    else:
        payoffs = np.maximum(K - ST, 0.0)

    return float(np.exp(-r * safe_T) * np.mean(payoffs))


def get_live_market_data(ticker: str) -> dict[str, Any]:
    """Fetch latest spot price and 1Y realized log-return volatility from Yahoo Finance."""
    clean_ticker = ticker.strip().upper()
    stock = yf.Ticker(clean_ticker)

    hist = stock.history(period="1y")
    if hist.empty or len(hist) < 20:
        raise ValueError(f"Insufficient market data found for ticker '{clean_ticker}'.")

    closes = hist["Close"]
    spot_price = float(closes.iloc[-1])

    # Continuously compounded log returns: ln(S_t / S_{t-1})
    log_returns = np.log((closes / closes.shift(1)).dropna())
    annual_vol = float(np.std(log_returns, ddof=1) * np.sqrt(252))

    strike_step = 5 if spot_price >= 50 else 1
    suggested_strike = float(round(spot_price / strike_step) * strike_step)

    return {
        "ticker": clean_ticker,
        "spotPrice": round(spot_price, 2),
        "annualizedVolatility": round(annual_vol, 4),
        "suggestedStrike": suggested_strike,
        "tradingDaysSampled": int(len(log_returns)),
    }


if __name__ == "__main__":
    print("BS Call:", black_scholes_price_only(100, 100, 1.0, 0.05, 0.20, "call"))
    print("MC Call:", monte_carlo_price(100, 100, 1.0, 0.05, 0.20, "call", 50000))
    print("NVDA Live Feed:", get_live_market_data("NVDA"))