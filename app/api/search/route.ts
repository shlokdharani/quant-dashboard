/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/angelone";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    
    const results = await searchSymbols(query);
    return NextResponse.json({
      status: true,
      data: results
    });
  } catch (error: any) {
    console.error("Search route error:", error);
    return NextResponse.json(
      {
        status: false,
        message: error.message || "Failed to search symbols",
      },
      {
        status: 500,
      }
    );
  }
}
