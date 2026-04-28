const AdmZip = require('adm-zip');

const zip = new AdmZip('build.zip');
const zipEntries = zip.getEntries(); // an array of ZipEntry records

let errorFound = false;

for (const zipEntry of zipEntries) {
  const entryName = zipEntry.entryName;
  if (entryName.includes('\\')) {
    console.error(`Non-POSIX path detected: ${entryName}`);
    errorFound = true;
  }
};

if (errorFound) {
  console.error('Non-POSIX paths detected in the zip file');
  process.exit(1);
} else {
  console.log('All paths are POSIX compliant.');
}
