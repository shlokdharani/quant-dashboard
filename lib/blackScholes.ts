export interface BlackScholesInputs {
  spotPrice: number;
  strikePrice: number;
  timeToExpiry: number;
  volatility: number;
  riskFreeRate?: number;
}

export interface OptionPricingResult {
  callPrice: number;
  putPrice: number;

  deltaCall: number;
  deltaPut: number;

  gamma: number;

  thetaCall: number;
  thetaPut: number;

  vega: number;

  d1: number;
  d2: number;
}

const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

export function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_TWO_PI;
}

export function normCDF(x: number): number {
  const k = 1 / (1 + 0.2316419 * Math.abs(x));

  const a1 = 0.31938153;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;

  const poly =
    a1 * k +
    a2 * Math.pow(k, 2) +
    a3 * Math.pow(k, 3) +
    a4 * Math.pow(k, 4) +
    a5 * Math.pow(k, 5);

  const approx = 1 - normPDF(x) * poly;

  return x >= 0 ? approx : 1 - approx;
}

export function calculateBlackScholes({
  spotPrice,
  strikePrice,
  timeToExpiry,
  volatility,
  riskFreeRate = 0.05,
}: BlackScholesInputs): OptionPricingResult {
  if (
    spotPrice <= 0 ||
    strikePrice <= 0 ||
    timeToExpiry <= 0 ||
    volatility <= 0
  ) {
    throw new Error("Invalid Black-Scholes input values");
  }

  const sqrtT = Math.sqrt(timeToExpiry);

  const d1 =
    (Math.log(spotPrice / strikePrice) +
      (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) /
    (volatility * sqrtT);

  const d2 = d1 - volatility * sqrtT;

  const callPrice =
    spotPrice * normCDF(d1) -
    strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * normCDF(d2);

  const putPrice =
    strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * normCDF(-d2) -
    spotPrice * normCDF(-d1);

  const deltaCall = normCDF(d1);
  const deltaPut = normCDF(d1) - 1;

  const gamma = normPDF(d1) / (spotPrice * volatility * sqrtT);

  const vega = (spotPrice * normPDF(d1) * sqrtT) / 100;

  const thetaCall =
    (-spotPrice * normPDF(d1) * volatility) / (2 * sqrtT) -
    riskFreeRate *
      strikePrice *
      Math.exp(-riskFreeRate * timeToExpiry) *
      normCDF(d2);

  const thetaPut =
    (-spotPrice * normPDF(d1) * volatility) / (2 * sqrtT) +
    riskFreeRate *
      strikePrice *
      Math.exp(-riskFreeRate * timeToExpiry) *
      normCDF(-d2);

  return {
    callPrice,
    putPrice,

    deltaCall,
    deltaPut,

    gamma,

    thetaCall: thetaCall / 365,
    thetaPut: thetaPut / 365,

    vega,

    d1,
    d2,
  };
}
