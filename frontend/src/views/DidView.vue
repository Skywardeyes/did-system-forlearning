<script setup lang="ts">
import { reactive, ref } from 'vue'
import JsonDialog from '../components/JsonDialog.vue'
import { blockchainApi, didApi } from '../api'
import { useWorkspaceStore } from '../stores/workspace'
import type { ChainDidRecord, DidSummary } from '../types'

const workspace = useWorkspaceStore()
const issuerForm = reactive({ name: '', method: 'example', serviceEndpoint: '' })
const holderRegistration = reactive({ name: '', documentText: '' })
const message = ref('')
const dialog = ref<InstanceType<typeof JsonDialog> | null>(null)
const chainRecords = reactive<Record<string, ChainDidRecord>>({})

async function createIssuerDid() {
  try {
    await didApi.create({ ...issuerForm, role: 'issuer', serviceEndpoint: issuerForm.serviceEndpoint || undefined })
    issuerForm.name = ''; await workspace.refresh(); message.value = 'Issuer DID 创建成功，机构私钥由 KMS 管理'
  } catch (error) { message.value = error instanceof Error ? error.message : '创建失败' }
}
async function registerHolder() {
  try {
    const value = JSON.parse(holderRegistration.documentText) as { did?: string; document?: object; name?: string }
    await didApi.registerHolder({ did: value.did, document: value.document, name: holderRegistration.name || value.name || '外部 Holder 钱包' })
    holderRegistration.name = ''; holderRegistration.documentText = ''; await workspace.refresh()
    message.value = 'Holder 公开 DID 已登记；平台未接收任何私钥'
  } catch (error) { message.value = error instanceof Error ? error.message : 'Holder DID 登记失败' }
}
async function action(did: DidSummary, name: 'rotate-key' | 'deactivate') {
  if (name === 'deactivate' && !confirm('停用后不可恢复，确认继续？')) return
  try { await didApi.action(did.id, name, did.version); await workspace.refresh(); message.value = name === 'rotate-key' ? '机构密钥轮换成功' : 'DID 已停用；如已上链，请再写入链上停用状态' }
  catch (error) { message.value = error instanceof Error ? error.message : '操作失败' }
}
async function loadChainState(did: DidSummary) {
  try { chainRecords[did.id] = await blockchainApi.resolveDid(did.id) }
  catch (error) { message.value = error instanceof Error ? error.message : '读取链上状态失败' }
}
async function chainAction(did: DidSummary, name: 'sync' | 'deactivate') {
  try {
    const result = name === 'sync' ? await blockchainApi.syncDid(did.id) : await blockchainApi.deactivateDid(did.id)
    chainRecords[did.id] = result
    dialog.value?.open(name === 'sync' ? '链上 DID 登记 / 同步证据' : '链上 DID 停用证据', result)
    message.value = name === 'sync' ? 'Issuer DID 已写入本地链上注册表' : 'Issuer DID 链上停用状态已写入'
  } catch (error) { message.value = error instanceof Error ? error.message : '链上操作失败' }
}
</script>

<template>
  <div class="view split">
    <section class="panel form-panel">
      <header class="panel-head"><div><p>INSTITUTION IDENTITY</p><h2>创建 Issuer DID</h2></div></header>
      <form @submit.prevent="createIssuerDid">
        <label>机构名称<input v-model="issuerForm.name" required maxlength="120"></label>
        <label>DID Method<select v-model="issuerForm.method"><option value="example">did:example</option><option value="key">did:key</option></select></label>
        <label>服务地址（可选）<input v-model="issuerForm.serviceEndpoint" placeholder="https://issuer.example.org/did"></label>
        <button class="primary" type="submit">创建机构 DID</button>
      </form>
      <hr>
      <header class="panel-head"><div><p>HOLDER SELF-CUSTODY</p><h2>登记个人钱包 DID</h2></div></header>
      <form @submit.prevent="registerHolder">
        <label>显示名称（可选）<input v-model="holderRegistration.name" maxlength="120" placeholder="默认使用钱包登记包名称"></label>
        <label>钱包公开登记包<textarea v-model="holderRegistration.documentText" required placeholder="粘贴钱包导出的 holder-did-registration-v1 JSON"></textarea></label>
        <button class="primary" type="submit">登记公开 DID</button>
      </form>
      <p class="security-note">个人 Holder 私钥只存在于用户钱包。本平台只保存 DID Document 中的公开密钥，无法代替个人签名。</p>
      <p class="message">{{ message }}</p>
    </section>
    <section class="panel">
      <header class="panel-head"><div><p>PUBLIC IDENTITIES</p><h2>DID 公开解析材料</h2></div><span>{{ workspace.dids.length }} 个</span></header>
      <div class="cards">
        <article v-for="did in workspace.dids" :key="did.id" class="did-card">
          <header><span class="tag">{{ did.role }}</span><strong>{{ did.name }}</strong><span class="status" :class="did.status">{{ did.status }}</span></header>
          <code>{{ did.did }}</code><small>{{ did.method }} · DID v{{ did.version }} · {{ did.keyCustody === 'holder_self_custody' ? '个人钱包自托管' : '机构 KMS 托管' }}</small>
          <div class="actions"><button @click="dialog?.open('DID Document · 公开验证材料', did.document)">查看 Document</button>
            <button v-if="did.capabilities.rotateKey && did.status === 'active'" @click="action(did, 'rotate-key')">轮换密钥</button>
            <button v-if="did.capabilities.deactivate && did.status === 'active'" class="danger" @click="action(did, 'deactivate')">停用</button></div>
          <div v-if="did.role === 'issuer'" class="chain-anchor"><small>本地链上锚定：{{ chainRecords[did.id]?.registered ? `已登记 · v${chainRecords[did.id].version}` : '尚未查询 / 尚未登记' }}</small>
            <div class="actions"><button @click="loadChainState(did)">查询链上状态</button><button v-if="did.status === 'active'" @click="chainAction(did, 'sync')">上链登记 / 同步</button><button v-if="did.status === 'deactivated' && chainRecords[did.id]?.registered && !chainRecords[did.id]?.deactivated" class="danger" @click="chainAction(did, 'deactivate')">写入链上停用</button></div></div>
        </article>
      </div>
    </section>
    <JsonDialog ref="dialog" />
  </div>
</template>
