import React, { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { formatMoney } from '@/components/shared/utils/currency/currency';
import Button from '@/components/shared_ui/button';
import Input from '@/components/shared_ui/input';
import Loading from '@/components/shared_ui/loading';
import SelectNative from '@/components/shared_ui/select-native';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { Icon } from '@/utils/tmp/dummy';
// @ts-expect-error
import { api_base } from '@deriv/bot-skeleton';
import { Localize } from '@deriv-com/translations';
import './speedbot.scss';

interface StrategyState {
    entryPoint: number;
    predictionBeforeLoss: number;
    predictionAfterLoss: number;
    initialStake: number;
    nextStake: number;
    takeProfit: number;
    stopLoss: number;
    martingaleLevel: number;
    isRunning: boolean;
    currentStake: number;
    totalProfit: number;
    lastTrade: 'win' | 'loss' | null;
    selectedMarket: string;
    marketSymbol: string;
    volatility: number;
}

interface VolatilityMarket {
    text: string;
    value: string;
    symbol: string;
    volatility: number;
}

const SpeedBot = observer(() => {
    const store = useStore();
    const client = store?.client;
    const [isStrategyRunning, setIsStrategyRunning] = useState(false);
    const [markets, setMarkets] = useState<VolatilityMarket[]>([]);
    const [strategy, setStrategy] = useState<
        Omit<StrategyState, 'isRunning' | 'currentStake' | 'totalProfit' | 'lastTrade'>
    >({
        entryPoint: 1,
        predictionBeforeLoss: 1,
        predictionAfterLoss: 6,
        initialStake: 1,
        nextStake: 1.9,
        takeProfit: 5,
        stopLoss: -10,
        martingaleLevel: 2,
        selectedMarket: 'R_100', // Default
        marketSymbol: 'R_100',
        volatility: 0.5,
    });

    const [executionState, setExecutionState] = useState({
        isRunning: false,
        currentStake: 1,
        totalProfit: 0,
        lastTrade: null as 'win' | 'loss' | null,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tradeHistory, setTradeHistory] = useState<Array<{
        id: number;
        timestamp: Date;
        stake: number;
        prediction: number;
        result: 'win' | 'loss';
        profit: number;
    }>>([]);

    // Use ref to access current state in callbacks
    const stateRef = useRef({
        ...strategy,
        ...executionState
    });
    useEffect(() => {
        stateRef.current = {
            ...strategy,
            ...executionState
        };
    }, [strategy, executionState]);

    useEffect(() => {
        let isMounted = true;

        const fetchMarkets = async () => {
            if (!api_base.api) return;

            try {
                const response = await api_base.api.send({
                    active_symbols: 'brief',
                    product_type: 'basic'
                });

                if (response.active_symbols && isMounted) {
                    // Match MTool filtering: Include all proper 'synthetics' subgroup symbols
                    // This covers Volatility Indices and Jump Indices
                    const volatilitySymbols = response.active_symbols.filter(
                        (symbol: any) => symbol.subgroup === 'synthetics'
                    );

                    // Sort by display order
                    volatilitySymbols.sort((a: any, b: any) => a.display_order - b.display_order);

                    const formattedMarkets = volatilitySymbols.map((m: any) => ({
                        text: m.display_name,
                        value: m.symbol,
                        symbol: m.symbol,
                        volatility: 0.5 // Default or calculated if needed based on tick history
                    }));

                    setMarkets(formattedMarkets);

                    if (formattedMarkets.length > 0 && !formattedMarkets.find((m: any) => m.value === strategy.selectedMarket)) {
                        setStrategy(prev => ({
                            ...prev,
                            selectedMarket: formattedMarkets[0].value,
                            marketSymbol: formattedMarkets[0].symbol
                        }));
                    }
                }
            } catch (err) {
                console.error("Failed to fetch markets:", err);
            }
        };

        fetchMarkets();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleInputChange = (field: keyof typeof strategy, value: string | number) => {
        const numValue = typeof value === 'string' ? parseFloat(value) || 0 : value;
        setStrategy(prev => ({
            ...prev,
            [field]: numValue,
        }));
    };

    const validateInputs = () => {
        if (strategy.initialStake <= 0) {
            setError('Initial stake must be greater than 0');
            return false;
        }
        if (strategy.predictionBeforeLoss < 0 || strategy.predictionBeforeLoss > 9) {
            setError('Prediction before loss must be between 0 and 9');
            return false;
        }
        if (strategy.predictionAfterLoss < 0 || strategy.predictionAfterLoss > 9) {
            setError('Prediction after loss must be between 0 and 9');
            return false;
        }
        if (strategy.takeProfit <= 0) {
            setError('Take profit must be greater than 0');
            return false;
        }
        // stopLoss is typically negative, but user might input positive number implying loss limit
        if (strategy.stopLoss >= 0) {
            // If user ensures negative, ok.
            // eslint-disable-next-line no-console
            console.warn('Stop loss is positive or zero, which might be unintended for a loss limit.');
        }
        if (strategy.martingaleLevel < 1) {
            setError('Martingale level must be at least 1');
            return false;
        }
        setError(null);
        return true;
    };

    const executeTrade = useCallback(async (stake: number, prediction: number): Promise<{ isWin: boolean; profit: number }> => {
        // Real API Implementation with Subscription
        try {
            const symbol = stateRef.current.selectedMarket;
            const contractType = 'DIGITMATCH';

            const proposal = await api_base.api.send({
                proposal: 1,
                amount: stake,
                basis: 'stake',
                contract_type: contractType,
                currency: client?.currency || 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: symbol,
                barrier: String(prediction),
            });

            if (proposal.error) {
                throw new Error(proposal.error.message);
            }

            const buy = await api_base.api.send({
                buy: proposal.proposal.id,
                price: proposal.proposal.ask_price,
            });

            if (buy.error) {
                throw new Error(buy.error.message);
            }

            const contractId = buy.buy.contract_id;

            // Subscribe to contract updates for faster result
            return new Promise((resolve, reject) => {
                api_base.api.send({
                    proposal_open_contract: 1,
                    contract_id: contractId,
                    subscribe: 1
                });

                // We need a way to listen to this specific subscription. 
                // Since api_base might not expose a direct listener for this specific req, 
                // we can rely on the general onMessage if possible, OR just poll faster if subscription is complex to wire up here without a proper listener ID.
                // However, MTool uses direct socket. Here we use api_base.
                // api_base handles subscriptions internally but finding the specific message requires a listener.

                // BACKUP: Optimized polling (every 100ms)
                let retries = 50;
                const poll = async () => {
                    if (retries <= 0) {
                        reject(new Error("Trade timeout"));
                        return;
                    }

                    try {
                        const status = await api_base.api.send({ proposal_open_contract: 1, contract_id: contractId });
                        if (status.proposal_open_contract && status.proposal_open_contract.is_sold) {
                            const contract = status.proposal_open_contract;
                            const resultProfit = Number(contract.profit);
                            const isWin = resultProfit >= 0;
                            resolve({ isWin, profit: resultProfit });
                        } else {
                            retries--;
                            setTimeout(poll, 100);
                        }
                    } catch (e) {
                        reject(e);
                    }
                };
                poll();
            });

        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Trade Execution Error', e);
            throw e;
        }
    }, [client?.currency]);

    const startStrategy = () => {
        if (!validateInputs()) return;
        if (!client?.is_logged_in) {
            setError('Please log in to trade.');
            return;
        }

        // Initialize execution state
        setExecutionState({
            isRunning: true,
            currentStake: strategy.initialStake,
            totalProfit: 0,
            lastTrade: null,
        });

        setIsStrategyRunning(true);
    };

    const stopStrategy = () => {
        setIsStrategyRunning(false);
        setExecutionState(prev => ({
            ...prev,
            isRunning: false
        }));
    };

    // Effect to handle strategy execution
    useEffect(() => {
        if (!executionState.isRunning) return;

        let isMounted = true;

        const runStrategy = async () => {
            let currentStake = executionState.currentStake;
            let currentPrediction = strategy.predictionBeforeLoss;
            let consecutiveLosses = 0;
            let tradeCount = 0;
            const maxTrades = 1000; // Increased limit

            while (isMounted && executionState.isRunning &&
                executionState.totalProfit < strategy.takeProfit &&
                executionState.totalProfit > strategy.stopLoss &&
                tradeCount < maxTrades) {

                tradeCount++;

                try {
                    // Execute Real Trade
                    const { isWin, profit } = await executeTrade(currentStake, currentPrediction);

                    if (!isMounted) return;

                    // Update execution state
                    const newTotalProfit = executionState.totalProfit + profit;
                    // Logic from user code:
                    // Win -> Reset Stake
                    // Loss -> Martingale
                    const newStake = isWin ? strategy.initialStake : currentStake * strategy.martingaleLevel;

                    setExecutionState(prev => ({
                        ...prev,
                        totalProfit: newTotalProfit,
                        currentStake: Number(newStake.toFixed(2)),
                        lastTrade: isWin ? 'win' : 'loss',
                        isRunning: !(newTotalProfit >= strategy.takeProfit || newTotalProfit <= strategy.stopLoss)
                    }));

                    // Add to trade history
                    setTradeHistory(prev => {
                        const result: 'win' | 'loss' = isWin ? 'win' : 'loss';
                        return [{
                            id: Date.now() + tradeCount,
                            timestamp: new Date(),
                            stake: currentStake,
                            prediction: currentPrediction,
                            result,
                            profit,
                        }, ...prev].slice(0, 50); // Keep last 50 trades
                    });

                    // Client balance update
                    // Use api_base as client.send is not available
                    api_base.api.send({ balance: 1, subscribe: 0 });

                    if (isWin) {
                        currentStake = strategy.initialStake;
                        currentPrediction = strategy.predictionBeforeLoss;
                        consecutiveLosses = 0;
                    } else {
                        consecutiveLosses++;
                        currentStake = strategy.initialStake * Math.pow(strategy.martingaleLevel, consecutiveLosses);
                        currentPrediction = strategy.predictionAfterLoss;
                    }

                } catch (error) {
                    // eslint-disable-next-line no-console
                    console.error('Trade error:', error);
                    // Add delay before retrying
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                // Add delay between trades
                if (isMounted && executionState.isRunning) {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Fast execution
                }
            }

            if (isMounted) {
                setIsStrategyRunning(false);
            }
        };

        runStrategy();

        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [executionState.isRunning]); // Strategy dependencies in ref

    const resetStrategy = () => {
        setExecutionState({
            isRunning: false,
            currentStake: strategy.initialStake,
            totalProfit: 0,
            lastTrade: null,
        });
        setTradeHistory([]);
        setError(null);
    };

    // Handle market change
    const handleMarketChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedValue = e.target.value;
        const selectedMarket = markets.find(market => market.value === selectedValue);

        if (selectedMarket) {
            setStrategy(prev => ({
                ...prev,
                selectedMarket: selectedMarket.value,
                marketSymbol: selectedMarket.symbol,
                volatility: selectedMarket.volatility
            }));
        }
    };

    const getMarketColor = () => {
        switch (strategy.selectedMarket) {
            case '1HZ10V': return '#4caf50';
            case '1HZ25V': return '#8bc34a';
            case '1HZ50V': return '#2196f3';
            case '1HZ75V': return '#ff9800';
            case '1HZ100V': return '#f44336';
            default: return '#2196f3';
        }
    };

    // Provide safe access
    if (!client) return <Loading />;

    return (
        <div className='speedbot-container' style={{
            '--primary-color': '#2196f3',
            '--profit-color': '#4caf50',
            '--loss-color': '#f44336',
            '--market-color': getMarketColor()
        } as React.CSSProperties}>
            {!client.is_logged_in && (
                <div className="auth-warning-banner" style={{
                    background: '#ff4444',
                    color: 'white',
                    padding: '10px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    marginBottom: '10px',
                    borderRadius: '4px'
                }}>
                    Unauthorised Login - Please Log In to Trade
                </div>
            )}

            <div className='speedbot-header'>
                <Text as='h1' weight='bold' className='speedbot-title'>
                    <Icon icon='IcChart' className='speedbot-title-icon' />
                    <Localize i18n_default_text='SpeedBot Pro' />
                </Text>

                <div className='speedbot-market-selector'>
                    <Text as='p' className='speedbot-label' size='s'>
                        <Localize i18n_default_text='Market Volatility' />
                    </Text>
                    <SelectNative
                        data-testid='market-selector'
                        className='speedbot-select'
                        value={strategy.selectedMarket}
                        list_items={markets.length > 0 ? markets.map(market => ({
                            text: market.text,
                            value: market.value
                        })) : [{ text: 'Loading Markets...', value: '' }]}
                        onChange={handleMarketChange}
                        disabled={isStrategyRunning || markets.length === 0}
                    />
                </div>
            </div>

            {error && (
                <div className='speedbot-error'>
                    <Icon icon='IcClose' />
                    <Text as='p' size='xs' color='loss-danger'>
                        {error}
                    </Text>
                </div>
            )}

            <div className='speedbot-controls-card'>
                <div className='speedbot-section'>
                    <div className='speedbot-section-header'>
                        <Icon icon='IcBotBuilder' className='speedbot-section-icon' />
                        <Text as='h3' weight='bold' className='speedbot-section-title'>
                            <Localize i18n_default_text='Strategy Settings' />
                        </Text>
                    </div>

                    <div className='speedbot-controls-grid'>
                        <div className='speedbot-control'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Prediction Before Loss' />
                            </Text>
                            <Input
                                type='number'
                                value={strategy.predictionBeforeLoss}
                                disabled={isStrategyRunning}
                                onChange={(e) => handleInputChange('predictionBeforeLoss', e.target.value)}
                                min='0'
                                max='9'
                            />
                        </div>

                        <div className='speedbot-control'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Prediction After Loss' />
                            </Text>
                            <Input
                                type='number'
                                value={strategy.predictionAfterLoss}
                                disabled={isStrategyRunning}
                                onChange={(e) => handleInputChange('predictionAfterLoss', e.target.value)}
                                min='0'
                                max='9'
                            />
                        </div>

                        <div className='speedbot-control'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Initial Stake (USD)' />
                            </Text>
                            <Input
                                type='number'
                                value={strategy.initialStake}
                                disabled={isStrategyRunning}
                                onChange={(e) => handleInputChange('initialStake', e.target.value)}
                                min='0.35'
                                step='0.1'
                            />
                        </div>

                        <div className='speedbot-control'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Next Stake (USD)' />
                            </Text>
                            <Input
                                type='number'
                                value={strategy.nextStake}
                                disabled={isStrategyRunning}
                                onChange={(e) => handleInputChange('nextStake', e.target.value)}
                                min='0.35'
                                step='0.1'
                            />
                        </div>

                        <div className='speedbot-control'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Take Profit (USD)' />
                            </Text>
                            <Input
                                type='number'
                                value={strategy.takeProfit}
                                disabled={isStrategyRunning}
                                onChange={(e) => handleInputChange('takeProfit', e.target.value)}
                                min='1'
                            />
                        </div>

                        <div className='speedbot-control'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Stop Loss (USD)' />
                            </Text>
                            <Input
                                type='number'
                                value={strategy.stopLoss}
                                disabled={isStrategyRunning}
                                onChange={(e) => handleInputChange('stopLoss', e.target.value)}
                                max='-1'
                            />
                        </div>

                        <div className='speedbot-control'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Martingale Level' />
                            </Text>
                            <Input
                                type='number'
                                value={strategy.martingaleLevel}
                                disabled={isStrategyRunning}
                                onChange={(e) => handleInputChange('martingaleLevel', e.target.value)}
                                min='1'
                                step='0.1'
                            />
                        </div>
                    </div>
                </div>

                <div className='speedbot-section'>
                    <div className='speedbot-section-header'>
                        <Icon icon='IcDashboard' className='speedbot-section-icon' />
                        <Text as='h3' weight='bold' className='speedbot-section-title'>
                            <Localize i18n_default_text='Trading Status' />
                        </Text>
                    </div>

                    <div className='speedbot-status'>
                        <div className='speedbot-status-item'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Status' />
                            </Text>
                            <Text as='p' weight='bold' color={executionState.isRunning ? 'profit-success' : 'loss-danger'}>
                                {executionState.isRunning ? 'RUNNING' : 'STOPPED'}
                            </Text>
                        </div>

                        <div className='speedbot-status-item'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Current Stake' />
                            </Text>
                            <Text as='p' weight='bold' color='profit-success' size='l'>
                                {formatMoney(client.currency, executionState.currentStake, true)}
                            </Text>
                        </div>

                        <div className='speedbot-status-item'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Total Profit/Loss' />
                            </Text>
                            <Text
                                as='p'
                                weight='bold'
                                color={executionState.totalProfit >= 0 ? 'profit-success' : 'loss-danger'}
                            >
                                {formatMoney(client.currency, Math.abs(executionState.totalProfit), true, 2)}
                                {executionState.totalProfit >= 0 ? ' PROFIT' : ' LOSS'}
                            </Text>
                        </div>

                        <div className='speedbot-status-item'>
                            <Text as='p' className='speedbot-label'>
                                <Localize i18n_default_text='Last Trade' />
                            </Text>
                            <Text
                                as='p'
                                weight='bold'
                                color={executionState.lastTrade === 'win' ? 'profit-success' : 'loss-danger'}
                            >
                                {executionState.lastTrade ? (
                                    <span className={executionState.lastTrade === 'win' ? 'text-profit' : 'text-loss'}>
                                        {executionState.lastTrade.toUpperCase()}
                                    </span>
                                ) : '-'}
                            </Text>
                        </div>
                    </div>

                    <div className='speedbot-actions'>
                        <div className='speedbot-actions-buttons'>
                            {!isStrategyRunning ? (
                                <Button
                                    className='speedbot-action-btn run'
                                    onClick={startStrategy}
                                    disabled={isLoading || executionState.isRunning}
                                    large
                                >
                                    <Icon icon='IcPlay' className='btn-icon' />
                                    <Localize i18n_default_text='Run Strategy' />
                                </Button>
                            ) : (
                                <Button
                                    className='speedbot-action-btn stop'
                                    onClick={stopStrategy}
                                    disabled={!executionState.isRunning || isLoading}
                                    large
                                >
                                    <Icon icon='IcCross' className='btn-icon' />
                                    <Localize i18n_default_text='Stop' />
                                </Button>
                            )}
                            <Button
                                className='speedbot-action-btn reset'
                                onClick={resetStrategy}
                                disabled={isStrategyRunning || isLoading}
                                large
                                secondary
                            >
                                <Icon icon='IcRedo' className='btn-icon' />
                                <Localize i18n_default_text='Reset' />
                            </Button>
                        </div>
                        {!client.is_logged_in && (
                            <Text as='p' size='xs' color='loss-danger' className='login-notice'>
                                <Localize i18n_default_text='Please log in to start trading' />
                            </Text>
                        )}
                    </div>
                </div>

                {tradeHistory.length > 0 && (
                    <div className='speedbot-section'>
                        <div className='speedbot-section-header'>
                            <Icon icon='IcHistory' className='speedbot-section-icon' />
                            <Text as='h3' weight='bold' className='speedbot-section-title'>
                                <Localize i18n_default_text='Trade History' />
                            </Text>
                        </div>
                        <div className='speedbot-trade-history'>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Stake</th>
                                        <th>Prediction</th>
                                        <th>Result</th>
                                        <th>P/L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tradeHistory.map(trade => (
                                        <tr key={trade.id}>
                                            <td>{trade.timestamp.toLocaleTimeString()}</td>
                                            <td>{formatMoney('USD', trade.stake, true)}</td>
                                            <td>{trade.prediction}</td>
                                            <td className={`trade-${trade.result}`}>{trade.result.toUpperCase()}</td>
                                            <td className={trade.profit >= 0 ? 'profit' : 'loss'}>
                                                {formatMoney('USD', Math.abs(trade.profit), true, 2)}
                                                {trade.profit >= 0 ? ' ✅' : ' ❌'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

export default SpeedBot;
