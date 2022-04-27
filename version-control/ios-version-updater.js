module.exports.readVersion = function (contents) {
  let marketingVersionString = contents.match(/MARKETING_VERSION = [0-9]*.[0-9]*.[0-9]*/);
  let version = marketingVersionString.toString().split('=')[1].trim();
  return version;
}

module.exports.writeVersion = function (contents, version) {
  let newContent = contents.replace(/(.*(?:MARKETING_VERSION[ \t]+).*)/g, `       MARKETING_VERSION = "${version}"`);
  let finalContent = newContent.replace(/(.*(?:CURRENT_PROJECT_VERSION[ \t]+).*)/g, `       CURRENT_PROJECT_VERSION "${version}"`);
  return finalContent
}