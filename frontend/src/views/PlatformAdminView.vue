<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { platformApi } from '../api'

type Application = Awaited<ReturnType<typeof platformApi.applications>>['items'][number]
const applications = ref<Application[]>([]); const note = ref(''); const message = ref('')
async function refresh() { applications.value = (await platformApi.applications()).items }
async function review(id: string, decision: 'approved' | 'rejected') {
  await platformApi.review(id, decision, note.value)
  message.value = decision === 'approved' ? '组织已通过，签发与验证角色已授予申请人。' : '组织申请已拒绝。'
  await refresh()
}
onMounted(refresh)
</script>

<template><div class="view"><section class="panel"><div class="panel-head"><div><p>PLATFORM GOVERNANCE</p><h2>待审核组织</h2></div><span>平台角色与任何租户角色分离</span></div>
  <label>统一审核说明<textarea v-model="note" placeholder="记录审核依据，不填写敏感证件原文"></textarea></label>
  <div class="table-wrap"><table><thead><tr><th>组织</th><th>申请人</th><th>类型</th><th>提交时间</th><th>决定</th></tr></thead><tbody><tr v-for="item in applications" :key="item.id"><td><strong>{{ item.organizationName }}</strong><small>{{ item.tenantId }}</small></td><td>{{ item.submitter.name }}<small>{{ item.submitter.email }}</small></td><td>{{ item.organizationType }}</td><td>{{ new Date(item.submittedAt).toLocaleString() }}</td><td><div class="actions"><button class="primary" @click="review(item.id, 'approved')">通过</button><button class="danger" @click="review(item.id, 'rejected')">拒绝</button></div></td></tr></tbody></table><p v-if="!applications.length" class="empty">暂无待审核申请</p></div><p class="message">{{ message }}</p>
  </section></div></template>
