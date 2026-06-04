/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import axios from "axios";
import fs from "fs";
import path from "path";
import { calculateBlackScholes, calculateImpliedVolatility, getTimeToExpiry } from "./blackScholes";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const SESSION_PATH = path.join(CACHE_DIR, "session.json");
const UNDERLYINGS_PATH = path.join(CACHE_DIR, "underlyings.json");
const OPTIONS_DIR = path.join(CACHE_DIR, "options");

export interface UnderlyingSymbol {
  name: string;
  symbol: string;
  token: string;
  exchange: string;
  isIndex: boolean;
  lotsize?: number;
}

export interface OptionContract {
  token: string;
  symbol: string;
  expiry: string;
  strike: number;
  lotsize: number;
  instrumenttype: string;
}

export interface OptionChainItem {
  strikePrice: number;
  call?: OptionChainDetails;
  put?: OptionChainDetails;
}

export interface OptionChainDetails {
  token: string;
  symbol: string;
  ltp: number;
  netChange: number;
  percentChange: number;
  oi: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  lotsize: number;
}

// Ensure cache directories exist
function ensureCacheDirs() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (!fs.existsSync(OPTIONS_DIR)) {
    fs.mkdirSync(OPTIONS_DIR, { recursive: true });
  }
}

/**
 * Downloads the OpenAPI Scrip Master and filters/groups it into fast local JSON files.
 */
export async function downloadAndGroupScrips(): Promise<void> {
  ensureCacheDirs();
  const url = "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json";
  console.log("Downloading Scrip Master from Angel One...");
  
  try {
    const response = await axios.get(url, {
      maxContentLength: 100 * 1024 * 1024,
      responseType: "json"
    });
    
    const scrips = response.data;
    if (!Array.isArray(scrips)) {
      throw new Error("Scrip master response is not an array");
    }
    
    console.log(`Downloaded ${scrips.length} scrips. Filtering and grouping...`);
    
    const underlyings: UnderlyingSymbol[] = [];
    const optionsGrouped: Record<string, OptionContract[]> = {};
    const addedStocks = new Set<string>();
    
    // Core indices spot mappings
    const indexSpots: Record<string, UnderlyingSymbol> = {
      "NIFTY": { name: "NIFTY", symbol: "Nifty 50", token: "99926000", exchange: "NSE", isIndex: true },
      "BANKNIFTY": { name: "BANKNIFTY", symbol: "Nifty Bank", token: "99926009", exchange: "NSE", isIndex: true },
      "FINNIFTY": { name: "FINNIFTY", symbol: "Nifty Fin Services", token: "99926018", exchange: "NSE", isIndex: true },
      "MIDCPNIFTY": { name: "MIDCPNIFTY", symbol: "Nifty Midcap 50", token: "99926037", exchange: "NSE", isIndex: true },
      "SENSEX": { name: "SENSEX", symbol: "SENSEX", token: "1", exchange: "BSE", isIndex: true }
    };
    
    // Add indices to underlyings list
    Object.values(indexSpots).forEach(idx => underlyings.push(idx));
    
    scrips.forEach((item: any) => {
      // Keep NSE equity stocks for search/spot charting
      if (item.exch_seg === "NSE" && item.symbol.endsWith("-EQ")) {
        const baseName = item.name;
        if (!addedStocks.has(baseName)) {
          addedStocks.add(baseName);
          underlyings.push({
            name: baseName,
            symbol: item.symbol,
            token: item.token,
            exchange: "NSE",
            isIndex: false
          });
        }
      }
      
      // Group F&O contracts by their underlying symbol name
      if (item.exch_seg === "NFO") {
        const baseName = item.name;
        if (!optionsGrouped[baseName]) {
          optionsGrouped[baseName] = [];
        }
        optionsGrouped[baseName].push({
          token: item.token,
          symbol: item.symbol,
          expiry: item.expiry,
          strike: parseFloat(item.strike) / 100, // Normalize strike
          lotsize: parseInt(item.lotsize) || 1,
          instrumenttype: item.instrumenttype
        });
      }
    });
    
    // Save underlyings index
    fs.writeFileSync(UNDERLYINGS_PATH, JSON.stringify(underlyings, null, 2));
    
    // Save grouped options contracts
    Object.keys(optionsGrouped).forEach(name => {
      fs.writeFileSync(
        path.join(OPTIONS_DIR, `${name}.json`),
        JSON.stringify(optionsGrouped[name], null, 2)
      );
    });
    
    console.log(`Dynamic scrip database bootstrapped! Saved ${underlyings.length} underlyings and ${Object.keys(optionsGrouped).length} option tables.`);
  } catch (error: any) {
    console.error("Failed to download and group scrips:", error.message);
    throw error;
  }
}

