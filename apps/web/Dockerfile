FROM node:22-alpine
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json .env.example ./
COPY apps/web ./apps/web
COPY packages ./packages
COPY prisma ./prisma

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @hashi/web build

EXPOSE 3000
CMD ["pnpm", "--filter", "@hashi/web", "start"]
