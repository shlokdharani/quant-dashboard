/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getOptionChain } from "@/lib/angelone";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, expiry } = body;
    
    if (!symbol || !expiry) {
      return NextResponse.json(
        { status: false, message: "Missing symbol or expiry parameters" },
        { status: 400 }
      );
    }
    
    const data = await getOptionChain(symbol, expiry);
    return NextResponse.json({
      status: true,
      data
    });
  } catch (error: any) {
    console.error("Option chain route error:", error);
    return NextResponse.json(
      {
        status: false,
        message: error.message || "Failed to fetch option chain",
      },
      {
        status: 500,
      }
    );
  }
}
