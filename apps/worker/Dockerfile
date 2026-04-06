FROM node:22-alpine
WORKDIR /app
RUN corepack enable

ENV DATABASE_URL=postgresql://postgres:postgres@postgres:5432/hashi_bot2

COPY package.json pnpm-workspace.yaml tsconfig.base.json .env.example ./
COPY apps/worker ./apps/worker
COPY packages ./packages
COPY prisma ./prisma

RUN pnpm install --no-frozen-lockfile

CMD ["pnpm", "--filter", "@hashi/worker", "dev"]
