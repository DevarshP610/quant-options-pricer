namespace QuantGateway.Models
{
    public class ImpliedVolRequest
    {
        public double MarketPrice { get; set; }
        public double SpotPrice { get; set; }
        public double StrikePrice { get; set; }
        public double TimeToExpiry { get; set; }
        public double RiskFreeRate { get; set; }
        public string OptionType { get; set; } = "call";
    }

    public class ImpliedVolResponse
    {
        public double ImpliedVolatility { get; set; }
        public int Iterations { get; set; }
        public bool Converged { get; set; }
        public double PricingError { get; set; }
    }
}