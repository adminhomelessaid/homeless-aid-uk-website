// Local password reset tool for BenAdmin
// Run this with: node reset-password-local.js

const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

// Set your Supabase credentials here
const SUPABASE_URL = 'https://vnfdtgfjlwevrzbxhsub.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZmR0Z2ZqbHdldnJ6Ynhoc3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMzMwNzYsImV4cCI6MjA3MTgwOTA3Nn0.zNLozjU0DCyebYkJMKtNHtaUaehPpBKUvVx4QviaQLY';

async function resetPassword() {
    console.log('Starting password reset for BenAdmin...');
    
    try {
        // Create Supabase client
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✓ Connected to Supabase');
        
        // New password
        const newPassword = 'Password123!';
        
        // Generate hash
        const hash = await bcrypt.hash(newPassword, 12);
        console.log('✓ Generated password hash');
        
        // Update BenAdmin's password
        const { data, error } = await supabase
            .from('outreach_users')
            .update({ 
                password_hash: hash,
                email_verified: true,
                is_active: true,
                updated_at: new Date().toISOString()
            })
            .eq('username', 'BenAdmin');
        
        if (error) {
            console.error('❌ Database error:', error);
            return;
        }
        
        console.log('✓ Password updated successfully!');
        console.log('');
        console.log('========================================');
        console.log('LOGIN CREDENTIALS:');
        console.log('Username: BenAdmin');
        console.log('Password: Password123!');
        console.log('========================================');
        console.log('');
        console.log('You can now login at: https://www.homelessaid.co.uk/Outreach/login.html');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run the reset
resetPassword();