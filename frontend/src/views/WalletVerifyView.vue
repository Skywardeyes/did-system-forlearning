<script setup lang="ts">
import { ref } from 'vue'
import VerificationReport from '../components/VerificationReport.vue'
import { credentialApi } from '../api'
import type { VerificationResult } from '../types'

const input = ref('')
const domain = ref('hr.example.com')
const challenge = ref('')
const expiresAt = ref('')
const result = ref<VerificationResult | null>(null)
const message = ref('')

async function createChallenge() {
  try {
    const issued = await credentialApi.createWalletChallenge({ domain: domain.value })
    challenge.value = issued.challenge; domain.value = issued.domain; expiresAt.value = issued.expiresAt
    message.value = '一次性 Challenge 已生成，请将它和域名交给 Holder 钱包。'
  } catch (error) { message.value = error instanceof Error ? error.message : 'Challenge 生成失败' }
}

async function verify() {
  try {
    result.value = await credentialApi.verifyWalletPresentation(JSON.parse(input.value) as object)
    message.value = result.value.valid ? '钱包最小披露验证通过，Challenge 已消费。' : '钱包证明验证失败；Challenge 不会因无效证明而被消费。'
  } catch (error) { message.value = error instanceof Error ? error.message : '验证失败' }
}
</script>

<template>
  <div class="view verify-grid">
    <section class="panel input-panel"><header class="panel-head"><div><p>VERIFIER PORTAL</p><h2>验证个人钱包证明</h2></div></header>
      <label>验证方域名/标识<input v-model="domain" placeholder="例如 hr.example.com"></label>
      <button class="secondary" :disabled="!domain" @click="createChallenge">生成一次性 Challenge</button>
      <label>发给 Holder 钱包的 Challenge<textarea v-model="challenge" readonly placeholder="先生成 Challenge，再复制给钱包"></textarea></label>
      <small v-if="expiresAt">有效至：{{ new Date(expiresAt).toLocaleString() }}；首次成功验证后立即失效。</small>
      <textarea v-model="input" spellcheck="false" placeholder="粘贴 Holder 钱包生成的 WalletBoundSdJwtPresentation2026 JSON"></textarea>
      <button class="primary" :disabled="!input" @click="verify">验证最小披露、Holder 签名与一次性 Challenge</button><p class="message">{{ message }}</p>
      <p class="security-note">验证方只接收本次选择的声明、Issuer SD-JWT 与 Holder 对 Challenge 的本地签名；平台不接收 Holder 私钥。Challenge 仅以哈希形式存入验证台账，成功后原子消费，阻止同一证明重放。</p>
    </section>
    <VerificationReport :result="result" />
  </div>
</template>
