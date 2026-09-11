FROM node:24-slim

WORKDIR /app

# npm ci installs exactly what package-lock.json pins, and matches the
# Node version in .nvmrc that CI builds against.
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
