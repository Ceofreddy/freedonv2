"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import styles from "./analysis.module.css"

interface Tick {
  time: number
  quote: number
}

interface SymbolData {
  allow_forward_starting: number
  display_name: string
  display_order: number
  exchange_is_open: number
  is_trading_suspended: number
  market: string
  market_display_name: string
  pip: number
  subgroup: string
  subgroup_display_name: string
  submarket: string
  submarket_display_name: string
  symbol: string
  symbol_type: string
}

interface GroupedSymbols {
  volatility: SymbolData[]
  jump: SymbolData[]
  other: SymbolData[]
}

const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089"

const Analysis: React.FC = () => {
  const [tickHistory, setTickHistory] = useState<Tick[]>([])
  const getInitialSymbol = () => localStorage.getItem("selectedSymbol") || "R_10"
  const [currentSymbol, setCurrentSymbol] = useState(getInitialSymbol())
  const tickCount = 1000
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const derivWsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [symbolsList, setSymbolsList] = useState<SymbolData[]>([])
  const [groupedSymbols, setGroupedSymbols] = useState<GroupedSymbols>({
    volatility: [],
    jump: [],
    other: [],
  })
  const [showMore, setShowMore] = useState(false)
  const [pipSize, setPipSize] = useState(2)
  const currentlySubscribedSymbolRef = useRef<string | null>(null)
  const tickHistoryRef = useRef<Tick[]>([])

  useEffect(() => {
    connectWebSocket()
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (derivWsRef.current) derivWsRef.current.close()
    }
  }, [])

  useEffect(() => {
    tickHistoryRef.current = tickHistory
  }, [tickHistory])

  const connectWebSocket = () => {
    if (derivWsRef.current) {
      derivWsRef.current.onclose = null
      derivWsRef.current.close()
    }

    const ws = new window.WebSocket(WS_URL)
    derivWsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      ws.send(
        JSON.stringify({
          active_symbols: "brief",
          product_type: "basic",
        }),
      )
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.msg_type === "active_symbols") {
        const { active_symbols } = data
        const volatilitySymbols = active_symbols.filter(
          (symbol: SymbolData) =>
            symbol.subgroup === "synthetics" &&
            (symbol.market === "synthetic_index" || symbol.market === "volatility_indices"),
        )

        const extractVolatilityLevel = (name: string): number => {
          const match = name.match(/\d+/)
          return match ? Number.parseInt(match[0], 10) : 0
        }

        volatilitySymbols.sort((a: SymbolData, b: SymbolData) => {
          const levelA = extractVolatilityLevel(a.display_name)
          const levelB = extractVolatilityLevel(b.display_name)
          return levelA - levelB
        })

        setSymbolsList(volatilitySymbols)

        const volatilityGroup: SymbolData[] = []
        const jumpGroup: SymbolData[] = []
        const otherGroup: SymbolData[] = []

        volatilitySymbols.forEach((symbol) => {
          const name = symbol.display_name.toLowerCase()
          if (name.includes("jump")) {
            jumpGroup.push(symbol)
          } else if (name.includes("volatility") || name.includes("vol") || symbol.market === "volatility_indices") {
            volatilityGroup.push(symbol)
          } else {
            otherGroup.push(symbol)
          }
        })

        setGroupedSymbols({
          volatility: volatilityGroup,
          jump: jumpGroup,
          other: otherGroup,
        })

        if (volatilitySymbols.length > 0 && currentlySubscribedSymbolRef.current === null) {
          const symbolToUse = volatilitySymbols.find((s) => s.symbol === getInitialSymbol())
            ? getInitialSymbol()
            : volatilitySymbols[0].symbol
          ws.send(
            JSON.stringify({
              ticks_history: symbolToUse,
              count: tickCount,
              end: "latest",
              style: "ticks",
              subscribe: 1,
            }),
          )
          currentlySubscribedSymbolRef.current = symbolToUse
        }
      }

      if (data.history) {
        const newTickHistory = data.history.prices.map((price: string, index: number) => ({
          time: data.history.times[index],
          quote: Number.parseFloat(price),
        }))
        setTickHistory(newTickHistory)
        detectDecimalPlaces(newTickHistory)
        if (data.pip_size !== undefined) {
          setPipSize(data.pip_size)
        }
      } else if (data.tick) {
        if (data.tick.symbol === currentlySubscribedSymbolRef.current) {
          const tickQuote = Number.parseFloat(data.tick.quote)
          setTickHistory((prev) => {
            const updated = [...prev, { time: data.tick.epoch, quote: tickQuote }]
            return updated.length > tickCount ? updated.slice(-tickCount) : updated
          })
          if (data.tick.pip_size !== undefined) {
            setPipSize(data.tick.pip_size)
          }
        }
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket()
      }, 2000)
    }

    ws.onerror = () => {
      setIsConnected(false)
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket()
      }, 2000)
    }
  }

  const requestTickHistory = (symbol: string) => {
    if (derivWsRef.current && derivWsRef.current.readyState === WebSocket.OPEN) {
      if (currentlySubscribedSymbolRef.current && currentlySubscribedSymbolRef.current !== symbol) {
        derivWsRef.current.send(
          JSON.stringify({
            forget: currentlySubscribedSymbolRef.current,
          }),
        )
      }

      const request = {
        ticks_history: symbol,
        count: tickCount,
        end: "latest",
        style: "ticks",
        subscribe: 1,
      }
      derivWsRef.current.send(JSON.stringify(request))
      currentlySubscribedSymbolRef.current = symbol
      setTickHistory([])
    }
  }

  const detectDecimalPlaces = (history: Tick[]) => {
    if (history.length === 0) return
    const decimalCounts = history.map((tick) => {
      const priceStr = tick.quote.toFixed(10)
      const decimalPart = priceStr.split(".")[1] || ""
      const trimmed = decimalPart.replace(/0+$/, "")
      return trimmed.length
    })
    const maxDecimals = Math.max(...decimalCounts, 2)
    setDecimalPlaces(Math.min(maxDecimals, 5))
  }

  const getLastDigit = (price: number): number => {
    const priceStr = price.toFixed(pipSize)
    const lastChar = priceStr.slice(-1)
    return Number.parseInt(lastChar, 10)
  }

  const getDigitAnalysis = () => {
    const digitCounts = new Array(10).fill(0)
    tickHistory.forEach((tick) => {
      const lastDigit = getLastDigit(tick.quote)
      digitCounts[lastDigit]++
    })
    return digitCounts.map((count) => (count / tickHistory.length) * 100)
  }

  const getEvenOddAnalysis = () => {
    const digitCounts = new Array(10).fill(0)
    tickHistory.forEach((tick) => {
      const lastDigit = getLastDigit(tick.quote)
      digitCounts[lastDigit]++
    })
    const evenCount = digitCounts.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)
    const oddCount = digitCounts.filter((_, i) => i % 2 !== 0).reduce((a, b) => a + b, 0)
    const total = evenCount + oddCount
    return {
      even: total > 0 ? (evenCount / total) * 100 : 0,
      odd: total > 0 ? (oddCount / total) * 100 : 0,
    }
  }

  const getRiseFallAnalysis = () => {
    let riseCount = 0,
      fallCount = 0
    for (let i = 1; i < tickHistory.length; i++) {
      if (tickHistory[i].quote > tickHistory[i - 1].quote) riseCount++
      else if (tickHistory[i].quote < tickHistory[i - 1].quote) fallCount++
    }
    const total = riseCount + fallCount
    return {
      rise: total > 0 ? (riseCount / total) * 100 : 0,
      fall: total > 0 ? (fallCount / total) * 100 : 0,
    }
  }

  const getSelectedDigitAnalysis = () => {
    if (selectedDigit === null) return { over: 0, under: 0, equal: 0 }
    let overCount = 0,
      underCount = 0,
      equalCount = 0
    tickHistory.forEach((tick) => {
      const lastDigit = getLastDigit(tick.quote)
      if (lastDigit > selectedDigit) overCount++
      else if (lastDigit < selectedDigit) underCount++
      else equalCount++
    })
    const total = tickHistory.length
    return {
      over: total > 0 ? (overCount / total) * 100 : 0,
      under: total > 0 ? (underCount / total) * 100 : 0,
      equal: total > 0 ? (equalCount / total) * 100 : 0,
    }
  }

  const handleSymbolChange = (newSymbol: string) => {
    setCurrentSymbol(newSymbol)
    localStorage.setItem("selectedSymbol", newSymbol)
    setTickHistory([])
    setTimeout(() => {
      requestTickHistory(newSymbol)
    }, 300)
  }

  const digitAnalysis = getDigitAnalysis()
  const evenOddAnalysis = getEvenOddAnalysis()
  const riseFallAnalysis = getRiseFallAnalysis()
  const selectedDigitAnalysis = getSelectedDigitAnalysis()
  const currentPrice = tickHistory.length > 0 ? tickHistory[tickHistory.length - 1].quote : null
  const currentDigit = currentPrice ? getLastDigit(currentPrice) : null
  const maxPercentage = Math.max(...digitAnalysis)
  const minPercentage = Math.min(...digitAnalysis.filter((p) => p > 0))

  const allLastDigits = tickHistory.map((tick) => getLastDigit(tick.quote))
  const displayCount = showMore ? 100 : 50
  const lastDisplayedDigits = allLastDigits.slice(-displayCount)

  return (
    <div className={styles.analysisContainer}>
      <main className={styles.analysisMa}>
        {/* Current Price with Market Selector */}
        <section className={styles.priceSection}>
          <div className={styles.priceContent}>
            <div className={styles.currentPrice}>{currentPrice ? currentPrice.toFixed(pipSize) : "N/A"}</div>
            <div className={styles.priceLabel}>Current Price</div>
          </div>
          <div className={styles.marketSelector}>
            <select
              value={currentSymbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              className={styles.symbolSelect}
            >
              {groupedSymbols.volatility.length > 0 && (
                <>
                  <optgroup label="VOLATILITY MARKETS">
                    {groupedSymbols.volatility.map((option) => (
                      <option key={option.symbol} value={option.symbol}>
                        {option.display_name}
                      </option>
                    ))}
                  </optgroup>
                </>
              )}
              {groupedSymbols.jump.length > 0 && (
                <>
                  <optgroup label="JUMP INDICES">
                    {groupedSymbols.jump.map((option) => (
                      <option key={option.symbol} value={option.symbol}>
                        {option.display_name}
                      </option>
                    ))}
                  </optgroup>
                </>
              )}
              {groupedSymbols.other.length > 0 && (
                <>
                  <optgroup label="OTHER MARKETS">
                    {groupedSymbols.other.map((option) => (
                      <option key={option.symbol} value={option.symbol}>
                        {option.display_name}
                      </option>
                    ))}
                  </optgroup>
                </>
              )}
              {symbolsList.length === 0 && <option value="R_10">Loading Markets...</option>}
            </select>
            <div className={styles.selectorLabel}>Market</div>
          </div>
        </section>

        {/* Digit Analysis */}
        <section className={styles.analysisSection}>
          <h2 className={styles.sectionTitle}>Digit Distribution</h2>
          <div className={styles.digitGrid}>
            {digitAnalysis.map((percentage, digit) => {
              const isLowest = percentage === minPercentage && percentage > 0
              const isHighest = percentage === maxPercentage && percentage > 0
              const fillPercentage = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0
              return (
                <div key={digit} className={styles.digitContainer}>
                  {digit === currentDigit && <div className={styles.currentIndicator}>▼</div>}
                  <div className={styles.digitCircleWrapper}>
                    <div className={styles.digitCircle}>
                      <svg className={styles.progressRing} viewBox="0 0 64 64">
                        <circle
                          className={styles.progressRingCircle}
                          cx="32"
                          cy="32"
                          r="26"
                          fill="none"
                          stroke={isLowest ? "#ef4444" : isHighest ? "#10b981" : "#374151"}
                          strokeWidth="4"
                          strokeDasharray={`${(fillPercentage / 100) * 163.4} 163.4`}
                          strokeLinecap="round"
                          transform="rotate(-90 32 32)"
                        />
                      </svg>
                      <div
                        className={`${styles.digitNumber} ${
                          digit === currentDigit
                            ? styles.current
                            : isLowest
                              ? styles.lowest
                              : isHighest
                                ? styles.highest
                                : ""
                        }`}
                      >
                        {digit}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`${styles.digitPercentage} ${
                      isLowest ? styles.lowest : isHighest ? styles.highest : ""
                    }`}
                  >
                    {percentage.toFixed(1)}%
                  </div>
                </div>
              )
            })}
          </div>
          <div className={styles.analysisStats}>
            Highest: <span className={styles.statHighest}>{maxPercentage.toFixed(2)}%</span> | Lowest:{" "}
            <span className={styles.statLowest}>{minPercentage.toFixed(2)}%</span>
          </div>
        </section>

        {/* Selected Digit Analysis */}
        <section className={styles.analysisSection}>
          <h2 className={styles.sectionTitle}>Digit Comparison</h2>
          <div className={styles.digitSelector}>
            <div className={styles.selectorLabel}>Select a digit to analyze:</div>
            <div className={styles.digitButtons}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  className={`${styles.digitBtn} ${selectedDigit === digit ? styles.selected : ""}`}
                  onClick={() => setSelectedDigit(digit)}
                >
                  {digit}
                </button>
              ))}
            </div>
          </div>
          {selectedDigit !== null && (
            <div className={styles.comparisonAnalysis}>
              <div className={styles.comparisonGrid}>
                <div className={`${styles.statCard} ${styles.over}`}>
                  <div className={styles.statValue}>{selectedDigitAnalysis.over.toFixed(1)}%</div>
                  <div className={styles.statLabel}>Over {selectedDigit}</div>
                </div>
                <div className={`${styles.statCard} ${styles.under}`}>
                  <div className={styles.statValue}>{selectedDigitAnalysis.under.toFixed(1)}%</div>
                  <div className={styles.statLabel}>Under {selectedDigit}</div>
                </div>
                <div className={`${styles.statCard} ${styles.equal}`}>
                  <div className={styles.statValue}>{selectedDigitAnalysis.equal.toFixed(1)}%</div>
                  <div className={styles.statLabel}>Equal {selectedDigit}</div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Even/Odd Analysis */}
        <section className={styles.analysisSection}>
          <h2 className={styles.sectionTitle}>Even/Odd Pattern</h2>
          <div className={styles.eoGrid}>
            <div className={`${styles.statCard} ${styles.even}`}>
              <div className={styles.statValue}>{evenOddAnalysis.even.toFixed(1)}%</div>
              <div className={styles.statLabel}>Even</div>
            </div>
            <div className={`${styles.statCard} ${styles.odd}`}>
              <div className={styles.statValue}>{evenOddAnalysis.odd.toFixed(1)}%</div>
              <div className={styles.statLabel}>Odd</div>
            </div>
          </div>
          <div className={styles.patternSection}>
            <h3 className={styles.patternTitle}>Last 50 Digits Pattern</h3>
            <div className={styles.patternGrid}>
              {lastDisplayedDigits.map((digit, index) => (
                <div key={index} className={`${styles.patternBox} ${digit % 2 === 0 ? styles.even : styles.odd}`}>
                  {digit % 2 === 0 ? "E" : "O"}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Rise/Fall Analysis */}
        <section className={styles.analysisSection}>
          <h2 className={styles.sectionTitle}>Market Movement</h2>
          <div className={styles.rfGrid}>
            <div className={`${styles.statCard} ${styles.rise}`}>
              <div className={styles.statValue}>{riseFallAnalysis.rise.toFixed(1)}%</div>
              <div className={styles.statLabel}>Rise</div>
            </div>
            <div className={`${styles.statCard} ${styles.fall}`}>
              <div className={styles.statValue}>{riseFallAnalysis.fall.toFixed(1)}%</div>
              <div className={styles.statLabel}>Fall</div>
            </div>
          </div>
        </section>

        {/* Last Digits Stream Table */}
        <section className={styles.analysisSection}>
          <h2 className={styles.sectionTitle}>Last Digits Stream</h2>
          <div className={styles.lastDigitsContainer}>
            <div className={styles.lastDigitsTable}>
              <div className={styles.digitsHeader}>
                <span className={styles.headerLabel}>Latest digits ({displayCount} showing)</span>
              </div>
              <div className={styles.digitsContent}>
                <div className={styles.digitsGrid}>
                  {lastDisplayedDigits.map((digit, index) => (
                    <div
                      key={index}
                      className={`${styles.digitItem} ${digit % 2 === 0 ? styles.evenDigit : styles.oddDigit} ${
                        index === lastDisplayedDigits.length - 1 ? styles.latest : ""
                      }`}
                      title={`Position ${displayCount - index}: ${digit}`}
                    >
                      <span className={styles.digitValue}>{digit}</span>
                      {index === lastDisplayedDigits.length - 1 && <span className={styles.latestIndicator}>●</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.digitsFooter}>
                <button className={styles.toggleBtn} onClick={() => setShowMore(!showMore)}>
                  {showMore ? "← Show Less (50)" : "Show More (100) →"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced Statistics */}
        <section className={styles.analysisSection}>
          <h2 className={styles.sectionTitle}>Statistics</h2>
          <div className={styles.statsGrid}>
            <div className={styles.statRow}>
              <span className={styles.statName}>Total Ticks:</span>
              <span className={styles.statData}>{tickHistory.length}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statName}>Pip Size:</span>
              <span className={styles.statData}>{pipSize}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default Analysis