/**
 * Ensures the scrip database is bootstrapped before queries.
 */
async function ensureScripsBootstrapped() {
  ensureCacheDirs();
  if (!fs.existsSync(UNDERLYINGS_PATH)) {
    await downloadAndGroupScrips();
  }
}

/**
 * Self-healing login session manager.
 * Caches JWT tokens in .cache/session.json and validates age (< 20 hours).
 */
export async function getAuthSession(): Promise<{ jwtToken: string; feedToken: string }> {
  ensureCacheDirs();
  
  if (fs.existsSync(SESSION_PATH)) {
    try {
      const session = JSON.parse(fs.readFileSync(SESSION_PATH, "utf-8"));
      const ageHours = (Date.now() - session.loginTime) / (1000 * 60 * 60);
      if (ageHours < 20 && session.jwtToken && session.feedToken) {
        return { jwtToken: session.jwtToken, feedToken: session.feedToken };
      }
    } catch (e) {
      console.warn("Failed to parse session cache. Proceeding to re-login...");
    }
  }
  
  // Perform login
  console.log("No valid session cached. Logging in to Angel One...");
  const secret = process.env.ANGEL_TOTP_SECRET;
  const clientCode = process.env.ANGEL_CLIENT_CODE;
  const pin = process.env.ANGEL_PIN;
  const apiKey = process.env.ANGEL_API_KEY;
  
  if (!secret || !clientCode || !pin || !apiKey) {
    throw new Error("Missing Angel One credentials in environment variables (.env.local)");
  }
  
  const totpGenerator = new TOTP({
    secret,
    crypto: new NobleCryptoPlugin(),
    base32: new ScureBase32Plugin()
  });
  
  const totp = await totpGenerator.generate();
  
  try {
    const response = await axios.post(
      "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword",
      { clientcode: clientCode, password: pin, totp },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "00:00:00:00:00:00",
          "X-PrivateKey": apiKey,
        },
      }
    );
    
    if (response.data?.status && response.data?.data) {
      const { jwtToken, feedToken } = response.data.data;
      fs.writeFileSync(SESSION_PATH, JSON.stringify({
        jwtToken,
        feedToken,
        loginTime: Date.now()
      }, null, 2));
      console.log("Angel One login success, session cached.");
      return { jwtToken, feedToken };
    } else {
      throw new Error(`Angel One login error: ${response.data?.message || "Unknown error"}`);
    }
  } catch (error: any) {
    const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error("Angel One authentication failed:", errorDetails);
    throw new Error(`Angel One login failed: ${errorDetails}`);
  }
}

/**
 * Searches the local scrips catalog using query string.
 */
export async function searchSymbols(query: string): Promise<UnderlyingSymbol[]> {
  await ensureScripsBootstrapped();
  if (!query || query.trim() === "") return [];
  
  try {
    const data = JSON.parse(fs.readFileSync(UNDERLYINGS_PATH, "utf-8")) as UnderlyingSymbol[];
    const normalizedQuery = query.toUpperCase().trim();
    
    return data
      .filter(item => 
        item.name.toUpperCase().includes(normalizedQuery) || 
        item.symbol.toUpperCase().includes(normalizedQuery)
      )
      .slice(0, 15);
  } catch (error) {
    console.error("Local symbol search failed:", error);
    return [];
  }
}

/**
 * Fetches spot details and list of unique expiry dates for F&O underlying.
 */
