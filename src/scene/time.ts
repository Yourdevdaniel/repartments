import { createContext, useContext } from 'react'

/** One shared clock for every story in the scene, so beats stay in sync across residents and props. */
export type StoryTime = { current: number; paused: boolean }

export const StoryTimeContext = createContext<StoryTime>({ current: 0, paused: false })

export function useStoryTime() {
  return useContext(StoryTimeContext)
}
