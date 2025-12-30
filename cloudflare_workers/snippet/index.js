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
export default {
  async fetch(request) {
    // Regional worker URLs - each worker is co-located with its database replica
    const WORKER_URL = {
      ASIA: 'https://plugin.as.capgo.app',         // AS_INDIA DB (Mumbai)
      EUROPE: 'https://plugin.eu.capgo.app',       // EU DB
      NORTH_AMERICA: 'https://plugin.na.capgo.app', // NA DB
      SOUTH_AMERICA: 'https://plugin.sa.capgo.app', // SA DB
      OCEANIA: 'https://plugin.oc.capgo.app',      // OC DB
      AFRICA: 'https://plugin.af.capgo.app',       // AS_INDIA DB (via smart placement)
      MIDDLE_EAST: 'https://plugin.me.capgo.app',  // AS_INDIA DB (via smart placement)
      HONG_KONG: 'https://plugin.hk.capgo.app',    // AS_JAPAN DB (Tokyo)
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
      AAE: ZONE.AFRICA,
      ABJ: ZONE.AFRICA,
      ABQ: ZONE.NORTH_AMERICA,
      ACC: ZONE.AFRICA,
      ADB: ZONE.EUROPE,
      ADD: ZONE.AFRICA,
      ADL: ZONE.OCEANIA,
      AKL: ZONE.OCEANIA,
      AKX: ZONE.ASIA,
      ALA: ZONE.ASIA,
      ALG: ZONE.AFRICA,
      AMD: ZONE.ASIA,
      AMM: ZONE.EUROPE,
      AMS: ZONE.EUROPE,
      ANC: ZONE.NORTH_AMERICA,
      ARI: ZONE.SOUTH_AMERICA,
      ARN: ZONE.EUROPE,
      ARU: ZONE.SOUTH_AMERICA,
      ASK: ZONE.AFRICA,
      ASU: ZONE.SOUTH_AMERICA,
      ATH: ZONE.EUROPE,
      ATL: ZONE.NORTH_AMERICA,
      AUS: ZONE.NORTH_AMERICA,
      BAH: ZONE.EUROPE,
      BAQ: ZONE.SOUTH_AMERICA,
      BCN: ZONE.EUROPE,
      BEG: ZONE.EUROPE,
      BEL: ZONE.SOUTH_AMERICA,
      BGI: ZONE.NORTH_AMERICA,
      BGR: ZONE.NORTH_AMERICA,
      BGW: ZONE.MIDDLE_EAST,
      BHY: ZONE.HONG_KONG,
      BKK: ZONE.HONG_KONG,  // Bangkok, Thailand -> AS_JAPAN
      BLR: ZONE.ASIA,
      BNA: ZONE.NORTH_AMERICA,
      BNE: ZONE.OCEANIA,
      BNU: ZONE.SOUTH_AMERICA,
      BOD: ZONE.EUROPE,
      BOG: ZONE.SOUTH_AMERICA,
      BOM: ZONE.ASIA,
      BOS: ZONE.NORTH_AMERICA,
      BRU: ZONE.EUROPE,
      BSB: ZONE.SOUTH_AMERICA,
      BSR: ZONE.MIDDLE_EAST,
      BTS: ZONE.EUROPE,
      BUD: ZONE.EUROPE,
      BUF: ZONE.NORTH_AMERICA,
      BWN: ZONE.HONG_KONG,  // Brunei -> AS_JAPAN
      CAI: ZONE.AFRICA,
      CAN: ZONE.HONG_KONG,
      CAW: ZONE.SOUTH_AMERICA,
      CBR: ZONE.OCEANIA,
      CCP: ZONE.SOUTH_AMERICA,
      CCU: ZONE.ASIA,
      CDG: ZONE.EUROPE,
      CEB: ZONE.HONG_KONG,  // Cebu, Philippines -> AS_JAPAN
      CFC: ZONE.SOUTH_AMERICA,
      CGB: ZONE.SOUTH_AMERICA,
      CGD: ZONE.HONG_KONG,
      CGK: ZONE.HONG_KONG,  // Jakarta, Indonesia -> AS_JAPAN
      CGO: ZONE.HONG_KONG,
      CGP: ZONE.ASIA,
      CGY: ZONE.HONG_KONG,  // Cagayan de Oro, Philippines -> AS_JAPAN
      CHC: ZONE.OCEANIA,
      CKG: ZONE.HONG_KONG,
      CLE: ZONE.NORTH_AMERICA,
      CLO: ZONE.SOUTH_AMERICA,
      CLT: ZONE.NORTH_AMERICA,
      CMB: ZONE.ASIA,
      CMH: ZONE.NORTH_AMERICA,
      CNF: ZONE.SOUTH_AMERICA,
      CNN: ZONE.ASIA,
      CNX: ZONE.HONG_KONG,  // Chiang Mai, Thailand -> AS_JAPAN
      COK: ZONE.ASIA,
      COR: ZONE.SOUTH_AMERICA,
      CPH: ZONE.EUROPE,
      CPT: ZONE.AFRICA,
      CRK: ZONE.HONG_KONG,  // Clark, Philippines -> AS_JAPAN
      CSX: ZONE.HONG_KONG,
      CWB: ZONE.SOUTH_AMERICA,
      CZL: ZONE.AFRICA,
      CZX: ZONE.HONG_KONG,
      DAC: ZONE.ASIA,
      DAD: ZONE.HONG_KONG,  // Da Nang, Vietnam -> AS_JAPAN
      DAR: ZONE.AFRICA,
      DEL: ZONE.ASIA,
      DEN: ZONE.NORTH_AMERICA,
      DFW: ZONE.NORTH_AMERICA,
      DKR: ZONE.AFRICA,
      DLC: ZONE.HONG_KONG,
      DME: ZONE.EUROPE,
      DMM: ZONE.MIDDLE_EAST,
      DOH: ZONE.MIDDLE_EAST,
      DPS: ZONE.HONG_KONG,  // Bali, Indonesia -> AS_JAPAN
      DTW: ZONE.NORTH_AMERICA,
      DUB: ZONE.EUROPE,
      DUR: ZONE.AFRICA,
      DUS: ZONE.EUROPE,
      DXB: ZONE.MIDDLE_EAST,
      EBB: ZONE.AFRICA,
      EBL: ZONE.MIDDLE_EAST,
      EVN: ZONE.ASIA,
      EWR: ZONE.NORTH_AMERICA,
      EZE: ZONE.SOUTH_AMERICA,
      FCO: ZONE.EUROPE,
      FIH: ZONE.AFRICA,
      FLN: ZONE.SOUTH_AMERICA,
      FOC: ZONE.HONG_KONG,
      FOR: ZONE.SOUTH_AMERICA,
      FRA: ZONE.EUROPE,
      FRU: ZONE.ASIA,
      FSD: ZONE.NORTH_AMERICA,
      FUK: ZONE.HONG_KONG,  // Fukuoka, Japan -> AS_JAPAN
      FUO: ZONE.HONG_KONG,
      GBE: ZONE.AFRICA,
      GDL: ZONE.NORTH_AMERICA,
      GEO: ZONE.SOUTH_AMERICA,
      GIG: ZONE.SOUTH_AMERICA,
      GND: ZONE.SOUTH_AMERICA,
      GOT: ZONE.EUROPE,
      GRU: ZONE.SOUTH_AMERICA,
      GUA: ZONE.NORTH_AMERICA,
      GUM: ZONE.ASIA,
      GVA: ZONE.EUROPE,
      GYD: ZONE.ASIA,
      GYE: ZONE.SOUTH_AMERICA,
      GYN: ZONE.SOUTH_AMERICA,
      HAK: ZONE.HONG_KONG,
      HAM: ZONE.EUROPE,
      HAN: ZONE.HONG_KONG,  // Hanoi, Vietnam -> AS_JAPAN
      HBA: ZONE.OCEANIA,
      HEL: ZONE.EUROPE,
      HFA: ZONE.MIDDLE_EAST,
      HGH: ZONE.HONG_KONG,
      HKG: ZONE.HONG_KONG,
      HNL: ZONE.NORTH_AMERICA,
      HRE: ZONE.AFRICA,
      HYD: ZONE.ASIA,
      HYN: ZONE.ASIA,
      IAD: ZONE.NORTH_AMERICA,
      IAH: ZONE.NORTH_AMERICA,
      ICN: ZONE.HONG_KONG,  // Seoul, Korea -> AS_JAPAN
      IND: ZONE.NORTH_AMERICA,
      ISB: ZONE.ASIA,
      IST: ZONE.EUROPE,
      ISU: ZONE.MIDDLE_EAST,
      ITJ: ZONE.SOUTH_AMERICA,
      IXC: ZONE.ASIA,
      JAX: ZONE.NORTH_AMERICA,
      JDO: ZONE.SOUTH_AMERICA,
      JED: ZONE.MIDDLE_EAST,
      JHB: ZONE.HONG_KONG,  // Johor Bahru, Malaysia -> AS_JAPAN
      JIB: ZONE.AFRICA,
      JNB: ZONE.AFRICA,
      JOG: ZONE.HONG_KONG,  // Yogyakarta, Indonesia -> AS_JAPAN
      JOI: ZONE.SOUTH_AMERICA,
      JXG: ZONE.ASIA,
      KBP: ZONE.EUROPE,
      KCH: ZONE.HONG_KONG,  // Kuching, Malaysia -> AS_JAPAN
      KEF: ZONE.EUROPE,
      KGL: ZONE.AFRICA,
      KHH: ZONE.HONG_KONG,  // Kaohsiung, Taiwan -> AS_JAPAN
      KHI: ZONE.ASIA,
      KHN: ZONE.HONG_KONG,
      KIN: ZONE.NORTH_AMERICA,
      KIV: ZONE.EUROPE,
      KIX: ZONE.HONG_KONG,  // Osaka, Japan -> AS_JAPAN
      KJA: ZONE.ASIA,
      KMG: ZONE.HONG_KONG,
      KNU: ZONE.ASIA,
      KTM: ZONE.ASIA,
      KUL: ZONE.HONG_KONG,  // Kuala Lumpur, Malaysia -> AS_JAPAN
      KWE: ZONE.HONG_KONG,
      KWI: ZONE.MIDDLE_EAST,
      LAD: ZONE.AFRICA,
      LAS: ZONE.NORTH_AMERICA,
      LAX: ZONE.NORTH_AMERICA,
      LCA: ZONE.EUROPE,
      LED: ZONE.EUROPE,
      LHR: ZONE.EUROPE,
      LIM: ZONE.SOUTH_AMERICA,
      LIS: ZONE.EUROPE,
      LLK: ZONE.ASIA,
      LLW: ZONE.AFRICA,
      LOS: ZONE.AFRICA,
      LPB: ZONE.SOUTH_AMERICA,
      LUN: ZONE.AFRICA,
      LUX: ZONE.EUROPE,
      LYS: ZONE.EUROPE,
      MAA: ZONE.ASIA,
      MAD: ZONE.EUROPE,
      MAN: ZONE.EUROPE,
      MAO: ZONE.SOUTH_AMERICA,
      MBA: ZONE.AFRICA,
      MCI: ZONE.NORTH_AMERICA,
      MCT: ZONE.MIDDLE_EAST,
      MDE: ZONE.SOUTH_AMERICA,
      MEL: ZONE.OCEANIA,
      MEM: ZONE.NORTH_AMERICA,
      MEX: ZONE.NORTH_AMERICA,
      MFM: ZONE.HONG_KONG,
      MIA: ZONE.NORTH_AMERICA,
      MLE: ZONE.ASIA,
      MNL: ZONE.HONG_KONG,  // Manila, Philippines -> AS_JAPAN
      MPM: ZONE.AFRICA,
      MRS: ZONE.EUROPE,
      MRU: ZONE.AFRICA,
      MSP: ZONE.NORTH_AMERICA,
      MSQ: ZONE.EUROPE,
      MUC: ZONE.EUROPE,
      MXP: ZONE.EUROPE,
      NAG: ZONE.ASIA,
      NBO: ZONE.AFRICA,
      NJF: ZONE.MIDDLE_EAST,
      NNG: ZONE.HONG_KONG,
      NOU: ZONE.OCEANIA,
      NQN: ZONE.SOUTH_AMERICA,
      NQZ: ZONE.ASIA,
      NRT: ZONE.HONG_KONG,  // Tokyo Narita, Japan -> AS_JAPAN
      NVT: ZONE.SOUTH_AMERICA,
      OKA: ZONE.HONG_KONG,  // Okinawa, Japan -> AS_JAPAN
      OKC: ZONE.NORTH_AMERICA,
      OMA: ZONE.NORTH_AMERICA,
      ORD: ZONE.NORTH_AMERICA,
      ORF: ZONE.NORTH_AMERICA,
      ORN: ZONE.AFRICA,
      OSL: ZONE.EUROPE,
      OTP: ZONE.EUROPE,
      OUA: ZONE.AFRICA,
      PAT: ZONE.ASIA,
      PBH: ZONE.ASIA,
      PBM: ZONE.SOUTH_AMERICA,
      PDX: ZONE.NORTH_AMERICA,
      PER: ZONE.OCEANIA,
      PHL: ZONE.NORTH_AMERICA,
      PHX: ZONE.NORTH_AMERICA,
      PIT: ZONE.NORTH_AMERICA,
      PKX: ZONE.HONG_KONG,
      PMO: ZONE.EUROPE,
      PMW: ZONE.SOUTH_AMERICA,
      PNH: ZONE.HONG_KONG,  // Phnom Penh, Cambodia -> AS_JAPAN
      POA: ZONE.SOUTH_AMERICA,
      POS: ZONE.SOUTH_AMERICA,
      PPT: ZONE.OCEANIA,
      PRG: ZONE.EUROPE,
      PTY: ZONE.SOUTH_AMERICA,
      QRO: ZONE.NORTH_AMERICA,
      QWJ: ZONE.SOUTH_AMERICA,
      RAO: ZONE.SOUTH_AMERICA,
      RDU: ZONE.NORTH_AMERICA,
      REC: ZONE.SOUTH_AMERICA,
      RIC: ZONE.NORTH_AMERICA,
      RIX: ZONE.EUROPE,
      RUH: ZONE.MIDDLE_EAST,
      RUN: ZONE.AFRICA,
      SAN: ZONE.NORTH_AMERICA,
      SAP: ZONE.SOUTH_AMERICA,
      SAT: ZONE.NORTH_AMERICA,
      SCL: ZONE.SOUTH_AMERICA,
      SDQ: ZONE.NORTH_AMERICA,
      SEA: ZONE.NORTH_AMERICA,
      SFO: ZONE.NORTH_AMERICA,
      SGN: ZONE.HONG_KONG,  // Ho Chi Minh, Vietnam -> AS_JAPAN
      SHA: ZONE.HONG_KONG,
      SIN: ZONE.HONG_KONG,  // Singapore -> AS_JAPAN
      SJC: ZONE.NORTH_AMERICA,
      SJK: ZONE.SOUTH_AMERICA,
      SJO: ZONE.SOUTH_AMERICA,
      SJP: ZONE.SOUTH_AMERICA,
      SJU: ZONE.NORTH_AMERICA,
      SJW: ZONE.HONG_KONG,
      SKG: ZONE.EUROPE,
      SKP: ZONE.EUROPE,
      SLC: ZONE.NORTH_AMERICA,
      SMF: ZONE.NORTH_AMERICA,
      SOD: ZONE.SOUTH_AMERICA,
      SOF: ZONE.EUROPE,
      SSA: ZONE.SOUTH_AMERICA,
      STI: ZONE.NORTH_AMERICA,
      STL: ZONE.NORTH_AMERICA,
      STR: ZONE.EUROPE,
      SUV: ZONE.OCEANIA,
      SYD: ZONE.OCEANIA,
      SZX: ZONE.HONG_KONG,
      TAO: ZONE.HONG_KONG,
      TBS: ZONE.EUROPE,
      TEN: ZONE.HONG_KONG,
      TGU: ZONE.SOUTH_AMERICA,
      TIA: ZONE.EUROPE,
      TLH: ZONE.NORTH_AMERICA,
      TLL: ZONE.EUROPE,
      TLV: ZONE.MIDDLE_EAST,
      TNA: ZONE.HONG_KONG,
      TNR: ZONE.AFRICA,
      TPA: ZONE.NORTH_AMERICA,
      TPE: ZONE.HONG_KONG,  // Taipei, Taiwan -> AS_JAPAN
      TUN: ZONE.AFRICA,
      TXL: ZONE.EUROPE,
      TYN: ZONE.HONG_KONG,
      UDI: ZONE.SOUTH_AMERICA,
      UIO: ZONE.SOUTH_AMERICA,
      ULN: ZONE.ASIA,
      URT: ZONE.HONG_KONG,  // Surat Thani, Thailand -> AS_JAPAN
      VCP: ZONE.SOUTH_AMERICA,
      VIE: ZONE.EUROPE,
      VIX: ZONE.SOUTH_AMERICA,
      VNO: ZONE.EUROPE,
      VTE: ZONE.HONG_KONG,  // Vientiane, Laos -> AS_JAPAN
      WAW: ZONE.EUROPE,
      WDH: ZONE.AFRICA,
      XAP: ZONE.SOUTH_AMERICA,
      XFN: ZONE.HONG_KONG,
      XIY: ZONE.HONG_KONG,
      XNH: ZONE.HONG_KONG,
      XNN: ZONE.HONG_KONG,
      YHZ: ZONE.NORTH_AMERICA,
      YOW: ZONE.NORTH_AMERICA,
      YUL: ZONE.NORTH_AMERICA,
      YVR: ZONE.NORTH_AMERICA,
      YWG: ZONE.NORTH_AMERICA,
      YXE: ZONE.NORTH_AMERICA,
      YYC: ZONE.NORTH_AMERICA,
      YYZ: ZONE.NORTH_AMERICA,
      ZAG: ZONE.EUROPE,
      ZDM: ZONE.MIDDLE_EAST,
      ZRH: ZONE.EUROPE,
    }

    // Fallback order for each zone (if primary times out after 500ms, try next)
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

    const TIMEOUT_MS = 500

    // Use the cf object to obtain the colo of the request
    // colo: The three-letter IATA airport code of the data center that the request hit, for example, "DFW".
    // more on the cf object: https://developers.cloudflare.com/workers/runtime-apis/request#incomingrequestcfproperties
    const zone = coloToZone[request.cf.colo] ?? ZONE.EUROPE
    const url = new URL(request.url)
    const pathWithQuery = url.pathname + url.search

    const fallbackUrls = zoneFallbackUrls[zone] || [WORKER_URL.EUROPE]

    for (let attemptIndex = 0; attemptIndex < fallbackUrls.length; attemptIndex++) {
      const workerUrl = fallbackUrls[attemptIndex]
      const isFinalAttempt = attemptIndex === fallbackUrls.length - 1

      try {
        const abortController = new AbortController()
        const timeoutId = isFinalAttempt ? null : setTimeout(() => abortController.abort(), TIMEOUT_MS)

        const response = await fetch(`${workerUrl}${pathWithQuery}`, {
          ...request,
          signal: isFinalAttempt ? undefined : abortController.signal,
        })

        if (timeoutId) clearTimeout(timeoutId)

        console.log(`Request served by ${workerUrl}`)
        return response
      } catch (error) {
        console.log(`${workerUrl} failed: ${error.message}, trying fallback...`)
      }
    }

    return fetch(request)
  },
}
