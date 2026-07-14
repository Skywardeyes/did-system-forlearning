<script setup lang="ts">
import { ref } from 'vue'
import VerificationReport from '../components/VerificationReport.vue'
import { credentialApi } from '../api'
import type { VerificationResult } from '../types'

const input = ref('')
const result = ref<VerificationResult | null>(null)
const message = ref('')

async function verify() {
  try {
    result.value = await credentialApi.verifyWalletPresentation(JSON.parse(input.value) as object)
    message.value = result.value.valid ? '钱包最小披露验证通过' : '钱包证明验证失败'
  } catch (error) { message.value = error instanceof Error ? error.message : '验证失败' }
}
</script>

<template>
  <div class="view verify-grid">
    <section class="panel input-panel"><header class="panel-head"><div><p>VERIFIER PORTAL</p><h2>验证个人钱包证明</h2></div></header>
      <textarea v-model="input" spellcheck="false" placeholder="粘贴 Holder 钱包生成的 WalletBoundSdJwtPresentation2026 JSON"></textarea>
      <button class="primary" :disabled="!input" @click="verify">验证最小披露与 Holder 签名</button><p class="message">{{ message }}</p>
      <p class="security-note">验证方只收到本次选择的声明、Issuer SD-JWT 与 Holder 对 Challenge 的本地签名，不需要 Holder 私钥或完整凭证。</p>
    </section>
    <VerificationReport :result="result" />
  </div>
</template>
