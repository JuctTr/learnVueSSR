import {
  createRouter as _createRouter,
  createMemoryHistory,
  createWebHistory,
} from 'vue-router'

// 根据 ./pages 目录下的 vue 文件自动生成路由
// https://vitejs.dev/guide/features.html#glob-import
const pages = import.meta.glob('/src/pages/*.vue')

const routes = Object.keys(pages).map((path) => {
  const m = path.match(/src\/pages(.*)\.vue$/);
  
  const name = m && m[1].toLowerCase() || ''
  return {
    path: name === '/index' ? '/' : name,
    component: pages[path], // () => import('./pages/*.vue')
  }
})

console.log('routes => ', routes);


export function createRouter() {
  return _createRouter({
    // use appropriate history implementation for server/client
    // import.meta.env.SSR is injected by Vite.
    history: import.meta.env.SSR
      ? createMemoryHistory('/test/')
      : createWebHistory('/test/'),
    routes,
  })
}
