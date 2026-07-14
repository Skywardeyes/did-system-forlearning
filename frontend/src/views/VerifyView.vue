<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import VerificationReport from '../components/VerificationReport.vue'
import { credentialApi } from '../api'
import { useWorkspaceStore } from '../stores/workspace'
import type { VerificationResult } from '../types'

const workspace = useWorkspaceStore()
const input = ref('')
const result = ref<VerificationResult | null>(null)
const message = ref('')

async function loadLatest() {
  const latest = workspace.credentials[0]
  if (!latest) { message.value = '当前没有凭证'; return }
  try { const response = await credentialApi.content(latest.id, 'verification_preparation'); input.value = JSON.stringify(response.credential, null, 2); message.value = '已授权载入，明文访问已审计' }
  catch (error) { message.value = error instanceof Error ? error.message : '载入失败' }
}
async function verify() {
  try { result.value = await credentialApi.verify(JSON.parse(input.value) as object); await workspace.refresh(); message.value = result.value.valid ? '验证通过' : '验证失败' }
  catch (error) { message.value = error instanceof Error ? error.message : '验证失败' }
}
function tamper() {
  try { const value = JSON.parse(input.value); value.credentialSubject.name += '（已修改）'; input.value = JSON.stringify(value, null, 2); message.value = '已修改姓名，可重新验证观察签名失效' } catch { message.value = '请先载入凭证' }
}
onUnmounted(() => { input.value = ''; result.value = null })
</script>

<template>
  <div class="view verify-grid">
    <section class="panel input-panel"><header class="panel-head"><div><p>SENSITIVE INPUT</p><h2>待验证 VC</h2></div><div class="actions"><button @click="loadLatest">授权载入</button><button @click="tamper">模拟篡改</button></div></header>
      <textarea v-model="input" spellcheck="false" placeholder="粘贴由授权渠道获得的 VC JSON"></textarea>
      <button class="primary" :disabled="!input" @click="verify">执行完整验证</button><p class="message">{{ message }}</p>
      <p class="security-note">明文只保存在当前组件内存，离开页面时清空，不进入 Pinia 或浏览器存储。</p>
    </section>
    <VerificationReport :result="result" />
  </div>
</template>
