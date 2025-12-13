import React from 'react';

const FreedonLogo = ({ className }: { className?: string }) => (
    <div className={className} title="Freedon">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 100 100">
            <defs>
                <linearGradient id="freedonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00d2ff" />
                    <stop offset="100%" stopColor="#3a7bd5" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            <path
                d="M 20 20 H 80 L 80 30 H 35 L 35 45 H 70 L 70 55 H 35 L 35 80 H 20 Z"
                fill="url(#freedonGrad)"
                stroke="#ffffff"
                strokeWidth="2"
                filter="url(#glow)"
            />
            <path
                d="M 50 20 H 80 C 100 20 100 80 80 80 H 50 Z"
                fill="none"
                stroke="url(#freedonGrad)"
                strokeWidth="4"
                strokeDasharray="10 5"
                opacity="0.5"
            />
            <text x="50" y="95" textAnchor="middle" fontSize="10" fill="#ffffff" fontFamily="monospace" letterSpacing="2">FREEDON</text>
        </svg>
    </div>
);

export default FreedonLogo;
