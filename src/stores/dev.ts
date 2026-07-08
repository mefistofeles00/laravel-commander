import { ref } from 'vue'
import { defineStore } from 'pinia'

/** Tracks which projects have dev processes running, for the sidebar dot. */
export const useDevStore = defineStore('dev', () => {
  const runningProjects = ref<Set<string>>(new Set())
  let subscribed = false

  async function refresh(): Promise<void> {
    runningProjects.value = new Set(await window.api.devRunningProjects())
  }

  function init(): void {
    refresh()
    if (subscribed) return
    subscribed = true
    window.api.onDevStatus(() => refresh())
  }

  function isRunning(projectId: string): boolean {
    return runningProjects.value.has(projectId)
  }

  return { runningProjects, init, isRunning }
})
