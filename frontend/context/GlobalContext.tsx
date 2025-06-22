import React, {
    createContext,
    useContext,
    useState,
    ReactNode,
    useEffect,
} from 'react';

type GlobalContextType = {
    dataStreaming: boolean;
    setDataStreaming: React.Dispatch<React.SetStateAction<boolean>>;
};

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export const GlobalProvider = ({ children }: { children: ReactNode }) => {
    const [dataStreaming, setDataStreaming] = useState(false);

    useEffect(() => {
        console.log('Data streaming:', dataStreaming);
    }, [dataStreaming]);

    return (
        <GlobalContext.Provider value={{ dataStreaming, setDataStreaming }}>
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
