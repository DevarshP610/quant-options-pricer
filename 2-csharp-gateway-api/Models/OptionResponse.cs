using System.Collections.Generic;

namespace QuantGateway.Models
{
    public class PayoffPoint
    {
        public double Spot { get; set; }
        public double ExpirationPayoff { get; set; }
        public double CurrentTheoreticalValue { get; set; }
        public double NetProfitAtExpiry { get; set; }
    }

    public class OptionResponse
    {
        public double BlackScholesPrice { get; set; }
        public double MonteCarloPrice { get; set; }
        public double Delta { get; set; }
        public double Gamma { get; set; }
        public double Vega { get; set; }
        public double Theta { get; set; }
        public double Rho { get; set; }
        public List<PayoffPoint> PayoffCurve { get; set; } = new();
    }
}