/**
 * The privacy policy shown at /privacidade (and /privacy), in both languages. It describes what the site
 * actually does with personal data under Brazil's LGPD (Lei 13.709/2018); `docs/privacidade.md` is the
 * internal record of the same operations (art. 37) and must change together with this text.
 */
import type { L } from '../ui/roles'

/** When the text last changed, shown at the top. */
export const POLICY_UPDATED = '2026-10-26'

/** Who answers for the site and where to reach them about personal data. */
export const CONTROLLER = { name: 'Daniel Bernardes', contact: 'https://bernardes.dev', github: 'https://github.com/Yourdevdaniel' }

/** Where a person cancels the site's access to their GitHub account at any time. */
export const GITHUB_APPS_SETTINGS = 'https://github.com/settings/applications'

export type PolicySection = { title: L; paragraphs: L[]; items?: { title: L; text: L }[] }

export const POLICY_TITLE: L = { pt: 'Privacidade', en: 'Privacy' }

export const POLICY_LEAD: L = {
  pt: 'O Repartments não tem cadastro, banco de dados nem cookies. O estúdio está fechado para testes; hoje o site só mostra dados públicos do GitHub. Abaixo está, em detalhes, o que é tratado, para quê e por quanto tempo, como pede a Lei Geral de Proteção de Dados (LGPD).',
  en: "Repartments has no sign-up, no database and no cookies. The studio is closed for beta testing; today the site only shows public GitHub data. Below is, in detail, what is handled, what for and for how long, as Brazil's data protection law (LGPD) requires.",
}

