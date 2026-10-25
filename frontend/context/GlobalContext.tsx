import React, { createContext, ReactNode, useContext, useState } from 'react';

/** How the active session's EEG data got here — drives the Source Node's display state. */
export type DataSource = 'imported' | null;

type GlobalContextType = {
    dataStreaming: boolean;
    setDataStreaming: React.Dispatch<React.SetStateAction<boolean>>;
    activeSessionId: number | null;
    setActiveSessionId: React.Dispatch<React.SetStateAction<number | null>>;
    activeSessionName: string | null;
    setActiveSessionName: React.Dispatch<React.SetStateAction<string | null>>;
    dataSource: DataSource;
    setDataSource: React.Dispatch<React.SetStateAction<DataSource>>;
};

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export const GlobalProvider = ({ children }: { children: ReactNode }) => {
    const [dataStreaming, setDataStreaming] = useState(false);
    const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
    const [activeSessionName, setActiveSessionName] = useState<string | null>(
        null
    );
    const [dataSource, setDataSource] = useState<DataSource>(null);

    return (
        <GlobalContext.Provider
            value={{
                dataStreaming,
                setDataStreaming,
                activeSessionId,
                setActiveSessionId,
                activeSessionName,
                setActiveSessionName,
                dataSource,
                setDataSource,
            }}
        >
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
