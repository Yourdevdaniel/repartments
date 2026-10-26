import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { glass, Logo, ModeSwitch } from '../ui/kit'
import type { Lang } from '../ui/roles'

gsap.registerPlugin(ScrollTrigger)

/**
 * Where people sign up to test the new Repartments. Not decided yet; one place to change it.
 * For now it opens a pre-filled issue on the public repository.
 */
export const TESTER_URL = 'https://github.com/Yourdevdaniel/repartments/issues/new?title=Quero%20ser%20tester%20%2F%20I%20want%20to%20test&labels=beta'

const t = {
  pt: {
    title: 'O estúdio está fechado para testes',
    lead: 'Desculpe! Fechamos o estúdio ao público por um tempo. Estamos reconstruindo o Repartments para deixá-lo melhor e transformá-lo numa ferramenta que você usa no seu próprio computador.',
    cta: 'Quero ser tester',
    back: 'Ver o Prédio, que continua aberto',
    sign: 'Em obras',
    scroll: 'Role para saber mais',
    comingTitle: 'O que vem aí',
    coming: [
      ['💻', 'Na sua máquina', 'Uma ferramenta que roda no seu computador: seu código não sai dali, nem para o nosso servidor.'],
      ['⚡', 'Mais rápido', 'Sem esperar o site carregar cada repositório: o prédio se monta na hora, mesmo nos projetos grandes.'],
      ['🎬', 'Mais completo', 'Mais cenas, mais moradores e uma apresentação que você exporta do jeito que precisar.'],
    ],
    stepsTitle: 'Como funciona o beta',
    steps: [
      ['Inscreva-se', 'Clique em "Quero ser tester" e deixe seu interesse.'],
      ['A gente avisa', 'Quando a nova versão estiver pronta, você fica sabendo primeiro.'],
      ['Teste antes de todo mundo', 'Use, quebre, conte o que achou. É assim que ela fica boa.'],
    ],
    faqTitle: 'Perguntas frequentes',
    faq: [
      ['O que é o Repartments?', 'Ele transforma um repositório do GitHub numa apresentação animada: cada parte do sistema vira um morador de um prediozinho, e cada fluxo (uma compra, um cadastro) vira uma cena que eles encenam. É para explicar um sistema a quem não programa.'],
      ['O que era o estúdio?', 'Era onde você entrava com o GitHub, abria qualquer repositório seu, inclusive privado, via os commits e o mapa da arquitetura, e montava a apresentação para mostrar ao vivo, em vídeo ou em PowerPoint.'],
      ['Por que fechou?', 'Para fazer direito. O estúdio vai voltar como uma ferramenta: mais rápida, mais completa e rodando na sua máquina, sem depender de um site. Enquanto isso acontece, preferimos fechar a porta a deixar uma versão pela metade. Pedimos desculpas pelo incômodo.'],
      ['Como faço para testar?', 'Clique em "Quero ser tester" e deixe seu interesse. Quando a nova versão estiver pronta para testes, avisamos você primeiro.'],
      ['O Prédio continua?', 'Sim. A página inicial, que monta um prédio com os repositórios públicos de qualquer pessoa, continua aberta.'],
      ['E o que eu já tinha feito?', 'O estúdio nunca guardou seu código nem seus dados no nosso servidor: tudo ficava no seu navegador. Apresentações que você salvou continuam no seu computador.'],
    ],
    endTitle: 'Quer ver primeiro?',
    endLead: 'Entre na lista de testers e a gente chama você assim que a nova versão abrir a porta.',
  },
  en: {
    title: 'The studio is closed for beta testing',
    lead: "Sorry! We have closed the studio to the public for a while. We are rebuilding Repartments to make it better and turn it into a tool you use on your own computer.",
    cta: 'I want to test it',
    back: 'See the Building, which stays open',
    sign: 'Under works',
    scroll: 'Scroll to learn more',
    comingTitle: 'What is coming',
    coming: [
      ['💻', 'On your machine', 'A tool that runs on your computer: your code stays there, it never reaches our server.'],
      ['⚡', 'Faster', 'No waiting for a website to load each repository: the building comes together at once, even for big projects.'],
      ['🎬', 'More complete', 'More scenes, more residents, and a presentation you export however you need it.'],
    ],
    stepsTitle: 'How the beta works',
    steps: [
      ['Sign up', 'Click "I want to test it" and leave your interest.'],
      ['We let you know', 'When the new version is ready, you hear about it first.'],
      ['Try it before anyone else', 'Use it, break it, tell us what you think. That is how it gets good.'],
    ],
    faqTitle: 'Frequently asked questions',
    faq: [
      ['What is Repartments?', 'It turns a GitHub repository into an animated presentation: each part of the system becomes a resident of a little building, and each flow (a purchase, a sign-up) becomes a scene they act out. It is made for explaining a system to people who do not code.'],
      ['What was the studio?', 'It was where you signed in with GitHub, opened any of your repositories, private ones too, browsed the commits and the architecture map, and built the presentation to show live, as a video or as PowerPoint.'],
      ['Why is it closed?', 'To do it properly. The studio will come back as a tool: faster, more complete and running on your machine, without depending on a website. While that happens, we would rather close the door than leave a half-finished version up. We are sorry for the trouble.'],
      ['How do I take part in the tests?', 'Click "I want to test it" and leave your interest. When the new version is ready for testing, you will hear first.'],
      ['Is the Building still here?', 'Yes. The home page, which builds a tower from anyone\'s public repositories, stays open.'],
      ['What about what I had already made?', 'The studio never kept your code or data on our server: everything stayed in your browser. Presentations you saved are still on your computer.'],
    ],
    endTitle: 'Want to see it first?',
    endLead: 'Join the tester list and we will call you as soon as the new version opens its doors.',
  },
} as const

