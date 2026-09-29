// Email client with Resend (primary) and Gmail API/Nodemailer fallback
// Primary: Resend via Replit connector
// Fallback: Gmail API via Replit connector, then Nodemailer SMTP

import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

let resendConnectionSettings: any;
let gmailConnectionSettings: any;

async function getResendCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  resendConnectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!resendConnectionSettings || !resendConnectionSettings.settings?.api_key) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: resendConnectionSettings.settings.api_key, 
    fromEmail: resendConnectionSettings.settings.from_email || 'noreply@melorimusicplatform.com'
  };
}

async function getGmailAccessToken() {
  // Check if cached token is still valid
  if (gmailConnectionSettings && gmailConnectionSettings.settings?.expires_at && 
      new Date(gmailConnectionSettings.settings.expires_at).getTime() > Date.now()) {
    return gmailConnectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  console.log('Gmail connector response:', JSON.stringify(data, null, 2));
  
  gmailConnectionSettings = data.items?.[0];

  const accessToken = gmailConnectionSettings?.settings?.access_token || 
                      gmailConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!gmailConnectionSettings || !accessToken) {
    throw new Error('Gmail connector not available - please reconnect Gmail in Replit Integrations');
  }
  return accessToken;
}

async function sendViaResend(to: string, subject: string, htmlBody: string): Promise<boolean> {
  const { apiKey, fromEmail } = await getResendCredentials();
  const resend = new Resend(apiKey);
  
  // Always use verified domain email
  const verifiedFromEmail = 'MELORI MUSIC <noreply@melorimusicplatform.com>';
  console.log(`Resend sending from: ${verifiedFromEmail} (connector provided: ${fromEmail})`);
  
  const result = await resend.emails.send({
    from: verifiedFromEmail,
    to: to,
    subject: subject,
    html: htmlBody
  });
  
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  return true;
}

async function sendViaGmailAPI(to: string, subject: string, htmlBody: string): Promise<boolean> {
  const accessToken = await getGmailAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  const encodedMessage = Buffer.from(
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `Content-Type: text/html; charset=utf-8\r\n\r\n` +
    htmlBody
  ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage }
  });
  
  return true;
}

async function sendViaNodemailer(to: string, subject: string, htmlBody: string): Promise<boolean> {
  const appPassword = process.env.GMAIL_APP_PASSWORD?.trim().replace(/\s+/g, '');
  if (!appPassword) {
    throw new Error('GMAIL_APP_PASSWORD not configured');
  }
  
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'melorimusicplatform@gmail.com',
      pass: appPassword
    }
  });
  
  await transport.sendMail({
    from: '"MELORI MUSIC" <melorimusicplatform@gmail.com>',
    to: to,
    subject: subject,
    html: htmlBody
  });
  
  return true;
}

async function sendEmail(to: string, subject: string, htmlBody: string): Promise<boolean> {
  // Try Gmail API first (user preference), then Resend, then Nodemailer SMTP
  try {
    await sendViaGmailAPI(to, subject, htmlBody);
    console.log(`Email sent via Gmail API to ${to}`);
    return true;
  } catch (apiError: any) {
    console.log(`Gmail API failed: ${apiError.message}, trying Resend...`);
    
    try {
      await sendViaResend(to, subject, htmlBody);
      console.log(`Email sent via Resend to ${to}`);
      return true;
    } catch (resendError: any) {
      console.log(`Resend failed: ${resendError.message}, trying Nodemailer...`);
      
      try {
        await sendViaNodemailer(to, subject, htmlBody);
        console.log(`Email sent via Nodemailer to ${to}`);
        return true;
      } catch (smtpError: any) {
        console.error(`All email methods failed`);
        throw new Error(`All email methods failed: Gmail API=${apiError.message}, Resend=${resendError.message}, SMTP=${smtpError.message}`);
      }
    }
  }
}

interface FeedbackEmailData {
  email: string;
  name?: string;
  subject: string;
  message: string;
  rating?: number;
}

