import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { formatMoney } from '@/components/shared/utils/currency/currency';
import Button from '@/components/shared_ui/button';
import Input from '@/components/shared_ui/input';
import Loading from '@/components/shared_ui/loading';
import SelectNative from '@/components/shared_ui/select-native';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { Icon } from '@/utils/tmp/dummy';
// @ts-expect-error Ignoring missing type definitions for bot-skeleton
import { api_base } from '@deriv/bot-skeleton';
import './speedbot.scss';

// --- Types & Interfaces ---

interface Market {
    text: string;
    value: string;
    symbol: string;
    subgroup?: string;
    display_order?: number;
}

interface StrategyConfig {
    initialStake: number;
    takeProfit: number;
    stopLoss: number; // Positive value representing max loss amount
    maxTrades: number;
    cooldownTicks: number;
    selectedMarket: string;
}

interface RunningStats {
    totalProfit: number;
    tradeCount: number;
    wins: number;
    losses: number;
    consecutiveLosses: number;
    lastTradeResult: 'win' | 'loss' | null;
    status: 'idle' | 'running' | 'cooldown' | 'stopped';
    cooldownRemaining: number;
}

interface AnalysisMetrics {
    pressureOver1: number;
    pressureUnder8: number;
    isCalm: boolean;
    biasOver: boolean;
    biasUnder: boolean;
}

interface TickData {
    epoch: number;
    quote: number;
    digit: number;
}

// --- Strategy Logic Helpers ---

const getLastDigit = (price: number): number => {
    return Number(price.toFixed(2).slice(-1));
};

// --- Main Component ---

