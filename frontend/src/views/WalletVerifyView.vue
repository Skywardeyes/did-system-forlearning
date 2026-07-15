<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import VerificationReport from '../components/VerificationReport.vue'
import { credentialApi } from '../api'
import type { VerificationPresentationLedger, VerificationResult } from '../types'

type PendingTransfer = { transferId: string; holderDid: string; submittedAt: string; expiresAt: string; credentialCount: number }
const pending = ref<PendingTransfer | null>(null)
const result = ref<VerificationResult | null>(null)
const message = ref('等待 Holder 碰一碰…')
const ledger = ref<VerificationPresentationLedger[]>([])
const verifying = ref(false)
let timer: number | undefined

async function loadLedger() { ledger.value = (await credentialApi.walletPresentationLedger()).items }
async function receive() {
  try {
    const latest = await credentialApi.latestNfcPresentation()
    if (latest?.transferId !== pending.value?.transferId) result.value = null
    pending.value = latest
    message.value = latest ? '已收到钱包证明，请点击“验证”。' : '等待 Holder 碰一碰…'
  } catch (error) { message.value = error instanceof Error ? error.message : '接收失败' }
}
async function verify() {
  if (!pending.value) return
  verifying.value = true
  try {
    result.value = await credentialApi.verifyNfcPresentation(pending.value.transferId)
    message.value = result.value.valid ? '验证通过：来源、状态、字段摘要与 Holder 签名均有效。' : '验证未通过，请查看右侧失败项。'
    pending.value = null
    await loadLedger()
  } catch (error) { message.value = error instanceof Error ? error.message : '验证失败' }
  finally { verifying.value = false }
}

onMounted(() => { receive(); loadLedger().catch(() => undefined); timer = window.setInterval(receive, 2500) })
onBeforeUnmount(() => { if (timer) window.clearInterval(timer) })
</script>

<template>
  <div class="view verify-grid">
    <section class="panel input-panel">
      <header class="panel-head"><div><p>NFC VERIFIER</p><h2>碰一碰验证入口</h2></div><span class="safe">自动接收</span></header>
      <div v-if="pending" class="did-card">
        <strong>已收到一份选择性披露证明</strong>
        <small>{{ pending.transferId }}</small>
        <p>Holder：{{ pending.holderDid }}</p>
        <p>组合凭证：{{ pending.credentialCount }} 张</p>
        <p>到达时间：{{ new Date(pending.submittedAt).toLocaleString() }}</p>
      </div>
      <p v-else class="empty">让 Holder 在信证钱包点击“碰一下，就验证！”，证明会自动出现在这里。</p>
      <button class="primary" :disabled="!pending || verifying" @click="verify">{{ verifying ? '正在验证…' : '验证' }}</button>
      <p class="message">{{ message }}</p>
      <p class="security-note">MVP 隐藏了 Challenge 的复制与粘贴，但没有取消安全校验：后台自动签发一次性随机数，并在首次验证时原子消费，防止旧证明被重复使用。</p>
    </section>
    <div>
      <VerificationReport :result="result" />
      <section v-if="result?.credentials?.length" class="panel">
        <header class="panel-head"><div><p>PER-CREDENTIAL EVIDENCE</p><h2>逐张凭证结果</h2></div><span>{{ result.presentationId }}</span></header>
        <article v-for="item in result.credentials" :key="item.credentialId || item.issuerDid || ''" class="did-card">
          <strong>{{ item.credentialType || '未声明凭证类型' }}</strong><small>{{ item.credentialId }}</small>
          <p>签发方：{{ item.issuerDid }}</p><p :class="item.outcome === 'valid' ? 'success-text' : 'danger-text'">{{ item.outcome === 'valid' ? '验证通过' : '验证失败' }}</p>
          <p>已披露：{{ item.disclosedPaths.join('、') || '无' }}</p><p v-if="item.failedChecks.length">失败项：{{ item.failedChecks.join('、') }}</p>
        </article>
      </section>
    </div>
    <section class="panel" style="grid-column:1 / -1">
      <header class="panel-head"><div><p>VERIFICATION LEDGER</p><h2>组合验证台账</h2></div><button @click="loadLedger">刷新</button></header>
      <div class="table-wrap"><table><thead><tr><th>时间</th><th>结果</th><th>Holder</th><th>凭证数</th><th>逐张证据</th></tr></thead><tbody>
        <tr v-for="entry in ledger" :key="entry.id"><td>{{ new Date(entry.occurredAt).toLocaleString() }}<small>{{ entry.id }}</small></td><td>{{ entry.outcome }}</td><td>{{ entry.holderDid }}</td><td>{{ entry.credentialCount }}</td><td><div v-for="credential in entry.credentials" :key="credential.credentialId || credential.issuerDid || ''">{{ credential.credentialType }} · {{ credential.outcome }} · {{ credential.disclosedPaths.join('、') }}</div></td></tr>
      </tbody></table></div><p v-if="!ledger.length" class="empty">暂无组合验证记录。</p>
    </section>
  </div>
</template>