type Props = {
  owner: string | null
  repo: string | null
  lang: Lang
  setLang: (lang: Lang) => void
  onGo: (path: string) => void
  /** Back to the public building. */
  onTown: () => void
}

/** What /studio shows while the studio is being rebuilt: an apology, a way to sign up, and a FAQ. */
export function Beta({ lang, setLang, onTown }: Props) {
  const x = t[lang]
  const wrapper = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.title = `${x.title} · Repartments`
  }, [x.title])

  // Smooth scrolling on the page's own scroller, driven by GSAP's clock so ScrollTrigger stays in step.
  useEffect(() => {
    const el = wrapper.current
    if (!el || !content.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ wrapper: el, content: content.current, lerp: 0.09, autoRaf: false })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [])

  // Every entrance and scroll-linked motion lives here, redone when the language changes the text.
  useLayoutEffect(() => {
    const scroller = wrapper.current
    if (!scroller) return
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        ScrollTrigger.defaults({ scroller })
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
        intro
          .from('[data-a=badge]', { y: 12, autoAlpha: 0, duration: 0.5 })
          .from('[data-a=word]', { yPercent: 110, rotate: 4, duration: 0.8, stagger: 0.05 }, '-=0.2')
          .from('[data-a=lead]', { y: 18, autoAlpha: 0, duration: 0.7 }, '-=0.5')
          .from('[data-a=cta] > *', { y: 16, autoAlpha: 0, duration: 0.6, stagger: 0.1 }, '-=0.45')
          .from('[data-a=tower]', { y: 60, autoAlpha: 0, scale: 0.94, duration: 1.1, ease: 'expo.out' }, 0.2)
          .from('[data-a=floor]', { scaleY: 0, transformOrigin: '50% 100%', duration: 0.5, stagger: 0.08, ease: 'back.out(1.6)' }, 0.45)
          .from('[data-a=window]', { autoAlpha: 0, scale: 0.4, transformOrigin: '50% 50%', duration: 0.3, stagger: { each: 0.03, from: 'random' } }, 0.8)
          .from('[data-a=crane]', { rotate: -25, transformOrigin: '0% 100%', autoAlpha: 0, duration: 1, ease: 'elastic.out(1, 0.6)' }, 0.9)
          .from('[data-a=sign]', { y: -40, autoAlpha: 0, duration: 0.7, ease: 'bounce.out' }, 1.1)
          .from('[data-a=hint]', { autoAlpha: 0, y: -8, duration: 0.5 }, 1.4)

        // Life on the building site, forever.
        gsap.to('[data-a=sign]', { rotate: 5, transformOrigin: '50% 0%', duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.8 })
        gsap.to('[data-a=load]', { y: 12, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 })
        gsap.to('[data-a=window]', {
          fill: '#ffe08a',
          duration: 0.4,
          stagger: { each: 0.35, from: 'random', repeat: -1, yoyo: true, repeatDelay: 2.6 },
          delay: 2,
        })
        gsap.utils.toArray<HTMLElement>('[data-a=blob]').forEach((b, i) => {
          gsap.to(b, { x: i % 2 ? -60 : 60, y: i % 2 ? 40 : -50, scale: 1.15, duration: 9 + i * 2, ease: 'sine.inOut', yoyo: true, repeat: -1 })
        })

        // Parallax: the tower drifts and the backdrop sinks as the hero scrolls away.
        gsap.to('[data-a=tower]', { yPercent: -18, ease: 'none', scrollTrigger: { trigger: '[data-a=hero]', start: 'top top', end: 'bottom top', scrub: true } })
        gsap.to('[data-a=blobs]', { yPercent: 25, ease: 'none', scrollTrigger: { trigger: '[data-a=hero]', start: 'top top', end: 'bottom top', scrub: true } })
        gsap.to('[data-a=hint]', { autoAlpha: 0, scrollTrigger: { trigger: '[data-a=hero]', start: 'top top', end: '15% top', scrub: true } })

        gsap.utils.toArray<HTMLElement>('[data-a=heading]').forEach((h) => {
          gsap.from(h, { y: 30, autoAlpha: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: h, start: 'top 85%' } })
        })
        // The cards jump in as they come into view: a hop up, a bouncy landing, a little squash, and the icon pops.
        ScrollTrigger.batch('[data-a=card]', {
          scroller,
          start: 'top 88%',
          once: true,
          onEnter: (cards) =>
            cards.forEach((card, i) => {
              gsap
                .timeline({ delay: i * 0.15 })
                .fromTo(card, { y: 90, autoAlpha: 0 }, { y: -24, autoAlpha: 1, duration: 0.4, ease: 'power2.out' })
                .to(card, { y: 0, duration: 0.75, ease: 'bounce.out' })
                .to(card, { scaleY: 0.93, scaleX: 1.04, transformOrigin: '50% 100%', duration: 0.09, ease: 'power1.out' }, '-=0.62')
                .to(card, { scaleY: 1, scaleX: 1, duration: 0.6, ease: 'elastic.out(1, 0.35)' })
                .from(card.querySelector('[data-a=icon]'), { scale: 0, rotate: -40, duration: 0.6, ease: 'back.out(3)' }, 0.25)
            }),
        })
        gsap.set('[data-a=card]', { autoAlpha: 0 })
        gsap.from('[data-a=line]', { scaleY: 0, transformOrigin: '50% 0%', ease: 'none', scrollTrigger: { trigger: '[data-a=steps]', start: 'top 70%', end: 'bottom 60%', scrub: true } })
        gsap.utils.toArray<HTMLElement>('[data-a=step]').forEach((s) => {
          gsap.from(s, { x: -30, autoAlpha: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: s, start: 'top 80%' } })
          gsap.from(s.querySelector('[data-a=dot]'), { scale: 0, duration: 0.5, ease: 'back.out(2.5)', scrollTrigger: { trigger: s, start: 'top 75%' } })
        })
        ScrollTrigger.batch('[data-a=faq]', {
          scroller,
          start: 'top 90%',
          onEnter: (els) => gsap.from(els, { y: 24, autoAlpha: 0, duration: 0.6, stagger: 0.07, ease: 'power3.out', overwrite: true }),
        })
        gsap.from('[data-a=end]', { y: 50, scale: 0.96, autoAlpha: 0, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: '[data-a=end]', start: 'top 85%' } })
        return () => ScrollTrigger.defaults({ scroller: window })
      })
    }, scroller)
    return () => ctx.revert()
  }, [lang])

  return (
    <div ref={wrapper} className="relative h-dvh w-full overflow-y-auto bg-[#e4e9ff] text-ink">
      <div aria-hidden="true" data-a="blobs" className="pointer-events-none absolute inset-x-0 top-0 h-[120vh] overflow-hidden">
        <div data-a="blob" className="absolute -top-24 -left-24 size-[28rem] rounded-full bg-[#c7d2ff] blur-3xl" />
        <div data-a="blob" className="absolute top-40 right-[-8rem] size-[26rem] rounded-full bg-[#ffd9c7] opacity-80 blur-3xl" />
        <div data-a="blob" className="absolute top-[28rem] left-1/3 size-[22rem] rounded-full bg-[#cdeed9] opacity-70 blur-3xl" />
      </div>

      <div ref={content} className="relative">
        <header className="mx-auto flex w-[min(68rem,100%-2rem)] flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`${glass} flex items-center gap-2 px-3 py-2`}>
              <Logo />
              <span className="font-extrabold">Repartments</span>
            </span>
            <ModeSwitch mode="studio" lang={lang} onTown={onTown} onStudio={() => undefined} />
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
            className={`${glass} h-10 px-4 text-xs font-extrabold transition-colors hover:bg-white`}
            lang={lang === 'pt' ? 'en' : 'pt'}
          >
            {lang === 'pt' ? 'English' : 'Português'}
          </button>
        </header>

        <main className="mx-auto w-[min(68rem,100%-2rem)] pb-16">
          <section data-a="hero" className="relative grid min-h-[calc(100dvh-5rem)] items-center gap-8 py-8 md:grid-cols-[1.15fr_1fr]" aria-labelledby="beta-title">
            <div>
              <p data-a="badge" className="inline-flex items-center gap-2 rounded-full bg-[#ffe08a] px-3 py-1 text-xs font-extrabold uppercase tracking-wider">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ee9f7f] opacity-75 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2 rounded-full bg-[#e0795a]" />
                </span>
                beta
              </p>
              <h1 id="beta-title" className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-[-0.03em] md:text-6xl">
                {x.title.split(' ').map((w, i) => (
                  <span key={`${w}${i}`} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                    <span data-a="word" className="inline-block">
                      {w}
                    </span>
                    {' '}
                  </span>
                ))}
              </h1>
              <p data-a="lead" className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-ink-soft md:text-lg">
                {x.lead}
              </p>
              <div data-a="cta" className="mt-8 flex flex-wrap items-center gap-5">
                <Magnetic>
                  <a
                    href={TESTER_URL}
                    className="group inline-flex h-13 items-center gap-2 rounded-full bg-ink px-7 text-[15px] font-extrabold text-white shadow-[0_14px_30px_-12px_rgba(35,38,58,0.7)] transition-colors hover:bg-[#33374f]"
                  >
                    {x.cta}
                    <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                  </a>
                </Magnetic>
                <button type="button" onClick={onTown} className="text-sm font-extrabold underline decoration-2 underline-offset-4 hover:decoration-[#ee9f7f]">
                  {x.back}
                </button>
              </div>
            </div>

            <div data-a="tower" className="mx-auto w-full max-w-[26rem]">
              <Construction sign={x.sign} />
            </div>

            <p data-a="hint" className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-xs font-extrabold text-ink-soft md:flex">
              {x.scroll}
              <span aria-hidden="true" className="animate-bob">
                ↓
              </span>
            </p>
          </section>

          <section className="mt-16" aria-labelledby="beta-coming">
            <h2 id="beta-coming" data-a="heading" className="text-3xl font-extrabold tracking-[-0.02em] md:text-4xl">
              {x.comingTitle}
            </h2>
            <div data-a="cards" className="mt-8 grid gap-4 md:grid-cols-3">
              {x.coming.map(([icon, title, text]) => (
                <div key={title} data-a="card">
                  <article className={`${glass} group h-full p-6 transition-transform duration-300 hover:-translate-y-1`}>
                    <span data-a="icon" aria-hidden="true" className="inline-block">
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-[#eef1ff] text-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                        {icon}
                      </span>
                    </span>
                    <h3 className="mt-4 text-lg font-extrabold">{title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{text}</p>
                  </article>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-24" aria-labelledby="beta-steps">
            <h2 id="beta-steps" data-a="heading" className="text-3xl font-extrabold tracking-[-0.02em] md:text-4xl">
              {x.stepsTitle}
            </h2>
            <ol data-a="steps" className="relative mt-8 grid gap-8 pl-12">
              <span aria-hidden="true" className="absolute top-2 bottom-2 left-[15px] w-[3px] rounded-full bg-white/70" />
              <span aria-hidden="true" data-a="line" className="absolute top-2 bottom-2 left-[15px] w-[3px] rounded-full bg-gradient-to-b from-[#ee9f7f] via-[#ffd36b] to-[#3f9c8f]" />
              {x.steps.map(([title, text], i) => (
                <li key={title} data-a="step" className="relative">
                  <span data-a="dot" aria-hidden="true" className="absolute top-0 -left-12 flex size-8 items-center justify-center rounded-full bg-ink text-sm font-extrabold text-white ring-4 ring-[#e4e9ff]">
                    {i + 1}
                  </span>
                  <h3 className="text-xl font-extrabold">{title}</h3>
                  <p className="mt-1 max-w-[36rem] text-[15px] leading-relaxed text-ink-soft">{text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-24" aria-labelledby="beta-faq">
            <h2 id="beta-faq" data-a="heading" className="text-3xl font-extrabold tracking-[-0.02em] md:text-4xl">
              {x.faqTitle}
            </h2>
            <div className="mt-6 grid gap-3">
              {x.faq.map(([q, a]) => (
                <Faq key={q} q={q} a={a} />
              ))}
            </div>
          </section>

          <section data-a="end" className="relative mt-24 overflow-hidden rounded-[28px] bg-ink p-8 text-white md:p-12" aria-labelledby="beta-end">
            <div aria-hidden="true" className="absolute -top-20 -right-20 size-72 rounded-full bg-[#ee9f7f] opacity-30 blur-3xl" />
            <div aria-hidden="true" className="absolute -bottom-24 left-10 size-72 rounded-full bg-[#3f9c8f] opacity-30 blur-3xl" />
            <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 id="beta-end" className="text-3xl font-extrabold tracking-[-0.02em] md:text-4xl">
                  {x.endTitle}
                </h2>
                <p className="mt-2 max-w-[32rem] text-[15px] leading-relaxed text-white/75">{x.endLead}</p>
              </div>
              <Magnetic>
                <a href={TESTER_URL} className="inline-flex h-13 shrink-0 items-center gap-2 rounded-full bg-[#ffe08a] px-7 text-[15px] font-extrabold text-ink transition-colors hover:bg-white">
                  {x.cta} <span aria-hidden="true">→</span>
                </a>
              </Magnetic>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

/** A question that opens and closes with its answer sliding, instead of jumping. */
function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    if (first.current) {
      first.current = false
      gsap.set(el, { height: 0, autoAlpha: 0 })
      return
    }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const tween = gsap.to(el, { height: open ? 'auto' : 0, autoAlpha: open ? 1 : 0, duration: still ? 0 : 0.45, ease: 'power3.inOut' })
    return () => {
      tween.kill()
    }
  }, [open])
  return (
    <div data-a="faq" className={`${glass} transition-colors hover:bg-white`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-4 p-5 text-left text-[15px] font-extrabold md:p-6 md:text-base">
        {q}
        <span
          aria-hidden="true"
          className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef1ff] text-lg transition-transform duration-300 ${open ? 'rotate-45' : ''}`}
        >
          +
        </span>
      </button>
      <div ref={body} className="overflow-hidden">
        <p className="px-5 pb-5 text-[15px] leading-relaxed text-ink-soft md:px-6 md:pb-6">{a}</p>
      </div>
    </div>
  )
}

/** Leans its child a little toward the pointer, and lets it spring back when the pointer leaves. */
function Magnetic({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' })
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' })
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      xTo((e.clientX - r.left - r.width / 2) * 0.25)
      yTo((e.clientY - r.top - r.height / 2) * 0.35)
    }
    const leave = () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.4)' })
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [])
  return (
    <span ref={ref} className="inline-block">
      {children}
    </span>
  )
}

/** The studio's building, under works: floors in the house colors, a crane hoisting a block, a sign on the door. */
function Construction({ sign }: { sign: string }) {
  const floors = ['#ee9f7f', '#f3b38f', '#9fc6e8', '#bfe2b4']
  return (
    <svg viewBox="0 0 360 420" className="w-full drop-shadow-[0_30px_40px_rgba(40,52,110,0.25)]" role="img" aria-label={sign}>
      <ellipse cx="180" cy="398" rx="150" ry="14" fill="#c9d1f3" />
      <g data-a="crane">
        <rect x="270" y="40" width="10" height="358" rx="3" fill="#ffd36b" />
        <rect x="90" y="38" width="200" height="10" rx="3" fill="#ffd36b" />
        <path d="M275 48 L240 40 M275 48 L210 40" stroke="#e5b54a" strokeWidth="3" />
        <rect x="282" y="30" width="26" height="24" rx="4" fill="#3f4566" />
        <g data-a="load">
          <line x1="130" y1="48" x2="130" y2="88" stroke="#3f4566" strokeWidth="2" />
          <rect x="108" y="88" width="44" height="28" rx="5" fill="#3f9c8f" />
          <rect x="116" y="96" width="12" height="10" rx="2" fill="#ffe08a" />
          <rect x="132" y="96" width="12" height="10" rx="2" fill="#fff" />
        </g>
      </g>
      {floors.map((c, i) => (
        <g key={c} data-a="floor">
          <rect x="70" y={318 - i * 62} width="180" height="62" rx="8" fill={c} />
          {[0, 1, 2].map((w) => (
            <rect key={w} data-a="window" x={88 + w * 52} y={334 - i * 62} width="36" height="28" rx="5" fill={(w + i) % 3 ? '#ffffff' : '#ffe08a'} />
          ))}
        </g>
      ))}
      <rect x="62" y="122" width="196" height="12" rx="4" fill="#3f4566" />
      <path d="M70 134 L250 380 M250 134 L70 380" stroke="#3f4566" strokeOpacity="0.12" strokeWidth="4" />
      <rect x="150" y="350" width="22" height="30" rx="3" fill="#3f9c8f" />
      <g data-a="sign">
        <line x1="124" y1="318" x2="124" y2="352" stroke="#3f4566" strokeWidth="2" />
        <line x1="196" y1="318" x2="196" y2="352" stroke="#3f4566" strokeWidth="2" />
        <rect x="100" y="352" width="120" height="34" rx="8" fill="#23263a" />
        <text x="160" y="375" textAnchor="middle" fontSize="15" fontWeight="800" fill="#ffe08a" fontFamily="Nunito Variable, sans-serif">
          {sign}
        </text>
      </g>
    </svg>
  )
}
