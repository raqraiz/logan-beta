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

interface AmaEventProps {
  name?: string | null
}

const AmaEventEmail = ({ name }: AmaEventProps) => {
  const firstName =
    name && name.trim().length > 0 ? name.trim().split(/\s+/)[0] : 'there'
  return (
    <Html lang="en" dir="ltr">
      <Head>
        {/*
          Some clients (iOS Mail / Gmail) auto-detect messaging + calendar URLs
          and inject their own rich-link chip: an app icon plus a second,
          auto-generated label next to the real anchor. Disabling data
          detectors keeps every URL inline as plain authored text, regardless
          of domain — no per-domain special casing.
        */}
        <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
        <meta name="x-apple-disable-message-reformatting" />
        <style>{noAutoLinkCss}</style>
      </Head>

      <Preview>
        This Thursday: ask an endocrinologist anything about your hormones
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            Ask an endocrinologist anything about your hormones
          </Heading>

          <Text style={text}>Hi {firstName},</Text>

          <Text style={text}>
            If you could sit down with an endocrinologist and ask her anything
            about your hormones, what would you ask?
          </Text>

          <Text style={text}>
            I asked the Logan community this recently, and the questions people
            sent in were thoughtful, specific, and honestly, things I've wondered
            about too.
          </Text>

          <Text style={text}>
            So this Thursday, Dr. Hanah Polotsky, endocrinologist, is joining us
            for a live Ask Me Anything.
          </Text>

          <Text style={text}>A few questions we'll be digging into:</Text>

          <Text style={bullet}>
            • Why can period flu, fatigue, bloating and mood changes be so real
            when your bloodwork is "normal"?
          </Text>
          <Text style={bullet}>
            • What can cause long-term hair loss when your labs show no
            deficiencies?
          </Text>
          <Text style={bullet}>
            • What are the actually realistic ways to reduce exposure to endocrine
            disruptors?
          </Text>

          <Text style={text}>
            No slides, no pitch. Just your questions and real answers.
          </Text>

          <Text style={details}>
            📅 Thursday, September 3<br />
            🕣 8:30–9:30 PM (GMT+3)
          </Text>

          <Text style={text}>
            The event is free, and is exclusive to Logan's community of women.
          </Text>

          <Text style={text}>Here's how to sign up:</Text>

          <Text style={bullet}>
            1. Join the WhatsApp community →{' '}
            <Link
              href="https://chat.whatsapp.com/LCDSbBllryl68cM7Op21pt?mode=gi_t"
              style={link}
            >
              chat.whatsapp.com
            </Link>
          </Text>
          <Text style={bullet}>
            2. Register for the session →{' '}
            <Link href="https://luma.com/7oktn2uc" style={link}>
              luma.com/7oktn2uc
            </Link>
          </Text>

          <Text style={ps}>
            This session is for general education, not individualized medical
            advice. Full disclaimer at registration.
          </Text>

          <Text style={signature}>
            See you Thursday!
            <br />
            Raquella Raiz
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AmaEventEmail,
  subject: 'This Thursday: Ask an endocrinologist anything about your hormones',
  displayName: 'AMA event invite (Sept 2026)',
  previewData: { name: 'Sam' },
} satisfies TemplateEntry

export default AmaEventEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
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
const bullet = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.6',
  margin: '0 0 10px',
  paddingLeft: '8px',
}
const details = {
  fontSize: '15px',
  color: '#111827',
  lineHeight: '1.7',
  margin: '0 0 18px',
  padding: '14px 16px',
  backgroundColor: '#f0fdf9',
  borderRadius: '10px',
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
