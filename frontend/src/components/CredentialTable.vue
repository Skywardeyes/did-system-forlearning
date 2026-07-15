<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CredentialSummary } from '../types'

const props = defineProps<{ records: CredentialSummary[] }>()
const emit = defineEmits<{
  reveal: [record: CredentialSummary]
  lifecycle: [record: CredentialSummary, action: 'suspend' | 'resume' | 'revoke']
  delivery: [record: CredentialSummary]
}>()
const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(value))
const short = (value: string) => value.length > 30 ? `${value.slice(0, 18)}…${value.slice(-6)}` : value
const statusLabel = (value: string) => ({ active: '有效', suspended: '已暂停', revoked: '已撤销', replaced: '已替换', expired: '已过期' }[value] || value)
const query = ref('')
const status = ref('all')
const sort = ref('newest')
const filteredRecords = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  return [...props.records]
    .filter((record) => status.value === 'all' || record.status === status.value)
    .filter((record) => !keyword || [record.templateName, record.issuerName, record.holderName, record.holderDid, record.id, record.credentialType].some((value) => String(value || '').toLocaleLowerCase().includes(keyword)))
    .sort((a, b) => sort.value === 'oldest' ? +new Date(a.issuedAt) - +new Date(b.issuedAt) : sort.value === 'holder' ? a.holderName.localeCompare(b.holderName, 'zh-CN') : sort.value === 'template' ? a.templateName.localeCompare(b.templateName, 'zh-CN') : +new Date(b.issuedAt) - +new Date(a.issuedAt))
})
</script>

<template>
  <div class="toolbar">
    <label>搜索<input v-model="query" type="search" placeholder="凭证名称、持有人、签发方或编号"></label>
    <label>状态<select v-model="status"><option value="all">全部状态</option><option value="active">有效</option><option value="suspended">已暂停</option><option value="revoked">已撤销</option><option value="expired">已过期</option></select></label>
    <label>排序<select v-model="sort"><option value="newest">签发时间：新到旧</option><option value="oldest">签发时间：旧到新</option><option value="holder">持有人名称</option><option value="template">凭证名称</option></select></label>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>签发的凭证</th><th>签发给</th><th>签发时间</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="record in filteredRecords" :key="record.id">
          <td>
            <strong>{{ record.templateName }}<span v-if="record.templateVersion"> · V{{ record.templateVersion }}</span></strong>
            <small>{{ record.issuerName }} 签发<span v-if="record.credentialType"> · {{ record.credentialType }}</span></small>
            <small title="凭证技术编号">凭证编号：{{ short(record.id) }}</small>
          </td>
          <td><strong>{{ record.holderName }}</strong><small :title="record.holderDid || ''">{{ record.holderDid ? short(record.holderDid) : '未记录 Holder DID' }}</small></td>
          <td><strong>{{ date(record.issuedAt) }}</strong><small>有效至 {{ date(record.validUntil) }}</small></td><td><span class="status" :class="record.status">{{ statusLabel(record.status) }}</span></td>
          <td class="actions">
            <button @click="emit('reveal', record)">授权查看</button>
            <button v-if="record.status === 'active'" @click="emit('delivery', record)">生成钱包交付包</button>
            <button v-if="record.status === 'active'" @click="emit('lifecycle', record, 'suspend')">暂停</button>
            <button v-if="record.status === 'suspended'" @click="emit('lifecycle', record, 'resume')">恢复</button>
            <button v-if="['active','suspended'].includes(record.status)" class="danger" @click="emit('lifecycle', record, 'revoke')">撤销</button>
          </td>
        </tr>
        <tr v-if="!filteredRecords.length"><td colspan="5" class="empty">{{ records.length ? '没有匹配的凭证' : '暂无凭证' }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
