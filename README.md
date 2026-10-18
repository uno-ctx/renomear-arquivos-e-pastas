# Renomear arquivos e pastas

Ferramenta local para Windows com interface no navegador. Escolha uma pasta, gere uma prévia, revise os nomes e confirme as alterações.

## Requisitos

- Windows com Windows PowerShell e .NET Framework.
- Node.js 24 (versão usada na validação).
- Navegador atualizado.

Não é necessário instalar pacotes npm. O aplicativo escuta apenas em `127.0.0.1` e não envia os arquivos para serviços externos.

## Como usar

1. Baixe ou clone este repositório e mantenha seus arquivos juntos.
2. Execute `Iniciar.bat`. Mantenha a janela do aplicativo aberta durante o uso.
3. Cole o caminho e clique em **Usar caminho**, ou deixe o campo vazio e clique em **Escolher pasta**.
4. Escolha a transformação e gere a prévia.
5. Edite os nomes propostos, selecione os itens e clique em **Aplicar alterações**.
6. Confira a confirmação e clique em **Sim, renomear**.

Para encerrar, feche a janela do iniciador. Não abra `public/index.html` diretamente.

## Recursos

- Maiúsculas e minúsculas.
- Remover ou converter espaços, hífens e underscores.
- Juntar nomes e sugerir separação de palavras em português e inglês.
- Substituição de trechos, prefixos e sufixos.
- Preservação opcional da extensão dos arquivos.
- Filtros para arquivos e pastas, edição individual na prévia e temas claro/escuro.
- Verificação de nomes inválidos, conflitos e itens modificados após a prévia.
- Tentativa de restauração dos nomes originais em caso de falha durante a aplicação.

Somente os itens diretamente dentro da pasta escolhida são considerados. Subpastas não são percorridas; itens ocultos e links de pasta são ignorados. A separação de palavras usa sugestões de dicionário e deve ser revisada. Programas com arquivos ou pastas abertos podem impedir a renomeação no Windows.

## Testes

Execute `Testar.bat` ou:

```powershell
node --test --test-concurrency=1 tests/renomear.test.cjs
```

A suíte cria seus próprios diretórios temporários, sem usar os projetos pessoais como dados de teste. Ela verifica as 15 transformações, proteção contra sobrescrita, restauração após falha parcial, bloqueio real pelo Windows, lotes de 500 arquivos e acesso ao dicionário após renomear a própria pasta do aplicativo.

Validação local de 18/10/2026: **59 testes aprovados, zero falhas**. O fluxo principal também foi exercitado pela interface. O diálogo nativo de seleção de pastas ainda tem validação visual pendente; outros computadores e compartilhamentos de rede não foram abrangidos. A automação no GitHub Actions executa a suíte em Windows.

## Arquivos principais

| Arquivo | Função |
| --- | --- |
| `Iniciar.bat` | Inicia a interface local |
| `server.js` | Servidor, transformações e aplicação dos nomes |
| `public/` | Interface HTML, CSS e JavaScript |
| `dictionary.gz` | Dicionário usado para sugerir separações |
| `tests/renomear.test.cjs` | Testes automatizados |
| `Testar.bat` | Executa a suíte no Windows |
| `Renomear_Pastas.bat` | Versão anterior com interface de terminal |

## Créditos do dicionário

Dados de Hermit Dave, [FrequencyWords](https://github.com/hermitdave/FrequencyWords): listas de [português brasileiro](https://github.com/hermitdave/FrequencyWords/blob/master/content/2016/pt_br/pt_br_50k.txt) e [inglês](https://github.com/hermitdave/FrequencyWords/blob/master/content/2016/en/en_50k.txt), de 2016.

O conteúdo dos dicionários é disponibilizado sob [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Adaptações: compressão, normalização de caixa e acentos para consulta e filtragem de entradas alfabéticas. Os dados derivados mantêm essa licença. Essa atribuição se refere aos dados; não concede uma licença adicional ao código do aplicativo.