const SpeedBot = observer(() => {
    const store = useStore();
    const client = store?.client;

    // --- State: Markets & Data ---
    const [markets, setMarkets] = useState<Market[]>([]);
    const [ticks, setTicks] = useState<TickData[]>([]); // Keep last 1000+ ticks
    const [currentPrice, setCurrentPrice] = useState<string>('Loading...');
    const [pipSize, setPipSize] = useState<number>(2);

    const [metrics, setMetrics] = useState<AnalysisMetrics>({
        pressureOver1: 0,
        pressureUnder8: 0,
        isCalm: false,
        biasOver: false,
        biasUnder: false,
    });

    // --- State: Config & Execution ---
    const [config, setConfig] = useState<StrategyConfig>({
        initialStake: 1,
        takeProfit: 10,
        stopLoss: 10,
        maxTrades: 50,
        cooldownTicks: 5,
        selectedMarket: 'R_100',
    });

    const [stats, setStats] = useState<RunningStats>({
        totalProfit: 0,
        tradeCount: 0,
        wins: 0,
        losses: 0,
        consecutiveLosses: 0,
        lastTradeResult: null,
        status: 'idle',
        cooldownRemaining: 0,
    });

    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [digitFreq, setDigitFreq] = useState<Record<number, number>>({});

    // Refs for accessing state in callbacks/intervals
    const configRef = useRef(config);
    const statsRef = useRef(stats);
    const ticksRef = useRef(ticks);
    const isRunningRef = useRef(false);

    // Sync refs
    useEffect(() => {
        configRef.current = config;
    }, [config]);
    useEffect(() => {
        statsRef.current = stats;
    }, [stats]);
    useEffect(() => {
        ticksRef.current = ticks;
    }, [ticks]);

    // --- Helper: Calculate Frequency ---
    const updateFrequency = (currentTicks: TickData[]) => {
        const subset = currentTicks.slice(-1000);
        const counts: Record<number, number> = {};
        for (let i = 0; i <= 9; i++) counts[i] = 0;

        subset.forEach(t => counts[t.digit]++);

        const total = subset.length || 1;
        const percentages: Record<number, number> = {};
        for (let i = 0; i <= 9; i++) percentages[i] = (counts[i] / total) * 100;

        setDigitFreq(percentages);
    };

    // --- Logging Helper ---
    const addLog = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
    };

    // --- Data Fetching: Markets ---
    useEffect(() => {
        let isMounted = true;
        const fetchMarkets = async () => {
            if (!api_base.api) return;
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const response = (await api_base.api.send({ active_symbols: 'brief', product_type: 'basic' })) as any;
                if (response.active_symbols && isMounted) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const volatilitySymbols = response.active_symbols
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .filter((s: any) => s.subgroup === 'synthetics')
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .sort((a: any, b: any) => a.display_order - b.display_order)
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .map((m: any) => ({
                            text: m.display_name,
                            value: m.symbol,
                            symbol: m.symbol,
                        }));
                    setMarkets(volatilitySymbols);
                    if (volatilitySymbols.length > 0 && !config.selectedMarket) {
                        setConfig(prev => ({ ...prev, selectedMarket: volatilitySymbols[0].value }));
                    }
                }
            } catch (err) {
                console.error('Fetch markets error', err);
            }
        };
        fetchMarkets();
        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- Strategy Analysis Engines ---

    // 1. Pressure Engine
    const calculatePressure = (digitGroup: number[], ticks: TickData[]) => {
        const reversed = [...ticks].reverse();
        let minGap = 1000;

        for (const d of digitGroup) {
            const idx = reversed.findIndex(t => Number(t.digit) === d);
            if (idx === -1) return 100;
            if (idx < minGap) minGap = idx;
        }

        let groupGap = 0;
        for (let i = 0; i < reversed.length; i++) {
            if (digitGroup.includes(reversed[i].digit)) {
                break;
            }
            groupGap++;
        }

        let totalGaps = 0;
        let gapCount = 0;
        let currentRun = 0;
        for (let i = 0; i < ticks.length; i++) {
            if (digitGroup.includes(ticks[i].digit)) {
                if (currentRun > 0) {
                    totalGaps += currentRun;
                    gapCount++;
                }
                currentRun = 0;
            } else {
                currentRun++;
            }
        }
        const avgGap = gapCount > 0 ? totalGaps / gapCount : 10;

        const pressure = avgGap > 0 ? groupGap / avgGap : 0;
        return pressure;
    };

    // 2. Micro Calm Zone
    const isCalmZone = (ticks: TickData[]) => {
        const recent = ticks.slice(-20);
        let repeats = 1;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i].digit === recent[i - 1].digit) {
                repeats++;
                if (repeats > 3) return false;
            } else {
                repeats = 1;
            }
        }
        return true;
    };

    const executeTrade = async (type: 'OVER' | 'UNDER', prediction: number) => {
        // Prevent Zombie Execution
        if (!isRunningRef.current) return;

        // Pause analysis
        setStats(prev => ({ ...prev, status: 'idle' }));

        const c = configRef.current;
        const stake = c.initialStake;

        addLog(`Executing ${type} ${prediction} | Stake: ${stake}`);

        try {
            // 1. Buy
            const contractType = 'DIGIT' + type;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const proposal = (await api_base.api.send({
                proposal: 1,
                amount: stake,
                basis: 'stake',
                contract_type: contractType,
                currency: client?.currency || 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: c.selectedMarket,
                barrier: String(prediction),
            })) as any;

            if (proposal.error) throw new Error(proposal.error.message);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const buy = (await api_base.api.send({
                buy: proposal.proposal.id,
                price: proposal.proposal.ask_price,
            })) as any;

            if (buy.error) throw new Error(buy.error.message);
            if (buy.error) throw new Error(buy.error.message);
            const contractId = buy.buy.contract_id;

            // 2. Wait for result
            if (!isRunningRef.current) return; // Stop check mid-trade handling
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let result: any = null;
            for (let i = 0; i < 30; i++) {
                // 3 seconds max
                await new Promise(r => setTimeout(r, 100));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const s = (await api_base.api.send({ proposal_open_contract: 1, contract_id: contractId })) as any;
                if (s.proposal_open_contract && s.proposal_open_contract.is_sold) {
                    result = s.proposal_open_contract;
                    break;
                }
            }

            if (!result) throw new Error('Trade timed out');

            const profit = Number(result.profit);
            const isWin = profit >= 0;

            // 3. Update Stats
            setStats(prev => {
                const newProfit = prev.totalProfit + profit;
                return {
                    ...prev,
                    totalProfit: newProfit,
                    tradeCount: prev.tradeCount + 1,
                    wins: isWin ? prev.wins + 1 : prev.wins,
                    losses: isWin ? prev.losses : prev.losses + 1,
                    consecutiveLosses: isWin ? 0 : prev.consecutiveLosses + 1,
                    lastTradeResult: isWin ? 'win' : 'loss',
                    status: isWin ? 'running' : 'cooldown',
                    cooldownRemaining: isWin ? 0 : c.cooldownTicks,
                };
            });

            addLog(`Trade Finished: ${isWin ? 'WIN' : 'LOSS'} (${profit})`);
            api_base.api.send({ balance: 1, subscribe: 0 }); // Force balance update
        } catch (err: any) {
            console.error('Execution error', err);
            addLog(`Error: ${err.message}`);
            // Only resume if still running (prevent zombie restart)
            if (isRunningRef.current) {
                setStats(prev => ({ ...prev, status: 'running' }));
            }
        }
    };

    // Use ref to keep executeTrade stable if needed
    const executeTradeRef = useRef(executeTrade);
    useEffect(() => {
        executeTradeRef.current = executeTrade;
    }, [executeTrade]);

    // --- Core Strategy Evaluation ---
    const evaluateStrategy = async (currentTick: TickData) => {
        const s = statsRef.current;
        const c = configRef.current;
        const t = ticksRef.current;

        if (s.status !== 'running') {
            if (s.status === 'cooldown') {
                if (s.cooldownRemaining > 0) {
                    setStats(prev => ({ ...prev, cooldownRemaining: prev.cooldownRemaining - 1 }));
                } else {
                    setStats(prev => ({ ...prev, status: 'running' }));
                    addLog('Cooldown finished. Resuming analysis.');
                }
            }
            return;
        }

        // 1. Global Risk Checks
        if (s.tradeCount >= c.maxTrades) {
            stopStrategy('Max trades reached.');
            return;
        }
        if (s.totalProfit <= -c.stopLoss) {
            stopStrategy('Stop Loss triggered.');
            return;
        }
        if (s.totalProfit >= c.takeProfit) {
            stopStrategy('Take Profit reached.');
            return;
        }

        // 2. Bias Analysis (Permission)
        if (t.length < 1000) return;

        const last1000 = t.slice(-1000);
        const last300 = t.slice(-300);

        const countDigits = (arr: TickData[], group: number[]) => arr.filter(x => group.includes(x.digit)).length;

        const low1000 = countDigits(last1000, [0, 1]);
        const low300 = countDigits(last300, [0, 1]);

        const high1000 = countDigits(last1000, [8, 9]);
        const high300 = countDigits(last300, [8, 9]);

        const allowOver1 = low1000 < 200 && low300 < 60;
        const allowUnder8 = high1000 < 200 && high300 < 60;

        // 3. Pressure Engine (TIGHTENED)
        const lowPressure = calculatePressure([0, 1], t);
        const highPressure = calculatePressure([8, 9], t);

        const safeOver1 = lowPressure <= 1.4; // Was 1.8
        const safeUnder8 = highPressure <= 1.2; // Was 1.5

        // NEW: Micro-Trend Check (Last 5 Ticks)
        // Ensure we are not trading AGAINST a sudden spike of 0s or 9s
        const last5 = t.slice(-5);
        const recentLows = countDigits(last5, [0, 1]); // For Over 1, we want FEW of these
        const recentHighs = countDigits(last5, [8, 9]); // For Under 8, we want FEW of these

        // 4. Micro Timing
        const isCal = isCalmZone(t);

        // 5. Update UI Metrics
        setMetrics({
            pressureOver1: Number(lowPressure.toFixed(2)),
            pressureUnder8: Number(highPressure.toFixed(2)),
            isCalm: isCal,
            biasOver: allowOver1,
            biasUnder: allowUnder8,
        });

        // 6. Decision
        let tradeType: 'OVER' | 'UNDER' | null = null;
        let prediction = 0;

        // STRICT ENTRY: Pressure + Bias + Calm + MicroTrend
        if (allowOver1 && safeOver1 && isCal && recentLows === 0) {
            // Preference logic
            if (allowUnder8 && safeUnder8 && recentHighs === 0) {
                if (lowPressure < highPressure) {
                    tradeType = 'OVER';
                    prediction = 1;
                } else {
                    tradeType = 'UNDER';
                    prediction = 8;
                }
            } else {
                tradeType = 'OVER';
                prediction = 1;
            }
        } else if (allowUnder8 && safeUnder8 && isCal && recentHighs === 0) {
            tradeType = 'UNDER';
            prediction = 8;
        }

        if (tradeType) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const _tick = currentTick;
            await executeTradeRef.current(tradeType, prediction);
        }
    };

    // Store strategy in ref
    const evaluateStrategyRef = useRef(evaluateStrategy);
    useEffect(() => {
        evaluateStrategyRef.current = evaluateStrategy;
    }, [evaluateStrategy]);

    // --- Data Fetching: Ticks Stream ---
    useEffect(() => {
        if (!config.selectedMarket || !api_base.api) return;

        let isCancelled = false;
        api_base.api.send({ forget_all: 'ticks' });

        // --- INSTANT RESET ---
        setTicks([]);
        setCurrentPrice('Loading...');
        setDigitFreq({});

        const startStream = async () => {
            // 1. Get History (Last 1000)
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const history = (await api_base.api.send({
                    ticks_history: config.selectedMarket,
                    count: 1001,
                    end: 'latest',
                    style: 'ticks',
                    adjust_start_time: 1,
                })) as any;

                if (isCancelled) return;

                if (history.msg_type === 'history') {
                    const { history: h, pip_size } = history;
                    if (pip_size) setPipSize(pip_size);

                    if (h && h.prices) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const mappedTicks = h.prices.map((p: any, idx: number) => ({
                            epoch: h.times[idx],
                            quote: Number(p),
                            digit: getLastDigit(Number(p)),
                        }));
                        setTicks(mappedTicks);
                        updateFrequency(mappedTicks);
                        // Set price from the LATEST tick in history (last item in array)
                        if (mappedTicks.length > 0) {
                            const lastQuote = mappedTicks[mappedTicks.length - 1].quote;
                            setCurrentPrice(lastQuote.toFixed(pip_size || 2));
                        }
                    }
                }

                if (isCancelled) return;
                // 2. Subscribe
                api_base.api.send({ ticks: config.selectedMarket, subscribe: 1 });
            } catch (err) {
                console.error('Tick stream error', err);
            }
        };

        startStream();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription = api_base.api.onMessage().subscribe(({ data }: any) => {
            if (data.msg_type === 'tick') {
                const t = data.tick;

                // CRITICAL: Strict symbol check
                if (t.symbol !== config.selectedMarket) return;

                // Update Pip Size dynamically if present
                if (t.pip_size) setPipSize(t.pip_size);

                const newTick = {
                    epoch: t.epoch,
                    quote: t.quote,
                    digit: getLastDigit(t.quote),
                };

                // Direct update from stream with CORRECT precision
                const precision = t.pip_size || pipSize;
                setCurrentPrice(Number(t.quote).toFixed(precision));

                setTicks(prev => {
                    const newTicks = [...prev, newTick];
                    // Keep last 1005 to be safe
                    if (newTicks.length > 1005) {
                        const trimmed = newTicks.slice(newTicks.length - 1005);
                        updateFrequency(trimmed);
                        return trimmed;
                    }
                    updateFrequency(newTicks);
                    return newTicks;
                });

                // TRIGGER STRATEGY HERE
                if (isRunningRef.current) {
                    evaluateStrategyRef.current(newTick);
                }
            }
        });

        return () => {
            isCancelled = true;
            subscription.unsubscribe();
            api_base.api.send({ forget_all: 'ticks' });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.selectedMarket]);

    // --- Actions ---

    const startStrategy = () => {
        if (!client?.is_logged_in) {
            setError('Please log in.');
            return;
        }
        setError(null);
        setLogs([]);
        setStats(prev => ({
            ...prev,
            totalProfit: 0,
            tradeCount: 0,
            wins: 0,
            losses: 0,
            consecutiveLosses: 0,
            status: 'running',
            lastTradeResult: null,
        }));
        isRunningRef.current = true;
        addLog('Strategy Started. Analysis Active.');
    };

    const stopStrategy = (reason = 'User Stop') => {
        setStats(prev => ({ ...prev, status: 'stopped' }));
        isRunningRef.current = false;
        addLog(`Strategy Stopped: ${reason}`);
    };

    // --- Inputs Handling ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateConfig = (key: keyof StrategyConfig, val: any) => {
        setConfig(prev => ({ ...prev, [key]: val }));
    };

    // --- Helper for Digits Display (MTool Style) ---
    const lastDigits = ticks.slice(-15).reverse();

    if (!client) return <Loading />;

    return (
        <div className='speedbot-container'>
            {/* --- MTool-Style Header: Market & Ticks --- */}
            <div className='speedbot-market-header'>
                <div className='market-info'>
                    <div className='selector-wrap'>
                        <SelectNative
                            label='Market'
                            list_items={markets}
                            value={config.selectedMarket}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onChange={(e: any) => updateConfig('selectedMarket', e.target.value)}
                            disabled={stats.status !== 'idle' && stats.status !== 'stopped'}
                        />
                    </div>
                    <div className='price-display'>
                        <span className='price-label'>Current Price</span>
                        <span className='price-value'>{currentPrice}</span>
                    </div>
                </div>

                <div className='account-balance'>
                    <span className='bal-label'>Balance:</span>
                    <span className='bal-value'>
                        {formatMoney(client?.currency || 'USD', client?.balance || 0, true)}
                    </span>
                </div>

                <div className='ticks-visual'>
                    <Text size='xs' className='ticks-label'>
                        Latest Ticks
                    </Text>
                    <div className='ticks-row'>
                        {lastDigits.map(t => (
                            <div
                                key={t.epoch}
                                className={`tick-ball tick-${t.digit % 2 === 0 ? 'even' : 'odd'} digit-${t.digit}`}
                            >
                                {t.digit}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- Digit Frequency Section --- */}
            <div className='digit-frequency-panel'>
                <Text weight='bold' className='panel-title'>
                    Digit Frequency (Last 1000)
                </Text>
                <div className='digits-grid'>
                    {(() => {
                        // Calculate stats for coloring
                        const entries = Object.entries(digitFreq).map(([d, f]) => ({ d: Number(d), f }));
                        const sorted = [...entries].sort((a, b) => b.f - a.f);

                        const mostActive = sorted[0]?.d;
                        const secondMost = sorted[1]?.d;
                        const leastActive = sorted[sorted.length - 1]?.d;
                        const secondLeast = sorted[sorted.length - 2]?.d;

                        return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
                            const freq = digitFreq[d] || 0;
                            let colorClass = 'neutral';

                            if (d === mostActive) colorClass = 'most-active';
                            else if (d === secondMost) colorClass = 'second-active';
                            else if (d === leastActive) colorClass = 'least-active';
                            else if (d === secondLeast) colorClass = 'second-least-active';

                            return (
                                <div key={d} className={`digit-stat-item ${colorClass}`}>
                                    <div className='digit-circle'>{d}</div>
                                    <div className='digit-bar'>
                                        <div className='fill' style={{ height: `${Math.min(freq * 3, 100)}%` }}></div>
                                    </div>
                                    <span className='digit-val'>{freq.toFixed(1)}%</span>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            {/* --- Main Content Grid --- */}
            <div className='speedbot-grid'>
                {/* --- Left: Configuration --- */}
                <div className='config-panel card'>
                    <div className='card-header'>
                        <Icon icon='IcBotBuilder' />
                        <Text weight='bold'>System Config</Text>
                    </div>

                    <div className='inputs-grid'>
                        <Input
                            label='Initial Stake (USD)'
                            type='number'
                            value={config.initialStake}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onChange={(e: any) => updateConfig('initialStake', parseFloat(e.target.value))}
                            disabled={stats.status !== 'idle' && stats.status !== 'stopped'}
                        />
                        <Input
                            label='Take Profit (USD)'
                            type='number'
                            value={config.takeProfit}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onChange={(e: any) => updateConfig('takeProfit', parseFloat(e.target.value))}
                            disabled={stats.status !== 'idle' && stats.status !== 'stopped'}
                        />
                        <Input
                            label='Stop Loss (USD)'
                            type='number'
                            value={config.stopLoss}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onChange={(e: any) => updateConfig('stopLoss', parseFloat(e.target.value))}
                            disabled={stats.status !== 'idle' && stats.status !== 'stopped'}
                        />
                        <Input
                            label='Max Trades'
                            type='number'
                            value={config.maxTrades}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onChange={(e: any) => updateConfig('maxTrades', parseFloat(e.target.value))}
                            disabled={stats.status !== 'idle' && stats.status !== 'stopped'}
                        />
                        <Input
                            label='Cooldown (Ticks)'
                            type='number'
                            value={config.cooldownTicks}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onChange={(e: any) => updateConfig('cooldownTicks', parseFloat(e.target.value))}
                            disabled={stats.status !== 'idle' && stats.status !== 'stopped'}
                        />
                    </div>

                    <div className='control-buttons'>
                        {stats.status === 'idle' || stats.status === 'stopped' ? (
                            <Button className='btn-run' onClick={startStrategy} large>
                                <Icon icon='IcPlay' /> Run System
                            </Button>
                        ) : (
                            <Button className='btn-stop' onClick={() => stopStrategy('User Click')} large>
                                <Icon icon='IcCross' /> Stop
                            </Button>
                        )}
                    </div>
                    {error && <div className='error-msg'>{error}</div>}
                </div>

                {/* --- Right: Stats & Logs --- */}
                <div className='stats-panel card'>
                    {/* --- LIVE ANALYSIS PANEL (INSIDE STATS COLUMN) --- */}
                    <div className='analysis-card-section'>
                        <div className='card-header sub-header'>
                            <Icon icon='IcStats' />
                            <Text weight='bold'>Live Market Analysis</Text>
                        </div>
                        <div className='analysis-grid'>
                            <div className={`analysis-item ${metrics.isCalm ? 'safe' : 'danger'}`}>
                                <span className='label'>Market State</span>
                                <span className='value'>{metrics.isCalm ? 'CALM (Tradeable)' : 'VOLATILE (Wait)'}</span>
                            </div>
                            <div className='analysis-item'>
                                <span className='label'>Over 1 Pressure</span>
                                <span className={`value ${metrics.pressureOver1 <= 1.8 ? 'safe' : 'danger'}`}>
                                    {metrics.pressureOver1} {metrics.pressureOver1 <= 1.8 ? '(Safe)' : '(High)'}
                                </span>
                            </div>
                            <div className='analysis-item'>
                                <span className='label'>Under 8 Pressure</span>
                                <span className={`value ${metrics.pressureUnder8 <= 1.5 ? 'safe' : 'danger'}`}>
                                    {metrics.pressureUnder8} {metrics.pressureUnder8 <= 1.5 ? '(Safe)' : '(High)'}
                                </span>
                            </div>
                        </div>
                        <div className='analysis-divider'></div>
                    </div>

                    <div className='card-header'>
                        <Icon icon='IcDashboard' />
                        <Text weight='bold'>Live Statistics</Text>
                    </div>

                    <div className='stats-grid'>
                        <div className='stat-item'>
                            <span className='label'>Total Profit</span>
                            <span className={`value ${stats.totalProfit >= 0 ? 'profit' : 'loss'}`}>
                                {formatMoney('USD', Math.abs(stats.totalProfit), true)}
                            </span>
                        </div>
                        <div className='stat-item'>
                            <span className='label'>Status</span>
                            <span className='value'>{stats.status.toUpperCase()}</span>
                        </div>
                        <div className='stat-item'>
                            <span className='label'>W/L</span>
                            <span className='value'>
                                {stats.wins} / {stats.losses}
                            </span>
                        </div>
                        <div className='stat-item'>
                            <span className='label'>Trades</span>
                            <span className='value'>
                                {stats.tradeCount} / {config.maxTrades}
                            </span>
                        </div>
                    </div>

                    <div className='logs-container'>
                        <Text size='xs' weight='bold' className='logs-title'>
                            System Logs
                        </Text>
                        <div className='logs-scroll'>
                            {logs.map((log, i) => (
                                <div key={i} className='log-line'>
                                    {log}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default SpeedBot;
