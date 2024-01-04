export default { 
    async fetch(request, env) { 
        let headersObject = Object.fromEntries(request.headers);

        if (!headersObject.authorization || !headersObject.authorization.includes('43a519ce-0993-4796-b813-1222d992f7ca')) {
            return new Response(JSON.stringify({err: 'lol, no'}), { status: 400 });
        }

        const text = await request.text()

        var json
        try {
            json = text.length > 0 ? JSON.parse(text) : {}
        } catch (error) {
            const errorJ = {
                "result": null,
                "success": false,
                "errors": [
                    {
                    "code": 7400,
                    "message": `The request is malformed: ${error}`
                    }
                ],
                "messages": []
            }
            return new Response(JSON.stringify(errorJ, null, 2), { status: 400 });
        }

        const parms = json.params
        const sql = json.sql

        if (!sql) {
            const errorJ = {
                "result": null,
                "success": false,
                "errors": [
                    {
                    "code": 7400,
                    // Plus or minus how the real CF response looks
                    "message": `The request is malformed: failed to parse input: missing field \`sql\``
                    }
                ],
                "messages": []
            }
            return new Response(JSON.stringify(errorJ, null, 2), { status: 400 });
        }

        if (typeof sql !== 'string') {
            const errorJ = {
                "result": null,
                "success": false,
                "errors": [
                    {
                    "code": 7400,
                    // Plus or minus how the real CF response looks
                    "message": `The request is malformed: invalid type: ${typeof sql}, expected a string`
                    }
                ],
                "messages": []
            }
            return new Response(JSON.stringify(errorJ, null, 2), { status: 400 });
        }

        console.log('sql', sql)
        const db = env.DB
        if (!env.DB) {
            return new Response(`No database configured`, { status: 500 }) 
        }

        const stmts = sql.split(';').map(val => {
            // console.log(val)
            return db.prepare(val)
        })
        parms.forEach((val, i) => {
            // console.log(i, stmts[i], val.length)
            // console.log(stmts[i].bind)
            stmts[i] = stmts[i].bind(...val)
        })

        // console.log(stmts)


        // let stmt = db.prepare(sql);
        // if (parms && typeof parms === 'object') {
        //     stmt = stmt.bind(...parms)
        // }

        let result;

        try {
            result = await db.batch(stmts) // stmt.all()
        } catch (error) {
            console.log('err')
            console.log(error.cause)

            const errorJ = {
                "result": [],
                "success": false,
                "errors": [
                    {
                    "code": 7500,
                    // Plus or minus how the real CF response looks
                    "message": `${error.cause}`
                    }
                ],
                "messages": []
            }
            return new Response(JSON.stringify(errorJ, null, 2), { status: 500 });
        }
        
        console.log('ok', JSON.stringify(result))
        return new Response(JSON.stringify({errors: [], messages: true, success: true, ...result}, null, 2)) 
    } 
}