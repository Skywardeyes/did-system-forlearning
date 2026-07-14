<script setup lang="ts">
import type { CredentialSummary } from '../types'

defineProps<{ records: CredentialSummary[] }>()
const emit = defineEmits<{
  reveal: [record: CredentialSummary]
  lifecycle: [record: CredentialSummary, action: 'suspend' | 'resume' | 'revoke']
  delivery: [record: CredentialSummary]
}>()
const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
const short = (value: string) => `${value.slice(0, 18)}…${value.slice(-6)}`
</script>

<template>
  <div class="table-wrap">
    <table>
      <thead><tr><th>凭证</th><th>主体信息</th><th>签发时间</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="record in records" :key="record.id">
          <td><strong>{{ short(record.id) }}</strong><small>row v{{ record.rowVersion }}</small></td>
          <td><span class="protected">◆ 受保护的 VC 正文</span><small>列表查询不解密</small></td>
          <td>{{ date(record.issuedAt) }}</td><td><span class="status" :class="record.status">{{ record.status }}</span></td>
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
