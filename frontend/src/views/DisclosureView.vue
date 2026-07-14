<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import VerificationReport from '../components/VerificationReport.vue'
import { credentialApi } from '../api'
import { useWorkspaceStore } from '../stores/workspace'
import type { VerificationResult } from '../types'

const workspace = useWorkspaceStore()
const credentialId = ref('')
const format = ref<'teaching' | 'sd-jwt'>('sd-jwt')
const selected = ref(['credentialSubject.course'])
const output = ref('')
const result = ref<VerificationResult | null>(null)
const message = ref('')
const fields = [
  ['credentialSubject.name', '学员姓名'], ['credentialSubject.course', '课程名称'], ['credentialSubject.completionDate', '完成日期'],
]

async function generate() {
  if (!credentialId.value || !selected.value.length) { message.value = '请选择凭证和至少一个字段'; return }
  try {
    const value = format.value === 'sd-jwt' ? await credentialApi.sdJwt(credentialId.value, selected.value) : await credentialApi.disclose(credentialId.value, selected.value)
    output.value = JSON.stringify(format.value === 'sd-jwt' ? { format: 'sd-jwt', sdJwt: value.sdJwt } : value, null, 2)
    result.value = null; message.value = '披露证明已生成，未选字段不会返回到前端'
  } catch (error) { message.value = error instanceof Error ? error.message : '生成失败' }
}
async function verify() {
  try { const value = JSON.parse(output.value); result.value = value.format === 'sd-jwt' ? await credentialApi.verifySdJwt(value.sdJwt) : await credentialApi.verifyDisclosure(value); message.value = result.value.valid ? '披露验证通过' : '披露验证失败' }
  catch (error) { message.value = error instanceof Error ? error.message : '验证失败' }
}
onUnmounted(() => { output.value = ''; result.value = null })
</script>

<template>
  <div class="view disclosure-grid">
    <section class="panel form-panel"><header class="panel-head"><div><p>MINIMUM DISCLOSURE</p><h2>按需披露声明</h2></div></header>
      <form @submit.prevent="generate"><label>受保护凭证<select v-model="credentialId" required><option value="" disabled>选择 active VC 摘要</option><option v-for="record in workspace.activeCredentials" :key="record.id" :value="record.id">{{ record.id.slice(0, 28) }}…</option></select></label>
        <label>格式<select v-model="format"><option value="sd-jwt">SD-JWT</option><option value="teaching">教学版摘要证明</option></select></label>
        <fieldset><legend>允许释放的字段</legend><label v-for="field in fields" :key="field[0]" class="check-field"><input v-model="selected" type="checkbox" :value="field[0]">{{ field[1] }}</label></fieldset>
        <button class="primary">生成最小披露证明</button><p class="message">{{ message }}</p></form>
    </section>
    <section class="panel input-panel"><header class="panel-head"><div><p>PROTECTED PRESENTATION</p><h2>披露证明</h2></div><button :disabled="!output" @click="verify">执行验证</button></header><textarea v-model="output" spellcheck="false"></textarea></section>
    <VerificationReport :result="result" />
  </div>
</template>
