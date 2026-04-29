import { createClient } from '@supabase/supabase-js'

const supaUrl = 'https://sb.capgo.app'
const apikey = '***'
const anonKey = '***'
const init = async () => {
    const supabase = createClient(supaUrl, anonKey, {
        global: {
            headers: {
                capgkey: '***',
            }
        }
    })
    const { data: userId } = await supabase
        .rpc('get_user_id', { apikey })
    console.log('userId', userId)
    const apps = await supabase.from('apps')
        .select()
        .eq('app_id', 'ee.forgr.captime')
    console.log('apps', apps.data)
    // try to find one app
}

init()