export async function getActiveSymbolDetails(name: string): Promise<{ spot: UnderlyingSymbol; expiries: string[] }> {
  await ensureScripsBootstrapped();
  const searchResults = await searchSymbols(name);
  const spot = searchResults.find(item => item.name === name || item.symbol === name);
  
  if (!spot) {
    throw new Error(`Symbol ${name} not found in database`);
  }
  
  const optionsPath = path.join(OPTIONS_DIR, `${spot.name}.json`);
  let expiries: string[] = [];
  
  if (fs.existsSync(optionsPath)) {
    try {
      const options = JSON.parse(fs.readFileSync(optionsPath, "utf-8")) as OptionContract[];
      const uniqueExpiries = new Set(options.map(o => o.expiry));
      // Sort expiries: Angel One format is "25JUN2026"
      expiries = Array.from(uniqueExpiries).sort((a, b) => {
        const parseExpiry = (str: string) => {
          const day = parseInt(str.substring(0, 2));
          const monthStr = str.substring(2, 5).toUpperCase();
          const year = parseInt(str.substring(5, 9));
          const months = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
          return new Date(year, months[monthStr as keyof typeof months] || 0, day).getTime();
        };
        return parseExpiry(a) - parseExpiry(b);
      });
    } catch (e) {
      console.error("Failed to parse options file for expiries", e);
    }
  }
  
  return { spot, expiries };
}

/**
 * Fetches multiple quotes in a single POST request. Handles rate limits and token headers.
 */
export async function fetchQuotes(exchangeTokens: Record<string, string[]>): Promise<any[]> {
  const { jwtToken } = await getAuthSession();
  const apiKey = process.env.ANGEL_API_KEY!;
  
  try {
    const response = await axios.post(
      "https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote",
      {
        mode: "FULL",
        exchangeTokens
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "00:00:00:00:00:00",
          "X-PrivateKey": apiKey,
          Authorization: `Bearer ${jwtToken}`
        }
      }
    );
    
    if (response.data?.status && response.data?.data?.fetched) {
      return response.data.data.fetched;
    }
    
    // In case of 401 or auth failures inside successful responses, clear session cache to force retry next time
    if (response.data?.errorcode === "AG8001" || response.data?.message?.includes("Invalid Token")) {
      if (fs.existsSync(SESSION_PATH)) fs.unlinkSync(SESSION_PATH);
    }
    
    throw new Error(response.data?.message || "Failed to fetch quotes");
  } catch (error: any) {
    console.error("Quote API error:", error.message);
    throw error;
  }
}



/**
 * Builds the complete Option Chain for a symbol and expiry, with Greeks & IVs.
 */
