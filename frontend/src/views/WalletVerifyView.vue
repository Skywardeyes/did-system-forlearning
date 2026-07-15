<script setup lang="ts">
import { onMounted, ref } from 'vue'
import VerificationReport from '../components/VerificationReport.vue'
import { credentialApi } from '../api'
import type { VerificationPresentationLedger, VerificationResult } from '../types'

const input = ref('')
const domain = ref('hr.example.com')
const challenge = ref('')
const expiresAt = ref('')
const result = ref<VerificationResult | null>(null)
const message = ref('')
const ledger = ref<VerificationPresentationLedger[]>([])

async function loadLedger() {
  ledger.value = (await credentialApi.walletPresentationLedger()).items
}

async function createChallenge() {
  try {
    const issued = await credentialApi.createWalletChallenge({ domain: domain.value })
    challenge.value = issued.challenge
    domain.value = issued.domain
    expiresAt.value = issued.expiresAt
    message.value = '一次性 Challenge 已生成，请将它和验证方域名交给个人钱包。'
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Challenge 生成失败'
  }
}

async function verify() {
  try {
    result.value = await credentialApi.verifyWalletPresentation(JSON.parse(input.value) as object)
    message.value = result.value.valid
      ? '组合出示验证通过，Challenge 已对整组凭证原子消费。'
      : '组合出示验证失败；无效证明不会消耗 Challenge。'
    await loadLedger()
  } catch (error) {
    message.value = error instanceof Error ? error.message : '验证失败'
  }
}

onMounted(() => { loadLedger().catch(() => undefined) })
</script>

<template>
  <div class="view verify-grid">
    <section class="panel input-panel">
      <header class="panel-head"><div><p>VERIFIER PORTAL</p><h2>验证个人钱包组合出示</h2></div></header>
      <label>验证方域名标识<input v-model="domain" placeholder="例如 hr.example.com"></label>
      <button class="secondary" :disabled="!domain" @click="createChallenge">生成一次性 Challenge</button>
      <label>发给 Holder 钱包的 Challenge<textarea v-model="challenge" readonly placeholder="先生成 Challenge，再复制给钱包"></textarea></label>
      <small v-if="expiresAt">有效至：{{ new Date(expiresAt).toLocaleString() }}；首次成功验证后立即失效。</small>
      <textarea v-model="input" spellcheck="false" placeholder="粘贴钱包生成的 WalletBoundMultiSdJwtPresentation2026 JSON"></textarea>
      <button class="primary" :disabled="!input" @click="verify">逐张验证并核验 Holder 组合签名</button>
      <p class="message">{{ message }}</p>
      <p class="security-note">验证方只收到用户勾选的字段。系统逐张解析 Issuer 公钥、签名、有效期和凭证状态，再验证 Holder 对完整组合与本次 Challenge 的本地签名；平台不接收 Holder 私钥。</p>
    </section>
    <div>
      <VerificationReport :result="result" />
      <section v-if="result?.credentials?.length" class="panel">
        <header class="panel-head"><div><p>PER-CREDENTIAL EVIDENCE</p><h2>逐张凭证验证结果</h2></div><span>{{ result.presentationId }}</span></header>
        <article v-for="item in result.credentials" :key="item.credentialId || item.issuerDid || ''" class="did-card">
          <strong>{{ item.credentialType || '未声明凭证类型' }}</strong>
          <small>{{ item.credentialId }}</small>
          <p>签发方：{{ item.issuerDid }}</p>
          <p :class="item.outcome === 'valid' ? 'success-text' : 'danger-text'">{{ item.outcome === 'valid' ? '验证通过' : '验证失败' }}</p>
          <p>已披露：{{ item.disclosedPaths.join('、') || '无' }}</p>
          <p v-if="item.failedChecks.length">失败项：{{ item.failedChecks.join('、') }}</p>
        </article>
      </section>
    </div>
    <section class="panel" style="grid-column: 1 / -1">
      <header class="panel-head"><div><p>VERIFICATION LEDGER</p><h2>组合验证台账</h2></div><button @click="loadLedger">刷新</button></header>
      <div class="table-wrap">
        <table><thead><tr><th>时间</th><th>结果</th><th>Holder</th><th>凭证数</th><th>逐张证据</th></tr></thead>
          <tbody><tr v-for="entry in ledger" :key="entry.id">
            <td>{{ new Date(entry.occurredAt).toLocaleString() }}<small>{{ entry.id }}</small></td>
            <td>{{ entry.outcome }}</td><td>{{ entry.holderDid }}</td><td>{{ entry.credentialCount }}</td>
            <td><div v-for="credential in entry.credentials" :key="credential.credentialId || credential.issuerDid || ''">
              {{ credential.credentialType }} · {{ credential.outcome }} · {{ credential.disclosedPaths.join('、') }}
            </div></td>
          </tr></tbody>
        </table>
      </div>
      <p v-if="!ledger.length" class="empty">暂无组合验证记录。</p>
    </section>
  </div>
</template>
