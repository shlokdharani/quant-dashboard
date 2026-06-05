"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
import React, { useState, useEffect, useRef } from "react";
import { 
  createChart, 
  ColorType, 
  IChartApi, 
  ISeriesApi,
  CandlestickSeries
} from "lightweight-charts";
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Search, 
  Award, 
  BookOpen, 
  Briefcase, 
  History, 
  ChevronRight, 
  RefreshCw, 
  Info, 
  Lock, 
  Unlock, 
  Settings, 
  DollarSign, 
  Percent, 
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play
} from "lucide-react";
import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "@/lib/firebase";
import { getTimeToExpiry } from "@/lib/blackScholes";
import type { UnderlyingSymbol, OptionChainItem, OptionChainDetails } from "@/lib/angelone";

export default function QuantDashboard() {
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UnderlyingSymbol[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<UnderlyingSymbol | null>(null);
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [spotPrice, setSpotPrice] = useState<number>(0);
  const [spotQuote, setSpotQuote] = useState<any | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartInterval, setChartInterval] = useState<string>("ONE_DAY");
  const [optionChain, setOptionChain] = useState<OptionChainItem[]>([]);
  const [selectedContract, setSelectedContract] = useState<{
    type: "CE" | "PE";
    strike: number;
    details: OptionChainDetails;
  } | null>(null);
  const [recommendation, setRecommendation] = useState<any | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"connected" | "connecting" | "error">("connecting");
  const [viewMode, setViewMode] = useState<"chart" | "chain">("chart");
  const [news, setNews] = useState<any[]>([]);
  
  // Loaders
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingRecommend, setLoadingRecommend] = useState(false);
  
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  // Paper Trading State
  const [paperBalance, setPaperBalance] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("paper_balance");
      return saved ? parseFloat(saved) : 1000000;
    }
    return 1000000;
  });
  const [paperPositions, setPaperPositions] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("paper_positions");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [paperHistory, setPaperHistory] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("paper_history");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [tradeQty, setTradeQty] = useState<number>(1); // number of lots or quantity
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");

  // Chart Ref
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);

  // Fetch Expiries when Selected Symbol changes
  const handleSelectSymbol = async (symbol: UnderlyingSymbol) => {
    setSelectedSymbol(symbol);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedExpiry("");
    setOptionChain([]);
    setSelectedContract(null);
    setRecommendation(null);
    
    try {
      setLoadingChain(true);
      const res = await fetch(`/api/active-symbol?symbol=${symbol.name}`);
      const data = await res.json();
      if (data.status && data.data) {
        setExpiries(data.data.expiries || []);
        if (data.data.expiries && data.data.expiries.length > 0) {
          setSelectedExpiry(data.data.expiries[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChain(false);
    }
  };

  // Firebase Auth & Sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, "users", u.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            setPaperBalance(data.balance || 1000000);
            
            try {
              const posSnap = await getDocs(collection(db, "users", u.uid, "open_positions"));
              if (!posSnap.empty) {
                setPaperPositions(posSnap.docs.map(d => d.data() as any));
              } else {
                setPaperPositions(data.positions || []);
              }
              
              const histSnap = await getDocs(collection(db, "users", u.uid, "trade_history"));
              if (!histSnap.empty) {
                const fetchedHistory = histSnap.docs.map(d => d.data() as any);
                fetchedHistory.sort((a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime());
                setPaperHistory(fetchedHistory);
              } else {
                setPaperHistory(data.history || []);
              }
            } catch (e) {
              setPaperPositions(data.positions || []);
              setPaperHistory(data.history || []);
            }
          } else {
            await setDoc(docRef, { balance: 1000000, positions: [], history: [] });
            setPaperBalance(1000000);
            setPaperPositions([]);
            setPaperHistory([]);
          }
      }
    });
    return () => unsub();
  }, []);

  // Initialize Angel One Session
  useEffect(() => {
    async function checkAuth() {
      try {
        setSessionStatus("connecting");
        const res = await fetch("/api/auth/angel");
        const data = await res.json();
        if (data.status) {
          setSessionStatus("connected");
          // Load default symbol NIFTY
          handleSelectSymbol({
            name: "NIFTY",
            symbol: "Nifty 50",
            token: "99926000",
            exchange: "NSE",
            isIndex: true
          });
        } else {
          setSessionStatus("error");
        }
      } catch (error) {
        console.error("Auth check failed", error);
        setSessionStatus("error");
      }
    }
    checkAuth();
  }, []);

  // Save Paper Trading state to Firestore
  useEffect(() => {
    if (user) {
      const saveToDb = async () => {
        try {
          await updateDoc(doc(db, "users", user.uid), {
            balance: paperBalance
          });
        } catch (e) { console.error("Firebase sync error", e); }
      };
      saveToDb();
    } else {
      localStorage.setItem("paper_balance", paperBalance.toString());
      localStorage.setItem("paper_positions", JSON.stringify(paperPositions));
      localStorage.setItem("paper_history", JSON.stringify(paperHistory));
    }
  }, [paperBalance, paperPositions, paperHistory, user]);

  // Symbol Autocomplete Search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      try {
        setLoadingSearch(true);
        const res = await fetch(`/api/search?q=${searchQuery}`);
        const data = await res.json();
        if (data.status) {
          setSearchResults(data.data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingSearch(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  
  // Fetch News
  const fetchNews = async () => {
    if (!selectedSymbol) return;
    try {
      const res = await fetch(`/api/news?symbol=${selectedSymbol.name}`);
      const data = await res.json();
      if (data.status && data.data) {
        setNews(data.data.items || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (selectedSymbol) {
      fetchNews();
    }
  }, [selectedSymbol]);

  // Fetch Chart Data
  const fetchChartData = async () => {
    if (!selectedSymbol) return;
    try {
      setLoadingChart(true);
      const res = await fetch(
        `/api/chart?exchange=${selectedSymbol.exchange}&token=${selectedSymbol.token}&interval=${chartInterval}`
      );
      const data = await res.json();
      if (data.status && data.data) {
        setChartData(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChart(false);
    }
  };

  useEffect(() => {
    fetchChartData();
  }, [selectedSymbol, chartInterval]);

  // Live Ticking Charts
  useEffect(() => {
    if (!selectedSymbol || !candleSeriesRef.current || chartData.length === 0) return;

    const intervalId = setInterval(async () => {
      try {
        const exchangeTokens: Record<string, string[]> = {
          [selectedSymbol.exchange]: [selectedSymbol.token]
        };
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exchangeTokens })
        });
        const data = await res.json();
        
        if (data.status && data.data && data.data.length > 0) {
          const quote = data.data[0];
          
          // Get the last candle from chart data to update it
          // TradingView lightweight charts `update` function requires updating the latest candle or appending a new one.
          // Since we are polling quotes, we just update the last candle's close, high, low.
          const lastCandle = chartData[chartData.length - 1];
          const newLtp = quote.ltp;
          
          const updatedCandle = {
            time: lastCandle.time,
            open: lastCandle.open,
            high: Math.max(lastCandle.high, newLtp),
            low: Math.min(lastCandle.low, newLtp),
            close: newLtp
          };
          
          candleSeriesRef.current.update(updatedCandle);
          
          // Also update the UI spotQuote summary
          setSpotQuote((prev: any) => {
             if (!prev) return prev;
             return {
               ...prev,
               ltp: newLtp,
               high: Math.max(prev.high, newLtp),
               low: Math.min(prev.low, newLtp),
               change: newLtp - prev.open,
               percentChange: ((newLtp - prev.open) / prev.open) * 100
             };
          });
          
          setSpotPrice(newLtp);
        }
      } catch (e) {
        console.error("Live chart tick error:", e);
      }
    }, 2000); // Fetch every 2 seconds for ticking

    return () => clearInterval(intervalId);
  }, [selectedSymbol, chartData.length]); // depend on length so it doesn't reset on every tick update


  // Fetch Option Chain and Spot Price
  const fetchOptionChain = async () => {
    if (!selectedSymbol || !selectedExpiry) return;
    try {
      setLoadingChain(true);
      const res = await fetch("/api/option-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: selectedSymbol.name, expiry: selectedExpiry })
      });
      const data = await res.json();
      if (data.status && data.data) {
        setOptionChain(data.data.chain || []);
        setSpotPrice(data.data.spotPrice || 0);
        
        // Also update spotQuote from quotes API
        const spotQuotesRes = await fetch(`/api/chart?exchange=${selectedSymbol.exchange}&token=${selectedSymbol.token}&interval=ONE_DAY`);
        const spotQuoteData = await spotQuotesRes.json();
        if (spotQuoteData.status && spotQuoteData.data && spotQuoteData.data.length > 0) {
          const latestCandle = spotQuoteData.data[spotQuoteData.data.length - 1];
          setSpotQuote({
            ltp: latestCandle.close,
            open: latestCandle.open,
            high: latestCandle.high,
            low: latestCandle.low,
            change: latestCandle.close - latestCandle.open,
            percentChange: ((latestCandle.close - latestCandle.open) / latestCandle.open) * 100
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChain(false);
    }
  };

  useEffect(() => {
    fetchOptionChain();
  }, [selectedSymbol, selectedExpiry]);

  // Real-time polling for open positions prices (every 10 seconds)
  useEffect(() => {
    if (paperPositions.length === 0) return;

    const intervalId = setInterval(async () => {
      try {
        // Group tokens by exchange
        const nseTokens: string[] = [];
        const nfoTokens: string[] = [];
        const bseTokens: string[] = [];

        paperPositions.forEach(p => {
          if (p.exchange === "NSE") nseTokens.push(p.token);
          else if (p.exchange === "NFO") nfoTokens.push(p.token);
          else if (p.exchange === "BSE") bseTokens.push(p.token);
        });

        const exchangeTokens: Record<string, string[]> = {};
        if (nseTokens.length > 0) exchangeTokens.NSE = nseTokens;
        if (nfoTokens.length > 0) exchangeTokens.NFO = nfoTokens;
        if (bseTokens.length > 0) exchangeTokens.BSE = bseTokens;

        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exchangeTokens })
        });
        const data = await res.json();
        
        if (data.status && data.data) {
          const fetchedQuotes = data.data;
          const priceMap: Record<string, number> = {};
          
          fetchedQuotes.forEach((q: any) => {
            priceMap[q.symbolToken] = q.ltp;
          });

          setPaperPositions(prev => 
            prev.map(pos => {
              if (priceMap[pos.token] !== undefined) {
                const currentPrice = priceMap[pos.token];
                const pnl = pos.type === "BUY"
                  ? (currentPrice - pos.entryPrice) * pos.qty * (pos.lotsize || 1)
                  : (pos.entryPrice - currentPrice) * pos.qty * (pos.lotsize || 1);
                return { ...pos, currentPrice, pnl };
              }
              return pos;
            })
          );
        }
      } catch (error) {
        console.error("Live position updates failed", error);
      }
    }, 8000);

    return () => clearInterval(intervalId);
  }, [paperPositions, selectedExpiry, selectedSymbol]);

  // Fetch AI Recommendation
  const fetchRecommendation = async () => {
    if (!selectedContract || !selectedSymbol) return;
    try {
      setLoadingRecommend(true);
      setRecommendation(null);
      
      const timeToExpiry = selectedExpiry ? getTimeToExpiry(selectedExpiry) : 30 / 365;
      
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol.name,
          optionSymbol: selectedContract.details.symbol,
          optionType: selectedContract.type,
          strike: selectedContract.strike,
          ltp: selectedContract.details.ltp,
          spotPrice: spotPrice,
          expiry: selectedExpiry,
          greeks: {
            delta: selectedContract.details.delta,
            gamma: selectedContract.details.gamma,
            theta: selectedContract.details.theta,
            vega: selectedContract.details.vega,
            iv: selectedContract.details.iv
          },
          timeToExpiry,
          news
        })
      });
      const data = await res.json();
      if (data.status) {
        setRecommendation(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRecommend(false);
    }
  };

  useEffect(() => {
    if (selectedContract) {
      fetchRecommendation();
    }
  }, [selectedContract]);

  // Render TradingView Chart
  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#334155",
      },
      grid: {
        vertLines: { color: "rgba(51, 65, 85, 0.15)" },
        horzLines: { color: "rgba(51, 65, 85, 0.15)" },
      },
      rightPriceScale: {
        borderColor: "rgba(51, 65, 85, 0.3)",
      },
      timeScale: {
        borderColor: "rgba(51, 65, 85, 0.3)",
        timeVisible: chartInterval !== "ONE_DAY",
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    candlestickSeries.setData(chartData);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    candleSeriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [chartData, viewMode]);

  // Payoff Chart Generation
  const generatePayoffData = () => {
    if (!selectedContract) return [];
    const { strike, type, details } = selectedContract;
    const premium = details.ltp || 10;
    const steps = 40;
    const range = strike * 0.10; // +/- 10%
    const stepSize = (range * 2) / steps;
    const data = [];

    const minSpot = strike - range;

    for (let i = 0; i <= steps; i++) {
      const spotAtExpiry = minSpot + i * stepSize;
      let payoff = 0;
      
      if (type === "CE") {
        payoff = tradeType === "BUY"
          ? Math.max(0, spotAtExpiry - strike) - premium
          : premium - Math.max(0, spotAtExpiry - strike);
      } else {
        payoff = tradeType === "BUY"
          ? Math.max(0, strike - spotAtExpiry) - premium
          : premium - Math.max(0, strike - spotAtExpiry);
      }

      // Multiply by lot size for total cash payoff
      const lotsize = details.lotsize || 1;
      
      data.push({
        spotAtExpiry: Math.round(spotAtExpiry),
        payoff: Math.round(payoff * (lotsize || 1) * tradeQty),
      });
    }

    return data;
  };

  // Time to expiry helper imported from lib/angelone

  // Handle Paper Trading - Enter Trade
  const handleEnterTrade = () => {
    if (!selectedSymbol) return;

    let tradeSymbol = selectedSymbol.symbol;
    let entryPrice = spotPrice;
    let token = selectedSymbol.token;
    let exchange = selectedSymbol.exchange;
    let lotsize = 1;
    let instrumentType = "SPOT";

    if (viewMode === "chain") {
      if (!selectedContract) {
        alert("Please select an option contract from the Option Chain first.");
        return;
      }
      tradeSymbol = selectedContract.details.symbol;
      entryPrice = selectedContract.details.ltp;
      token = selectedContract.details.token;
      exchange = "NFO";
      lotsize = selectedContract.details.lotsize || 1;
      instrumentType = selectedContract.type;
    }

    const marginRequired = entryPrice * tradeQty * lotsize;
    
    // Validate balance for Buying
    if (tradeType === "BUY" && paperBalance < marginRequired) {
      alert("Insufficient virtual balance to enter this trade!");
      return;
    }

    const newPosition = {
      id: Math.random().toString(36).substring(2, 9),
      underlying: selectedSymbol.name,
      symbol: tradeSymbol,
      token,
      exchange,
      type: tradeType,
      instrumentType,
      lotsize,
      qty: tradeQty,
      entryPrice,
      currentPrice: entryPrice,
      pnl: 0,
      time: new Date().toLocaleString()
    };

    setPaperPositions(prev => [newPosition, ...prev]);
    
    if (user) {
      setDoc(doc(db, "users", user.uid, "open_positions", newPosition.id), newPosition).catch(console.error);
    }
    
    // Deduct balance for buying premium
    if (tradeType === "BUY") {
      setPaperBalance(prev => prev - marginRequired);
    } else {
      // Credit balance for selling premium
      setPaperBalance(prev => prev + marginRequired);
    }

    alert(`Simulated position opened: ${tradeType} ${tradeQty} lot(s) of ${tradeSymbol} at ₹${entryPrice}`);
  };

  // Close Paper Trading Position
  const handleClosePosition = (position: any) => {
    const marginImpact = position.currentPrice * position.qty * position.lotsize;
    
    // Calculate realized cash back
    if (position.type === "BUY") {
      // Selling back the option: receive current price cash
      setPaperBalance(prev => prev + marginImpact);
    } else {
      // Buying back the sold option: pay current price cash to close
      setPaperBalance(prev => prev - marginImpact);
    }

    // Add to History
    const closedTrade = {
      ...position,
      exitPrice: position.currentPrice,
      realizedPnl: position.pnl,
      exitTime: new Date().toLocaleString()
    };

    setPaperHistory(prev => [closedTrade, ...prev]);
    // Remove from active positions
    setPaperPositions(prev => prev.filter(p => p.id !== position.id));

    if (user) {
      setDoc(doc(db, "users", user.uid, "trade_history", closedTrade.id), closedTrade).catch(console.error);
      deleteDoc(doc(db, "users", user.uid, "open_positions", position.id)).catch(console.error);
    }

    alert(`Simulated position closed! Realized P&L: ₹${position.pnl.toLocaleString()}`);
  };

  // Portfolio Metrics Calculations
  const totalRealizedPnl = paperHistory.reduce((sum, h) => sum + h.realizedPnl, 0);
  const totalUnrealizedPnl = paperPositions.reduce((sum, p) => sum + p.pnl, 0);
  const totalPortfolioValue = paperBalance + totalUnrealizedPnl;
  const winRate = paperHistory.length > 0 
    ? (paperHistory.filter(h => h.realizedPnl > 0).length / paperHistory.length) * 100 
    : 0;

  // Generate Equity Curve
  const generateEquityCurve = () => {
    let runningBalance = 1000000;
    const curve = [{ tradeNum: 0, capital: runningBalance }];
    
    // Process history chronologically (reverse array copy)
    const sortedHistory = [...paperHistory].reverse();
    
    sortedHistory.forEach((trade, index) => {
      runningBalance += trade.realizedPnl;
      curve.push({
        tradeNum: index + 1,
        capital: runningBalance
      });
    });

    return curve;
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-slate-900">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20">
            <Activity className="w-5 h-5 text-slate-900" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-slate-900 bg-clip-text bg-gradient-to-r from-white via-slate-100 to-indigo-200">
              Option IQ
            </span>
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              dashboard
            </span>
          </div>
        </div>

        {/* API Status & Connection */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-slate-500">Angel One Status:</span>
            {sessionStatus === "connected" ? (
              <span className="flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-green">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
              </span>
            ) : sessionStatus === "connecting" ? (
              <span className="flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Authenticating...
              </span>
            ) : (
              <span className="flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 glow-red">
                <AlertTriangle className="w-3 h-3 mr-1" /> Connection Failed
              </span>
            )}
          </div>

          <div className="text-xs text-slate-500 border-l border-slate-200 pl-4 flex items-center space-x-4">
            <button onClick={() => user ? signOut(auth) : setShowAuthModal(true)} className="px-3 py-1 rounded bg-indigo-500 text-slate-50 font-bold hover:bg-indigo-600 transition">
              {user ? "Sign Out" : "Log In"}
            </button>
            <span>
            Balance: <span className="font-semibold text-slate-700">₹{isMounted ? paperBalance.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "1,000,000.00"}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
        
        {/* Left Search & Instrument Panel */}
        <div className="lg:col-span-3 flex flex-col space-y-6">
          <div className="glass-panel rounded-2xl p-4 flex flex-col space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Symbol Finder
            </h2>
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search stocks/indices (e.g. SBIN, NIFTY)"
                className="w-full pl-9 pr-4 py-2 text-sm rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {loadingSearch && (
                <RefreshCw className="absolute right-3 top-2.5 w-4 h-4 text-slate-500 animate-spin" />
              )}
            </div>

            {/* Autocomplete Results */}
            {searchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-xl bg-white/90 border border-slate-200 divide-y divide-slate-800/50 shadow-xl">
                {searchResults.map((result) => (
                  <button
                    key={result.token}
                    onClick={() => handleSelectSymbol(result)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-100/40 text-sm transition-colors text-slate-200"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{result.name}</div>
                      <div className="text-xs text-slate-500">{result.symbol}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {result.exchange}
                      </span>
                      {result.isIndex && (
                        <span className="text-[9px] uppercase font-bold text-indigo-400 mt-1">
                          Index
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected Active Instrument Card */}
            {selectedSymbol && (
              <div className="rounded-xl border border-slate-200/80 bg-white/40 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                      {selectedSymbol.name}
                    </h3>
                    <p className="text-xs text-slate-500">{selectedSymbol.symbol}</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-700 text-slate-700">
                    {selectedSymbol.exchange}
                  </span>
                </div>

                {/* Spot Price & Percent Change */}
                {spotQuote ? (
                  <div className="mt-4 flex items-baseline space-x-3">
                    <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                      ₹{spotQuote.ltp.toFixed(2)}
                    </span>
                    <span className={`flex items-center text-xs font-semibold ${
                      spotQuote.change >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {spotQuote.change >= 0 ? "+" : ""}
                      {spotQuote.change.toFixed(2)} ({spotQuote.change >= 0 ? "+" : ""}
                      {spotQuote.percentChange.toFixed(2)}%)
                    </span>
                  </div>
                ) : (
                  <div className="mt-4 h-8 bg-slate-100 animate-pulse rounded-lg"></div>
                )}

                {/* Day OHLC stats */}
                {spotQuote && (
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs border-t border-slate-200/50 pt-3">
                    <div>
                      <span className="text-slate-500">Open: </span>
                      <span className="font-semibold text-slate-700">₹{spotQuote.open.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">High: </span>
                      <span className="font-semibold text-slate-700">₹{spotQuote.high.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Low: </span>
                      <span className="font-semibold text-slate-700">₹{spotQuote.low.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Prev Close: </span>
                      <span className="font-semibold text-slate-700">₹{(spotQuote.ltp - spotQuote.change).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Expiry Selector (For F&O underlyings) */}
                {expiries.length > 0 ? (
                  <div className="mt-4 pt-3 border-t border-slate-200/50">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Select Option Expiry
                    </label>
                    <select
                      value={selectedExpiry}
                      onChange={(e) => setSelectedExpiry(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                    >
                      {expiries.map((exp) => (
                        <option key={exp} value={exp}>
                          {exp}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mt-4 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 flex items-center">
                    <Info className="w-4 h-4 mr-1.5 flex-shrink-0" />
                    <span>No derivatives active for this symbol.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Simulated Position Builder */}
          {selectedSymbol && (
            <div className="glass-panel rounded-2xl p-4 flex flex-col space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Simulation Panel
              </h2>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTradeType("BUY")}
                  className={`py-2 rounded-xl text-xs font-bold tracking-wider transition-smooth ${
                    tradeType === "BUY"
                      ? "bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20"
                      : "bg-white text-slate-500 hover:text-slate-200 border border-slate-200"
                  }`}
                >
                  GO LONG (BUY)
                </button>
                <button
                  onClick={() => setTradeType("SELL")}
                  className={`py-2 rounded-xl text-xs font-bold tracking-wider transition-smooth ${
                    tradeType === "SELL"
                      ? "bg-red-500 text-slate-900 shadow-lg shadow-red-500/20"
                      : "bg-white text-slate-500 hover:text-slate-200 border border-slate-200"
                  }`}
                >
                  GO SHORT (SELL)
                </button>
              </div>

              {/* Selection context warning */}
              <div className="text-[11px] text-slate-500 bg-white/50 border border-slate-200/80 rounded-xl p-3">
                {viewMode === "chain" ? (
                  selectedContract ? (
                    <div>
                      Target Contract: <span className="font-semibold text-slate-900">{selectedContract.details.symbol}</span>
                      <div className="mt-1">LTP: <span className="font-semibold text-indigo-400">₹{selectedContract.details.ltp}</span></div>
                    </div>
                  ) : (
                    <span className="text-amber-400">Please click on a Call (LTP) or Put (LTP) cell in the Option Chain table to target an option contract.</span>
                  )
                ) : (
                  <div>
                    Target Instrument: <span className="font-semibold text-slate-900">{selectedSymbol.symbol}</span>
                    <div className="mt-1">LTP: <span className="font-semibold text-indigo-400">₹{spotPrice || spotQuote?.ltp || 0}</span></div>
                  </div>
                )}
              </div>

              {/* Quantity Selector */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Quantity / Lots (1 lot = {selectedContract?.details?.lotsize || 1} Qty)
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setTradeQty(Math.max(1, tradeQty - 1))}
                    className="w-10 h-10 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-900"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    className="w-full h-10 text-center rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 font-bold"
                    value={tradeQty}
                    onChange={(e) => setTradeQty(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  <button
                    onClick={() => setTradeQty(tradeQty + 1)}
                    className="w-10 h-10 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-900"
                  >
                    +
                  </button>
                </div>
              </div>

                <div className="flex justify-between items-center text-sm font-semibold text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span>Required Margin:</span>
                  <span className="text-indigo-600">₹{((selectedContract?.details?.ltp || 0) * tradeQty * (selectedContract?.details?.lotsize || 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                <button
                  onClick={handleEnterTrade}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-slate-900 font-bold text-sm tracking-wider shadow-lg shadow-indigo-500/10 transition-smooth"
              >
                EXECUTE SIMULATED ORDER
              </button>
            </div>
          )}

            {/* Live News Ticker */}
            {selectedSymbol && (
              <div className="glass-panel rounded-2xl p-4 flex flex-col space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Live News Ticker</h2>
                <div className="flex-grow overflow-y-auto space-y-3 max-h-64 pr-1">
                  {news.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center py-4">No recent news available.</div>
                  ) : (
                    news.map((n, i) => (
                      <a href={n.link} target="_blank" rel="noreferrer" key={i} className="block text-xs pb-2 border-b border-slate-200/60 last:border-0 last:pb-0 hover:bg-slate-50 transition p-1 -mx-1 rounded">
                        <div className="font-medium text-slate-700 mb-1 leading-snug">{n.title}</div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span className="font-semibold text-indigo-400">{n.source}</span>
                          <span>{n.time}</span>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              </div>
            )}

        </div>

        {/* Right Dashboard Tabs and Workspace Panels */}
        <div className="lg:col-span-9 flex flex-col space-y-6">
          {/* Market Chart vs Option Chain Toggle */}
          <div className="flex space-x-2 border-b border-slate-200 pb-px mb-4">
            <button
              onClick={() => setViewMode("chart")}
              className={`flex items-center space-x-2 px-5 py-3 border-b-2 text-sm font-semibold tracking-wide transition-smooth focus:outline-none ${
                viewMode === "chart"
                  ? "border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]"
                  : "border-transparent text-slate-500 hover:text-slate-200 hover:bg-white/20"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Market Chart</span>
            </button>
            <button
              onClick={() => setViewMode("chain")}
              className={`flex items-center space-x-2 px-5 py-3 border-b-2 text-sm font-semibold tracking-wide transition-smooth focus:outline-none ${
                viewMode === "chain"
                  ? "border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]"
                  : "border-transparent text-slate-500 hover:text-slate-200 hover:bg-white/20"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Option Chain</span>
            </button>
          </div>

          {/* Tab Workspaces */}
          <div className="flex-grow">
            
            {/* Tab 1: Market Chart */}
            {viewMode === "chart" && (
              <div className="glass-panel rounded-3xl p-6 flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                      Technical Candle Chart
                    </h2>
                    <p className="text-xs text-slate-500">Interactive TradingView widget fed by Angel One SmartAPI candles</p>
                  </div>
                  
                  {/* Interval Selector */}
                  <div className="flex rounded-lg bg-white p-1 border border-slate-200">
                    {[
                      { id: "FIVE_MINUTE", label: "5m" },
                      { id: "FIFTEEN_MINUTE", label: "15m" },
                      { id: "ONE_HOUR", label: "1h" },
                      { id: "ONE_DAY", label: "Daily" }
                    ].map(int => (
                      <button
                        key={int.id}
                        onClick={() => setChartInterval(int.id)}
                        className={`px-3 py-1 text-xs font-semibold rounded ${
                          chartInterval === int.id
                            ? "bg-indigo-500 text-slate-900 shadow"
                            : "text-slate-500 hover:text-slate-200"
                        }`}
                      >
                        {int.label}
                      </button>
                    ))}
                  </div>
                </div>

                {loadingChart ? (
                  <div className="h-[400px] flex items-center justify-center bg-slate-50/40 rounded-2xl border border-slate-200 animate-pulse">
                    <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                  </div>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-2">
                    <div ref={chartContainerRef} className="w-full" />
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Option Chain */}
            {viewMode === "chain" && (
              <div className="glass-panel rounded-3xl p-6 flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                      Real-Time Option Chain
                    </h2>
                    <p className="text-xs text-slate-500">Black-Scholes calculated Greeks (RBI Risk-Free Rate = 6.50%)</p>
                  </div>

                  <div className="text-xs text-slate-500">
                    Spot Price: <span className="font-bold text-indigo-400">₹{spotPrice.toLocaleString()}</span>
                  </div>
                </div>

                {loadingChain ? (
                  <div className="h-96 flex items-center justify-center animate-pulse">
                    <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                  </div>
                ) : optionChain.length === 0 ? (
                  <div className="h-60 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl text-slate-500">
                    <BookOpen className="w-8 h-8 mb-2" />
                    <span>No option contracts loaded. Verify active expiry selection.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50">
                    <table className="w-full border-collapse text-left text-xs text-slate-700">
                      <thead>
                        <tr className="bg-white/80 text-[10px] uppercase font-bold tracking-wider text-slate-500 border-b border-slate-200">
                          <th colSpan={5} className="py-2.5 text-center border-r border-slate-200 text-emerald-400">CALLS (CE)</th>
                          <th className="py-2.5 text-center bg-white border-r border-slate-200">STRIKE</th>
                          <th colSpan={5} className="py-2.5 text-center text-red-400">PUTS (PE)</th>
                        </tr>
                        <tr className="bg-white/40 text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-200 text-center">
                          <th className="py-2 font-medium">OI</th>
                          <th className="py-2 font-medium">IV</th>
                          <th className="py-2 font-medium">Delta</th>
                          <th className="py-2 font-medium text-emerald-500">LTP</th>
                          <th className="py-2 font-medium border-r border-slate-200">Net Chg</th>
                          <th className="py-2 font-semibold bg-white/60 border-r border-slate-200 text-slate-700 text-center">Strike</th>
                          <th className="py-2 font-medium text-red-500">LTP</th>
                          <th className="py-2 font-medium">Net Chg</th>
                          <th className="py-2 font-medium">Delta</th>
                          <th className="py-2 font-medium">IV</th>
                          <th className="py-2 font-medium">OI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {optionChain.map((row) => {
                          const callLtp = row.call?.ltp || 0;
                          const putLtp = row.put?.ltp || 0;
                          
                          // Determine if Calls/Puts are ITM
                          const isCallITM = spotPrice > row.strikePrice;
                          const isPutITM = spotPrice < row.strikePrice;

                          const isSelectedCall = selectedContract?.type === "CE" && selectedContract.strike === row.strikePrice;
                          const isSelectedPut = selectedContract?.type === "PE" && selectedContract.strike === row.strikePrice;

                          return (
                            <tr 
                              key={row.strikePrice} 
                              className="border-b border-slate-200 hover:bg-white/35 transition-colors text-center font-medium"
                            >
                              {/* Call Columns */}
                              <td className={`py-3 text-slate-500 ${isCallITM ? "bg-emerald-500/[0.02]" : ""}`}>
                                {row.call?.oi.toLocaleString() || "0"}
                              </td>
                              <td className={`py-3 text-indigo-400/90 ${isCallITM ? "bg-emerald-500/[0.02]" : ""}`}>
                                {row.call?.iv ? `${row.call.iv.toFixed(1)}%` : "0.0%"}
                              </td>
                              <td className={`py-3 text-slate-700 ${isCallITM ? "bg-emerald-500/[0.02]" : ""}`}>
                                {row.call?.delta ? row.call.delta.toFixed(2) : "0.0"}
                              </td>
                              <td 
                                onClick={() => row.call && setSelectedContract({ type: "CE", strike: row.strikePrice, details: row.call })}
                                className={`py-3 cursor-pointer text-emerald-400 hover:bg-emerald-500/10 font-bold border-r border-slate-200 ${
                                  isSelectedCall ? "bg-emerald-500/20 text-slate-900 outline outline-1 outline-emerald-500" : isCallITM ? "bg-emerald-500/[0.05]" : ""
                                }`}
                              >
                                ₹{callLtp.toFixed(1)}
                              </td>
                              <td className={`py-3 text-xs ${
                                row.call && row.call.netChange >= 0 ? "text-emerald-500" : "text-red-500"
                              } border-r border-slate-200 ${isCallITM ? "bg-emerald-500/[0.02]" : ""}`}>
                                {row.call ? `${row.call.netChange >= 0 ? "+" : ""}${row.call.netChange.toFixed(1)}` : "0.0"}
                              </td>

                              {/* Strike column */}
                              <td className="py-3 font-extrabold bg-slate-50 border-r border-slate-200 text-indigo-300 text-center">
                                {row.strikePrice}
                              </td>

                              {/* Put Columns */}
                              <td 
                                onClick={() => row.put && setSelectedContract({ type: "PE", strike: row.strikePrice, details: row.put })}
                                className={`py-3 cursor-pointer text-red-400 hover:bg-red-500/10 font-bold ${
                                  isSelectedPut ? "bg-red-500/20 text-slate-900 outline outline-1 outline-red-500" : isPutITM ? "bg-red-500/[0.05]" : ""
                                }`}
                              >
                                ₹{putLtp.toFixed(1)}
                              </td>
                              <td className={`py-3 text-xs ${
                                row.put && row.put.netChange >= 0 ? "text-emerald-500" : "text-red-500"
                              } ${isPutITM ? "bg-red-500/[0.02]" : ""}`}>
                                {row.put ? `${row.put.netChange >= 0 ? "+" : ""}${row.put.netChange.toFixed(1)}` : "0.0"}
                              </td>
                              <td className={`py-3 text-slate-700 ${isPutITM ? "bg-red-500/[0.02]" : ""}`}>
                                {row.put?.delta ? row.put.delta.toFixed(2) : "0.0"}
                              </td>
                              <td className={`py-3 text-indigo-400/90 ${isPutITM ? "bg-red-500/[0.02]" : ""}`}>
                                {row.put?.iv ? `${row.put.iv.toFixed(1)}%` : "0.0%"}
                              </td>
                              <td className={`py-3 text-slate-500 ${isPutITM ? "bg-red-500/[0.02]" : ""}`}>
                                {row.put?.oi.toLocaleString() || "0"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Greek Analytics */}
            <div className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* IV Smile */}
                <div className="glass-panel rounded-3xl p-6 flex flex-col space-y-4">
                  <h2 className="text-md font-bold text-slate-900 tracking-tight">Implied Volatility Smile (IV Smile)</h2>
                  <p className="text-xs text-slate-500">IV skew plotted across option strike prices</p>
                  
                  {optionChain.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={optionChain.map(item => ({
                          strike: item.strikePrice,
                          callIV: item.call?.iv || null,
                          putIV: item.put?.iv || null
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.15)" />
                          <XAxis dataKey="strike" stroke="#64748b" fontSize={10} />
                          <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} unit="%" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid #334155" }}
                            labelStyle={{ color: "#fff", fontWeight: "bold" }}
                          />
                          <Legend verticalAlign="top" height={36} />
                          <Line type="monotone" dataKey="callIV" name="Call IV" stroke="#10b981" strokeWidth={2} activeDot={{ r: 8 }} connectNulls />
                          <Line type="monotone" dataKey="putIV" name="Put IV" stroke="#ef4444" strokeWidth={2} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                      No option chain data to plot.
                    </div>
                  )}
                </div>

                {/* Delta Risk Profile */}
                <div className="glass-panel rounded-3xl p-6 flex flex-col space-y-4">
                  <h2 className="text-md font-bold text-slate-900 tracking-tight">Delta Profile</h2>
                  <p className="text-xs text-slate-500">Option Delta distribution across strike prices</p>

                  {optionChain.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={optionChain.map(item => ({
                          strike: item.strikePrice,
                          callDelta: item.call?.delta || 0,
                          putDelta: item.put?.delta || 0
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.15)" />
                          <XAxis dataKey="strike" stroke="#64748b" fontSize={10} />
                          <YAxis stroke="#64748b" fontSize={10} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid #334155" }}
                            labelStyle={{ color: "#fff", fontWeight: "bold" }}
                          />
                          <Legend verticalAlign="top" height={36} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                          <Bar dataKey="callDelta" name="Call Delta" fill="#10b981" opacity={0.8} />
                          <Bar dataKey="putDelta" name="Put Delta" fill="#ef4444" opacity={0.8} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                      No option chain data to plot.
                    </div>
                  )}
              </div>
            </div>

            {/* AI Recommendation */}
            <div className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Scorecard Details */}
                <div className="lg:col-span-2 flex flex-col space-y-6">
                  <div className="glass-panel rounded-3xl p-6 flex flex-col space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 tracking-tight">AI Quantitative Scoring</h2>
                        <p className="text-xs text-slate-500">Deep mathematical analysis of selected contract</p>
                      </div>

                      {/* Rec Pill */}
                      {recommendation && (
                        <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                          recommendation.recommendation === "BUY"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 glow-green"
                            : recommendation.recommendation === "SELL"
                            ? "bg-red-500/20 text-red-400 border border-red-500/40 glow-red"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        }`}>
                          {recommendation.recommendation}
                        </span>
                      )}
                    </div>

                    {loadingRecommend ? (
                      <div className="h-60 flex items-center justify-center">
                        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                      </div>
                    ) : !selectedContract ? (
                      <div className="h-60 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl text-slate-500">
                        <Info className="w-8 h-8 mb-2" />
                        <span>Select a strike price CE or PE cell in the Option Chain tab first.</span>
                      </div>
                    ) : recommendation ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                        {/* Gauge/Score */}
                        <div className="flex flex-col items-center justify-center bg-white/30 border border-slate-200 rounded-2xl p-4">
                          <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Quant Score</span>
                          <span className="text-5xl font-black text-slate-900 mt-3 bg-clip-text bg-gradient-to-tr from-indigo-400 to-purple-500">
                            {recommendation.score}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-2">0 (Avoid) - 100 (Strong Buy)</span>
                        </div>

                        {/* Analysis Fields */}
                        <div className="md:col-span-2 flex flex-col space-y-4">
                          <div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Greeks Health:</span>
                            <p className="text-xs text-slate-700 mt-1">{recommendation.greeksAnalysis}</p>
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Volatility Skew:</span>
                            <p className="text-xs text-slate-700 mt-1">{recommendation.volatilityAnalysis}</p>
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Risk-Reward Analysis:</span>
                            <p className="text-xs text-slate-700 mt-1">{recommendation.riskReward}</p>
                          </div>
                        </div>

                        {/* Reasoning */}
                        <div className="col-span-1 md:col-span-3 border-t border-slate-200 pt-4 flex flex-col space-y-3">
                          <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Strategic Reasoning:</span>
                          <ul className="space-y-2.5">
                            {recommendation.reasoning.map((item: string, idx: number) => (
                              <li key={idx} className="flex items-start text-xs text-slate-700">
                                <ChevronRight className="w-4 h-4 mr-1 text-indigo-400 flex-shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <div className="h-60 flex items-center justify-center text-slate-500 text-sm">
                        Waiting for analysis...
                      </div>
                    )}
                  </div>
                </div>

                {/* Option Expiry Payoff Graph */}
                <div className="lg:col-span-1">
                  <div className="glass-panel rounded-3xl p-6 flex flex-col space-y-4 h-full">
                    <div>
                      <h2 className="text-md font-bold text-slate-900 tracking-tight">Payoff Graph at Expiry</h2>
                      <p className="text-xs text-slate-500">Visual P&L based on spot price at expiry</p>
                    </div>

                    {selectedContract ? (
                      <div className="flex-grow flex flex-col justify-between">
                        <div className="h-60 mt-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={generatePayoffData()}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.1)" />
                              <XAxis dataKey="spotAtExpiry" stroke="#64748b" fontSize={9} />
                              <YAxis stroke="#64748b" fontSize={9} />
                              <Tooltip
                                formatter={(value: any) => [`₹${Number(value || 0).toLocaleString()}`, "P&L"]}
                                contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid #334155" }}
                              />
                              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Breakeven', fill: '#ef4444', fontSize: 9 }} />
                              <ReferenceLine x={Math.round(spotPrice)} stroke="#6366f1" label={{ value: 'Current Spot', fill: '#6366f1', fontSize: 9 }} />
                              <Area type="monotone" dataKey="payoff" stroke="#4f46e5" fill="rgba(79, 70, 229, 0.15)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="border-t border-slate-200 pt-3 text-[10px] text-slate-500">
                          <div>* Pays out based on {tradeQty} Lot(s) ({selectedContract?.details?.lotsize || 1} multiplier)</div>
                          <div>* Assumes holding till expiry. Premium paid is max loss.</div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-60 flex items-center justify-center text-slate-500 text-sm">
                        Select a contract to see payoff.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Paper Trading Platform */}
            <div className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Side: KPIs and Equity Curve */}
                <div className="lg:col-span-2 flex flex-col space-y-6">
                  
                  {/* KPI Cards Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="glass-panel rounded-2xl p-4 flex flex-col">
                      <span className="text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Account Capital</span>
                      <span suppressHydrationWarning className="text-xl font-black text-slate-900 mt-1.5">
                        ₹{totalPortfolioValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                    </div>

                    <div className="glass-panel rounded-2xl p-4 flex flex-col">
                      <span className="text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Cash Balance</span>
                      <span suppressHydrationWarning className="text-xl font-black text-slate-900 mt-1.5">
                        ₹{paperBalance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                    </div>

                    <div className="glass-panel rounded-2xl p-4 flex flex-col">
                      <span className="text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Unrealized P&L</span>
                      <span suppressHydrationWarning className={`text-xl font-black mt-1.5 ${totalUnrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ₹{totalUnrealizedPnl.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                    </div>

                    <div className="glass-panel rounded-2xl p-4 flex flex-col">
                      <span className="text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Win Rate (KPI)</span>
                      <span className="text-xl font-black text-indigo-400 mt-1.5">
                        {winRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Equity Growth Curve */}
                  <div className="glass-panel rounded-3xl p-6 flex flex-col space-y-4">
                    <h3 className="text-md font-bold text-slate-900 tracking-tight">Capital Growth Curve (Equity Curve)</h3>
                    <p className="text-xs text-slate-500">Cumulative simulated account value over trade iterations</p>

                    {paperHistory.length > 0 ? (
                      <div className="h-60 mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={generateEquityCurve()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.15)" />
                            <XAxis dataKey="tradeNum" stroke="#64748b" fontSize={10} name="Trade Iteration" />
                            <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} tickFormatter={(val: any) => `₹${(Number(val) / 1000).toFixed(0)}K`} />
                            <Tooltip
                              formatter={(value: any) => [`₹${Number(value || 0).toLocaleString()}`, "Capital"]}
                              contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid #334155" }}
                            />
                            <Area type="monotone" dataKey="capital" stroke="#6366f1" fill="rgba(99, 102, 241, 0.08)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-60 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl text-slate-500">
                        <History className="w-8 h-8 mb-2" />
                        <span>Perform trades and close them to build your Equity Curve.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Active Positions Table */}
                <div className="lg:col-span-1 flex flex-col space-y-6">
                  
                  {/* Positions Card */}
                  <div className="glass-panel rounded-3xl p-5 flex flex-col space-y-4 h-full">
                    <h3 className="text-md font-bold text-slate-900 tracking-tight flex items-center justify-between">
                      <span>Open Positions</span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                        {paperPositions.length} active
                      </span>
                    </h3>

                    {paperPositions.length === 0 ? (
                      <div className="flex-grow flex flex-col items-center justify-center py-20 border border-dashed border-slate-200 rounded-2xl text-slate-500">
                        <Zap className="w-8 h-8 mb-2" />
                        <span className="text-center text-xs px-4">No open positions. Use the execute buttons on the search panel or option chain.</span>
                      </div>
                    ) : (
                      <div className="flex-grow overflow-y-auto space-y-3 max-h-96 pr-1">
                        {paperPositions.map((pos) => (
                          <div 
                            key={pos.id} 
                            className="bg-white/50 rounded-xl p-3 border border-slate-200 flex flex-col space-y-2 hover:border-slate-700 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded mr-1.5 ${
                                  pos.type === "BUY" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                                }`}>
                                  {pos.type}
                                </span>
                                <span className="text-xs font-bold text-slate-900">{pos.symbol}</span>
                              </div>
                              <span className="text-[10px] text-slate-500">{pos.time.split(",")[1]}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 border-t border-slate-200/40 pt-2">
                              <div>Qty: <span className="font-semibold text-slate-700">{pos.qty} lot(s)</span></div>
                              <div>Entry: <span className="font-semibold text-slate-700">₹{pos.entryPrice.toFixed(2)}</span></div>
                              <div>Spent: <span className="font-semibold text-slate-700">₹{(pos.qty * (pos.lotsize || 1) * pos.entryPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                              <div>Current: <span className="font-semibold text-slate-700">₹{pos.currentPrice.toFixed(2)}</span></div>
                              <div className="col-span-2 flex items-center space-x-1 border-t border-slate-200/40 pt-2 mt-1">
                                <span>P&L:</span>
                                <span className={`font-bold ${pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                  ₹{pos.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleClosePosition(pos)}
                              className="w-full mt-1.5 py-1.5 rounded-lg bg-slate-100 hover:bg-red-500/20 hover:text-red-400 border border-slate-700 hover:border-red-500/30 text-slate-900 font-bold text-[10px] tracking-wider transition-smooth"
                            >
                              CLOSE POSITION (SQUARE OFF)
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Completed Trade History */}
                <div className="col-span-1 lg:col-span-3">
                  <div className="glass-panel rounded-3xl p-6 flex flex-col space-y-4">
                    <h3 className="text-md font-bold text-slate-900 tracking-tight flex items-center justify-between">
                      <span>Trade History Journal</span>
                      <span className="text-xs text-slate-500">Realized P&L: <span className={`font-bold ${totalRealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ₹{totalRealizedPnl.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span></span>
                    </h3>

                    {paperHistory.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl text-slate-500">
                        <History className="w-8 h-8 mb-2" />
                        <span>Trade journal is empty.</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50">
                        <table className="w-full border-collapse text-left text-xs text-slate-700">
                          <thead>
                            <tr className="bg-white/60 font-bold border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                              <th className="px-4 py-3">Time</th>
                              <th className="px-4 py-3">Symbol</th>
                              <th className="px-4 py-3">Type</th>
                              <th className="px-4 py-3">Qty</th>
                              <th className="px-4 py-3">Money Spent</th>
                              <th className="px-4 py-3">Entry Price</th>
                              <th className="px-4 py-3">Exit Price</th>
                              <th className="px-4 py-3 text-right">Realized P&L</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900">
                            {paperHistory.map((trade, idx) => (
                              <tr key={idx} className="hover:bg-white/30 transition-colors">
                                <td className="px-4 py-3 text-slate-500">{trade.exitTime}</td>
                                <td className="px-4 py-3 font-bold text-slate-900">{trade.symbol}</td>
                                <td className="px-4 py-3">
                                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                    trade.type === "BUY" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                                  }`}>
                                    {trade.type}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-medium">{trade.qty} lot(s)</td>
                                <td className="px-4 py-3 text-slate-500 font-semibold">₹{(trade.qty * (trade.lotsize || 1) * trade.entryPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-slate-500">₹{trade.entryPrice.toFixed(2)}</td>
                                <td className="px-4 py-3 text-slate-500">₹{trade.exitPrice.toFixed(2)}</td>
                                <td className={`px-4 py-3 text-right font-bold ${
                                  trade.realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}>
                                  ₹{trade.realizedPnl.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-600 border-t border-slate-200 mt-6 bg-slate-50/20">
        <div>All values generated on this platform are simulated paper trading credits. Market data is fed via Angel One APIs.</div>
        <div className="mt-1">Option IQ dashboard © 2026. Made with Precision.</div>
      </footer>
    
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-96 max-w-full">
            <h2 className="text-xl font-bold mb-4">{authMode === 'login' ? 'Login' : 'Sign Up'}</h2>
            <input 
              type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} 
              className="w-full mb-3 px-4 py-2 border rounded-xl bg-slate-50 text-slate-900"
            />
            <input 
              type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} 
              className="w-full mb-4 px-4 py-2 border rounded-xl bg-slate-50 text-slate-900"
            />
            <button 
              className="w-full py-2 bg-indigo-500 text-white rounded-xl font-bold mb-2"
              onClick={async () => {
                try {
                  if (authMode === 'login') await signInWithEmailAndPassword(auth, authEmail, authPassword);
                  else await createUserWithEmailAndPassword(auth, authEmail, authPassword);
                  setShowAuthModal(false);
                } catch (e: any) { alert(e.message); }
              }}
            >
              {authMode === 'login' ? 'Log In' : 'Sign Up'}
            </button>
            <button className="text-sm text-indigo-500 w-full text-center" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
              {authMode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
            </button>
            <button className="absolute top-4 right-4 text-slate-500" onClick={() => setShowAuthModal(false)}>X</button>
          </div>
        </div>
      )}
    </div>
  );
}
