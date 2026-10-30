namespace QuantGateway.Models
{
    public class MarketQuoteResponse
    {
        public string Ticker { get; set; } = string.Empty;
        public double SpotPrice { get; set; }
        public double AnnualizedVolatility { get; set; }
        public double SuggestedStrike { get; set; }
        public int TradingDaysSampled { get; set; }
    }
}