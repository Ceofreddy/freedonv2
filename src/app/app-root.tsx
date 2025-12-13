import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ErrorBoundary from '@/components/error-component/error-boundary';
import ErrorComponent from '@/components/error-component/error-component';
import TradingAssesmentModal from '@/components/trading-assesment-modal';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import './app-root.scss';

const AppContent = lazy(() => import('./app-content'));

import FreedonLogo from '@/components/shared/freedon-logo';

const TypingFreedon = () => {
    return (
        <div className="typing-freedon">
            <div className="scan-line"></div>
            <h2 className="glitch-text" data-text="FREEDON">FREEDON</h2>
            <div className="loading-status">
                <span className="status-text">INITIALIZING SYSTEMS...</span>
                <div className="progress-bar"><div className="progress-fill"></div></div>
            </div>
        </div>
    );
};

const Spinner = () => (
    <div className="spinner-root freedon-loader">
        <div className="tech-spinner">
            <div className="ring ring-1"></div>
            <div className="ring ring-2"></div>
            <div className="ring ring-3"></div>
            <div className="center-logo">
                <FreedonLogo className="loader-logo" />
            </div>
        </div>
        <TypingFreedon />
    </div>
);

const AppRootLoader = () => {
    return <Spinner />;
};

const ErrorComponentWrapper = observer(() => {
    const { common } = useStore();

    if (!common.error) return null;

    return (
        <ErrorComponent
            header={common.error?.header}
            message={common.error?.message}
            redirect_label={common.error?.redirect_label}
            redirectOnClick={common.error?.redirectOnClick}
            should_clear_error_on_click={common.error?.should_clear_error_on_click}
            setError={common.setError}
            redirect_to={common.error?.redirect_to}
            should_redirect={common.error?.should_redirect}
        />
    );
});

const AppRoot = () => {
    const store = useStore();
    const api_base_initialized = useRef(false);
    const [is_api_initialized, setIsApiInitialized] = useState(false);

    useEffect(() => {
        const initializeApi = async () => {
            if (!api_base_initialized.current) {
                await api_base.init();
                api_base_initialized.current = true;
                setIsApiInitialized(true);
            }
        };
        initializeApi();
    }, []);

    if (!store || !is_api_initialized) return <AppRootLoader />;

    return (
        <Suspense fallback={<AppRootLoader />}>
            <ErrorBoundary root_store={store}>
                <ErrorComponentWrapper />
                <AppContent />
                <TradingAssesmentModal />
            </ErrorBoundary>
        </Suspense>
    );
};

export default AppRoot;
