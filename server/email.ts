import nodemailer from "nodemailer";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "465", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env"
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<void> {
  const transport = createTransport();
  const from = process.env.SMTP_USER!;

  await transport.sendMail({
    from: `"Workflow Portal" <${from}>`,
    to,
    subject: "Reset your Workflow Portal password",
    text: [
      "You requested a password reset for your Workflow Portal account.",
      "",
      "Click the link below to set a new password. The link expires in 60 minutes.",
      "",
      resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>You requested a password reset for your Workflow Portal account.</p>",
      "<p>Click the link below to set a new password. The link expires in 60 minutes.</p>",
      `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
      "<p>If you did not request this, you can ignore this email.</p>",
    ].join(""),
  });
}
