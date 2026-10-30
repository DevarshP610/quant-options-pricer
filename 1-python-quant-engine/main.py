import os
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
import uvicorn

from pricer import black_scholes_all, monte_carlo_price, get_live_market_data

#load our .env file data
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


@app.get("/health")
def health_check():
    return{"status": "online", "engine": "NumPy/SciPy Quant Node"}

@app.get("/market/{ticker}")
def fetch_market_data(
    ticker: str,
    x_internal_api_key: str | None = Header(default=None)
):
    if x_internal_api_key is not None and x_internal_api_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid Internal Api Key")

    try:
        return get_live_market_data(ticker)
    except ValueError as err:
        # Send HTTP 404 Not Found if someone types a fake ticker symbol
        raise HTTPException(status_code=404, detail=str(err))

@app.post("/calculate")
def calculate_option(data: OptionInput, x_internal_api_key: str | None = Header(default=None)):
    if (x_internal_api_key is not None and x_internal_api_key != INTERNAL_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid Internal Api Key")

    #capping sims so a huge num doesnt crash computer
    safe_sims = min(data.simulations, MAX_SIMULATIONS)

    #call black scholes
    bs = black_scholes_all(data.spotPrice, data.strikePrice,data.timeToExpiry,data.riskFreeRate,data.volatility,data.optionType)

    #call monte carlo pricer
    mc_price = monte_carlo_price(data.spotPrice, data.strikePrice,data.timeToExpiry,data.riskFreeRate,data.volatility,data.optionType,safe_sims)

    return {
        "blackScholesPrice": bs["price"],
        "monteCarloPrice": mc_price,
        "delta": bs["delta"],
        "gamma": bs["gamma"],
        "vega": bs["vega"],
        "theta": bs["theta"],
        "rho": bs["rho"],
        "payoffCurve": bs["payoffCurve"]
    }



if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)