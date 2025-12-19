'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './CopyTradingPage.module.scss';
import { useStore } from '@/hooks/useStore';
import { observer } from 'mobx-react-lite';
import { getAppId, getSocketURL } from '@/components/shared/utils/config/config';
import { api_base } from '@deriv/bot-skeleton';

interface LogItem {
    id: string;
    time: string;
    message: string;
    type: 'info' | 'buy' | 'error';
}

const CopyTradingPage = observer(() => {
    const store = useStore();
    const { client } = store;

    // Config State
    const [demoToken, setDemoToken] = useState<string>('');
    const [externalToken, setExternalToken] = useState<string>('');
    const [masterName, setMasterName] = useState<string>('');
    const [masterBalance, setMasterBalance] = useState<string>('');

    // Active State
    const [isDemoCopyActive, setIsDemoCopyActive] = useState(false);
    const [isExternalCopyActive, setIsExternalCopyActive] = useState(false);

    // Logs
    const [logs, setLogs] = useState<LogItem[]>([]);

    // WebSocket for Source (Demo or External)
    const wsSourceRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Initial Setup: Find Demo Token
    useEffect(() => {
        if (client && client.accounts) {
            // Find a demo account in the user's account list
            const accounts = client.accounts;
            // accounts is likely an object { loginid: { token, ... } }
            // Convert to array
            const accountList = Object.values(accounts);
            const demoAccount = accountList.find((acc: any) => acc.is_virtual === 1 || acc.loginid.startsWith('VRT'));

            if (demoAccount) {
                setDemoToken(demoAccount.token);
                addLog('info', `Found Demo Account: ${demoAccount.loginid}`);
            } else {
                addLog('info', 'No Demo Account found in your list.');
            }
        }
    }, [client]);

    const addLog = (type: 'info' | 'buy' | 'error', message: string) => {
        setLogs(prev => [{
            id: Math.random().toString(36).substr(2, 9),
            time: new Date().toLocaleTimeString(),
            message,
            type
        }, ...prev.slice(0, 49)]); // Keep last 50 logs
    };

    // --- Connection Logic ---

    const connectSource = (token: string, type: 'demo' | 'external') => {
        if (wsSourceRef.current) {
            wsSourceRef.current.close();
        }

        const appId = getAppId();
        const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;

        addLog('info', `Connecting to ${type === 'demo' ? 'Demo' : 'External'} Source...`);

        const ws = new WebSocket(wsUrl);
        wsSourceRef.current = ws;

        ws.onopen = () => {
            addLog('info', 'Source Connected. Authorizing...');
            ws.send(JSON.stringify({ authorize: token }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.msg_type === 'authorize') {
                if (data.error) {
                    addLog('error', `Authorization Failed: ${data.error.message}`);
                    if (type === 'external') stopExternalCopy();
                    if (type === 'demo') setIsDemoCopyActive(false);
                } else {
                    const name = data.authorize.fullname || data.authorize.loginid;
                    const balance = data.authorize.balance;
                    addLog('info', `Authorized Source: ${name} (${data.authorize.currency} ${balance})`);

                    if (type === 'external') {
                        setMasterName(name);
                        setMasterBalance(`${balance} ${data.authorize.currency}`);
                    }

                    // Subscribe to trades
                    // We subscribe to 'proposal_open_contract' to see new trades
                    // or 'transaction' stream
                    ws.send(JSON.stringify({
                        proposal_open_contract: 1,
                        subscribe: 1
                    }));
                    addLog('info', 'Listening for trades...');
                }
            }

            if (data.msg_type === 'proposal_open_contract') {
                const contract = data.proposal_open_contract;
                // Check if this is a newly opened contract (not Sold)
                // And ensure we haven't processed it already (simple dedup might be needed if stream sends updates)
                // For simplicity, we trigger on 'is_sold' === 0 and maybe check 'entry_tick_time' is recent

                // Better approach: Listen for 'transaction' type 'buy' if possible, but proposal_open_contract is richer.
                // We'll filter for newly bought contracts.

                // Key challenge: avoiding duplicate buys for the same contract update.
                // We can check if contract.is_valid_to_sell === 1 ??
                // Or use a simplistic "Contract ID" cache.

                handleSourceTrade(contract);
            }
        };

        ws.onclose = () => {
            addLog('info', 'Source Connection Closed.');
            // Auto reconnect if active
            if ((type === 'demo' && isDemoCopyActive) || (type === 'external' && isExternalCopyActive)) {
                reconnectTimeoutRef.current = setTimeout(() => connectSource(token, type), 3000);
            }
        };

        ws.onerror = () => {
            addLog('error', 'WebSocket Error on Source.');
        };
    };

    // Deduplication Set
    const processedContracts = useRef<Set<number>>(new Set());

    const handleSourceTrade = (contract: any) => {
        if (!contract.contract_id || !contract.entry_spot) return; // Wait until it's actually live?
        // Actually, for immediate copy, we want to catch it AS SOON AS bought.
        // 'transaction' msg_type is better for "Just Bought", but 'proposal_open_contract' updates constantly.

        // Let's rely on contract_id.
        if (processedContracts.current.has(contract.contract_id)) return;

        // If it's already sold, ignore (historical)
        if (contract.is_sold) return;

        // Verify recency (e.g. bought within last 10 seconds)
        const purchaseTime = contract.purchase_time;
        const now = Math.floor(Date.now() / 1000);
        if ((now - purchaseTime) > 30) return; // Too old

        // New Valid Trade!
        processedContracts.current.add(contract.contract_id);

        addLog('buy', `New Trade Detected on Source: ${contract.underlying_symbol} (${contract.contract_type})`);
        executeCopyTrade(contract);
    };

    const executeCopyTrade = (sourceContract: any) => {
        if (!api_base.api) {
            addLog('error', 'Main Account API not ready.');
            return;
        }

        addLog('info', `Copying Trade... ${sourceContract.underlying_symbol} ${sourceContract.contract_type}`);

        // Construct Buy Proposal for Main Account
        // We need to match parameters: amount, duration, barrier, etc.
        const params: any = {
            proposal: 1,
            amount: sourceContract.buy_price, // Copy exact stake
            basis: 'stake',
            contract_type: sourceContract.contract_type,
            currency: client.currency,
            duration: sourceContract.duration || 1, // Fallback
            duration_unit: sourceContract.duration_unit || 't', // Fallback to ticks?
            symbol: sourceContract.underlying_symbol,
        };

        if (sourceContract.barrier) {
            params.barrier = sourceContract.barrier;
        }

        // Handle duration edge cases if source contract doesn't explicitly send duration params in update
        // (Sometimes proposal_open_contract has 'date_expiry' instead).
        if (!params.duration && sourceContract.date_expiry) {
            const duration = sourceContract.date_expiry - sourceContract.purchase_time;
            params.duration = duration;
            params.duration_unit = 's'; // seconds
        }

        // 1. Get Proposal
        api_base.api.send(params).then((response: any) => {
            if (response.error) {
                addLog('error', `Proposal Failed: ${response.error.message}`);
                return;
            }
            // 2. Buy
            const proposalId = response.proposal.id;
            api_base.api.send({ buy: proposalId, price: response.proposal.ask_price }).then((buyRes: any) => {
                if (buyRes.error) {
                    addLog('error', `Buy Failed: ${buyRes.error.message}`);
                } else {
                    addLog('buy', `Trade Executed Successfully! ID: ${buyRes.buy.contract_id} Price: ${buyRes.buy.buy_price}`);
                    // Refresh balance
                    client.updateBalance(); // if method exists, else fire event
                }
            });
        }).catch((e: any) => {
            addLog('error', `Execution Error: ${e.message}`);
        });
    };

    // --- toggle Handlers ---

    const toggleDemoCopy = () => {
        if (isDemoCopyActive) {
            setIsDemoCopyActive(false);
            if (wsSourceRef.current) wsSourceRef.current.close();
            addLog('info', 'Stopped Demo Copy.');
        } else {
            if (!demoToken) {
                addLog('error', 'No Demo Token available.');
                return;
            }
            // Ensure External is off
            if (isExternalCopyActive) toggleExternalCopy();

            setIsDemoCopyActive(true);
            connectSource(demoToken, 'demo');
        }
    };

    const startExternalCopy = () => {
        if (!externalToken) {
            addLog('error', 'Please enter a Master API Token.');
            return;
        }
        // Ensure Demo is off
        if (isDemoCopyActive) toggleDemoCopy();

        setIsExternalCopyActive(true);
        connectSource(externalToken, 'external');
    };

    const stopExternalCopy = () => {
        setIsExternalCopyActive(false);
        if (wsSourceRef.current) wsSourceRef.current.close();
        addLog('info', 'Stopped External Copy.');
    };

    const toggleExternalCopy = () => {
        if (isExternalCopyActive) stopExternalCopy();
        else startExternalCopy();
    };

    return (
        <div className={styles.container}>
            <div className={styles.card}>

                {/* Header */}
                <div className={styles.header}>
                    <h1>Copy Trading</h1>
                    <p>Copy trades from your Demo account or an External Master account directly to your Real Balance.</p>
                </div>

                {/* Account Info */}
                <div className={styles.accountInfo}>
                    <span className={styles.balanceLabel}>Real Account Balance</span>
                    <span className={styles.balanceValue}>
                        {client?.balance ? `${client.balance} ${client.currency}` : 'Loading...'}
                    </span>
                </div>

                {/* Internal Copy Section */}
                <div className={styles.section}>
                    <h2><span className={styles.icon}>📋</span> Internal Copy (Demo → Real)</h2>
                    <div className={styles.demoCopyControl}>
                        <div className={styles.info}>
                            <h3>Copy My Demo Account</h3>
                            <p>Status: {isDemoCopyActive ? 'Active & Listening' : 'Inactive'}</p>
                            {demoToken && <p style={{ fontSize: '11px', color: '#666' }}>Token Found: ...{demoToken.substr(-4)}</p>}
                        </div>
                        <label className={styles.toggleSwitch}>
                            <input
                                type="checkbox"
                                checked={isDemoCopyActive}
                                onChange={toggleDemoCopy}
                                disabled={!demoToken}
                            />
                            <span className={styles.slider}></span>
                        </label>
                    </div>
                </div>

                {/* External Copy Section */}
                <div className={styles.section}>
                    <h2><span className={styles.icon}>🌍</span> External Copy</h2>

                    {!isExternalCopyActive ? (
                        <div className={styles.externalInputGroup}>
                            <input
                                type="text"
                                placeholder="Enter Master API Token"
                                value={externalToken}
                                onChange={(e) => setExternalToken(e.target.value)}
                            />
                            <button onClick={startExternalCopy}>Connect & Start</button>
                        </div>
                    ) : (
                        <div className={styles.masterInfo}>
                            <div className={styles.masterDetails}>
                                <h3>Connected to Master: {masterName}</h3>
                                <p>Balance: {masterBalance}</p>
                            </div>
                            <button onClick={stopExternalCopy} style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>Stop</button>
                        </div>
                    )}
                </div>

                {/* Status & Logs */}
                <div className={styles.section}>
                    <h2>Activity Log</h2>
                    <div className={styles.logContainer}>
                        {logs.length === 0 ? (
                            <p className={styles.emptyLog}>No activity yet. Start copying to see trades.</p>
                        ) : (
                            logs.map(log => (
                                <div key={log.id} className={`${styles.logItem} ${styles[log.type]}`}>
                                    <span className={styles.time}>{log.time}</span>
                                    <span className={styles.message}>{log.message}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
});

export default CopyTradingPage;
