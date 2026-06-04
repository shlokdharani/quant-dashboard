/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getActiveSymbolDetails } from "@/lib/angelone";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || "";
    
    if (!symbol) {
      return NextResponse.json(
        { status: false, message: "Missing symbol parameter" },
        { status: 400 }
      );
    }
    
    const details = await getActiveSymbolDetails(symbol);
    return NextResponse.json({
      status: true,
      data: details
    });
  } catch (error: any) {
    console.error("Active symbol route error:", error);
    return NextResponse.json(
      {
        status: false,
        message: error.message || "Failed to fetch symbol details",
      },
      {
        status: 500,
      }
    );
  }
}
