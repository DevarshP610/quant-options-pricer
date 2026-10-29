<div align="center">
  <h1>QuantDesk</h1>
  <p><strong>Institutional Options Pricing & Stochastic Simulation Workstation.</strong><br>Price European derivatives with analytical Black-Scholes and vectorized Monte Carlo across a 3-tier Python, C#, and React stack.</p>

  <p>
    <img src="https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white" alt="Python 3.12">
    <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" alt="FastAPI">
    <img src="https://img.shields.io/badge/.NET-8.0%20Web%20API-512BD4?logo=dotnet&logoColor=white" alt=".NET 8.0">
    <img src="https://img.shields.io/badge/React-18%20%2B%20Vite-61DAFB?logo=react&logoColor=black" alt="React">
  </p>
</div>

---

## What is QuantDesk?

QuantDesk is a 3-tier quantitative finance workstation that models how trading desks separate mathematical research from enterprise service delivery and visualization. A **Python (FastAPI + NumPy/SciPy)** microservice computes exact Black-Scholes analytical prices, first- and second-order Greeks, and vectorized Geometric Brownian Motion Monte Carlo simulations. An **ASP.NET Core (C#)** gateway validates contracts and routes authenticated requests to the calculation node, while a **React** frontend renders real-time stochastic price paths, valuation curves, and scenario risk matrices.

## Features

- **Dual analytical & stochastic pricing:** Compare closed-form Black-Scholes theoretical values against vectorized Monte Carlo simulations (`N = 1,000` to `250,000` paths) with live convergence error (`|BS − MC|`), standard error (`SE`), and 95% confidence intervals.
- **Full Greeks telemetry:** Real-time calculation of **Delta ($\Delta$)**, **Gamma ($\Gamma$)**, **Vega ($\mathcal{V}$)**, **Theta ($\Theta$)**, and **Rho ($\rho$)** scaled to practical desk conventions (per $1 spot move, per 1% volatility/rate shift, and daily calendar decay).
- **Multi-path Monte Carlo spaghetti visualizer:** High-FPS HTML5 `<canvas>` engine simulating discrete Geometric Brownian Motion paths ($S_{t+\Delta t} = S_t \exp((r - \frac{1}{2}\sigma^2)\Delta t + \sigma\sqrt{\Delta t}Z)$) across 62 time steps.
- **Two experience modes:**
  - **Guided Mode (Beginner):** Plain-English trade summaries, break-even thresholds, intrinsic vs. extrinsic value decomposition, and risk-neutral probability of expiring In-The-Money ($N(d_2)$).
  - **Pro Desk Mode (Quant Sim):** Direct numeric order-ticket inputs, Delta/Gamma surface curves, and a **Spot × Volatility Scenario P&L Matrix**.
- **Resilient dual-engine execution:** Seamlessly switch between the live C# + Python backend pipeline and an in-browser local fallback sandbox.

## Architecture & stack split

| Tier | Technology | Default Port | Responsibility |
|---|---|---|---|
| **1. Quant Engine** | Python 3.12, FastAPI, NumPy, SciPy | `127.0.0.1:8000` | Closed-form Black-Scholes calculus, Greeks, and vectorized GBM Monte Carlo simulation |
| **2. Service Gateway** | C#, ASP.NET Core Web API, `HttpClient` | `localhost:5000` | Strongly-typed DTO validation, CORS enforcement, header authentication, and routing |
| **3. Trader Workstation** | React, Vite, Tailwind CSS, Recharts, Canvas | `localhost:5173` | Interactive parameter controls, stochastic path rendering, and P&L risk matrices |

## Run locally

Requires **Python 3.11+**, **.NET 8.0+ SDK**, and **Node.js 20+**.

### 1. Start the Python Quant Engine (Port 8000)

```powershell
git clone [https://github.com/DevarshP610/quant-options-pricer.git](https://github.com/DevarshP610/quant-options-pricer.git)
cd quant-options-pricer/1-python-quant-engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python main.py