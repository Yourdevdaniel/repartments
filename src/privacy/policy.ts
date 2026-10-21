/**
 * The privacy policy shown at /privacidade (and /privacy), in both languages. It describes what the site
 * actually does with personal data under Brazil's LGPD (Lei 13.709/2018); `docs/privacidade.md` is the
 * internal record of the same operations (art. 37) and must change together with this text.
 */
import type { L } from '../ui/roles'

/** When the text last changed, shown at the top. */
export const POLICY_UPDATED = '2026-10-08'

/** Who answers for the site and where to reach them about personal data. */
export const CONTROLLER = { name: 'Daniel Bernardes', contact: 'https://bernardes.dev', github: 'https://github.com/Yourdevdaniel' }

/** Where a person cancels the site's access to their GitHub account at any time. */
export const GITHUB_APPS_SETTINGS = 'https://github.com/settings/applications'

export type PolicySection = { title: L; paragraphs: L[]; items?: { title: L; text: L }[] }

export const POLICY_TITLE: L = { pt: 'Privacidade', en: 'Privacy' }

export const POLICY_LEAD: L = {
  pt: 'O Repartments não tem cadastro, banco de dados nem cookies de propaganda. O código dos seus repositórios é lido no seu próprio navegador e não passa pelos nossos servidores. Abaixo está, em detalhes, o que é tratado, para quê e por quanto tempo, como pede a Lei Geral de Proteção de Dados (LGPD).',
  en: "Repartments has no sign-up, no database and no advertising cookies. Your repositories' code is read in your own browser and never goes through our servers. Below is, in detail, what is handled, what for and for how long, as Brazil's data protection law (LGPD) requires.",
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
        title: { pt: 'Estúdio: entrar com o GitHub', en: 'Studio: signing in with GitHub' },
        text: {
          pt: 'Você entra no próprio site do GitHub; sua senha nunca passa por aqui. O estúdio recebe seu nome de usuário, nome e foto do GitHub e uma chave de acesso que só lê os repositórios que você escolheu. A chave passa pelo nosso servidor apenas para ser trocada com o GitHub, sem ser gravada, e fica trancada na aba do seu navegador por no máximo 8 horas. Ao sair, ou quando as 8 horas acabam, ela é cancelada no GitHub. Base legal: execução do serviço que você pediu (LGPD, art. 7º, V).',
          en: "You sign in on GitHub's own site; your password never comes here. The studio receives your GitHub username, name and avatar and an access key that only reads the repositories you chose. The key goes through our server only to be exchanged with GitHub, without being stored, and stays locked in your browser tab for 8 hours at most. When you sign out, or the 8 hours end, it is cancelled at GitHub. Legal basis: carrying out the service you asked for (LGPD, art. 7, V).",
        },
      },
      {
        title: { pt: 'Estúdio: código e commits', en: 'Studio: code and commits' },
        text: {
          pt: 'O código e os commits vêm do GitHub direto para o seu navegador, e a análise roda nele. Os nomes de quem fez cada commit aparecem na tela. Nada disso é enviado aos nossos servidores, e nenhum serviço de inteligência artificial lê o código.',
          en: 'Code and commits come from GitHub straight to your browser, and the analysis runs there. The names of who made each commit show on screen. None of this is sent to our servers, and no artificial intelligence service reads the code.',
        },
      },
      {
        title: { pt: 'Arquivos que você salva', en: 'Files you save' },
        text: {
          pt: 'Apresentação, roteiro (repartments.json), vídeo e PowerPoint são montados no seu navegador e ficam com você. A apresentação salva pode levar nomes de autores de commits; há a opção de salvar sem esses nomes. Quem guarda e compartilha esses arquivos passa a responder por eles.',
          en: 'Presentation, script (repartments.json), video and PowerPoint are put together in your browser and stay with you. A saved presentation may carry the names of commit authors; there is an option to save without them. Whoever keeps and shares these files becomes responsible for them.',
        },
      },
      {
        title: { pt: 'Prompt para a IA', en: 'Prompt for the AI' },
        text: {
          pt: 'O botão "Copiar prompt para a IA" só copia um texto para a sua área de transferência; o site não envia nada. O texto leva nomes de arquivos, nomes tirados do código (como o de uma tela ou de uma ferramenta) e descrições, não o conteúdo dos arquivos. Se você colar em uma IA, vale o que essa IA diz sobre os seus dados.',
          en: "The \"Copy prompt for the AI\" button only copies a text to your clipboard; the site sends nothing. The text carries file names, names taken from the code (such as a screen's or a tool's) and descriptions, not the files' contents. If you paste it into an AI, that AI's own terms about your data apply.",
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
          pt: 'Só existem dois cookies, ambos necessários ao login: gh_flow (10 minutos, protege contra retornos forjados) e gh_handoff (2 minutos, entrega a chave à aba). Nenhum cookie de análise ou propaganda. O idioma e o que você está analisando ficam no armazenamento do próprio navegador e somem ao fechar a aba (o idioma fica guardado).',
          en: 'There are only two cookies, both needed to sign in: gh_flow (10 minutes, guards against forged returns) and gh_handoff (2 minutes, hands the key to the tab). No analytics or advertising cookies. The language and what you are analysing stay in the browser\'s own storage and go away when you close the tab (the language is remembered).',
        },
      },
    ],
  },
  {
    title: { pt: 'Quem mais participa', en: 'Who else is involved' },
    paragraphs: [
      {
        pt: 'O GitHub (GitHub, Inc.) faz o login e guarda os repositórios; a Vercel (Vercel Inc.) hospeda o site e o servidor de login. As duas ficam nos Estados Unidos, o que é uma transferência internacional de dados (LGPD, art. 33), feita com as garantias contratuais que essas empresas oferecem. Não vendemos nem compartilhamos dados com mais ninguém.',
        en: 'GitHub (GitHub, Inc.) handles sign-in and keeps the repositories; Vercel (Vercel Inc.) hosts the site and the sign-in server. Both are in the United States, which is an international data transfer (LGPD, art. 33), made under the contractual safeguards these companies offer. We do not sell or share data with anyone else.',
      },
    ],
  },
  {
    title: { pt: 'Seus direitos', en: 'Your rights' },
    paragraphs: [
      {
        pt: 'Você pode pedir confirmação e acesso aos seus dados, correção, eliminação, informação sobre com quem são compartilhados e revogar a autorização (LGPD, art. 18). Como o site não guarda dados seus no servidor, quase tudo se resolve na hora: "Sair" cancela a chave, fechar a aba apaga o que estava nela, e o acesso do app pode ser revogado a qualquer momento nas configurações do GitHub (Settings → Applications). Para o resto, use o contato acima.',
        en: 'You can ask for confirmation of and access to your data, correction, deletion, information about who it is shared with, and withdraw your authorisation (LGPD, art. 18). Since the site keeps no data of yours on its server, almost everything is solved right away: "Sign out" cancels the key, closing the tab erases what was in it, and the app\'s access can be revoked at any time in GitHub\'s settings (Settings → Applications). For anything else, use the contact above.',
      },
    ],
  },
  {
    title: { pt: 'Segurança', en: 'Security' },
    paragraphs: [
      {
        pt: 'A chave de acesso só faz leituras e fica fora do alcance dos scripts da página; o segredo do app fica só no servidor; o site publicado é conferido para não conter segredos; e o site usa cabeçalhos de segurança e conexão cifrada (HTTPS). Se houver um incidente que possa trazer risco a você, avisaremos você e a Autoridade Nacional de Proteção de Dados (LGPD, art. 48).',
        en: "The access key only reads and is kept out of the page's scripts' reach; the app's secret stays only on the server; the published site is checked to contain no secrets; and the site uses security headers and an encrypted connection (HTTPS). If an incident could put you at risk, we will tell you and Brazil's National Data Protection Authority (LGPD, art. 48).",
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
