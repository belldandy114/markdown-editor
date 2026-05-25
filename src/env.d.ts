/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '@highlightjs/vue-plugin' {
  import type { Plugin } from 'vue'
  const hljsVuePlugin: Plugin
  export default hljsVuePlugin
}
