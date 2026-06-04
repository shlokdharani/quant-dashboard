/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

interface RequestBody {
  symbol: string;
  optionSymbol: string;
  optionType: "CE" | "PE";
  strike: number;
  ltp: number;
  spotPrice: number;
  expiry: string;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
  };
  timeToExpiry: number; // in years
  news?: any[];
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { symbol, optionSymbol, optionType, strike, ltp, spotPrice, expiry, greeks, timeToExpiry, news } = body;

    const daysToExpiry = Math.ceil(timeToExpiry * 365);
    const hasValidGroq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "YOUR_GROQ_KEY";

    if (hasValidGroq) {
      try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const systemPrompt = `You are a professional quantitative derivatives strategist and options trader.
Analyze the following Indian stock market option contract and provide a structured JSON recommendation.

Input Contract Details:
- Underlying: ${symbol} (Spot Price: ₹${spotPrice})
- Contract: ${optionSymbol} (${optionType} Option, Strike: ₹${strike})
- Current Market LTP: ₹${ltp}
- Expiry Date: ${expiry} (${daysToExpiry} days to expiry)
- Greeks:
  * Implied Volatility (IV): ${greeks.iv.toFixed(2)}%
  * Delta: ${greeks.delta.toFixed(4)}
  * Gamma: ${greeks.gamma.toFixed(6)}
  * Theta: ${greeks.theta.toFixed(4)} per day
  * Vega: ${greeks.vega.toFixed(4)}

- Latest Live News Context:
  ${news && news.length > 0 ? news.map(n => `* ${n.title} (${n.source})`).join('\n  ') : 'No recent news available.'}
  (Consider this news for sentiment analysis. Strong news overrides purely technical Greek analysis.)


Evaluate based on:
1. Directional sentiment (underlying spot relative to option strike).
2. Volatility premium (Is IV high or low relative to standard indices?).
3. Greeks Health (Theta decay risk vs. Delta exposure, Gamma acceleration).
4. Risk-Reward ratio.

CRITICAL RULES:
- You MUST only output a recommendation of "BUY" if the calculated score is STRICTLY greater than 65.
- You MUST include a DETAILED time-based and condition-based exit strategy within the reasoning array. Specify exactly when to exit (e.g. 'Sell before 2:30 PM IST to avoid Intraday Gamma risk'), what stop-loss percentage to apply (e.g. 'Place a strict stop loss at 15% below entry premium'), and take-profit targets based on Delta/Theta exposures.

Respond ONLY with a valid JSON object in the following format (no markdown formatting, no explanation outside the JSON):
{
  "recommendation": "BUY" | "SELL" | "HOLD" | "AVOID",
  "score": number (between 0 and 100),
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "greeksAnalysis": "Short description of the greek exposures (delta/theta trade-offs).",
  "volatilityAnalysis": "Analysis of the Implied Volatility (IV) and premium levels.",
  "riskReward": "Assessment of the risk-reward ratio of this contract.",
  "reasoning": [
    "Reason 1: Explanation of trend/direction",
    "Reason 2: Explanation of time-decay risk",
    "Reason 3: Practical recommendation tip"
  ]
}`;

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "You are a quant trader who outputs strict JSON only." },
            { role: "user", content: systemPrompt }
          ],
          model: "llama-3.3-70b-versatile",
          temperature: 0.2,
          response_format: { type: "json_object" }
        });

        const rawText = chatCompletion.choices[0]?.message?.content || "";
        const parsedData = JSON.parse(rawText);
        return NextResponse.json({ status: true, data: parsedData });
      } catch (groqError: any) {
        console.warn("Groq API error, falling back to local quant engine:", groqError.message);
      }
    }

    // --- Local Quantitative Scorer (Fallback) ---
    console.log("Running local quantitative scorer...");
    
    // Simple heuristic-based engine
    let score = 50;
    let sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    let recommendation: "BUY" | "SELL" | "HOLD" | "AVOID" = "HOLD";
    const reasoning: string[] = [];

    const isITM = optionType === "CE" ? spotPrice > strike : spotPrice < strike;
    const itmAmount = Math.abs(spotPrice - strike);
    const otmPercent = (itmAmount / spotPrice) * 100;
    const iv = greeks.iv;

    // 1. Directional and Moneyness analysis
    if (optionType === "CE") {
      if (spotPrice > strike) {
        sentiment = "BULLISH";
        score += 15;
        reasoning.push(`The contract is In-The-Money (ITM) by ₹${itmAmount.toFixed(2)} (${otmPercent.toFixed(1)}%). It has intrinsic value.`);
      } else {
        sentiment = "NEUTRAL";
        score -= 5;
        reasoning.push(`The contract is Out-of-the-Money (OTM) by ₹${itmAmount.toFixed(2)} (${otmPercent.toFixed(1)}%). It contains only extrinsic time value.`);
      }
    } else {
      if (spotPrice < strike) {
        sentiment = "BEARISH";
        score += 15;
        reasoning.push(`The contract is In-The-Money (ITM) by ₹${itmAmount.toFixed(2)} (${otmPercent.toFixed(1)}%). It has intrinsic value.`);
      } else {
        sentiment = "NEUTRAL";
        score -= 5;
        reasoning.push(`The contract is Out-of-the-Money (OTM) by ₹${itmAmount.toFixed(2)} (${otmPercent.toFixed(1)}%). It contains only extrinsic time value.`);
      }
    }

    // 2. Volatility Analysis (IV)
    let volAnalysis = "";
    if (iv > 35) {
      volAnalysis = `Implied Volatility (IV) is exceptionally high at ${iv.toFixed(1)}%. Option premiums are inflated.`;
      reasoning.push("Extremely high IV inflates option prices. This strongly favors option sellers over buyers due to imminent IV crush risk.");
      score -= 10;
      recommendation = "SELL";
    } else if (iv < 12) {
      volAnalysis = `Implied Volatility (IV) is low at ${iv.toFixed(1)}%. Option premiums are cheap.`;
      reasoning.push("Low IV indicates cheap premium levels. Buying options has a favorable risk-reward ratio as volatility expansion is likely.");
      score += 10;
      recommendation = "BUY";
    } else {
      volAnalysis = `Implied Volatility (IV) is moderate at ${iv.toFixed(1)}%. Option pricing is fair.`;
      reasoning.push("Moderate IV indicates standard pricing. Option strategies should focus on delta or theta decay rather than volatility swings.");
    }

    // 3. Time Decay (Theta)
    let greeksAnalysis = `Delta is ${greeks.delta.toFixed(2)} providing moderate exposure to underlying movement. `;
    if (daysToExpiry <= 3) {
      greeksAnalysis += `WARNING: Theta decay is severe at ₹${Math.abs(greeks.theta).toFixed(2)}/day with only ${daysToExpiry} days remaining.`;
      reasoning.push("With less than 3 days to expiry, time decay (Theta) accelerates exponentially. Holding long options will lead to swift capital erosion unless a major spot move occurs.");
      score -= 20;
      if (recommendation === "BUY") recommendation = "AVOID";
    } else if (daysToExpiry > 15) {
      greeksAnalysis += `Theta decay is slow (₹${Math.abs(greeks.theta).toFixed(2)}/day) due to long time to expiry (${daysToExpiry} days).`;
      reasoning.push("Long time to expiry dampens Theta decay, making long option positions much safer to hold over multiple days.");
    } else {
      greeksAnalysis += `Theta decay is active (₹${Math.abs(greeks.theta).toFixed(2)}/day) with ${daysToExpiry} days remaining.`;
    }

    // 4. Gamma risk
    if (Math.abs(greeks.gamma) > 0.005) {
      reasoning.push("High Gamma indicates that the contract Delta is highly sensitive to spot price changes. Ideal for aggressive scalp setups but high risk.");
    }

    // Final recommendation decision
    if (score > 65 && recommendation !== "SELL") {
      recommendation = "BUY";
    } else if (score < 40 && recommendation !== "SELL") {
      recommendation = "AVOID";
    }

    let riskReward = "";
    if (recommendation === "BUY") {
      riskReward = "Defined risk (premium paid) with unlimited upside potential. Favorable due to low IV and reasonable time remaining.";
    } else if (recommendation === "SELL") {
      riskReward = "High risk (unlimited downside if naked) with capped return (premium received). Favorable due to high IV inflating the credit.";
    } else if (recommendation === "HOLD") {
      riskReward = "Neutral risk-reward. Monitor spot momentum before taking a stance.";
    } else {
      riskReward = "Unfavorable risk-reward. High probability of premium expiring worthless due to rapid Theta decay.";
    }

    reasoning.push("Detailed Exit Strategy: 1) Strict Stop Loss: Sell immediately if option premium drops by 15% from entry. 2) Take Profit: Target a 25-30% gain based on spot momentum. 3) Time Exit: If the target is not hit, strictly exit the position before 2:30 PM IST to avoid unpredictable intraday Gamma spikes and aggressive late-day Theta decay. Do not carry OTM options overnight unless hedged.");
    
    const fallbackResponse = {
      recommendation,
      score: Math.max(10, Math.min(95, score)),
      sentiment,
      greeksAnalysis,
      volatilityAnalysis: volAnalysis,
      riskReward,
      reasoning
    };

    return NextResponse.json({ status: true, data: fallbackResponse });
  } catch (error: any) {
    console.error("Recommend API error:", error);
    return NextResponse.json(
      {
        status: false,
        message: error.message || "Failed to generate recommendation",
      },
      {
        status: 500,
      }
    );
  }
}
