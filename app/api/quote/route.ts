/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/angelone";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { exchangeTokens } = body;
    
    if (!exchangeTokens || Object.keys(exchangeTokens).length === 0) {
      return NextResponse.json(
        { status: false, message: "Missing exchangeTokens payload" },
        { status: 400 }
      );
    }
    
    const data = await fetchQuotes(exchangeTokens);
    return NextResponse.json({
      status: true,
      data
    });
  } catch (error: any) {
    console.error("Quote route error:", error);
    return NextResponse.json(
      {
        status: false,
        message: error.message || "Failed to fetch quotes",
      },
      {
        status: 500,
      }
    );
  }
}
