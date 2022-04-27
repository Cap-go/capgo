const fs = require('fs')
const { Parser } = require('json2csv')
const users = require('/Users/martindonadieu/Downloads/users.json')
const fields = ['email', 'last_name', 'first_name', 'id', 'created_at']
const opts = { fields }

try {
  const finalUsers = users.map((user) => {
    // parse raw_user_meta_data string as json and get last_name and first_name key to save in user
    const userMetaData = JSON.parse(user.raw_user_meta_data)
    const { last_name, first_name } = userMetaData
    return {
      ...user,
      last_name,
      first_name,
    }
  })
  //   console.log('finalUsers', finalUsers)
  const parser = new Parser(opts)
  const csv = parser.parse(finalUsers)
  fs.writeFileSync('./users.csv', csv)
//   console.log(csv)
}
catch (err) {
  console.error(err)
}
