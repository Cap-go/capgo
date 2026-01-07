import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseServiceKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'
const supabase = createClient(supabaseUrl, supabaseServiceKey)
const TARGET_DOMAIN = process.env.TEST_SSO_DOMAIN ?? 'example.com'
const TARGET_SSO_PROVIDER_ID = process.env.TEST_SSO_PROVIDER_ID ?? '550e8400-e29b-41d4-a716-446655440003'

async function run() {
    const email = `probe-${Date.now()}@${TARGET_DOMAIN}`
    console.log('calling createUser for', email)
    const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
            first_name: 'Probe',
            last_name: 'User',
            sso_provider_id: TARGET_SSO_PROVIDER_ID,
        },
        app_metadata: {
            provider: `sso:${TARGET_SSO_PROVIDER_ID}`,
            sso_provider_id: TARGET_SSO_PROVIDER_ID,
        },
    })

    console.log('createUser', { data: !!data, error: error?.message })
    const userId = data?.user?.id
    if (!userId) {
        throw new Error('createUser failed')
    }

    const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
    await client.connect()
    const res = await client.query('SELECT raw_user_meta_data, raw_app_meta_data FROM auth.users WHERE id = $1', [userId])
    console.log('row', res.rows)
    const identityRes = await client.query('SELECT provider FROM auth.identities WHERE user_id = $1', [userId])
    console.log('identities', identityRes.rows)
    await supabase.auth.admin.deleteUser(userId)
    await client.end()
}

run().catch(err => {
    console.error(err)
    process.exit(1)
})
