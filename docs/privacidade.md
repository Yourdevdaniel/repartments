# Privacidade e LGPD

Registro das operações com dados pessoais do Repartments (LGPD, art. 37) e o que fazer para mantê-lo em dia. O texto que o público lê está em `src/privacy/policy.ts` e aparece em `/privacidade` (e `/privacy`); os dois mudam juntos. Decisão em [ADR 0011](adr/0011-privacidade-e-lgpd.md).

Isto descreve o que o código faz. Não substitui a revisão de um advogado, que vale fazer antes de vender o estúdio a uma empresa (e com um contrato que diga o papel de cada um).

## Quem é quem

- **Controlador:** Daniel Bernardes, autor do Repartments. Contato público: o que está em `CONTROLLER.contact` (`src/privacy/policy.ts`).
- **Operadores (quem trata em nome do controlador):** GitHub, Inc. (login e repositórios) e Vercel Inc. (hospedagem e funções do servidor). Os dois ficam nos Estados Unidos.
- **Encarregado:** como agente de tratamento de pequeno porte, o projeto não precisa nomear um (Resolução CD/ANPD nº 2/2022), mas precisa manter um canal para os titulares: o contato acima.

## Inventário

| Operação | Dados | Titular | Finalidade | Base legal | Onde fica | Por quanto tempo |
|---|---|---|---|---|---|---|
| Prédio (página inicial) | nome de usuário pesquisado, dados públicos da conta no GitHub (repositórios públicos, linguagens, contagens) | dono da conta pesquisada | desenhar o prédio | dados tornados públicos pelo titular, usados para essa finalidade; legítimo interesse (art. 7º, IX e § 4º) | resposta em cache na borda da Vercel | ~1 hora |
| Login no estúdio | nome de usuário, nome e foto do GitHub; token de acesso só de leitura | quem entra | ler os repositórios que a pessoa escolheu | execução do serviço pedido (art. 7º, V) | o token passa pelo servidor só para ser trocado (sem gravação) e fica no cofre da aba | até 8 horas; cancelado no GitHub ao sair |
| Cookies do login | `gh_flow` (estado e PKCE), `gh_handoff` (entrega do token) | quem entra | proteger o login e entregar a chave à aba | execução do serviço (art. 7º, V); cookies estritamente necessários | navegador | 10 e 2 minutos |
| Análise e commits | código, nomes de arquivos, mensagens e autores de commits | empresa dona do repositório; desenvolvedores | montar a apresentação | execução do serviço (art. 7º, V) | só no navegador de quem analisa (`sessionStorage`) | enquanto a aba está aberta |
| Arquivos salvos | apresentação (pode ter autores de commits), roteiro, vídeo, PowerPoint | os mesmos | apresentar depois | o arquivo fica com quem o salvou, que passa a responder por ele | computador de quem salvou | a critério de quem salvou |
| Freio contra abuso | endereço IP e contagem de pedidos | quem acessa | evitar que um script esgote a cota do GitHub | legítimo interesse; segurança (art. 7º, IX; art. 46) | memória do servidor, sem gravação | janela de 1 minuto |
| Registros da hospedagem | endereço IP, data, caminho, navegador | quem acessa | operar e proteger o site | legítimo interesse (art. 7º, IX) | Vercel | prazo do plano da Vercel |

O que **não** existe: cadastro, banco de dados, sessão no servidor, cookies de análise ou propaganda, envio de código a serviços de IA.

## Transferência internacional

GitHub e Vercel tratam os dados nos Estados Unidos (LGPD, art. 33). A transferência se apoia nas cláusulas contratuais de proteção de dados que as duas empresas oferecem aos clientes. Ao publicar o site para terceiros, aceite o acordo de processamento de dados (DPA) da Vercel no painel da conta, e mantenha a política dizendo onde os dados são tratados.

## Direitos dos titulares (art. 18)

Como o servidor não guarda dados das pessoas, a maioria dos pedidos se resolve sem intervenção:

- **Acesso e eliminação:** "Sair" cancela o token; fechar a aba apaga o que estava nela; não há cópia no servidor.
- **Revogação:** a pessoa revoga o app em GitHub → Settings → Applications, a qualquer momento.
- **Dados do Prédio:** são públicos no GitHub; se o dono da conta pedir, o cache some sozinho em ~1 hora, e a conta pode ser deixada privada no próprio GitHub.
- **Outros pedidos:** pelo contato da política, com resposta em até 15 dias (art. 19, II).

## Segurança e incidentes

Medidas: token só de leitura e trancado longe dos scripts da página ([ADR 0002](adr/0002-token-so-no-navegador.md)), segredo do app só no servidor e conferido no build ([ADR 0008](adr/0008-continuar-com-github.md)), cabeçalhos de segurança e HTTPS, registros do servidor sem tokens, cookies ou conteúdo (testado em `server/logs.test.ts`).

Se houver um incidente que possa trazer risco ou dano relevante aos titulares (por exemplo, o segredo do app vazar): trocar o segredo no GitHub e na Vercel, avaliar o que foi exposto e comunicar a ANPD e os titulares afetados em prazo razoável (art. 48), registrando o que aconteceu e o que foi feito.

## Quando mudar este documento

Sempre que o site passar a tratar um dado novo, guardar algo por mais tempo, usar outro serviço ou criar um cookie. Os testes de `src/privacy/policy.test.ts` falham se o servidor criar um cookie que a política não cita. Atualize a política (`src/privacy/policy.ts`, com a data `POLICY_UPDATED`) e este inventário no mesmo commit.

## Pendências antes de publicar para clientes

- Definir um e-mail de contato para privacidade e trocar `CONTROLLER.contact` (hoje aponta para o site do autor).
- Aceitar o DPA da Vercel na conta que hospeda o site.
- Revisão jurídica da política e um contrato com o cliente que use o estúdio em nome dele.
