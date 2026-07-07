import { createRouter, createWebHashHistory } from 'vue-router'
import ProjectList from '@/pages/ProjectList.vue'

// Hash history: keeps routing working when the production build is
// loaded from a file:// URL.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'projects', component: ProjectList },
    {
      path: '/projects/:id',
      name: 'project-detail',
      component: () => import('@/pages/ProjectDetail.vue')
    },
    {
      path: '/projects/:id/env',
      name: 'env-editor',
      component: () => import('@/pages/EnvEditor.vue')
    },
    {
      path: '/projects/:id/artisan',
      name: 'artisan-panel',
      component: () => import('@/pages/ArtisanPanel.vue')
    },
    {
      path: '/output',
      name: 'output-terminal',
      component: () => import('@/pages/OutputTerminal.vue')
    }
  ]
})
