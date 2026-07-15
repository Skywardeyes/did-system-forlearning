<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import JsonDialog from '../components/JsonDialog.vue'
import { blockchainApi, didApi } from '../api'
import { useWorkspaceStore } from '../stores/workspace'
import type { ChainDidRecord, DidSummary } from '../types'

const workspace = useWorkspaceStore()
const issuerForm = reactive({ name: '', method: 'example', serviceEndpoint: '' })
const message = ref('')
const dialog = ref<InstanceType<typeof JsonDialog> | null>(null)
const chainRecords = reactive<Record<string, ChainDidRecord>>({})
const holderRequests = ref<Array<{ id: string; holderDid: string; holderDisplayName: string; message: string | null; status: string; createdAt: string }>>([])
const didQuery = ref('')
const didSort = ref('name')
const requestQuery = ref('')
const requestSort = ref('newest')
const sortedDids = (role: 'issuer' | 'holder') => [...workspace.dids]
  .filter((item) => item.role === role)
  .filter((item) => !didQuery.value.trim() || [item.name, item.did, item.method, item.status].some((value) => String(value).toLocaleLowerCase().includes(didQuery.value.trim().toLocaleLowerCase())))
  .sort((a, b) => didSort.value === 'status' ? a.status.localeCompare(b.status) : a.name.localeCompare(b.name, 'zh-CN'))
const issuerDids = computed(() => sortedDids('issuer'))
const holderDids = computed(() => sortedDids('holder'))
const filteredRequests = computed(() => [...holderRequests.value]
  .filter((item) => !requestQuery.value.trim() || [item.holderDisplayName, item.holderDid, item.message, item.status].some((value) => String(value || '').toLocaleLowerCase().includes(requestQuery.value.trim().toLocaleLowerCase())))
  .sort((a, b) => (requestSort.value === 'newest' ? -1 : 1) * (+new Date(a.createdAt) - +new Date(b.createdAt))))

async function loadHolderRequests() {
  try { holderRequests.value = (await didApi.holderRequests()).items }
  catch (error) { message.value = error instanceof Error ? error.message : 'Holder 申请加载失败' }
}
async function decideHolderRequest(id: string, decision: 'accept' | 'reject') {
  try { await didApi.decideHolderRequest(id, decision); await Promise.all([loadHolderRequests(), workspace.refresh()]); message.value = decision === 'accept' ? '已接受申请并自动关联 Holder DID。' : '已拒绝 Holder 关联申请。' }
  catch (error) { message.value = error instanceof Error ? error.message : '申请处理失败' }
}

