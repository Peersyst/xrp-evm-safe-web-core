FROM node:16 AS deps

WORKDIR /app

COPY . .
RUN yarn
RUN yarn build

EXPOSE 3000

ENV PORT 3000

CMD ["yarn", "prod"]
