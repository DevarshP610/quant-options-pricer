import os
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
import uvicorn
from backtester import run_sma_backtest

from pricer import (
    black_scholes_all,
    monte_carlo_price,
    get_live_market_data,
    solve_implied_volatility,
    binomial_american_price,
)
load_dotenv()
PORT = int(os.getenv("PORT", 8000))
HOST = os.getenv("HOST", "127.0.0.1")
MAX_SIMULATIONS = int(os.getenv("MAX_SIMULATIONS", 250000))
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "quant_desk_dev_secret_2026")

app = FastAPI(title="QuantDesk Python Pricing Engine")


class OptionInput(BaseModel):
    spotPrice: float = Field(gt=0)
    strikePrice: float = Field(gt=0)
    timeToExpiry: float = Field(gt=0)
    riskFreeRate: float
    volatility: float = Field(gt=0)
    optionType: str = "call"
    simulations: int = Field(default=10000, ge=100)

class ImpliedVolInput(BaseModel):
    marketPrice: float = Field(gt=0)
    spotPrice: float = Field(gt=0)
    strikePrice: float = Field(gt=0)
    timeToExpiry: float = Field(gt=0)
    riskFreeRate: float
    optionType: str = "call"

class BacktestInput(BaseModel):
    ticker: str = "NVDA"
    fastWindow: int = Field(default=20, ge=2, le=200)
    slowWindow: int = Field(default=50, ge=5, le=400)
    initialCapital: float = Field(default=10000.0, gt=0)
    period: str = "2y"

def verify_internal_key(api_key: str | None) -> None:
    """Validate internal gateway API key if provided in headers."""
    if api_key is not None and api_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid Internal API Key")


@app.get("/health")
def health_check():
    return {"status": "online", "engine": "NumPy/SciPy Quant Node"}


@app.get("/market/{ticker}")
def fetch_market_data(
    ticker: str,
    x_internal_api_key: str | None = Header(default=None),
):
    verify_internal_key(x_internal_api_key)
    try:
        return get_live_market_data(ticker)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))


@app.post("/calculate")
def calculate_option(
    data: OptionInput,
    x_internal_api_key: str | None = Header(default=None),
):
    verify_internal_key(x_internal_api_key)
    safe_sims = min(data.simulations, MAX_SIMULATIONS)

    bs = black_scholes_all(
        S=data.spotPrice,
        K=data.strikePrice,
        T=data.timeToExpiry,
        r=data.riskFreeRate,
        sigma=data.volatility,
        option_type=data.optionType,
    )
    mc_price = monte_carlo_price(
        S=data.spotPrice,
        K=data.strikePrice,
        T=data.timeToExpiry,
        r=data.riskFreeRate,
        sigma=data.volatility,
        option_type=data.optionType,
        simulations=safe_sims,
    )

    amr = binomial_american_price(
        S=data.spotPrice,
        K=data.strikePrice,
        T=data.timeToExpiry,
        r=data.riskFreeRate,
        sigma=data.volatility,
        option_type=data.optionType,
        steps=100,
    )

    return {
        "blackScholesPrice": bs["price"],
        "monteCarloPrice": mc_price,
        "americanPrice": amr["americanPrice"],
        "earlyExercisePremium": amr["earlyExercisePremium"],
        "delta": bs["delta"],
        "gamma": bs["gamma"],
        "vega": bs["vega"],
        "theta": bs["theta"],
        "rho": bs["rho"],
        "payoffCurve": bs["payoffCurve"],
    }

    return {
        "blackScholesPrice": bs["price"],
        "monteCarloPrice": mc_price,
        "delta": bs["delta"],
        "gamma": bs["gamma"],
        "vega": bs["vega"],
        "theta": bs["theta"],
        "rho": bs["rho"],
        "payoffCurve": bs["payoffCurve"],
    }


@app.post("/implied/vol")
def calculate_implied_vol(data: ImpliedVolInput, x_internal_api_key: str | None = Header(default = None)):
    verify_internal_key(x_internal_api_key)
    try:
        return solve_implied_volatility(
            market_price=data.marketPrice,
            S=data.spotPrice,
            K=data.strikePrice,
            T=data.timeToExpiry,
            r=data.riskFreeRate,
            option_type=data.optionType,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
        
@app.post("/backtest")
def execute_backtest(
    data: BacktestInput,
    x_internal_api_key: str | None = Header(default=None),
):
    verify_internal_key(x_internal_api_key)
    try:
        return run_sma_backtest(
            ticker=data.ticker,
            fast_window=data.fastWindow,
            slow_window=data.slowWindow,
            initial_capital=data.initialCapital,
            period=data.period,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)