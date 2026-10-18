import { createContext, useContext } from 'react';

/** Opens the options sheet; null when this screen has none. Provided by OptionsHost. */
export const OpenOptions = createContext<(() => void) | null>(null);

export const useOpenOptions = () => useContext(OpenOptions);
