import type { FlatData } from '../types'
import { djangoReact } from './django-react'
import { studio } from './studio'

/** The demo building, bottom floor first, until real GitHub data arrives. */
export const demoOwner = { login: 'Yourdevdaniel', name: 'Daniel Bernardes' }
export const demoFlats: FlatData[] = [djangoReact, studio]
