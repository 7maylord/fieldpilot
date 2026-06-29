FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY backend/ .
RUN pnpm prisma:generate && pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3001
CMD ["node", "dist/entrypoints/api.js"]
