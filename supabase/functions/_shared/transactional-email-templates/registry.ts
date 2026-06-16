import * as React from 'npm:react@18.3.1'
import { template as welcomeTemplate } from './welcome.tsx'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string | ((data: any) => string)
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  welcome: welcomeTemplate,
}
