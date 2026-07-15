<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import CredentialTable from '../components/CredentialTable.vue'
import JsonDialog from '../components/JsonDialog.vue'
import { credentialApi, credentialTemplateApi } from '../api'
import { useWorkspaceStore } from '../stores/workspace'
import type { CredentialSummary, CredentialTemplate, CredentialTemplateField } from '../types'

const workspace = useWorkspaceStore(); const templates = ref<CredentialTemplate[]>([])
const issuers = computed(() => workspace.dids.filter((item) => item.role === 'issuer' && item.status === 'active'))
const holders = computed(() => workspace.dids.filter((item) => item.role === 'holder' && item.status === 'active'))
const publishedTemplates = computed(() => templates.value.filter((item) => item.status === 'published'))
const selectedTemplate = computed(() => publishedTemplates.value.find((item) => item.id === issueForm.templateId) || null)
const issueForm = reactive({ issuerDid: '', holderDid: '', templateId: '', validUntil: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 16), claims: {} as Record<string, string | number | boolean> })
const draft = reactive({ name: '', credentialType: '', fields: [{ key: '', label: '', type: 'string', required: true, optionsText: '' }] as Array<{ key: string; label: string; type: string; required: boolean; optionsText: string }> })
const message = ref(''); const templateMessage = ref(''); const dialog = ref<InstanceType<typeof JsonDialog> | null>(null)

