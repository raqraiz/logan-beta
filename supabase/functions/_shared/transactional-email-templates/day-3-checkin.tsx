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

interface Day3CheckinProps {
  name?: string | null
}

const Day3CheckinEmail = ({ name }: Day3CheckinProps) => {
  const greetingName = name && name.trim().length > 0 ? name.trim() : 'there'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>How's Logan feeling so far? 💚</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Hi {greetingName},</Heading>

          <Text style={text}>
            You've had a few days with Logan now, so I wanted to check in. Is it starting to click,
            or is something missing?
          </Text>

          <Text style={text}>
            I'd love to hear it, the good, the confusing, the "I wish it did this." Just email
            feedback@asklogan.ai. This comes straight to me, and I read every word. 🙏
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
  component: Day3CheckinEmail,
  subject: "How's Logan feeling so far? 💚",
  displayName: 'Day 3 check-in',
  previewData: { name: 'Sam' },
} satisfies TemplateEntry

export default Day3CheckinEmail

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
  fontSize: '24px',
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
const signature = {
  fontSize: '15px',
  color: '#111827',
  lineHeight: '1.6',
  margin: '28px 0 0',
}
