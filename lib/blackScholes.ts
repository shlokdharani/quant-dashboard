/* eslint-disable @typescript-eslint/no-unused-vars */
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

export function calculateImpliedVolatility(
  marketPrice: number,
  spotPrice: number,
  strikePrice: number,
  timeToExpiry: number,
  optionType: "CE" | "PE",
  riskFreeRate = 0.05
): number {
  if (marketPrice <= 0 || timeToExpiry <= 0) return 0.0001;

  let vol = 0.20; // Initial guess (20% vol)
  const maxIterations = 100;
  const precision = 0.0001;

  for (let i = 0; i < maxIterations; i++) {
    try {
      const greeks = calculateBlackScholes({
        spotPrice,
        strikePrice,
        timeToExpiry,
        volatility: vol,
        riskFreeRate,
      });

      const price = optionType === "CE" ? greeks.callPrice : greeks.putPrice;
      const diff = price - marketPrice;

      if (Math.abs(diff) < precision) {
        return vol;
      }

      const actualVega = greeks.vega * 100; // Since vega is divided by 100 in the library
      if (actualVega < 1e-6) {
        break; // Fallback to bisection
      }

      const nextVol = vol - diff / actualVega;
      if (nextVol <= 0 || nextVol > 5.0) {
        break; // Out of bounds, fallback to bisection
      }
      vol = nextVol;
    } catch (e) {
      break;
    }
  }

  // Fallback to Bisection Method
  let low = 0.0001;
  let high = 5.0;
  let mid = 0.20;
  for (let i = 0; i < 50; i++) {
    mid = (low + high) / 2;
    try {
      const greeks = calculateBlackScholes({
        spotPrice,
        strikePrice,
        timeToExpiry,
        volatility: mid,
        riskFreeRate,
      });
      const price = optionType === "CE" ? greeks.callPrice : greeks.putPrice;
      const diff = price - marketPrice;
      if (Math.abs(diff) < precision) {
        return mid;
      }
      if (diff > 0) {
        high = mid;
      } else {
        low = mid;
      }
    } catch (e) {
      break;
    }
  }
  return mid;
}

export function getTimeToExpiry(expiryStr: string): number {
  const months = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
  };
  const day = parseInt(expiryStr.substring(0, 2));
  const monthStr = expiryStr.substring(2, 5).toUpperCase();
  const year = parseInt(expiryStr.substring(5, 9));
  
  const month = months[monthStr as keyof typeof months] ?? 0;
  const expiryDate = new Date(year, month, day, 15, 30, 0);
  const now = new Date();
  
  const diffMs = expiryDate.getTime() - now.getTime();
  const t = diffMs / (365 * 24 * 60 * 60 * 1000);
  
  return t < 0.00001 ? 0.00001 : t;
}


