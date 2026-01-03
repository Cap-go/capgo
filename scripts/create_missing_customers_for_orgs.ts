const json: { id: string }[] = [
]

// JSON redactedc
// use "select * from orgs where customer_id IS NOT distinct from null"
// export -> copy as json (via supabase dashboard) to get json

const apiSecret = 'REDACTED';

async function main() {
    console.log(`[on_organization_create] starting (${json.length} orgs)`)

    await Promise.all(
        json.map(async (org, index) => {
            const orgId = org.id ?? `index:${index}`

            try {
                console.log(`[on_organization_create] → sending org ${orgId}`)

                const res = await fetch(
                    'https://xvwzpoazmxkqosrdewyv.supabase.co/functions/v1/triggers/on_organization_create',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            table: 'orgs',
                            type: 'INSERT',
                            record: org,
                        }),
                        headers: {
                            'Content-Type': 'application/json',
                            apisecret: apiSecret,
                        },
                    }
                )

                const text = await res.text()

                if (!res.ok) {
                    console.error(
                        `[on_organization_create] ✗ failed org ${orgId}`,
                        { status: res.status, body: text }
                    )
                    return
                }

                console.log(`[on_organization_create] ✓ success org ${orgId}`)
            } catch (err) {
                console.error(
                    `[on_organization_create] ✗ exception org ${orgId}`,
                    err
                )
            }
        })
    )

    console.log('[on_organization_create] done')
}


main();