function addField() { draft.fields.push({ key: '', label: '', type: 'string', required: true, optionsText: '' }) }
function removeField(index: number) { if (draft.fields.length > 1) draft.fields.splice(index, 1) }
function resetClaims() { issueForm.claims = {} }
async function refreshTemplates() { templates.value = (await credentialTemplateApi.list()).items }
async function createTemplate() {
  try {
    await credentialTemplateApi.create({ name: draft.name, credentialType: draft.credentialType,
      fields: draft.fields.map((field) => ({ key: field.key, label: field.label, type: field.type, required: field.required,
        ...(field.type === 'enum' ? { options: field.optionsText.split(',').map((item) => item.trim()).filter(Boolean) } : {}) })) })
    await refreshTemplates(); templateMessage.value = '模板草稿已创建，发布后才能用于签发。'
  } catch (error) { templateMessage.value = error instanceof Error ? error.message : '模板创建失败' }
}
async function templateAction(item: CredentialTemplate, action: 'publish' | 'retire') {
  try { await credentialTemplateApi[action](item.id); await refreshTemplates(); templateMessage.value = action === 'publish' ? '模板已发布并冻结。' : '模板已停用签发，历史 VC 仍可验证。' }
  catch (error) { templateMessage.value = error instanceof Error ? error.message : '模板状态更新失败' }
}
async function issue() {
  try { const result = await credentialApi.issue({ ...issueForm, validUntil: new Date(issueForm.validUntil).toISOString() }); dialog.value?.open('新签发动态 VC · 仅本次返回', result); await workspace.refresh(); message.value = '动态字段 VC 签发成功，交付消息已发送至 Holder 钱包。' }
  catch (error) { message.value = error instanceof Error ? error.message : '签发失败' }
}
async function reveal(record: CredentialSummary) { try { const result = await credentialApi.content(record.id, 'issuer_support'); dialog.value?.open('授权查看 · 已记录敏感访问', result.credential) } catch (error) { message.value = error instanceof Error ? error.message : '无权查看' } }
async function lifecycle(record: CredentialSummary, action: 'suspend' | 'resume' | 'revoke') { if (action === 'revoke' && !confirm('撤销后不可恢复，确认继续？')) return; try { await credentialApi.action(record.id, action, { expectedRowVersion: record.rowVersion }); await workspace.refresh(); message.value = '凭证状态已更新' } catch (error) { message.value = error instanceof Error ? error.message : '操作失败' } }
async function delivery(record: CredentialSummary) { try { const value = await credentialApi.walletPackage(record.id); dialog.value?.open('钱包 VC 交付包', value); message.value = '交付包已生成，其中不包含 Holder 私钥' } catch (error) { message.value = error instanceof Error ? error.message : '生成交付包失败' } }
function inputType(field: CredentialTemplateField) { return field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text' }
onMounted(refreshTemplates)
</script>

<template>
  <div class="view">
    <section class="panel form-panel">
      <header class="panel-head"><div><p>CREDENTIAL TEMPLATE REGISTRY</p><h2>组织自定义凭证模板</h2></div><span>发布后不可直接修改</span></header>
      <form @submit.prevent="createTemplate">
        <div class="form-row"><label>模板名称<input v-model="draft.name" required placeholder="例如 大学毕业证明"></label><label>凭证类型<input v-model="draft.credentialType" required placeholder="例如 UniversityGraduationCredential"></label></div>
        <div v-for="(field, index) in draft.fields" :key="index" class="template-field-row">
          <label>字段键<input v-model="field.key" required placeholder="例如 major"></label><label>中文名称<input v-model="field.label" required placeholder="例如 专业"></label>
          <label>类型<select v-model="field.type"><option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔值</option><option value="date">日期</option><option value="datetime">日期时间</option><option value="enum">枚举</option></select></label>
          <label v-if="field.type === 'enum'">枚举选项<input v-model="field.optionsText" placeholder="优秀,合格,不合格"></label>
          <label class="check-field"><input v-model="field.required" type="checkbox">必填</label><button type="button" class="secondary" @click="removeField(index)">删除字段</button>
        </div>
        <div class="actions"><button type="button" class="secondary" @click="addField">添加字段</button><button class="primary">创建模板草稿</button></div><p class="message">{{ templateMessage }}</p>
      </form>
      <div class="cards"><article v-for="item in templates" :key="item.id" class="did-card"><strong>{{ item.name }} · V{{ item.version }}</strong><small>{{ item.credentialType }} · {{ item.status }}</small><p>{{ item.schema.fields.map((field) => field.label).join(' / ') }}</p><div class="actions"><button v-if="item.status === 'draft'" @click="templateAction(item, 'publish')">发布模板</button><button v-if="item.status === 'published'" class="secondary" @click="templateAction(item, 'retire')">停止新签发</button></div></article></div>
    </section>

    <div class="split credential-layout">
      <section class="panel form-panel"><header class="panel-head"><div><p>DYNAMIC CREDENTIAL ISSUANCE</p><h2>按模板签发 VC</h2></div></header>
        <form @submit.prevent="issue"><label>Issuer<select v-model="issueForm.issuerDid" required><option value="" disabled>选择签发方</option><option v-for="did in issuers" :key="did.id" :value="did.did">{{ did.name }}</option></select></label>
          <label>Holder<select v-model="issueForm.holderDid" required><option value="" disabled>选择持有人</option><option v-for="did in holders" :key="did.id" :value="did.did">{{ did.name }}</option></select></label>
          <label>凭证模板<select v-model="issueForm.templateId" required @change="resetClaims"><option value="" disabled>选择已发布模板</option><option v-for="item in publishedTemplates" :key="item.id" :value="item.id">{{ item.name }} · V{{ item.version }}</option></select></label>
          <template v-for="field in selectedTemplate?.schema.fields || []" :key="field.key">
            <label v-if="field.type === 'boolean'">{{ field.label }}<select v-model="issueForm.claims[field.key]" :required="field.required"><option :value="true">是</option><option :value="false">否</option></select></label>
            <label v-else-if="field.type === 'enum'">{{ field.label }}<select v-model="issueForm.claims[field.key]" :required="field.required"><option value="" disabled>请选择</option><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select></label>
            <label v-else>{{ field.label }}<input v-model="issueForm.claims[field.key]" :type="inputType(field)" :required="field.required"></label>
          </template>
          <label>有效至<input v-model="issueForm.validUntil" type="datetime-local" required></label>
          <button class="primary" :disabled="!selectedTemplate">使用 Issuer KMS 签发</button><p class="message">{{ message }}</p></form>
      </section>
      <section class="panel"><header class="panel-head"><div><p>PROTECTED REGISTER</p><h2>VC 非敏感摘要</h2></div><span>列表不解密</span></header><CredentialTable :records="workspace.credentials" @reveal="reveal" @lifecycle="lifecycle" @delivery="delivery" /></section>
    </div><JsonDialog ref="dialog" />
  </div>
</template>
