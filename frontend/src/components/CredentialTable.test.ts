import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CredentialTable from './CredentialTable.vue'

describe('CredentialTable', () => {
  it('renders only protected metadata and never renders credential claims', () => {
    const wrapper = mount(CredentialTable, { props: { records: [{
      id: 'urn:uuid:credential-1', status: 'active', issuerDidId: 'issuer-1', holderDidId: 'holder-1',
      issuedAt: '2026-07-14T00:00:00.000Z', validFrom: '2026-07-14T00:00:00.000Z',
      validUntil: '2027-07-14T00:00:00.000Z', rowVersion: 1, contentProtected: true,
      selectiveDisclosureAvailable: true, sdJwtAvailable: true,
    }] } })
    expect(wrapper.text()).toContain('受保护的 VC 正文')
    expect(wrapper.text()).toContain('列表查询不解密')
    expect(wrapper.text()).not.toContain('学员姓名')
    expect(wrapper.text()).not.toContain('credentialSubject')
  })
})
