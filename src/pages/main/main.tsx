"use client"

import React, { lazy, Suspense, useEffect, useState, useCallback } from "react"
import classNames from "classnames"
import { observer } from "mobx-react-lite"
import ChunkLoader from "@/components/loader/chunk-loader"
import DesktopWrapper from "@/components/shared_ui/desktop-wrapper"
import Dialog from "@/components/shared_ui/dialog"
import MobileWrapper from "@/components/shared_ui/mobile-wrapper"
import Tabs from "@/components/shared_ui/tabs/tabs"
import TradingViewModal from "@/components/trading-view-chart/trading-view-modal"
import { DBOT_TABS } from "@/constants/bot-contents"
import { api_base, updateWorkspaceName } from "@/external/bot-skeleton"
import { CONNECTION_STATUS } from "@/external/bot-skeleton/services/api/observables/connection-status-stream"
import { useApiBase } from "@/hooks/useApiBase"
import { useStore } from "@/hooks/useStore"
import { Localize, localize } from "@deriv-com/translations"
import { useDevice } from "@deriv-com/ui"
import RunPanel from "../../components/run-panel"
import ChartModal from "../chart/chart-modal"
import Dashboard from "../dashboard"
import RunStrategy from "../dashboard/run-strategy"

const Chart = lazy(() => import("../chart"))
const Tutorial = lazy(() => import("../tutorials"))
const Copytrading = lazy(() => import("../copytrading"))
const Dcircles = lazy(() => import("../analysis"))
const Advanced = lazy(() => import("../advanced"))

const TAB_LETTERS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]

const getTabLetterFromUrl = (): string | null => {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  return params.get("tab")
}

const updateUrlWithTab = (tabLetter: string) => {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("tab", tabLetter)
  window.history.replaceState({}, "", url.toString())
}

const FreeBotsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="url(#grad1)" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4AF37" stopOpacity="1" />
        <stop offset="100%" stopColor="#E6C869" stopOpacity="1" />
      </linearGradient>
    </defs>
    <rect x="4" y="6" width="16" height="12" rx="3" fill="url(#grad1)" />
    <line x1="12" y1="3" x2="12" y2="6" stroke="url(#grad1)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="2" r="1.5" fill="url(#grad1)" />
    <circle cx="9" cy="12" r="1.5" fill="white" />
    <circle cx="15" cy="12" r="1.5" fill="white" />
    <rect x="9" y="15" width="6" height="1.5" rx="0.75" fill="white" opacity="0.9" />
  </svg>
)

const BotSettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="url(#grad1)" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#E6C869" />
      </linearGradient>
    </defs>
    <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.65l-2-3.46a.5.5 0 0 0-.61-.21l-2.49 1a7.03 7.03 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65a7.03 7.03 0 0 0-1.69.98l-2.49-1a.5.5 0 0 0-.61.21l-2 3.46a.5.5 0 0 0 .12.65l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.65l2 3.46a.5.5 0 0 0 .61.21l2.49-1c.5.4 1.07.73 1.69.98l.38 2.65A.5.5 0 0 0 10 22h4c.25 0 .46-.18.5-.42l.38-2.65c.62-.25 1.19-.58 1.69-.98l2.49 1a.5.5 0 0 0 .61-.21l2-3.46a.5.5 0 0 0-.12-.65l-2.11-1.65zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z" />
  </svg>
)

const ChartsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="url(#grad1)" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#E6C869" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="url(#grad1)" strokeWidth="2" />
    <path
      d="M7 14L10 10L14 15L17 9"
      fill="none"
      stroke="url(#grad1)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="7" cy="14" r="1.5" fill="url(#grad1)" />
    <circle cx="10" cy="10" r="1.5" fill="url(#grad1)" />
    <circle cx="14" cy="15" r="1.5" fill="url(#grad1)" />
    <circle cx="17" cy="9" r="1.5" fill="url(#grad1)" />
  </svg>
)

const DCirclesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#E6C869" />
      </linearGradient>
    </defs>
    <path d="M12 2a10 10 0 1 1-7.07 2.93" fill="none" stroke="url(#grad1)" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M12 6a6 6 0 1 1-4.24 1.76" fill="none" stroke="url(#grad1)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="12" r="2.8" fill="url(#grad1)" />
    <circle cx="13" cy="11" r="0.8" fill="white" opacity="0.9" />
  </svg>
)

const MToolIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gradMTool" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#E6C869" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="url(#gradMTool)" strokeWidth="2" />
    <path
      d="M7 8L9 15L12 10L15 15L17 8"
      fill="none"
      stroke="url(#gradMTool)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="7" cy="8" r="1.2" fill="url(#gradMTool)" />
    <circle cx="9" cy="15" r="1.2" fill="url(#gradMTool)" />
    <circle cx="12" cy="10" r="1.2" fill="url(#gradMTool)" />
    <circle cx="15" cy="15" r="1.2" fill="url(#gradMTool)" />
    <circle cx="17" cy="8" r="1.2" fill="url(#gradMTool)" />
  </svg>
)

const AnalysisToolIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#E6C869" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="url(#grad1)" strokeWidth="2" />
    <rect x="7" y="14" width="2" height="4" rx="1" fill="url(#grad1)" />
    <rect x="11" y="10" width="2" height="8" rx="1" fill="url(#grad1)" />
    <rect x="15" y="7" width="2" height="11" rx="1" fill="url(#grad1)" />
    <circle cx="18" cy="6" r="3" stroke="url(#grad1)" strokeWidth="2" fill="white" />
    <path d="M20 8L22 10" stroke="url(#grad1)" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const ToolsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2.5L13.5 4.5L16 4L17 6.5L19.5 7.5L19 10L21.5 12L19 14L19.5 16.5L17 17.5L16 20L13.5 19.5L12 21.5L10.5 19.5L8 20L7 17.5L4.5 16.5L5 14L2.5 12L5 10L4.5 7.5L7 6.5L8 4L10.5 4.5L12 2.5Z"
      stroke="#D4AF37"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M9 15L12 12M12 12C13.1 12 14 11.1 14 10C14 8.9 13.1 8 12 8C10.9 8 10 8.9 10 10C10 10.55 10.45 11 11 11"
      stroke="#D4AF37"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const CopyTradingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#E6C869" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="url(#grad1)" strokeWidth="2" />
    <circle cx="12" cy="9" r="2.3" fill="url(#grad1)" />
    <rect x="7.5" y="12.2" width="9" height="5" rx="2.5" fill="url(#grad1)" />
  </svg>
)

const StrategyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#1e40af" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="url(#grad1)" strokeWidth="2" />
    <path d="M8 7H12V17H8C7.45 17 7 16.55 7 16V8C7 7.45 7.45 7 8 7Z" fill="url(#grad1)" />
    <path
      d="M12 7H16C16.55 7 17 7.45 17 8V16C17 16.55 16.55 17 16 17H12V7Z"
      fill="white"
      stroke="url(#grad1)"
      strokeWidth="1.5"
    />
    <line x1="12" y1="7" x2="12" y2="17" stroke="url(#grad1)" strokeWidth="1.5" />
    <path d="M14 7V11L15 10.2L16 11V7H14Z" fill="url(#grad1)" />
  </svg>
)

const SignalsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#E6C869" />
      </linearGradient>
    </defs>
    <rect x="3" y="4" width="18" height="14" rx="2" ry="2" fill="none" stroke="url(#blueGrad)" strokeWidth="2" />
    <polyline
      points="5,14 8,10 11,12 14,7 17,9 20,6"
      fill="none"
      stroke="url(#blueGrad)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="19" cy="16.5" r="2.5" fill="url(#blueGrad)" />
  </svg>
)

const TutorialsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 5C4 4.447 4.447 4 5 4H15C16.105 4 17 4.895 17 6V20C17 20.553 16.553 21 16 21H6C4.895 21 4 20.105 4 19V5Z"
      stroke="#D4AF37"
      strokeWidth="2"
      fill="none"
      strokeLinejoin="round"
    />
    <path
      d="M17 6H19C20.105 6 21 6.895 21 8V20C21 20.553 20.553 21 20 21H17"
      stroke="#D4AF37"
      strokeWidth="2"
      fill="none"
      strokeLinejoin="round"
    />
    <circle cx="10" cy="12" r="3" fill="#D4AF37" />
    <polygon points="9,10.5 12,12 9,13.5" fill="white" />
  </svg>
)

