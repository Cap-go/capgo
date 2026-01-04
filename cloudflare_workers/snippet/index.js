// Rules to match requests this Snippet will handle
// Expression
// (http.host eq "plugin.usecapgo.com")
// or (http.host eq "plugin.capgo.app")
// or (http.host eq "updater.capgo.com.cn")
// or (http.host eq "updater.spencer.co")
// or (http.request.full_uri wildcard "*api.capgo.app/updates*")
// or (http.request.full_uri wildcard "*api.capgo.app/plugin/*")
// or (http.request.full_uri wildcard "*api.capgo.app/stats")
// or (http.request.full_uri wildcard "*api.capgo.app/channel_self")
// Circuit breaker configuration
const TIMEOUT_MS = 3000 // 3 seconds - matches plugin timeout
const CIRCUIT_RESET_MS = 5 * 60 * 1000 // 5 minutes before retrying unhealthy worker
const CACHE_KEY_PREFIX = 'https://circuit-breaker.internal/'

// Cache helper functions for circuit breaker
async function markUnhealthy(colo, workerUrl) {
  try {
    const cache = caches.default
    const key = `${CACHE_KEY_PREFIX}${colo}/${encodeURIComponent(workerUrl)}`
    const response = new Response(JSON.stringify({ unhealthyAt: Date.now() }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${Math.floor(CIRCUIT_RESET_MS / 1000)}`,
      },
    })
    await cache.put(key, response)
    console.log(`Circuit OPEN for ${colo} → ${workerUrl}`)
  }
  catch (e) {
    console.log(`Failed to mark unhealthy: ${e.message}`)
  }
}

async function markHealthy(colo, workerUrl) {
  try {
    const cache = caches.default
    const key = `${CACHE_KEY_PREFIX}${colo}/${encodeURIComponent(workerUrl)}`
    await cache.delete(key)
  }
  catch {
    // Ignore errors - cache miss is fine
  }
}

async function isHealthy(colo, workerUrl) {
  try {
    const cache = caches.default
    const key = `${CACHE_KEY_PREFIX}${colo}/${encodeURIComponent(workerUrl)}`
    const cached = await cache.match(key)
    if (!cached)
      return true // No cache entry = healthy

    const data = await cached.json()
    const elapsed = Date.now() - data.unhealthyAt
    // Circuit resets after CIRCUIT_RESET_MS (handled by Cache-Control, but double-check)
    return elapsed >= CIRCUIT_RESET_MS
  }
  catch {
    return true // On error, assume healthy
  }
}

export default {
  async fetch(request) {
    // Regional worker URLs - each worker is co-located with its database replica
    const WORKER_URL = {
      ASIA: 'https://plugin.as.capgo.app', // AS_INDIA DB (Mumbai)
      EUROPE: 'https://plugin.eu.capgo.app', // EU DB
      NORTH_AMERICA: 'https://plugin.na.capgo.app', // NA DB
      SOUTH_AMERICA: 'https://plugin.sa.capgo.app', // SA DB
      OCEANIA: 'https://plugin.oc.capgo.app', // OC DB
      AFRICA: 'https://plugin.af.capgo.app', // AS_INDIA DB (via smart placement)
      MIDDLE_EAST: 'https://plugin.me.capgo.app', // AS_INDIA DB (via smart placement)
      HONG_KONG: 'https://plugin.hk.capgo.app', // AS_JAPAN DB (Tokyo)
    }

    // Zone codes used for routing decisions
    const ZONE = {
      ASIA: 'AS',
      EUROPE: 'EU',
      NORTH_AMERICA: 'NA',
      SOUTH_AMERICA: 'SA',
      OCEANIA: 'OC',
      AFRICA: 'AF',
      MIDDLE_EAST: 'ME',
      HONG_KONG: 'HK',
    }

    // Maps Cloudflare colo (data center) codes to zones
    // Full list: https://github.com/Netrvin/cloudflare-colo-list/blob/main/DC-Colos.json
    const coloToZone = {
      AAE: ZONE.AFRICA, // Annaba, Algeria
      ABJ: ZONE.AFRICA, // Abidjan, Ivory Coast
      ABQ: ZONE.NORTH_AMERICA, // Albuquerque, USA
      ACC: ZONE.AFRICA, // Accra, Ghana
      ADB: ZONE.EUROPE, // Izmir, Turkey
      ADD: ZONE.AFRICA, // Addis Ababa, Ethiopia
      ADL: ZONE.OCEANIA, // Adelaide, Australia
      AKL: ZONE.OCEANIA, // Auckland, New Zealand
      AKX: ZONE.ASIA, // Aktobe, Kazakhstan
      ALA: ZONE.ASIA, // Almaty, Kazakhstan
      ALG: ZONE.AFRICA, // Algiers, Algeria
      AMD: ZONE.ASIA, // Ahmedabad, India
      AMM: ZONE.EUROPE, // Amman, Jordan
      AMS: ZONE.EUROPE, // Amsterdam, Netherlands
      ANC: ZONE.NORTH_AMERICA, // Anchorage, USA
      ARI: ZONE.SOUTH_AMERICA, // Arica, Chile
      ARN: ZONE.EUROPE, // Stockholm, Sweden
      ARU: ZONE.SOUTH_AMERICA, // Aracatuba, Brazil
      ASK: ZONE.AFRICA, // Yamoussoukro, Ivory Coast
      ASU: ZONE.SOUTH_AMERICA, // Asunción, Paraguay
      ATH: ZONE.EUROPE, // Athens, Greece
      ATL: ZONE.NORTH_AMERICA, // Atlanta, USA
      AUS: ZONE.NORTH_AMERICA, // Austin, USA
      BAH: ZONE.EUROPE, // Manama, Bahrain
      BAQ: ZONE.SOUTH_AMERICA, // Barranquilla, Colombia
      BCN: ZONE.EUROPE, // Barcelona, Spain
      BEG: ZONE.EUROPE, // Belgrade, Serbia
      BEL: ZONE.SOUTH_AMERICA, // Belém, Brazil
      BGI: ZONE.NORTH_AMERICA, // Bridgetown, Barbados
      BGR: ZONE.NORTH_AMERICA, // Bangor, USA
      BGW: ZONE.MIDDLE_EAST, // Baghdad, Iraq
      BHY: ZONE.HONG_KONG, // Beihai, China
      BKK: ZONE.HONG_KONG, // Bangkok, Thailand
      BLR: ZONE.ASIA, // Bangalore, India
      BNA: ZONE.NORTH_AMERICA, // Nashville, USA
      BNE: ZONE.OCEANIA, // Brisbane, Australia
      BNU: ZONE.SOUTH_AMERICA, // Blumenau, Brazil
      BOD: ZONE.EUROPE, // Bordeaux, France
      BOG: ZONE.SOUTH_AMERICA, // Bogota, Colombia
      BOM: ZONE.ASIA, // Mumbai, India
      BOS: ZONE.NORTH_AMERICA, // Boston, USA
      BRU: ZONE.EUROPE, // Brussels, Belgium
      BSB: ZONE.SOUTH_AMERICA, // Brasilia, Brazil
      BSR: ZONE.MIDDLE_EAST, // Basra, Iraq
      BTS: ZONE.EUROPE, // Bratislava, Slovakia
      BUD: ZONE.EUROPE, // Budapest, Hungary
      BUF: ZONE.NORTH_AMERICA, // Buffalo, USA
      BWN: ZONE.HONG_KONG, // Bandar Seri Begawan, Brunei
      CAI: ZONE.AFRICA, // Cairo, Egypt
      CAN: ZONE.HONG_KONG, // Guangzhou, China
      CAW: ZONE.SOUTH_AMERICA, // Campos dos Goytacazes, Brazil
      CBR: ZONE.OCEANIA, // Canberra, Australia
      CCP: ZONE.SOUTH_AMERICA, // Concepción, Chile
      CCU: ZONE.ASIA, // Kolkata, India
      CDG: ZONE.EUROPE, // Paris, France
      CEB: ZONE.HONG_KONG, // Cebu, Philippines
      CFC: ZONE.SOUTH_AMERICA, // Cacador, Brazil
      CGB: ZONE.SOUTH_AMERICA, // Cuiaba, Brazil
      CGD: ZONE.HONG_KONG, // Changde, China
      CGK: ZONE.HONG_KONG, // Jakarta, Indonesia
      CGO: ZONE.HONG_KONG, // Zhengzhou, China
      CGP: ZONE.ASIA, // Chittagong, Bangladesh
      CGY: ZONE.HONG_KONG, // Cagayan de Oro, Philippines
      CHC: ZONE.OCEANIA, // Christchurch, New Zealand
      CKG: ZONE.HONG_KONG, // Chongqing, China
      CLE: ZONE.NORTH_AMERICA, // Cleveland, USA
      CLO: ZONE.SOUTH_AMERICA, // Cali, Colombia
      CLT: ZONE.NORTH_AMERICA, // Charlotte, USA
      CMB: ZONE.ASIA, // Colombo, Sri Lanka
      CMH: ZONE.NORTH_AMERICA, // Columbus, USA
      CNF: ZONE.SOUTH_AMERICA, // Belo Horizonte, Brazil
      CNN: ZONE.ASIA, // Kannur, India
      CNX: ZONE.HONG_KONG, // Chiang Mai, Thailand
      COK: ZONE.ASIA, // Kochi, India
      COR: ZONE.SOUTH_AMERICA, // Córdoba, Argentina
      CPH: ZONE.EUROPE, // Copenhagen, Denmark
      CPT: ZONE.AFRICA, // Cape Town, South Africa
      CRK: ZONE.HONG_KONG, // Tarlac City (Clark), Philippines
      CSX: ZONE.HONG_KONG, // Changsha, China
      CWB: ZONE.SOUTH_AMERICA, // Curitiba, Brazil
      CZL: ZONE.AFRICA, // Constantine, Algeria
      CZX: ZONE.HONG_KONG, // Changzhou, China
      DAC: ZONE.ASIA, // Dhaka, Bangladesh
      DAD: ZONE.HONG_KONG, // Da Nang, Vietnam
      DAR: ZONE.AFRICA, // Dar es Salaam, Tanzania
      DEL: ZONE.ASIA, // New Delhi, India
      DEN: ZONE.NORTH_AMERICA, // Denver, USA
      DFW: ZONE.NORTH_AMERICA, // Dallas, USA
      DKR: ZONE.AFRICA, // Dakar, Senegal
      DLC: ZONE.HONG_KONG, // Dalian, China
      DME: ZONE.EUROPE, // Moscow, Russia
      DMM: ZONE.MIDDLE_EAST, // Dammam, Saudi Arabia
      DOH: ZONE.MIDDLE_EAST, // Doha, Qatar
      DPS: ZONE.HONG_KONG, // Denpasar (Bali), Indonesia
      DTW: ZONE.NORTH_AMERICA, // Detroit, USA
      DUB: ZONE.EUROPE, // Dublin, Ireland
      DUR: ZONE.AFRICA, // Durban, South Africa
      DUS: ZONE.EUROPE, // Düsseldorf, Germany
      DXB: ZONE.MIDDLE_EAST, // Dubai, UAE
      EBB: ZONE.AFRICA, // Kampala, Uganda
      EBL: ZONE.MIDDLE_EAST, // Erbil, Iraq
      EVN: ZONE.ASIA, // Yerevan, Armenia
      EWR: ZONE.NORTH_AMERICA, // Newark, USA
      EZE: ZONE.SOUTH_AMERICA, // Buenos Aires, Argentina
      FCO: ZONE.EUROPE, // Rome, Italy
      FIH: ZONE.AFRICA, // Kinshasa, DR Congo
      FLN: ZONE.SOUTH_AMERICA, // Florianopolis, Brazil
      FOC: ZONE.HONG_KONG, // Fuzhou, China
      FOR: ZONE.SOUTH_AMERICA, // Fortaleza, Brazil
      FRA: ZONE.EUROPE, // Frankfurt, Germany
      FRU: ZONE.ASIA, // Bishkek, Kyrgyzstan
      FSD: ZONE.NORTH_AMERICA, // Sioux Falls, USA
      FUK: ZONE.HONG_KONG, // Fukuoka, Japan
      FUO: ZONE.HONG_KONG, // Foshan, China
      GBE: ZONE.AFRICA, // Gaborone, Botswana
      GDL: ZONE.NORTH_AMERICA, // Guadalajara, Mexico
      GEO: ZONE.SOUTH_AMERICA, // Georgetown, Guyana
      GIG: ZONE.SOUTH_AMERICA, // Rio de Janeiro, Brazil
      GND: ZONE.SOUTH_AMERICA, // St. George's, Grenada
      GOT: ZONE.EUROPE, // Gothenburg, Sweden
      GRU: ZONE.SOUTH_AMERICA, // São Paulo, Brazil
      GUA: ZONE.NORTH_AMERICA, // Guatemala City, Guatemala
      GUM: ZONE.ASIA, // Hagatna, Guam
      GVA: ZONE.EUROPE, // Geneva, Switzerland
      GYD: ZONE.ASIA, // Baku, Azerbaijan
      GYE: ZONE.SOUTH_AMERICA, // Guayaquil, Ecuador
      GYN: ZONE.SOUTH_AMERICA, // Goiania, Brazil
      HAK: ZONE.HONG_KONG, // Chengmai (Haikou), China
      HAM: ZONE.EUROPE, // Hamburg, Germany
      HAN: ZONE.HONG_KONG, // Hanoi, Vietnam
      HBA: ZONE.OCEANIA, // Hobart, Australia
      HEL: ZONE.EUROPE, // Helsinki, Finland
      HFA: ZONE.MIDDLE_EAST, // Haifa, Israel
      HGH: ZONE.HONG_KONG, // Shaoxing (Hangzhou), China
      HKG: ZONE.HONG_KONG, // Hong Kong
      HNL: ZONE.NORTH_AMERICA, // Honolulu, USA
      HRE: ZONE.AFRICA, // Harare, Zimbabwe
      HYD: ZONE.ASIA, // Hyderabad, India
      HYN: ZONE.ASIA, // Taizhou, China
      IAD: ZONE.NORTH_AMERICA, // Ashburn (Washington DC), USA
      IAH: ZONE.NORTH_AMERICA, // Houston, USA
      ICN: ZONE.HONG_KONG, // Seoul, South Korea
      IND: ZONE.NORTH_AMERICA, // Indianapolis, USA
      ISB: ZONE.ASIA, // Islamabad, Pakistan
      IST: ZONE.EUROPE, // Istanbul, Turkey
      ISU: ZONE.MIDDLE_EAST, // Sulaymaniyah, Iraq
      ITJ: ZONE.SOUTH_AMERICA, // Itajai, Brazil
      IXC: ZONE.ASIA, // Chandigarh, India
      JAX: ZONE.NORTH_AMERICA, // Jacksonville, USA
      JDO: ZONE.SOUTH_AMERICA, // Juazeiro do Norte, Brazil
      JED: ZONE.MIDDLE_EAST, // Jeddah, Saudi Arabia
      JHB: ZONE.HONG_KONG, // Johor Bahru, Malaysia
      JIB: ZONE.AFRICA, // Djibouti
      JNB: ZONE.AFRICA, // Johannesburg, South Africa
      JOG: ZONE.HONG_KONG, // Yogyakarta, Indonesia
      JOI: ZONE.SOUTH_AMERICA, // Joinville, Brazil
      JXG: ZONE.ASIA, // Jiaxing, China
      KBP: ZONE.EUROPE, // Kyiv, Ukraine
      KCH: ZONE.HONG_KONG, // Kuching, Malaysia
      KEF: ZONE.EUROPE, // Reykjavík, Iceland
      KGL: ZONE.AFRICA, // Kigali, Rwanda
      KHH: ZONE.HONG_KONG, // Kaohsiung City, Taiwan
      KHI: ZONE.ASIA, // Karachi, Pakistan
      KHN: ZONE.HONG_KONG, // Nanchang, China
      KIN: ZONE.NORTH_AMERICA, // Kingston, Jamaica
      KIV: ZONE.EUROPE, // Chișinău, Moldova
      KIX: ZONE.HONG_KONG, // Osaka, Japan
      KJA: ZONE.ASIA, // Krasnoyarsk, Russia
      KMG: ZONE.HONG_KONG, // Kunming, China
      KNU: ZONE.ASIA, // Kanpur, India
      KTM: ZONE.ASIA, // Kathmandu, Nepal
      KUL: ZONE.HONG_KONG, // Kuala Lumpur, Malaysia
      KWE: ZONE.HONG_KONG, // Guiyang, China
      KWI: ZONE.MIDDLE_EAST, // Kuwait City, Kuwait
      LAD: ZONE.AFRICA, // Luanda, Angola
      LAS: ZONE.NORTH_AMERICA, // Las Vegas, USA
      LAX: ZONE.NORTH_AMERICA, // Los Angeles, USA
      LCA: ZONE.EUROPE, // Nicosia, Cyprus
      LED: ZONE.EUROPE, // Saint Petersburg, Russia
      LHR: ZONE.EUROPE, // London, UK
      LIM: ZONE.SOUTH_AMERICA, // Lima, Peru
      LIS: ZONE.EUROPE, // Lisbon, Portugal
      LLK: ZONE.ASIA, // Astara, Azerbaijan
      LLW: ZONE.AFRICA, // Lilongwe, Malawi
      LOS: ZONE.AFRICA, // Lagos, Nigeria
      LPB: ZONE.SOUTH_AMERICA, // La Paz, Bolivia
      LUN: ZONE.AFRICA, // Lusaka, Zambia
      LUX: ZONE.EUROPE, // Luxembourg City, Luxembourg
      LYS: ZONE.EUROPE, // Lyon, France
      MAA: ZONE.ASIA, // Chennai, India
      MAD: ZONE.EUROPE, // Madrid, Spain
      MAN: ZONE.EUROPE, // Manchester, UK
      MAO: ZONE.SOUTH_AMERICA, // Manaus, Brazil
      MBA: ZONE.AFRICA, // Mombasa, Kenya
      MCI: ZONE.NORTH_AMERICA, // Kansas City, USA
      MCT: ZONE.MIDDLE_EAST, // Muscat, Oman
      MDE: ZONE.SOUTH_AMERICA, // Medellín, Colombia
      MEL: ZONE.OCEANIA, // Melbourne, Australia
      MEM: ZONE.NORTH_AMERICA, // Memphis, USA
      MEX: ZONE.NORTH_AMERICA, // Mexico City, Mexico
      MFM: ZONE.HONG_KONG, // Macau
      MIA: ZONE.NORTH_AMERICA, // Miami, USA
      MLE: ZONE.ASIA, // Male, Maldives
      MNL: ZONE.HONG_KONG, // Manila, Philippines
      MPM: ZONE.AFRICA, // Maputo, Mozambique
      MRS: ZONE.EUROPE, // Marseille, France
      MRU: ZONE.AFRICA, // Port Louis, Mauritius
      MSP: ZONE.NORTH_AMERICA, // Minneapolis, USA
      MSQ: ZONE.EUROPE, // Minsk, Belarus
      MUC: ZONE.EUROPE, // Munich, Germany
      MXP: ZONE.EUROPE, // Milan, Italy
      NAG: ZONE.ASIA, // Nagpur, India
      NBO: ZONE.AFRICA, // Nairobi, Kenya
      NJF: ZONE.MIDDLE_EAST, // Najaf, Iraq
      NNG: ZONE.HONG_KONG, // Nanning, China
      NOU: ZONE.OCEANIA, // Noumea, New Caledonia
      NQN: ZONE.SOUTH_AMERICA, // Neuquen, Argentina
      NQZ: ZONE.ASIA, // Astana, Kazakhstan
      NRT: ZONE.HONG_KONG, // Tokyo Narita, Japan
      NVT: ZONE.SOUTH_AMERICA, // Timbo (Navegantes), Brazil
      OKA: ZONE.HONG_KONG, // Naha (Okinawa), Japan
      OKC: ZONE.NORTH_AMERICA, // Oklahoma City, USA
      OMA: ZONE.NORTH_AMERICA, // Omaha, USA
      ORD: ZONE.NORTH_AMERICA, // Chicago, USA
      ORF: ZONE.NORTH_AMERICA, // Norfolk, USA
      ORN: ZONE.AFRICA, // Oran, Algeria
      OSL: ZONE.EUROPE, // Oslo, Norway
      OTP: ZONE.EUROPE, // Bucharest, Romania
      OUA: ZONE.AFRICA, // Ouagadougou, Burkina Faso
      PAT: ZONE.ASIA, // Patna, India
      PBH: ZONE.ASIA, // Thimphu, Bhutan
      PBM: ZONE.SOUTH_AMERICA, // Paramaribo, Suriname
      PDX: ZONE.NORTH_AMERICA, // Portland, USA
      PER: ZONE.OCEANIA, // Perth, Australia
      PHL: ZONE.NORTH_AMERICA, // Philadelphia, USA
      PHX: ZONE.NORTH_AMERICA, // Phoenix, USA
      PIT: ZONE.NORTH_AMERICA, // Pittsburgh, USA
      PKX: ZONE.HONG_KONG, // Langfang (Beijing), China
      PMO: ZONE.EUROPE, // Palermo, Italy
      PMW: ZONE.SOUTH_AMERICA, // Palmas, Brazil
      PNH: ZONE.HONG_KONG, // Phnom Penh, Cambodia
      POA: ZONE.SOUTH_AMERICA, // Porto Alegre, Brazil
      POS: ZONE.SOUTH_AMERICA, // Port of Spain, Trinidad
      PPT: ZONE.OCEANIA, // Tahiti, French Polynesia
      PRG: ZONE.EUROPE, // Prague, Czech Republic
      PTY: ZONE.SOUTH_AMERICA, // Panama City, Panama
      QRO: ZONE.NORTH_AMERICA, // Queretaro, Mexico
      QWJ: ZONE.SOUTH_AMERICA, // Americana, Brazil
      RAO: ZONE.SOUTH_AMERICA, // Ribeirao Preto, Brazil
      RDU: ZONE.NORTH_AMERICA, // Durham (Raleigh), USA
      REC: ZONE.SOUTH_AMERICA, // Recife, Brazil
      RIC: ZONE.NORTH_AMERICA, // Richmond, USA
      RIX: ZONE.EUROPE, // Riga, Latvia
      RUH: ZONE.MIDDLE_EAST, // Riyadh, Saudi Arabia
      RUN: ZONE.AFRICA, // Saint-Denis, Réunion
      SAN: ZONE.NORTH_AMERICA, // San Diego, USA
      SAP: ZONE.SOUTH_AMERICA, // San Pedro Sula, Honduras
      SAT: ZONE.NORTH_AMERICA, // San Antonio, USA
      SCL: ZONE.SOUTH_AMERICA, // Santiago, Chile
      SDQ: ZONE.NORTH_AMERICA, // Santo Domingo, Dominican Republic
      SEA: ZONE.NORTH_AMERICA, // Seattle, USA
      SFO: ZONE.NORTH_AMERICA, // San Francisco, USA
      SGN: ZONE.HONG_KONG, // Ho Chi Minh City, Vietnam
      SHA: ZONE.HONG_KONG, // Shanghai, China
      SIN: ZONE.HONG_KONG, // Singapore
      SJC: ZONE.NORTH_AMERICA, // San Jose, USA
      SJK: ZONE.SOUTH_AMERICA, // São José dos Campos, Brazil
      SJO: ZONE.SOUTH_AMERICA, // San José, Costa Rica
      SJP: ZONE.SOUTH_AMERICA, // São José do Rio Preto, Brazil
      SJU: ZONE.NORTH_AMERICA, // San Juan, Puerto Rico
      SJW: ZONE.HONG_KONG, // Shijiazhuang, China
      SKG: ZONE.EUROPE, // Thessaloniki, Greece
      SKP: ZONE.EUROPE, // Skopje, North Macedonia
      SLC: ZONE.NORTH_AMERICA, // Salt Lake City, USA
      SMF: ZONE.NORTH_AMERICA, // Sacramento, USA
      SOD: ZONE.SOUTH_AMERICA, // Sorocaba, Brazil
      SOF: ZONE.EUROPE, // Sofia, Bulgaria
      SSA: ZONE.SOUTH_AMERICA, // Salvador, Brazil
      STI: ZONE.NORTH_AMERICA, // Santiago de los Caballeros, Dominican Republic
      STL: ZONE.NORTH_AMERICA, // St. Louis, USA
      STR: ZONE.EUROPE, // Stuttgart, Germany
      SUV: ZONE.OCEANIA, // Suva, Fiji
      SYD: ZONE.OCEANIA, // Sydney, Australia
      SZX: ZONE.HONG_KONG, // Shenzhen, China
      TAO: ZONE.HONG_KONG, // Qingdao, China
      TBS: ZONE.EUROPE, // Tbilisi, Georgia
      TEN: ZONE.HONG_KONG, // Tongren, China
      TGU: ZONE.SOUTH_AMERICA, // Tegucigalpa, Honduras
      TIA: ZONE.EUROPE, // Tirana, Albania
      TLH: ZONE.NORTH_AMERICA, // Tallahassee, USA
      TLL: ZONE.EUROPE, // Tallinn, Estonia
      TLV: ZONE.MIDDLE_EAST, // Tel Aviv, Israel
      TNA: ZONE.HONG_KONG, // Zibo (Jinan), China
      TNR: ZONE.AFRICA, // Antananarivo, Madagascar
      TPA: ZONE.NORTH_AMERICA, // Tampa, USA
      TPE: ZONE.HONG_KONG, // Taipei, Taiwan
      TUN: ZONE.AFRICA, // Tunis, Tunisia
      TXL: ZONE.EUROPE, // Berlin, Germany
      TYN: ZONE.HONG_KONG, // Yangquan (Taiyuan), China
      UDI: ZONE.SOUTH_AMERICA, // Uberlandia, Brazil
      UIO: ZONE.SOUTH_AMERICA, // Quito, Ecuador
      ULN: ZONE.ASIA, // Ulaanbaatar, Mongolia
      URT: ZONE.HONG_KONG, // Surat Thani, Thailand
      VCP: ZONE.SOUTH_AMERICA, // Campinas, Brazil
      VIE: ZONE.EUROPE, // Vienna, Austria
      VIX: ZONE.SOUTH_AMERICA, // Vitoria, Brazil
      VNO: ZONE.EUROPE, // Vilnius, Lithuania
      VTE: ZONE.HONG_KONG, // Vientiane, Laos
      WAW: ZONE.EUROPE, // Warsaw, Poland
      WDH: ZONE.AFRICA, // Windhoek, Namibia
      XAP: ZONE.SOUTH_AMERICA, // Chapeco, Brazil
      XFN: ZONE.HONG_KONG, // Xiangyang, China
      XIY: ZONE.HONG_KONG, // Baoji (Xi'an), China
      XNH: ZONE.HONG_KONG, // Nasiriyah, Iraq
      XNN: ZONE.HONG_KONG, // Xining, China
      YHZ: ZONE.NORTH_AMERICA, // Halifax, Canada
      YOW: ZONE.NORTH_AMERICA, // Ottawa, Canada
      YUL: ZONE.NORTH_AMERICA, // Montréal, Canada
      YVR: ZONE.NORTH_AMERICA, // Vancouver, Canada
      YWG: ZONE.NORTH_AMERICA, // Winnipeg, Canada
      YXE: ZONE.NORTH_AMERICA, // Saskatoon, Canada
      YYC: ZONE.NORTH_AMERICA, // Calgary, Canada
      YYZ: ZONE.NORTH_AMERICA, // Toronto, Canada
      ZAG: ZONE.EUROPE, // Zagreb, Croatia
      ZDM: ZONE.MIDDLE_EAST, // Ramallah, Palestine
      ZRH: ZONE.EUROPE, // Zurich, Switzerland
    }

    // Fallback order for each zone
    const zoneFallbackUrls = {
      [ZONE.HONG_KONG]: [WORKER_URL.HONG_KONG, WORKER_URL.ASIA, WORKER_URL.EUROPE],
      [ZONE.ASIA]: [WORKER_URL.ASIA, WORKER_URL.HONG_KONG, WORKER_URL.EUROPE],
      [ZONE.AFRICA]: [WORKER_URL.AFRICA, WORKER_URL.ASIA, WORKER_URL.EUROPE],
      [ZONE.MIDDLE_EAST]: [WORKER_URL.MIDDLE_EAST, WORKER_URL.ASIA, WORKER_URL.EUROPE],
      [ZONE.EUROPE]: [WORKER_URL.EUROPE, WORKER_URL.NORTH_AMERICA],
      [ZONE.NORTH_AMERICA]: [WORKER_URL.NORTH_AMERICA, WORKER_URL.EUROPE],
      [ZONE.SOUTH_AMERICA]: [WORKER_URL.SOUTH_AMERICA, WORKER_URL.NORTH_AMERICA, WORKER_URL.EUROPE],
      [ZONE.OCEANIA]: [WORKER_URL.OCEANIA, WORKER_URL.HONG_KONG, WORKER_URL.ASIA],
    }

    // Use the cf object to obtain the colo of the request
    // colo: The three-letter IATA airport code of the data center that the request hit, for example, "DFW".
    // more on the cf object: https://developers.cloudflare.com/workers/runtime-apis/request#incomingrequestcfproperties
    const colo = request.cf.colo
    const zone = coloToZone[colo] ?? ZONE.EUROPE
    const url = new URL(request.url)
    const pathWithQuery = url.pathname + url.search

    const fallbackUrls = zoneFallbackUrls[zone] || [WORKER_URL.EUROPE]

    for (const workerUrl of fallbackUrls) {
      // Skip unhealthy workers (circuit is open)
      const healthy = await isHealthy(colo, workerUrl)
      if (!healthy) {
        console.log(`Skipping ${workerUrl} (circuit open for ${colo})`)
        continue
      }

      try {
        const abortController = new AbortController()
        const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT_MS)

        const response = await fetch(`${workerUrl}${pathWithQuery}`, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: abortController.signal,
        })

        clearTimeout(timeoutId)

        // Check for server errors (5xx) - infrastructure problem
        if (response.status >= 500) {
          console.log(`${workerUrl} returned ${response.status}, marking unhealthy`)
          await markUnhealthy(colo, workerUrl)
          continue // try fallback
        }

        // Success (2xx, 3xx, 4xx) - worker is healthy
        await markHealthy(colo, workerUrl)
        console.log(`Request served by ${workerUrl}`)
        return response
      }
      catch (error) {
        // Network failure or timeout - mark unhealthy
        console.log(`${workerUrl} failed: ${error.message}, marking unhealthy`)
        await markUnhealthy(colo, workerUrl)
        // continue to next fallback
      }
    }

    // All workers failed or are unhealthy - try the original request as last resort
    console.log('All workers failed, falling back to original request')
    return fetch(request)
  },
}
