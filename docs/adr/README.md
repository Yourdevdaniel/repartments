# Registro de decisões de arquitetura (ADR)

Cada decisão que muda a forma do sistema fica registrada aqui, no formato [MADR](https://adr.github.io/madr/): contexto, opções consideradas, decisão e consequências. Um ADR não é apagado quando a decisão muda: um novo ADR o substitui e o antigo passa a "substituído por".

| Nº | Decisão | Estado |
|---|---|---|
| [0001](0001-login-pelo-device-flow.md) | Login com o GitHub pelo device flow, sem segredo no servidor | Aceito |
| [0002](0002-token-so-no-navegador.md) | Token trancado num worker do navegador, só leituras, 8 horas no máximo | Aceito |
| [0003](0003-analise-estatica-sem-llm.md) | Arquitetura por análise estática determinística, sem LLM | Aceito |
| [0004](0004-apresentacao-no-motor-de-historias.md) | Apresentação gerada sobre o motor de histórias existente | Aceito |
| [0005](0005-commits-como-cenas.md) | Commits como cenas com os moradores, não como lista e diff | Aceito |
| [0006](0006-escritorio-e-desvio-de-moveis.md) | Planta de escritório para cenas grandes, e moradores que desviam dos móveis | Aceito |
| [0007](0007-video-e-powerpoint-no-navegador.md) | Vídeo e PowerPoint feitos no próprio navegador | Aceito |
| [0008](0008-continuar-com-github.md) | Botão "Continuar com GitHub", com o segredo só para trocar o código | Aceito |
| [0009](0009-funcionalidades-pelo-readme-e-pela-interface.md) | O que o sistema faz vem do README e da interface, não só da arquitetura | Aceito |
| [0010](0010-roteiro-do-autor.md) | Roteiro do autor: um repartments.json escrito pela IA do cliente, sem LLM no estúdio | Aceito |
| [0011](0011-privacidade-e-lgpd.md) | Privacidade e LGPD: política no site, aviso no login, salvar sem nomes e registro das operações | Aceito |

Para uma decisão nova, copie o modelo abaixo para `NNNN-titulo-curto.md` e adicione a linha na tabela.

```markdown
# NNNN. Título

- Estado: proposto | aceito | substituído por NNNN
- Data: AAAA-MM-DD

## Contexto e problema
## Opções consideradas
## Decisão
## Consequências
```
