# Registro de decisões de arquitetura (ADR)

Cada decisão que muda a forma do sistema fica registrada aqui, no formato [MADR](https://adr.github.io/madr/): contexto, opções consideradas, decisão e consequências. Um ADR não é apagado quando a decisão muda: um novo ADR o substitui e o antigo passa a "substituído por".

| Nº | Decisão | Estado |
|---|---|---|
| [0001](0001-login-pelo-device-flow.md) | Login com o GitHub pelo device flow, sem segredo no servidor | Aceito |
| [0002](0002-token-so-no-navegador.md) | Token só na aba do navegador, que fala direto com o GitHub | Aceito |
| [0003](0003-analise-estatica-sem-llm.md) | Arquitetura por análise estática determinística, sem LLM | Aceito |
| [0004](0004-apresentacao-no-motor-de-historias.md) | Apresentação gerada sobre o motor de histórias existente | Aceito |
| [0005](0005-commits-como-cenas.md) | Commits como cenas com os moradores, não como lista e diff | Aceito |

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
