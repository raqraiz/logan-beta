/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string | null
}

const Email = ({ name }: Props) => {
  const greeting = name && name.trim().length > 0 ? name.trim() : 'there'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your Logan account has been permanently deleted</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Your Logan account has been deleted</Heading>
          <Text style={text}>Hi {greeting},</Text>
          <Text style={text}>
            This is a confirmation that your Logan account, along with all your chat history,
            cycle data, symptoms, widgets, and connected device tokens, has been permanently
            deleted at your request.
          </Text>
          <Text style={text}>
            There's nothing left to do on your end — none of your data remains on our systems.
          </Text>
          <Text style={text}>
            If you ever want to come back, you're always welcome. And if this deletion wasn't
            you, please reply to this email right away.
          </Text>
          <Text style={signature}>
            Raquella 💚<br />
            Founder &amp; CEO, Logan<br />
            asklogan.ai
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Your Logan account has been deleted',
  displayName: 'Account deleted confirmation',
  previewData: { name: 'Sam' },
} satisfies TemplateEntry

export default Email

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  color: '#111827',
}
const container = { maxWidth: '560px', margin: '0 auto', padding: '40px 28px' }
const h1 = { fontSize: '24px', fontWeight: '600' as const, color: '#0f172a', lineHeight: '1.3', margin: '0 0 24px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 18px' }
const signature = { fontSize: '15px', color: '#111827', lineHeight: '1.6', margin: '28px 0 0' }
