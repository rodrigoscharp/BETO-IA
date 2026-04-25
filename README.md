# J.A.R.V.I.S — Assistente Pessoal Inteligente

> Just A Rather Very Intelligent System

Interface de assistente pessoal de voz e texto com visual sci-fi, powered by [Groq](https://groq.com) (llama3-70b-8192).

---

## Funcionalidades

- **Orbe animado** que reage ao estado: idle, ouvindo, processando, falando
- **Reconhecimento de voz** via Web Speech API (pt-BR)
- **Síntese de voz** — J.A.R.V.I.S fala as respostas em português
- **Chat de texto** como alternativa ao microfone
- **Histórico de conversa** com contexto de sessão
- Interface sci-fi com grid, glow e tipografia futurista

---

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Groq SDK (`groq-sdk`)
- Web Speech API (nativa do navegador)

---

## Rodando localmente

### Pré-requisitos

- Node.js 18+
- Chave de API do Groq — [console.groq.com](https://console.groq.com)

### Instalação

```bash
# Clone o repositório
git clone <seu-repo>
cd jarvis

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.local.example .env.local
# Edite .env.local e adicione sua GROQ_API_KEY

# Inicie o servidor de desenvolvimento
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

---

## Deploy na Vercel

1. **Fork/clone** este repositório para sua conta GitHub
2. Acesse [vercel.com](https://vercel.com) e crie um novo projeto
3. Importe o repositório do GitHub
4. Na aba **Environment Variables**, adicione:
   - `GROQ_API_KEY` = `sua_chave_do_groq`
5. Clique em **Deploy** — a Vercel detecta Next.js automaticamente

A cada push para `main`, a Vercel faz deploy automático.

---

## Variáveis de ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `GROQ_API_KEY` | Chave da API do Groq | Sim |

---

## Notas sobre reconhecimento de voz

A Web Speech API é suportada principalmente no **Google Chrome** e **Microsoft Edge**. No Safari e Firefox o suporte pode ser limitado. O campo de texto funciona em todos os navegadores.

Para melhor experiência de voz, use Chrome no desktop ou Android.

---

## Licença

MIT
