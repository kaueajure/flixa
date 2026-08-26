<div align="center">

# 🎬 Flixa

### Entretenimento, descoberta de conteúdo e experiências sociais em um só lugar

Explore conteúdos, acompanhe esportes, organize sua biblioteca e interaja com outros usuários em uma plataforma moderna construída com React e Next.js.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=000)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Ready-F38020?style=flat-square&logo=cloudflare&logoColor=white)

</div>

---

## ✨ Sobre o projeto

O **Flixa** é uma plataforma de entretenimento e descoberta de conteúdo que combina catálogo, recursos sociais, biblioteca pessoal e experiências ligadas a esportes.

O projeto evoluiu além de um starter e hoje possui estrutura própria de aplicação, páginas autenticadas, configurações de usuário, administração, biblioteca, recursos sociais e integração com fontes externas.

## 🚀 Principais recursos

- 🎬 **Descoberta de conteúdo** em uma interface moderna
- 📚 **Biblioteca pessoal** para organizar itens salvos
- 👥 **Recursos sociais** e visualização de amigos
- 💬 **Comunidades e fóruns** dentro da plataforma
- ⚽ **Catálogo esportivo** com agenda, eventos e resultados
- ▶️ **Reprodução por embeds externos seguros** quando disponíveis
- 👤 **Conta e preferências do usuário**
- 🔐 **Autenticação** e áreas protegidas
- 🛠️ **Área administrativa**
- ☁️ **Estrutura preparada para Cloudflare**

## 🛠️ Stack

| Camada | Tecnologias |
| --- | --- |
| Aplicação | Next.js 16, React 19, TypeScript |
| Runtime / Build | Vinext, Vite |
| Banco de dados | Drizzle ORM, MySQL e suporte a ambientes Cloudflare |
| Infraestrutura | Cloudflare, Wrangler |
| Autenticação | bcrypt + integração opcional com autenticação do workspace |
| Tempo real | Ably |
| Estilos | Tailwind CSS |

## 🧩 Estrutura do projeto

A aplicação utiliza a pasta `app/` como núcleo da interface e das rotas.

Algumas áreas existentes no projeto incluem:

```text
app/
├── admin/            # área administrativa
├── api/              # rotas e serviços da aplicação
├── configuracoes/    # preferências do usuário
├── esportes/         # catálogo e agenda esportiva
├── login/            # autenticação
├── friends-view.tsx  # recursos sociais
└── library-view.tsx  # biblioteca pessoal
```

## 💻 Executando localmente

### Pré-requisitos

- Node.js `>= 22.13.0`
- npm

### 1. Clone o projeto

```bash
git clone https://github.com/kaueajure/flixa.git
cd flixa
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure o ambiente

Use o arquivo de exemplo como base:

```bash
cp .env.example .env
```

Preencha apenas as integrações que deseja utilizar.

### 4. Inicie o projeto

```bash
npm run dev
```

## 🗄️ Banco de dados

O projeto utiliza Drizzle para modelagem e migrations.

Gerar migrations:

```bash
npm run db:generate
```

Aplicar migrations:

```bash
npm run db:migrate
```

Popular dados de desenvolvimento quando necessário:

```bash
npm run db:seed
```

## ⚽ Catálogo esportivo

A seção de esportes pode utilizar a **TheSportsDB** para consultar eventos futuros, resultados e informações de múltiplas modalidades.

Quando configurado, o projeto também pode utilizar o **ScoreBat** para conteúdos incorporáveis de futebol.

```env
SPORTSDB_API_KEY=
SCOREBAT_API_TOKEN=
```

Eventos sem uma fonte incorporável válida continuam disponíveis como agenda ou resultado, sem gerar players fictícios.

## ▶️ Reprodução de vídeo

Embeds externos são utilizados apenas como contingência e são carregados em `iframe` com restrições de segurança.

Provedores incompatíveis com iframe, que exigem pop-ups ou que não estejam disponíveis são desativados.

## 📦 Build e validação

```bash
npm run build
npm run validate:artifact
```

Para iniciar uma versão construída:

```bash
npm start
```

O projeto também possui scripts específicos para o fluxo de build e validação em ambientes compatíveis com Cloudflare Sites.

## 🧪 Qualidade

```bash
npm run lint
npm test
```

---

<div align="center">

**Flixa** — uma experiência moderna para descobrir, acompanhar e compartilhar entretenimento.

</div>
