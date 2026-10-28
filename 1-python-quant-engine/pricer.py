import numpy as np
from scipy.stats import norm


def calculate_d1_d2(S: float, K: float, T:float, r: float, sigma: float):
    T = max(T, 1e-6)
    sqrt_T = np.sqrt(T)

    d1 = (np.log(S / K) + (r + 0.5 * (sigma ** 2)) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T

    return d1,d2


def black_scholes_price_only(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float:
    T = max(T, 1e-6)
    d1, d2 = calculate_d1_d2(S, K, T, r, sigma)
    
    if option_type.lower() == "call":
        price = S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
    else:
        price = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
    return float(price)


def black_scholes_all(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> dict:
    T = max(T, 1e-6)
    sqrt_T = np.sqrt(T)
    d1, d2 = calculate_d1_d2(S, K, T, r, sigma)
    is_call = option_type.lower() == "call"

    # 1. Option Price
    price = black_scholes_price_only(S, K, T, r, sigma, option_type)

    # 2. Delta (Speed: how much option moves per $1 move in stock)
    delta = norm.cdf(d1) if is_call else norm.cdf(d1) - 1.0

    # 3. Gamma (Acceleration: how much Delta changes per $1 move in stock)
    # Identical for both Calls and Puts!
    gamma = norm.pdf(d1) / (S * sigma * sqrt_T)

    # 4. Vega (Volatility sensitivity per 1% change in sigma -> divide by 100)
    vega = (S * norm.pdf(d1) * sqrt_T) / 100.0

    # 5. Theta (Time decay per calendar day -> divide annual decay by 365)
    term1 = -(S * norm.pdf(d1) * sigma) / (2.0 * sqrt_T)
    if is_call:
        theta = (term1 - r * K * np.exp(-r * T) * norm.cdf(d2)) / 365.0
    else:
        theta = (term1 + r * K * np.exp(-r * T) * norm.cdf(-d2)) / 365.0

    # 6. Rho (Interest rate sensitivity per 1% change in r -> divide by 100)
    if is_call:
        rho = (K * T * np.exp(-r * T) * norm.cdf(d2)) / 100.0
    else:
        rho = (-K * T * np.exp(-r * T) * norm.cdf(-d2)) / 100.0

    payoff_curve = []
    min_spot = max(10, int(K * 0.5))
    max_spot = int(K * 1.5)
    step = max(1, int((max_spot - min_spot) / 40))

    for spot_pt in range(min_spot, max_spot + 1, step):
        theo_val = black_scholes_price_only(float(spot_pt), K, T, r, sigma, option_type)
        intrinsic = max(spot_pt - K, 0.0) if is_call else max(K - spot_pt, 0.0)
        payoff_curve.append({
            "spot": float(spot_pt),
            "expirationPayoff": round(float(intrinsic), 2),
            "currentTheoreticalValue": round(float(theo_val), 2),
            "netProfitAtExpiry": round(float(intrinsic - price), 2)
        })

    return {
        "price": float(price),
        "delta": float(delta),
        "gamma": float(gamma),
        "vega": float(vega),
        "theta": float(theta),
        "rho": float(rho),
        "payoffCurve": payoff_curve
    }


def monte_carlo_price(S: float, K: float, T: float, r: float, sigma: float, option_type: str, simulations: int = 10000) -> float:
    T = max(T, 1e-6)
    Z = np.random.standard_normal(simulations)

    #calc ending stock prices using Geometric Brownian Motion (idk what that is)
    ST  = S * np.exp((r- 0.5 * (sigma ** 2)) * T + sigma * np.sqrt(T) * Z)

    if option_type.lower() == "call":
        payoffs = np.maximum(ST - K, 0.0)
    else:
        payoffs = np.maximum(K - ST, 0.0)

    discounted_price = float((np.mean(payoffs) * np.exp(-r * T)))

    return float(discounted_price)



if __name__ == "__main__":
    print("BS Call:", black_scholes_price_only(100, 100, 1.0, 0.05, 0.20, "call"))
    print("MC Call:", monte_carlo_price(100, 100, 1.0, 0.05, 0.20, "call", 50000))

    
        
