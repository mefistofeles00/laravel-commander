import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { LaravelProject } from '@shared/types'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<LaravelProject[]>([])
  const loaded = ref(false)
  const lastError = ref<string | null>(null)

  async function refresh(): Promise<void> {
    projects.value = await window.api.listProjects()
    loaded.value = true
  }

  /** Returns the added project, or null if the user canceled or the folder was rejected. */
  async function add(): Promise<LaravelProject | null> {
    lastError.value = null
    const result = await window.api.addProject()
    if (result.ok) {
      projects.value = [...projects.value, result.project]
      return result.project
    }
    if (result.reason !== 'canceled') lastError.value = result.message
    return null
  }

  async function remove(projectId: string): Promise<void> {
    projects.value = await window.api.removeProject(projectId)
  }

  function byId(projectId: string): LaravelProject | undefined {
    return projects.value.find((p) => p.id === projectId)
  }

  return { projects, loaded, lastError, refresh, add, remove, byId }
})
