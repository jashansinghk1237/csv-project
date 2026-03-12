import nodemailer from "nodemailer";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, subject, html } = req.body;

  if (!to || !subject || !html) {
    return res.status(400).json({ error: "Missing required fields: to, subject, html" });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Gmail App Password (16 chars)
      },
    });

    await transporter.sendMail({
      from: `"CSV Analyzer" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    return res.status(200).json({ success: true, message: "Email sent!" });
  } catch (err) {
    console.error("Email error:", err);
    return res.status(500).json({ error: err.message || "Failed to send email" });
  }
}
