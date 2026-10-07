import { createContext, useContext } from 'react'

/**
 * One shared clock for every story in the scene, so beats stay in sync across residents and props.
 * `rate` is the playback speed (1 = as written, 0.5 = half speed); a paused clock stands still.
 */
export type StoryTime = { current: number; paused: boolean; rate: number }

export const StoryTimeContext = createContext<StoryTime>({ current: 0, paused: false, rate: 1 })

export function useStoryTime() {
  return useContext(StoryTimeContext)
}
