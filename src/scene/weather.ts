import { createContext, useContext } from 'react'

export type Weather = 'sun' | 'clouds' | 'rain' | 'night'

export const WEATHERS: Weather[] = ['sun', 'clouds', 'rain', 'night']

/** Light and colour targets for each weather; everything in the scene eases towards them. */
export const LOOK: Record<
  Weather,
  {
    hemi: number
    sky: string
    ground: string
    sun: number
    sunColor: string
    fill: number
    /** How much windows and lamps glow (0 by day, 1 at night). */
    glow: number
    clouds: number
    cloudColor: string
    rain: number
  }
> = {
  sun: { hemi: 1.05, sky: '#ffffff', ground: '#c3cdf5', sun: 1.5, sunColor: '#fff4e0', fill: 0.45, glow: 0.1, clouds: 0.35, cloudColor: '#ffffff', rain: 0 },
  clouds: { hemi: 0.95, sky: '#eef1f8', ground: '#b9c1d8', sun: 0.65, sunColor: '#f1f3fa', fill: 0.4, glow: 0.25, clouds: 1, cloudColor: '#f3f5fa', rain: 0 },
  rain: { hemi: 0.78, sky: '#d9dfec', ground: '#9aa4bf', sun: 0.35, sunColor: '#dfe5f2', fill: 0.3, glow: 0.5, clouds: 1, cloudColor: '#b7bfd2', rain: 1 },
  night: { hemi: 0.4, sky: '#8fa0e0', ground: '#2c3460', sun: 0.18, sunColor: '#9fb3ff', fill: 0.1, glow: 1, clouds: 0.25, cloudColor: '#6f7aa8', rain: 0 },
}

export const WeatherContext = createContext<Weather>('sun')
export const useWeather = () => useContext(WeatherContext)
