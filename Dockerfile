# webAdmin 多阶段构建：pnpm build → nginx 静态服务（sport.historybook.cn）
FROM node:22-alpine AS build
# 国内镜像源（构建加速）：corepack 下载 pnpm + pnpm 安装依赖均走 npmmirror
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN corepack enable && pnpm config set registry https://registry.npmmirror.com
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# 生产 API 绝对地址（跨子域调用 api.historybook.cn）
ENV VITE_API_BASE=https://api.historybook.cn/sport-track/api
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
