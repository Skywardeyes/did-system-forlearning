<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import CredentialTable from '../components/CredentialTable.vue'
import JsonDialog from '../components/JsonDialog.vue'
import { credentialApi } from '../api'
import { useWorkspaceStore } from '../stores/workspace'
import type { CredentialSummary } from '../types'

const workspace = useWorkspaceStore()
const issuers = computed(() => workspace.dids.filter((item) => item.role === 'issuer' && item.status === 'active'))
const holders = computed(() => workspace.dids.filter((item) => item.role === 'holder' && item.status === 'active'))
const form = reactive({ issuerDid: '', holderDid: '', subjectName: '', course: '', completionDate: new Date().toISOString().slice(0, 10), validUntil: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 16) })
const message = ref('')
const dialog = ref<InstanceType<typeof JsonDialog> | null>(null)

async function issue() {
  try { const result = await credentialApi.issue({ ...form, validUntil: new Date(form.validUntil).toISOString() }); dialog.value?.open('新签发 VC · 仅本次返回', result); await workspace.refresh(); message.value = 'VC 签发成功' }
  catch (error) { message.value = error instanceof Error ? error.message : '签发失败' }
}
async function reveal(record: CredentialSummary) {
  try { const result = await credentialApi.content(record.id, 'issuer_support'); dialog.value?.open('授权查看 · 操作已记入敏感访问台账', result.credential) }
  catch (error) { message.value = error instanceof Error ? error.message : '无权查看' }
}
async function lifecycle(record: CredentialSummary, action: 'suspend' | 'resume' | 'revoke') {
  if (action === 'revoke' && !confirm('撤销后不可恢复，确认继续？')) return
  try { await credentialApi.action(record.id, action, { expectedRowVersion: record.rowVersion }); await workspace.refresh(); message.value = '凭证状态已更新' }
  catch (error) { message.value = error instanceof Error ? error.message : '操作失败' }
}
async function delivery(record: CredentialSummary) {
  try { const value = await credentialApi.walletPackage(record.id); dialog.value?.open('钱包 VC 交付包 · 交给 Holder 本地钱包导入', value); message.value = '交付包已生成：其中不包含 Holder 私钥' }
  catch (error) { message.value = error instanceof Error ? error.message : '生成交付包失败' }
}
</script>

<template>
  <div class="view">
    <div class="split credential-layout">
      <section class="panel form-panel"><header class="panel-head"><div><p>ISSUE CREDENTIAL</p><h2>签发结业 VC</h2></div></header>
        <form @submit.prevent="issue"><label>Issuer<select v-model="form.issuerDid" required><option value="" disabled>选择签发方</option><option v-for="did in issuers" :key="did.id" :value="did.did">{{ did.name }}</option></select></label>
          <label>Holder<select v-model="form.holderDid" required><option value="" disabled>选择持有者</option><option v-for="did in holders" :key="did.id" :value="did.did">{{ did.name }}</option></select></label>
          <label>学员姓名<input v-model="form.subjectName" required></label><label>课程<input v-model="form.course" required></label>
          <div class="form-row"><label>完成日期<input v-model="form.completionDate" type="date" required></label><label>有效至<input v-model="form.validUntil" type="datetime-local" required></label></div>
          <button class="primary">使用 Issuer KMS 签发</button><p class="message">{{ message }}</p></form>
      </section>
      <section class="panel"><header class="panel-head"><div><p>PROTECTED REGISTER</p><h2>VC 非敏感摘要</h2></div><span>列表不解密</span></header>
        <CredentialTable :records="workspace.credentials" @reveal="reveal" @lifecycle="lifecycle" @delivery="delivery" />
      </section>
    </div>
    <JsonDialog ref="dialog" />
  </div>
</template>
