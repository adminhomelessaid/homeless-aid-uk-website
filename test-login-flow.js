const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://vnfdtgfjlwevrzbxhsub.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZmR0Z2ZqbHdldnJ6Ynhoc3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMzMwNzYsImV4cCI6MjA3MTgwOTA3Nn0.zNLozjU0DCyebYkJMKtNHtaUaehPpBKUvVx4QviaQLY';

async function simulateLogin(username, password) {
    console.log('=================================');
    console.log('SIMULATING EXACT LOGIN FLOW');
    console.log('=================================');
    console.log('Username:', username);
    console.log('Password:', password);
    console.log('');
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Step 1: Find user (exact query from login.js)
    console.log('Step 1: Finding user...');
    const { data: user, error } = await supabase
        .from('outreach_users')
        .select('*')
        .or(`username.ilike.${username},email.ilike.${username}`)
        .eq('is_active', true)
        .single();
    
    if (error || !user) {
        console.log('❌ User not found!');
        if (error) console.log('   Error:', error.message);
        return;
    }
    
    console.log('✅ User found!');
    console.log('   Username:', user.username);
    console.log('   Email:', user.email);
    console.log('   Active:', user.is_active);
    console.log('   Email verified:', user.email_verified);
    console.log('   Has password:', !!user.password_hash);
    
    // Step 2: Check password hash exists
    console.log('\nStep 2: Checking password hash...');
    if (!user.password_hash) {
        console.log('❌ No password hash - would return "Account setup incomplete"');
        return;
    }
    console.log('✅ Password hash exists');
    
    // Step 3: Check email verified
    console.log('\nStep 3: Checking email verification...');
    if (!user.email_verified) {
        console.log('❌ Email not verified - would return "Email not verified"');
        return;
    }
    console.log('✅ Email is verified');
    
    // Step 4: Verify password
    console.log('\nStep 4: Verifying password...');
    console.log('   Testing:', password);
    console.log('   Against hash:', user.password_hash.substring(0, 30) + '...');
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (isValid) {
        console.log('✅ PASSWORD IS CORRECT!');
        console.log('\n🎉 🎉 🎉 LOGIN SHOULD SUCCEED! 🎉 🎉 🎉');
    } else {
        console.log('❌ PASSWORD DOES NOT MATCH');
        console.log('\nThis would return: "Invalid username or password"');
        
        // Try other passwords
        console.log('\nTrying other passwords...');
        const testPasswords = ['Password123!', 'BenAdmin123!', 'admin', 'password'];
        for (const pwd of testPasswords) {
            const match = await bcrypt.compare(pwd, user.password_hash);
            if (match) {
                console.log(`✅ Found working password: ${pwd}`);
                break;
            }
        }
    }
}

// Run the test
simulateLogin('BenAdmin', 'TestPassword123');