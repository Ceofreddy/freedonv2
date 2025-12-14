'use client';

import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import './advanced.scss';

interface SymbolData {
    allow_forward_starting: number;
    display_name: string;
    display_order: number;
    exchange_is_open: number;
    is_trading_suspended: number;
    market: string;
    market_display_name: string;
    pip: number;
    subgroup: string;
    subgroup_display_name: string;
    submarket: string;
    submarket_display_name: string;
    symbol: string;
    symbol_type: string;
}

interface TradeRecord {
    id: string;
    timestamp: number;
    signal: string;
    runs: number;
    result: 'win' | 'loss' | 'pending';
    entryDigit: number;
    confidence: number;
}

interface TradingJournal {
    date: string;
    trades: TradeRecord[];
}

interface SignalHistory {
    id: string;
    timestamp: number;
    signal: string;
    initialConfidence: number;
    currentConfidence: number;
    status: 'active' | 'expired' | 'upgraded';
    entryDigit: number;
    suggestedRuns: number;
    percentageChange: number;
}

type AnalysisMode = 'digit-frequency' | 'even-odd' | 'over-under' | 'rise-fall' | 'streak-analyzer';

const Advanced = () => {
    const [activeSymbol, setActiveSymbol] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('selectedSymbol') || 'R_100';
        }
        return 'R_100';
    });
    const [currentPrice, setCurrentPrice] = useState('Loading...');
    const numberOfTicks = 1000;
    const [allPriceList, setAllPriceList] = useState<number[]>([]);
    const [activeLast, setActiveLast] = useState(0);
    const [overValue, setOverValue] = useState(5);
    const [underValue, setUnderValue] = useState(4);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isTickChart, setIsTickChart] = useState(false);
    const [pipSize, setPipSize] = useState(2);
    const [symbolsList, setSymbolsList] = useState<SymbolData[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const [activeDigitIndex, setActiveDigitIndex] = useState<number | null>(null);
    const digitsContainerRef = useRef<HTMLDivElement>(null);
    const [cursorPosition, setCursorPosition] = useState<number>(0);
    const [cursorRow, setCursorRow] = useState<number>(0);
    const [menuOpen, setMenuOpen] = useState(false);
    const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('digit-frequency');
    const [streakData, setStreakData] = useState<number[]>([]);
    const [streakSignal, setStreakSignal] = useState<{
        signal: string;
        entryDigit: number;
        confidence: number;
        suggestedRuns: number;
    } | null>(null);
    const [tradingJournal, setTradingJournal] = useState<TradingJournal>(() => {
        if (typeof window !== 'undefined') {
            const today = new Date().toISOString().split('T')[0];
            const stored = localStorage.getItem(`trading-journal-${today}`);
            return stored ? JSON.parse(stored) : { date: today, trades: [] };
        }
        return { date: new Date().toISOString().split('T')[0], trades: [] };
    });
    const [signalHistory, setSignalHistory] = useState<SignalHistory[]>([]);
    const signalIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [lastSignalTime, setLastSignalTime] = useState<number>(0);

    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 10;
    const isReconnectingRef = useRef(false);
    const [connectionStatus, setConnectionStatus] = useState<
        'connecting' | 'connected' | 'disconnected' | 'reconnecting'
    >('connecting');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const today = new Date().toISOString().split('T')[0];
            localStorage.setItem(`trading-journal-${today}`, JSON.stringify(tradingJournal));
        }
    }, [tradingJournal]);

    useEffect(() => {
        const checkDateChange = () => {
            if (typeof window !== 'undefined') {
                const today = new Date().toISOString().split('T')[0];
                if (tradingJournal.date !== today) {
                    setTradingJournal({ date: today, trades: [] });
                }
            }
        };

        const interval = setInterval(checkDateChange, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [tradingJournal.date]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }, []);

    useEffect(() => {
        if (activeLast !== null && digitsContainerRef.current) {
            const digitBalls = digitsContainerRef.current.querySelectorAll('.progress');
            const activeBall = digitBalls[activeLast] as HTMLElement;

            if (activeBall) {
                const containerRect = digitsContainerRef.current.getBoundingClientRect();
                const ballRect = activeBall.getBoundingClientRect();
                const relativeLeft = ballRect.left - containerRect.left + ballRect.width / 2;
                setCursorPosition(relativeLeft);

                const row = Math.floor(activeLast / 5);
                setCursorRow(row);
            }
        }
        setActiveDigitIndex(activeLast);
    }, [activeLast]);

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    useEffect(() => {
        if (activeSymbol && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
                JSON.stringify({
                    forget_all: 'ticks',
                })
            );
            setTimeout(() => {
                wsRef.current?.send(
                    JSON.stringify({
                        ticks_history: activeSymbol,
                        count: 5000,
                        end: 'latest',
                        style: 'ticks',
                        adjust_start_time: 1,
                        start: 1,
                    })
                );
            }, 100);
        }
    }, [activeSymbol]);

    useEffect(() => {
        if (analysisMode === 'streak-analyzer') {
            // Generate initial signal
            analyzeStreaks();
            setLastSignalTime(Date.now());

            // Set up 5-minute interval for new signals
            signalIntervalRef.current = setInterval(
                () => {
                    analyzeStreaks();
                    setLastSignalTime(Date.now());
                },
                5 * 60 * 1000
            ); // 5 minutes

            return () => {
                if (signalIntervalRef.current) {
                    clearInterval(signalIntervalRef.current);
                }
            };
        }
    }, [analysisMode]);

    useEffect(() => {
        if (streakSignal && signalHistory.length > 0) {
            const lastSignal = signalHistory[signalHistory.length - 1];
            const confidenceDiff = streakSignal.confidence - lastSignal.initialConfidence;

            if (confidenceDiff < -10) {
                // Confidence decreased significantly
                setSignalHistory(prev =>
                    prev.map(s =>
                        s.id === lastSignal.id
                            ? {
                                  ...s,
                                  status: 'expired',
                                  currentConfidence: streakSignal.confidence,
                                  percentageChange: confidenceDiff,
                              }
                            : s
                    )
                );
            } else if (confidenceDiff > 10) {
                // Confidence increased - suggest more runs
                setSignalHistory(prev =>
                    prev.map(s =>
                        s.id === lastSignal.id
                            ? {
                                  ...s,
                                  status: 'upgraded',
                                  currentConfidence: streakSignal.confidence,
                                  percentageChange: confidenceDiff,
                                  suggestedRuns: Math.min(10, s.suggestedRuns + 1),
                              }
                            : s
                    )
                );
            }
        }
    }, [streakSignal]);

    const startHeartbeat = () => {
        if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
        }

        pingIntervalRef.current = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ ping: 1 }));
            }
        }, 30000);
    };

    const scheduleReconnect = () => {
        if (isReconnectingRef.current || reconnectAttemptsRef.current >= maxReconnectAttempts) {
            return;
        }

        isReconnectingRef.current = true;
        setConnectionStatus('reconnecting');

        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);

        reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            console.log(`[v0] Reconnection attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);
            connectWebSocket();
        }, delay);
    };

    const connectWebSocket = () => {
        if (wsRef.current) {
            wsRef.current.close();
        }
        if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
        }

        setConnectionStatus('connecting');
        const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[v0] WebSocket connected');
            setConnectionStatus('connected');
            reconnectAttemptsRef.current = 0;
            isReconnectingRef.current = false;

            startHeartbeat();

            ws.send(
                JSON.stringify({
                    active_symbols: 'brief',
                    product_type: 'basic',
                })
            );
        };

        ws.onmessage = msg => {
            const data = JSON.parse(msg.data);

            if (data.msg_type === 'ping') {
                ws.send(JSON.stringify({ pong: 1 }));
                return;
            }

            if (data.msg_type === 'active_symbols') {
                const { active_symbols } = data;
                const volatilitySymbols = active_symbols.filter(
                    (symbol: SymbolData) => symbol.subgroup === 'synthetics' && symbol.market === 'synthetic_index'
                );
                const otherSymbols = active_symbols.filter(
                    (symbol: SymbolData) => symbol.subgroup === 'synthetics' && symbol.market !== 'synthetic_index'
                );

                volatilitySymbols.sort((a: SymbolData, b: SymbolData) => a.display_order - b.display_order);
                otherSymbols.sort((a: SymbolData, b: SymbolData) => a.display_order - b.display_order);

                const sortedSymbols = [...volatilitySymbols, ...otherSymbols];
                setSymbolsList(sortedSymbols);

                if (sortedSymbols.length > 0) {
                    const symbolToUse = sortedSymbols.find(s => s.symbol === activeSymbol)
                        ? activeSymbol
                        : sortedSymbols[0].symbol;
                    ws.send(
                        JSON.stringify({
                            ticks_history: symbolToUse,
                            count: 5000,
                            end: 'latest',
                            style: 'ticks',
                            adjust_start_time: 1,
                            start: 1,
                        })
                    );
                }
            }

            if (data.msg_type === 'history') {
                const { history, pip_size } = data;
                setPipSize(pip_size);
                const { prices } = history;
                const { ticks_history } = data.echo_req;

                const priceList = prices.map((p: string) => Number.parseFloat(p));
                setAllPriceList(priceList);
                setActiveSymbol(ticks_history);

                if (priceList.length > 0) {
                    const lastPrice = priceList[priceList.length - 1];
                    setCurrentPrice(lastPrice.toFixed(pip_size));
                    setActiveLast(getLastDigit(lastPrice, pip_size));
                }

                ws.send(
                    JSON.stringify({
                        ticks: ticks_history,
                        subscribe: 1,
                    })
                );
            }

            if (data.msg_type === 'tick') {
                const { tick } = data;
                const { ask, pip_size } = tick;
                const price = Number.parseFloat(ask);
                setCurrentPrice(price.toFixed(pip_size));
                setActiveLast(getLastDigit(price, pip_size));
                setAllPriceList(prev => [...prev.slice(1), price]);
            }
        };

        ws.onerror = error => {
            console.error('[v0] WebSocket error:', error);
            setConnectionStatus('disconnected');
        };

        ws.onclose = event => {
            console.log(`[v0] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
            setConnectionStatus('disconnected');

            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
            }

            if (event.code !== 1000) {
                scheduleReconnect();
            }
        };
    };

    const getLastDigit = (tick: number, pip: number) => {
        const lastDigit = tick.toFixed(pip);
        return Number.parseInt(String(lastDigit).slice(-1));
    };

    const handleSync = () => {
        setIsSyncing(true);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
                JSON.stringify({
                    forget_all: 'ticks',
                })
            );
            setTimeout(() => {
                wsRef.current?.send(
                    JSON.stringify({
                        ticks_history: activeSymbol,
                        count: 5000,
                        end: 'latest',
                        style: 'ticks',
                        adjust_start_time: 1,
                        start: 1,
                    })
                );
            }, 100);
        } else {
            connectWebSocket();
        }
        setTimeout(() => setIsSyncing(false), 1000);
    };

    const handleSymbolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSymbol = e.target.value;
        setCurrentPrice('Loading...');
        setActiveSymbol(newSymbol);
        if (typeof window !== 'undefined') {
            localStorage.setItem('selectedSymbol', newSymbol);
        }
    };

    const getLastDigitList = () => {
        const requiredItems = allPriceList.slice(-numberOfTicks);
        const returnedList: number[] = [];
        requiredItems.forEach((tick: number) => {
            const last_digit = getLastDigit(tick, pipSize);
            returnedList.push(last_digit);
        });
        return returnedList;
    };

    const calculateOverUnderPercentages = () => {
        const digits = getLastDigitList();
        const overCount = digits.filter(d => d > overValue).length;
        const underCount = digits.filter(d => d < underValue).length;
        const total = digits.length || 1;

        return {
            overPercentage: ((overCount / total) * 100).toFixed(2),
            underPercentage: ((underCount / total) * 100).toFixed(2),
            overCount,
            underCount,
        };
    };

    const calculateRiseFallPercentages = () => {
        const digits = getLastDigitList();
        let riseCount = 0;
        let fallCount = 0;
        let equalCount = 0;

        for (let i = 1; i < digits.length; i++) {
            if (digits[i] > digits[i - 1]) riseCount++;
            else if (digits[i] < digits[i - 1]) fallCount++;
            else equalCount++;
        }

        const total = riseCount + fallCount || 1;
        return {
            risePercentage: ((riseCount / total) * 100).toFixed(2),
            fallPercentage: ((fallCount / total) * 100).toFixed(2),
            riseCount,
            fallCount,
        };
    };

    const calculateEvenOddPercentages = () => {
        const digits = getLastDigitList();
        let evenCount = 0;
        let oddCount = 0;

        digits.forEach(digit => {
            if (digit % 2 === 0) evenCount++;
            else oddCount++;
        });

        const total = digits.length || 1;
        return {
            evenPercentage: ((evenCount / total) * 100).toFixed(2),
            oddPercentage: ((oddCount / total) * 100).toFixed(2),
        };
    };

    const calculateDigitFrequency = () => {
        const digits = getLastDigitList();
        const frequency: Record<number, number> = {};

        for (let i = 0; i <= 9; i++) {
            frequency[i] = 0;
        }

        digits.forEach(digit => {
            frequency[digit]++;
        });

        const total = digits.length || 1;
        const percentages: Record<number, number> = {};

        for (let i = 0; i <= 9; i++) {
            percentages[i] = (frequency[i] / total) * 100;
        }

        return percentages;
    };

    const generateTradingSignal = (
        streak: { digit: number; length: number; position: number },
        volatility: number,
        confidence: number
    ): { signal: string; isSafe: boolean } => {
        const overUnder = calculateOverUnderPercentages();
        const riseFall = calculateRiseFallPercentages();

        const overPercentage = Number.parseFloat(overUnder.overPercentage);
        const underPercentage = Number.parseFloat(overUnder.underPercentage);
        const risePercentage = Number.parseFloat(riseFall.risePercentage);
        const fallPercentage = Number.parseFloat(riseFall.fallPercentage);

        const minConfidenceThreshold = 60;
        const isSafeConfidence = confidence >= minConfidenceThreshold;

        if (!isSafeConfidence) {
            return {
                signal: `⚠️ UNSAFE - Confidence ${confidence}% below ${minConfidenceThreshold}%. Change volatility settings.`,
                isSafe: false,
            };
        }

        const digit = streak.digit;
        const favorOver = overPercentage > underPercentage;
        const favorRise = risePercentage > fallPercentage;

        const isSafeRange = digit >= 2 && digit <= 7;

        if (!isSafeRange) {
            return {
                signal: `⚠️ UNSAFE - Digit ${digit} outside safe trading range (2-7). Wait for better entry.`,
                isSafe: false,
            };
        }

        // Generate signal based on market bias
        if (favorOver && digit >= 2 && digit <= 7) {
            return {
                signal: `🎯 SIGNAL: Trader Over ${digit} (${overPercentage.toFixed(1)}% Over Bias) - Confidence: ${confidence}%`,
                isSafe: true,
            };
        } else if (!favorOver && digit >= 2 && digit <= 7) {
            return {
                signal: `🎯 SIGNAL: Trader Under ${digit} (${underPercentage.toFixed(1)}% Under Bias) - Confidence: ${confidence}%`,
                isSafe: true,
            };
        }

        return {
            signal: `⚠️ UNSAFE - Market conditions not favorable. Confidence: ${confidence}%`,
            isSafe: false,
        };
    };

    const analyzeStreaks = () => {
        const allDigits = getLastDigitList();
        const digits = allDigits.slice(-50); // Last 50 ticks only
        const streaks: { digit: number; length: number; position: number }[] = [];

        let currentDigit = digits[0];
        let streakLength = 1;
        let streakStart = 0;

        for (let i = 1; i < digits.length; i++) {
            if (digits[i] === currentDigit) {
                streakLength++;
            } else {
                if (streakLength >= 2) {
                    streaks.push({ digit: currentDigit, length: streakLength, position: streakStart });
                }
                currentDigit = digits[i];
                streakLength = 1;
                streakStart = i;
            }
        }

        if (streakLength >= 2) {
            streaks.push({ digit: currentDigit, length: streakLength, position: streakStart });
        }

        setStreakData(digits);

        if (streaks.length > 0) {
            const longestStreak = streaks.reduce((prev, current) => (current.length > prev.length ? current : prev));

            const volatility = calculateMarketVolatility(digits);
            const confidence = Math.min(100, (longestStreak.length / 5) * 100);
            const suggestedRuns = Math.max(2, Math.ceil(5 - volatility / 20));

            const { signal, isSafe } = generateTradingSignal(longestStreak, volatility, confidence);

            setStreakSignal({
                signal,
                entryDigit: longestStreak.digit,
                confidence: Math.round(confidence),
                suggestedRuns,
            });

            if (isSafe) {
                const newSignalRecord: SignalHistory = {
                    id: Date.now().toString(),
                    timestamp: Date.now(),
                    signal,
                    initialConfidence: Math.round(confidence),
                    currentConfidence: Math.round(confidence),
                    status: 'active',
                    entryDigit: longestStreak.digit,
                    suggestedRuns,
                    percentageChange: 0,
                };
                setSignalHistory(prev => [...prev, newSignalRecord]);
            }
        }
    };

    const calculateMarketVolatility = (digits: number[]) => {
        if (digits.length < 2) return 0;

        let changes = 0;
        for (let i = 1; i < digits.length; i++) {
            if (digits[i] !== digits[i - 1]) changes++;
        }

        return (changes / (digits.length - 1)) * 100;
    };

    const recordTrade = (result: 'win' | 'loss') => {
        if (!streakSignal) return;

        const newTrade: TradeRecord = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            signal: streakSignal.signal,
            runs: streakSignal.suggestedRuns,
            result,
            entryDigit: streakSignal.entryDigit,
            confidence: streakSignal.confidence,
        };

        setTradingJournal(prev => ({
            ...prev,
            trades: [...prev.trades, newTrade],
        }));
    };

    const getLineChartData = () => {
        const requiredItems = allPriceList.slice(-numberOfTicks);
        const last10 = requiredItems.slice(-10);

        if (isTickChart) {
            const data: { value: number; tick: number }[] = [];
            let previousTick = 0;

            last10.forEach((tick: number) => {
                const tickDiff = previousTick !== 0 ? tick - previousTick : 0;
                data.push({ value: Number.parseFloat(tickDiff.toFixed(2)), tick });
                previousTick = tick;
            });
            return data;
        } else {
            return last10.map((tick: number) => ({
                value: getLastDigit(tick, pipSize),
                tick,
            }));
        }
    };

    const evenOdd = calculateEvenOddPercentages();
    const riseFall = calculateRiseFallPercentages();
    const overUnder = calculateOverUnderPercentages();
    const digitFreq = calculateDigitFrequency();
    const lineChartData = getLineChartData();

    const frequencies = Object.entries(digitFreq).filter(([_, val]) => val > 0);
    const maxFreq = frequencies.length > 0 ? Math.max(...frequencies.map(([_, val]) => val)) : 0;
    const minFreq = frequencies.length > 0 ? Math.min(...frequencies.map(([_, val]) => val)) : 0;

    const winCount = tradingJournal.trades.filter(t => t.result === 'win').length;
    const lossCount = tradingJournal.trades.filter(t => t.result === 'loss').length;
    const winRate = tradingJournal.trades.length > 0 ? ((winCount / tradingJournal.trades.length) * 100).toFixed(1) : 0;

    return (
        <div className='main_app'>
            <div className='top_bar'>
                <div className='symbol_price'>
                    <div className='active_symbol'>
                        <select id='symbol_options' value={activeSymbol} onChange={handleSymbolChange}>
                            {symbolsList.length > 0 ? (
                                symbolsList.map(option => (
                                    <option key={option.symbol} value={option.symbol}>
                                        {option.display_name}
                                    </option>
                                ))
                            ) : (
                                <option value=''>Loading...</option>
                            )}
                        </select>
                    </div>
                    <div className='no_of_ticks'>
                        <span className='tick_label'>Ticks:</span>
                        <span className='tick_value'>{numberOfTicks}</span>
                    </div>
                    <div className='current_price'>
                        <h3>{currentPrice}</h3>
                        {connectionStatus === 'reconnecting' && (
                            <span className='connection_status reconnecting'>Reconnecting...</span>
                        )}
                        {connectionStatus === 'disconnected' && (
                            <span className='connection_status disconnected'>Disconnected</span>
                        )}
                    </div>
                </div>
                <div className='controls'>
                    <div className='menu_toggle' onClick={() => setMenuOpen(!menuOpen)}>
                        <svg fill='currentColor' viewBox='0 0 24 24' width='24' height='24'>
                            <path
                                d='M3 6h18M3 12h18M3 18h18'
                                stroke='currentColor'
                                strokeWidth='2'
                                strokeLinecap='round'
                            />
                        </svg>
                    </div>
                    <div className='sync_btn' onClick={handleSync}>
                        <svg
                            className={isSyncing ? 'sync_active' : ''}
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            viewBox='0 0 24 24'
                        >
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                            />
                        </svg>
                    </div>
                </div>
            </div>

            {menuOpen && (
                <div className='analysis_menu'>
                    <button
                        className={`menu_item ${analysisMode === 'digit-frequency' ? 'active' : ''}`}
                        onClick={() => {
                            setAnalysisMode('digit-frequency');
                            setMenuOpen(false);
                        }}
                    >
                        Digit Frequency
                    </button>
                    <button
                        className={`menu_item ${analysisMode === 'even-odd' ? 'active' : ''}`}
                        onClick={() => {
                            setAnalysisMode('even-odd');
                            setMenuOpen(false);
                        }}
                    >
                        Even/Odd
                    </button>
                    <button
                        className={`menu_item ${analysisMode === 'over-under' ? 'active' : ''}`}
                        onClick={() => {
                            setAnalysisMode('over-under');
                            setMenuOpen(false);
                        }}
                    >
                        Over/Under
                    </button>
                    <button
                        className={`menu_item ${analysisMode === 'rise-fall' ? 'active' : ''}`}
                        onClick={() => {
                            setAnalysisMode('rise-fall');
                            setMenuOpen(false);
                        }}
                    >
                        Rise/Fall
                    </button>
                    <button
                        className={`menu_item ${analysisMode === 'streak-analyzer' ? 'active' : ''}`}
                        onClick={() => {
                            setAnalysisMode('streak-analyzer');
                            analyzeStreaks();
                            setMenuOpen(false);
                        }}
                    >
                        Streak Analyzer
                    </button>
                </div>
            )}

            {/* Digit Frequency Analysis */}
            {analysisMode === 'digit-frequency' && (
                <div className='analysis_section'>
                    <div className='digit_diff card3'>
                        <div className='title_oc_trader'>
                            <h2 className='analysis_title'>Digit Frequency Analysis</h2>
                        </div>
                        <div className='differs_container' ref={digitsContainerRef}>
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => {
                                const percentage = digitFreq[digit];
                                const isActive = digit === activeLast;
                                const isTop = percentage === maxFreq && percentage > 0;
                                const isLess = percentage === minFreq && percentage > 0;

                                return (
                                    <div
                                        key={digit}
                                        className={`progress ${isActive ? 'active' : ''} ${isTop ? 'top' : ''} ${isLess ? 'less' : ''}`}
                                        data-number={digit}
                                    >
                                        <h3>{digit}</h3>
                                        <h4>
                                            {percentage.toFixed(2)}
                                            <span>%</span>
                                        </h4>
                                    </div>
                                );
                            })}
                            <div
                                className='digit_cursor'
                                style={{
                                    left: `${cursorPosition}px`,
                                    opacity: activeDigitIndex !== null ? 1 : 0,
                                }}
                                data-row={cursorRow}
                            >
                                <svg width='24' height='24' viewBox='0 0 24 24' fill='currentColor'>
                                    <path d='M12 2L2 22h20L12 2z' />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Even/Odd Analysis */}
            {analysisMode === 'even-odd' && (
                <div className='analysis_section'>
                    <div className='pie card1'>
                        <div className='odd_even_info'>
                            <h2 className='analysis_title'>Even/Odd Analysis</h2>
                        </div>
                        <div className='pie_container'>
                            <div className='pie_chart'>
                                <svg viewBox='0 0 200 200' className='pie_svg'>
                                    <circle
                                        cx='100'
                                        cy='100'
                                        r='80'
                                        fill='transparent'
                                        stroke='#4CAF50'
                                        strokeWidth='60'
                                        strokeDasharray={`${(Number.parseFloat(evenOdd.evenPercentage) / 100) * 502.65} 502.65`}
                                        transform='rotate(-90 100 100)'
                                    />
                                    <circle
                                        cx='100'
                                        cy='100'
                                        r='80'
                                        fill='transparent'
                                        stroke='#F44336'
                                        strokeWidth='60'
                                        strokeDasharray={`${(Number.parseFloat(evenOdd.oddPercentage) / 100) * 502.65} 502.65`}
                                        strokeDashoffset={`-${(Number.parseFloat(evenOdd.evenPercentage) / 100) * 502.65}`}
                                        transform='rotate(-90 100 100)'
                                    />
                                </svg>
                                <div className='pie_legend'>
                                    <div className='legend_item'>
                                        <span className='legend_color even_color'></span>
                                        <span>Even: {evenOdd.evenPercentage}%</span>
                                    </div>
                                    <div className='legend_item'>
                                        <span className='legend_color odd_color'></span>
                                        <span>Odd: {evenOdd.oddPercentage}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Over/Under Analysis */}
            {analysisMode === 'over-under' && (
                <div className='analysis_section'>
                    <div className='over_under card1'>
                        <h2 className='analysis_title'>Over/Under Comparison</h2>
                        <div className='over_under_options'>
                            <div className='digit_inputs'>
                                <div className='over_digit'>
                                    <label htmlFor='over_input'>Over</label>
                                    <input
                                        type='number'
                                        id='over_input'
                                        value={overValue}
                                        onChange={e => setOverValue(Number.parseInt(e.target.value) || 5)}
                                        min='0'
                                        max='9'
                                    />
                                </div>
                                <div className='under_digit'>
                                    <label htmlFor='under_input'>Under</label>
                                    <input
                                        type='number'
                                        id='under_input'
                                        value={underValue}
                                        onChange={e => setUnderValue(Number.parseInt(e.target.value) || 4)}
                                        min='0'
                                        max='9'
                                    />
                                </div>
                            </div>
                        </div>
                        <div className='bar_chart_container'>
                            <div className='bar_item'>
                                <div className='bar_label'>Over {overValue}</div>
                                <div className='bar_wrapper'>
                                    <div className='bar over_bar' style={{ width: `${overUnder.overPercentage}%` }}>
                                        <span className='bar_inner_label'>{overUnder.overPercentage}%</span>
                                    </div>
                                    <span className='bar_value'>{overUnder.overPercentage}%</span>
                                </div>
                            </div>
                            <div className='bar_item'>
                                <div className='bar_label'>Under {underValue}</div>
                                <div className='bar_wrapper'>
                                    <div className='bar under_bar' style={{ width: `${overUnder.underPercentage}%` }}>
                                        <span className='bar_inner_label'>{overUnder.underPercentage}%</span>
                                    </div>
                                    <span className='bar_value'>{overUnder.underPercentage}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Rise/Fall Analysis */}
            {analysisMode === 'rise-fall' && (
                <div className='analysis_section'>
                    <div className='rise_fall card1'>
                        <h2 className='analysis_title'>Rise/Fall Analysis</h2>
                        <div className='bar_chart_container'>
                            <div className='bar_item'>
                                <div className='bar_label'>Rise</div>
                                <div className='bar_wrapper'>
                                    <div className='bar rise_bar' style={{ width: `${riseFall.risePercentage}%` }}>
                                        <span className='bar_inner_label'>{riseFall.risePercentage}%</span>
                                    </div>
                                    <span className='bar_value'>{riseFall.risePercentage}%</span>
                                </div>
                            </div>
                            <div className='bar_item'>
                                <div className='bar_label'>Fall</div>
                                <div className='bar_wrapper'>
                                    <div className='bar fall_bar' style={{ width: `${riseFall.fallPercentage}%` }}>
                                        <span className='bar_inner_label'>{riseFall.fallPercentage}%</span>
                                    </div>
                                    <span className='bar_value'>{riseFall.fallPercentage}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {analysisMode === 'streak-analyzer' && (
                <div className='analysis_section'>
                    <div className='streak_analyzer_container'>
                        <div className='streak_card card2'>
                            <h2 className='analysis_title'>Streak Entry Point Analyzer</h2>
                            <div className='signal_timer'>
                                <span className='timer_label'>Next Signal In:</span>
                                <span className='timer_value'>
                                    {Math.max(0, 5 - Math.floor((Date.now() - lastSignalTime) / 60000))} min
                                </span>
                            </div>
                            <button className='analyze_btn' onClick={analyzeStreaks}>
                                Analyze Streaks Now
                            </button>

                            {streakSignal && (
                                <div
                                    className={`signal_box ${streakSignal.signal.includes('UNSAFE') ? 'unsafe' : 'safe'}`}
                                >
                                    <div className='signal_header'>
                                        <h3>
                                            {streakSignal.signal.includes('UNSAFE')
                                                ? '⚠️ UNSAFE SIGNAL'
                                                : '✅ SAFE SIGNAL'}
                                        </h3>
                                    </div>
                                    <div className='signal_content'>
                                        <p className='signal_text'>{streakSignal.signal}</p>
                                        {!streakSignal.signal.includes('UNSAFE') && (
                                            <>
                                                <div className='signal_stats'>
                                                    <div className='stat'>
                                                        <span className='stat_label'>Confidence</span>
                                                        <span className='stat_value'>{streakSignal.confidence}%</span>
                                                    </div>
                                                    <div className='stat'>
                                                        <span className='stat_label'>Suggested Runs</span>
                                                        <span className='stat_value'>{streakSignal.suggestedRuns}</span>
                                                    </div>
                                                    <div className='stat'>
                                                        <span className='stat_label'>Entry Digit</span>
                                                        <span className='stat_value'>{streakSignal.entryDigit}</span>
                                                    </div>
                                                </div>
                                                <div className='signal_actions'>
                                                    <button
                                                        className='action_btn win_btn'
                                                        onClick={() => recordTrade('win')}
                                                    >
                                                        ✓ Win
                                                    </button>
                                                    <button
                                                        className='action_btn loss_btn'
                                                        onClick={() => recordTrade('loss')}
                                                    >
                                                        ✗ Loss
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {signalHistory.length > 0 && (
                                <div className='signal_history'>
                                    <h3 className='history_title'>Signal History (Last 5 Minutes)</h3>
                                    <div className='history_list'>
                                        {signalHistory.slice(-5).map(sig => (
                                            <div key={sig.id} className={`history_item ${sig.status}`}>
                                                <div className='history_status'>
                                                    {sig.status === 'active' && (
                                                        <span className='status_badge active'>Active</span>
                                                    )}
                                                    {sig.status === 'expired' && (
                                                        <span className='status_badge expired'>Expired</span>
                                                    )}
                                                    {sig.status === 'upgraded' && (
                                                        <span className='status_badge upgraded'>Upgraded</span>
                                                    )}
                                                </div>
                                                <div className='history_details'>
                                                    <p className='history_signal'>{sig.signal.substring(0, 50)}...</p>
                                                    <p className='history_meta'>
                                                        Confidence: {sig.currentConfidence}% (
                                                        {sig.percentageChange > 0 ? '+' : ''}
                                                        {sig.percentageChange}%)
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className='journal_card card2'>
                            <h2 className='analysis_title'>Trading Journal - {tradingJournal.date}</h2>
                            <div className='journal_stats'>
                                <div className='journal_stat'>
                                    <span className='stat_label'>Total Trades</span>
                                    <span className='stat_value'>{tradingJournal.trades.length}</span>
                                </div>
                                <div className='journal_stat'>
                                    <span className='stat_label'>Wins</span>
                                    <span className='stat_value win_color'>{winCount}</span>
                                </div>
                                <div className='journal_stat'>
                                    <span className='stat_label'>Losses</span>
                                    <span className='stat_value loss_color'>{lossCount}</span>
                                </div>
                                <div className='journal_stat'>
                                    <span className='stat_label'>Win Rate</span>
                                    <span className='stat_value'>{winRate}%</span>
                                </div>
                            </div>

                            <div className='trades_list'>
                                {tradingJournal.trades.length > 0 ? (
                                    tradingJournal.trades
                                        .slice()
                                        .reverse()
                                        .map(trade => (
                                            <div key={trade.id} className={`trade_item ${trade.result}`}>
                                                <div className='trade_info'>
                                                    <span className='trade_signal'>{trade.signal}</span>
                                                    <span className='trade_meta'>
                                                        Runs: {trade.runs} | Confidence: {trade.confidence}%
                                                    </span>
                                                </div>
                                                <div className={`trade_result ${trade.result}`}>
                                                    {trade.result === 'win' ? '✓ WIN' : '✗ LOSS'}
                                                </div>
                                            </div>
                                        ))
                                ) : (
                                    <p className='no_trades'>No trades recorded yet</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Advanced;
