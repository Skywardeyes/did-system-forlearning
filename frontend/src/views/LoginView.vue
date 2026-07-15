<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'

const route = useRoute(); const router = useRouter(); const session = useSessionStore()
const mode = ref<'login' | 'register'>('login')
const displayName = ref(''); const email = ref(''); const password = ref('')
const createOrganization = ref(false); const organizationName = ref(''); const organizationType = ref('education')
const submitLabel = computed(() => mode.value === 'login' ? '登录并选择空间' : '创建账号')

async function submit() {
  if (mode.value === 'login') await session.login(email.value, password.value)
  else await session.register({ displayName: displayName.value, email: email.value, password: password.value,
    ...(createOrganization.value ? { onboarding: { type: 'organization', organization: { name: organizationName.value, organizationType: organizationType.value } } } : {}) })
  await router.replace(String(route.query.redirect || '/'))
}
</script>

<template>
  <div class="auth-page">
    <section class="auth-intro">
      <p class="eyebrow">DID / VC TRUST PLATFORM</p>
      <h1>一个自然人账号，进入多个可信空间</h1>
      <p>个人空间只负责 Holder 自持身份与凭证；组织空间经过审核后，才开放签发、验证与审计能力。</p>
      <ul><li>登录时不再区分“个人账号”和“组织账号”</li><li>私钥始终留在个人钱包，不上传平台</li><li>每次请求由 tenant_id 与成员角色共同隔离</li></ul>
    </section>
    <section class="auth-card">
      <div class="tabs"><button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button><button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button></div>
      <form @submit.prevent="submit">
        <label v-if="mode === 'register'">姓名<input v-model="displayName" maxlength="120" required autocomplete="name"></label>
        <label>邮箱<input v-model="email" type="email" maxlength="320" required autocomplete="email"></label>
        <label>密码<input v-model="password" type="password" minlength="10" maxlength="128" required :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"></label>
        <p v-if="mode === 'register'" class="security-note">至少 10 位，并同时包含字母和数字。</p>
        <label v-if="mode === 'register'" class="check-field"><input v-model="createOrganization" type="checkbox"><span>注册后同时提交组织入驻申请</span></label>
        <fieldset v-if="mode === 'register' && createOrganization">
          <legend>组织资料（审核通过前不可签发或验证）</legend>
          <label>组织名称<input v-model="organizationName" maxlength="255" required></label>
          <label>组织类型<select v-model="organizationType"><option value="education">教育机构</option><option value="enterprise">企业</option><option value="government">政府/事业单位</option><option value="other">其他</option></select></label>
        </fieldset>
        <button class="primary" :disabled="session.loading">{{ session.loading ? '处理中…' : submitLabel }}</button>
        <p class="message">{{ session.error }}</p>
      </form>
    </section>
  </div>
</template>
