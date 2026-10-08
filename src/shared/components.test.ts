import { describe, expect, it } from 'vitest'
import { componentOf, dirOf } from './components'

const components = [
  { id: 'backend', path: 'backend', direct: false },
  { id: 'backend/leads', path: 'backend/leads', direct: false },
  { id: 'src#direct', path: 'src', direct: true },
  { id: 'src/ui', path: 'src/ui', direct: false },
]

describe('dirOf', () => {
  it('takes the folder, or "" at the root', () => {
    expect(dirOf('a/b/c.ts')).toBe('a/b')
    expect(dirOf('README.md')).toBe('')
  })
})

describe('componentOf', () => {
  it('picks the deepest folder that covers the file', () => {
    expect(componentOf('backend/leads/views.py', components)?.id).toBe('backend/leads')
    expect(componentOf('backend/leads/api/serializers.py', components)?.id).toBe('backend/leads')
    expect(componentOf('backend/settings.py', components)?.id).toBe('backend')
  })

  it('lets a direct component take only the loose files in its folder', () => {
    expect(componentOf('src/main.tsx', components)?.id).toBe('src#direct')
    expect(componentOf('src/ui/Button.tsx', components)?.id).toBe('src/ui')
    expect(componentOf('src/data/api.ts', components)).toBeNull()
  })

  it('does not mistake a folder that only shares a prefix', () => {
    expect(componentOf('backend-old/x.py', components)).toBeNull()
  })
})
