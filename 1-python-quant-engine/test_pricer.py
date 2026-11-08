import numpy as np
from pricer import (
    black_scholes_price_only,
    black_scholes_all,
    monte_carlo_price,
    solve_implied_volatility,
    binomial_american_price,
)


def test_put_call_parity():
    """Law 1: Verify C - P == S - K * e^(-rT) to prove Black-Scholes has zero bugs."""
    S, K, T, r, sigma = 105.0, 100.0, 0.5, 0.05, 0.25

    call_price = black_scholes_price_only(S, K, T, r, sigma, "call")
    put_price = black_scholes_price_only(S, K, T, r, sigma, "put")

    left_side = call_price - put_price
    right_side = S - K * np.exp(-r * T)

    # TODO 1: Use assert np.isclose(left_side, right_side, atol=1e-5)
    assert np.isclose(left_side, right_side, atol=1e-5)


def test_implied_volatility_round_trip():
    """Law 2: Verify that Volatility -> Price -> Newton-Raphson IV recovers the exact Volatility."""
    S, K, T, r = 100.0, 100.0, 1.0, 0.05
    true_sigma = 0.35

    # Step 1: Forward price the option at 35% volatility
    market_price = black_scholes_price_only(S, K, T, r, true_sigma, "call")

    # Step 2: Run Newton-Raphson backwards on that price
    iv_result = solve_implied_volatility(market_price, S, K, T, r, "call")

    assert iv_result["converged"] is True
    # TODO 2: Assert that iv_result["impliedVolatility"] is close to true_sigma using np.isclose(..., atol=1e-4)
    assert np.isclose(iv_result["impliedVolatility"], true_sigma, atol=1e-4)


def test_american_put_early_exercise_premium():
    """Law 3: Deep ITM American Put must be worth strictly more than European Put when r > 0."""
    result = binomial_american_price(
        S=80.0, K=100.0, T=1.0, r=0.05, sigma=0.25, option_type="put", steps=150
    )

    # TODO 3: Assert that result["americanPrice"] > result["europeanPrice"]
    assert result["americanPrice"] > result["europeanPrice"]
    assert result["earlyExercisePremium"] > 0.0


def test_greeks_boundaries():
    """Verify Call Delta is between 0 and 1, Put Delta is between -1 and 0, and Gamma > 0."""
    call_data = black_scholes_all(100.0, 100.0, 0.5, 0.05, 0.20, "call")
    put_data = black_scholes_all(100.0, 100.0, 0.5, 0.05, 0.20, "put")

    assert 0.0 < call_data["delta"] < 1.0
    assert -1.0 < put_data["delta"] < 0.0
    assert call_data["gamma"] > 0.0
    assert np.isclose(call_data["gamma"], put_data["gamma"], atol=1e-6)


def test_monte_carlo_convergence():
    """Verify 100,000 Monte Carlo paths converge within $0.15 of analytical Black-Scholes."""
    np.random.seed(42)
    bs = black_scholes_price_only(100.0, 100.0, 0.5, 0.05, 0.20, "call")
    mc = monte_carlo_price(100.0, 100.0, 0.5, 0.05, 0.20, "call", simulations=100000)

    assert abs(bs - mc) < 0.15