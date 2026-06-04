/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getHistoricalCandles } from "@/lib/angelone";

function formatDate(date: Date, time = "09:15"): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${time}`;
}

function formatToDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get("exchange") || "NSE";
    const token = searchParams.get("token");
    const interval = searchParams.get("interval") || "ONE_DAY";
    let fromdate = searchParams.get("fromdate");
    let todate = searchParams.get("todate");
    
    if (!token) {
      return NextResponse.json(
        { status: false, message: "Missing token parameter" },
        { status: 400 }
      );
    }
    
    // Set default dates if not provided
    const now = new Date();
    if (!todate) {
      todate = formatToDate(now);
    }
    
    if (!fromdate) {
      const past = new Date();
      if (interval === "ONE_DAY") {
        past.setDate(now.getDate() - 365); // 1 year
      } else {
        past.setDate(now.getDate() - 15); // 15 days for intraday charts
      }
      fromdate = formatDate(past);
    }
    
    console.log(`Fetching chart data for token ${token} on ${exchange} with interval ${interval} from ${fromdate} to ${todate}`);
    const candles = await getHistoricalCandles(exchange, token, interval, fromdate, todate);
    
    // Transform candles to standard objects: { time: string/number, open, high, low, close, volume }
    // Angel One returns: [ [ "2026-06-03T00:00:00+05:30", 953.75, 974, 937.2, 970.45, 27947005 ] ]
    const formattedCandles = candles.map((c: any) => {
      // Parse ISO timestamp or format
      const dateObj = new Date(c[0]);
      // Lightweight charts wants timestamp in seconds for intraday, or YYYY-MM-DD for daily
      const timeVal = interval === "ONE_DAY" 
        ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`
        : Math.floor(dateObj.getTime() / 1000) + (5.5 * 3600); // Add IST offset so Lightweight Charts displays UTC as IST
        
      return {
        time: timeVal,
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5]
      };
    });
    
    return NextResponse.json({
      status: true,
      data: formattedCandles
    });
  } catch (error: any) {
    console.error("Chart API error:", error);
    return NextResponse.json(
      {
        status: false,
        message: error.message || "Failed to fetch chart data",
      },
      {
        status: 500,
      }
    );
  }
}
