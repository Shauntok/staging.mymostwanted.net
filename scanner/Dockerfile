ARG NODE_BASE_IMAGE
FROM ${NODE_BASE_IMAGE}

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node worker.mjs thumbnails.mjs ./
USER node
CMD ["node", "worker.mjs"]
