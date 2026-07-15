<script setup lang="ts">
import type { CredentialSummary } from '../types'

defineProps<{ records: CredentialSummary[] }>()
const emit = defineEmits<{
  reveal: [record: CredentialSummary]
  lifecycle: [record: CredentialSummary, action: 'suspend' | 'resume' | 'revoke']
  delivery: [record: CredentialSummary]
}>()
const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(value))
const short = (value: string) => value.length > 30 ? `${value.slice(0, 18)}…${value.slice(-6)}` : value
const statusLabel = (value: string) => ({ active: '有效', suspended: '已暂停', revoked: '已撤销', replaced: '已替换', expired: '已过期' }[value] || value)
</script>

<template>
  <div class="table-wrap">
    <table>
      <thead><tr><th>签发的凭证</th><th>签发给</th><th>签发时间</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="record in records" :key="record.id">
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
        <tr v-if="!records.length"><td colspan="5" class="empty">暂无凭证</td></tr>
      </tbody>
    </table>
  </div>
</template>
