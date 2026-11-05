import { createContext, useContext } from 'react';

/** True inside the printed journal, where some pages leave things out or lay them out differently. */
export const PrintContext = createContext(false);
export const usePrinting = () => useContext(PrintContext);
