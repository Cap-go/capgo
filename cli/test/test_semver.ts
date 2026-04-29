
// eslint-disable-next-line max-len
const regex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
const bundles = ['20220929.0.0+7c146f40', 'v1.2.3']
// check if bundle is valid
for (const bundle of bundles) {
    if (!regex.test(bundle)) {
        console.log(`Your bundle name ${bundle}, is not valid it should follow semver convention : https://semver.org/`);
    } else {
        console.log('valid')
    }
}
