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

interface WelcomeProps {
  name?: string | null
}

const WelcomeEmail = ({ name }: WelcomeProps) => {
  const greetingName = name && name.trim().length > 0 ? name.trim() : 'there'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Welcome to Logan — your AI cycle-syncing companion 💚</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Hi {greetingName}, welcome to Logan 💚</Heading>

          <Text style={text}>
            You're one of a small group of women helping me build Logan before it launches publicly.
            It's still in beta: free, evolving fast, and genuinely shaped by what you tell me.
          </Text>

          <Text style={text}>
            Logan is your AI cycle-syncing companion. It learns your cycle and gives you personal
            insights to feel and perform your best. No more guessing, no more guilt.
          </Text>

          <Text style={text}>
            As a founding member, you're not just using Logan. You're shaping what it becomes.
          </Text>

          <Text style={text}>
            Quick favor: add this email address to your contacts and mark it as "Not Spam" if it
            lands in your junk folder, so you don't miss updates from Logan.
          </Text>

          <Text style={text}>
            Give Logan a few days to get to know you — it only gets better the more you use it. Come
            back and chat whenever something's on your mind, whether it's how you're feeling today
            or just checking in on your patterns.
          </Text>

          <Text style={text}>
            And if anything ever feels off, just email feedback@asklogan.ai, or report it in the
            "feedback" section in the app. This comes straight to me, and I read every word. 🙏
          </Text>

          <Text style={signature}>
            Raquella 💚<br />
            Founder &amp; CEO, Logan<br />
            asklogan.ai
          </Text>

          <Text style={ps}>
            P.S. There's also a small WhatsApp group where founding members swap feedback and ideas with each other. Totally optional, but if you'd like in, just reply and I'll add you.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WelcomeEmail,
  subject: 'Welcome to Logan 💚',
  displayName: 'Welcome email',
  previewData: { name: 'Sam' },
} satisfies TemplateEntry

export default WelcomeEmail

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
const ps = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.6',
  margin: '24px 0 0',
}
