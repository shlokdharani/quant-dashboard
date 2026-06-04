/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/angelone";

export async function GET() {
  try {
    const session = await getAuthSession();
    return NextResponse.json({
      status: true,
      message: "SUCCESS",
      data: session
    });
  } catch (error: any) {
    console.error("Auth route error:", error);
    return NextResponse.json(
      {
        status: false,
        message: error.message || "Angel One auth failed",
      },
      {
        status: 500,
      }
    );
  }
}
