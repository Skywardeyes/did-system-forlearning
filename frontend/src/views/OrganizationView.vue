<script setup lang="ts">
import { ref } from 'vue'
import { sessionApi } from '../api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore(); const organizationName = ref(''); const organizationType = ref('enterprise')
const invitedEmail = ref(''); const invitationToken = ref(''); const receivedToken = ref(''); const message = ref('')
const members = ref<Array<{ id: string; displayName: string; email: string; roles: string[] }>>([])
const assignableRoles = ['issuer_operator', 'verifier_operator', 'credential_data_reader', 'tenant_admin']

async function refreshSession() { await session.switchWorkspace(session.session!.tenant.id) }
async function createOrganization() {
  const result = await sessionApi.createOrganization({ name: organizationName.value, organizationType: organizationType.value }) as { name: string }
  message.value = `组织“${result.name}”已提交审核`; await refreshSession()
}
async function invite() {
  const result = await sessionApi.invite({ email: invitedEmail.value, roleCode: 'organization_member' })
  invitationToken.value = result.token; message.value = '邀请已创建。令牌只在此处显示，请通过可信渠道交给受邀人。'
}
async function accept() {
  await sessionApi.acceptInvitation(receivedToken.value); message.value = '已加入组织，可在左侧空间切换器中进入。'; await refreshSession()
}
async function loadMembers() { members.value = (await sessionApi.members()).items }
async function toggleRole(member: { id: string; roles: string[] }, roleCode: string) {
  await sessionApi.setMemberRole(member.id, roleCode, !member.roles.includes(roleCode)); await loadMembers()
}
</script>

<template>
  <div class="view split">
    <section class="panel"><div class="panel-head"><div><p>MY WORKSPACES</p><h2>创建新的组织空间</h2></div></div>
      <form @submit.prevent="createOrganization"><label>组织名称<input v-model="organizationName" maxlength="255" required></label><label>组织类型<select v-model="organizationType"><option value="education">教育机构</option><option value="enterprise">企业</option><option value="government">政府/事业单位</option><option value="other">其他</option></select></label><button class="primary">提交入驻申请</button></form>
      <div class="cards workspace-list"><article v-for="item in session.workspaces" :key="item.id" class="did-card"><strong>{{ item.name }}</strong><small>{{ item.type }} · {{ item.verificationStatus }}</small><p>{{ item.roles.join(' / ') }}</p></article></div>
    </section>
    <section class="panel"><div class="panel-head"><div><p>MEMBERSHIP</p><h2>邀请或加入组织</h2></div></div>
      <form @submit.prevent="invite"><label>受邀邮箱<input v-model="invitedEmail" type="email" required></label><button class="primary">生成一次性邀请令牌</button><label v-if="invitationToken">邀请令牌<textarea :value="invitationToken" readonly></textarea></label></form>
      <hr><form @submit.prevent="accept"><label>收到的邀请令牌<input v-model="receivedToken" required></label><button>接受邀请</button></form><p class="message">{{ message }}</p>
    </section>
    <section v-if="session.session?.tenant.type === 'organization'" class="panel"><div class="panel-head"><div><p>ROLE GOVERNANCE</p><h2>组织成员授权</h2></div><button @click="loadMembers">加载成员</button></div>
      <div class="cards"><article v-for="member in members" :key="member.id" class="did-card"><strong>{{ member.displayName }}</strong><small>{{ member.email }}</small><p>{{ member.roles.join(' / ') }}</p><div class="actions"><button v-for="role in assignableRoles" :key="role" :class="{ primary: member.roles.includes(role) }" @click="toggleRole(member, role)">{{ member.roles.includes(role) ? '移除 ' : '授予 ' }}{{ role }}</button></div></article></div>
      <p class="security-note">组织审核通过后才可授予签发/验证角色；系统禁止移除最后一个租户管理员。</p>
    </section>
  </div>
</template>
