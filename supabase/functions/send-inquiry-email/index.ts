import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')!
const WEBHOOK_SECRET    = Deno.env.get('WEBHOOK_SECRET') ?? ''
const TO_EMAIL          = Deno.env.get('INQUIRY_TO_EMAIL') ?? 'qbizlab@gmail.com'
const FROM_EMAIL        = Deno.env.get('INQUIRY_FROM_EMAIL') ?? 'onboarding@resend.dev'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

serve(async (req) => {
  // Supabase Database Webhook 서명 검증
  // Supabase 대시보드 > Database > Webhooks > Secret 값을 WEBHOOK_SECRET 환경변수에 설정
  const auth = req.headers.get('authorization') ?? ''
  if (WEBHOOK_SECRET && auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const payload = await req.json()
    const record = payload.record ?? payload

    const teacherName = escapeHtml(record.teacher_name ?? '알 수 없음')
    const errorCode   = record.error_code ? escapeHtml(record.error_code) : null
    const message     = escapeHtml(record.message ?? '')
    const createdAt   = new Date(record.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

    const subject = errorCode
      ? `[비위더스 문의] ${teacherName} — ${errorCode}`
      : `[비위더스 문의] ${teacherName}`

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#00b4d8;margin-bottom:4px">비위더스 문의</h2>
        <p style="color:#888;font-size:13px;margin-top:0">${createdAt}</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr>
            <td style="padding:8px 0;color:#555;font-size:13px;width:80px">보낸 사람</td>
            <td style="padding:8px 0;font-weight:bold">${teacherName}</td>
          </tr>
          ${errorCode ? `
          <tr>
            <td style="padding:8px 0;color:#555;font-size:13px">에러코드</td>
            <td style="padding:8px 0">
              <span style="background:#fff0f0;color:#e53e3e;font-weight:bold;padding:2px 10px;border-radius:6px;font-size:14px;letter-spacing:2px">${errorCode}</span>
            </td>
          </tr>` : ''}
        </table>

        <div style="background:#f7f8fc;border-radius:12px;padding:16px;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap">${message}</div>

        <p style="margin-top:20px;font-size:12px;color:#aaa">
          앱 내 문의함에서도 확인하실 수 있습니다.
        </p>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: TO_EMAIL, subject, html }),
    })

    if (!res.ok) {
      const err = await res.text()
      return new Response(JSON.stringify({ error: err }), { status: 500 })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
  }
})
