import React, { createContext, ReactNode, useContext, useState } from 'react';

type GlobalContextType = {
    dataStreaming: boolean;
    setDataStreaming: React.Dispatch<React.SetStateAction<boolean>>;
    activeSessionId: number | null;
    setActiveSessionId: React.Dispatch<React.SetStateAction<number | null>>;
    activeSessionName: string | null;
    setActiveSessionName: React.Dispatch<React.SetStateAction<string | null>>;
};

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export const GlobalProvider = ({ children }: { children: ReactNode }) => {
    const [dataStreaming, setDataStreaming] = useState(false);
    const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
    const [activeSessionName, setActiveSessionName] = useState<string | null>(
        null
    );

    return (
        <GlobalContext.Provider
            value={{
                dataStreaming,
                setDataStreaming,
                activeSessionId,
                setActiveSessionId,
                activeSessionName,
                setActiveSessionName,
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
