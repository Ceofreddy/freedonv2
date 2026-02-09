import React, { lazy, Suspense } from 'react';
import ChunkLoader from '@/components/loader/chunk-loader';
import { Localize, localize } from '@deriv-com/translations';

// Import this in the main file if restoring
// const SpeedBot = lazy(() => import('../speedbot/speedbot'));

// Icon Definition
export const SpeedBotIcon = () => (
    <svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <defs>
            <linearGradient id='gradSpeed' x1='0%' y1='0%' x2='100%' y2='100%'>
                <stop offset='0%' stopColor='#2196f3' />
                <stop offset='100%' stopColor='#00bcd4' />
            </linearGradient>
        </defs>
        <path
            d='M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM12 9C11.45 9 11 8.55 11 8C11 7.45 11.45 7 12 7C12.55 7 13 7.45 13 8C13 8.55 12.55 9 12 9Z'
            fill='url(#gradSpeed)'
        />
        <path
            d='M15 15L17 12L15 9'
            stroke='url(#gradSpeed)'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
        />
    </svg>
);

// Tab Implementation to copy back into Tabs
/*
                        {/!* SpeedBot - Tab F (Shifted) *!/}
                        <div
                            label={
                                <>
                                    <SpeedBotIcon />
                                    <Localize i18n_default_text='SpeedBot' />
                                </>
                            }
                            id='id-speedbot'
                        >
                            <Suspense fallback={<ChunkLoader message={localize('Please wait, loading SpeedBot...')} />}>
                                <div style={fullPanelStyle}>
                                    <SpeedBot />
                                </div>
                            </Suspense>
                        </div>
*/
