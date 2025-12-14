import { useState } from 'react';

const RiskManagementCalculator = () => {
    const [capital, setCapital] = useState('');
    const [isCalculated, setIsCalculated] = useState(false);

    const calculateResults = () => {
        if (!capital || isNaN(capital) || capital <= 0) return;
        setIsCalculated(true);
    };

    const resetCalculator = () => {
        setCapital('');
        setIsCalculated(false);
    };

    const appendNumber = num => {
        setCapital(prev => (prev === '0' ? num.toString() : (prev || '') + num.toString()));
    };

    const deleteLast = () => {
        setCapital(prev => (prev.length > 1 ? prev.slice(0, -1) : ''));
    };

    return (
        <div
            style={{
                height: '80vh',
                width: '100vw',
                background: 'radial-gradient(circle at 10% 20%, rgba(42,48,82,0.9) 0%, rgba(10,14,44,0.9) 90%)',
                padding: '2rem',
                position: 'relative',
                overflowY: 'auto',
            }}
        >
            {/* Background elements */}
            <div
                style={{
                    position: 'absolute',
                    top: '20%',
                    left: '10%',
                    width: '400px',
                    height: '400px',
                    background: 'rgba(74, 95, 179, 0.15)',
                    borderRadius: '50%',
                    filter: 'blur(60px)',
                    animation: 'float 8s ease-in-out infinite',
                    zIndex: 0,
                }}
            ></div>
            <div
                style={{
                    position: 'absolute',
                    top: '60%',
                    right: '10%',
                    width: '300px',
                    height: '300px',
                    background: 'rgba(255, 68, 79, 0.15)',
                    borderRadius: '50%',
                    filter: 'blur(60px)',
                    animation: 'float 10s ease-in-out infinite 2s',
                    zIndex: 0,
                }}
            ></div>

            <div
                style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                    backgroundColor: 'rgba(42, 48, 82, 0.8)',
                    borderRadius: '20px',
                    padding: '2rem',
                    position: 'relative',
                    zIndex: 1,
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
                    backdropFilter: 'blur(10px)',
                }}
            >
                <h1
                    style={{
                        textAlign: 'center',
                        marginBottom: '2rem',
                        background: 'linear-gradient(90deg, #FFFFFF 0%, #E2E8F0 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontSize: '2.5rem',
                        fontWeight: '700',
                        position: 'relative',
                    }}
                >
                    Risk Management Calculator
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '-10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '100px',
                            height: '4px',
                            background: 'linear-gradient(90deg, #4A5FB3 0%, #4BB4B3 100%)',
                            borderRadius: '2px',
                        }}
                    ></div>
                </h1>

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: '2rem',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    }}
                >
                    {/* Input Column */}
                    <div
                        style={{
                            flex: '1 1 300px',
                            backgroundColor: 'rgba(30, 36, 64, 0.6)',
                            borderRadius: '16px',
                            padding: '2rem',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                            border: '1px solid rgba(255,255,255,0.05)',
                        }}
                    >
                        <label
                            style={{
                                display: 'block',
                                marginBottom: '1rem',
                                fontWeight: '600',
                                color: '#E2E8F0',
                                fontSize: '1rem',
                            }}
                        >
                            Enter Your Capital ($)
                        </label>
                        <div
                            style={{
                                padding: '1rem',
                                borderRadius: '10px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                fontSize: '1.5rem',
                                backgroundColor: 'rgba(255,255,255,0.05)',
                                marginBottom: '1.5rem',
                                textAlign: 'right',
                                fontWeight: '600',
                                color: '#FFFFFF',
                                height: '60px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                            }}
                        >
                            {capital ? `$${capital}` : '$0'}
                        </div>

                        {/* Keypad */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '10px',
                                marginBottom: '1.5rem',
                            }}
                        >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, '⌫'].map(item => (
                                <button
                                    key={item}
                                    onClick={() => (item === '⌫' ? deleteLast() : appendNumber(item))}
                                    style={{
                                        padding: '1rem',
                                        fontSize: '1.2rem',
                                        fontWeight: '600',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background:
                                            typeof item === 'number' || item === '.'
                                                ? 'rgba(255,255,255,0.1)'
                                                : 'rgba(255,68,79,0.2)',
                                        color: '#FFFFFF',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                    }}
                                    onMouseEnter={e =>
                                        (e.currentTarget.style.background =
                                            typeof item === 'number' || item === '.'
                                                ? 'rgba(255,255,255,0.2)'
                                                : 'rgba(255,68,79,0.3)')
                                    }
                                    onMouseLeave={e =>
                                        (e.currentTarget.style.background =
                                            typeof item === 'number' || item === '.'
                                                ? 'rgba(255,255,255,0.1)'
                                                : 'rgba(255,68,79,0.2)')
                                    }
                                >
                                    {item}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={calculateResults}
                                style={{
                                    flex: '1 1 45%',
                                    padding: '1rem',
                                    background: 'linear-gradient(135deg, #4A5FB3 0%, #4BB4B3 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 4px 15px rgba(74, 95, 179, 0.3)',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                            >
                                Calculate Risk
                            </button>
                            <button
                                onClick={resetCalculator}
                                style={{
                                    flex: '1 1 45%',
                                    padding: '1rem',
                                    background: 'linear-gradient(135deg, #FF444F 0%, #C0392B 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 4px 15px rgba(255, 68, 79, 0.3)',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {/* Results Column */}
                    <div
                        style={{
                            flex: '1 1 300px',
                            backgroundColor: 'rgba(30, 36, 64, 0.6)',
                            borderRadius: '16px',
                            padding: '2rem',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                            border: '1px solid rgba(255,255,255,0.05)',
                        }}
                    >
                        <h2
                            style={{
                                color: '#FFFFFF',
                                marginTop: '0',
                                marginBottom: '1.5rem',
                                textAlign: 'center',
                                fontSize: '1.5rem',
                                fontWeight: '600',
                            }}
                        >
                            Risk Management Plan
                        </h2>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '1rem',
                                marginBottom: '1.5rem',
                            }}
                        >
                            <ResultCard
                                title='Stake Amount'
                                value={isCalculated ? `$${(capital * 0.1).toFixed(2)}` : '$0.00'}
                                color='#4A5FB3'
                                icon='💰'
                            />
                            <ResultCard
                                title='Take Profit'
                                value={isCalculated ? `$${(capital * 3 * 0.1).toFixed(2)}` : '$0.00'}
                                color='#4BB4B3'
                                icon='🎯'
                            />
                            <ResultCard
                                title='Stop Loss'
                                value={isCalculated ? `$${(capital * 3 * 0.1).toFixed(2)}` : '$0.00'}
                                color='#FF444F'
                                icon='🛑'
                            />
                            <ResultCard title='Loss Protection' value='3 Trades' color='#A18CD1' icon='🛡️' />
                        </div>

                        <div
                            style={{
                                backgroundColor: 'rgba(255, 193, 7, 0.1)',
                                padding: '1.5rem',
                                borderRadius: '10px',
                                borderLeft: '4px solid rgba(255, 193, 7, 0.7)',
                                marginBottom: '1.5rem',
                            }}
                        >
                            <div
                                style={{
                                    color: '#E2E8F0',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    marginBottom: '0.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                <span>⚠️</span> Martingale Sequence (x2)
                            </div>
                            <div
                                style={{
                                    fontSize: '1.1rem',
                                    fontWeight: '600',
                                    color: '#FFFFFF',
                                    padding: '1rem',
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    textAlign: 'center',
                                    border: '1px dashed rgba(255, 193, 7, 0.3)',
                                }}
                            >
                                {isCalculated
                                    ? `${(capital * 0.02).toFixed(2)} → ${(capital * 0.04).toFixed(2)} → ${(capital * 0.08).toFixed(2)}`
                                    : 'Enter amount to calculate'}
                            </div>
                        </div>

                        <div
                            style={{
                                backgroundColor: 'rgba(74, 95, 179, 0.1)',
                                padding: '1.5rem',
                                borderRadius: '10px',
                                borderLeft: '4px solid #4A5FB3',
                            }}
                        >
                            <div
                                style={{
                                    color: '#E2E8F0',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                <span>💼</span> Required Capital Buffer
                            </div>
                            <div
                                style={{
                                    fontSize: '1.5rem',
                                    fontWeight: '700',
                                    color: '#FFFFFF',
                                    marginTop: '0.5rem',
                                }}
                            >
                                {isCalculated ? `$${(capital * 0.02 * 7).toFixed(2)}` : '$0.00'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-20px); }
                    100% { transform: translateY(0px); }
                }
            `}</style>
        </div>
    );
};

const ResultCard = ({ title, value, color, icon }) => {
    const rgb = hexToRgb(color);
    return (
        <div
            style={{
                backgroundColor: `rgba(${rgb},0.1)`,
                padding: '1rem',
                borderRadius: '10px',
                borderLeft: `4px solid ${color}`,
                transition: 'all 0.3s ease',
            }}
        >
            <div
                style={{
                    color: '#E2E8F0',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                }}
            >
                <span>{icon}</span> {title}
            </div>
            <div
                style={{
                    fontSize: '1.3rem',
                    fontWeight: '700',
                    color: '#FFFFFF',
                }}
            >
                {value}
            </div>
        </div>
    );
};

function hexToRgb(hex) {
    const bigint = parseInt(hex.replace('#', ''), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r},${g},${b}`;
}

export default RiskManagementCalculator;
