'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './CopyTradingPage.module.scss';

interface Account {
    loginid: string;
    token: string;
    currency: string;
    balance?: number;
    accountType?: string;
    name?: string;
}

interface Wallet {
    id: string;
    name: string;
    balance: number;
    type: 'demo' | 'real';
}

interface Follower {
    loginid: string;
    token: string;
    name?: string;
    status: 'connected' | 'syncing' | 'disconnected';
    balance?: number;
    lastSync?: string;
    selectedWallet?: string;
    copyMode?: 'demo-to-demo' | 'real-to-real';
    wallets?: Wallet[];
}

interface ResponseData {
    msg_type?: string;
    error?: {
        message: string;
    };
    authorize?: {
        loginid: string;
        balance?: number;
        account_type?: string;
        fullname?: string;
    };
    balance?: {
        balance: number;
    };
    [key: string]: any;
}

interface ApiLog {
    id: string;
    timestamp: string;
    type: 'request' | 'response';
    data: ResponseData;
}

const CopyTradingPage = () => {
    const [wsConnected, setWsConnected] = useState(false);
    const [wsConnecting, setWsConnecting] = useState(false);
    const [ping, setPing] = useState<number | null>(null);

    const [userRole, setUserRole] = useState<'trader' | 'follower' | 'personal' | null>(null);
    const [demoToRealMode, setDemoToRealMode] = useState(false);
    const [isCopyingActive, setIsCopyingActive] = useState(false);
    const [copyMode, setCopyMode] = useState<'demo-to-demo' | 'demo-to-real' | 'real-to-real'>('demo-to-demo');

    // Account States
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [activeAccount, setActiveAccount] = useState<Account | null>(null);
    const [accountBalance, setAccountBalance] = useState<number | null>(null);
    const [accountName, setAccountName] = useState<string>('');
    const [userWallets, setUserWallets] = useState<Wallet[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<string>('');

    // Follower Management (Trader Mode)
    const [followers, setFollowers] = useState<Follower[]>([]);
    const [newFollowerToken, setNewFollowerToken] = useState('');
    const [newFollowerName, setNewFollowerName] = useState('');

    // Trader Connection (Follower Mode)
    const [traderToken, setTraderToken] = useState('');
    const [traderName, setTraderName] = useState('');
    const [traderCopyMode, setTraderCopyMode] = useState<'demo-to-demo' | 'real-to-real'>('demo-to-demo');

    // UI States
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'followers' | 'settings' | 'response'>('overview');
    const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(
        null
    );

    const wsRef = useRef<WebSocket | null>(null);
    const balanceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastPingTimeRef = useRef<number>(0);

    const accountDetailsCache = useRef<Map<string, { name: string; wallets: Wallet[] }>>(new Map());
    const balanceFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const addApiLog = useCallback((type: 'request' | 'response', data: ResponseData) => {
        const log: ApiLog = {
            id: `${Date.now()}-${Math.random()}`,
            timestamp: new Date().toLocaleTimeString(),
            type,
            data,
        };
        setApiLogs(prev => [log, ...prev.slice(0, 99)]);
    }, []);

    useEffect(() => {
        const savedRole = localStorage.getItem('copytrading_role') as 'trader' | 'follower' | 'personal' | null;
        const savedCopyMode =
            (localStorage.getItem('copytrading_copy_mode') as 'demo-to-demo' | 'demo-to-real' | 'real-to-real') ||
            'demo-to-demo';
        const savedDemoMode = localStorage.getItem('copytrading_demo_mode') === 'true';
        const savedCopyingActive = localStorage.getItem('copytrading_active') === 'true';
        const savedFollowers = localStorage.getItem('copytrading_followers');
        const savedAccountName = localStorage.getItem('copytrading_account_name');
        const savedWallets = localStorage.getItem('copytrading_wallets');
        const savedSelectedWallet = localStorage.getItem('copytrading_selected_wallet');

        if (savedRole) setUserRole(savedRole);
        setCopyMode(savedCopyMode);
        setDemoToRealMode(savedDemoMode);
        setIsCopyingActive(savedCopyingActive);
        if (savedFollowers) setFollowers(JSON.parse(savedFollowers));
        if (savedAccountName) setAccountName(savedAccountName);
        if (savedWallets) setUserWallets(JSON.parse(savedWallets));
        if (savedSelectedWallet) setSelectedWallet(savedSelectedWallet);

        const clientAccounts = localStorage.getItem('clientAccounts');
        if (clientAccounts) {
            const parsed = JSON.parse(clientAccounts);
            const accountsArray = Object.values(parsed) as Account[];
            setAccounts(accountsArray);
            if (accountsArray.length > 0) {
                setActiveAccount(accountsArray[0]);
            }
        }

        return () => {
            if (balanceCheckIntervalRef.current) clearInterval(balanceCheckIntervalRef.current);
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        };
    }, []);

    useEffect(() => {
        if (activeAccount && userRole && !wsRef.current) {
            connectWebSocket(activeAccount.token);
        }
    }, [activeAccount, userRole]);

    // Save state to localStorage
    useEffect(() => {
        if (userRole) localStorage.setItem('copytrading_role', userRole);
    }, [userRole]);

    useEffect(() => {
        localStorage.setItem('copytrading_copy_mode', copyMode);
    }, [copyMode]);

    useEffect(() => {
        localStorage.setItem('copytrading_demo_mode', demoToRealMode.toString());
    }, [demoToRealMode]);

    useEffect(() => {
        localStorage.setItem('copytrading_active', isCopyingActive.toString());
    }, [isCopyingActive]);

    useEffect(() => {
        localStorage.setItem('copytrading_followers', JSON.stringify(followers));
    }, [followers]);

    useEffect(() => {
        localStorage.setItem('copytrading_account_name', accountName);
    }, [accountName]);

    useEffect(() => {
        localStorage.setItem('copytrading_wallets', JSON.stringify(userWallets));
    }, [userWallets]);

    useEffect(() => {
        localStorage.setItem('copytrading_selected_wallet', selectedWallet);
    }, [selectedWallet]);

    const fetchAccountDetails = useCallback(
        async (token: string): Promise<{ name: string; wallets: Wallet[] }> => {
            if (accountDetailsCache.current.has(token)) {
                return accountDetailsCache.current.get(token)!;
            }

            return new Promise<{ name: string; wallets: Wallet[] }>((resolve, reject) => {
                const tempWs = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=70344');
                let resolved = false;

                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        tempWs.close();
                        reject(new Error('Account details fetch timeout'));
                    }
                }, 5000);

                tempWs.onopen = () => {
                    tempWs.send(JSON.stringify({ authorize: token }));
                    addApiLog('request', { authorize: token });
                };

                tempWs.onmessage = event => {
                    const data: ResponseData = JSON.parse(event.data);
                    addApiLog('response', data);

                    if (data.msg_type === 'authorize') {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);

                            if (data.error) {
                                reject(new Error(data.error.message));
                            } else {
                                const accountName = data.authorize?.fullname || data.authorize?.loginid || 'Account';
                                const mockWallets: Wallet[] = [
                                    { id: 'demo_1', name: 'Demo Wallet', balance: 10000, type: 'demo' },
                                    { id: 'real_1', name: 'Real Wallet', balance: 5000, type: 'real' },
                                ];
                                const result = { name: accountName, wallets: mockWallets };
                                accountDetailsCache.current.set(token, result);
                                resolve(result);
                            }
                            tempWs.close();
                        }
                    }
                };

                tempWs.onerror = () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        reject(new Error('Failed to fetch account details'));
                    }
                };
            });
        },
        [addApiLog]
    );

    const connectWebSocket = useCallback(
        (token: string) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                console.log('[v0] WebSocket already connected');
                return;
            }

            if (wsConnecting) {
                console.log('[v0] WebSocket connection already in progress');
                return;
            }

            setWsConnecting(true);
            console.log('[v0] Starting persistent WebSocket connection...');

            wsRef.current = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=108422');

            wsRef.current.onopen = () => {
                console.log('[v0] WebSocket opened, sending authorize...');
                setWsConnecting(false);
                setWsConnected(true);
                showNotification('success', 'WebSocket connected');

                wsRef.current?.send(JSON.stringify({ authorize: token }));
                addApiLog('request', { authorize: token });

                if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = setInterval(() => {
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        lastPingTimeRef.current = Date.now();
                        wsRef.current.send(JSON.stringify({ ping: 1 }));
                    }
                }, 5000);
            };

            wsRef.current.onclose = () => {
                console.log('[v0] WebSocket closed');
                setWsConnecting(false);
                setWsConnected(false);
                setPing(null);
                showNotification('warning', 'Connection lost. Reconnecting in 3 seconds...');

                if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
                if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

                reconnectTimeoutRef.current = setTimeout(() => {
                    connectWebSocket(token);
                }, 3000);
            };

            wsRef.current.onerror = error => {
                console.log('[v0] WebSocket error:', error);
                setWsConnecting(false);
                setWsConnected(false);
                showNotification('error', 'WebSocket connection error');
            };

            wsRef.current.onmessage = event => {
                const data: ResponseData = JSON.parse(event.data);
                addApiLog('response', data);
                console.log('[v0] WebSocket message:', data.msg_type);

                if (data.msg_type === 'pong') {
                    const latency = Date.now() - lastPingTimeRef.current;
                    setPing(latency);
                }

                if (data.msg_type === 'authorize') {
                    if (data.error) {
                        console.log('[v0] Authorization error:', data.error.message);
                        showNotification('error', `Authorization failed: ${data.error.message}`);
                    } else {
                        const realName = data.authorize?.fullname || data.authorize?.loginid || 'Account';
                        console.log('[v0] Authorized as:', realName);
                        setAccountName(realName);
                        showNotification('success', `Authorized as ${realName}`);

                        if (data.authorize?.balance !== undefined) {
                            setAccountBalance(data.authorize.balance);
                        }
                    }
                }

                if (data.msg_type === 'balance' && data.balance) {
                    console.log('[v0] Balance updated:', data.balance.balance);
                    setAccountBalance(data.balance.balance);
                }

                if (data.msg_type === 'copy_start' && !data.error) {
                    setIsCopyingActive(true);
                    showNotification('success', `Copy trading started (${copyMode})`);
                }

                if (data.msg_type === 'copy_stop' && !data.error) {
                    setIsCopyingActive(false);
                    showNotification('success', 'Copy trading stopped');
                }
            };
        },
        [addApiLog]
    );

    const fetchBalance = useCallback(() => {
        if (balanceFetchTimeoutRef.current) clearTimeout(balanceFetchTimeoutRef.current);

        balanceFetchTimeoutRef.current = setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                const request = { balance: 1, req_id: Date.now() };
                wsRef.current.send(JSON.stringify(request));
                addApiLog('request', request);
            }
        }, 100);
    }, [addApiLog]);

    const showNotification = (type: 'success' | 'error' | 'warning', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    };

    const copyToClipboard = (data: ResponseData) => {
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        showNotification('success', 'Copied to clipboard!');
    };

    // Trader Mode: Add Follower
    const addFollower = async () => {
        if (!newFollowerToken.trim()) {
            showNotification('error', 'Please enter a follower token');
            return;
        }

        setIsLoading(true);
        try {
            const { name, wallets } = await fetchAccountDetails(newFollowerToken.trim());

            const newFollower: Follower = {
                loginid: name,
                token: newFollowerToken.trim(),
                name: newFollowerName || name,
                status: 'connected',
                balance: wallets[0]?.balance,
                lastSync: new Date().toISOString(),
                selectedWallet: wallets[0]?.id,
                copyMode: copyMode as 'demo-to-demo' | 'real-to-real',
                wallets: wallets,
            };

            setFollowers([...followers, newFollower]);
            setNewFollowerToken('');
            setNewFollowerName('');
            showNotification('success', `Follower ${newFollower.name} added successfully`);
        } catch (error) {
            showNotification(
                'error',
                `Failed to add follower: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            setIsLoading(false);
        }
    };

    // Trader Mode: Remove Follower
    const removeFollower = (loginid: string) => {
        if (confirm(`Remove follower ${loginid}?`)) {
            setFollowers(followers.filter(f => f.loginid !== loginid));
            showNotification('success', 'Follower removed');
        }
    };

    const updateFollowerWallet = (loginid: string, walletId: string) => {
        setFollowers(followers.map(f => (f.loginid === loginid ? { ...f, selectedWallet: walletId } : f)));
    };

    const updateFollowerCopyMode = (loginid: string, mode: 'demo-to-demo' | 'real-to-real') => {
        setFollowers(followers.map(f => (f.loginid === loginid ? { ...f, copyMode: mode } : f)));
        showNotification('success', `Copy mode updated to ${mode}`);
    };

    const startCopyTrading = async () => {
        if (!activeAccount) {
            showNotification('error', 'No active account selected');
            return;
        }

        if (userRole === 'follower' && !traderToken.trim()) {
            showNotification('error', 'Please enter trader token');
            return;
        }

        if (copyMode === 'demo-to-real') {
            const confirmed = confirm(
                'WARNING: You are about to enable Demo-to-Real copy mode. Trades in demo will affect REAL accounts. Continue?'
            );
            if (!confirmed) return;
        }

        if (copyMode === 'real-to-real') {
            const confirmed = confirm(
                'WARNING: You are about to enable Real-to-Real copy mode. Real trades will be copied to your real account. Continue?'
            );
            if (!confirmed) return;
        }

        setIsLoading(true);
        try {
            if (userRole === 'follower') {
                const { name } = await fetchAccountDetails(traderToken.trim());
                setTraderName(name);
            }

            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                console.log('[v0] WebSocket not ready, connecting...');
                connectWebSocket(activeAccount.token);

                await new Promise(resolve => {
                    const checkConnection = setInterval(() => {
                        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                            clearInterval(checkConnection);
                            resolve(true);
                        }
                    }, 100);

                    setTimeout(() => {
                        clearInterval(checkConnection);
                        resolve(false);
                    }, 5000);
                });
            }

            const request = {
                copy_start: userRole === 'trader' ? activeAccount.loginid : traderToken.trim(),
                copy_mode: copyMode,
                selected_wallet: selectedWallet,
                req_id: Date.now(),
            };
            wsRef.current?.send(JSON.stringify(request));
            addApiLog('request', request);

            if (balanceCheckIntervalRef.current) clearInterval(balanceCheckIntervalRef.current);
            balanceCheckIntervalRef.current = setInterval(fetchBalance, 2000);

            showNotification('success', 'Copy trading started');
        } catch (error) {
            showNotification(
                'error',
                `Failed to start copy trading: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            setIsLoading(false);
        }
    };

    // Stop Copy Trading
    const stopCopyTrading = async () => {
        if (!activeAccount) return;

        setIsLoading(true);
        try {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                connectWebSocket(activeAccount.token);
            }

            const request = {
                copy_stop: 1,
                trader_loginid: userRole === 'trader' ? activeAccount.loginid : traderToken.trim(),
                req_id: Date.now(),
            };
            wsRef.current?.send(JSON.stringify(request));
            addApiLog('request', request);

            if (balanceCheckIntervalRef.current) clearInterval(balanceCheckIntervalRef.current);
            showNotification('success', 'Copy trading stopped');
        } catch (error) {
            showNotification(
                'error',
                `Failed to stop copy trading: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            setIsLoading(false);
        }
    };

    // Role Selection Screen
    if (!userRole) {
        return (
            <div className={styles.container}>
                <div className={styles.roleSelectionCard}>
                    <div className={styles.roleHeader}>
                        <h1>Mesoflix Copy Trading</h1>
                        <p>Select your role to get started</p>
                    </div>

                    <div className={styles.roleGrid}>
                        <div className={styles.roleOption} onClick={() => setUserRole('trader')}>
                            <div className={styles.roleIcon}>👨‍💼</div>
                            <h2>Trader Mode</h2>
                            <p>Broadcast your trades to followers</p>
                            <ul className={styles.roleFeatures}>
                                <li>✓ Manage multiple followers</li>
                                <li>✓ Demo-to-Demo only</li>
                                <li>✓ Wallet selection per follower</li>
                            </ul>
                        </div>

                        <div className={styles.roleOption} onClick={() => setUserRole('follower')}>
                            <div className={styles.roleIcon}>📊</div>
                            <h2>Follower Mode</h2>
                            <p>Copy trades from expert traders</p>
                            <ul className={styles.roleFeatures}>
                                <li>✓ Automatic trade mirroring</li>
                                <li>✓ Demo-to-Demo & Real-to-Real</li>
                                <li>✓ Real-time synchronization</li>
                            </ul>
                        </div>

                        <div className={styles.roleOption} onClick={() => setUserRole('personal')}>
                            <div className={styles.roleIcon}>💼</div>
                            <h2>Personal Account</h2>
                            <p>Manage your own account trading</p>
                            <ul className={styles.roleFeatures}>
                                <li>✓ Demo-to-Real mirroring</li>
                                <li>✓ Full account control</li>
                                <li>✓ Real-time balance updates</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Notification */}
            {notification && (
                <div className={`${styles.notification} ${styles[`notification-${notification.type}`]}`}>
                    {notification.message}
                </div>
            )}

            <div className={styles.card}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerContent}>
                        <div>
                            <h1>Copy Trading Dashboard</h1>
                            <p className={styles.roleLabel}>
                                {userRole === 'trader'
                                    ? '👨‍💼 Trader Mode'
                                    : userRole === 'follower'
                                      ? '📊 Follower Mode'
                                      : '💼 Personal Account'}
                            </p>
                            {accountName && <p className={styles.accountNameDisplay}>Account: {accountName}</p>}
                        </div>
                        <div className={styles.connectionStatusContainer}>
                            <div className={styles.connectionStatus}>
                                <div
                                    className={`${styles.statusIndicator} ${wsConnected ? styles.connected : wsConnecting ? styles.syncing : styles.disconnected}`}
                                ></div>
                                <span>
                                    {wsConnected ? 'Connected' : wsConnecting ? 'Connecting...' : 'Disconnected'}
                                </span>
                            </div>
                            {wsConnected && ping !== null && (
                                <div className={styles.pingIndicator}>
                                    <span className={styles.wifiIcon}>📶</span>
                                    <span className={styles.pingValue}>{ping}ms</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <p className={styles.subtitle}>
                        {userRole === 'trader'
                            ? 'Manage followers and broadcast trades in real-time'
                            : userRole === 'follower'
                              ? 'Automatically copy trades from expert traders'
                              : 'Control your personal account trading'}
                    </p>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`${styles.tabButton} ${activeTab === 'overview' ? styles.activeTab : ''}`}
                    >
                        Overview
                    </button>
                    {userRole === 'trader' && (
                        <button
                            onClick={() => setActiveTab('followers')}
                            className={`${styles.tabButton} ${activeTab === 'followers' ? styles.activeTab : ''}`}
                        >
                            Followers ({followers.length})
                        </button>
                    )}
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`${styles.tabButton} ${activeTab === 'settings' ? styles.activeTab : ''}`}
                    >
                        Settings
                    </button>
                    <button
                        onClick={() => setActiveTab('response')}
                        className={`${styles.tabButton} ${activeTab === 'response' ? styles.activeTab : ''}`}
                    >
                        API Response ({apiLogs.length})
                    </button>
                    <button
                        onClick={() => setUserRole(null)}
                        className={`${styles.tabButton} ${styles.switchRoleButton}`}
                    >
                        Switch Role
                    </button>
                </div>

                {/* Content */}
                <div className={styles.content}>
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className={styles.controlsContainer}>
                            {/* Account Overview */}
                            <div className={styles.section}>
                                <h2>Account Overview</h2>
                                {activeAccount ? (
                                    <div className={styles.accountCard}>
                                        <div className={styles.accountRow}>
                                            <span className={styles.label}>Account Name:</span>
                                            <span className={styles.value}>{accountName || activeAccount.loginid}</span>
                                        </div>
                                        <div className={styles.accountRow}>
                                            <span className={styles.label}>Login ID:</span>
                                            <span className={styles.value}>{activeAccount.loginid}</span>
                                        </div>
                                        <div className={styles.accountRow}>
                                            <span className={styles.label}>Balance:</span>
                                            <span className={styles.value}>
                                                {accountBalance !== null
                                                    ? `${accountBalance.toFixed(2)} ${activeAccount.currency}`
                                                    : 'Loading...'}
                                            </span>
                                        </div>
                                        <div className={styles.accountRow}>
                                            <span className={styles.label}>Currency:</span>
                                            <span className={styles.value}>{activeAccount.currency}</span>
                                        </div>
                                        <div className={styles.accountRow}>
                                            <span className={styles.label}>Copy Status:</span>
                                            <span
                                                className={`${styles.value} ${isCopyingActive ? styles.active : styles.inactive}`}
                                            >
                                                {isCopyingActive ? '🟢 Active' : '🔴 Inactive'}
                                            </span>
                                        </div>
                                        {isCopyingActive && (
                                            <div className={styles.accountRow}>
                                                <span className={styles.label}>Copy Mode:</span>
                                                <span className={styles.value}>{copyMode}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className={styles.noData}>No account available. Please authorize first.</p>
                                )}
                            </div>

                            {(userRole === 'follower' || userRole === 'personal') && userWallets.length > 0 && (
                                <div className={styles.section}>
                                    <h2>Select Wallet</h2>
                                    <div className={styles.walletGrid}>
                                        {userWallets.map(wallet => (
                                            <div
                                                key={wallet.id}
                                                className={`${styles.walletCard} ${selectedWallet === wallet.id ? styles.selected : ''}`}
                                                onClick={() => setSelectedWallet(wallet.id)}
                                            >
                                                <div className={styles.walletType}>
                                                    {wallet.type === 'demo' ? '📋' : '💰'}
                                                </div>
                                                <h3>{wallet.name}</h3>
                                                <p className={styles.walletBalance}>{wallet.balance.toFixed(2)}</p>
                                                <p className={styles.walletType}>{wallet.type}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Copy Trading Controls */}
                            <div className={styles.section}>
                                <h2>Copy Trading Controls</h2>

                                <div className={styles.formGroup}>
                                    <label>Copy Mode</label>
                                    <div className={styles.modeSelectorWrapper}>
                                        <div className={styles.modeSelector}>
                                            {userRole === 'trader' && (
                                                <button
                                                    className={`${styles.modeButton} ${copyMode === 'demo-to-demo' ? styles.active : ''}`}
                                                    onClick={() => setCopyMode('demo-to-demo')}
                                                >
                                                    📋 Demo-to-Demo
                                                </button>
                                            )}

                                            {userRole === 'follower' && (
                                                <>
                                                    <button
                                                        className={`${styles.modeButton} ${copyMode === 'demo-to-demo' ? styles.active : ''}`}
                                                        onClick={() => setCopyMode('demo-to-demo')}
                                                    >
                                                        📋 Demo-to-Demo
                                                    </button>
                                                    <button
                                                        className={`${styles.modeButton} ${copyMode === 'real-to-real' ? styles.active : ''}`}
                                                        onClick={() => setCopyMode('real-to-real')}
                                                    >
                                                        💰 Real-to-Real
                                                    </button>
                                                </>
                                            )}

                                            {userRole === 'personal' && (
                                                <>
                                                    <button
                                                        className={`${styles.modeButton} ${copyMode === 'demo-to-demo' ? styles.active : ''}`}
                                                        onClick={() => setCopyMode('demo-to-demo')}
                                                    >
                                                        📋 Demo-to-Demo
                                                    </button>
                                                    <button
                                                        className={`${styles.modeButton} ${copyMode === 'demo-to-real' ? styles.active : ''}`}
                                                        onClick={() => setCopyMode('demo-to-real')}
                                                    >
                                                        💰 Demo-to-Real
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <p className={styles.helperText}>
                                        {copyMode === 'demo-to-demo'
                                            ? 'Trades in demo will be copied to demo account'
                                            : copyMode === 'demo-to-real'
                                              ? 'Trades in demo will be copied to your real account'
                                              : 'Real trades will be copied to your real account'}
                                    </p>
                                </div>

                                {userRole === 'follower' && (
                                    <div className={styles.formGroup}>
                                        <label>Trader Token</label>
                                        <input
                                            type='password'
                                            className={styles.input}
                                            placeholder="Enter trader's API token"
                                            value={traderToken}
                                            onChange={e => setTraderToken(e.target.value)}
                                        />
                                        {traderName && <p className={styles.helperText}>Trader: {traderName}</p>}
                                    </div>
                                )}

                                <div className={styles.actionButtons}>
                                    <button
                                        onClick={startCopyTrading}
                                        disabled={isLoading || !activeAccount}
                                        className={`${styles.button} ${styles.primaryButton}`}
                                    >
                                        {isLoading ? (
                                            <>
                                                <div className={styles.spinner}></div>
                                                Starting...
                                            </>
                                        ) : (
                                            '▶ Start Copy Trading'
                                        )}
                                    </button>
                                    <button
                                        onClick={stopCopyTrading}
                                        disabled={isLoading || !isCopyingActive}
                                        className={`${styles.button} ${styles.dangerButton}`}
                                    >
                                        ⏹ Stop Copy Trading
                                    </button>
                                </div>
                            </div>

                            {/* Status Grid */}
                            <div className={styles.section}>
                                <h2>Connection Status</h2>
                                <div className={styles.statusGrid}>
                                    <div className={styles.statusCard}>
                                        <div className={styles.statusRow}>
                                            <div
                                                className={`${styles.statusIndicator} ${wsConnected ? styles.connected : wsConnecting ? styles.syncing : styles.disconnected}`}
                                            ></div>
                                            <span>WebSocket</span>
                                        </div>
                                        <p>
                                            {wsConnected
                                                ? 'Connected to trading server'
                                                : wsConnecting
                                                  ? 'Connecting...'
                                                  : 'Disconnected'}
                                        </p>
                                    </div>
                                    <div className={styles.statusCard}>
                                        <div className={styles.statusRow}>
                                            <div
                                                className={`${styles.statusIndicator} ${activeAccount ? styles.connected : styles.warning}`}
                                            ></div>
                                            <span>Account Auth</span>
                                        </div>
                                        <p>{activeAccount ? `Authorized as ${accountName}` : 'Not authorized'}</p>
                                    </div>
                                    <div className={styles.statusCard}>
                                        <div className={styles.statusRow}>
                                            <div
                                                className={`${styles.statusIndicator} ${isCopyingActive ? styles.connected : styles.disconnected}`}
                                            ></div>
                                            <span>Copy Status</span>
                                        </div>
                                        <p>{isCopyingActive ? 'Copying active' : 'Copying inactive'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Followers Tab (Trader Mode) */}
                    {activeTab === 'followers' && userRole === 'trader' && (
                        <div className={styles.controlsContainer}>
                            <div className={styles.section}>
                                <h2>Add New Follower</h2>
                                <div className={styles.formGroup}>
                                    <label>Follower API Token</label>
                                    <input
                                        type='password'
                                        className={styles.input}
                                        placeholder="Enter follower's API token"
                                        value={newFollowerToken}
                                        onChange={e => setNewFollowerToken(e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Follower Name (Optional)</label>
                                    <input
                                        type='text'
                                        className={styles.input}
                                        placeholder='Enter a name for this follower'
                                        value={newFollowerName}
                                        onChange={e => setNewFollowerName(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={addFollower}
                                    disabled={isLoading}
                                    className={`${styles.button} ${styles.primaryButton}`}
                                >
                                    {isLoading ? 'Adding...' : '+ Add Follower'}
                                </button>
                            </div>

                            <div className={styles.section}>
                                <h2>Connected Followers</h2>
                                {followers.length > 0 ? (
                                    <div className={styles.followersList}>
                                        {followers.map(follower => (
                                            <div key={follower.loginid} className={styles.followerCard}>
                                                <div className={styles.followerHeader}>
                                                    <div>
                                                        <h3>{follower.name || follower.loginid}</h3>
                                                        <p className={styles.followerStatus}>
                                                            <span
                                                                className={`${styles.statusIndicator} ${styles[follower.status]}`}
                                                            ></span>
                                                            {follower.status.charAt(0).toUpperCase() +
                                                                follower.status.slice(1)}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => removeFollower(follower.loginid)}
                                                        className={styles.deleteButton}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                {follower.wallets && follower.wallets.length > 0 && (
                                                    <div className={styles.followerWallets}>
                                                        <label>Select Wallet:</label>
                                                        <div className={styles.walletOptions}>
                                                            {follower.wallets.map(wallet => (
                                                                <button
                                                                    key={wallet.id}
                                                                    className={`${styles.walletOption} ${
                                                                        follower.selectedWallet === wallet.id
                                                                            ? styles.selected
                                                                            : ''
                                                                    }`}
                                                                    onClick={() =>
                                                                        updateFollowerWallet(
                                                                            follower.loginid,
                                                                            wallet.id
                                                                        )
                                                                    }
                                                                >
                                                                    {wallet.type === 'demo' ? '📋' : '💰'} {wallet.name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className={styles.followerMode}>
                                                    <label>Copy Mode:</label>
                                                    <div className={styles.modeOptions}>
                                                        <button
                                                            className={`${styles.modeOption} ${
                                                                follower.copyMode === 'demo-to-demo'
                                                                    ? styles.selected
                                                                    : ''
                                                            }`}
                                                            onClick={() =>
                                                                updateFollowerCopyMode(follower.loginid, 'demo-to-demo')
                                                            }
                                                        >
                                                            📋 Demo-to-Demo
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className={styles.followerDetails}>
                                                    <div>
                                                        <span className={styles.label}>Balance:</span>
                                                        <span className={styles.value}>
                                                            {follower.balance?.toFixed(2) || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className={styles.label}>Last Sync:</span>
                                                        <span className={styles.value}>
                                                            {follower.lastSync
                                                                ? new Date(follower.lastSync).toLocaleTimeString()
                                                                : 'Never'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={styles.noData}>No followers connected yet. Add one to get started!</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Settings Tab */}
                    {activeTab === 'settings' && (
                        <div className={styles.controlsContainer}>
                            <div className={styles.section}>
                                <h2>Copy Trading Settings</h2>
                                {userRole === 'personal' && (
                                    <div className={styles.settingItem}>
                                        <div className={styles.settingLabel}>
                                            <h3>Demo-to-Real Mode</h3>
                                            <p>Mirror trades from demo to real account</p>
                                        </div>
                                        <label className={styles.toggle}>
                                            <input
                                                type='checkbox'
                                                checked={demoToRealMode}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        const confirmed = confirm(
                                                            'WARNING: Enabling Demo-to-Real mode will mirror trades to your REAL account. This involves real money. Continue?'
                                                        );
                                                        if (confirmed) setDemoToRealMode(true);
                                                    } else {
                                                        setDemoToRealMode(false);
                                                    }
                                                }}
                                            />
                                            <span className={styles.toggleSlider}></span>
                                        </label>
                                    </div>
                                )}

                                <div className={styles.settingItem}>
                                    <div className={styles.settingLabel}>
                                        <h3>Auto-Reconnect</h3>
                                        <p>Automatically reconnect on connection loss</p>
                                    </div>
                                    <label className={styles.toggle}>
                                        <input type='checkbox' defaultChecked />
                                        <span className={styles.toggleSlider}></span>
                                    </label>
                                </div>
                            </div>

                            <div className={styles.section}>
                                <h2>Account Management</h2>
                                <div className={styles.accountsList}>
                                    {accounts.map(account => (
                                        <div
                                            key={account.loginid}
                                            className={`${styles.accountItem} ${activeAccount?.loginid === account.loginid ? styles.active : ''}`}
                                            onClick={() => setActiveAccount(account)}
                                        >
                                            <div className={styles.accountItemContent}>
                                                <h4>{account.loginid}</h4>
                                                <p>{account.currency}</p>
                                            </div>
                                            {activeAccount?.loginid === account.loginid && (
                                                <span className={styles.checkmark}>✓</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* API Response Tab */}
                    {activeTab === 'response' && (
                        <div className={styles.responseContainer}>
                            <div className={styles.responseHeader}>
                                <h2>API Response Log ({apiLogs.length})</h2>
                                <button
                                    onClick={() => setApiLogs([])}
                                    className={`${styles.button} ${styles.primaryButton}`}
                                    style={{ minWidth: 'auto', padding: '8px 16px', fontSize: '12px' }}
                                >
                                    Clear Logs
                                </button>
                            </div>

                            {apiLogs.length > 0 ? (
                                <div className={styles.apiLogsList}>
                                    {apiLogs.map(log => (
                                        <div
                                            key={log.id}
                                            className={`${styles.apiLogItem} ${styles[`log-${log.type}`]}`}
                                        >
                                            <div className={styles.logHeader}>
                                                <span className={styles.logType}>{log.type.toUpperCase()}</span>
                                                <span className={styles.logTime}>{log.timestamp}</span>
                                                <button
                                                    onClick={() => copyToClipboard(log.data)}
                                                    className={styles.copyButton}
                                                    title='Copy to clipboard'
                                                >
                                                    📋 Copy
                                                </button>
                                            </div>
                                            <pre className={styles.logContent}>{JSON.stringify(log.data, null, 2)}</pre>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className={styles.noData}>No API calls yet. Start copy trading to see logs.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <p>Mesoflix Copy Trading • Use with caution • Not financial advice</p>
                </div>
            </div>
        </div>
    );
};

export default CopyTradingPage;
