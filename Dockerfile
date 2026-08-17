# webAdmin 多阶段构建：npm ci → node 静态服务（sport.historybook.cn）
# 用 node 静态服务器（非 nginx）：无 pid/写盘依赖，规避老内核容器 EPERM
FROM node:22-alpine AS build
WORKDIR /app
# 国内镜像源（构建加速）
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com
COPY . .
# 生产 API 绝对地址（跨子域调用 api.historybook.cn）
ENV VITE_API_BASE=https://api.historybook.cn/sport-track/api
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.js ./
EXPOSE 80
CMD ["node", "server.js"]
