<script setup lang="ts">
import type { VerificationResult } from '../types'
defineProps<{ result: VerificationResult | null }>()
</script>

<template>
  <section class="panel report">
    <header class="panel-head"><div><p>VERIFICATION REPORT</p><h2>逐项验证报告</h2></div>
      <span class="result" :class="result?.valid ? 'valid' : result ? 'invalid' : ''">{{ result ? (result.valid ? '验证通过' : '验证失败') : '等待验证' }}</span></header>
    <div v-if="result" class="check-list">
      <div v-for="check in result.checks" :key="check.key" class="check" :class="{ failed: !check.passed }">
        <b>{{ check.passed ? '✓' : '×' }}</b><div><strong>{{ check.label }}</strong><small>{{ check.detail }}</small></div>
      </div>
    </div>
    <div v-else class="empty">提交凭证或披露证明后显示检查结果</div>
  </section>
</template>
