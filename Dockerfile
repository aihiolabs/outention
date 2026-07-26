FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/bin ./bin
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 4173
CMD ["npm", "start"]
