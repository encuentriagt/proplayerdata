import { createContext, useContext } from 'react'

/** Si el menú lateral de escritorio está desplegado (con textos) o plegado (solo íconos). */
export const MenuWideContext = createContext(false)
export const useMenuWide = () => useContext(MenuWideContext)
