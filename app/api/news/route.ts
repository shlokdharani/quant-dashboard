import { NextRequest, NextResponse } from "next/server";
import { parseStringPromise } from "xml2js";
import Groq from "groq-sdk";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "NIFTY";

  try {
    // Fetch live news from Google News RSS for the Indian market
    const rssUrl = `https://news.google.com/rss/search?q=${symbol}+stock+market+india&hl=en-IN&gl=IN&ceid=IN:en`;
    const response = await fetch(rssUrl, { next: { revalidate: 60 } });
    
    if (!response.ok) {
      throw new Error("Failed to fetch RSS feed");
    }

    const xmlData = await response.text();
    const result = await parseStringPromise(xmlData);
    
    const premiumSources = ["reuters", "moneycontrol", "bloomberg", "mint", "economic times", "ndtv", "cnbc", "business standard"];
    
    // Parse and filter items
    const allItems = result.rss.channel[0].item.map((item: any) => ({
      title: item.title[0],
      link: item.link[0],
      time: new Date(item.pubDate[0]).toLocaleDateString() + " " + new Date(item.pubDate[0]).toLocaleTimeString(),
      source: item.source[0]._ || item.source[0]
    }));

    let items = allItems.filter((item: any) => 
      premiumSources.some(source => item.source.toLowerCase().includes(source))
    ).slice(0, 5);

    // fallback to any if no premium sources found
    if (items.length === 0) {
      items = allItems.slice(0, 5);
    }

    return NextResponse.json({
      status: true,
      data: {
        items
      }
    });
  } catch (error: any) {
    console.error("News API Error:", error);
    return NextResponse.json({
      status: false,
      message: error.message
    });
  }
}
