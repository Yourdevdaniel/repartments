# Registro de decisões de arquitetura (ADR)

Cada decisão que muda a forma do sistema fica registrada aqui, no formato [MADR](https://adr.github.io/madr/): contexto, opções consideradas, decisão e consequências. Um ADR não é apagado quando a decisão muda: um novo ADR o substitui e o antigo passa a "substituído por". A exceção são os ADRs do estúdio (0001 a 0005, 0007 a 0010, 0012 a 0014), que saíram junto com o código dele ([0015](0015-estudio-fechado.md)).

| Nº | Decisão | Estado |
|---|---|---|
| [0006](0006-escritorio-e-desvio-de-moveis.md) | Planta de escritório para cenas grandes, e moradores que desviam dos móveis | Aceito |
| [0011](0011-privacidade-e-lgpd.md) | Privacidade e LGPD: política no site, aviso no login, salvar sem nomes e registro das operações | Aceito (o estúdio, ver 0015) |
| [0015](0015-estudio-fechado.md) | Estúdio fechado para testes enquanto vira uma ferramenta; o código dele sai do repositório | Aceito |

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
