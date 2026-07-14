<script setup lang="ts">
import { nextTick, ref } from 'vue'

const dialog = ref<HTMLDialogElement | null>(null)
const title = ref('JSON')
const value = ref<unknown>(null)

async function open(nextTitle: string, nextValue: unknown) {
  title.value = nextTitle; value.value = nextValue
  await nextTick(); dialog.value?.showModal()
}
function close() { value.value = null; dialog.value?.close() }
defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialog" @close="value = null">
    <header><strong>{{ title }}</strong><button class="icon-button" @click="close">×</button></header>
    <pre>{{ JSON.stringify(value, null, 2) }}</pre>
  </dialog>
</template>
