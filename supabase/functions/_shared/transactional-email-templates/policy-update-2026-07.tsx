/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface PolicyUpdateProps {
  name?: string | null
}

const PolicyUpdateEmail = ({ name }: PolicyUpdateProps) => {
  const firstName =
    name && name.trim().length > 0 ? name.trim().split(/\s+/)[0] : 'there'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>A quick update on Logan's privacy policy</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>A quick update on Logan's privacy policy</Heading>

          <Text style={text}>Hi {firstName},</Text>

          <Text style={text}>
            A quick update — I've made Logan's privacy policy clearer and stronger.
          </Text>

          <Text style={text}>
            The short version: your wellness data is never sold, shared with
            advertisers, or used to train AI models outside Logan. That was always
            true. Now it says so plainly.
          </Text>

          <Text style={text}>
            You can read the full updated policy here:{' '}
            <Link href="https://asklogan.ai/privacy" style={link}>
              asklogan.ai/privacy
            </Link>
          </Text>

          <Text style={text}>Nothing else is changing.</Text>

          <Text style={text}>Thank you for being here.</Text>

          <Text style={signature}>
            Raquella<br />
            Founder, Logan
          </Text>

          <Text style={ps}>
            If you'd like to delete your account or your data, email{' '}
            <Link href="mailto:feedback@asklogan.ai" style={link}>
              feedback@asklogan.ai
            </Link>{' '}
            anytime.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PolicyUpdateEmail,
  subject: "A quick update on Logan's privacy policy",
  displayName: 'Privacy policy update (July 2026)',
  previewData: { name: 'Sam' },
} satisfies TemplateEntry

export default PolicyUpdateEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  color: '#111827',
}
const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '40px 28px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: '600' as const,
  color: '#0f172a',
  lineHeight: '1.3',
  margin: '0 0 24px',
}
const text = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.6',
  margin: '0 0 18px',
}
const link = {
  color: 'hsl(168, 80%, 32%)',
  textDecoration: 'underline',
}
const signature = {
  fontSize: '15px',
  color: '#111827',
  lineHeight: '1.6',
  margin: '28px 0 0',
}
const ps = {
  fontSize: '13px',
  color: '#6b7280',
  lineHeight: '1.6',
  margin: '32px 0 0',
  borderTop: '1px solid #e5e7eb',
  paddingTop: '16px',
}
