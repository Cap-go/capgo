module.exports.readVersion = function(contents) {
  const marketingVersionString = contents.match(/MARKETING_VERSION = [0-9]*.[0-9]*.[0-9]*/)
  const version = marketingVersionString.toString().split('=')[1].trim()
  return version
}

module.exports.writeVersion = function(contents, version) {
  const newContent = contents.replace(/(.*(?:MARKETING_VERSION[ \t]+).*)/g, `       MARKETING_VERSION = "${version}"`)
  const finalContent = newContent.replace(/(.*(?:CURRENT_PROJECT_VERSION[ \t]+).*)/g, `       CURRENT_PROJECT_VERSION "${version}"`)
  return finalContent
}
