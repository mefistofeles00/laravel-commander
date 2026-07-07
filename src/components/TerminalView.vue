<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const host = ref<HTMLDivElement>()
let terminal: Terminal | undefined
let fitAddon: FitAddon | undefined
let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  terminal = new Terminal({
    convertEol: true,
    disableStdin: true,
    cursorInactiveStyle: 'none',
    scrollback: 5000,
    fontFamily: "'JetBrains Mono Variable', ui-monospace, Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.5,
    theme: {
      background: '#1e1a17',
      foreground: '#e9e3da',
      cursor: '#1e1a17',
      selectionBackground: '#f0503c4d',
      black: '#2b2622',
      red: '#f0705f',
      green: '#7fc98a',
      yellow: '#e0b76a',
      blue: '#7aa8d8',
      magenta: '#c39ac9',
      cyan: '#7cc4be',
      white: '#e9e3da',
      brightBlack: '#6f675f',
      brightRed: '#f58d7f',
      brightGreen: '#98d8a2',
      brightYellow: '#ecc985',
      brightBlue: '#96bde4',
      brightMagenta: '#d4b0d9',
      brightCyan: '#97d5cf',
      brightWhite: '#f5f1ea'
    }
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(host.value!)
  fitAddon.fit()
  resizeObserver = new ResizeObserver(() => fitAddon?.fit())
  resizeObserver.observe(host.value!)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  terminal?.dispose()
})

defineExpose({
  write: (chunk: string): void => terminal?.write(chunk),
  clear: (): void => {
    terminal?.reset()
  }
})
</script>

<template>
  <div class="overflow-hidden rounded-lg border bg-[#1e1a17] p-3 select-text">
    <div ref="host" class="h-72" />
  </div>
</template>
