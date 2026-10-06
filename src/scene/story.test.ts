import { describe, expect, it } from 'vitest'
import { bubbleAt, captionAt, compile, flagAt, propAt, sample, WALK_SPEED, yawTowards } from './story'

const start = { a: { at: [0, 0] as [number, number], yaw: 0 }, b: { at: [2, 0] as [number, number], yaw: 0 } }

describe('compile', () => {
  it('makes a beat last as long as its longest walk', () => {
    const story = compile(start, [{ acts: { a: { walk: [1.7, 0] } } }])
    expect(story.duration).toBeCloseTo(1.7 / WALK_SPEED)
  })

  it('keeps residents without an act waiting in place', () => {
    const story = compile(start, [{ acts: { a: { walk: [1, 0] } } }])
    const pose = sample(story, 'b', story.duration / 2)
    expect(pose).toMatchObject({ x: 2, z: 0, anim: 'idle' })
  })

  it('moves a walking resident along the line and faces where it goes', () => {
    const story = compile(start, [{ acts: { a: { walk: [0, 2] } } }])
    const pose = sample(story, 'a', story.duration / 2)
    expect(pose.anim).toBe('walk')
    expect(pose.z).toBeCloseTo(1)
    expect(pose.yaw).toBeCloseTo(0)
  })

  it('lets a quick walker idle until the slow one arrives', () => {
    const story = compile(start, [{ acts: { a: { walk: [0.5, 0] }, b: { walk: [2, 3] } } }])
    expect(sample(story, 'a', story.duration * 0.9).anim).toBe('idle')
    expect(sample(story, 'b', story.duration * 0.9).anim).toBe('walk')
  })

  it('turns to face a target for an animation', () => {
    const story = compile(start, [{ acts: { a: { anim: 'interact-right', face: [2, 0] } } }])
    expect(sample(story, 'a', 0.1)).toMatchObject({ anim: 'interact-right', yaw: Math.PI / 2 })
  })

  it('follows a path leg by leg', () => {
    const story = compile(start, [{ acts: { a: { path: [[1, 0], [1, 1]] } } }])
    expect(story.duration).toBeCloseTo(2 / WALK_SPEED)
    const late = sample(story, 'a', story.duration * 0.75)
    expect(late.x).toBeCloseTo(1)
    expect(late.z).toBeCloseTo(0.5)
    expect(late.yaw).toBeCloseTo(0)
  })

  it('rejects residents that are not in the flat', () => {
    expect(() => compile(start, [{ acts: { ghost: { anim: 'idle' } } }])).toThrow(/ghost/)
  })
})

describe('props, flags and captions', () => {
  const story = compile(start, [
    { dur: 1, props: { box: 'a' }, flags: { tv: false }, caption: { en: 'carry', pt: 'leva' } },
    { dur: 1, props: { box: [1, 0.4, 0] }, flags: { tv: true } },
  ])

  it('follows who holds a prop over time and loops', () => {
    expect(propAt(story, 'box', 0.5)).toBe('a')
    expect(propAt(story, 'box', 1.5)).toEqual([1, 0.4, 0])
    expect(propAt(story, 'box', 2.5)).toBe('a')
  })

  it('marks the holder as carrying', () => {
    expect(sample(story, 'a', 0.5).carrying).toBe(true)
    expect(sample(story, 'a', 1.5).carrying).toBe(false)
  })

  it('switches flags and keeps a caption up until the next one', () => {
    expect(flagAt(story, 'tv', 0.5)).toBe(false)
    expect(flagAt(story, 'tv', 1.5)).toBe(true)
    expect(captionAt(story, 0.5)?.en).toBe('carry')
    expect(captionAt(story, 1.5)?.en).toBe('carry')
  })
})

describe('bubbles', () => {
  it('shows a bubble over its resident only during its beat', () => {
    const story = compile(start, [{ dur: 1, say: { a: { icon: '📨' } } }, { dur: 1 }])
    expect(bubbleAt(story, 'a', 0.5)?.icon).toBe('📨')
    expect(bubbleAt(story, 'a', 1.5)).toBeNull()
    expect(bubbleAt(story, 'b', 0.5)).toBeNull()
  })
})

describe('yawTowards', () => {
  it('keeps the old yaw when there is nowhere to turn to', () => {
    expect(yawTowards([1, 1], [1, 1], 0.7)).toBe(0.7)
  })
})
