import { useEffect } from 'react'
import { glass, Logo, ModeSwitch } from '../ui/kit'
import type { Lang } from '../ui/roles'

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
    faqTitle: 'Perguntas frequentes',
    faq: [
      ['O que é o Repartments?', 'Ele transforma um repositório do GitHub numa apresentação animada: cada parte do sistema vira um morador de um prediozinho, e cada fluxo (uma compra, um cadastro) vira uma cena que eles encenam. É para explicar um sistema a quem não programa.'],
      ['O que era o estúdio?', 'Era onde você entrava com o GitHub, abria qualquer repositório seu, inclusive privado, via os commits e o mapa da arquitetura, e montava a apresentação para mostrar ao vivo, em vídeo ou em PowerPoint.'],
      ['Por que fechou?', 'Para fazer direito. O estúdio vai voltar como uma ferramenta: mais rápida, mais completa e rodando na sua máquina, sem depender de um site. Enquanto isso acontece, preferimos fechar a porta a deixar uma versão pela metade. Pedimos desculpas pelo incômodo.'],
      ['Como faço para testar?', 'Clique em "Quero ser tester" e deixe seu interesse. Quando a nova versão estiver pronta para testes, avisamos você primeiro.'],
      ['O Prédio continua?', 'Sim. A página inicial, que monta um prédio com os repositórios públicos de qualquer pessoa, continua aberta.'],
      ['E o que eu já tinha feito?', 'O estúdio nunca guardou seu código nem seus dados no nosso servidor: tudo ficava no seu navegador. Apresentações que você salvou continuam no seu computador.'],
    ],
  },
  en: {
    title: 'The studio is closed for beta testing',
    lead: "Sorry! We have closed the studio to the public for a while. We are rebuilding Repartments to make it better and turn it into a tool you use on your own computer.",
    cta: 'I want to test it',
    back: 'See the Building, which stays open',
    faqTitle: 'Frequently asked questions',
    faq: [
      ['What is Repartments?', 'It turns a GitHub repository into an animated presentation: each part of the system becomes a resident of a little building, and each flow (a purchase, a sign-up) becomes a scene they act out. It is made for explaining a system to people who do not code.'],
      ['What was the studio?', 'It was where you signed in with GitHub, opened any of your repositories, private ones too, browsed the commits and the architecture map, and built the presentation to show live, as a video or as PowerPoint.'],
      ['Why is it closed?', 'To do it properly. The studio will come back as a tool: faster, more complete and running on your machine, without depending on a website. While that happens, we would rather close the door than leave a half-finished version up. We are sorry for the trouble.'],
      ['How do I take part in the tests?', 'Click "I want to test it" and leave your interest. When the new version is ready for testing, you will hear first.'],
      ['Is the Building still here?', 'Yes. The home page, which builds a tower from anyone\'s public repositories, stays open.'],
      ['What about what I had already made?', 'The studio never kept your code or data on our server: everything stayed in your browser. Presentations you saved are still on your computer.'],
    ],
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
  useEffect(() => {
    document.title = `${x.title} · Repartments`
  }, [x.title])

  return (
    <div className="h-dvh w-full overflow-y-auto bg-[#e4e9ff] text-ink">
      <header className="mx-auto flex w-[min(60rem,100%-2rem)] items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <span className={`${glass} flex items-center gap-2 px-3 py-2`}>
            <Logo />
            <span className="font-extrabold">Repartments</span>
          </span>
          <ModeSwitch mode="studio" lang={lang} onTown={onTown} onStudio={() => undefined} />
        </div>
        <button
          type="button"
          onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
          className={`${glass} h-10 px-4 text-xs font-extrabold`}
          lang={lang === 'pt' ? 'en' : 'pt'}
        >
          {lang === 'pt' ? 'English' : 'Português'}
        </button>
      </header>

      <main className="mx-auto w-[min(60rem,100%-2rem)] pb-16">
        <section className={`${glass} mt-6 p-6 md:p-10`} aria-labelledby="beta-title">
          <p className="inline-block rounded-full bg-[#ffe08a] px-3 py-1 text-xs font-extrabold uppercase tracking-wider">beta</p>
          <h1 id="beta-title" className="mt-4 text-3xl leading-tight font-extrabold tracking-[-0.02em] md:text-5xl">
            {x.title}
          </h1>
          <p className="mt-4 max-w-[46rem] text-[17px] leading-relaxed text-ink-soft">{x.lead}</p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a href={TESTER_URL} className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[15px] font-extrabold text-white">
              {x.cta} →
            </a>
            <button type="button" onClick={onTown} className="text-sm font-extrabold underline underline-offset-4">
              {x.back}
            </button>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="beta-faq">
          <h2 id="beta-faq" className="px-1 text-xl font-extrabold">
            {x.faqTitle}
          </h2>
          <div className="mt-3 grid gap-2">
            {x.faq.map(([q, a]) => (
              <details key={q} className={`${glass} group p-4 md:p-5`}>
                <summary className="cursor-pointer list-none text-[15px] font-extrabold marker:hidden">
                  <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                  {q}
                </summary>
                <p className="mt-2 pl-5 text-[15px] leading-relaxed text-ink-soft">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