export async function getOptionChain(symbolName: string, expiryDate: string): Promise<{ spotPrice: number; chain: OptionChainItem[] }> {
  await ensureScripsBootstrapped();
  
  // 1. Get Spot contract and current price
  const { spot } = await getActiveSymbolDetails(symbolName);
  const spotQuotes = await fetchQuotes({
    [spot.exchange]: [spot.token]
  });
  
  const spotQuote = spotQuotes[0];
  if (!spotQuote) {
    throw new Error(`Failed to fetch current spot price for ${symbolName}`);
  }
  const spotPrice = spotQuote.ltp;
  
  // 2. Read options contracts for symbol
  const optionsPath = path.join(OPTIONS_DIR, `${spot.name}.json`);
  if (!fs.existsSync(optionsPath)) {
    throw new Error(`Options contracts database not found for ${symbolName}`);
  }
  
  const allOptions = JSON.parse(fs.readFileSync(optionsPath, "utf-8")) as OptionContract[];
  
  // Filter by expiry and keep OPTIDX or OPTSTK
  const filteredOptions = allOptions.filter(o => 
    o.expiry === expiryDate && 
    (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK")
  );
  
  if (filteredOptions.length === 0) {
    return { spotPrice, chain: [] };
  }
  
  // 3. Find unique strikes, sort them
  const strikes = Array.from(new Set(filteredOptions.map(o => o.strike))).sort((a, b) => a - b);
  
  // 4. Find closest strike to spotPrice (ATM)
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < strikes.length; i++) {
    const diff = Math.abs(strikes[i] - spotPrice);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  
  // 5. Select 7 strikes below and 7 strikes above (15 strikes in total)
  const startIdx = Math.max(0, closestIdx - 7);
  const endIdx = Math.min(strikes.length - 1, closestIdx + 7);
  const selectedStrikes = strikes.slice(startIdx, endIdx + 1);
  
  // Map strike -> Calls/Puts
  const strikeMap: Record<number, { CE?: OptionContract; PE?: OptionContract }> = {};
  selectedStrikes.forEach(strike => {
    strikeMap[strike] = {};
  });
  
  filteredOptions.forEach(opt => {
    if (strikeMap[opt.strike]) {
      if (opt.symbol.endsWith("CE")) {
        strikeMap[opt.strike].CE = opt;
      } else if (opt.symbol.endsWith("PE")) {
        strikeMap[opt.strike].PE = opt;
      }
    }
  });
  
  // 6. Gather all option tokens for bulk quote fetch (max 30 tokens)
  const tokensToFetch: string[] = [];
  selectedStrikes.forEach(strike => {
    const pair = strikeMap[strike];
    if (pair.CE) tokensToFetch.push(pair.CE.token);
    if (pair.PE) tokensToFetch.push(pair.PE.token);
  });
  
  const optionQuotes = await fetchQuotes({
    "NFO": tokensToFetch
  });
  
  // Index option quotes by token ID
  const quotesMap: Record<string, any> = {};
  optionQuotes.forEach(q => {
    quotesMap[q.symbolToken] = q;
  });
  
  // 7. Calculate Greeks and compile Option Chain
  const chain: OptionChainItem[] = [];
  const t = getTimeToExpiry(expiryDate);
  const r = 0.065; // RBI repo rate / risk-free rate of 6.5%
  
  selectedStrikes.forEach(strike => {
    const pair = strikeMap[strike];
    let callDetail: OptionChainDetails | undefined;
    let putDetail: OptionChainDetails | undefined;
    
    // Call calculation
    if (pair.CE) {
      const q = quotesMap[pair.CE.token];
      if (q) {
        const ltp = q.ltp || 0;
        const netChange = q.netChange || 0;
        const percentChange = q.percentChange || 0;
        const oi = q.opnInterest || 0;
        
        let iv = 0.18; // default guess
        if (ltp > 0) {
          iv = calculateImpliedVolatility(ltp, spotPrice, strike, t, "CE", r);
        }
        
        const g = calculateBlackScholes({
          spotPrice,
          strikePrice: strike,
          timeToExpiry: t,
          volatility: iv,
          riskFreeRate: r
        });
        
        callDetail = {
          token: pair.CE.token,
          symbol: pair.CE.symbol,
          ltp,
          netChange,
          percentChange,
          oi,
          iv: iv * 100, // as percentage
          delta: g.deltaCall,
          gamma: g.gamma,
          theta: g.thetaCall * 365, // convert daily back to standard annual if needed, but page displays it
          vega: g.vega,
          lotsize: pair.CE.lotsize
        };
      }
    }
    
    // Put calculation
    if (pair.PE) {
      const q = quotesMap[pair.PE.token];
      if (q) {
        const ltp = q.ltp || 0;
        const netChange = q.netChange || 0;
        const percentChange = q.percentChange || 0;
        const oi = q.opnInterest || 0;
        
        let iv = 0.18; // default guess
        if (ltp > 0) {
          iv = calculateImpliedVolatility(ltp, spotPrice, strike, t, "PE", r);
        }
        
        const g = calculateBlackScholes({
          spotPrice,
          strikePrice: strike,
          timeToExpiry: t,
          volatility: iv,
          riskFreeRate: r
        });
        
        putDetail = {
          token: pair.PE.token,
          symbol: pair.PE.symbol,
          ltp,
          netChange,
          percentChange,
          oi,
          iv: iv * 100, // as percentage
          delta: g.deltaPut,
          gamma: g.gamma,
          theta: g.thetaPut * 365,
          vega: g.vega,
          lotsize: pair.PE.lotsize
        };
      }
    }
    
    chain.push({
      strikePrice: strike,
      call: callDetail,
      put: putDetail
    });
  });
  
  return { spotPrice, chain };
}

/**
 * Fetches historical candle data for chart.
 */
export async function getHistoricalCandles(
  exchange: string,
  token: string,
  interval: string,
  fromdate: string,
  todate: string
): Promise<any[]> {
  const { jwtToken } = await getAuthSession();
  const apiKey = process.env.ANGEL_API_KEY!;
  
  try {
    const response = await axios.post(
      "https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData",
      {
        exchange,
        symboltoken: token,
        interval,
        fromdate,
        todate
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "00:00:00:00:00:00",
          "X-PrivateKey": apiKey,
          Authorization: `Bearer ${jwtToken}`
        }
      }
    );
    
    if (response.data?.status && response.data?.data) {
      return response.data.data;
    }
    
    throw new Error(response.data?.message || "Failed to fetch historical candles");
  } catch (error: any) {
    console.error("Historical candle error:", error.message);
    throw error;
  }
}