export const POLICY: PolicySection[] = [
  {
    title: { pt: 'Quem é responsável', en: 'Who is responsible' },
    paragraphs: [
      {
        pt: `O controlador dos dados é ${CONTROLLER.name}, autor do Repartments. Pedidos sobre seus dados pessoais podem ser feitos pelo contato em ${CONTROLLER.contact}.`,
        en: `The data controller is ${CONTROLLER.name}, the author of Repartments. Requests about your personal data can be made through the contact at ${CONTROLLER.contact}.`,
      },
    ],
  },
  {
    title: { pt: 'O que é tratado, para quê e por quanto tempo', en: 'What is handled, what for and for how long' },
    paragraphs: [],
    items: [
      {
        title: { pt: 'Prédio (página inicial)', en: 'Building (home page)' },
        text: {
          pt: 'O nome de usuário que você digita e os dados públicos dessa conta no GitHub (repositórios públicos, linguagens, contagens) servem para desenhar o prédio. São dados que o titular tornou públicos, usados para essa finalidade (LGPD, art. 7º, IX e § 4º). A resposta fica em cache por cerca de 1 hora. Nenhum arquivo nem código é baixado: só nomes de tecnologias e números.',
          en: "The username you type and that account's public GitHub data (public repositories, languages, counts) are used to draw the building. This is data its owner made public, used for that purpose (LGPD, art. 7, IX and § 4). The answer is cached for about 1 hour. No file or code is downloaded: only technology names and numbers.",
        },
      },
      {
        title: { pt: 'Estúdio (fechado para testes)', en: 'Studio (closed for beta testing)' },
        text: {
          pt: 'O estúdio, onde se entrava com o GitHub para abrir um repositório, está fechado enquanto vira uma ferramenta. Hoje ele não recebe login, não lê repositório nenhum e não trata dado pessoal. O botão "Quero ser tester" leva ao formulário no site do projeto (repartments-site.vercel.app), que tem a própria política de privacidade. Se você autorizou o app do estúdio antes, pode revogar o acesso a qualquer momento nas configurações do GitHub (Settings → Applications).',
          en: "The studio, where you signed in with GitHub to open a repository, is closed while it becomes a tool. Today it takes no sign-in, reads no repository and handles no personal data. The \"I want to test it\" button takes you to the form on the project's site (repartments-site.vercel.app), which has its own privacy policy. If you authorised the studio's app before, you can revoke its access at any time in GitHub's settings (Settings → Applications).",
        },
      },
      {
        title: { pt: 'Registros técnicos', en: 'Technical logs' },
        text: {
          pt: 'A Vercel, que hospeda o site, registra o endereço IP e dados técnicos de cada acesso para operar e proteger o serviço (LGPD, art. 7º, IX), pelo prazo do plano de hospedagem. Para frear abusos, o nosso servidor conta quantos pedidos cada endereço IP fez no último minuto, só na memória, sem gravar em lugar nenhum. Os registros do nosso servidor nunca guardam chaves, cookies ou conteúdo de repositório.',
          en: 'Vercel, which hosts the site, logs the IP address and technical data of each request to run and protect the service (LGPD, art. 7, IX), for as long as the hosting plan keeps them. To curb abuse, our server counts how many requests each IP address made in the last minute, in memory only, never stored anywhere. Our server logs never keep keys, cookies or repository content.',
        },
      },
      {
        title: { pt: 'Cookies e armazenamento no navegador', en: 'Cookies and browser storage' },
        text: {
          pt: 'O site não usa cookies. O idioma que você escolhe fica guardado no armazenamento do próprio navegador.',
          en: "The site uses no cookies. The language you choose is remembered in the browser's own storage.",
        },
      },
    ],
  },
  {
    title: { pt: 'Quem mais participa', en: 'Who else is involved' },
    paragraphs: [
      {
        pt: 'O GitHub (GitHub, Inc.) fornece os dados públicos usados no prédio; a Vercel (Vercel Inc.) hospeda o site. As duas ficam nos Estados Unidos, o que é uma transferência internacional de dados (LGPD, art. 33), feita com as garantias contratuais que essas empresas oferecem. Não vendemos nem compartilhamos dados com mais ninguém.',
        en: 'GitHub (GitHub, Inc.) provides the public data the building uses; Vercel (Vercel Inc.) hosts the site. Both are in the United States, which is an international data transfer (LGPD, art. 33), made under the contractual safeguards these companies offer. We do not sell or share data with anyone else.',
      },
    ],
  },
  {
    title: { pt: 'Seus direitos', en: 'Your rights' },
    paragraphs: [
      {
        pt: 'Você pode pedir confirmação e acesso aos seus dados, correção, eliminação, informação sobre com quem são compartilhados e revogar a autorização (LGPD, art. 18). Como o site não guarda dados seus no servidor, quase tudo se resolve na hora: o prédio só mostra dados públicos, que somem do cache em cerca de 1 hora. Para o resto, use o contato acima.',
        en: 'You can ask for confirmation of and access to your data, correction, deletion, information about who it is shared with, and withdraw your authorisation (LGPD, art. 18). Since the site keeps no data of yours on its server, almost everything is solved right away: the building only shows public data, which leaves the cache in about 1 hour. For anything else, use the contact above.',
      },
    ],
  },
  {
    title: { pt: 'Segurança', en: 'Security' },
    paragraphs: [
      {
        pt: 'O token do servidor só lê dados públicos e nunca chega ao navegador; o site publicado é conferido para não conter segredos; e o site usa cabeçalhos de segurança e conexão cifrada (HTTPS). Se houver um incidente que possa trazer risco a você, avisaremos você e a Autoridade Nacional de Proteção de Dados (LGPD, art. 48).',
        en: "The server's token only reads public data and never reaches the browser; the published site is checked to contain no secrets; and the site uses security headers and an encrypted connection (HTTPS). If an incident could put you at risk, we will tell you and Brazil's National Data Protection Authority (LGPD, art. 48).",
      },
    ],
  },
  {
    title: { pt: 'Mudanças nesta política', en: 'Changes to this policy' },
    paragraphs: [
      {
        pt: 'Quando o site passar a tratar dados de outro jeito, este texto muda antes, e a data no topo é atualizada.',
        en: 'When the site starts handling data differently, this text changes first, and the date at the top is updated.',
      },
    ],
  },
]
