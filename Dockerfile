FROM node:22-alpine

WORKDIR /app

COPY signup.js .

CMD ["node", "signup.js"]
