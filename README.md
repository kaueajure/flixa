# Flixa

Plataforma de entretenimento com catálogo de conteúdo, biblioteca pessoal, recursos sociais e uma área de esportes com agenda, resultados e vídeos quando a fonte permite incorporação.

## Funcionalidades

- catálogo e descoberta de conteúdo
- biblioteca pessoal
- perfis e configurações de usuário
- amigos e recursos sociais
- comunidades e fóruns
- área administrativa
- agenda esportiva e resultados
- reprodução por embeds externos quando compatível

## Stack

- Next.js 16
- React 19
- TypeScript
- Drizzle ORM
- MySQL
- Ably
- Tailwind CSS
- Cloudflare / Wrangler

## Rodando localmente

Requisitos:

- Node.js 22.13 ou superior
- npm

```bash
git clone https://github.com/kaueajure/flixa.git
cd flixa
npm install
cp .env.example .env
npm run dev
```

As integrações externas são opcionais e devem ser configuradas no `.env` conforme necessário.

## Banco de dados

O projeto usa Drizzle para schema e migrations.

```bash
npm run db:generate
npm run db:migrate
```

Para popular dados de desenvolvimento:

```bash
npm run db:seed
```

## Esportes

A área de esportes usa a TheSportsDB para agenda, eventos e resultados. O ScoreBat pode ser usado para vídeos e destaques de futebol.

```env
SPORTSDB_API_KEY=
SCOREBAT_API_TOKEN=
```

Quando não há uma fonte incorporável válida, o evento continua aparecendo como agenda ou resultado, sem player.

## Vídeo

Embeds externos são carregados em `iframe` com restrições de segurança. Provedores que exigem pop-up, bloqueiam incorporação ou não são compatíveis ficam desativados.

## Build e testes

```bash
npm run build
npm run validate:artifact
npm run lint
npm test
```

Para iniciar o build gerado:

```bash
npm start
```
