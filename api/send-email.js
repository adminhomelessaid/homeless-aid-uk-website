import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { formType, ...formData } = req.body;

  // Create transporter using Office 365 SMTP
  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER, // info@homelessaid.co.uk
      pass: process.env.EMAIL_PASS  // Office 365 password
    }
  });

  let subject = '';
  let html = '';

  if (formType === 'volunteer') {
    subject = 'New Volunteer Application - Homeless Aid UK';
    html = `
      <h2>New Volunteer Application</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.firstName} ${formData.lastName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.email}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.phone || 'Not provided'}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Location:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.location}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Availability:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.availability || 'Not specified'}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>How to help:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.help}</td></tr>
      </table>
    `;
  } else if (formType === 'contact') {
    subject = `Contact Form: ${formData.subject}`;
    html = `
      <h2>New Contact Form Message</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.name}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.email}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Subject:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.subject}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Message:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${formData.message}</td></tr>
      </table>
    `;
  }

  const mailOptions = {
    from: 'info@homelessaid.co.uk',
    to: 'info@homelessaid.co.uk',
    subject: subject,
    html: html
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
}