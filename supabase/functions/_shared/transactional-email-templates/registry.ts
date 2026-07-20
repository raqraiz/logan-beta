import * as React from 'npm:react@18.3.1'
import { template as welcomeTemplate } from './welcome.tsx'
import { template as day3CheckinTemplate } from './day-3-checkin.tsx'
import { template as policyUpdate202607Template } from './policy-update-2026-07.tsx'
import { template as accountDeletedTemplate } from './account-deleted.tsx'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string | ((data: any) => string)
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  welcome: welcomeTemplate,
  'day-3-checkin': day3CheckinTemplate,
  'policy-update-2026-07': policyUpdate202607Template,
  'account-deleted': accountDeletedTemplate,
}
