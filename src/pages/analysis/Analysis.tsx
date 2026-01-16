import React, { useMemo } from 'react';
import styles from './analysis.module.css';

const Analysis: React.FC = () => {
    // Base64 encoded URL: https://nilotetrader.netlify.app/
    const encodedUrl = 'aHR0cHM6Ly9uaWxvdGV0cmFkZXIubmV0bGlmeS5hcHAv';

    const url = useMemo(() => {
        try {
            return atob(encodedUrl);
        } catch (e) {
            console.error('Failed to decode URL', e);
            return '';
        }
    }, []);

    return (
        <div className={styles.analysisContainer} style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
            <iframe
                src={url}
                title='Dcircles Analysis'
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                }}
                allowFullScreen
            />
        </div>
    );
};

export default Analysis;