async function createIssuerDid() {
  try {
    await didApi.create({ ...issuerForm, role: 'issuer', serviceEndpoint: issuerForm.serviceEndpoint || undefined })
    issuerForm.name = ''; await workspace.refresh(); message.value = 'Issuer DID 创建成功，机构私钥由 KMS 管理'
  } catch (error) { message.value = error instanceof Error ? error.message : '创建失败' }
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
onMounted(loadHolderRequests)
</script>

<template>
  <div class="view">
    <div class="split">
    <section class="panel form-panel">
      <header class="panel-head"><div><p>INSTITUTION IDENTITY</p><h2>创建 Issuer DID</h2></div></header>
      <form @submit.prevent="createIssuerDid">
        <label>机构名称<input v-model="issuerForm.name" required maxlength="120"></label>
        <label>DID Method<select v-model="issuerForm.method"><option value="example">did:example</option><option value="key">did:key</option></select></label>
        <label>服务地址（可选）<input v-model="issuerForm.serviceEndpoint" placeholder="https://issuer.example.org/did"></label>
        <button class="primary" type="submit">创建机构 DID</button>
      </form>
      <header class="panel-head"><div><p>HOLDER REQUEST INBOX</p><h2>Holder 关联申请</h2></div><button type="button" @click="loadHolderRequests">刷新</button></header>
      <div class="toolbar"><label>搜索申请<input v-model="requestQuery" type="search" placeholder="姓名、DID 或申请说明"></label><label>排序<select v-model="requestSort"><option value="newest">申请时间：新到旧</option><option value="oldest">申请时间：旧到新</option></select></label></div>
      <div class="cards">
        <article v-for="request in filteredRequests" :key="request.id" class="did-card">
          <header><strong>{{ request.holderDisplayName }}</strong><span class="status" :class="request.status">{{ request.status }}</span></header>
          <code>{{ request.holderDid }}</code><p v-if="request.message">申请说明：{{ request.message }}</p><small>{{ new Date(request.createdAt).toLocaleString() }}</small>
          <div v-if="request.status === 'pending'" class="actions"><button class="primary" @click="decideHolderRequest(request.id, 'accept')">接受并关联</button><button class="danger" @click="decideHolderRequest(request.id, 'reject')">拒绝</button></div>
        </article>
        <p v-if="!filteredRequests.length" class="empty">暂无匹配的 Holder 关联申请。</p>
      </div>
      <p class="message">{{ message }}</p>
    </section>
    <section class="panel did-directory">
      <header class="panel-head"><div><p>PUBLIC IDENTITIES</p><h2>DID 身份解析资料</h2></div><span>{{ workspace.dids.length }} 个</span></header>
      <div class="toolbar"><label>搜索<input v-model="didQuery" type="search" placeholder="名称、DID 或方法"></label><label>排序<select v-model="didSort"><option value="name">名称</option><option value="status">状态</option></select></label></div>
      <header class="identity-group-head"><div><strong>本组织创建的 Issuer DID</strong><small>机构持有并由 KMS 托管签名密钥</small></div><span>{{ issuerDids.length }} 个</span></header>
      <div class="table-wrap"><table><thead><tr><th>身份</th><th>DID 与托管</th><th>状态</th><th>操作</th></tr></thead><tbody>
        <tr v-for="did in issuerDids" :key="did.id"><td><strong>{{ did.name }}</strong><small>Issuer · {{ did.method }} · v{{ did.version }}</small></td><td><small>{{ did.did }}</small><small>机构 KMS 托管</small></td><td><span class="status" :class="did.status">{{ did.status }}</span><small>链上：{{ chainRecords[did.id]?.registered ? `已登记 v${chainRecords[did.id].version}` : '未查询' }}</small></td><td class="actions"><button @click="dialog?.open('Issuer DID Document · 公开验证材料', did.document)">查看</button><button v-if="did.capabilities.rotateKey && did.status === 'active'" @click="action(did, 'rotate-key')">轮换</button><button @click="loadChainState(did)">查链</button><button v-if="did.status === 'active'" @click="chainAction(did, 'sync')">同步上链</button><button v-if="did.capabilities.deactivate && did.status === 'active'" class="danger" @click="action(did, 'deactivate')">停用</button></td></tr>
        <tr v-if="!issuerDids.length"><td colspan="4" class="empty">暂无匹配的本组织 Issuer DID</td></tr>
      </tbody></table></div>
      <header class="identity-group-head holder"><div><strong>个人钱包发来的 Holder DID</strong><small>个人持有私钥，本组织只保存公开解析材料</small></div><span>{{ holderDids.length }} 个</span></header>
      <div class="table-wrap"><table><thead><tr><th>持有人</th><th>DID 与来源</th><th>状态</th><th>操作</th></tr></thead><tbody>
        <tr v-for="did in holderDids" :key="did.id"><td><strong>{{ did.name }}</strong><small>Holder · {{ did.method }} · v{{ did.version }}</small></td><td><small>{{ did.did }}</small><small>来自个人钱包 · 私钥不上传</small></td><td><span class="status" :class="did.status">{{ did.status }}</span></td><td class="actions"><button @click="dialog?.open('Holder DID Document · 钱包公开材料', did.document)">查看</button></td></tr>
        <tr v-if="!holderDids.length"><td colspan="4" class="empty">暂无匹配的钱包 Holder DID</td></tr>
      </tbody></table></div>
    </section>
    </div>
    <JsonDialog ref="dialog" />
  </div>
</template>
