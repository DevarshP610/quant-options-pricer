namespace QuantGateway.Models
{
    public class OptionRequest
    {
        public double SpotPrice { get; set; }
        public double StrikePrice { get; set; }
        public double TimeToExpiry { get; set; }
        public double RiskFreeRate { get; set; }
        public double Volatility { get; set; }
        public string OptionType { get; set; } = "call";
        public int Simulations { get; set; } = 10000;
    }
}