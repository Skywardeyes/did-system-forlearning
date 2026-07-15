<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

export interface SearchSelectOption { value: string; label: string; searchText?: string }

const props = withDefaults(defineProps<{
  modelValue: string
  options: SearchSelectOption[]
  label: string
  placeholder?: string
  emptyText?: string
}>(), { placeholder: '输入关键词搜索并选择', emptyText: '没有匹配选项' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string] }>()
const query = ref('')
const open = ref(false)
const input = ref<HTMLInputElement | null>(null)
const selected = computed(() => props.options.find((item) => item.value === props.modelValue))
const filtered = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  return props.options.filter((item) => !keyword || `${item.label} ${item.searchText || ''}`.toLocaleLowerCase().includes(keyword))
})

watch(() => [props.modelValue, props.options] as const, () => {
  if (!open.value) query.value = selected.value?.label || ''
}, { immediate: true, deep: true })

function choose(option: SearchSelectOption) {
  emit('update:modelValue', option.value)
  emit('change', option.value)
  query.value = option.label
  open.value = false
}
function edit() {
  if (selected.value && query.value !== selected.value.label) emit('update:modelValue', '')
  open.value = true
}
function closeLater() { window.setTimeout(() => { open.value = false; query.value = selected.value?.label || '' }, 120) }
async function show() { open.value = true; await nextTick(); input.value?.select() }
</script>

<template>
<label class="search-select">
  {{ label }}
  <span class="search-select-control">
    <input ref="input" v-model="query" type="search" :placeholder="placeholder" autocomplete="off"
      role="combobox" :aria-expanded="open" @focus="show" @input="edit" @blur="closeLater">
    <span aria-hidden="true">⌄</span>
  </span>
  <span v-if="open" class="search-select-menu" role="listbox">
    <button v-for="option in filtered" :key="option.value" type="button" role="option"
      :class="{ selected: option.value === modelValue }" @mousedown.prevent="choose(option)">{{ option.label }}</button>
    <small v-if="!filtered.length">{{ emptyText }}</small>
  </span>
</label>
</template>
