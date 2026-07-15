<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'

const route = useRoute(); const router = useRouter(); const session = useSessionStore()
const mode = ref<'login' | 'register'>('login')
const displayName = ref(''); const email = ref(''); const password = ref('')
const organizationName = ref(''); const organizationType = ref('education')
const submitLabel = computed(() => mode.value === 'login' ? '登录信证台' : '创建组织账号')

async function submit() {
  if (mode.value === 'login') await session.login(email.value, password.value)
  else await session.register({ displayName: displayName.value, email: email.value, password: password.value,
    organization: { name: organizationName.value, organizationType: organizationType.value } })
  await router.replace(String(route.query.redirect || '/'))
}
</script>

<template>
  <div class="auth-page">
    <section class="auth-intro">
      <h1>信证台</h1>
      <p>可信凭证一次签发，不同组织随处验证！</p>
    </section>
    <section class="auth-card">
      <div class="tabs"><button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button><button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button></div>
      <form @submit.prevent="submit">
        <label v-if="mode === 'register'">姓名<input v-model="displayName" maxlength="120" required autocomplete="name"></label>
        <label>邮箱<input v-model="email" type="email" maxlength="320" required autocomplete="email"></label>
        <label>密码<input v-model="password" type="password" minlength="10" maxlength="128" required :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"></label>
        <p v-if="mode === 'register'" class="security-note">至少 10 位，并同时包含字母和数字。</p>
        <fieldset v-if="mode === 'register'">
          <legend>所属组织（一个账号只能绑定一个组织）</legend>
          <label>组织名称<input v-model="organizationName" maxlength="255" required></label>
          <label>组织类型<select v-model="organizationType">
            <option value="education">教育机构（学校/高校）</option>
            <option value="healthcare">医疗卫生机构（医院/诊所）</option>
            <option value="certification">资质认证与验证机构</option>
            <option value="training">职业培训机构</option>
            <option value="enterprise">企业/用人单位</option>
            <option value="government">政府/事业单位</option>
            <option value="industry_association">行业协会/商会</option>
            <option value="human_resources">人力资源与招聘机构</option>
            <option value="finance_insurance">金融/保险机构</option>
            <option value="research">科研机构</option>
            <option value="public_service">公共服务/社会组织</option>
            <option value="other">其他</option>
          </select></label>
        </fieldset>
        <button class="primary" :disabled="session.loading">{{ session.loading ? '处理中…' : submitLabel }}</button>
        <p class="message">{{ session.error }}</p>
      </form>
    </section>
  </div>
</template>
