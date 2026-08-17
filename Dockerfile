# webAdmin 多阶段构建：npm ci → nginx 静态服务（sport.historybook.cn）
# 用 npm（非 pnpm/corepack）：规避 pnpm sqlite store 在部分 Docker overlay fs 上的 EPERM/disk I/O 问题
FROM node:22-alpine AS build
WORKDIR /app
# 国内镜像源（构建加速）
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com
COPY . .
# 生产 API 绝对地址（跨子域调用 api.historybook.cn）
ENV VITE_API_BASE=https://api.historybook.cn/sport-track/api
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
