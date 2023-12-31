FROM node:18
WORKDIR /app
RUN npm install -g pnpm
ADD package.json pnpm-lock.yaml ./
RUN pnpm install
ADD . .
ENV NODE_ENV production
RUN pnpm run build
EXPOSE 3000

# Command to start your Nest.js application
CMD [ "pnpm", "run", "start:prod" ]