'use client';

import { useState, useEffect } from 'react'; // <-- Import React for hooks/components!
import { initSurvicate } from '../public-path';
import { lazy, Suspense } from 'react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import { StoreProvider } from '@/hooks/useStore';
import CallbackPage from '@/pages/callback';
import Endpoint from '@/pages/endpoint';
import type { TAuthData } from '@/types/api-types';
import { initializeI18n, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import './app-root.scss';

const Layout = lazy(() => import('../components/layout'));
const AppRoot = lazy(() => import('./app-root'));

const { TRANSLATIONS_CDN_URL, R2_PROJECT_NAME, CROWDIN_BRANCH_NAME } = process.env;
const i18nInstance = initializeI18n({
    cdnUrl: `${TRANSLATIONS_CDN_URL}/${R2_PROJECT_NAME}/${CROWDIN_BRANCH_NAME}`,
});

const TraderLoading = () => {
    const prices = [1.2345, 1.2352, 1.236, 1.2348, 1.2371, 1.2359, 1.2383, 1.2365, 1.2379, 1.2357];
    const [priceIndex, setPriceIndex] = useState(0);
    const [loadingProgress, setLoadingProgress] = useState(0);

    useEffect(() => {
        const priceInterval = setInterval(() => {
            setPriceIndex(prev => (prev + 1) % prices.length);
        }, 300);
        return () => clearInterval(priceInterval);
    }, [prices.length]);

    useEffect(() => {
        const progressInterval = setInterval(() => {
            setLoadingProgress(prev => {
                if (prev >= 95) return prev;
                return prev + Math.random() * 15;
            });
        }, 400);
        return () => clearInterval(progressInterval);
    }, []);

    return (
        <div className='trader-loader-root'>
            <div className='loader-container'>
                {/* Premium header */}
                <div className='loader-header'>
                    <div className='header-accent'></div>
                    <h1 className='loader-title'>TRADING PLATFORM</h1>
                </div>

                {/* Main graph card */}
                <div className='graph-area'>
                    <div className='graph-header'>
                        <span className='graph-label'>LIVE MARKET DATA</span>
                        <span className='graph-status'>● CONNECTED</span>
                    </div>

                    <div className='graph-lines'>
                        {/* Animated candlestick bars */}
                        {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className={`graph-bar graph-bar-${i}`}></div>
                        ))}

                        {/* Animated line chart */}
                        <svg
                            className='graph-polyline'
                            width='380'
                            height='100'
                            viewBox='0 0 380 100'
                            preserveAspectRatio='none'
                        >
                            <defs>
                                <linearGradient id='lineGradient' x1='0%' y1='0%' x2='100%' y2='0%'>
                                    <stop offset='0%' stopColor='#00D9FF' stopOpacity='0.8' />
                                    <stop offset='50%' stopColor='#00D9FF' stopOpacity='1' />
                                    <stop offset='100%' stopColor='#FF6B35' stopOpacity='0.8' />
                                </linearGradient>
                            </defs>
                            <polyline
                                points='0,70 20,55 40,75 60,40 80,65 100,30 120,60 140,25 160,70 180,50 200,75 220,40 240,65 260,30 280,60 300,25 320,70 340,50 360,75 380,40'
                                stroke='url(#lineGradient)'
                                strokeWidth='2.5'
                                fill='none'
                                vectorEffect='non-scaling-stroke'
                                style={{ filter: 'drop-shadow(0 0 12px #00D9FF)' }}
                            />
                        </svg>
                    </div>

                    {/* Ticker info */}
                    <div className='graph-footer'>
                        <div className='ticker-info'>
                            <span className='ticker-label'>EUR/USD</span>
                            <span className='ticker-price'>{prices[priceIndex].toFixed(4)}</span>
                        </div>
                        <div className='ticker-status'>
                            <span className='status-badge'>REAL-TIME</span>
                        </div>
                    </div>
                </div>

                {/* Loading progress bar */}
                <div className='progress-container'>
                    <div className='progress-bar'>
                        <div className='progress-fill' style={{ width: `${loadingProgress}%` }}></div>
                    </div>
                    <span className='progress-text'>Initializing trading engine...</span>
                </div>

                {/* Bottom text */}
                <div className='loader-footer'>
                    <p className='loader-subtitle'>Connecting to global markets</p>
                </div>
            </div>
        </div>
    );
};

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            path='/'
            element={
                <Suspense fallback={<TraderLoading />}>
                    <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
                        <StoreProvider>
                            <RoutePromptDialog />
                            <CoreStoreProvider>
                                <Layout />
                            </CoreStoreProvider>
                        </StoreProvider>
                    </TranslationProvider>
                </Suspense>
            }
        >
            <Route index element={<AppRoot />} />
            <Route path='endpoint' element={<Endpoint />} />
            <Route path='callback' element={<CallbackPage />} />
        </Route>
    )
);

function App() {
    useEffect(() => {
        initSurvicate();
        window?.dataLayer?.push({ event: 'page_load' });

        return () => {
            const survicateBox = document.getElementById('survicate-box');
            if (survicateBox) {
                survicateBox.style.display = 'none';
            }
        };
    }, []);

    useEffect(() => {
        const accountsList = localStorage.getItem('accountsList');
        const clientAccounts = localStorage.getItem('clientAccounts');
        const activeLoginid = localStorage.getItem('active_loginid');
        const urlParams = new URLSearchParams(window.location.search);
        const accountCurrency = urlParams.get('account');

        if (!accountsList || !clientAccounts) return;

        try {
            const parsedAccounts = JSON.parse(accountsList);
            const parsedClientAccounts = JSON.parse(clientAccounts) as TAuthData['account_list'];
            const isValidCurrency = accountCurrency
                ? Object.values(parsedClientAccounts).some(
                      account => account.currency.toUpperCase() === accountCurrency.toUpperCase()
                  )
                : false;

            const updateLocalStorage = (token: string, loginid: string) => {
                localStorage.setItem('authToken', token);
                localStorage.setItem('active_loginid', loginid);
            };

            // Handle demo account
            if (accountCurrency?.toUpperCase() === 'DEMO') {
                const demoAccount = Object.entries(parsedAccounts).find(([key]) => key.startsWith('VR'));

                if (demoAccount) {
                    const [loginid, token] = demoAccount;
                    updateLocalStorage(String(token), loginid);
                    return;
                }
            }

            // Handle real account with valid currency
            if (accountCurrency?.toUpperCase() !== 'DEMO' && isValidCurrency) {
                const realAccount = Object.entries(parsedClientAccounts).find(
                    ([loginid, account]) =>
                        !loginid.startsWith('VR') && account.currency.toUpperCase() === accountCurrency?.toUpperCase()
                );

                if (realAccount) {
                    const [loginid, account] = realAccount;
                    if ('token' in account) {
                        updateLocalStorage(String(account?.token), loginid);
                    }
                    return;
                }
            }
        } catch (e) {
            console.warn('Error parsing accounts:', e);
        }
    }, []);

    // ✅ Register the service worker (for PWA support)
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker
                    .register('/service-worker.js')
                    .then(registration => {
                        console.log('Service Worker registered with scope:', registration.scope);
                    })
                    .catch(error => {
                        console.log('Service Worker registration failed:', error);
                    });
            });
        }
    }, []);

    return <RouterProvider router={router} />;
}

export default App;
