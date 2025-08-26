// Proper email solution using Resend API (reliable and simple)
export default async function handler(req, res) {
  console.log('Email function called');
  
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
  console.log('Form submission received:', { formType, formData });

  let subject = '';
  let htmlContent = '';

  if (formType === 'volunteer') {
    subject = 'New Volunteer Application - Homeless Aid UK';
    htmlContent = `
      <h2>New Volunteer Application</h2>
      <p><strong>Name:</strong> ${formData.firstName} ${formData.lastName}</p>
      <p><strong>Email:</strong> ${formData.email}</p>
      <p><strong>Phone:</strong> ${formData.phone || 'Not provided'}</p>
      <p><strong>Preferred Location:</strong> ${formData.location}</p>
      <p><strong>Availability:</strong> ${formData.availability || 'Not specified'}</p>
      <p><strong>How they want to help:</strong></p>
      <p>${formData.help}</p>
      <hr>
      <p><small>Submitted via homelessaid.co.uk volunteer form</small></p>
    `;
  } else if (formType === 'contact') {
    subject = `Contact Form: ${formData.subject}`;
    htmlContent = `
      <h2>New Contact Form Message</h2>
      <p><strong>Name:</strong> ${formData.name}</p>
      <p><strong>Email:</strong> ${formData.email}</p>
      <p><strong>Subject:</strong> ${formData.subject}</p>
      <p><strong>Message:</strong></p>
      <p>${formData.message}</p>
      <hr>
      <p><small>Submitted via homelessaid.co.uk contact form</small></p>
    `;
  }

  try {
    // Use Resend API - much more reliable than SMTP
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'website@homelessaid.co.uk',
        to: ['info@homelessaid.co.uk'],
        subject: subject,
        html: htmlContent,
        reply_to: formData.email || 'info@homelessaid.co.uk'
      }),
    });

    if (response.ok) {
      console.log('Email sent successfully via Resend');
      res.status(200).json({ success: true, message: 'Email sent successfully' });
    } else {
      const error = await response.text();
      console.error('Resend API error:', error);
      res.status(500).json({ success: false, error: 'Failed to send email', details: error });
    }
  } catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({ success: false, error: 'Failed to send email', details: error.message });
  }
}