// Social Media Icons
const YouTubeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.33z"
      fill="#FF0000"
    />
    <path d="M9.75 15.02l5.75-3.27-5.75-3.27v6.54z" fill="#fff" />
  </svg>
)

const InstagramIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E1306C" strokeWidth="2" fill="none" />
    <circle cx="12" cy="12" r="5" stroke="#E1306C" strokeWidth="2" fill="none" />
    <circle cx="18" cy="6" r="1" fill="#E1306C" />
  </svg>
)

const WhatsAppIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      fill="#25D366"
    />
  </svg>
)

const TikTokIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
      fill="#000000"
    />
  </svg>
)

const TelegramIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-12S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.69 1.03-.58.05-1-.39-1.56-.76-.86-.56-1.35-.91-2.19-1.46-.96-.63-.34-1.01.21-1.59.14-.14 2.65-2.43 2.7-2.64.01-.04.01-.19-.06-.27-.07-.08-.17-.05-.25-.03-.1.03-1.79 1.12-5.06 3.3-.48.33-.92.5-1.4.49-.46-.02-1.36-.26-2.03-.48-.82-.27-1.48-.41-1.42-.87.03-.24.33-.5.91-.72 4.91-2.07 7.31-3.08 8.26-3.45 3.8-1.51 4.59-1.77 5.11-1.77.12 0 .38.03.55.18.13.12.16.28.15.4-.04.4-.52 4.69-.75 6.37z"
      fill="#0088CC"
    />
  </svg>
)

