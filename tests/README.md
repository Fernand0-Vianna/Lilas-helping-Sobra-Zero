# Contas de teste — Sobra Zero (Squad Lilás)

Esta pasta guarda as **contas locais de teste**. Regras:

- `contas-teste.example.json` — modelo versionado (sem dados reais), pode commitar.
- `contas-teste.json` — arquivo **local e gitignorado** com os e-mails/senhas reais.
  Copie o modelo e preencha:

```bash
cp tests/contas-teste.example.json tests/contas-teste.json
```

- **Nunca commite senhas.** O `contas-teste.json` está no `.gitignore`.
- Roteiro de teste manual está dentro do próprio JSON (campo `roteiro`).

## Roteiro rápido

1. Doador publica oferta (`pages/publicar-oferta.html`)
2. Instituição aceita (`pages/oferta.html?id=...`)
3. Voluntário assume transporte, registra coleta e entrega
4. Instituição confirma recebimento (RN-07)
5. Conferir timeline e `pages/relatorio.html`
