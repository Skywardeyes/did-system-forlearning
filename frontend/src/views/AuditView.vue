<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ledgerApi } from '../api'
import type { SensitiveAccessLog, StructuredLog, VerificationLog } from '../types'

const tab = ref<'verification' | 'sensitive' | 'system'>('sensitive')
const verification = ref<VerificationLog[]>([])
const sensitive = ref<SensitiveAccessLog[]>([])
const system = ref<StructuredLog[]>([])
const error = ref('')
const query = ref('')
const sort = ref<'newest' | 'oldest'>('newest')
const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
const includesQuery = (values: unknown[]) => !query.value.trim() || values.some((value) => String(value ?? '').toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()))
const order = <T>(items: T[], getTime: (item: T) => string) => [...items].sort((a, b) => (sort.value === 'newest' ? -1 : 1) * (+new Date(getTime(a)) - +new Date(getTime(b))))
const filteredSensitive = computed(() => order(sensitive.value.filter((item) => includesQuery([item.credentialId, item.actorId, item.purposeCode])), (item) => item.occurredAt))
const filteredVerification = computed(() => order(verification.value.filter((item) => includesQuery([item.credentialId, item.format, item.valid ? '通过' : '失败'])), (item) => item.checkedAt))
const filteredSystem = computed(() => order(system.value.filter((item) => includesQuery([item.level, item.module, item.action, item.success ? '成功' : '失败'])), (item) => item.occurredAt))
onMounted(async () => {
  try { const [v, s, l] = await Promise.all([ledgerApi.verification(), ledgerApi.sensitive(), ledgerApi.structured()]); verification.value = v.items; sensitive.value = s.items; system.value = l.items }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '日志读取失败' }
})
</script>

<template>
  <div class="view"><section class="panel"><header class="panel-head"><div><p>APPEND-ONLY EVIDENCE</p><h2>审计与验证台账</h2></div><div class="tabs"><button :class="{active:tab==='sensitive'}" @click="tab='sensitive'">敏感访问</button><button :class="{active:tab==='verification'}" @click="tab='verification'">验证证据</button><button :class="{active:tab==='system'}" @click="tab='system'">系统日志</button></div></header>
      <p v-if="error" class="message">{{ error }}</p>
      <div class="toolbar"><label>搜索<input v-model="query" type="search" placeholder="凭证编号、操作人、模块或动作"></label><label>排序<select v-model="sort"><option value="newest">时间：新到旧</option><option value="oldest">时间：旧到新</option></select></label></div>
      <div class="table-wrap"><table v-if="tab === 'sensitive'"><thead><tr><th>凭证</th><th>操作人</th><th>用途</th><th>时间</th></tr></thead><tbody><tr v-for="item in filteredSensitive" :key="item.id"><td>{{ item.credentialId }}</td><td>{{ item.actorId }}</td><td>{{ item.purposeCode }}</td><td>{{ date(item.occurredAt) }}</td></tr><tr v-if="!filteredSensitive.length"><td colspan="4" class="empty">暂无匹配记录</td></tr></tbody></table>
        <table v-else-if="tab === 'verification'"><thead><tr><th>凭证</th><th>结果</th><th>格式</th><th>时间</th></tr></thead><tbody><tr v-for="item in filteredVerification" :key="item.id"><td>{{ item.credentialId }}</td><td>{{ item.valid ? '通过' : '失败' }}</td><td>{{ item.format }}</td><td>{{ date(item.checkedAt) }}</td></tr><tr v-if="!filteredVerification.length"><td colspan="4" class="empty">暂无匹配记录</td></tr></tbody></table>
        <table v-else><thead><tr><th>级别</th><th>模块</th><th>动作</th><th>结果</th><th>时间</th></tr></thead><tbody><tr v-for="item in filteredSystem" :key="item.id"><td>{{ item.level }}</td><td>{{ item.module }}</td><td>{{ item.action }}</td><td>{{ item.success ? '成功' : '失败' }}</td><td>{{ date(item.occurredAt) }}</td></tr><tr v-if="!filteredSystem.length"><td colspan="5" class="empty">暂无匹配记录</td></tr></tbody></table></div>
    </section></div>
</template>
