import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AnimationMixer, type AnimationAction, type AnimationClip, type Group, type Mesh } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { badgeTexture } from './badge'
import { sample, type AnimName, type Story } from './story'
import { useStoryTime } from './time'

const FADE = 0.22
const BADGE_HEIGHT = 0.16
/** Kenney's characters are big next to the furniture kit; this makes them chibi-sized. */
export const CHARACTER_SCALE = 0.72

/** Clips without arm tracks, so a carrying pose can drive the arms while the legs keep walking. */
function withoutArms(clip: AnimationClip) {
  const copy = clip.clone()
  copy.name = `${clip.name}~legs`
  copy.tracks = copy.tracks.filter((t) => !t.name.startsWith('arm-'))
  return copy
}

type Props = {
  id: string
  model: string
  story: Story
  label: string
  color: string
  /** Height of the floor this resident stands on. */
  y?: number
}

export function Resident({ id, model, story, label, color, y = 0 }: Props) {
  const gltf = useGLTF(`/models/characters/${model}.glb`)
  const root = useRef<Group>(null)
  const time = useStoryTime()

  const scene = useMemo(() => {
    const copy = clone(gltf.scene)
    copy.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = true
    })
    return copy
  }, [gltf.scene])

  const { mixer, actions } = useMemo(() => {
    const mixer = new AnimationMixer(scene)
    const actions = new Map<string, AnimationAction>()
    for (const clip of gltf.animations) {
      actions.set(clip.name, mixer.clipAction(clip))
      if (clip.name === 'idle' || clip.name === 'walk') {
        const legs = withoutArms(clip)
        actions.set(legs.name, mixer.clipAction(legs))
      }
    }
    return { mixer, actions }
  }, [scene, gltf.animations])

  useEffect(() => () => void mixer.stopAllAction(), [mixer])

  const badge = useMemo(() => badgeTexture(label, color), [label, color])
  const playing = useRef<{ main: string; carry: boolean }>({ main: '', carry: false })
  const yaw = useRef<number | null>(null)

  useFrame((_, delta) => {
    const t = time.current
    const pose = sample(story, id, t)
    const group = root.current
    if (!group) return

    group.position.set(pose.x, y, pose.z)
    // Turn smoothly instead of snapping when a walk changes direction.
    if (yaw.current === null) yaw.current = pose.yaw
    let diff = pose.yaw - yaw.current
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    yaw.current += diff * Math.min(1, delta * 10)
    group.rotation.y = yaw.current

    const base: AnimName = pose.anim
    const main = pose.carrying && (base === 'idle' || base === 'walk') ? `${base}~legs` : base
    const now = playing.current
    if (main !== now.main) {
      const next = actions.get(main) ?? actions.get('idle')!
      const prev = now.main ? actions.get(now.main) : undefined
      next.reset().setEffectiveWeight(1).play()
      if (time.paused) prev?.stop()
      else {
        next.fadeIn(FADE)
        prev?.fadeOut(FADE)
      }
      now.main = main
    }
    if (pose.carrying !== now.carry) {
      const hold = actions.get('holding-both')
      if (hold) {
        if (pose.carrying) {
          hold.reset().setEffectiveWeight(1).play()
          if (!time.paused) hold.fadeIn(FADE)
        } else if (time.paused) hold.stop()
        else hold.fadeOut(FADE)
      }
      now.carry = pose.carrying
    }
    mixer.update(time.paused ? 1e-4 : delta)
  })

  return (
    <group ref={root}>
      <primitive object={scene} scale={CHARACTER_SCALE} />
      <sprite position={[0, 0.68, 0]} scale={[BADGE_HEIGHT * badge.aspect, BADGE_HEIGHT, 1]} center={[0.5, 0]}>
        <spriteMaterial map={badge.texture} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}
