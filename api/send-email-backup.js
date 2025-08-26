// Backup email solution using EmailJS or similar service
export default async function handler(req, res) {
  console.log('Backup email function called');
  
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

  // For now, just log the data and return success
  // In production, this would use a reliable email service like SendGrid
  console.log('Form submission received:', { formType, formData });

  let subject = '';
  let message = '';

  if (formType === 'volunteer') {
    subject = 'New Volunteer Application - Homeless Aid UK';
    message = `
New Volunteer Application:

Name: ${formData.firstName} ${formData.lastName}
Email: ${formData.email}
Phone: ${formData.phone || 'Not provided'}
Location: ${formData.location}
Availability: ${formData.availability || 'Not specified'}
How to help: ${formData.help}
    `;
  } else if (formType === 'contact') {
    subject = `Contact Form: ${formData.subject}`;
    message = `
New Contact Form Message:

Name: ${formData.name}
Email: ${formData.email}
Subject: ${formData.subject}
Message: ${formData.message}
    `;
  }

  console.log('Email would be sent:', { subject, message });

  // Return success for now
  res.status(200).json({ 
    success: true, 
    message: 'Form received successfully. We will contact you soon.',
    debug: 'Using backup handler - check Vercel logs for form data'
  });
}