const AppWrapper = observer(() => {
  const { connectionStatus } = useApiBase()
  const { dashboard, load_modal, run_panel, summary_card } = useStore()
  const { active_tab, is_chart_modal_visible, is_trading_view_modal_visible, setActiveTab } = dashboard
  const { onEntered } = load_modal
  const {
    is_dialog_open,
    dialog_options,
    onCancelButtonClick,
    onCloseDialog,
    onOkButtonClick,
    stopBot,
    is_drawer_open,
  } = run_panel
  const { cancel_button_text, ok_button_text, title, message } = dialog_options as { [key: string]: string }
  const { clear } = summary_card
  const { isDesktop, isMobile } = useDevice()
  const [bots, setBots] = useState([])
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const analysisUrl = "https://mesoflxadvanced.netlify.app/"
  const mtoolUrl = "https://your-mtool-url.com/"
  const strategyUrl = "https://mesoflixstrategies.netlify.app/"
  const toolsUrl = "https://whatsapp.com/channel/0029Vb6FiCw8vd1HDvva2i2K"

  useEffect(() => {
    const tabLetter = getTabLetterFromUrl()
    if (tabLetter && TAB_LETTERS.includes(tabLetter)) {
      const tabIndex = TAB_LETTERS.indexOf(tabLetter)
      setActiveTab(tabIndex)
    }
  }, [setActiveTab])

  useEffect(() => {
    if (connectionStatus !== CONNECTION_STATUS.OPENED) {
      const is_bot_running = document.getElementById("db-animation__stop-button") !== null
      if (is_bot_running) {
        clear()
        stopBot()
        api_base.setIsRunning(false)
      }
    }
  }, [clear, connectionStatus, stopBot])

  useEffect(() => {
    const fetchBots = async () => {
      const botFiles = [
        "ODD_Autobot.xml",
        "EVEN_Autobot.xml",
        "OVER_UNDER AUTOBOT.xml",
        "Over 3 strategybot.xml",
        "EVEN_MYTH V2.0 .xml",
        "EVEN_ODD MYTH V1.xml",
        "Mega_Mind V1👻.xml",
        "Over_HitnRun🤖.xml",
        "Under-Pro Bot💫.xml",

      ]
      const botPromises = botFiles.map(async (file) => {
        try {
          const response = await fetch(file)
          if (!response.ok) {
            throw new Error(`Failed to fetch ${file}: ${response.statusText}`)
          }
          const text = await response.text()
          const parser = new DOMParser()
          const xml = parser.parseFromString(text, "application/xml")
          return {
            title: file.split("/").pop(),
            image: xml.getElementsByTagName("image")[0]?.textContent || "default_image_path",
            filePath: file,
            xmlContent: text,
          }
        } catch (error) {
          console.error(error)
          return null
        }
      })
      const bots = (await Promise.all(botPromises)).filter(Boolean)
      setBots(bots)
    }
    fetchBots()
  }, [])

  const formatBotName = (name: string) => name.replace(/\.xml$/, "")

  const handleTabChange = useCallback(
    (tab_index: number) => {
      setActiveTab(tab_index)
      const tabLetter = TAB_LETTERS[tab_index] || "a"
      updateUrlWithTab(tabLetter)
    },
    [setActiveTab],
  )

  const handleBotClick = useCallback(
    async (bot: { filePath: string; xmlContent: string }) => {
      setActiveTab(DBOT_TABS.BOT_BUILDER)
      try {
        if (typeof load_modal.loadFileFromContent === "function") {
          await load_modal.loadFileFromContent(bot.xmlContent)
        } else {
          console.error("loadFileFromContent is not defined on load_modal")
        }
        updateWorkspaceName(bot.xmlContent)
      } catch (error) {
        console.error("Error loading bot file:", error)
      }
    },
    [setActiveTab, load_modal, updateWorkspaceName],
  )

  const handleOpen = useCallback(async () => {
    await load_modal.loadFileFromRecent()
    setActiveTab(DBOT_TABS.BOT_BUILDER)
  }, [load_modal, setActiveTab])

  const showRunPanel = [1, 2, 3, 4].includes(active_tab)

  const fullPanelStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: "100%",
    maxHeight: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
  }

  return (
    <React.Fragment>
      <div className="main">
        <div className="main__container">
          <Tabs
            active_index={active_tab}
            className="main__tabs"
            onTabItemChange={onEntered}
            onTabItemClick={handleTabChange}
            top
          >
            {/* 1. Free Bots - Tab A */}
            <div
              label={
                <>
                  <FreeBotsIcon />
                  <Localize i18n_default_text="Free Bots" />
                </>
              }
              id="id-free-bots"
            >
              <div className="free-bots">
                {/* Social Media Icons */}
                <div className="social-media-container">
                  <a
                    href="https://youtube.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-icon youtube-icon"
                  >
                    <YouTubeIcon />
                  </a>
                  <a
                    href="https://www.instagram.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-icon instagram-icon"
                  >
                    <InstagramIcon />
                  </a>
                  <a
                    href="https://whatsapp.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-icon whatsapp-icon"
                  >
                    <WhatsAppIcon />
                  </a>
                  <a
                    href="https://www.tiktok.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-icon tiktok-icon"
                  >
                    <TikTokIcon />
                  </a>
                  <a
                    href="https://t.me/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-icon telegram-icon"
                  >
                    <TelegramIcon />
                  </a>
                </div>
                <div className="free-bots__content-wrapper">
                  <div className="free-bots__content">
                    {bots.map((bot, index) => (
                      <div key={index} className="free-bot-item" style={{ animationDelay: `${index * 0.1}s` }}>
                        <div className="gradient-border" />
                        <div className="bot-info">
                          <div className="bot-icon-container">
                            <FreeBotsIcon />
                          </div>
                          <div className="bot-details">
                            <h3 className="bot-title">{formatBotName(bot.title)}</h3>
                            <p className="bot-status">Ready to deploy • Click to load</p>
                          </div>
                        </div>
                        <button onClick={() => handleBotClick(bot)} className="load-bot-button">
                          Load Bot
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Bot Settings - Tab B */}
            <div
              label={
                <>
                  <BotSettingsIcon />
                  <Localize i18n_default_text="Bot Settings" />
                </>
              }
              id="id-bot-settings"
            >
              <div style={fullPanelStyle}>
                <Dashboard handleTabChange={handleTabChange} />
                <button onClick={handleOpen}>Load Bot</button>
              </div>
            </div>

            {/* 3. Charts - Tab C */}
            <div
              label={
                <>
                  <ChartsIcon />
                  <Localize i18n_default_text="Charts" />
                </>
              }
              id="id-charts"
            >
              <div style={fullPanelStyle}>
                <Suspense fallback={<ChunkLoader message={localize("Please wait, loading chart...")} />}>
                  <Chart show_digits_stats={false} />
                </Suspense>
              </div>
            </div>

            {/* 4. Dcircles - Tab D */}
            <div
              label={
                <>
                  <DCirclesIcon />
                  <Localize i18n_default_text="Dcircles" />
                </>
              }
              id="id-dcircles"
            >
              <Suspense fallback={<ChunkLoader message={localize("Please wait, loading Dcircles...")} />}>
                <div style={fullPanelStyle}>
                  <Dcircles />
                </div>
              </Suspense>
            </div>

            {/* 5. MTool - Tab E */}
            <div
              label={
                <>
                  <MToolIcon />
                  <Localize i18n_default_text="MTool" />
                </>
              }
              id="id-mtool"
            >
              <Suspense fallback={<ChunkLoader message={localize("Please wait, loading MTool...")} />}>
                <div style={fullPanelStyle}>
                  <Advanced />
                </div>
              </Suspense>
            </div>

            {/* 6. Analysis - Tab F */}
            <div
              label={
                <>
                  <AnalysisToolIcon />
                  <Localize i18n_default_text="Analysis" />
                </>
              }
              id="id-analysis"
            >
              <div style={fullPanelStyle}>
                <iframe
                  src={analysisUrl}
                  width="100%"
                  height="100%"
                  title="Analysis"
                  style={{
                    border: "none",
                    display: "block",
                    background: "#ffffff",
                    flex: 1,
                  }}
                  scrolling="yes"
                />
              </div>
            </div>

            {/* 7. Tools - Tab G */}
            <div
              label={
                <>
                  <ToolsIcon />
                  <Localize i18n_default_text="Tools" />
                </>
              }
              id="id-tools"
            >
              <div style={fullPanelStyle}>
                <iframe
                  src={toolsUrl}
                  width="100%"
                  height="100%"
                  title="Tools"
                  style={{
                    border: "none",
                    display: "block",
                    background: "#ffffff",
                    flex: 1,
                  }}
                  scrolling="yes"
                />
              </div>
            </div>

            {/* 8. Copytrading - Tab H */}
            <div
              label={
                <>
                  <CopyTradingIcon />
                  <Localize i18n_default_text="Copytrading" />
                </>
              }
              id="id-copytrading"
            >
              <div style={fullPanelStyle}>
                <Suspense fallback={<ChunkLoader message={localize("Please wait, loading copytrading...")} />}>
                  <Copytrading />
                </Suspense>
              </div>
            </div>

            {/* 9. Strategies - Tab I */}
            <div
              label={
                <>
                  <StrategyIcon />
                  <Localize i18n_default_text="Strategy" />
                </>
              }
              id="id-strategy"
            >
              <div style={fullPanelStyle}>
                <iframe
                  src={strategyUrl}
                  width="100%"
                  height="100%"
                  title="Strategy"
                  style={{
                    border: "none",
                    display: "block",
                    background: "#ffffff",
                    flex: 1,
                  }}
                  scrolling="yes"
                />
              </div>
            </div>

            {/* 10. Signals - Tab J */}
            <div
              label={
                <>
                  <SignalsIcon />
                  <Localize i18n_default_text="Signals" />
                </>
              }
              id="id-signals"
            >
              <div
                className={classNames("dashboard__chart-wrapper", {
                  "dashboard__chart-wrapper--expanded": is_drawer_open && isDesktop,
                  "dashboard__chart-wrapper--modal": is_chart_modal_visible && isDesktop,
                })}
                style={fullPanelStyle}
              >
                <iframe
                  src="signals"
                  width="100%"
                  height="100%"
                  style={{
                    border: "none",
                    display: "block",
                    background: "#ffffff",
                    flex: 1,
                  }}
                  scrolling="yes"
                />
              </div>
            </div>

            {/* 11. Tutorials - Tab K */}
            <div
              label={
                <>
                  <TutorialsIcon />
                  <Localize i18n_default_text="Tutorials" />
                </>
              }
              id="id-tutorials"
            >
              <div style={fullPanelStyle}>
                <Suspense fallback={<ChunkLoader message={localize("Please wait, loading tutorials...")} />}>
                  <Tutorial handleTabChange={handleTabChange} />
                </Suspense>
              </div>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Risk Disclaimer Button */}
      <button
        onClick={() => setShowDisclaimer(true)}
        className="risk-disclaimer-button"
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          background: "linear-gradient(135deg, #F59E0B, #EF4444)",
          color: "white",
          border: "none",
          borderRadius: "20px",
          padding: "8px 16px",
          fontSize: "12px",
          fontWeight: "600",
          cursor: "pointer",
          transition: "all 0.3s ease",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = "scale(1.05)"
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)"
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = "scale(1)"
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)"
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Disclaimer
      </button>

      {/* Risk Disclaimer Modal */}
      {showDisclaimer && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "80vh",
              overflowY: "auto",
              position: "relative",
              boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
            }}
          >
            <button
              onClick={() => setShowDisclaimer(false)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                fontSize: "20px",
                cursor: "pointer",
                color: "#6B7280",
              }}
            >
              ×
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div
                style={{
                  background: "#FEE2E2",
                  borderRadius: "50%",
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 style={{ fontSize: "20px", fontWeight: "bold", color: "#1F2937", margin: 0 }}>
                Deriv Trading Risk Disclaimer
              </h3>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <p style={{ lineHeight: "1.6", color: "#4B5563", marginBottom: "12px" }}>
                Trading multipliers and other derivative products on Deriv involves significant risk of loss and is not
                suitable for all investors. Before deciding to trade, carefully consider your financial situation and
                experience level.
              </p>
              <h4 style={{ color: "#1F2937", margin: "12px 0 8px 0" }}>Key Risks:</h4>
              <ul style={{ paddingLeft: "20px", lineHeight: "1.6", color: "#4B5563", marginBottom: "16px" }}>
                <li style={{ marginBottom: "8px" }}>
                  <strong>Leverage Risk:</strong> Deriv's multiplier products allow you to multiply potential gains, but
                  also magnify potential losses.
                </li>
                <li style={{ marginBottom: "8px" }}>
                  <strong>Market Risk:</strong> Financial markets are volatile and can move rapidly in unexpected
                  directions.
                </li>
                <li style={{ marginBottom: "8px" }}>
                  <strong>Liquidity Risk:</strong> Some markets may become illiquid, making it difficult to close
                  positions.
                </li>
                <li style={{ marginBottom: "8px" }}>
                  <strong>Technical Risk:</strong> System failures, internet connectivity issues, or other technical
                  problems may prevent order execution.
                </li>
                <li>
                  <strong>Regulatory Risk:</strong> Deriv operates under different regulatory frameworks which may
                  affect your rights as a trader.
                </li>
              </ul>
              <h4 style={{ color: "#1F2937", margin: "12px 0 8px 0" }}>Important Considerations:</h4>
              <ul style={{ paddingLeft: "20px", lineHeight: "1.6", color: "#4B5563" }}>
                <li style={{ marginBottom: "8px" }}>You could lose some or all of your invested capital.</li>
                <li style={{ marginBottom: "8px" }}>Never trade with money you cannot afford to lose.</li>
                <li style={{ marginBottom: "8px" }}>Past performance is not indicative of future results.</li>
                <li>
                  Seek independent financial advice if you have any doubts about your understanding of these risks.
                </li>
              </ul>
            </div>
            <div style={{ backgroundColor: "#F3F4F6", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
              <p style={{ fontSize: "14px", color: "#6B7280", fontStyle: "italic", margin: 0, lineHeight: "1.5" }}>
                By continuing to use this platform, you acknowledge that you have read, understood, and accept these
                risks associated with trading on Deriv.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDisclaimer(false)}
                style={{
                  background: "linear-gradient(135deg, #1e40af, #1e3a8a)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                I Understand the Risks
              </button>
            </div>
          </div>
        </div>
      )}

      <DesktopWrapper>
        <div className="main__run-strategy-wrapper">
          <RunStrategy />
          {showRunPanel && <RunPanel />}
        </div>
        <ChartModal />
        <TradingViewModal />
      </DesktopWrapper>
      <MobileWrapper>
        <RunPanel />
      </MobileWrapper>
      <Dialog
        cancel_button_text={cancel_button_text || localize("Cancel")}
        confirm_button_text={ok_button_text || localize("Ok")}
        has_close_icon
        is_visible={is_dialog_open}
        onCancel={onCancelButtonClick}
        onClose={onCloseDialog}
        onConfirm={onOkButtonClick || onCloseDialog}
        title={title}
      >
        {message}
      </Dialog>
    </React.Fragment>
  )
})

export default AppWrapper
