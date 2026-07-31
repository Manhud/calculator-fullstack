FROM node:22-alpine AS build

WORKDIR /app

# npm ci rather than npm install: it installs exactly the lockfile and fails if
# the two disagree, so a container build cannot silently resolve a new version.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines this at build time, so it is the browser's view of the API — not
# the container network's. The browser runs on the host and reaches the backend
# through its published port.
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Runtime stage: nginx serving static files. The built app is HTML, CSS and JS;
# shipping Node to serve it would be an order of magnitude more image for nothing.
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1
