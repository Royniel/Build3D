FROM node:22-alpine

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Copy manifests first so the npm layer is cached; editing source does not
# reinstall every dependency.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

# docker-compose overrides this with `npm run dev` for hot reload. This CMD is
# what you would ship: a production build served by Next's own server.
CMD ["sh", "-c", "npm run build && npm run start"]
