import React, { useMemo } from 'react';
import styles from './analysis.module.css';

const Analysis: React.FC = () => {
    // Base64 encoded URL: https://analysern.netlify.app/
    const encodedUrl = 'aHR0cHM6Ly9hbmFseXNlcm4ubmV0bGlmeS5hcHAv';

    const url = useMemo(() => {
        try {
            return atob(encodedUrl);
        } catch (e) {
            console.error('Failed to decode URL', e);
            return '';
        }
    }, []);

    return (
        <div
            className={styles.analysisContainer}
            style={{
                height: '100%',
                width: '100%',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: '120px',
                boxSizing: 'border-box',
            }}
        >
            <iframe
                src={url}
                title='Dcircles Analysis'
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    display: 'block',
                }}
                allowFullScreen
            />
        </div>
    );
};

export default Analysis;
