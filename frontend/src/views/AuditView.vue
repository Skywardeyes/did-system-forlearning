<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ledgerApi } from '../api'
import type { SensitiveAccessLog, StructuredLog, VerificationLog } from '../types'

const tab = ref<'verification' | 'sensitive' | 'system'>('sensitive')
const verification = ref<VerificationLog[]>([])
const sensitive = ref<SensitiveAccessLog[]>([])
const system = ref<StructuredLog[]>([])
const error = ref('')
const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
onMounted(async () => {
  try { const [v, s, l] = await Promise.all([ledgerApi.verification(), ledgerApi.sensitive(), ledgerApi.structured()]); verification.value = v.items; sensitive.value = s.items; system.value = l.items }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '日志读取失败' }
})
</script>

<template>
  <div class="view"><section class="panel"><header class="panel-head"><div><p>APPEND-ONLY EVIDENCE</p><h2>审计与验证台账</h2></div><div class="tabs"><button :class="{active:tab==='sensitive'}" @click="tab='sensitive'">敏感访问</button><button :class="{active:tab==='verification'}" @click="tab='verification'">验证证据</button><button :class="{active:tab==='system'}" @click="tab='system'">系统日志</button></div></header>
      <p v-if="error" class="message">{{ error }}</p>
      <div class="table-wrap"><table v-if="tab === 'sensitive'"><thead><tr><th>凭证</th><th>操作人</th><th>用途</th><th>时间</th></tr></thead><tbody><tr v-for="item in sensitive" :key="item.id"><td>{{ item.credentialId }}</td><td>{{ item.actorId }}</td><td>{{ item.purposeCode }}</td><td>{{ date(item.occurredAt) }}</td></tr></tbody></table>
        <table v-else-if="tab === 'verification'"><thead><tr><th>凭证</th><th>结果</th><th>格式</th><th>时间</th></tr></thead><tbody><tr v-for="item in verification" :key="item.id"><td>{{ item.credentialId }}</td><td>{{ item.valid ? '通过' : '失败' }}</td><td>{{ item.format }}</td><td>{{ date(item.checkedAt) }}</td></tr></tbody></table>
        <table v-else><thead><tr><th>级别</th><th>模块</th><th>动作</th><th>结果</th><th>时间</th></tr></thead><tbody><tr v-for="item in system" :key="item.id"><td>{{ item.level }}</td><td>{{ item.module }}</td><td>{{ item.action }}</td><td>{{ item.success ? '成功' : '失败' }}</td><td>{{ date(item.occurredAt) }}</td></tr></tbody></table></div>
    </section></div>
</template>
