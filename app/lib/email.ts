import { Resend } from "resend";

let resend: Resend | null = null;

function getResend(): Resend {
  if (resend) return resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY environment variable.");
  resend = new Resend(key);
  return resend;
}

export async function sendAlertEmail(
  to: string,
  score: number,
  recommendation: string,
  reason: string
): Promise<void> {
  const from = process.env.ALERT_FROM_EMAIL || "alerts@haydays.app";
  const resendClient = getResend();

  await resendClient.emails.send({
    from,
    to,
    subject: `Hay Days Alert: ${recommendation} (Score: ${score})`,
    text: [
      `Good hay window detected for your field.`,
      ``,
      `Score: ${score}/100`,
      `Recommendation: ${recommendation}`,
      `Details: ${reason}`,
      ``,
      `Open Hay Days: https://www.HayDays.app`,
    ].join("\n"),
  });
}
