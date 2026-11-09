using System.Collections.Generic;

namespace QuantGateway.Models
{
    public class BacktestRequest
    {
        public string Ticker { get; set; } = "NVDA";
        public int FastWindow { get; set; } = 20;
        public int SlowWindow { get; set; } = 50;
        public double InitialCapital { get; set; } = 10000.0;
        public string Period { get; set; } = "2y";
    }

    public class EquityCurvePoint
    {
        public string Date { get; set; } = string.Empty;
        public double Spot { get; set; }
        public double FastSma { get; set; }
        public double SlowSma { get; set; }
        public double StrategyEquity { get; set; }
        public double BuyHoldEquity { get; set; }
        public double DrawdownPct { get; set; }
    }

    public class BacktestResponse
    {
        public string Ticker { get; set; } = string.Empty;
        public double TotalReturnPct { get; set; }
        public double BuyHoldReturnPct { get; set; }
        public double FinalEquity { get; set; }
        public double FinalBuyHoldEquity { get; set; }
        public double SharpeRatio { get; set; }
        public double MaxDrawdownPct { get; set; }
        public double WinRatePct { get; set; }
        public int TotalTrades { get; set; }
        public List<EquityCurvePoint> EquityCurve { get; set; } = new();
    }
}