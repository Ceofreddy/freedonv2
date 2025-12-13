import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';


const BlocklyLoading = observer(() => {
    const { blockly_store } = useStore();
    const { is_loading } = blockly_store;

    return (
        <>
            {is_loading && (
                <div className='bot__loading' data-testid='blockly-loader'>
                    <div className="tech-spinner small"></div>

                </div>
            )}
        </>
    );
});

export default BlocklyLoading;