export async function sendFeedbackEmail(feedback: FeedbackEmailData): Promise<boolean> {
  const subjectLabels: Record<string, string> = {
    general: 'General Feedback',
    feature: 'Feature Request',
    bug: 'Bug Report',
    praise: 'Compliment',
    partnership: 'Partnership Inquiry',
    other: 'Other'
  };
  
  const subjectLine = `[Melori Feedback] ${subjectLabels[feedback.subject] || feedback.subject}`;
  const ratingStars = feedback.rating ? '★'.repeat(feedback.rating) + '☆'.repeat(5 - feedback.rating) : 'Not rated';
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; padding: 30px; border-radius: 12px;">
  <h1 style="color: #ff5500; margin-bottom: 20px;">New Feedback Submission</h1>
  <p style="color: #ffffff;"><strong>From:</strong> ${feedback.name || 'Anonymous'}</p>
  <p style="color: #ffffff;"><strong>Email:</strong> ${feedback.email}</p>
  <p style="color: #ffffff;"><strong>Subject:</strong> ${subjectLabels[feedback.subject] || feedback.subject}</p>
  <p style="color: #ffffff;"><strong>Rating:</strong> ${ratingStars} (${feedback.rating || 'N/A'}/5)</p>
  <div style="background: #2a2a2a; padding: 15px; border-radius: 8px; margin-top: 20px;">
    <p style="color: #cccccc;">${feedback.message.replace(/\n/g, '<br>')}</p>
  </div>
  <p style="color: #666666; font-size: 11px; margin-top: 30px;">MELORI MUSIC PLATFORM</p>
</body>
</html>
  `.trim();

  return sendEmail('melorimusicplatform@gmail.com', subjectLine, htmlBody);
}

interface SaleEmailData {
  customerEmail: string;
  customerName?: string;
  itemTitle: string;
  itemType: 'album' | 'song';
  amount: number;
  saleId: number;
  stripePaymentIntentId?: string;
}

export async function sendSaleNotificationEmail(sale: SaleEmailData): Promise<boolean> {
  const subjectLine = `[Melori Sale] New ${sale.itemType === 'album' ? 'Album' : 'Song'} Purchase - $${sale.amount.toFixed(2)}`;
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; padding: 30px; border-radius: 12px;">
  <h1 style="color: #ff5500; margin-bottom: 20px;">New Sale!</h1>
  <p style="color: #ffffff;"><strong>Item:</strong> ${sale.itemTitle}</p>
  <p style="color: #ffffff;"><strong>Type:</strong> ${sale.itemType === 'album' ? 'Album' : 'Single Track'}</p>
  <p style="color: #ff5500; font-size: 24px;"><strong>Amount:</strong> $${sale.amount.toFixed(2)}</p>
  <div style="background: #2a2a2a; padding: 15px; border-radius: 8px; margin-top: 20px;">
    <p style="color: #cccccc;"><strong>Customer:</strong> ${sale.customerName || 'Not provided'}</p>
    <p style="color: #cccccc;"><strong>Email:</strong> ${sale.customerEmail}</p>
    <p style="color: #888888;"><strong>Sale ID:</strong> ${sale.saleId}</p>
    <p style="color: #888888;"><strong>Stripe ID:</strong> ${sale.stripePaymentIntentId || 'N/A'}</p>
  </div>
  <p style="color: #666666; font-size: 11px; margin-top: 30px;">MELORI MUSIC PLATFORM</p>
</body>
</html>
  `.trim();

  return sendEmail('melorimusicplatform@gmail.com', subjectLine, htmlBody);
}

interface PurchaseConfirmationData {
  customerEmail: string;
  itemTitle: string;
  itemType: 'album' | 'song';
  downloadUrl: string;
}

export async function sendPurchaseConfirmationEmail(data: PurchaseConfirmationData): Promise<boolean> {
  const subjectLine = `Your MELORI MUSIC Purchase: ${data.itemTitle}`;
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; padding: 30px; border-radius: 12px;">
  <h1 style="color: #ff5500; margin-bottom: 20px;">Thank You for Your Purchase!</h1>
  <p style="color: #ffffff; font-size: 16px;">Your purchase of <strong>${data.itemTitle}</strong> is complete.</p>
  <p style="color: #cccccc; font-size: 14px;">Click the button below to download your music:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.downloadUrl}" style="background: #ff5500; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Download Your Music</a>
  </div>
  <p style="color: #888888; font-size: 12px;">If you have any questions, contact us at melorimusicplatform@gmail.com</p>
  <p style="color: #666666; font-size: 11px; margin-top: 30px;">MELORI MUSIC PLATFORM</p>
</body>
</html>
  `.trim();

  return sendEmail(data.customerEmail, subjectLine, htmlBody);
}
