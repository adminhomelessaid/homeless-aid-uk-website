// Invitation email helper (moved from api/send-invitation-email.js to stay under the Vercel function limit).
async function sendInvitationEmail({ to, name, username, role, invitationUrl, invitedBy }) {
    if (!to || !name || !invitationUrl) {
        return { success: false, message: 'Missing required fields' };
    }
    // Format role for display
    const roleMap = {
        'admin': 'Administrator',
        'team_lead': 'Team Lead',
        'volunteer': 'Volunteer'
    };
    const displayRole = roleMap[role] || role;
    
    // Create the email content
    const subject = `Welcome to Homeless Aid UK - Set Up Your Account`;
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Homeless Aid UK</title>
    <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; text-align: center; }
    .logo { width: 60px; height: 60px; border-radius: 50%; background: white; padding: 4px; margin-bottom: 1rem; }
    .content { padding: 2rem; }
    .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 1rem 0; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .footer { background: #f8fafc; padding: 1.5rem; text-align: center; color: #64748b; font-size: 0.9rem; border-top: 1px solid #e2e8f0; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    </style>
</head>
<body>
    <div class="container">
    <div class="header">
        <div style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem;">Welcome to Homeless Aid UK</div>
        <div style="opacity: 0.9;">Volunteer Outreach System</div>
    </div>
    
    <div class="content">
        <h2>Hello ${name}!</h2>
        
        <p>You've been invited by ${invitedBy || 'an administrator'} to join the Homeless Aid UK volunteer outreach system.</p>
        
        <div class="info-box">
            <h3 style="margin-top: 0;">Your Account Details:</h3>
            <p><strong>Name:</strong> ${name}<br>
            <strong>Username:</strong> ${username}<br>
            <strong>Role:</strong> ${displayRole}<br>
            <strong>Email:</strong> ${to}</p>
        </div>
        
        <p>To get started, you'll need to set up your password by clicking the button below:</p>
        
        <div style="text-align: center; margin: 2rem 0;">
            <a href="${invitationUrl}" class="button">Set Up My Password</a>
        </div>
        
        <div class="warning">
            <h4 style="margin-top: 0;">⚠️ Important Security Information</h4>
            <ul style="margin-bottom: 0;">
                <li>This invitation link will expire in 7 days</li>
                <li>Use a strong password with at least 6 characters</li>
                <li>Use letters and numbers</li>
                <li>Never share your login credentials with anyone</li>
            </ul>
        </div>
        
        <h3>What you can do as a ${displayRole}:</h3>
        <ul>
            ${role === 'admin' ? `
                <li>Manage user accounts and permissions</li>
                <li>Access all system reports and analytics</li>
                <li>Export attendance data</li>
                <li>View system-wide activity</li>
            ` : role === 'team_lead' ? `
                <li>Log attendance for all events</li>
                <li>View team activity and reports</li>
                <li>Export attendance data</li>
                <li>Access advanced analytics</li>
            ` : `
                <li>Log attendance for events you attend</li>
                <li>View your own activity history</li>
                <li>Access the volunteer dashboard</li>
            `}
        </ul>
        
        <p>If you have any questions or need help, please contact our support team at <a href="mailto:info@homelessaid.co.uk">info@homelessaid.co.uk</a></p>
        
        <p>Thank you for joining our mission to support homeless individuals across the UK!</p>
        
        <p>Best regards,<br>
        The Homeless Aid UK Team</p>
    </div>
    
    <div class="footer">
        <p>Homeless Aid UK | Volunteer Outreach System<br>
        <a href="https://homelessaid.co.uk">https://homelessaid.co.uk</a></p>
        
        <p style="margin-top: 1rem; font-size: 0.8rem;">
            If you didn't expect this invitation or believe it was sent in error, please ignore this email.
            The invitation will expire automatically in 7 days.
        </p>
    </div>
    </div>
</body>
</html>`;
    
    const textContent = `
Welcome to Homeless Aid UK - Volunteer Outreach System

Hello ${name}!

You've been invited by ${invitedBy || 'an administrator'} to join the Homeless Aid UK volunteer outreach system.

Your Account Details:
- Name: ${name}
- Username: ${username}
- Role: ${displayRole}
- Email: ${to}

To get started, please visit this link to set up your password:
${invitationUrl}

IMPORTANT SECURITY INFORMATION:
- This invitation link will expire in 7 days
- Use a strong password with at least 6 characters
- Use letters and numbers
- Never share your login credentials with anyone

What you can do as a ${displayRole}:
${role === 'admin' ? `
- Manage user accounts and permissions
- Access all system reports and analytics
- Export attendance data
- View system-wide activity
` : role === 'team_lead' ? `
- Log attendance for all events
- View team activity and reports
- Export attendance data
- Access advanced analytics
` : `
- Log attendance for events you attend
- View your own activity history
- Access the volunteer dashboard
`}

If you have any questions or need help, please contact our support team at info@homelessaid.co.uk

Thank you for joining our mission to support homeless individuals across the UK!

Best regards,
The Homeless Aid UK Team

---
Homeless Aid UK | Volunteer Outreach System
https://homelessaid.co.uk

If you didn't expect this invitation or believe it was sent in error, please ignore this email.
The invitation will expire automatically in 7 days.
    `.trim();
    

    try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Homeless Aid UK <noreply@homelessaid.co.uk>',
                to: [to], subject, html: htmlContent, text: textContent
            })
        });
        if (resendResponse.ok) {
            const result = await resendResponse.json();
            console.log(`Invitation email sent via Resend to ${to} (${name})`);
            return { success: true, provider: 'resend', id: result.id };
        }
        console.error('Resend responded', resendResponse.status);
    } catch (resendError) {
        console.error('Resend API error:', resendError);
    }
    return { success: false, message: 'Failed to send invitation email' };
}

async function sendApprovalEmail({ to, name, loginUrl, approvedBy }) {
    if (!to || !loginUrl) return { success: false, message: 'Missing required fields' };
    const subject = 'Your Homeless Aid UK volunteer account is approved';
    const text = `Hello ${name || ''},\n\nYour sign-up has been approved${approvedBy ? ' by ' + approvedBy : ''}. You can now sign in with your email address and the password you chose:\n${loginUrl}\n\nOnce in, please complete your registration: your details, a photo, and the policies to read and sign.\n\nThank you for volunteering with Homeless Aid UK.`;
    const html = `<p>Hello ${name || ''},</p><p>Your sign-up has been approved${approvedBy ? ' by ' + approvedBy : ''}. You can now sign in with your email address and the password you chose:</p><p><a href="${loginUrl}" style="display:inline-block;background:#1A2332;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Sign in to the volunteer portal</a></p><p>Once in, please complete your registration: your details, a photo, and the policies to read and sign.</p><p>Thank you for volunteering with Homeless Aid UK.</p>`;
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Homeless Aid UK <noreply@homelessaid.co.uk>', to: [to], subject, html, text })
        });
        if (res.ok) return { success: true, provider: 'resend' };
        console.error('Resend responded', res.status);
    } catch (e) { console.error('Resend API error:', e); }
    return { success: false, message: 'Failed to send approval email' };
}

module.exports = { sendInvitationEmail, sendApprovalEmail };
