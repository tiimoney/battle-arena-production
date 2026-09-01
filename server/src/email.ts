import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM ?? "Mocheso League <onboarding@resend.dev>";
const resend = apiKey ? new Resend(apiKey) : null;

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  if (!resend) {
    // No RESEND_API_KEY configured (e.g. local dev before the key is added) -- log
    // the link instead of failing sign-up outright.
    console.log(`\n[email] RESEND_API_KEY not set -- verification link for ${to}:\n  ${verifyUrl}\n`);
    return;
  }

  const { error } = await resend.emails.send({
    from: emailFrom,
    to,
    subject: "Verify your Mocheso League account",
    html: `
      <p>Welcome to Mocheso League!</p>
      <p>Click the link below to verify your email and finish creating your account:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in 24 hours. If you didn't request this, you can ignore this email.</p>
    `,
  });

  if (error) {
    console.error("Failed to send verification email:", error);
    throw new Error("Could not send verification email. Please try again.");
  }
}
