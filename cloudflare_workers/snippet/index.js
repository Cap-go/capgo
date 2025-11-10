export default {
  async fetch(request) {
    /**
     * A map of the URLs to redirect to
     * @param {object} countryMap
     */
    const AS = 'https://plugin.as.capgo.app'
    const EU = 'https://plugin.eu.capgo.app'
    const US = 'https://plugin.us.capgo.app'
    const SA = 'https://plugin.sa.capgo.app'
    const OC = 'https://plugin.oc.capgo.app'
    const AF = 'https://plugin.af.capgo.app'

    const continentMap = {
      // Replace the countinent codes and target URLs with ones that apply to your case.
      US,
      EU,
      AS,
      OC,
      SA,
      AF,
    }

    // Use the cf object to obtain the country of the request
    // more on the cf object: https://developers.cloudflare.com/workers/runtime-apis/request#incomingrequestcfproperties
    const continent = request.cf.continent
    const path = new URL(request.url).pathname
    let baseUrl = continentMap.EU
    // If country is not null and is defined in the country map above, redirect.
    if (continent != null && continent in continentMap) {
      baseUrl = continentMap[continent]
      // Remove this logging statement from your final output.
      console.log(
        `Based on ${continent}-based request, your user would go to ${baseUrl}.`,
      )
      return fetch(`${baseUrl}${path}`, request)

      // If request country not in map, return another page.
    }
    else {
      return fetch(`${baseUrl}${path}`, request)
    }
  },
}
