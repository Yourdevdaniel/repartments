import { createContext, useContext } from 'react'

/** The page language, for anything drawn inside the 3D scene (bubbles, room signs). */
export type SceneLang = 'en' | 'pt'
export const SceneLangContext = createContext<SceneLang>('en')
export const useSceneLang = () => useContext(SceneLangContext)
