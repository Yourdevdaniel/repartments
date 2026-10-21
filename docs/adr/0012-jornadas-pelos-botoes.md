# 0012. Jornadas do cliente lidas dos botões e das páginas

- Estado: aceito
- Data: 2026-10-09

## Contexto e problema

O cliente quer ver o que ele faz no sistema, passo a passo (cancelar uma reserva), e não o que a API recebe. As cenas só contavam rotas, um pedido HTTP por vez, sem dizer em que página a pessoa estava nem em que botão apertou.

## Opções consideradas

1. **Seguir os handlers entre arquivos.** Mostraria jornadas em mais casos, mas é caro e frágil por ora.
2. **Pedir à IA que descreva as jornadas.** Descartada: fere o [0003](0003-analise-estatica-sem-llm.md).
3. **Mostrar todos os botões.** Descartada: a cena ficaria longa demais.
4. **Ligar botão → chamada por leitura estática no mesmo arquivo**, sem LLM, e ler as páginas dos roteadores e de onde os arquivos ficam.

## Decisão

Opção 4 (`src/architecture/pages.ts`, `mounts.ts`, `flows.ts`, `details.ts`). O botão é ligado à chamada que o handler faz no mesmo arquivo, direto ou por uma função dele. As jornadas são contadas do lado da pessoa, no máximo 2, antes dos pedidos, e substituem o pedido da mesma rota. As páginas vêm dos roteadores do código e dos arquivos que são páginas pelo lugar onde ficam. Detalhes em [analise.md](../analise.md#jornadas).

## Consequências

- Jornadas só aparecem onde o handler e a chamada estão no mesmo arquivo; handler importado de outro arquivo não é seguido.
- Nenhuma LLM é chamada e a análise continua determinística.
- O roteiro do autor ([0010](0010-roteiro-do-autor.md)) continua podendo descrever qualquer jornada.
