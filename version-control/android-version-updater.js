module.exports.readVersion = function (contents) {
  let version = contents.split('versionName "')[1].split('"')[0];
  return version;
}

module.exports.writeVersion = function (contents, version) {
  let newContent = contents.replace(/(.*(?:versionName[ \t]+).*)/g, `        versionName "${version}"`);
  let versionCode = Number(version.split('.').map(v => v.length === 1 ? `0${v}` : v).join('')) 
  let finalContent = newContent.replace(/(.*(?:versionName[ \t]+).*)/g, `        versionName "${versionCode}"`);
  return finalContent
}