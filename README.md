# 🚦 CTTU Recife - Painel de Monitoramento Operacional & Simulador de Crises

Este projeto é uma plataforma completa e interativa de monitoramento operacional e simulação de inteligência de tráfego para a **CTTU (Autarquia de Trânsito e Transporte Urbano do Recife)**, com base nos dados reais do ano de 2026.

A aplicação conta com um painel (dashboard) analítico robusto, análise de agentes e orientadores de trânsito em tempo real, filtros dinâmicos de bairros/endereços e um **Simulador de Eventos e Crises** potencializado por Inteligência Artificial (Google Gemini).

---

## 🚀 Como Exportar e Integrar com o GitHub

Para colocar este projeto no seu GitHub diretamente pelo **Google AI Studio**, siga estes passos simples:

1. No canto superior direito do Google AI Studio, clique no **Menu de Configurações** (ícone de engrenagem) ou na opção **Exportar/Compartilhar**.
2. Selecione a opção **Export to GitHub** (Exportar para o GitHub).
3. Conecte sua conta do GitHub caso ainda não tenha feito.
4. Escolha se deseja criar um novo repositório (público ou privado) ou integrar em um repositório existente.
5. Confirme o envio! O código completo com este README, o servidor em Express e o frontend em React serão enviados diretamente para a sua conta.

---

## 💻 Como Rodar e Testar Localmente (No Computador)

Uma vez clonado o repositório do seu GitHub para o computador local, siga as demais etapas para colocá-lo para rodar.

### 1. Pré-requisitos
Certifique-se de que você tem instalado em sua máquina:
* **Node.js** (versão 18 ou superior recomendada)
* Um gerenciador de pacotes como **npm** (instalado nativamente junto com o Node)

### 2. Configurar Variáveis de Ambiente
Na raiz do projeto, crie um arquivo chamado `.env` baseado no exemplo `.env.example`:

```bash
# Copie as configurações default do exemplo
cp .env.example .env
```

Abra o arquivo `.env` e adicione a sua chave de API do Gemini para que o Simulador de IA e a ficha de orientadores funcionem corretamente:

```env
GEMINI_API_KEY="SUA_CHAVE_API_DO_GEMINI_AQUI"
APP_URL="http://localhost:3000"
```
> *Nota: Você pode conseguir uma chave de API gratuita acessando o [Google AI Studio](https://aistudio.google.com/).*

### 3. Instalar as Dependências
Abra o prompt de comando ou terminal na pasta raiz do projeto e execute:

```bash
npm install
```

### 4. Executar em Modo de Desenvolvimento
Para levantar a aplicação local com atualizações automáticas de código (hot reload), de modo full-stack (servidor + cliente), rode:

```bash
npm run dev
```

A aplicação estará acessível no seu navegador pelo endereço:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🛠️ Scripts Úteis (package.json)

No arquivo `package.json` você encontrará os seguintes comandos prontos:

* **`npm run dev`**: Inicializa o servidor backend Express (via `tsx`) com Vite rodando em modo middleware para compilar o React em tempo real.
* **`npm run build`**: Gera o build estático de produção do React (salvo em `/dist`) e empacota o servidor Node local para ser executado de forma rápida e otimizada (em formato CommonJS em `dist/server.cjs`).
* **`npm run start`**: Executa a aplicação construída na versão de produção otimizada.
* **`npm run lint`**: Executa o verificador do TypeScript (`tsc --noEmit`) para garantir integridade estática no código sem falhas tipadas.
* **`npm run clean`**: Limpa as pastas construídas temporárias (`/dist`).

---

## 🌐 Como Deixar Pronto para Visualização na Web (Hospedagem)

Como este é um projeto **Full-Stack** (possui um servidor backend Express em `server.ts` que gerencia os dados do dataset CTTU, faz proxy das chaves de segurança da API da OpenAI/Gemini e atua no processamento das crises), existem duas maneiras principais de hospedá-lo:

### Opção A: Hospedagem Full-Stack Completa (Recomendada/Servidor + Front)
Para que todas as funcionalidades funcionem sem limitações externas (incluindo o backend em Express), hospede em plataformas robustas de containers ou NodeJS:

1. **Render (render.com)**:
   * Crie um novo **Web Service** no Render conectado ao seu Git.
   * Defina o comando de build como: `npm install && npm run build`.
   * Defina o comando de inicialização (Start Command) como: `npm start`.
   * Nas configurações de ambiente, adicione a variável `GEMINI_API_KEY` com o seu token correspondente.

2. **Google Cloud Run** (A mesma infra inteligível e escalável que o AI Studio utiliza):
   * A aplicação já está otimizada para o Cloud Run. Fornecemos as portas de escuta internas direcionadas para a porta `3000`, perfeitas para containers sem fricção.

3. **Railway (railway.app)**:
   * Conecte com o Git e ele lerá o setup de Node.js e rodará os comandos de Build e Start nativos do `package.json`.

---

## 📂 Visão Geral da Estrutura

* **`server.ts`**: Servidor Express com a carga incremental do dataset operacional 2026 e endpoints REST para distribuição analítica e conexão segura com o Google Gemini.
* **`src/App.tsx`**: Interface do painel de monitoramento dinâmico codificada com componentes Tailwind altamente minimalistas, modernos, gráficos analíticos interativos (via Recharts), e painéis táticos de simulação urbana.
* **`src/index.css`**: Configuração central de design, contendo as fontes integradas de alta definição, os temas globais escuros de alto contraste e transições animadas sofisticadas.
* **`.env.example`**: Configurações de documentação para guiar a inserção de chaves sem expor credenciais privadas no Git.
