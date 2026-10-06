import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AnimationMixer,
  type AnimationAction,
  type AnimationClip,
  type Group,
  type Mesh,
  type Sprite,
  type SpriteMaterial,
} from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { badgeTexture } from './badge'
import { bubbleTexture } from './bubble'
import { useSceneLang } from './lang'
import { bubbleAt, flagAt, sample, type AnimName, type Story } from './story'
import { useStoryTime } from './time'
import { useWeather } from './weather'

const FADE = 0.22
const BADGE_HEIGHT = 0.15
const BUBBLE_HEIGHT = 0.2
/** Kenney's characters are big next to the furniture kit; this makes them chibi-sized. */
export const CHARACTER_SCALE = 0.8

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
  /** Name tag over the head; passers-by in the street have none. */
  label?: string
  color?: string
  /** Height of the floor this resident stands on. */
  y?: number
  /** Seconds added to the shared clock, so several people on one story don't move in step. */
  offset?: number
  /** A story flag that hides this person (someone who went inside the building). */
  hideFlag?: string
  /** Opens an umbrella when it rains. */
  umbrella?: boolean
}

export function Resident({ id, model, story, label, color = '#999', y = 0, offset = 0, hideFlag, umbrella = false }: Props) {
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

  const badge = useMemo(() => (label ? badgeTexture(label, color) : null), [label, color])
  const weather = useWeather()
  const brolly = useRef<Group>(null)
  const lang = useSceneLang()
  const bubble = useRef<Sprite>(null)
  const bubbleMaterial = useRef<SpriteMaterial>(null)
  const said = useRef({ key: '', aspect: 1, pop: 0 })
  const playing = useRef<{ main: string; carry: boolean }>({ main: '', carry: false })
  const yaw = useRef<number | null>(null)

  useFrame((_, delta) => {
    const t = time.current + offset
    const pose = sample(story, id, t)
    const group = root.current
    if (!group) return
    group.visible = !(hideFlag && flagAt(story, hideFlag, t))
    if (brolly.current) {
      const target = umbrella && weather === 'rain' ? 1 : 0
      const s = brolly.current.scale.x + (target - brolly.current.scale.x) * Math.min(1, delta * 4)
      brolly.current.scale.setScalar(s)
      brolly.current.visible = s > 0.02
    }

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

    // Speech bubble: swap the picture when the line changes and pop it in.
    const line = bubbleAt(story, id, t)
    const key = line ? `${line.icon}|${line.text?.[lang] ?? ''}` : ''
    const s = said.current
    const sprite = bubble.current
    const material = bubbleMaterial.current
    if (!sprite || !material) return
    if (key !== s.key) {
      s.key = key
      s.pop = time.paused ? 1 : 0
      if (line) {
        const tex = bubbleTexture(line.icon, line.text?.[lang])
        material.map = tex.texture
        material.needsUpdate = true
        s.aspect = tex.aspect
      }
    }
    sprite.visible = key !== ''
    if (sprite.visible) {
      s.pop = Math.min(1, s.pop + delta * 6)
      const k = 1 - Math.pow(1 - s.pop, 3)
      const overshoot = 1 + Math.sin(k * Math.PI) * 0.12
      sprite.scale.set(BUBBLE_HEIGHT * s.aspect * k * overshoot, BUBBLE_HEIGHT * k * overshoot, 1)
      material.opacity = k
    }
  })

  return (
    <group ref={root}>
      <primitive object={scene} scale={CHARACTER_SCALE} />
      {badge && (
        <sprite position={[0, 0.74, 0]} scale={[BADGE_HEIGHT * badge.aspect, BADGE_HEIGHT, 1]} center={[0.5, 0]}>
          <spriteMaterial map={badge.texture} transparent depthWrite={false} />
        </sprite>
      )}
      {umbrella && (
        <group ref={brolly} position={[0.1, 0, 0.05]} scale={0} visible={false}>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.5, 6]} />
            <meshStandardMaterial color="#4a4f66" />
          </mesh>
          <mesh position={[0, 0.78, 0]} castShadow>
            <coneGeometry args={[0.32, 0.14, 10, 1, true]} />
            <meshStandardMaterial color={color} roughness={0.7} side={2} />
          </mesh>
        </group>
      )}
      <sprite ref={bubble} position={[0, 0.92, 0]} center={[0.5, 0]} visible={false} renderOrder={2}>
        <spriteMaterial ref={bubbleMaterial} transparent depthWrite={false} depthTest={false} />
      </sprite>
    </group>
  )
}
