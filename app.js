import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const isTest = process.env.VITEST

export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === 'production',
  hmrPort,
) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const resolve = (p) => path.resolve(__dirname, p)

  const indexProd = isProd
    ? fs.readFileSync(resolve('dist/client/index.html'), 'utf-8')
    : ''

  const manifest = isProd
    ? JSON.parse(
      fs.readFileSync(resolve('dist/client/ssr-manifest.json'), 'utf-8'),
    )
    : {}

  const app = express()

  /**
   * @type {import('vite').ViteDevServer}
   * @document https://cn.vitejs.dev/guide/api-javascript.html#vitedevserver
   */
  let vite
  if (!isProd) {
    vite = await (
      await import('vite')
    ).createServer({
      base: '/test/',
      root,
      logLevel: isTest ? 'error' : 'info',
      server: {
        middlewareMode: true,
        watch: {
          // 在测试过程中，我们编辑文件的速度太快，有时 chokidar 会错过更改的事件，因此强制轮询以确保一致性
          usePolling: true,
          interval: 100,
        },
        hmr: {
          port: hmrPort,
        },
      },
      appType: 'custom',
    })
    // 使用vite的connect实例作为中间件
    app.use(vite.middlewares)
  } else {
    app.use((await import('compression')).default())
    app.use(
      '/test/',
      (await import('serve-static')).default(resolve('dist/client'), {
        index: false,
      }),
    )
  }

  app.use('*', async (req, res) => {
    try {
      const url = req.originalUrl.replace('/test/', '/')

      let template, render
      if (!isProd) {
        // always read fresh template in dev
        template = fs.readFileSync(resolve('index.html'), 'utf-8')
        // 2. 应用 Vite HTML 转换。这将会注入 Vite HMR 客户端，同时也会从 Vite 插件应用 HTML 转换。
        template = await vite.transformIndexHtml(url, template)
        // 3. 加载服务器入口。vite.ssrLoadModule 将自动转换
        //    你的 ESM 源码使之可以在 Node.js 中运行！无需打包
        //    并提供类似 HMR 的根据情况随时失效。
        render = (await vite.ssrLoadModule('/src/entry-server.ts')).render
      } else {
        template = indexProd
        render = (await import('./dist/server/entry-server.js')).render
      }
      // 4. 渲染应用的 HTML。这假设 entry-server.js 导出的 `render`
      //    函数调用了适当的 SSR 框架 API。
      //    例如 ReactDOMServer.renderToString()
      const [appHtml, preloadLinks] = await render(url, manifest)

      // 5. 注入渲染后的应用程序 HTML 到模板中。
      const html = template
        .replace(`<!--preload-links-->`, preloadLinks)
        .replace(`<!--app-html-->`, appHtml)

      // 6. 返回渲染后的 HTML。
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
    } catch (e) {
      // 如果捕获到了一个错误，让 Vite 来修复该堆栈，这样它就可以映射回
      // 你的实际源码中。
      vite && vite.ssrFixStacktrace(e)
      console.log(e.stack)
      res.status(500).end(e.stack)
    }
  })

  return { app, vite }
}

if (!isTest) {
  createServer().then(({ app }) =>
    app.listen(6173, () => {
      console.log('http://localhost:6173')
    }),
  )
}
