import React, {
    createContext,
    ReactNode,
    useContext,
    useState
} from 'react';

import useWebsocket from '@/hooks/useWebsocket';
import { ProcessingConfig, WindowingConfig } from '@/lib/processing';

type GlobalContextType = {
    dataStreaming: boolean;
    setDataStreaming: React.Dispatch<React.SetStateAction<boolean>>;
    activeSessionId: number | null;
    setActiveSessionId: React.Dispatch<React.SetStateAction<number | null>>;
    renderData: any[];
    sendProcessingConfig: (config: ProcessingConfig) => void;
    sendWindowingConfig: (config: WindowingConfig) => void;
};

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export const GlobalProvider = ({ children }: { children: ReactNode }) => {
    const [dataStreaming, setDataStreaming] = useState(false);

    const { renderData, sendProcessingConfig, sendWindowingConfig } = useWebsocket(20, 10, dataStreaming);
    const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

    return (
        <GlobalContext.Provider value={{
            dataStreaming,
            setDataStreaming,
            renderData,
            sendProcessingConfig,
            sendWindowingConfig,
            activeSessionId,
            setActiveSessionId,
        }}>
            {children}
        </GlobalContext.Provider>
    );
};

export const useGlobalContext = () => {
    const context = useContext(GlobalContext);
    if (!context) {
        throw new Error(
            'useGlobalContext must be used within a GlobalProvider'
        );
    }
    return context;
};
