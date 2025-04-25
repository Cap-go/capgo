import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

async function run() {
  // Get email from command line arguments
  const email = process.argv[2]

  if (!email) {
    console.error('Usage: node generate_magic_link.mjs email@example.com')
    process.exit(1)
  }

  // Load environment variables

  const supabaseUrl = '***'
  const supabaseServiceKey = '***'

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
    process.exit(1)
  }

  try {
    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    console.log(`Generating magic link for ${email}...`)

    // Generate magic link
    const { data: magicLink, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (magicError) {
      console.error('Error generating magic link:', magicError)
      process.exit(1)
    }

    console.log('\n=== Magic Link Generated Successfully ===')
    console.log(`Email: ${email}`)
    console.log(`Magic Link URL: ${magicLink.properties.action_link}`)
    console.log(`Hashed Token: ${magicLink.properties.hashed_token}`)
    console.log(`Expires At: ${new Date(magicLink.properties.created_at).toLocaleString()}`)
  }
  catch (error) {
    console.error('Unexpected error:', error)
    process.exit(1)
  }
}

run().catch(console.error)
