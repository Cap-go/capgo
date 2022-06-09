import axiod from "https://deno.land/x/axiod/mod.ts";

export const postPerson = async(email: string, firstName?: string, lastName?: string, avatar?: string) => {
    const CRISP_ID = Deno.env.get('CRISP_ID') || ''
    const url = `https://api.crisp.chat/v1/website/${CRISP_ID}/people/profile`
    // get crisp token
    const CRISP_TOKEN_ID = Deno.env.get('CRISP_TOKEN_ID') || ''
    const CRISP_TOKEN_SECRET = Deno.env.get('CRISP_TOKEN_SECRET') || ''
    const CRISP_TOKEN = CRISP_TOKEN_ID + ':' + CRISP_TOKEN_SECRET
    // encode b64
    const CRISP_TOKEN_B64 = btoa(CRISP_TOKEN)
    const response = await axiod.post(url, {
        email,
        "person": {
            "nickname": `${firstName} ${lastName}`,
            avatar,
        }
    }, {
        headers: {
            "Authorization": `Basic ${CRISP_TOKEN_B64}`,
            "X-Crisp-Tier": "plugin",
        }
    })
    return response.data
}
export const updatePerson = async(email: string, person: any) => {
    const CRISP_ID = Deno.env.get('CRISP_ID') || ''
    // /v1/website/{website_id}/people/profile/{people_id}
    const url = `https://api.crisp.chat/v1/website/${CRISP_ID}/people/profile/${email}`
    // get crisp token
    const CRISP_TOKEN_ID = Deno.env.get('CRISP_TOKEN_ID') || ''
    const CRISP_TOKEN_SECRET = Deno.env.get('CRISP_TOKEN_SECRET') || ''
    const CRISP_TOKEN = CRISP_TOKEN_ID + ':' + CRISP_TOKEN_SECRET
    // encode b64
    const CRISP_TOKEN_B64 = btoa(CRISP_TOKEN)
    const response = await axiod.patch(url, {
        email,
        person,
    }, {
        headers: {
            "Authorization": `Basic ${CRISP_TOKEN_B64}`,
            "X-Crisp-Tier": "plugin",
        }
    })
    return response.data
}
export const addDataPerson = async(email: string, data: any) => {
    const CRISP_ID = Deno.env.get('CRISP_ID') || ''
    // /v1/website/{website_id}/people/profile/{people_id}
    const url = `https://api.crisp.chat/v1/website/${CRISP_ID}/people/data/${email}`
    // get crisp token
    const CRISP_TOKEN_ID = Deno.env.get('CRISP_TOKEN_ID') || ''
    const CRISP_TOKEN_SECRET = Deno.env.get('CRISP_TOKEN_SECRET') || ''
    const CRISP_TOKEN = CRISP_TOKEN_ID + ':' + CRISP_TOKEN_SECRET
    // encode b64
    const CRISP_TOKEN_B64 = btoa(CRISP_TOKEN)
    const response = await axiod.patch(url, {data}, {
        headers: {
            "Authorization": `Basic ${CRISP_TOKEN_B64}`,
            "X-Crisp-Tier": "plugin",
        }
    })
    return response.data
}